using Microsoft.AspNetCore.Mvc;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ConnectorsController : ControllerBase
    {
        private readonly ConfigurationService _configService;
        private readonly ILogger<ConnectorsController> _logger;

        public ConnectorsController(ConfigurationService configService, ILogger<ConnectorsController> logger)
        {
            _configService = configService;
            _logger = logger;
        }

        // ============================================================================
        // Connecteurs de réception
        // ============================================================================

        [HttpGet("receive")]
        public async Task<IActionResult> GetReceiveConnectors([FromQuery] string? server = null)
        {
            try
            {
                var connectors = await _configService.GetReceiveConnectorsAsync(server);
                return Ok(new { success = true, data = connectors });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des connecteurs de réception");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPost("receive")]
        public async Task<IActionResult> CreateReceiveConnector([FromBody] CreateReceiveConnectorRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(new { success = false, error = "Le nom est requis" });
                }

                if (request.Bindings == null || request.Bindings.Length == 0)
                {
                    return BadRequest(new { success = false, error = "Au moins une liaison est requise" });
                }

                await _configService.CreateReceiveConnectorAsync(
                    request.Name,
                    request.Server ?? Environment.MachineName,
                    request.Bindings,
                    request.RemoteIPRanges,
                    request.MaxMessageSize,
                    request.Enabled ?? true,
                    request.AuthMechanism,
                    request.Fqdn
                );

                return Ok(new { success = true, message = "Connecteur de réception créé" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la création du connecteur de réception");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpDelete("receive/{identity}")]
        public async Task<IActionResult> DeleteReceiveConnector(string identity)
        {
            try
            {
                await _configService.DeleteReceiveConnectorAsync(identity);
                return Ok(new { success = true, message = "Connecteur de réception supprimé" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la suppression du connecteur de réception {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPatch("receive/{identity}")]
        public async Task<IActionResult> UpdateReceiveConnector(string identity, [FromBody] UpdateReceiveConnectorRequest request)
        {
            try
            {
                await _configService.UpdateReceiveConnectorAsync(
                    Uri.UnescapeDataString(identity),
                    request.Bindings,
                    request.RemoteIPRanges,
                    request.MaxMessageSize,
                    request.Enabled,
                    request.AuthMechanism,
                    request.Fqdn
                );
                return Ok(new { success = true, message = "Connecteur de réception mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour du connecteur de réception {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // Connecteurs d'envoi
        // ============================================================================

        [HttpGet("send")]
        public async Task<IActionResult> GetSendConnectors()
        {
            try
            {
                var connectors = await _configService.GetSendConnectorsAsync();
                return Ok(new { success = true, data = connectors });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des connecteurs d'envoi");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPost("send")]
        public async Task<IActionResult> CreateSendConnector([FromBody] CreateSendConnectorRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(new { success = false, error = "Le nom est requis" });
                }

                if (request.SmartHosts == null || request.SmartHosts.Length == 0)
                {
                    return BadRequest(new { success = false, error = "Au moins un smart host est requis" });
                }

                await _configService.CreateSendConnectorAsync(
                    request.Name,
                    request.SmartHosts,
                    request.AddressSpaces,
                    request.MaxMessageSize,
                    request.Enabled ?? true,
                    request.RequireTLS ?? false,
                    request.TlsAuthLevel,
                    request.TlsDomain,
                    request.Fqdn
                );

                return Ok(new { success = true, message = "Connecteur d'envoi créé" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la création du connecteur d'envoi");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpDelete("send/{identity}")]
        public async Task<IActionResult> DeleteSendConnector(string identity)
        {
            try
            {
                await _configService.DeleteSendConnectorAsync(identity);
                return Ok(new { success = true, message = "Connecteur d'envoi supprimé" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la suppression du connecteur d'envoi {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPatch("send/{identity}")]
        public async Task<IActionResult> UpdateSendConnector(string identity, [FromBody] UpdateSendConnectorRequest request)
        {
            try
            {
                await _configService.UpdateSendConnectorAsync(
                    Uri.UnescapeDataString(identity),
                    request.SmartHosts,
                    request.AddressSpaces,
                    request.MaxMessageSize,
                    request.Enabled,
                    request.RequireTLS,
                    request.TlsAuthLevel,
                    request.TlsDomain,
                    request.Fqdn
                );
                return Ok(new { success = true, message = "Connecteur d'envoi mis à jour" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la mise à jour du connecteur d'envoi {Identity}", identity);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // Certificats Exchange
        // ============================================================================

        [HttpGet("certificates")]
        public async Task<IActionResult> GetCertificates()
        {
            try
            {
                var certs = await _configService.GetExchangeCertificatesAsync();
                return Ok(new { success = true, data = certs });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des certificats");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPost("certificates/enable")]
        public async Task<IActionResult> EnableCertificate([FromBody] EnableCertificateRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Thumbprint))
                    return BadRequest(new { success = false, error = "Thumbprint requis" });

                await _configService.EnableCertificateForSmtpAsync(request.Thumbprint);
                return Ok(new { success = true, message = "Certificat activé pour SMTP" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de l'activation du certificat");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }
    }

    // ============================================================================
    // DTOs
    // ============================================================================

    public class CreateReceiveConnectorRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Server { get; set; }
        public string[] Bindings { get; set; } = Array.Empty<string>();
        public string[]? RemoteIPRanges { get; set; }
        public int? MaxMessageSize { get; set; }
        public bool? Enabled { get; set; }
        // TLS
        public string[]? AuthMechanism { get; set; }
        // FQDN (Exchange 2010: utilisé lors de l'auth TLS pour sélectionner le certificat)
        public string? Fqdn { get; set; }
    }

    public class CreateSendConnectorRequest
    {
        public string Name { get; set; } = string.Empty;
        public string[] SmartHosts { get; set; } = Array.Empty<string>();
        public string[]? AddressSpaces { get; set; }
        public int? MaxMessageSize { get; set; }
        public bool? Enabled { get; set; }
        // TLS
        public bool? RequireTLS { get; set; }
        public string? TlsAuthLevel { get; set; }
        public string? TlsDomain { get; set; }
        // FQDN (Exchange 2010: utilisé lors de l'auth TLS pour sélectionner le certificat)
        public string? Fqdn { get; set; }
    }

    public class UpdateReceiveConnectorRequest
    {
        public string[]? Bindings { get; set; }
        public string[]? RemoteIPRanges { get; set; }
        public int? MaxMessageSize { get; set; }
        public bool? Enabled { get; set; }
        public string[]? AuthMechanism { get; set; }
        public string? Fqdn { get; set; }
    }

    public class UpdateSendConnectorRequest
    {
        public string[]? SmartHosts { get; set; }
        public string[]? AddressSpaces { get; set; }
        public int? MaxMessageSize { get; set; }
        public bool? Enabled { get; set; }
        public bool? RequireTLS { get; set; }
        public string? TlsAuthLevel { get; set; }
        public string? TlsDomain { get; set; }
        public string? Fqdn { get; set; }
    }

    public class EnableCertificateRequest
    {
        public string Thumbprint { get; set; } = string.Empty;
    }
}
