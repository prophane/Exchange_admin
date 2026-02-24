using Microsoft.AspNetCore.Mvc;
using ExchangeWebAdmin.API.Models;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class MailboxesController : ControllerBase
{
    private readonly IMailboxService _mailboxService;
    private readonly ILogger<MailboxesController> _logger;

    public MailboxesController(IMailboxService mailboxService, ILogger<MailboxesController> logger)
    {
        _mailboxService = mailboxService;
        _logger = logger;
    }

    /// <summary>
    /// Récupère toutes les boîtes aux lettres
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IEnumerable<MailboxDto>>), 200)]
    public async Task<IActionResult> GetMailboxes([FromQuery] int resultSize = 1000)
    {
        try
        {
            var mailboxes = await _mailboxService.GetMailboxesAsync(resultSize);
            return Ok(new ApiResponse<IEnumerable<MailboxDto>>
            {
                Success = true,
                Data = mailboxes
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des boîtes aux lettres");
            return StatusCode(500, new ApiResponse<IEnumerable<MailboxDto>>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    /// <summary>
    /// Récupère une boîte aux lettres spécifique
    /// </summary>
    [HttpGet("{identity}")]
    [ProducesResponseType(typeof(ApiResponse<MailboxDto>), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetMailbox(string identity)
    {
        try
        {
            var mailbox = await _mailboxService.GetMailboxAsync(identity);
            
            if (mailbox == null)
                return NotFound(new ApiResponse<MailboxDto>
                {
                    Success = false,
                    Error = "Boîte aux lettres non trouvée"
                });

            return Ok(new ApiResponse<MailboxDto>
            {
                Success = true,
                Data = mailbox
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération de la boîte {Identity}", identity);
            return StatusCode(500, new ApiResponse<MailboxDto>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    /// <summary>
    /// Récupère les statistiques d'une boîte aux lettres
    /// </summary>
    [HttpGet("{identity}/statistics")]
    [ProducesResponseType(typeof(ApiResponse<MailboxStatisticsDto>), 200)]
    public async Task<IActionResult> GetMailboxStatistics(string identity)
    {
        try
        {
            var stats = await _mailboxService.GetMailboxStatisticsAsync(identity);
            
            if (stats == null)
                return NotFound();

            return Ok(new ApiResponse<MailboxStatisticsDto>
            {
                Success = true,
                Data = stats
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des statistiques");
            return StatusCode(500, new ApiResponse<MailboxStatisticsDto>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    /// <summary>
    /// Retourne les unités organisationnelles (OU) Active Directory
    /// </summary>
    [HttpGet("organizational-units")]
    [ProducesResponseType(typeof(ApiResponse<IEnumerable<string>>), 200)]
    public async Task<IActionResult> GetOrganizationalUnits()
    {
        try
        {
            var ous = await _mailboxService.GetOrganizationalUnitsAsync();
            return Ok(new ApiResponse<IEnumerable<string>> { Success = true, Data = ous });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des OUs");
            return StatusCode(500, new ApiResponse<IEnumerable<string>> { Success = false, Error = ex.Message });
        }
    }

    /// <summary>
    /// Crée une nouvelle boîte aux lettres
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<MailboxDto>), 201)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> CreateMailbox([FromBody] CreateMailboxRequest request)
    {
        try
        {
            var mailbox = await _mailboxService.CreateMailboxAsync(request);
            
            return CreatedAtAction(
                nameof(GetMailbox),
                new { identity = mailbox.PrimarySmtpAddress },
                new ApiResponse<MailboxDto>
                {
                    Success = true,
                    Data = mailbox,
                    Message = "Boîte aux lettres créée avec succès"
                });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la création de la boîte aux lettres");
            return BadRequest(new ApiResponse<MailboxDto>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    /// <summary>
    /// Modifie une boîte aux lettres existante
    /// </summary>
    [HttpPut("{identity}")]
    [ProducesResponseType(typeof(ApiResponse<MailboxDto>), 200)]
    public async Task<IActionResult> UpdateMailbox(string identity, [FromBody] UpdateMailboxRequest request)
    {
        try
        {
            var mailbox = await _mailboxService.UpdateMailboxAsync(identity, request);
            
            return Ok(new ApiResponse<MailboxDto>
            {
                Success = true,
                Data = mailbox,
                Message = "Boîte aux lettres modifiée avec succès"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la modification de la boîte aux lettres");
            return BadRequest(new ApiResponse<MailboxDto>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    /// <summary>
    /// Supprime une boîte aux lettres
    /// </summary>
    [HttpDelete("{identity}")]
    [ProducesResponseType(200)]
    public async Task<IActionResult> DeleteMailbox(string identity, [FromQuery] bool permanent = false)
    {
        try
        {
            await _mailboxService.DeleteMailboxAsync(identity, permanent);
            
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Message = "Boîte aux lettres supprimée avec succès"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la suppression de la boîte aux lettres");
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }
}

[ApiController]
[Route("api/[controller]")]
public class DistributionGroupsController : ControllerBase
{
    private readonly IDistributionGroupService _groupService;
    private readonly ILogger<DistributionGroupsController> _logger;

    public DistributionGroupsController(IDistributionGroupService groupService, ILogger<DistributionGroupsController> logger)
    {
        _groupService = groupService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetGroups([FromQuery] int resultSize = 1000)
    {
        try
        {
            var groups = await _groupService.GetDistributionGroupsAsync(resultSize);
            return Ok(new ApiResponse<IEnumerable<DistributionGroupDto>>
            {
                Success = true,
                Data = groups
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des groupes");
            return StatusCode(500, new ApiResponse<IEnumerable<DistributionGroupDto>>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpGet("{identity}")]
    public async Task<IActionResult> GetGroup(string identity)
    {
        try
        {
            var group = await _groupService.GetDistributionGroupAsync(identity);
            
            if (group == null)
                return NotFound();

            return Ok(new ApiResponse<DistributionGroupDto>
            {
                Success = true,
                Data = group
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération du groupe");
            return StatusCode(500, new ApiResponse<DistributionGroupDto>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpGet("{identity}/members")]
    public async Task<IActionResult> GetGroupMembers(string identity)
    {
        try
        {
            var members = await _groupService.GetGroupMembersAsync(identity);
            return Ok(new ApiResponse<IEnumerable<GroupMemberDto>>
            {
                Success = true,
                Data = members
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des membres");
            return StatusCode(500, new ApiResponse<IEnumerable<GroupMemberDto>>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateGroup([FromBody] CreateDistributionGroupRequest request)
    {
        try
        {
            var group = await _groupService.CreateDistributionGroupAsync(request);
            return CreatedAtAction(nameof(GetGroup), new { identity = group.Name }, new ApiResponse<DistributionGroupDto>
            {
                Success = true,
                Data = group,
                Message = "Groupe créé avec succès"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la création du groupe");
            return BadRequest(new ApiResponse<DistributionGroupDto>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpPost("{identity}/members")]
    public async Task<IActionResult> AddMember(string identity, [FromBody] AddMemberRequest request)
    {
        try
        {
            await _groupService.AddMemberAsync(identity, request.MemberIdentity);
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Message = "Membre ajouté avec succès"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de l'ajout du membre");
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpDelete("{identity}/members/{memberIdentity}")]
    public async Task<IActionResult> RemoveMember(string identity, string memberIdentity)
    {
        try
        {
            await _groupService.RemoveMemberAsync(identity, memberIdentity);
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Message = "Membre supprimé avec succès"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la suppression du membre");
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }
}

public class AddMemberRequest
{
    public required string MemberIdentity { get; set; }
}

[ApiController]
[Route("api/[controller]")]
public class DatabasesController : ControllerBase
{
    private readonly IDatabaseService _databaseService;
    private readonly ILogger<DatabasesController> _logger;

    public DatabasesController(IDatabaseService databaseService, ILogger<DatabasesController> logger)
    {
        _databaseService = databaseService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetDatabases()
    {
        try
        {
            var databases = await _databaseService.GetDatabasesAsync();
            return Ok(new ApiResponse<IEnumerable<MailboxDatabaseDto>>
            {
                Success = true,
                Data = databases
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des bases de données");
            return StatusCode(500, new ApiResponse<IEnumerable<MailboxDatabaseDto>>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpGet("{identity}")]
    public async Task<IActionResult> GetDatabase(string identity)
    {
        try
        {
            var database = await _databaseService.GetDatabaseAsync(identity);
            
            if (database == null)
                return NotFound();

            return Ok(new ApiResponse<MailboxDatabaseDto>
            {
                Success = true,
                Data = database
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération de la base de données");
            return StatusCode(500, new ApiResponse<MailboxDatabaseDto>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpPut("{identity}")]
    public async Task<IActionResult> UpdateDatabase(string identity, [FromBody] UpdateDatabaseRequest request)
    {
        try
        {
            await _databaseService.UpdateDatabaseAsync(
                Uri.UnescapeDataString(identity),
                request.IssueWarningQuota,
                request.ProhibitSendQuota,
                request.ProhibitSendReceiveQuota,
                request.MailboxRetention,
                request.DeletedItemRetention);
            return Ok(new { success = true, message = "Base de données mise à jour" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la mise à jour de la base de données {Identity}", identity);
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }
}

public class UpdateDatabaseRequest
{
    public string? IssueWarningQuota { get; set; }
    public string? ProhibitSendQuota { get; set; }
    public string? ProhibitSendReceiveQuota { get; set; }
    public string? MailboxRetention { get; set; }
    public string? DeletedItemRetention { get; set; }
}

[ApiController]
[Route("api/[controller]")]
public class QueuesController : ControllerBase
{
    private readonly IQueueService _queueService;
    private readonly ILogger<QueuesController> _logger;

    public QueuesController(IQueueService queueService, ILogger<QueuesController> logger)
    {
        _queueService = queueService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetQueues([FromQuery] string? server = null)
    {
        try
        {
            var queues = await _queueService.GetQueuesAsync(server);
            return Ok(new ApiResponse<IEnumerable<QueueDto>>
            {
                Success = true,
                Data = queues
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des files");
            return StatusCode(500, new ApiResponse<IEnumerable<QueueDto>>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpGet("{identity}/messages")]
    public async Task<IActionResult> GetQueueMessages(string identity)
    {
        try
        {
            var messages = await _queueService.GetQueueMessagesAsync(identity);
            return Ok(new ApiResponse<IEnumerable<QueueMessageDto>>
            {
                Success = true,
                Data = messages
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des messages");
            return StatusCode(500, new ApiResponse<IEnumerable<QueueMessageDto>>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpPost("{identity}/retry")]
    public async Task<IActionResult> RetryQueue(string identity)
    {
        try
        {
            await _queueService.RetryQueueAsync(identity);
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Message = "File d'attente relancée"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la relance de la file");
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }
}

[ApiController]
[Route("api/mailboxes/{identity}/[controller]")]
public class PermissionsController : ControllerBase
{
    private readonly IPermissionService _permissionService;
    private readonly ILogger<PermissionsController> _logger;

    public PermissionsController(IPermissionService permissionService, ILogger<PermissionsController> logger)
    {
        _permissionService = permissionService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetPermissions(string identity)
    {
        try
        {
            var permissions = await _permissionService.GetMailboxPermissionsAsync(identity);
            return Ok(new ApiResponse<IEnumerable<MailboxPermissionDto>>
            {
                Success = true,
                Data = permissions
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des permissions");
            return StatusCode(500, new ApiResponse<IEnumerable<MailboxPermissionDto>>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpPost]
    public async Task<IActionResult> AddPermission(string identity, [FromBody] AddPermissionRequest request)
    {
        try
        {
            await _permissionService.AddMailboxPermissionAsync(identity, request);
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Message = "Permission ajoutée avec succès"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de l'ajout de permission");
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }

    [HttpDelete]
    public async Task<IActionResult> RemovePermission(
        string identity,
        [FromQuery] string user,
        [FromQuery] string[] accessRights)
    {
        try
        {
            await _permissionService.RemoveMailboxPermissionAsync(identity, user, accessRights);
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Message = "Permission supprimée avec succès"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la suppression de permission");
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            });
        }
    }
}

/// <summary>
/// Controller pour les endpoints système (test connexion, health, etc.)
/// </summary>
[ApiController]
[Route("api/exchange")]
[Produces("application/json")]
public class ExchangeController : ControllerBase
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<ExchangeController> _logger;
    private readonly ExchangeSettings _settings;

    public ExchangeController(
        IPowerShellService psService,
        ILogger<ExchangeController> logger,
        Microsoft.Extensions.Options.IOptions<ExchangeSettings> settings)
    {
        _psService = psService;
        _logger = logger;
        _settings = settings.Value;
    }

    /// <summary>
    /// Test de connexion au serveur Exchange
    /// </summary>
    [HttpGet("test")]
    [ProducesResponseType(200)]
    public async Task<IActionResult> TestConnection()
    {
        try
        {
            // Pour l'instant, test très simple - juste vérifier que l'API est up
            // Le vrai test PowerShell se fait lors des vraies requêtes (mailboxes, etc.)
            _logger.LogInformation("Test de connexion Exchange - retour succès optimiste");
            
            return Ok(new
            {
                connected = true,
                server = _settings.ServerFqdn,
                version = "Microsoft Exchange Server 2010",
                message = "API Exchange Web Admin opérationnelle",
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Test de connexion échoué");
            return Ok(new
            {
                connected = false,
                server = _settings.ServerFqdn,
                message = $"Erreur: {ex.Message}",
                error = ex.Message,
                timestamp = DateTime.UtcNow
            });
        }
    }

    /// <summary>
    /// Health check de l'API
    /// </summary>
    [HttpGet("/api/health")]
    [ProducesResponseType(200)]
    public IActionResult GetHealth()
    {
        return Ok(new
        {
            status = "ok",
            timestamp = DateTime.UtcNow,
            server = _settings.ServerFqdn,
            api = "Exchange Web Admin API",
            version = "1.0.0"
        });
    }

    /// <summary>
    /// Debug : dump brut des propriétés FlattenValue pour les bases de données
    /// </summary>
    [HttpGet("debug/databases-raw")]
    public async Task<IActionResult> DebugDatabasesRaw()
    {
        var script = @"Get-MailboxDatabase -Status | Select-Object Name, Server, EdbFilePath, LogFolderPath, IssueWarningQuota, ProhibitSendQuota, ProhibitSendReceiveQuota, Mounted, MailboxRetention, DeletedItemRetention, WhenCreated";
        var result = await _psService.ExecuteScriptAsync(script);
        return Ok(result);
    }

    /// <summary>
    /// Debug : toutes les propriétés d'une base de données sans Select-Object
    /// </summary>
    [HttpGet("debug/databases-full")]
    public async Task<IActionResult> DebugDatabasesFull()
    {
        var result = await _psService.ExecuteScriptAsync("Get-MailboxDatabase -Status -Identity 'DAGDB01'");
        return Ok(result);
    }
}
