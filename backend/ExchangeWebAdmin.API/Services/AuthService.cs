using System.IdentityModel.Tokens.Jwt;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Security;
using System.Security.Claims;
using System.Text;
using ExchangeWebAdmin.API.Models;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ExchangeWebAdmin.API.Services;

public interface IAuthService
{
    /// <summary>
    /// Valide les credentials en tentant une vraie PSSession Exchange.
    /// Fonctionne sans que la machine backend soit membre du domaine AD.
    /// </summary>
    Task<AuthResponse?> LoginAsync(string username, string password, string domain, ExchangeInfrastructure infra);

    /// <summary>Génère un JWT pour un utilisateur déjà authentifié (SSO Negotiate).</summary>
    AuthResponse CreateSsoResponse(string windowsIdentity);
}

public class AuthService : IAuthService
{
    private readonly JwtSettings _jwt;
    private readonly ILogger<AuthService> _logger;

    public AuthService(IOptions<JwtSettings> jwt, ILogger<AuthService> logger)
    {
        _jwt    = jwt.Value;
        _logger = logger;
    }

    public async Task<AuthResponse?> LoginAsync(string username, string password, string domain, ExchangeInfrastructure infra)
    {
        return await Task.Run(() =>
        {
            // Normaliser le format : accepte "DOMAIN\user", "user@domain.com" ou user + domain séparés
            string resolvedDomain = domain.Trim();
            string resolvedUser   = username.Trim();

            if (username.Contains('\\'))
            {
                var parts = username.Split('\\', 2);
                resolvedDomain = parts[0].Trim();
                resolvedUser   = parts[1].Trim();
            }
            else if (username.Contains('@'))
            {
                var parts = username.Split('@', 2);
                resolvedUser   = parts[0].Trim();
                resolvedDomain = parts[1].Split('.')[0].ToUpperInvariant();
            }

            _logger.LogInformation("Tentative de connexion: {Domain}\\{User} → {Uri}",
                resolvedDomain, resolvedUser, infra.ConnectionUri);

            // Construire le PSCredential (pas besoin d'être membre du domaine)
            var securePassword = new SecureString();
            foreach (char c in password) securePassword.AppendChar(c);
            securePassword.MakeReadOnly();

            string credUsername = string.IsNullOrEmpty(resolvedDomain)
                ? resolvedUser
                : $"{resolvedDomain}\\{resolvedUser}";

            var psCred = new PSCredential(credUsername, securePassword);

            // Tester les credentials en ouvrant directement un runspace distant Exchange (WSMan)
            // Pas de snap-in local charge, fonctionne sans etre membre du domaine
            var authMechanism = infra.Authentication.ToLowerInvariant() switch
            {
                "basic"     => AuthenticationMechanism.Basic,
                "kerberos"  => AuthenticationMechanism.Kerberos,
                "negotiate" => AuthenticationMechanism.Negotiate,
                _           => AuthenticationMechanism.Basic
            };

            var connInfo = new WSManConnectionInfo(new Uri(infra.ConnectionUri), infra.ConfigurationName, psCred)
            {
                AuthenticationMechanism = authMechanism,
                OperationTimeout        = (int)TimeSpan.FromSeconds(30).TotalMilliseconds,
                OpenTimeout             = (int)TimeSpan.FromSeconds(20).TotalMilliseconds,
                SkipCACheck             = true,
                SkipCNCheck             = true,
                SkipRevocationCheck     = true,
            };

            Runspace? testRunspace = null;
            try
            {
                testRunspace = RunspaceFactory.CreateRunspace(connInfo);
                testRunspace.Open(); // Si echec credentials -> exception ici
                _logger.LogInformation("Authentification Exchange reussie: {Domain}\\{User}", resolvedDomain, resolvedUser);
                return BuildResponse(resolvedUser, resolvedUser, resolvedDomain, "Credentials");
            }
            catch (Exception ex)
            {
                var msg = ex.Message;
                bool isInvalidCred = msg.Contains("Access is denied",     StringComparison.OrdinalIgnoreCase)
                                  || msg.Contains("401",                  StringComparison.Ordinal)
                                  || msg.Contains("Logon failure",        StringComparison.OrdinalIgnoreCase)
                                  || msg.Contains("unauthorized",         StringComparison.OrdinalIgnoreCase)
                                  || msg.Contains("AuthenticationFailed", StringComparison.OrdinalIgnoreCase)
                                  || msg.Contains("WinRM",                StringComparison.OrdinalIgnoreCase);

                _logger.LogWarning("Echec connexion Exchange: {Domain}\\{User} — {Error}", resolvedDomain, resolvedUser, msg);

                throw new UnauthorizedAccessException(
                    isInvalidCred ? "Nom d'utilisateur ou mot de passe incorrect." : $"Connexion Exchange refusee : {msg}");
            }
            finally
            {
                try { testRunspace?.Dispose(); } catch { }
            }
        });
    }

    public AuthResponse CreateSsoResponse(string windowsIdentity)
    {
        // windowsIdentity format depuis Negotiate: "DOMAIN\username"
        string domain   = string.Empty;
        string username = windowsIdentity;

        if (windowsIdentity.Contains('\\'))
        {
            var parts = windowsIdentity.Split('\\', 2);
            domain   = parts[0];
            username = parts[1];
        }

        return BuildResponse(username, username, domain, "SSO");
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private AuthResponse BuildResponse(string username, string displayName, string domain, string method)
    {
        var expiry = DateTime.UtcNow.AddHours(_jwt.ExpirationHours);
        var token  = GenerateJwt(username, displayName, domain, method, expiry);

        return new AuthResponse
        {
            Token       = token,
            Username    = username,
            DisplayName = displayName,
            Domain      = domain,
            ExpiresAt   = expiry,
            AuthMethod  = method
        };
    }

    private string GenerateJwt(string username, string displayName, string domain,
        string method, DateTime expiry)
    {
        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SecretKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.Name,       username),
            new Claim(ClaimTypes.GivenName,  displayName),
            new Claim("domain",              domain),
            new Claim("authMethod",          method),
            new Claim(JwtRegisteredClaimNames.Sub, $"{domain}\\{username}"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            issuer:            _jwt.Issuer,
            audience:          _jwt.Audience,
            claims:            claims,
            expires:           expiry,
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

