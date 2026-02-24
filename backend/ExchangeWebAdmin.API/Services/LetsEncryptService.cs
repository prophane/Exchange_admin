using System.Collections.Concurrent;
using System.Diagnostics;
using System.Management.Automation;
using Certes;
using Certes.Acme;
using Certes.Acme.Resource;

namespace ExchangeWebAdmin.API.Services;

// ────────────────────────────────────────────────────────────────────────────────
// State stored in memory while the order is in progress
// ────────────────────────────────────────────────────────────────────────────────
public class LetsEncryptOrderState
{
    public string OrderId { get; set; } = Guid.NewGuid().ToString("N");
    public IAcmeContext Acme { get; set; } = null!;
    public IOrderContext Order { get; set; } = null!;
    public IKey AccountKey { get; set; } = null!;
    public string[] Domains { get; set; } = [];
    public string DnsServer { get; set; } = string.Empty;
    public List<LetsEncryptDnsChallenge> Challenges { get; set; } = [];
    public PSCredential? DnsCredential { get; set; }
    public bool Staging { get; set; }
    public IKey? PrivateKey { get; set; }  // stockée après Generate() pour pouvoir re-télécharger si Valid
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class LetsEncryptDnsChallenge
{
    public string Domain { get; set; } = string.Empty;
    /// <summary>DNS zone deduced from the domain (e.g. "pdulab.ovh" for "smtp.pdulab.ovh")</summary>
    public string Zone { get; set; } = string.Empty;
    /// <summary>Record name within the zone (e.g. "_acme-challenge.smtp")</summary>
    public string RecordName { get; set; } = string.Empty;
    /// <summary>Full FQDN of the TXT record</summary>
    public string FullName { get; set; } = string.Empty;
    public string TxtValue { get; set; } = string.Empty;
    public IChallengeContext ChallengeContext { get; set; } = null!;
    /// <summary>true = TXT record was inserted automatically on the DNS server</summary>
    public bool AutoCreated { get; set; }
    /// <summary>Error message if AutoCreated=false</summary>
    public string? AutoCreateError { get; set; }
}

// ────────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────────
public class LetsEncryptService
{
    private static readonly ConcurrentDictionary<string, LetsEncryptOrderState> _orders = new();
    // Cache ACME account keys per (email+env) — avoids hitting "10 new registrations" rate limit
    private static readonly ConcurrentDictionary<string, IKey> _accountKeys = new();
    private readonly IPowerShellService _psService;
    private readonly ILogger<LetsEncryptService> _logger;

    // Default DNS server — overrideable per-request
    public const string DefaultDnsServer = "tls-arr.prophane.local";

    public LetsEncryptService(IPowerShellService psService, ILogger<LetsEncryptService> logger)
    {
        _psService = psService;
        _logger = logger;

        // Clean up orders older than 2 hours
        _ = Task.Run(async () =>
        {
            while (true)
            {
                await Task.Delay(TimeSpan.FromMinutes(30));
                var old = _orders.Where(kv => (DateTime.UtcNow - kv.Value.CreatedAt).TotalHours > 2).ToList();
                foreach (var kv in old) _orders.TryRemove(kv.Key, out _);
            }
        });
    }

    // ── Step 1 : Start ACME order and create DNS TXT records ─────────────────
    public async Task<(string orderId, List<LetsEncryptDnsChallenge> challenges)> StartOrderAsync(
        string email, string[] domains, string? dnsServer = null,
        string? dnsUsername = null, string? dnsPassword = null, bool staging = false)
    {
        var server = dnsServer ?? DefaultDnsServer;
        var env = staging ? "staging" : "production";
        _logger.LogInformation("\ud83d\udd10 Let's Encrypt ({Env}) — d\u00e9marrage ordre pour {Domains} via DNS {Server}",
            env, string.Join(", ", domains), server);

        // ACME context — reuse cached account key to avoid rate limits
        var acmeUrl = staging ? WellKnownServers.LetsEncryptStagingV2 : WellKnownServers.LetsEncryptV2;
        var cacheKey = $"{email}::{env}";
        AcmeContext acme;
        if (_accountKeys.TryGetValue(cacheKey, out var existingKey))
        {
            _logger.LogInformation("\u267b\ufe0f R\u00e9utilisation compte ACME cach\u00e9 pour {Email} ({Env})", email, env);
            acme = new AcmeContext(acmeUrl, existingKey);
        }
        else
        {
            acme = new AcmeContext(acmeUrl);
            await acme.NewAccount(email, termsOfServiceAgreed: true);
            _accountKeys[cacheKey] = acme.AccountKey;
            _logger.LogInformation("\u2728 Nouveau compte ACME cr\u00e9\u00e9 pour {Email} ({Env})", email, env);
        }

        // New order
        var order = await acme.NewOrder(domains);
        var authorizations = await order.Authorizations();

        // Build DNS credential: explicit creds take priority, then fall back to Exchange session creds
        PSCredential? dnsCred = null;
        if (!string.IsNullOrWhiteSpace(dnsUsername) && !string.IsNullOrWhiteSpace(dnsPassword))
        {
            var secPwd = new System.Security.SecureString();
            foreach (var c in dnsPassword) secPwd.AppendChar(c);
            secPwd.MakeReadOnly();
            dnsCred = new PSCredential(dnsUsername, secPwd);
            _logger.LogInformation("🔑 Utilisation des credentials DNS fournis : {User}", dnsUsername);
        }
        else
        {
            dnsCred = _psService.GetCredential();
            if (dnsCred != null)
                _logger.LogInformation("🔑 Utilisation des credentials Exchange session : {User}", dnsCred.UserName);
            else
                _logger.LogWarning("⚠️ Aucun credential disponible pour les opérations DNS");
        }

        var state = new LetsEncryptOrderState
        {
            Acme = acme,
            Order = order,
            AccountKey = acme.AccountKey,
            Domains = domains,
            DnsServer = server,
            DnsCredential = dnsCred,
            Staging = staging,
        };

        // Collect DNS challenges
        foreach (var authz in authorizations)
        {
            var authzResource = await authz.Resource();
            var domain = authzResource.Identifier?.Value ?? string.Empty;

            var dnsChallenge = await authz.Dns() ?? throw new Exception($"Aucun challenge DNS disponible pour {domain}");
            var txtValue = acme.AccountKey.DnsTxt(dnsChallenge.Token);

            // Deduce DNS zone and record name directly from the domain
            var (zone, recordName) = ComputeZoneAndRecord(domain);

            state.Challenges.Add(new LetsEncryptDnsChallenge
            {
                Domain = domain,
                Zone = zone,
                RecordName = recordName,
                FullName = $"_acme-challenge.{domain}",
                TxtValue = txtValue,
                ChallengeContext = dnsChallenge,
            });
        }

        // Create DNS TXT records
        await CreateDnsRecordsAsync(state, add: true);

        _orders[state.OrderId] = state;
        return (state.OrderId, state.Challenges);
    }

    // ── Step 2 : Validate challenges and import certificate into Exchange ─────
    public async Task<string> ValidateAndImportAsync(string orderId, string[] exchangeServices)
    {
        if (!_orders.TryGetValue(orderId, out var state))
            throw new KeyNotFoundException($"Ordre {orderId} introuvable ou expiré.");

        _logger.LogInformation("✅ Validation challenges ACME pour orderId={OrderId}", orderId);

        // Validate each challenge
        foreach (var challenge in state.Challenges)
        {
            await challenge.ChallengeContext.Validate();
        }

        // Wait for all authorizations to be valid (poll max 3 min)
        var deadline = DateTime.UtcNow.AddMinutes(3);
        bool authsValid = false;
        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(5000);
            var allValid = true;
            var authorizations = await state.Order.Authorizations();
            foreach (var authz in authorizations)
            {
                var res = await authz.Resource();
                if (res.Status != AuthorizationStatus.Valid)
                {
                    allValid = false;
                    if (res.Status == AuthorizationStatus.Invalid)
                    {
                        var err = res.Challenges?.FirstOrDefault(c => c.Status == ChallengeStatus.Invalid)?.Error;
                        throw new Exception($"Validation échouée pour {res.Identifier?.Value}: {err?.Detail ?? "raison inconnue"}");
                    }
                }
            }
            if (allValid) { authsValid = true; break; }
        }
        if (!authsValid)
            throw new Exception("Timeout : Let's Encrypt n'a pas validé les challenges DNS dans les 3 minutes.");

        // Wait for order to reach Ready or Valid state
        _logger.LogInformation("⏳ Attente de l'état Ready/Valid de l'ordre ACME...");
        var finalOrderStatus = OrderStatus.Pending;
        var orderDeadline = DateTime.UtcNow.AddMinutes(1);
        while (DateTime.UtcNow < orderDeadline)
        {
            var orderRes = await state.Order.Resource();
            finalOrderStatus = orderRes.Status ?? OrderStatus.Pending;
            if (orderRes.Status == OrderStatus.Ready || orderRes.Status == OrderStatus.Valid)
                break;
            if (orderRes.Status == OrderStatus.Invalid)
                throw new Exception($"L'ordre ACME est invalide : {orderRes.Error?.ToString() ?? "raison inconnue"}");
            await Task.Delay(3000);
        }

        // Finalize — Ready → Generate (CSR + key), Valid → Download (déjà finalisé)
        _logger.LogInformation("📜 Finalisation de l'ordre ACME (status={S})...", finalOrderStatus);
        CertificateChain cert;
        IKey privateKey;
        if (finalOrderStatus == OrderStatus.Valid && state.PrivateKey != null)
        {
            // Order already finalized from a previous attempt — reuse stored key + download
            privateKey = state.PrivateKey;
            cert = await state.Order.Download();
        }
        else
        {
            // Normal path: generate fresh key + CSR, finalize order
            privateKey = KeyFactory.NewKey(KeyAlgorithm.RS256);
            state.PrivateKey = privateKey; // persist for potential retry
            var csrInfo = new CsrInfo
            {
                CommonName = state.Domains[0],
                Organization = "Exchange",
            };
            cert = await state.Order.Generate(csrInfo, privateKey);
        }
        var pfxPassword = Guid.NewGuid().ToString("N")[..12];
        var pfxBuilder = cert.ToPfx(privateKey);

        // Ajoute les intermédiaires fournis par la réponse ACME
        foreach (var issuer in cert.Issuers)
            pfxBuilder.AddIssuers(issuer.ToDer());

        // En staging, les CA racines ne sont PAS dans le store Windows →
        // on télécharge les certs racines staging LE et on les injecte dans le PFX builder
        if (state.Staging)
        {
            var stagingRoots = new[]
            {
                "https://letsencrypt.org/certs/staging/letsencrypt-stg-root-x1.pem",
                "https://letsencrypt.org/certs/staging/letsencrypt-stg-int-r3.pem",
                "https://letsencrypt.org/certs/staging/letsencrypt-stg-int-e1.pem",
            };
            using var http = new System.Net.Http.HttpClient();
            foreach (var url in stagingRoots)
            {
                try
                {
                    var pem = await http.GetStringAsync(url);
                    // Décoder le PEM → DER
                    var b64 = pem
                        .Replace("-----BEGIN CERTIFICATE-----", "")
                        .Replace("-----END CERTIFICATE-----", "")
                        .Replace("\r", "").Replace("\n", "").Trim();
                    pfxBuilder.AddIssuers(Convert.FromBase64String(b64));
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("Impossible de télécharger le cert staging {U}: {E}", url, ex.Message);
                }
            }
        }

        var pfxBytes = pfxBuilder.Build("LetsEncrypt", pfxPassword);

        // Import into Exchange via PowerShell (Exchange 2010)
        // Restricted Language Mode constraints:
        //   - No variable assignments ($x = ...)
        //   - No property access (.Property) → use Select-Object -ExpandProperty
        //   - No array indexing ($args[0]) → use param($pfxData, $pfxPass) named binding
        //   - No subexpressions (ConvertTo-SecureString ...) → build SecureString in C#
        // FileData (byte[]) is supported on Exchange 2010/2013/2016/2019.
        // FileName is Exchange 2013 only → never use it.
        _logger.LogInformation("📥 Import du certificat dans Exchange...");
        var servicesParam = string.Join(",", exchangeServices.Length > 0 ? exchangeServices : ["SMTP", "IIS"]);

        // Build SecureString in C# to avoid (ConvertTo-SecureString ...) subexpression in restricted mode.
        // Use param($pfxData, $pfxPass) instead of $args[0]/$args[1] — array indexing is also forbidden.
        var securePfxPwd = new System.Security.SecureString();
        foreach (var c in pfxPassword) securePfxPwd.AppendChar(c);
        securePfxPwd.MakeReadOnly();

        // Return full cert object — extracting Thumbprint from the PSObject dict by key is more reliable
        // than | Select-Object -ExpandProperty Thumbprint which can fail silently in restricted mode.
        // NoLanguage: pas de param() ni de variables PS → passer FileData/Password directement via AddParameter
        var importScript = "Import-ExchangeCertificate";
        var importParams = new Dictionary<string, object>
        {
            ["FileData"]             = pfxBytes,
            ["Password"]             = securePfxPwd,
            ["PrivateKeyExportable"] = true,
        };

        string thumbprint = "OK";
        try
        {
            var importResult = await _psService.ExecuteScriptAsync(importScript, importParams);

            if (importResult is List<Dictionary<string, object>> rows && rows.Count > 0)
            {
                var row = rows[0];
                // Try common casing variants
                if (row.TryGetValue("Thumbprint", out var t) && t != null)
                    thumbprint = t.ToString()!;
                else if (row.TryGetValue("thumbprint", out var t2) && t2 != null)
                    thumbprint = t2.ToString()!;
                else
                    _logger.LogWarning("⚠️ Import cert: Thumbprint non trouvé. Propriétés disponibles: {Keys}", string.Join(", ", row.Keys));
            }
            else if (importResult is string s && !string.IsNullOrWhiteSpace(s))
                thumbprint = s;
        }
        catch (Exception ex) when (ex.Message.Contains("already exists"))
        {
            // Certificate was already imported in a previous attempt.
            // Extract the thumbprint from the error message:
            //   "A certificate with the thumbprint XXXX already exists."
            var m = System.Text.RegularExpressions.Regex.Match(
                ex.Message, @"thumbprint\s+([0-9A-Fa-f]{40})", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (m.Success)
            {
                thumbprint = m.Groups[1].Value.ToUpperInvariant();
                _logger.LogInformation("ℹ️ Certificat déjà importé (thumbprint={T}), passage à Enable.", thumbprint);
            }
            else
            {
                _logger.LogWarning("⚠️ Certificat déjà existant mais thumbprint non parseable: {Msg}", ex.Message);
                throw; // can't continue without a thumbprint
            }
        }

        // Enable services — thumbprint injected as literal string, no property access
        if (!string.IsNullOrWhiteSpace(thumbprint) && thumbprint != "OK")
        {
            var escapedThumb = thumbprint.Replace("'", "''");
            await _psService.ExecuteScriptAsync(
                $"Enable-ExchangeCertificate -Thumbprint '{escapedThumb}' -Services {servicesParam} -Force -Confirm:$false");
        }

        // Cleanup DNS records
        await CreateDnsRecordsAsync(state, add: false);
        _orders.TryRemove(orderId, out _);

        _logger.LogInformation("🎉 Certificat Let's Encrypt importé: thumbprint={T}", thumbprint);
        return thumbprint;
    }

    // ── DNS helpers ───────────────────────────────────────────────────────────
    private async Task CreateDnsRecordsAsync(LetsEncryptOrderState state, bool add)
    {
        var cred = state.DnsCredential;

        foreach (var challenge in state.Challenges)
        {
            try
            {
                await ExecuteDnsCommandAsync(state.DnsServer, challenge.Zone, challenge.RecordName,
                    challenge.TxtValue, cred, add);
                if (add) challenge.AutoCreated = true;
            }
            catch (Exception ex)
            {
                var msg = ex.Message;
                _logger.LogWarning("DNS {Op} échecé pour {Domain}: {Err}",
                    add ? "ajout" : "suppression", challenge.Domain, msg);
                // Non-fatal: we let the UI show the record for manual creation
                if (add)
                {
                    challenge.AutoCreated = false;
                    challenge.AutoCreateError = msg;
                }
            }
        }
    }

    private async Task ExecuteDnsCommandAsync(string dnsServer, string zone, string recordName,
        string txtValue, PSCredential? credential, bool add)
    {
        // Use pwsh.exe subprocess to avoid PS SDK snap-in loading issues in embedded .NET 8 context.
        // Password is injected via environment variable — never written to disk or command line.

        // Pre-escape values for PowerShell single-quote context
        var eTxt    = txtValue.Replace("'", "''");
        var eZone   = zone.Replace("'", "''");
        var eRecord = recordName.Replace("'", "''");
        var eSrv    = dnsServer.Replace("'", "''");

        var sb = new System.Text.StringBuilder();

        if (credential != null)
        {
            var eUser = credential.UserName.Replace("'", "''");
            // Use Invoke-Command (WinRM) — more reliable than CimSession (DCOM) in AD environments
            if (add)
            {
                sb.AppendLine("$ErrorActionPreference = 'Stop'");
                sb.AppendLine("$secPwd = ConvertTo-SecureString $env:DNS_PWD -AsPlainText -Force");
                sb.AppendLine($"$cred = New-Object PSCredential('{eUser}', $secPwd)");
                sb.AppendLine($"Invoke-Command -ComputerName '{eSrv}' -Credential $cred -Authentication Negotiate -ScriptBlock {{");
                sb.AppendLine($"    # Supprimer l'ancien TXT s'il existe (évite les doublons entre sessions)");
                sb.AppendLine($"    Remove-DnsServerResourceRecord -ZoneName '{eZone}' -Name '{eRecord}' -RRType TXT -Force -Confirm:$false -ErrorAction SilentlyContinue");
                sb.AppendLine($"    Add-DnsServerResourceRecord -ZoneName '{eZone}' -Name '{eRecord}' -Txt -DescriptiveText '{eTxt}' -TimeToLive ([System.TimeSpan]::FromSeconds(120))");
                sb.AppendLine("}");
            }
            else
            {
                sb.AppendLine("$ErrorActionPreference = 'SilentlyContinue'");
                sb.AppendLine("$secPwd = ConvertTo-SecureString $env:DNS_PWD -AsPlainText -Force");
                sb.AppendLine($"$cred = New-Object PSCredential('{eUser}', $secPwd)");
                sb.AppendLine($"Invoke-Command -ComputerName '{eSrv}' -Credential $cred -Authentication Negotiate -ScriptBlock {{");
                sb.AppendLine($"    Remove-DnsServerResourceRecord -ZoneName '{eZone}' -Name '{eRecord}' -RRType TXT -Force -Confirm:$false -ErrorAction SilentlyContinue");
                sb.AppendLine("}");
            }
        }
        else
        {
            if (add)
            {
                sb.AppendLine("$ErrorActionPreference = 'Stop'");
                sb.AppendLine($"Remove-DnsServerResourceRecord -ComputerName '{eSrv}' -ZoneName '{eZone}' -Name '{eRecord}' -RRType TXT -Force -Confirm:$false -ErrorAction SilentlyContinue");
                sb.AppendLine($"Add-DnsServerResourceRecord -ComputerName '{eSrv}' -ZoneName '{eZone}' -Name '{eRecord}' -Txt -DescriptiveText '{eTxt}' -TimeToLive ([System.TimeSpan]::FromSeconds(120))");
            }
            else
            {
                sb.AppendLine($"Remove-DnsServerResourceRecord -ComputerName '{eSrv}' -ZoneName '{eZone}' -Name '{eRecord}' -RRType TXT -Force -Confirm:$false -ErrorAction SilentlyContinue");
            }
        }

        var scriptLines = sb.ToString();

        // Write script to a temp file
        var tempScript = Path.Combine(Path.GetTempPath(), $"dns_acme_{Guid.NewGuid():N}.ps1");
        await File.WriteAllTextAsync(tempScript, scriptLines);

        try
        {
            var si = new ProcessStartInfo
            {
                FileName               = "pwsh.exe",
                Arguments              = $"-NonInteractive -NoProfile -ExecutionPolicy Bypass -File \"{tempScript}\"",
                UseShellExecute        = false,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                CreateNoWindow         = true,
            };

            // Pass password exclusively via env var — never in arguments or the script file
            if (credential != null)
                si.Environment["DNS_PWD"] = credential.GetNetworkCredential().Password;

            using var proc = Process.Start(si)
                ?? throw new Exception("Impossible de lancer pwsh.exe");

            var stdout = await proc.StandardOutput.ReadToEndAsync();
            var stderr = await proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync();

            if (!string.IsNullOrWhiteSpace(stdout))
                _logger.LogDebug("DNS pwsh stdout: {Out}", stdout.Trim());

            if (proc.ExitCode != 0 && add)
                throw new Exception($"Erreur DNS (ajout TXT) — exit {proc.ExitCode}: {stderr.Trim()}");

            if (!string.IsNullOrWhiteSpace(stderr) && add)
                _logger.LogWarning("DNS pwsh stderr: {Err}", stderr.Trim());
        }
        finally
        {
            File.Delete(tempScript);
        }
    }

    /// <summary>
    /// Deduce zone and TXT record name from a domain.
    /// smtp.pdulab.ovh  → zone=pdulab.ovh,  record=_acme-challenge.smtp
    /// pdulab.ovh       → zone=pdulab.ovh,  record=_acme-challenge
    /// a.b.example.com  → zone=b.example.com, record=_acme-challenge.a
    /// </summary>
    private static (string zone, string recordName) ComputeZoneAndRecord(string domain)
    {
        var d = domain.TrimEnd('.').ToLowerInvariant();
        var dot = d.IndexOf('.');
        if (dot < 0)
            return (d, "_acme-challenge"); // single-label apex
        var zone = d[(dot + 1)..];
        var sub  = d[..dot];
        return (zone, $"_acme-challenge.{sub}");
    }

    public (string orderId, List<LetsEncryptDnsChallenge> challenges)? GetOrder(string orderId)
        => _orders.TryGetValue(orderId, out var state)
            ? (orderId, state.Challenges)
            : null;
}
