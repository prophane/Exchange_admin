using System.Management.Automation;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ExchangeWebAdmin.API.Models;

namespace ExchangeWebAdmin.API.Services
{
    public class ConfigurationService
    {
        private readonly IPowerShellService _psService;
        private readonly ILogger<ConfigurationService> _logger;

        public ConfigurationService(IPowerShellService psService, ILogger<ConfigurationService> logger)
        {
            _psService = psService;
            _logger = logger;
        }

        // ============================================================================
        // Certificats
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetCertificatesAsync(string? server = null)
        {
            _logger.LogInformation("Récupération des certificats Exchange (serveur: {Server})", server ?? "tous");

            // Si un serveur précis est demandé, on interroge directement
            if (!string.IsNullOrEmpty(server))
            {
                var srvParam = $"-Server '{server.Replace("'", "''")}'";
                var script = $@"Get-ExchangeCertificate {srvParam} | Select-Object Thumbprint, Subject, Issuer, NotBefore, NotAfter, IsSelfSigned, ServicesStringForm, Status, CertificateDomains, FriendlyName, Identity";
                var result = await _psService.ExecuteScriptAsync(script);
                return PostProcessCerts(result);
            }

            // Sans serveur : on énumère tous les serveurs Exchange et on boucle en C#
            var srvListResult = await _psService.ExecuteScriptAsync(
                "Get-ExchangeServer | Select-Object Name");
            var serverNames = new List<string>();
            if (srvListResult is List<Dictionary<string, object>> srvList)
                foreach (var row in srvList)
                    if (row.TryGetValue("Name", out var n) && n != null)
                        serverNames.Add(n.ToString()!);

            if (serverNames.Count == 0)
            {
                // Fallback : session locale seulement
                var r = await _psService.ExecuteScriptAsync(
                    "Get-ExchangeCertificate | Select-Object Thumbprint, Subject, Issuer, NotBefore, NotAfter, IsSelfSigned, ServicesStringForm, Status, CertificateDomains, FriendlyName, Identity");
                return PostProcessCerts(r);
            }

            var all = new List<Dictionary<string, object>>();
            foreach (var srv in serverNames)
            {
                var safe = srv.Replace("'", "''");
                var script = $"Get-ExchangeCertificate -Server '{safe}' | Select-Object Thumbprint, Subject, Issuer, NotBefore, NotAfter, IsSelfSigned, ServicesStringForm, Status, CertificateDomains, FriendlyName, Identity";
                var r = await _psService.ExecuteScriptAsync(script);
                all.AddRange(PostProcessCerts(r));
            }
            return all;
        }

        private static List<Dictionary<string, object>> PostProcessCerts(object? result)
        {
            if (result is not List<Dictionary<string, object>> dictList) return [];
            foreach (var cert in dictList)
            {
                if (cert.TryGetValue("ServicesStringForm", out var svcRaw))
                {
                    cert["Services"] = DecodeServicesStringForm(svcRaw?.ToString() ?? "");
                    cert.Remove("ServicesStringForm");
                }
                if (cert.TryGetValue("Identity", out var idRaw))
                {
                    var id = idRaw?.ToString() ?? "";
                    var slash = id.IndexOf('\\');
                    cert["Server"] = slash >= 0 ? id[..slash] : id;
                }
            }
            return dictList;
        }

        /// <summary>
        /// Décode la propriété ServicesStringForm d'Exchange (ex: "I...S.." → "IMAP, SMTP").
        /// Format 7 chars : [0]=I(MAP) [1]=P(OP) [2]=U(M) [3]=W(IIS) [4]=S(MTP) [5]=F(ederation) [6]=?
        /// Un point '.' signifie que le service n'est pas activé.
        /// </summary>
        private static string DecodeServicesStringForm(string s)
        {
            if (string.IsNullOrEmpty(s)) return "None";
            var names = new List<string>();
            if (s.Length > 0 && s[0] != '.') names.Add("IMAP");
            if (s.Length > 1 && s[1] != '.') names.Add("POP");
            if (s.Length > 2 && s[2] != '.') names.Add("UM");
            if (s.Length > 3 && s[3] != '.') names.Add("IIS");
            if (s.Length > 4 && s[4] != '.') names.Add("SMTP");
            if (s.Length > 5 && s[5] != '.') names.Add("Federation");
            return names.Count > 0 ? string.Join(", ", names) : "None";
        }

        public async Task EnableCertificateServicesAsync(string thumbprint, string server, string[] services)
        {
            if (services.Length == 0) return;
            var s = string.Join(",", services);
            var t = thumbprint.Replace("'", "''");
            var srv = server.Replace("'", "''");
            var serverArg = string.IsNullOrWhiteSpace(srv) ? "" : $" -Server '{srv}'";
            _logger.LogInformation("Activation services {Services} pour certificat {Thumbprint} sur {Server}", s, thumbprint, server);
            await _psService.ExecuteScriptAsync(
                $"Enable-ExchangeCertificate -Thumbprint '{t}'{serverArg} -Services {s} -Force -Confirm:$false");
        }

        public async Task<Dictionary<string, object>?> GetCertificateAsync(string thumbprint)
        {
            _logger.LogInformation("Récupération du certificat {Thumbprint}", thumbprint);

            var script = @$"
                Get-ExchangeCertificate -Thumbprint '{thumbprint.Replace("'", "''")}'
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            
            if (result is List<Dictionary<string, object>> dictList && dictList.Count > 0)
            {
                return dictList[0];
            }
            
            return null;
        }

        /// <summary>Supprime un certificat Exchange par son empreinte.</summary>
        public async Task DeleteCertificateAsync(string thumbprint, string server)
        {
            var t = thumbprint.Replace("'", "''");
            var srv = server.Replace("'", "''");
            var serverArg = string.IsNullOrWhiteSpace(srv) ? "" : $" -Server '{srv}'";
            _logger.LogInformation("Suppression du certificat {Thumbprint} sur {Server}", thumbprint, server);
            await _psService.ExecuteScriptAsync(
                $"Remove-ExchangeCertificate -Thumbprint '{t}'{serverArg} -Confirm:$false");
        }

        /// <summary>
        /// Renouvelle un certificat auto-signé Exchange :
        /// recrée un nouveau certificat auto-signé avec les mêmes domaines/services.
        /// </summary>
        public async Task<string> RenewSelfSignedCertificateAsync(string thumbprint, string[] services, string server)
        {
            var t = thumbprint.Replace("'", "''");
            var svcParam = services.Length > 0 ? string.Join(",", services) : "SMTP";
            _logger.LogInformation("Renouvellement certificat auto-signé {Thumbprint}", thumbprint);

            // Récupère le Subject et les domaines de l'ancien cert
            var info = await GetCertificateAsync(thumbprint);
            var subject = info?.TryGetValue("Subject", out var subj) == true ? subj?.ToString() ?? "" : "";
            var cn = subject.Split(',')
                .Select(p => p.Trim())
                .FirstOrDefault(p => p.StartsWith("CN=", StringComparison.OrdinalIgnoreCase))
                ?.Substring(3) ?? "Exchange";
            var safeCn = cn.Replace("'", "''");

            var script = $@"
                $newCert = New-ExchangeCertificate -Server '{server.Replace("'", "''")}' `
                    -FriendlyName '{safeCn} (renouvelé)' `
                    -SubjectName 'CN={safeCn}' `
                    -DomainName '{safeCn}' `
                    -PrivateKeyExportable $true `
                    -Services {svcParam} `
                    -Force -Confirm:$false
                $newCert.Thumbprint
            ";
            var result = await _psService.ExecuteScriptAsync(script);
            var newThumb = result is List<Dictionary<string, object>> l && l.Count > 0
                ? l[0].Values.FirstOrDefault()?.ToString() ?? ""
                : result?.ToString() ?? "";
            return newThumb;
        }

        /// <summary>
        /// Génère une demande de certificat (CSR) pour une CA entreprise.
        /// Retourne le contenu PEM de la requête.
        /// </summary>
        public async Task<string> NewCertificateRequestAsync(
            string server, string subjectName, string[] domainNames, string friendlyName,
            int keySize, string[] services)
        {
            var safeSub = subjectName.Replace("'", "''");
            var safeFn  = friendlyName.Replace("'", "''");
            var domainList = string.Join(",", domainNames.Select(d => $"'{d.Replace("'", "''")}'" ));
            var svcParam = services.Length > 0 ? string.Join(",", services) : "SMTP,IIS";
            var tempPath = $@"C:\Windows\Temp\excsr_{Guid.NewGuid():N}.req";

            _logger.LogInformation("Génération CSR pour {SubjectName}, domaines: {Domains}", subjectName, string.Join(",", domainNames));

            var script = $@"
                New-ExchangeCertificate -Server '{server.Replace("'", "''")}' `
                    -GenerateRequest `
                    -SubjectName '{safeSub}' `
                    -DomainName {domainList} `
                    -FriendlyName '{safeFn}' `
                    -KeySize {keySize} `
                    -PrivateKeyExportable $true `
                    -Path '{tempPath}'
                Get-Content '{tempPath}' -Raw
                Remove-Item '{tempPath}' -Force -ErrorAction SilentlyContinue
            ";
            var result = await _psService.ExecuteScriptAsync(script);

            // Le contenu du fichier est le dernier objet retourné
            if (result is List<Dictionary<string, object>> items)
            {
                // Cherche le bloc PEM parmi les résultats
                foreach (var item in Enumerable.Reverse(items))
                {
                    var val = item.Values.FirstOrDefault()?.ToString() ?? "";
                    if (val.Contains("BEGIN") || val.Length > 100)
                        return val;
                }
            }
            return result?.ToString() ?? "";
        }

        /// <summary>
        /// Importe le certificat signé par la CA entreprise (PKCS#7 base64 ou PFX base64).
        /// </summary>
        public async Task<string> ImportCertificateResponseAsync(
            string server, string base64Cert, string[] services, string? pfxPassword = null)
        {
            var bytes = Convert.FromBase64String(base64Cert.Trim());
            var tempPath = $@"C:\Windows\Temp\excert_{Guid.NewGuid():N}.p7b";
            await File.WriteAllBytesAsync(tempPath, bytes);

            var svcParam    = string.Join(",", services);
            var enableLine  = services.Length > 0
                ? $"Enable-ExchangeCertificate -Thumbprint $imported.Thumbprint -Services {svcParam} -Force -Confirm:$false"
                : "";
            var pwdParam = !string.IsNullOrEmpty(pfxPassword)
                ? $" -Password (ConvertTo-SecureString '{pfxPassword.Replace("'", "''")}' -AsPlainText -Force)"
                : "";
            var safePath = tempPath.Replace("'", "''");

            _logger.LogInformation("Import certificat CA depuis {Path}", tempPath);

            var script = $@"
                $bytes = [System.IO.File]::ReadAllBytes('{safePath}')
                $imported = Import-ExchangeCertificate -FileData $bytes{pwdParam} -Server '{server.Replace("'", "''")}'
                Remove-Item '{safePath}' -Force -ErrorAction SilentlyContinue
                if ($imported) {{
                    {enableLine}
                    $imported.Thumbprint
                }}
            ";
            var result = await _psService.ExecuteScriptAsync(script);
            var thumb = result is List<Dictionary<string, object>> l && l.Count > 0
                ? l[0].Values.FirstOrDefault()?.ToString() ?? ""
                : result?.ToString() ?? "";
            return thumb;
        }

        /// <summary>
        /// Déploie un certificat d'un serveur Exchange vers un autre :
        /// Export-ExchangeCertificate (source) → Import-ExchangeCertificate (cible) → Enable.
        /// </summary>
        public async Task<string> DeployCertificateToServerAsync(string thumbprint, string fromServer, string toServer, string[] services)
        {
            var safeFrom = fromServer.Replace("'", "''");
            var safeTo   = toServer.Replace("'", "''");
            var svcParam = string.Join(",", services);

            _logger.LogInformation("Déploiement certificat {T} de {From} vers {To}", thumbprint, fromServer, toServer);

            // Mot de passe temporaire pour le PFX
            var pfxPwd = Guid.NewGuid().ToString("N")[..12];

            // ── Export depuis le serveur source (avec retry WinRM) ────────────
            byte[] pfxBytes = [];
            Exception? lastExportEx = null;
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    if (attempt > 1)
                    {
                        _logger.LogWarning("Export-ExchangeCertificate tentative {N}/3 après {D}s", attempt, attempt * 3);
                        await Task.Delay(attempt * 3000);
                    }

                    var exportPwd = new System.Security.SecureString();
                    foreach (var c in pfxPwd) exportPwd.AppendChar(c);
                    exportPwd.MakeReadOnly();

                    var exportResult = await _psService.ExecuteScriptAsync("Export-ExchangeCertificate", new Dictionary<string, object>
                    {
                        ["Thumbprint"]    = thumbprint,
                        ["Server"]        = fromServer,
                        ["BinaryEncoded"] = true,
                        ["Password"]      = exportPwd,
                    });

                    if (exportResult is List<Dictionary<string, object>> rows && rows.Count > 0
                        && rows[0].TryGetValue("_bytes", out var bytesVal) && bytesVal is byte[] exportedBytes && exportedBytes.Length > 0)
                    {
                        pfxBytes = exportedBytes;
                        _logger.LogInformation("Export réussi : {Bytes} octets", pfxBytes.Length);
                        break;
                    }
                    else if (exportResult is byte[] raw && raw.Length > 0)
                    {
                        pfxBytes = raw;
                        _logger.LogInformation("Export réussi (raw) : {Bytes} octets", pfxBytes.Length);
                        break;
                    }
                    else
                    {
                        var type = exportResult?.GetType()?.Name ?? "null";
                        lastExportEx = new Exception(
                            $"Export-ExchangeCertificate tentative {attempt} : aucune donnée binaire (type={type}). "
                            + $"Vérifiez que le certificat existe sur {fromServer} et que la clé privée est exportable.");
                        _logger.LogWarning("{Msg}", lastExportEx.Message);
                    }
                }
                catch (Exception ex)
                {
                    lastExportEx = ex;
                    _logger.LogWarning("Export tentative {N} échouée : {Msg}", attempt, ex.Message);
                }
            }

            if (pfxBytes.Length == 0)
                throw lastExportEx ?? new Exception($"Export-ExchangeCertificate a échoué après 3 tentatives depuis {fromServer}.");

            // ── Import sur le serveur cible (avec retry WinRM) ───────────────
            var newThumb = thumbprint;
            Exception? lastImportEx = null;
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    if (attempt > 1)
                    {
                        _logger.LogWarning("Import-ExchangeCertificate tentative {N}/3 après {D}s", attempt, attempt * 3);
                        await Task.Delay(attempt * 3000);
                    }

                    var importPwd = new System.Security.SecureString();
                    foreach (var c in pfxPwd) importPwd.AppendChar(c);
                    importPwd.MakeReadOnly();

                    var importResult = await _psService.ExecuteScriptAsync("Import-ExchangeCertificate", new Dictionary<string, object>
                    {
                        ["FileData"]             = pfxBytes,
                        ["Server"]               = toServer,
                        ["Password"]             = importPwd,
                        ["PrivateKeyExportable"] = true,
                    });

                    if (importResult is List<Dictionary<string, object>> rows2 && rows2.Count > 0)
                    {
                        var row = rows2[0];
                        if (row.TryGetValue("Thumbprint", out var tp) && tp?.ToString()?.Length == 40)
                            newThumb = tp.ToString()!.ToUpperInvariant();
                        _logger.LogInformation("Import réussi sur {To}, thumb={T}", toServer, newThumb);
                    }
                    lastImportEx = null;
                    break;
                }
                catch (Exception ex)
                {
                    lastImportEx = ex;
                    _logger.LogWarning("Import tentative {N} échouée : {Msg}", attempt, ex.Message);
                }
            }
            if (lastImportEx != null) throw lastImportEx;

            // Fallback : Get-ExchangeCertificate si Import n'a pas retourné le Thumbprint
            if (newThumb == thumbprint || newThumb.Length != 40)
            {
                _logger.LogInformation("Récupération Thumbprint après import cible via Get-ExchangeCertificate");
                try
                {
                    var findResult = await _psService.ExecuteScriptAsync(
                        $"Get-ExchangeCertificate -Server '{safeTo}' | Select-Object Thumbprint, NotBefore")
                        as List<Dictionary<string, object>>;
                    if (findResult?.Count > 0)
                    {
                        // Le cert le plus récemment importé est celui qu'on vient d'importer
                        var newest = findResult
                            .OrderByDescending(c =>
                                c.TryGetValue("NotBefore", out var nb) && nb is DateTime d ? d : DateTime.MinValue)
                            .FirstOrDefault();
                        if (newest?.TryGetValue("Thumbprint", out var tp2) == true
                            && tp2?.ToString()?.Length == 40)
                            newThumb = tp2.ToString()!.ToUpperInvariant();
                    }
                }
                catch (Exception ex) { _logger.LogWarning("Fallback Get-ExchangeCertificate cible: {Msg}", ex.Message); }
            }

            // Enable sur le serveur cible (seulement si services demandés)
            if (services.Length > 0)
            {
                var safeThumb = newThumb.Replace("'", "''");
                await _psService.ExecuteScriptAsync(
                    $"Enable-ExchangeCertificate -Thumbprint '{safeThumb}' -Server '{safeTo}' -Services {svcParam} -Force -Confirm:$false");
            }
            else
            {
                _logger.LogInformation("Déploiement sans activation de services (services=[]) sur {To}", toServer);
            }

            return newThumb;
        }

        // ============================================================================
        // Répertoires Virtuels - ALL (session directe par serveur, isolation par cmdlet)
        // ============================================================================

        public async Task<Dictionary<string, List<Dictionary<string, object>>>> GetAllVirtualDirectoriesAsync(string? server = null, bool adPropertiesOnly = false)
        {
            _logger.LogInformation("Récupération de tous les répertoires virtuels (multi-session, adOnly={AdOnly})", adPropertiesOnly);

            var allOwa = new List<Dictionary<string, object>>();
            var allEcp  = new List<Dictionary<string, object>>();
            var allEas  = new List<Dictionary<string, object>>();
            var allEws  = new List<Dictionary<string, object>>();
            var allOab  = new List<Dictionary<string, object>>();
            var allPs   = new List<Dictionary<string, object>>();
            var allRpc  = new List<Dictionary<string, object>>();
            var allMapi = new List<Dictionary<string, object>>();

            var flatList = await _psService.ExecuteVirtualDirectoriesAsync(server, adPropertiesOnly);

            _logger.LogInformation("GetAllVirtualDirectoriesAsync: {Count} objets reçus au total", flatList.Count);

            foreach (var item in flatList)
            {
                // Priorité 1 : propriétés exclusives par type
                if (item.ContainsKey("InternalHostname") || item.ContainsKey("ExternalHostname") || item.ContainsKey("SSLOffloading")) { allRpc.Add(item); continue; }
                if (item.ContainsKey("BasicAuthEnabled"))             { allEas.Add(item); continue; }
                if (item.ContainsKey("MRSProxyEnabled"))              { allEws.Add(item); continue; }
                if (item.ContainsKey("PollInterval"))                 { allOab.Add(item); continue; }
                if (item.ContainsKey("RedirectToOptimalOWAServer"))   { allOwa.Add(item); continue; }
                if (item.ContainsKey("LogonFormat"))                  { allOwa.Add(item); continue; }

                // Priorité 2 : partitionnement par Name / Identity
                var name = (item.TryGetValue("Name", out var nv) ? nv?.ToString() : null)
                        ?? (item.TryGetValue("Identity", out var iv) ? iv?.ToString() : null)
                        ?? "";
                var lower = name.ToLowerInvariant();

                if      (lower.Contains("rpc") || lower.Contains("outlookanywhere")) allRpc.Add(item);
                else if (lower.Contains("mapi"))                                      allMapi.Add(item);
                else if (lower.Contains("activesync") || lower.Contains("microsoft-server-activesync")) allEas.Add(item);
                else if (lower.Contains("ews"))        allEws.Add(item);
                else if (lower.Contains("oab"))        allOab.Add(item);
                else if (lower.Contains("powershell")) allPs.Add(item);
                else if (lower.Contains("ecp"))        allEcp.Add(item);
                else if (lower.Contains("owa"))        allOwa.Add(item);
                else if (item.ContainsKey("FormsAuthentication")) allEcp.Add(item);
                else                                               allPs.Add(item);
            }

            _logger.LogInformation("GetAllVirtualDirectoriesAsync: owa={O} ecp={E} eas={A} ews={W} oab={B} ps={P} rpc={R} mapi={M}",
                allOwa.Count, allEcp.Count, allEas.Count, allEws.Count, allOab.Count, allPs.Count, allRpc.Count, allMapi.Count);

            return new Dictionary<string, List<Dictionary<string, object>>>
            {
                ["owa"]        = allOwa,
                ["ecp"]        = allEcp,
                ["eas"]        = allEas,
                ["ews"]        = allEws,
                ["oab"]        = allOab,
                ["powershell"] = allPs,
                ["rpc"]        = allRpc,
                ["mapi"]       = allMapi,
            };
        }

        // ============================================================================
        // Répertoires Virtuels - OWA
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetOwaVirtualDirectoriesAsync(string? server = null)
        {
            _logger.LogInformation("Récupération des répertoires virtuels OWA");
            var srvParam = !string.IsNullOrEmpty(server) ? $"-Server '{server.Replace("'", "''")}'" : "";

            var script = $@"
                Get-OwaVirtualDirectory {srvParam} | Select-Object Identity, Name, Server, InternalUrl, ExternalUrl, BasicAuthentication, FormsAuthentication, WindowsAuthentication, DigestAuthentication, OAuthAuthentication, LiveIdNegotiate, LogonFormat, DefaultDomain, RedirectToOptimalOWAServer
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task UpdateOwaVirtualDirectoryAsync(string identity, string? internalUrl, string? externalUrl,
            bool? basicAuthentication = null, bool? formsAuthentication = null,
            bool? windowsAuthentication = null, bool? digestAuthentication = null,
            bool? oauthAuthentication = null, string? logonFormat = null,
            string? defaultDomain = null, bool? redirectToOptimalOwa = null)
        {
            _logger.LogInformation("Mise à jour du répertoire virtuel OWA {Identity}", identity);
            var id = identity.Replace("'", "''");
            var parts = new List<string> { $"Set-OwaVirtualDirectory -Identity '{id}'" };
            if (!string.IsNullOrEmpty(internalUrl)) parts.Add($"-InternalUrl '{internalUrl.Replace("'", "''")}'");
            if (!string.IsNullOrEmpty(externalUrl)) parts.Add($"-ExternalUrl '{externalUrl.Replace("'", "''")}'");
            if (basicAuthentication.HasValue) parts.Add($"-BasicAuthentication ${basicAuthentication.Value.ToString().ToLower()}");
            if (formsAuthentication.HasValue) parts.Add($"-FormsAuthentication ${formsAuthentication.Value.ToString().ToLower()}");
            if (windowsAuthentication.HasValue) parts.Add($"-WindowsAuthentication ${windowsAuthentication.Value.ToString().ToLower()}");
            if (digestAuthentication.HasValue) parts.Add($"-DigestAuthentication ${digestAuthentication.Value.ToString().ToLower()}");
            if (oauthAuthentication.HasValue) parts.Add($"-OAuthAuthentication ${oauthAuthentication.Value.ToString().ToLower()}");
            if (!string.IsNullOrEmpty(logonFormat)) parts.Add($"-LogonFormat {logonFormat}");
            if (defaultDomain != null) parts.Add($"-DefaultDomain '{defaultDomain.Replace("'", "''")}'");
            if (redirectToOptimalOwa.HasValue) parts.Add($"-RedirectToOptimalOWAServer ${redirectToOptimalOwa.Value.ToString().ToLower()}");
            if (parts.Count > 1) await _psService.ExecuteScriptAsync(string.Join(" ", parts));
        }

        // ============================================================================
        // Répertoires Virtuels - ECP
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetEcpVirtualDirectoriesAsync(string? server = null)
        {
            _logger.LogInformation("Récupération des répertoires virtuels ECP");
            var srvParam = !string.IsNullOrEmpty(server) ? $"-Server '{server.Replace("'", "''")}'" : "";

            var script = $@"
                Get-EcpVirtualDirectory {srvParam} | Select-Object Identity, Name, Server, InternalUrl, ExternalUrl, BasicAuthentication, FormsAuthentication, WindowsAuthentication, DigestAuthentication, OAuthAuthentication, DefaultDomain
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task UpdateEcpVirtualDirectoryAsync(string identity, string? internalUrl, string? externalUrl,
            bool? basicAuthentication = null, bool? formsAuthentication = null,
            bool? windowsAuthentication = null, bool? digestAuthentication = null,
            bool? oauthAuthentication = null, string? defaultDomain = null)
        {
            _logger.LogInformation("Mise à jour du répertoire virtuel ECP {Identity}", identity);
            var id = identity.Replace("'", "''");
            var parts = new List<string> { $"Set-EcpVirtualDirectory -Identity '{id}'" };
            if (!string.IsNullOrEmpty(internalUrl)) parts.Add($"-InternalUrl '{internalUrl.Replace("'", "''")}'");
            if (!string.IsNullOrEmpty(externalUrl)) parts.Add($"-ExternalUrl '{externalUrl.Replace("'", "''")}'");
            if (basicAuthentication.HasValue) parts.Add($"-BasicAuthentication ${basicAuthentication.Value.ToString().ToLower()}");
            if (formsAuthentication.HasValue) parts.Add($"-FormsAuthentication ${formsAuthentication.Value.ToString().ToLower()}");
            if (windowsAuthentication.HasValue) parts.Add($"-WindowsAuthentication ${windowsAuthentication.Value.ToString().ToLower()}");
            if (digestAuthentication.HasValue) parts.Add($"-DigestAuthentication ${digestAuthentication.Value.ToString().ToLower()}");
            if (oauthAuthentication.HasValue) parts.Add($"-OAuthAuthentication ${oauthAuthentication.Value.ToString().ToLower()}");
            if (defaultDomain != null) parts.Add($"-DefaultDomain '{defaultDomain.Replace("'", "''")}'");
            if (parts.Count > 1) await _psService.ExecuteScriptAsync(string.Join(" ", parts));
        }

        // ============================================================================
        // Répertoires Virtuels - ActiveSync (EAS)
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetActiveSyncVirtualDirectoriesAsync(string? server = null)
        {
            _logger.LogInformation("Récupération des répertoires virtuels ActiveSync");
            var srvParam = !string.IsNullOrEmpty(server) ? $"-Server '{server.Replace("'", "''")}'" : "";

            var script = $@"
                Get-ActiveSyncVirtualDirectory {srvParam} | Select-Object Identity, Name, Server, InternalUrl, ExternalUrl, BasicAuthEnabled, WindowsAuthEnabled, CertificateAuthentication
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task UpdateActiveSyncVirtualDirectoryAsync(string identity, string? internalUrl, string? externalUrl,
            bool? basicAuthEnabled = null, bool? windowsAuthEnabled = null)
        {
            _logger.LogInformation("Mise à jour du répertoire virtuel ActiveSync {Identity}", identity);

            var id = identity.Replace("'", "''");
            var parts = new List<string> { $"Set-ActiveSyncVirtualDirectory -Identity '{id}'" };

            if (!string.IsNullOrEmpty(internalUrl))
                parts.Add($"-InternalUrl '{internalUrl.Replace("'", "''")}'");
            if (!string.IsNullOrEmpty(externalUrl))
                parts.Add($"-ExternalUrl '{externalUrl.Replace("'", "''")}'");
            if (basicAuthEnabled.HasValue)
                parts.Add($"-BasicAuthEnabled ${basicAuthEnabled.Value.ToString().ToLower()}");
            if (windowsAuthEnabled.HasValue)
                parts.Add($"-WindowsAuthEnabled ${windowsAuthEnabled.Value.ToString().ToLower()}");

            if (parts.Count > 1)
                await _psService.ExecuteScriptAsync(string.Join(" ", parts));
        }

        // ============================================================================
        // Répertoires Virtuels - Exchange Web Services (EWS)
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetWebServicesVirtualDirectoriesAsync(string? server = null)
        {
            _logger.LogInformation("Récupération des répertoires virtuels EWS");
            var srvParam = !string.IsNullOrEmpty(server) ? $"-Server '{server.Replace("'", "''")}'" : "";

            var script = $@"
                Get-WebServicesVirtualDirectory {srvParam} | Select-Object Identity, Name, Server, InternalUrl, ExternalUrl, BasicAuthentication, WindowsAuthentication, DigestAuthentication, OAuthAuthentication, MRSProxyEnabled
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task UpdateWebServicesVirtualDirectoryAsync(string identity, string? internalUrl, string? externalUrl,
            bool? basicAuthentication = null, bool? windowsAuthentication = null,
            bool? digestAuthentication = null, bool? oauthAuthentication = null, bool? mrsProxyEnabled = null)
        {
            _logger.LogInformation("Mise à jour du répertoire virtuel EWS {Identity}", identity);
            var id = identity.Replace("'", "''");
            var parts = new List<string> { $"Set-WebServicesVirtualDirectory -Identity '{id}'" };
            if (!string.IsNullOrEmpty(internalUrl)) parts.Add($"-InternalUrl '{internalUrl.Replace("'", "''")}'");
            if (!string.IsNullOrEmpty(externalUrl)) parts.Add($"-ExternalUrl '{externalUrl.Replace("'", "''")}'");
            if (basicAuthentication.HasValue) parts.Add($"-BasicAuthentication ${basicAuthentication.Value.ToString().ToLower()}");
            if (windowsAuthentication.HasValue) parts.Add($"-WindowsAuthentication ${windowsAuthentication.Value.ToString().ToLower()}");
            if (digestAuthentication.HasValue) parts.Add($"-DigestAuthentication ${digestAuthentication.Value.ToString().ToLower()}");
            if (oauthAuthentication.HasValue) parts.Add($"-OAuthAuthentication ${oauthAuthentication.Value.ToString().ToLower()}");
            if (mrsProxyEnabled.HasValue) parts.Add($"-MRSProxyEnabled ${mrsProxyEnabled.Value.ToString().ToLower()}");
            if (parts.Count > 1) await _psService.ExecuteScriptAsync(string.Join(" ", parts));
        }

        // ============================================================================
        // Répertoires Virtuels - Offline Address Book (OAB)
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetOabVirtualDirectoriesAsync(string? server = null)
        {
            _logger.LogInformation("Récupération des répertoires virtuels OAB");
            var srvParam = !string.IsNullOrEmpty(server) ? $"-Server '{server.Replace("'", "''")}'" : "";

            var script = $@"
                Get-OabVirtualDirectory {srvParam} | Select-Object Identity, Name, Server, InternalUrl, ExternalUrl, BasicAuthentication, WindowsAuthentication, DigestAuthentication, RequireSSL, PollInterval
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task UpdateOabVirtualDirectoryAsync(string identity, string? internalUrl, string? externalUrl,
            bool? basicAuthentication = null, bool? windowsAuthentication = null,
            bool? digestAuthentication = null, bool? requireSsl = null, int? pollInterval = null)
        {
            _logger.LogInformation("Mise à jour du répertoire virtuel OAB {Identity}", identity);
            var id = identity.Replace("'", "''");
            var parts = new List<string> { $"Set-OabVirtualDirectory -Identity '{id}'" };
            if (!string.IsNullOrEmpty(internalUrl)) parts.Add($"-InternalUrl '{internalUrl.Replace("'", "''")}'");
            if (!string.IsNullOrEmpty(externalUrl)) parts.Add($"-ExternalUrl '{externalUrl.Replace("'", "''")}'");
            if (basicAuthentication.HasValue) parts.Add($"-BasicAuthentication ${basicAuthentication.Value.ToString().ToLower()}");
            if (windowsAuthentication.HasValue) parts.Add($"-WindowsAuthentication ${windowsAuthentication.Value.ToString().ToLower()}");
            if (digestAuthentication.HasValue) parts.Add($"-DigestAuthentication ${digestAuthentication.Value.ToString().ToLower()}");
            if (requireSsl.HasValue) parts.Add($"-RequireSSL ${requireSsl.Value.ToString().ToLower()}");
            if (pollInterval.HasValue) parts.Add($"-PollInterval {pollInterval.Value}");
            if (parts.Count > 1) await _psService.ExecuteScriptAsync(string.Join(" ", parts));
        }

        // ============================================================================
        // Répertoires Virtuels - PowerShell
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetPowerShellVirtualDirectoriesAsync(string? server = null)
        {
            _logger.LogInformation("Récupération des répertoires virtuels PowerShell");
            var srvParam = !string.IsNullOrEmpty(server) ? $"-Server '{server.Replace("'", "''")}'" : "";
            var script = $@"
                Get-PowerShellVirtualDirectory {srvParam} | Select-Object Identity, Name, Server, InternalUrl, ExternalUrl, BasicAuthentication, WindowsAuthentication, CertificateAuthentication, RequireSSL
            ";
            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task UpdatePowerShellVirtualDirectoryAsync(string identity, string? internalUrl, string? externalUrl,
            bool? basicAuthentication = null, bool? windowsAuthentication = null,
            bool? requireSsl = null, bool? certificateAuthentication = null)
        {
            _logger.LogInformation("Mise à jour du répertoire virtuel PowerShell {Identity}", identity);
            var id = identity.Replace("'", "''");
            var parts = new List<string> { $"Set-PowerShellVirtualDirectory -Identity '{id}'" };
            if (!string.IsNullOrEmpty(internalUrl)) parts.Add($"-InternalUrl '{internalUrl.Replace("'", "''")}'");
            if (!string.IsNullOrEmpty(externalUrl)) parts.Add($"-ExternalUrl '{externalUrl.Replace("'", "''")}'");
            if (basicAuthentication.HasValue) parts.Add($"-BasicAuthentication ${basicAuthentication.Value.ToString().ToLower()}");
            if (windowsAuthentication.HasValue) parts.Add($"-WindowsAuthentication ${windowsAuthentication.Value.ToString().ToLower()}");
            if (requireSsl.HasValue) parts.Add($"-RequireSSL ${requireSsl.Value.ToString().ToLower()}");
            if (certificateAuthentication.HasValue) parts.Add($"-CertificateAuthentication ${certificateAuthentication.Value.ToString().ToLower()}");
            if (parts.Count > 1) await _psService.ExecuteScriptAsync(string.Join(" ", parts));
        }

        // ============================================================================
        // Outlook Anywhere (RPC over HTTP)
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetOutlookAnywhereAsync()
        {
            _logger.LogInformation("Récupération de la configuration Outlook Anywhere");
            var script = @"
                Get-OutlookAnywhere | Select-Object Identity, Server, InternalHostname, ExternalHostname,
                    ExternalClientAuthenticationMethod, InternalClientAuthenticationMethod,
                    InternalClientsRequireSsl, ExternalClientsRequireSsl, IISAuthenticationMethods
            ";
            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task SetOutlookAnywhereAsync(string identity, string? externalHostname, string? internalHostname,
            string? externalClientAuthMethod, string? internalClientAuthMethod,
            bool? externalClientsRequireSsl, bool? internalClientsRequireSsl, string[]? iisAuthMethods)
        {
            _logger.LogInformation("Mise à jour Outlook Anywhere {Identity}", identity);
            var id = identity.Replace("'", "''");
            var parts = new List<string> { $"Set-OutlookAnywhere -Identity '{id}'" };
            if (!string.IsNullOrWhiteSpace(externalHostname))
                parts.Add($"-ExternalHostname '{externalHostname.Replace("'", "''")}'" );
            if (!string.IsNullOrWhiteSpace(internalHostname))
                parts.Add($"-InternalHostname '{internalHostname.Replace("'", "''")}'" );
            if (!string.IsNullOrWhiteSpace(externalClientAuthMethod))
                parts.Add($"-ExternalClientAuthenticationMethod {externalClientAuthMethod}");
            if (!string.IsNullOrWhiteSpace(internalClientAuthMethod))
                parts.Add($"-InternalClientAuthenticationMethod {internalClientAuthMethod}");
            if (externalClientsRequireSsl.HasValue)
                parts.Add($"-ExternalClientsRequireSsl ${externalClientsRequireSsl.Value.ToString().ToLower()}");
            if (internalClientsRequireSsl.HasValue)
                parts.Add($"-InternalClientsRequireSsl ${internalClientsRequireSsl.Value.ToString().ToLower()}");
            if (iisAuthMethods != null && iisAuthMethods.Length > 0)
                parts.Add($"-IISAuthenticationMethods {string.Join(",", iisAuthMethods)}");
            if (parts.Count > 1) await _psService.ExecuteScriptAsync(string.Join(" ", parts));
        }

        public async Task EnableOutlookAnywhereAsync(string server, string externalHostname, string clientAuthMethod, bool sslOffloading)
        {
            _logger.LogInformation("Activation d'Outlook Anywhere sur {Server}", server);
            var script = $"Enable-OutlookAnywhere -Server '{server.Replace("'", "''")}' " +
                         $"-ExternalHostname '{externalHostname.Replace("'", "''")}' " +
                         $"-ClientAuthenticationMethod {clientAuthMethod} " +
                         $"-SSLOffloading ${sslOffloading.ToString().ToLower()} -Confirm:$false";
            await _psService.ExecuteScriptAsync(script);
        }

        public async Task SetMapiVirtualDirectoryAsync(string identity, string? internalUrl, string? externalUrl)
        {
            _logger.LogInformation("Mise à jour MAPI VirtualDirectory {Identity}", identity);
            var id = identity.Replace("'", "''");
            var parts = new List<string> { $"Set-MapiVirtualDirectory -Identity '{id}'" };
            if (!string.IsNullOrEmpty(internalUrl)) parts.Add($"-InternalUrl '{internalUrl.Replace("'", "''")}'");
            if (!string.IsNullOrEmpty(externalUrl))  parts.Add($"-ExternalUrl '{externalUrl.Replace("'", "''")}'");
            // Note: MapiHttpEnabled n'est pas un paramètre de Set-MapiVirtualDirectory.
            // Il s'active via Set-OrganizationConfig -MapiHttpEnabled $true
            if (parts.Count > 1) await _psService.ExecuteScriptAsync(string.Join(" ", parts));
        }

        // ============================================================================
        // Connecteurs de réception
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetReceiveConnectorsAsync(string? server = null)
        {
            _logger.LogInformation("Récupération des connecteurs de réception (serveur: {Server})", server ?? "tous");
            var srvParam = !string.IsNullOrEmpty(server) ? $"-Server '{server.Replace("'", "''")}' " : "";

            var script = $@"
                Get-ReceiveConnector {srvParam}| Select-Object Identity, Server, Enabled, MaxMessageSize, AuthMechanism, Bindings, RemoteIPRanges, RequireEHLODomain, SuppressXAnonymousTls, Fqdn
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task CreateReceiveConnectorAsync(string name, string server, string[] bindings, string[]? remoteIPRanges, int? maxMessageSizeMB, bool enabled, string[]? authMechanism, string? fqdn)
        {
            _logger.LogInformation("Création du connecteur de réception {Name}", name);

            var bindingsStr = string.Join(",", bindings.Select(b => $"'{b}'"));
            var remoteIPStr = remoteIPRanges != null && remoteIPRanges.Length > 0 
                ? string.Join(",", remoteIPRanges.Select(ip => $"'{ip}'")) 
                : "'0.0.0.0-255.255.255.255'";

            var script = $@"
                New-ReceiveConnector -Name '{name.Replace("'", "''")}' -Server '{server.Replace("'", "''")}' -Bindings {bindingsStr} -RemoteIPRanges {remoteIPStr} -Enabled ${enabled.ToString().ToLower()}
            ";

            // Paramètres Set-ReceiveConnector post-création
            var setParts = new List<string>();
            if (maxMessageSizeMB.HasValue)
                setParts.Add($"-MaxMessageSize {maxMessageSizeMB.Value}MB");
            if (authMechanism != null && authMechanism.Length > 0)
                setParts.Add($"-AuthMechanism {string.Join(",", authMechanism)}");
            if (!string.IsNullOrWhiteSpace(fqdn))
                setParts.Add($"-Fqdn '{fqdn.Replace("'", "''")}'");
            if (setParts.Count > 0)
                script += $"\nSet-ReceiveConnector -Identity '{name.Replace("'", "''")}' {string.Join(" ", setParts)}";

            await _psService.ExecuteScriptAsync(script);
        }

        public async Task UpdateReceiveConnectorAsync(string identity, string[]? bindings, string[]? remoteIPRanges, int? maxMessageSizeMB, bool? enabled, string[]? authMechanism, string? fqdn)
        {
            _logger.LogInformation("Mise à jour du connecteur de réception {Identity}", identity);

            var parts = new List<string>();
            if (bindings != null && bindings.Length > 0)
                parts.Add($"-Bindings {string.Join(",", bindings.Select(b => $"'{b}'"))}");
            if (remoteIPRanges != null && remoteIPRanges.Length > 0)
                parts.Add($"-RemoteIPRanges {string.Join(",", remoteIPRanges.Select(ip => $"'{ip}'"))}");
            if (maxMessageSizeMB.HasValue)
                parts.Add($"-MaxMessageSize {maxMessageSizeMB.Value}MB");
            if (enabled.HasValue)
                parts.Add($"-Enabled ${enabled.Value.ToString().ToLower()}");
            if (authMechanism != null && authMechanism.Length > 0)
                parts.Add($"-AuthMechanism {string.Join(",", authMechanism)}");
            if (!string.IsNullOrWhiteSpace(fqdn))
                parts.Add($"-Fqdn '{fqdn.Replace("'", "''")}'");

            if (parts.Count == 0) return;

            var script = $"Set-ReceiveConnector -Identity '{identity.Replace("'", "''")}' {string.Join(" ", parts)}";
            await _psService.ExecuteScriptAsync(script);
        }

        public async Task DeleteReceiveConnectorAsync(string identity)
        {
            _logger.LogInformation("Suppression du connecteur de réception {Identity}", identity);

            var script = $@"
                Remove-ReceiveConnector -Identity '{identity.Replace("'", "''")}' -Confirm:$false
            ";

            await _psService.ExecuteScriptAsync(script);
        }

        // ============================================================================
        // Connecteurs d'envoi
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetSendConnectorsAsync()
        {
            _logger.LogInformation("Récupération des connecteurs d'envoi");

            var script = @"
                Get-SendConnector | Select-Object Identity, Enabled, MaxMessageSize, RequireTLS, TlsAuthLevel, TlsDomain, SmartHosts, AddressSpaces, Fqdn
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task CreateSendConnectorAsync(string name, string[] smartHosts, string[]? addressSpaces, int? maxMessageSizeMB, bool enabled, bool requireTls, string? tlsAuthLevel, string? tlsDomain, string? fqdn)
        {
            _logger.LogInformation("Création du connecteur d'envoi {Name}", name);

            var smartHostsStr = string.Join(",", smartHosts.Select(h => $"'{h}'"));
            var addressSpacesStr = addressSpaces != null && addressSpaces.Length > 0 
                ? string.Join(",", addressSpaces.Select(a => $"'{a}'")) 
                : "'*'";

            var script = $@"
                New-SendConnector -Name '{name.Replace("'", "''")}' -AddressSpaces {addressSpacesStr} -SmartHosts {smartHostsStr} -Enabled ${enabled.ToString().ToLower()}
            ";

            // Paramètres Set-SendConnector post-création
            var setParts = new List<string>();
            if (maxMessageSizeMB.HasValue)
                setParts.Add($"-MaxMessageSize {maxMessageSizeMB.Value}MB");
            if (requireTls)
                setParts.Add("-RequireTLS $true");
            if (!string.IsNullOrWhiteSpace(tlsAuthLevel))
                setParts.Add($"-TlsAuthLevel {tlsAuthLevel}");
            if (!string.IsNullOrWhiteSpace(tlsDomain))
                setParts.Add($"-TlsDomain '{tlsDomain.Replace("'", "''")}'");
            if (!string.IsNullOrWhiteSpace(fqdn))
                setParts.Add($"-Fqdn '{fqdn.Replace("'", "''")}'");
            if (setParts.Count > 0)
                script += $"\nSet-SendConnector -Identity '{name.Replace("'", "''")}' {string.Join(" ", setParts)}";

            await _psService.ExecuteScriptAsync(script);
        }

        public async Task UpdateSendConnectorAsync(string identity, string[]? smartHosts, string[]? addressSpaces, int? maxMessageSizeMB, bool? enabled, bool? requireTls, string? tlsAuthLevel, string? tlsDomain, string? fqdn)
        {
            _logger.LogInformation("Mise à jour du connecteur d'envoi {Identity}", identity);

            var parts = new List<string>();
            if (smartHosts != null && smartHosts.Length > 0)
                parts.Add($"-SmartHosts {string.Join(",", smartHosts.Select(h => $"'{h}'"))}");
            if (addressSpaces != null && addressSpaces.Length > 0)
                parts.Add($"-AddressSpaces {string.Join(",", addressSpaces.Select(a => $"'{a}'"))}");
            if (maxMessageSizeMB.HasValue)
                parts.Add($"-MaxMessageSize {maxMessageSizeMB.Value}MB");
            if (enabled.HasValue)
                parts.Add($"-Enabled ${enabled.Value.ToString().ToLower()}");
            if (requireTls.HasValue)
                parts.Add($"-RequireTLS ${requireTls.Value.ToString().ToLower()}");
            if (!string.IsNullOrWhiteSpace(tlsAuthLevel))
                parts.Add($"-TlsAuthLevel {tlsAuthLevel}");
            if (!string.IsNullOrWhiteSpace(tlsDomain))
                parts.Add($"-TlsDomain '{tlsDomain.Replace("'", "''")}'");
            if (!string.IsNullOrWhiteSpace(fqdn))
                parts.Add($"-Fqdn '{fqdn.Replace("'", "''")}'");

            if (parts.Count == 0) return;

            var script = $"Set-SendConnector -Identity '{identity.Replace("'", "''")}' {string.Join(" ", parts)}";
            await _psService.ExecuteScriptAsync(script);
        }

        public async Task DeleteSendConnectorAsync(string identity)
        {
            _logger.LogInformation("Suppression du connecteur d'envoi {Identity}", identity);

            var script = $@"
                Remove-SendConnector -Identity '{identity.Replace("'", "''")}' -Confirm:$false
            ";

            await _psService.ExecuteScriptAsync(script);
        }

        // ============================================================================
        // Certificats Exchange
        // ============================================================================

        public async Task<List<Dictionary<string, object>>> GetExchangeCertificatesAsync()
        {
            _logger.LogInformation("Récupération des certificats Exchange");

            var script = @"
                Get-ExchangeCertificate | Select-Object Thumbprint, Subject, Issuer, NotAfter, Services, Status, FriendlyName
            ";

            var result = await _psService.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> dictList ? dictList : new List<Dictionary<string, object>>();
        }

        public async Task EnableCertificateForSmtpAsync(string thumbprint)
        {
            _logger.LogInformation("Activation du certificat {Thumbprint} pour SMTP", thumbprint);

            var script = $"Enable-ExchangeCertificate -Thumbprint '{thumbprint.Replace("'", "''")}' -Services SMTP -Force";
            await _psService.ExecuteScriptAsync(script);
        }
    }
}
