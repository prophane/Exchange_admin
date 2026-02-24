using Microsoft.AspNetCore.Mvc;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class VirtualDirectoriesController : ControllerBase
    {
        private readonly ConfigurationService _configService;
        private readonly ILogger<VirtualDirectoriesController> _logger;

        public VirtualDirectoriesController(ConfigurationService configService, ILogger<VirtualDirectoriesController> logger)
        {
            _configService = configService;
            _logger = logger;
        }

        // ============================================================================
        // ALL - Endpoint batch (une seule requête, tous les vdirs de tous les serveurs)
        // ============================================================================

        [HttpGet("all")]
        public async Task<IActionResult> GetAllVirtualDirectories([FromQuery] string? server = null, [FromQuery] bool adOnly = false)
        {
            try
            {
                var result = await _configService.GetAllVirtualDirectoriesAsync(server, adOnly);
                return Ok(new { success = true, data = result, adOnly });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération de tous les répertoires virtuels");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // OWA
        // ============================================================================

        [HttpGet("owa")]
        public async Task<IActionResult> GetOwaVirtualDirectories([FromQuery] string? server = null)
        {
            try
            {
                var directories = await _configService.GetOwaVirtualDirectoriesAsync(server);
                return Ok(new { success = true, data = directories });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des répertoires OWA");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPut("owa/{identity}")]
        public async Task<IActionResult> UpdateOwaVirtualDirectory(string identity, [FromBody] UpdateVirtualDirectoryRequest request)
        {
            try
            {
                await _configService.UpdateOwaVirtualDirectoryAsync(
                    identity, request.InternalUrl, request.ExternalUrl,
                    request.BasicAuthentication, request.FormsAuthentication,
                    request.WindowsAuthentication, request.DigestAuthentication,
                    request.OAuthAuthentication, request.LogonFormat,
                    request.DefaultDomain, request.RedirectToOptimalOWAServer);
                return Ok(new { success = true, message = "Répertoire virtuel OWA mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour du répertoire OWA {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // ECP
        // ============================================================================

        [HttpGet("ecp")]
        public async Task<IActionResult> GetEcpVirtualDirectories([FromQuery] string? server = null)
        {
            try
            {
                var directories = await _configService.GetEcpVirtualDirectoriesAsync(server);
                return Ok(new { success = true, data = directories });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des répertoires ECP");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPut("ecp/{identity}")]
        public async Task<IActionResult> UpdateEcpVirtualDirectory(string identity, [FromBody] UpdateVirtualDirectoryRequest request)
        {
            try
            {
                await _configService.UpdateEcpVirtualDirectoryAsync(
                    identity, request.InternalUrl, request.ExternalUrl,
                    request.BasicAuthentication, request.FormsAuthentication,
                    request.WindowsAuthentication, request.DigestAuthentication,
                    request.OAuthAuthentication, request.DefaultDomain);
                return Ok(new { success = true, message = "Répertoire virtuel ECP mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour du répertoire ECP {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // ActiveSync (EAS)
        // ============================================================================

        [HttpGet("eas")]
        public async Task<IActionResult> GetEasVirtualDirectories([FromQuery] string? server = null)
        {
            try
            {
                var directories = await _configService.GetActiveSyncVirtualDirectoriesAsync(server);
                return Ok(new { success = true, data = directories });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des répertoires ActiveSync");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPut("eas/{identity}")]
        public async Task<IActionResult> UpdateEasVirtualDirectory(string identity, [FromBody] UpdateVirtualDirectoryRequest request)
        {
            try
            {
                await _configService.UpdateActiveSyncVirtualDirectoryAsync(
                    identity,
                    request.InternalUrl,
                    request.ExternalUrl,
                    request.BasicAuthEnabled,
                    request.WindowsAuthEnabled);
                return Ok(new { success = true, message = "Répertoire virtuel ActiveSync mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour du répertoire ActiveSync {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // Exchange Web Services (EWS)
        // ============================================================================

        [HttpGet("ews")]
        public async Task<IActionResult> GetEwsVirtualDirectories([FromQuery] string? server = null)
        {
            try
            {
                var directories = await _configService.GetWebServicesVirtualDirectoriesAsync(server);
                return Ok(new { success = true, data = directories });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des répertoires EWS");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPut("ews/{identity}")]
        public async Task<IActionResult> UpdateEwsVirtualDirectory(string identity, [FromBody] UpdateVirtualDirectoryRequest request)
        {
            try
            {
                await _configService.UpdateWebServicesVirtualDirectoryAsync(
                    identity, request.InternalUrl, request.ExternalUrl,
                    request.BasicAuthentication, request.WindowsAuthentication,
                    request.DigestAuthentication, request.OAuthAuthentication, request.MRSProxyEnabled);
                return Ok(new { success = true, message = "Répertoire virtuel EWS mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour du répertoire EWS {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // Offline Address Book (OAB)
        // ============================================================================

        [HttpGet("oab")]
        public async Task<IActionResult> GetOabVirtualDirectories([FromQuery] string? server = null)
        {
            try
            {
                var directories = await _configService.GetOabVirtualDirectoriesAsync(server);
                return Ok(new { success = true, data = directories });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des répertoires OAB");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPut("oab/{identity}")]
        public async Task<IActionResult> UpdateOabVirtualDirectory(string identity, [FromBody] UpdateVirtualDirectoryRequest request)
        {
            try
            {
                await _configService.UpdateOabVirtualDirectoryAsync(
                    identity, request.InternalUrl, request.ExternalUrl,
                    request.BasicAuthentication, request.WindowsAuthentication,
                    request.DigestAuthentication, request.RequireSSL, request.PollInterval);
                return Ok(new { success = true, message = "Répertoire virtuel OAB mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour du répertoire OAB {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // PowerShell
        // ============================================================================

        [HttpGet("powershell")]
        public async Task<IActionResult> GetPowerShellVirtualDirectories([FromQuery] string? server = null)
        {
            try
            {
                var directories = await _configService.GetPowerShellVirtualDirectoriesAsync(server);
                return Ok(new { success = true, data = directories });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des répertoires PowerShell");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPut("powershell/{identity}")]
        public async Task<IActionResult> UpdatePowerShellVirtualDirectory(string identity, [FromBody] UpdateVirtualDirectoryRequest request)
        {
            try
            {
                await _configService.UpdatePowerShellVirtualDirectoryAsync(
                    identity, request.InternalUrl, request.ExternalUrl,
                    request.BasicAuthentication, request.WindowsAuthentication,
                    request.RequireSSL, request.CertificateAuthentication);
                return Ok(new { success = true, message = "Répertoire virtuel PowerShell mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour du répertoire PowerShell {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // RPC / MAPI Virtual Directories
        // ============================================================================

        [HttpPut("rpc/{identity}")]
        public async Task<IActionResult> SetRpcVirtualDirectory(string identity, [FromBody] UpdateVirtualDirectoryRequest req)
        {
            try
            {
                await _configService.SetOutlookAnywhereAsync(
                    Uri.UnescapeDataString(identity),
                    req.ExternalHostname, req.InternalHostname,
                    null, null,
                    req.ExternalClientsRequireSsl, req.InternalClientsRequireSsl,
                    null);
                return Ok(new { success = true, message = "RPC (Outlook Anywhere) mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour RPC {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPut("mapi/{identity}")]
        public async Task<IActionResult> SetMapiVirtualDirectory(string identity, [FromBody] UpdateVirtualDirectoryRequest req)
        {
            try
            {
                await _configService.SetMapiVirtualDirectoryAsync(
                    Uri.UnescapeDataString(identity),
                    req.InternalUrl, req.ExternalUrl);
                return Ok(new { success = true, message = "MAPI mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour MAPI {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

    }

    public class UpdateVirtualDirectoryRequest
    {
        public string? InternalUrl { get; set; }
        public string? ExternalUrl { get; set; }
        // Authentification standard
        public bool? BasicAuthentication { get; set; }
        public bool? WindowsAuthentication { get; set; }
        public bool? FormsAuthentication { get; set; }
        public bool? DigestAuthentication { get; set; }
        public bool? OAuthAuthentication { get; set; }
        public bool? LiveIdNegotiate { get; set; }
        public bool? CertificateAuthentication { get; set; }
        // EAS champs renommés
        public bool? BasicAuthEnabled { get; set; }
        public bool? WindowsAuthEnabled { get; set; }
        // OWA / ECP
        public string? LogonFormat { get; set; }         // FullDomain, UserName, PrincipalName, Domain\UserName
        public string? DefaultDomain { get; set; }
        public bool? RedirectToOptimalOWAServer { get; set; }
        // EWS
        public bool? MRSProxyEnabled { get; set; }
        // OAB / PowerShell
        public bool? RequireSSL { get; set; }
        public int? PollInterval { get; set; }
        // RPC (Outlook Anywhere)
        public string? InternalHostname { get; set; }
        public string? ExternalHostname { get; set; }
        public bool? ExternalClientsRequireSsl { get; set; }
        public bool? InternalClientsRequireSsl { get; set; }
        public bool? SSLOffloading { get; set; }
    }

}
