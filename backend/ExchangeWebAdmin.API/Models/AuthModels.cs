namespace ExchangeWebAdmin.API.Models;

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    /// <summary>
    /// Domaine AD, ex: "PROPHANE" ou "TLS-LAB". Si vide, tenté depuis Username (DOMAIN\user).
    /// </summary>
    public string Domain { get; set; } = string.Empty;
    /// <summary>
    /// Identifiant de l'infrastructure Exchange cible (défini dans appsettings ExchangeInfrastructures).
    /// Si vide, la première infra configurée est utilisée.
    /// </summary>
    public string InfrastructureId { get; set; } = string.Empty;
}

public class AuthResponse
{
    public string Token { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string AuthMethod { get; set; } = string.Empty; // "SSO" | "Credentials"
    public string InfrastructureId    { get; set; } = string.Empty;
    public string InfrastructureLabel { get; set; } = string.Empty;
    public string InfrastructureVersion { get; set; } = string.Empty;
    public string ServerFqdn          { get; set; } = string.Empty;
}

public class UserInfo
{
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string AuthMethod { get; set; } = string.Empty;
    public DateTime TokenExpiresAt { get; set; }
}

public class JwtSettings
{
    public string SecretKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = "ExchangeWebAdmin";
    public string Audience { get; set; } = "ExchangeWebAdminUI";
    public int ExpirationHours { get; set; } = 8;
}
