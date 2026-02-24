using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using ExchangeWebAdmin.API.Models;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Controllers;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IPowerShellService _psService;
    private readonly IConfiguration _config;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService,
        IPowerShellService psService,
        IConfiguration config,
        ILogger<AuthController> logger)
    {
        _authService = authService;
        _psService   = psService;
        _config      = config;
        _logger      = logger;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>Lit la liste des infrastructures depuis appsettings.json.</summary>
    private List<ExchangeInfrastructure> GetInfrastructures()
        => _config.GetSection("ExchangeInfrastructures")
                  .Get<List<ExchangeInfrastructure>>() ?? [];

    private ExchangeInfrastructure? FindInfra(string? id)
    {
        var list = GetInfrastructures();
        if (string.IsNullOrWhiteSpace(id)) return list.FirstOrDefault();
        return list.FirstOrDefault(i => i.Id.Equals(id, StringComparison.OrdinalIgnoreCase))
               ?? list.FirstOrDefault();
    }

    // ── Endpoints ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne la liste des infrastructures Exchange disponibles (public — utilisé par le login).
    /// </summary>
    [HttpGet("infrastructures")]
    public IActionResult GetInfrastructuresList()
    {
        var list = GetInfrastructures().Select(i => new
        {
            id      = i.Id,
            label   = i.Label,
            version = i.Version,
            server  = i.ServerFqdn,
        });
        return Ok(new { success = true, data = list });
    }

    /// <summary>
    /// Connexion par credentials AD (username + password).
    /// Fonctionne cross-domain via les trusts AD (LogonUser Win32).
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { success = false, error = "Identifiants incomplets." });

        try
        {
            // Résoudre l'infrastructure cible
            var infra = FindInfra(request.InfrastructureId);
            if (infra == null)
                return BadRequest(new { success = false, error = "Aucune infrastructure Exchange configurée." });

            var response = await _authService.LoginAsync(request.Username, request.Password, request.Domain, infra);

            // Commuter l'infrastructure puis initialiser les credentials
            _psService.SetInfrastructure(infra);
            _psService.SetCredentials(request.Domain ?? string.Empty, request.Username, request.Password);

            // Enrichir la réponse avec les infos d'infrastructure
            response!.InfrastructureId      = infra.Id;
            response.InfrastructureLabel    = infra.Label;
            response.InfrastructureVersion  = infra.Version;
            response.ServerFqdn             = infra.ServerFqdn;

            _logger.LogInformation(
                "Login réussi: {Domain}\\{User} → infra={Infra} ({Server})",
                response.Domain, response.Username, infra.Id, infra.ServerFqdn);

            return Ok(new { success = true, data = response });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { success = false, error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur inattendue lors du login");
            return StatusCode(500, new { success = false, error = $"Erreur serveur: {ex.Message}" });
        }
    }

    /// <summary>
    /// Authentification SSO Windows (Negotiate/Kerberos).
    /// Le navigateur envoie automatiquement le ticket Windows si le domaine est configuré.
    /// </summary>
    [HttpGet("sso")]
    [Authorize(AuthenticationSchemes = NegotiateDefaults.AuthenticationScheme)]
    public IActionResult Sso()
    {
        var windowsIdentity = User.Identity?.Name;

        if (string.IsNullOrEmpty(windowsIdentity))
            return Unauthorized(new { success = false, error = "Identité Windows non disponible. Assurez-vous d'être sur une machine du domaine." });

        var response = _authService.CreateSsoResponse(windowsIdentity);

        // SSO → utilise la première infra par défaut
        var infra = FindInfra(null);
        if (infra != null)
        {
            _psService.SetInfrastructure(infra);
            response.InfrastructureId     = infra.Id;
            response.InfrastructureLabel  = infra.Label;
            response.InfrastructureVersion = infra.Version;
            response.ServerFqdn           = infra.ServerFqdn;
        }

        _logger.LogInformation("SSO réussi: {Identity}", windowsIdentity);
        return Ok(new { success = true, data = response });
    }

    /// <summary>
    /// Informations sur l'utilisateur connecté (depuis le JWT).
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        var username    = User.FindFirstValue(ClaimTypes.Name) ?? string.Empty;
        var displayName = User.FindFirstValue(ClaimTypes.GivenName) ?? username;
        var domain      = User.FindFirstValue("domain") ?? string.Empty;
        var authMethod  = User.FindFirstValue("authMethod") ?? string.Empty;

        var expiryClaim = User.FindFirstValue("exp");
        DateTime expiresAt = DateTime.UtcNow.AddHours(8);
        if (long.TryParse(expiryClaim, out var expUnix))
            expiresAt = DateTimeOffset.FromUnixTimeSeconds(expUnix).UtcDateTime;

        // Infra active
        var infra = _psService.GetCurrentInfrastructure() ?? FindInfra(null);

        return Ok(new
        {
            success = true,
            data = new UserInfo
            {
                Username       = username,
                DisplayName    = displayName,
                Domain         = domain,
                AuthMethod     = authMethod,
                TokenExpiresAt = expiresAt
            }
        });
    }

    /// <summary>
    /// Déconnexion (côté serveur stateless JWT : le client supprime le token).
    /// </summary>
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        return Ok(new { success = true, message = "Déconnecté." });
    }
}
