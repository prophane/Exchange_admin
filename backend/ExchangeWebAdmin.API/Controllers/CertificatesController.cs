using Microsoft.AspNetCore.Mvc;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Controllers
{
    // ─── DTOs ─────────────────────────────────────────────────────────────────
    public class StartLetsEncryptRequest
    {
        public string Email { get; set; } = string.Empty;
        public string[] Domains { get; set; } = [];
        public string? DnsServer { get; set; }
        /// <summary>Identifiant Windows pour les opérations DNS (ex: domaine\\user)</summary>
        public string? DnsUsername { get; set; }
        /// <summary>Mot de passe pour les opérations DNS</summary>
        public string? DnsPassword { get; set; }
        /// <summary>Utiliser le serveur de staging Let's Encrypt (test, sans limite de taux)</summary>
        public bool Staging { get; set; } = false;
    }

    public class ValidateLetsEncryptRequest
    {
        public string OrderId { get; set; } = string.Empty;
        public string[]? Services { get; set; }
        /// <summary>Serveur Exchange cible pour l'import (null = serveur par défaut de la session)</summary>
        public string? Server { get; set; }
    }

    public class DeployCertificateRequest
    {
        public string FromServer { get; set; } = string.Empty;
        public string ToServer { get; set; } = string.Empty;
        public string[] Services { get; set; } = ["SMTP", "IIS"];
    }

    public class EnableCertServicesRequest
    {
        public string[] Services { get; set; } = [];
    }

    public class RenewCertificateRequest
    {
        public string Server { get; set; } = string.Empty;
        public string[] Services { get; set; } = ["SMTP", "IIS"];
    }

    public class NewCertificateRequestDto
    {
        public string Server { get; set; } = string.Empty;
        public string SubjectName { get; set; } = string.Empty;
        public string[] DomainNames { get; set; } = [];
        public string FriendlyName { get; set; } = string.Empty;
        public int KeySize { get; set; } = 2048;
        public string[] Services { get; set; } = ["SMTP", "IIS"];
    }

    public class ImportCertificateResponseDto
    {
        public string Server { get; set; } = string.Empty;
        /// <summary>Certificat PKCS#7 ou PFX encodé en base64</summary>
        public string Base64Certificate { get; set; } = string.Empty;
        public string[] Services { get; set; } = ["SMTP", "IIS"];
        /// <summary>Mot de passe PFX (optionnel)</summary>
        public string? PfxPassword { get; set; }
    }

    // ─── Controller ───────────────────────────────────────────────────────────
    [ApiController]
    [Route("api/[controller]")]
    public class CertificatesController : ControllerBase
    {
        private readonly ConfigurationService _configService;
        private readonly LetsEncryptService _letsEncryptService;
        private readonly ILogger<CertificatesController> _logger;

        public CertificatesController(
            ConfigurationService configService,
            LetsEncryptService letsEncryptService,
            ILogger<CertificatesController> logger)
        {
            _configService = configService;
            _letsEncryptService = letsEncryptService;
            _logger = logger;
        }

        /// <summary>
        /// Récupère tous les certificats Exchange
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetCertificates([FromQuery] string? server = null)
        {
            try
            {
                var certificates = await _configService.GetCertificatesAsync(server);
                return Ok(new { success = true, data = certificates });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération des certificats");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Récupère un certificat spécifique par son empreinte
        /// </summary>
        [HttpGet("{thumbprint}")]
        public async Task<IActionResult> GetCertificate(string thumbprint)
        {
            try
            {
                var certificate = await _configService.GetCertificateAsync(thumbprint);
                
                if (certificate == null)
                {
                    return NotFound(new { success = false, error = "Certificat non trouvé" });
                }

                return Ok(new { success = true, data = certificate });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors de la récupération du certificat {Thumbprint}", thumbprint);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Active les services Exchange pour un certificat existant.
        /// </summary>
        [HttpPost("{thumbprint}/services")]
        public async Task<IActionResult> EnableCertificateServices(string thumbprint, [FromBody] EnableCertServicesRequest req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(thumbprint))
                    return BadRequest(new { success = false, error = "Thumbprint requis" });

                await _configService.EnableCertificateServicesAsync(thumbprint, req.Services ?? []);
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur activation services certificat {Thumbprint}", thumbprint);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ── Let's Encrypt ─────────────────────────────────────────────────────

        /// <summary>
        /// Supprime un certificat Exchange par son empreinte.
        /// </summary>
        [HttpDelete("{thumbprint}")]
        public async Task<IActionResult> DeleteCertificate(string thumbprint)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(thumbprint))
                    return BadRequest(new { success = false, error = "Thumbprint requis" });

                await _configService.DeleteCertificateAsync(thumbprint);
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur suppression certificat {Thumbprint}", thumbprint);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Renouvelle un certificat auto-signé Exchange (recrée avec mêmes paramètres).
        /// </summary>
        [HttpPost("{thumbprint}/renew")]
        public async Task<IActionResult> RenewCertificate(string thumbprint, [FromBody] RenewCertificateRequest req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(thumbprint))
                    return BadRequest(new { success = false, error = "Thumbprint requis" });
                if (string.IsNullOrWhiteSpace(req.Server))
                    return BadRequest(new { success = false, error = "Server requis pour les opérations d'écriture" });

                var newThumbprint = await _configService.RenewSelfSignedCertificateAsync(thumbprint, req.Services, req.Server);
                return Ok(new { success = true, thumbprint = newThumbprint });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur renouvellement certificat {Thumbprint}", thumbprint);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Génère une requête de certificat (CSR) pour une CA d'entreprise.
        /// </summary>
        [HttpPost("request")]
        public async Task<IActionResult> NewCertificateRequest([FromBody] NewCertificateRequestDto req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req.Server))
                    return BadRequest(new { success = false, error = "Server requis pour les opérations d'écriture" });
                if (string.IsNullOrWhiteSpace(req.SubjectName))
                    return BadRequest(new { success = false, error = "SubjectName requis" });
                if (req.DomainNames == null || req.DomainNames.Length == 0)
                    return BadRequest(new { success = false, error = "Au moins un domaine requis" });

                var csr = await _configService.NewCertificateRequestAsync(
                    req.Server, req.SubjectName, req.DomainNames,
                    string.IsNullOrWhiteSpace(req.FriendlyName) ? req.DomainNames[0] : req.FriendlyName,
                    req.KeySize > 0 ? req.KeySize : 2048,
                    req.Services);

                return Ok(new { success = true, csr });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur génération CSR");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Importe un certificat signé par une CA d'entreprise (PKCS#7 ou PFX, base64).
        /// </summary>
        [HttpPost("import")]
        public async Task<IActionResult> ImportCertificateResponse([FromBody] ImportCertificateResponseDto req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req.Server))
                    return BadRequest(new { success = false, error = "Server requis pour les opérations d'écriture" });
                if (string.IsNullOrWhiteSpace(req.Base64Certificate))
                    return BadRequest(new { success = false, error = "Base64Certificate requis" });

                var thumbprint = await _configService.ImportCertificateResponseAsync(
                    req.Server, req.Base64Certificate, req.Services, req.PfxPassword);

                return Ok(new { success = true, thumbprint });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur import certificat CA");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Déploie (copie) un certificat existant d'un serveur Exchange vers un autre.
        /// </summary>
        [HttpPost("{thumbprint}/deploy")]
        public async Task<IActionResult> DeployCertificate(string thumbprint, [FromBody] DeployCertificateRequest req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(thumbprint))
                    return BadRequest(new { success = false, error = "Thumbprint requis" });
                if (string.IsNullOrWhiteSpace(req.FromServer))
                    return BadRequest(new { success = false, error = "FromServer requis" });
                if (string.IsNullOrWhiteSpace(req.ToServer))
                    return BadRequest(new { success = false, error = "ToServer requis" });

                var newThumb = await _configService.DeployCertificateToServerAsync(thumbprint, req.FromServer, req.ToServer, req.Services);
                return Ok(new { success = true, thumbprint = newThumb });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur déploiement certificat {Thumbprint} vers {To}", thumbprint, req.ToServer);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ── Let's Encrypt ─────────────────────────────────────────────────────

        /// <summary>
        /// Démarre un ordre ACME et crée automatiquement les enregistrements DNS TXT _acme-challenge.
        /// Retourne l'orderId et les défis DNS (pour affichage confirmation côté UI).
        /// </summary>
        [HttpPost("letsencrypt/start")]
        public async Task<IActionResult> StartLetsEncrypt([FromBody] StartLetsEncryptRequest req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req.Email))
                    return BadRequest(new { success = false, error = "Email requis" });
                if (req.Domains == null || req.Domains.Length == 0)
                    return BadRequest(new { success = false, error = "Au moins un domaine requis" });

                var (orderId, challenges) = await _letsEncryptService.StartOrderAsync(
                    req.Email, req.Domains, req.DnsServer,
                    req.DnsUsername, req.DnsPassword, req.Staging);

                return Ok(new
                {
                    success = true,
                    orderId,
                    staging  = req.Staging,
                    dnsServer = req.DnsServer ?? LetsEncryptService.DefaultDnsServer,
                    challenges = challenges.Select(c => new
                    {
                        domain       = c.Domain,
                        zone         = c.Zone,
                        recordName   = c.RecordName,
                        fullName     = c.FullName,
                        txtValue     = c.TxtValue,
                        autoCreated  = c.AutoCreated,
                        autoCreateError = c.AutoCreateError,
                    })
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur démarrage ordre Let's Encrypt");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Valide les défis ACME, puis importe et active le certificat dans Exchange.
        /// </summary>
        [HttpPost("letsencrypt/validate")]
        public async Task<IActionResult> ValidateLetsEncrypt([FromBody] ValidateLetsEncryptRequest req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req.OrderId))
                    return BadRequest(new { success = false, error = "orderId requis" });

                var services = req.Services?.Length > 0 ? req.Services : ["SMTP", "IIS"];
                var thumbprint = await _letsEncryptService.ValidateAndImportAsync(req.OrderId, services, req.Server);

                return Ok(new { success = true, thumbprint });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { success = false, error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur validation ordre Let's Encrypt {OrderId}", req.OrderId);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }
    }
}
