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
    public async Task<string> ValidateAndImportAsync(string orderId, string[] exchangeServices, string? exchangeServer = null)
    {
        if (!_orders.TryGetValue(orderId, out var state))
            throw new KeyNotFoundException($"Ordre {orderId} introuvable ou expiré.");

        _logger.LogInformation("✅ Validation challenges ACME pour orderId={OrderId}", orderId);

        // Wait for DNS propagation before notifying LE — avoids "Fail to finalize" on first attempt
        await WaitForDnsPropagationAsync(state.Challenges, TimeSpan.FromMinutes(5), TimeSpan.FromSeconds(15));

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

        var friendlyName = state.Domains.Length > 0 ? state.Domains[0] : "LetsEncrypt";
        var pfxBytes = pfxBuilder.Build(friendlyName, pfxPassword);

        // Import into Exchange via PowerShell (Exchange 2010)
        // Restricted Language Mode constraints:
        //   - No variable assignments ($x = ...)
        //   - No property access (.Property) → use Select-Object -ExpandProperty
        //   - No array indexing ($args[0]) → use param($pfxData, $pfxPass) named binding
        //   - No subexpressions (ConvertTo-SecureString ...) → build SecureString in C#
        // FileData (byte[]) is supported on Exchange 2010/2013/2016/2019.
        // FileName is Exchange 2013 only → never use it.
        _logger.LogInformation("📥 Import du certificat dans Exchange...");
        var servicesParam = string.Join(",", exchangeServices);

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
        if (!string.IsNullOrEmpty(exchangeServer))
            importParams["Server"] = exchangeServer;

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

        // Fallback thumbprint recovery : si Import-ExchangeCertificate n'a pas retourné de Thumbprint
        // utilisable, on interroge Get-ExchangeCertificate et on cherche par FriendlyName (= premier domaine).
        if (thumbprint == "OK" || thumbprint.Length != 40)
        {
            _logger.LogInformation("🔍 Thumbprint non capturé depuis Import — récupération via Get-ExchangeCertificate");
            try
            {
                var srvArg2 = !string.IsNullOrEmpty(exchangeServer)
                    ? $" -Server '{exchangeServer.Replace("'", "''")}'"
                    : "";
                var certs = await _psService.ExecuteScriptAsync(
                    $"Get-ExchangeCertificate{srvArg2} | Select-Object Thumbprint, FriendlyName, NotBefore")
                    as List<Dictionary<string, object>>;
                if (certs != null)
                {
                    var match = certs.FirstOrDefault(c =>
                        c.TryGetValue("FriendlyName", out var fn) && fn?.ToString() == friendlyName);
                    // Fallback: cert le plus récent
                    match ??= certs
                        .OrderByDescending(c =>
                            c.TryGetValue("NotBefore", out var nb) && nb is DateTime d ? d : DateTime.MinValue)
                        .FirstOrDefault();
                    if (match?.TryGetValue("Thumbprint", out var tp) == true
                        && tp?.ToString()?.Length == 40)
                        thumbprint = tp.ToString()!.ToUpperInvariant();
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("⚠️ Impossible de récupérer le thumbprint via Get-ExchangeCertificate: {Msg}", ex.Message);
            }
        }

        // Enable services — thumbprint injected as literal string, no property access
        if (!string.IsNullOrWhiteSpace(thumbprint) && thumbprint != "OK" && thumbprint.Length == 40
            && exchangeServices.Length > 0)
        {
            var escapedThumb = thumbprint.Replace("'", "''");
            var serverArg = !string.IsNullOrEmpty(exchangeServer)
                ? $" -Server '{exchangeServer.Replace("'", "''")}'"
                : "";
            await _psService.ExecuteScriptAsync(
                $"Enable-ExchangeCertificate -Thumbprint '{escapedThumb}' -Services {servicesParam}{serverArg} -Force -Confirm:$false");
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

        // Retry up to 3 times — WinRM/Invoke-Command can fail on the first attempt
        // due to session initialization latency ("Connecting to remote server failed", etc.)
        const int maxAttempts = 3;
        Exception? lastEx = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++)
        {
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
                    _logger.LogDebug("DNS pwsh stdout (attempt {A}): {Out}", attempt, stdout.Trim());

                if (proc.ExitCode != 0 && add)
                {
                    var errMsg = stderr.Trim();
                    _logger.LogWarning("DNS pwsh exit {Code} (attempt {A}/{Max}): {Err}",
                        proc.ExitCode, attempt, maxAttempts, errMsg);
                    lastEx = new Exception($"Erreur DNS (ajout TXT) — exit {proc.ExitCode}: {errMsg}");
                    if (attempt < maxAttempts)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(attempt * 3)); // 3s, 6s
                        continue;
                    }
                    throw lastEx;
                }

                if (!string.IsNullOrWhiteSpace(stderr) && add)
                    _logger.LogWarning("DNS pwsh stderr: {Err}", stderr.Trim());

                // Success — exit retry loop
                lastEx = null;
                break;
            }
            catch (Exception ex) when (ex != lastEx)
            {
                // Unexpected exception (process launch failure, etc.)
                _logger.LogWarning("DNS pwsh exception (attempt {A}/{Max}): {Err}",
                    attempt, maxAttempts, ex.Message);
                lastEx = ex;
                if (attempt < maxAttempts)
                    await Task.Delay(TimeSpan.FromSeconds(attempt * 3));
                else
                    throw;
            }
        }

        File.Delete(tempScript);
    }

    /// <summary>
    /// Poll Google DNS-over-HTTPS until all auto-created TXT records are visible from the internet,
    /// or until <paramref name="timeout"/> is reached (non-fatal — we try anyway).
    /// This prevents "Fail to finalize order" errors caused by DNS propagation lag.
    /// </summary>
    private async Task WaitForDnsPropagationAsync(
        List<LetsEncryptDnsChallenge> challenges,
        TimeSpan timeout,
        TimeSpan pollInterval)
    {
        var pending = challenges.Where(c => c.AutoCreated).ToList();
        if (pending.Count == 0)
        {
            _logger.LogInformation("⏩ Aucun record TXT auto-créé — pas de polling DNS propagation");
            return;
        }

        _logger.LogInformation("⏳ Attente propagation DNS ({Count} record(s) TXT) — timeout {Min} min",
            pending.Count, (int)timeout.TotalMinutes);

        using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        http.DefaultRequestHeaders.Add("Accept", "application/dns-json");

        var deadline = DateTime.UtcNow.Add(timeout);
        while (DateTime.UtcNow < deadline)
        {
            var allVisible = true;
            foreach (var challenge in pending)
            {
                try
                {
                    var url = $"https://dns.google/resolve?name={Uri.EscapeDataString(challenge.FullName)}&type=TXT";
                    var json = await http.GetStringAsync(url);
                    var doc  = System.Text.Json.JsonDocument.Parse(json);

                    var found = false;
                    if (doc.RootElement.TryGetProperty("Answer", out var answers)
                        && answers.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        foreach (var record in answers.EnumerateArray())
                        {
                            if (record.TryGetProperty("data", out var data))
                            {
                                var txt = data.GetString()?.Trim('"') ?? "";
                                if (txt == challenge.TxtValue) { found = true; break; }
                            }
                        }
                    }

                    if (!found)
                    {
                        allVisible = false;
                        _logger.LogDebug("⏳ {Name} pas encore visible ({Val})", challenge.FullName, challenge.TxtValue);
                    }
                    else
                    {
                        _logger.LogDebug("✅ {Name} visible dans Google DNS", challenge.FullName);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("DoH check échoué pour {Name}: {Err} — on continue", challenge.FullName, ex.Message);
                    // Non-fatal: if DoH is unreachable, just proceed rather than blocking forever
                }
            }

            if (allVisible)
            {
                _logger.LogInformation("✅ Tous les TXT sont propagés — lancement validation ACME");
                return;
            }

            await Task.Delay(pollInterval);
        }

        _logger.LogWarning("⚠️ Timeout propagation DNS ({Min} min) — tentative de validation quand même",
            (int)timeout.TotalMinutes);
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
