using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Security;
using Microsoft.Extensions.Options;
using ExchangeWebAdmin.API.Models;

namespace ExchangeWebAdmin.API.Services;

public interface IPowerShellService
{
    Task<object> ExecuteScriptAsync(string script, IDictionary<string, object>? parameters = null);
    Task<object> TestConnectionAsync();
    Task<List<Dictionary<string, object>>> ExecuteVirtualDirectoriesAsync(string? server, bool adPropertiesOnly);

    void SetInfrastructure(ExchangeInfrastructure infra);
    void SetCredentials(string domain, string username, string password);
    ExchangeInfrastructure? GetCurrentInfrastructure();
    PSCredential? GetCredential();
}

/// <summary>
/// Service PowerShell optimisé - UNE SEULE SESSION RÉUTILISÉE
/// </summary>
public class PowerShellService : IPowerShellService, IDisposable
{
    private readonly ILogger<PowerShellService> _logger;
    private readonly ExchangeSettings _settings;
    private readonly CmdletLogService _cmdletLog;
    private PowerShell? _ps;
    private Runspace? _remoteRunspace;
    private bool _isInitialized = false;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private readonly SemaphoreSlim _executionLock = new(1, 1);

    // Infra et credentials actifs (définis après login)
    private ExchangeInfrastructure? _currentInfra;
    private PSCredential? _credential;

    public PowerShellService(
        ILogger<PowerShellService> logger,
        IOptions<ExchangeSettings> settings,
        CmdletLogService cmdletLog)
    {
        _logger = logger;
        _settings = settings.Value;
        _cmdletLog = cmdletLog;
    }

    // ── Gestion infra / credentials ──────────────────────────────────────────

    public void SetInfrastructure(ExchangeInfrastructure infra)
    {
        _currentInfra = infra;
        ResetSession();
    }

    public void SetCredentials(string domain, string username, string password)
    {
        var securePassword = new SecureString();
        foreach (char c in password) securePassword.AppendChar(c);
        securePassword.MakeReadOnly();

        string credUsername = string.IsNullOrEmpty(domain) ? username : $"{domain}\\{username}";
        _credential = new PSCredential(credUsername, securePassword);
        ResetSession();
    }

    public ExchangeInfrastructure? GetCurrentInfrastructure() => _currentInfra;
    public PSCredential? GetCredential() => _credential;

    private void ResetSession()
    {
        _initLock.Wait();
        try
        {
            _isInitialized = false;
            try { _ps?.Dispose(); } catch { }
            try { _remoteRunspace?.Dispose(); } catch { }
            _ps = null;
            _remoteRunspace = null;
        }
        finally { _initLock.Release(); }
    }

    private async Task InitializeAsync()
    {
        if (_isInitialized) return;

        await _initLock.WaitAsync();
        try
        {
            if (_isInitialized) return;

            string connectionUri     = _currentInfra?.ConnectionUri     ?? _settings.ConnectionUri;
            string configurationName = _currentInfra?.ConfigurationName ?? _settings.ConfigurationName;
            string authentication    = _currentInfra?.Authentication    ?? _settings.Authentication;
            string serverFqdn        = _currentInfra?.ServerFqdn        ?? _settings.ServerFqdn;

            if (string.IsNullOrWhiteSpace(connectionUri))
                connectionUri = $"https://{serverFqdn}/PowerShell";

            if (_credential == null)
                throw new UnauthorizedAccessException("SESSION_NOT_INITIALIZED: aucun credential defini. Veuillez vous connecter.");

            _logger.LogInformation("Connexion Exchange distante: {Uri} (auth={Auth})", connectionUri, authentication);

            // Connexion WSMan directe vers Exchange — pas de snap-in local charge
            var authMechanism = authentication.ToLowerInvariant() switch
            {
                "basic"    => AuthenticationMechanism.Basic,
                "kerberos" => AuthenticationMechanism.Kerberos,
                "negotiate"=> AuthenticationMechanism.Negotiate,
                "credssp"  => AuthenticationMechanism.Credssp,
                _          => AuthenticationMechanism.Basic
            };

            var connInfo = new WSManConnectionInfo(new Uri(connectionUri), configurationName, _credential)
            {
                AuthenticationMechanism = authMechanism,
                OperationTimeout        = (int)TimeSpan.FromSeconds(60).TotalMilliseconds,
                OpenTimeout             = (int)TimeSpan.FromSeconds(30).TotalMilliseconds,
                SkipCACheck             = true,
                SkipCNCheck             = true,
                SkipRevocationCheck     = true,
            };

            _remoteRunspace = await Task.Run(() =>
            {
                var rs = RunspaceFactory.CreateRunspace(connInfo);
                rs.Open();
                return rs;
            });

            _ps = PowerShell.Create();
            _ps.Runspace = _remoteRunspace;

            _logger.LogInformation("Session Exchange ouverte sur {Uri}", connectionUri);
            _isInitialized = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur initialisation Exchange");
            throw;
        }
        finally
        {
            _initLock.Release();
        }
    }

    public async Task<object> TestConnectionAsync()
    {
        try
        {
            await InitializeAsync();
            
            await _executionLock.WaitAsync();
            try
            {
                _ps!.Commands.Clear();
                _ps.AddCommand("Get-Mailbox").AddParameter("ResultSize", 1);
                
                var results = await Task.Run(() => _ps.Invoke());
                
                return new
                {
                    success = true,
                    message = "Connexion Exchange active",
                    mailboxCount = results?.Count ?? 0
                };
            }
            finally
            {
                _executionLock.Release();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Test connexion échoué");
            return new
            {
                success = false,
                message = $"Erreur: {ex.Message}"
            };
        }
    }

    public async Task<object> ExecuteScriptAsync(string script, IDictionary<string, object>? parameters = null)
    {
        var logEntry = _cmdletLog.Begin(script);
        Exception? logEx = null;
        try
        {
        await InitializeAsync();

        // UNE SEULE REQUÊTE À LA FOIS pour éviter les conflits
        await _executionLock.WaitAsync();
        try
        {
            _ps!.Commands.Clear();
            // Vider les streams AVANT chaque appel — HadErrors est cumulatif sur
            // la durée de vie du PowerShell et resterait true après la première erreur
            _ps.Streams.Error.Clear();
            _ps.Streams.Warning.Clear();

            // Toujours utiliser le pipeline builder (AddCommand/AddParameter).
            // AddScript() est interdit en NoLanguage (Exchange SE) et inutile ici
            // car toutes nos commandes sont de simples pipelines Exchange.
            BuildPipelineFromScript(_ps, script);

            if (parameters != null)
            {
                foreach (var param in parameters)
                {
                    _ps.AddParameter(param.Key, param.Value);
                }
            }

            var results = await Task.Run(() => _ps.Invoke());

            if (_ps.HadErrors)
            {
                var errors = _ps.Streams.Error.ReadAll();
                var errorMessage = string.Join("; ", errors.Select(e => e.ToString()));

                // Erreurs non-terminantes (ex: avertissements Exchange) : on les logue
                // mais on ne throw QUE si le résultat est vraiment vide (échec fatal)
                if (results == null || results.Count == 0)
                {
                    _logger.LogError("Erreur PowerShell (aucun résultat): {Error}", errorMessage);
                    throw new Exception($"Erreur PowerShell: {errorMessage}");
                }
                else
                {
                    _logger.LogWarning("PowerShell — erreurs non-terminantes ignorées (résultats présents): {Error}", errorMessage);
                }
            }

            // Convertir les résultats PSObject en dictionnaires simples
            var convertedResults = new List<Dictionary<string, object>>();
            
            if (results != null)
            {
                foreach (var result in results)
                {
                    var dict = new Dictionary<string, object>();
                    
                    if (result?.BaseObject != null)
                    {
                        var psObject = PSObject.AsPSObject(result);
                        foreach (var prop in psObject.Properties)
                        {
                            try
                            {
                                if (prop.Value != null)
                                    dict[prop.Name] = FlattenValue(prop.Value);
                            }
                            catch
                            {
                                // Ignorer les propriétés problématiques
                            }
                        }
                    }
                    
                    if (dict.Count > 0)
                    {
                        convertedResults.Add(dict);
                    }
                }
            }

            return convertedResults;
        }
        catch (Exception ex)
        {
            logEx = ex;
            _logger.LogError(ex, "Erreur exécution script PowerShell");
            throw;
        }
        finally
        {
            _executionLock.Release();
        }
        } // end outer try
        finally
        {
            _cmdletLog.Complete(logEntry, logEx);
        }
    }

    // ── Pipeline builder pour NoLanguage mode ────────────────────────────────
    // Convertit "Get-Mailbox -ResultSize 100 | Select-Object Name, Foo"
    // en AddCommand("Get-Mailbox").AddParameter("ResultSize",100)
    //    .AddCommand("Select-Object").AddParameter("Property",["Name","Foo"])

    private static void BuildPipelineFromScript(PowerShell ps, string script)
    {
        var segments = SplitOnPipe(script.Trim());
        bool first = true;
        foreach (var rawSeg in segments)
        {
            var seg = rawSeg.Trim();
            if (string.IsNullOrWhiteSpace(seg)) continue;
            var tokens = TokenizeSegment(seg);
            if (tokens.Count == 0) continue;

            if (first) { ps.AddCommand(tokens[0]); first = false; }
            else        { ps.AddCommand(tokens[0]); }

            ParseAndAddParameters(ps, tokens.Skip(1).ToList());
        }
    }

    private static List<string> SplitOnPipe(string script)
    {
        var segments = new List<string>();
        var sb = new System.Text.StringBuilder();
        bool inSq = false, inDq = false;
        foreach (char c in script)
        {
            if      (c == '\'' && !inDq) inSq = !inSq;
            else if (c == '"' && !inSq)  inDq = !inDq;
            else if (c == '|' && !inSq && !inDq) { segments.Add(sb.ToString()); sb.Clear(); continue; }
            sb.Append(c);
        }
        segments.Add(sb.ToString());
        return segments.Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
    }

    private static List<string> TokenizeSegment(string seg)
    {
        var tokens = new List<string>();
        var sb = new System.Text.StringBuilder();
        bool inSq = false, inDq = false;
        foreach (char c in seg)
        {
            if      (c == '\'' && !inDq) { inSq = !inSq; sb.Append(c); }
            else if (c == '"' && !inSq)  { inDq = !inDq; sb.Append(c); }
            else if (char.IsWhiteSpace(c) && !inSq && !inDq)
            { if (sb.Length > 0) { tokens.Add(sb.ToString()); sb.Clear(); } }
            else sb.Append(c);
        }
        if (sb.Length > 0) tokens.Add(sb.ToString());
        return tokens;
    }

    private static void ParseAndAddParameters(PowerShell ps, List<string> tokens)
    {
        // Si les tokens ne commencent pas par '-', c'est une liste positionnelle
        // (ex: propriétés pour Select-Object)
        if (tokens.Count > 0 && !tokens[0].StartsWith("-"))
        {
            var joined = string.Join(" ", tokens);
            var props = joined.Split(',')
                              .Select(p => p.Trim().Trim('"', '\''))
                              .Where(p => p.Length > 0)
                              .ToArray();
            if (props.Length > 0)
                ps.AddParameter("Property", props);
            return;
        }

        int i = 0;
        while (i < tokens.Count)
        {
            var tok = tokens[i];
            if (!tok.StartsWith("-")) { i++; continue; }
            var paramName = tok.TrimStart('-');

            // Valeur suivante ?
            if (i + 1 < tokens.Count && !tokens[i + 1].StartsWith("-"))
            {
                // Collecter toutes les valeurs jusqu'au prochain paramètre
                var valueParts = new List<string>();
                i++;
                while (i < tokens.Count && !tokens[i].StartsWith("-"))
                { valueParts.Add(tokens[i]); i++; }
                var valueStr = string.Join(" ", valueParts).Trim().TrimEnd(',');
                ps.AddParameter(paramName, ParsePsValue(valueStr));
            }
            else
            {
                // Switch
                ps.AddParameter(paramName);
                i++;
            }
        }
    }

    private static object ParsePsValue(string v)
    {
        if (v.Equals("$true",  StringComparison.OrdinalIgnoreCase)) return true;
        if (v.Equals("$false", StringComparison.OrdinalIgnoreCase)) return false;
        if (v.Equals("$null",  StringComparison.OrdinalIgnoreCase)) return null!;
        if ((v.StartsWith("'") && v.EndsWith("'")) ||
            (v.StartsWith("\"") && v.EndsWith("\"")))
            return v[1..^1];
        if (v.Contains(','))
            return v.Split(',').Select(s => s.Trim().Trim('"','\'')).Where(s => s.Length > 0).ToArray();
        if (int.TryParse(v,  out var iv)) return iv;
        if (long.TryParse(v, out var lv)) return lv;
        return v;
    }

    /// <summary>
    /// Aplatit récursivement une valeur PSObject en types simples sérialisables (string/int/bool/etc.).
    /// Évite les cycles et les profondeurs infinies qui font planter la sérialisation JSON.
    /// </summary>
    private static object FlattenValue(object value, int depth = 0)
    {
        if (depth > 5) return value?.ToString() ?? "";

        // Unwrap PSObject — sauf si le BaseObject est un PSCustomObject scalaire.
        // Sur une session PS distante, Select-Object retourne des PSCustomObject dont
        // PSCustomObject.ToString() = "" mais PSObject.ToString() = la vraie valeur Exchange.
        // Exception : si le BaseObject est une collection (IEnumerable), on l'unwrappe quand même
        // pour que le branch IEnumerable ci-dessous puisse itérer dessus.
        if (value is PSObject psObj)
        {
            var baseObj = psObj.BaseObject;
            if (baseObj == null)
            {
                // rien à faire, on laisse value = PSObject
            }
            else if (baseObj is System.Collections.IEnumerable && baseObj is not string)
            {
                value = baseObj;   // collection → unwrapper pour itérer
            }
            else if (baseObj is not PSCustomObject)
            {
                value = baseObj;   // type .NET réel → unwrapper (string, DateTime, enum, etc.)
            }
            // Sinon (PSCustomObject scalaire) : garder le PSObject pour que nested.ToString()
            // retourne la vraie valeur Exchange (ex: "TLS-EXCHANGE", "2 GB (2,147...)")
        }

        // Types primitifs directement sérialisables → retourner tel quel
        if (value is string || value is bool || value is int || value is long ||
            value is double || value is float || value is decimal ||
            value is DateTime || value is DateTimeOffset || value is Guid)
            return value;

        // Enums .NET → retourner le nom (ex: "Personal", "MoveToArchive")
        if (value is Enum enumVal)
            return enumVal.ToString();

        // Collections (tableau, liste, etc.) → aplatir chaque élément
        if (value is System.Collections.IEnumerable enumerable && value is not string)
        {
            var list = new List<object>();
            foreach (var item in enumerable)
                if (item != null)
                    list.Add(FlattenValue(item, depth + 1));
            return list;
        }

        // PSObject imbriqué : si sa représentation string est "simple" (enum distant,
        // timespan, valeur scalaire désérialisée) → retourner ToString()
        // Sinon, développer en dictionnaire (pour les objets Exchange riches)
        if (value is PSObject nested)
        {
            var str = nested.ToString();
            // Une valeur simple ne contient pas d'accolades ni de points-virgules.
            // PAS de limite de longueur — une Description longue est toujours une chaîne.
            // Seuls les objets Exchange sérialisés ({Key=Val; ...}) contiennent { ou ;
            if (!str.Contains('{') && !str.Contains(';') && str.Length > 0)
                return str;

            var dict = new Dictionary<string, object>();
            foreach (var prop in nested.Properties)
            {
                try { if (prop.Value != null) dict[prop.Name] = FlattenValue(prop.Value, depth + 1); }
                catch { }
            }
            return dict;
        }

        // Fallback : toString
        return value?.ToString() ?? "";
    }

    public async Task<List<Dictionary<string, object>>> ExecuteVirtualDirectoriesAsync(string? server, bool adPropertiesOnly)
    {
        var allResults = new List<Dictionary<string, object>>();

        var cmdlets = new[]
        {
            "Get-OwaVirtualDirectory",
            "Get-EcpVirtualDirectory",
            "Get-ActiveSyncVirtualDirectory",
            "Get-WebServicesVirtualDirectory",
            "Get-OabVirtualDirectory",
            "Get-PowerShellVirtualDirectory",
            "Get-OutlookAnywhere",
            "Get-MapiVirtualDirectory",
        };

        foreach (var cmdlet in cmdlets)
        {
            try
            {
                var sb = new System.Text.StringBuilder(cmdlet);
                if (!string.IsNullOrWhiteSpace(server))
                    sb.Append($" -Server '{server}'");
                if (adPropertiesOnly)
                    sb.Append(" -ADPropertiesOnly");

                var results = await ExecuteScriptAsync(sb.ToString()) as List<Dictionary<string, object>>;
                if (results != null)
                    allResults.AddRange(results);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("ExecuteVirtualDirectoriesAsync: {Cmdlet} a échoué — {Msg}", cmdlet, ex.Message);
            }
        }

        return allResults;
    }

    public void Dispose()
    {
        _logger.LogInformation("Fermeture de la session Exchange...");
        try { _ps?.Dispose(); } catch { }
        try { _remoteRunspace?.Dispose(); } catch { }
        _initLock.Dispose();
        _executionLock.Dispose();
        _logger.LogInformation("Session Exchange fermee.");
    }
}
