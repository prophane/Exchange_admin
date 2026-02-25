using Microsoft.AspNetCore.Mvc;
using ExchangeWebAdmin.API.Models;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Controllers;

// ============================================================================
// BOÎTES PARTAGÉES + RESSOURCES + CONTACTS
// ============================================================================

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class RecipientsController : ControllerBase
{
    private readonly IRecipientService _svc;
    private readonly ILogger<RecipientsController> _logger;

    public RecipientsController(IRecipientService svc, ILogger<RecipientsController> logger)
    {
        _svc = svc;
        _logger = logger;
    }

    // --- Boîtes partagées ---

    [HttpGet("shared")]
    public async Task<IActionResult> GetSharedMailboxes()
    {
        try
        {
            var list = await _svc.GetSharedMailboxesAsync();
            return Ok(new ApiResponse<List<Dictionary<string, object>>> { Success = true, Data = list });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpPost("shared")]
    public async Task<IActionResult> CreateSharedMailbox([FromBody] CreateSharedMailboxRequest req)
    {
        try
        {
            var result = await _svc.CreateSharedMailboxAsync(req.Name, req.Alias, req.UserPrincipalName, req.Database, req.OrganizationalUnit);
            return Ok(new ApiResponse<Dictionary<string, object>> { Success = true, Data = result });
        }
        catch (Exception ex) { return BadRequest(new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpPost("shared/{identity}/permissions")]
    public async Task<IActionResult> SetPermissions(string identity, [FromBody] SetPermissionRequest req)
    {
        try
        {
            await _svc.SetSharedMailboxPermissionsAsync(identity, req.User, req.AccessRight);
            return Ok(new ApiResponse<object> { Success = true, Message = "Permission ajoutée" });
        }
        catch (Exception ex) { return BadRequest(new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    // --- Ressources (salles + équipements) ---

    [HttpGet("resources")]
    public async Task<IActionResult> GetResources()
    {
        try
        {
            var list = await _svc.GetResourcesAsync();
            return Ok(new ApiResponse<List<Dictionary<string, object>>> { Success = true, Data = list });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpPost("resources")]
    public async Task<IActionResult> CreateResource([FromBody] CreateResourceRequest req)
    {
        try
        {
            var result = await _svc.CreateResourceAsync(req.Type, req.Name, req.Alias, req.UserPrincipalName, req.Database, req.OrganizationalUnit);
            return Ok(new ApiResponse<Dictionary<string, object>> { Success = true, Data = result });
        }
        catch (Exception ex) { return BadRequest(new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    // --- Contacts messagerie ---

    [HttpGet("contacts")]
    public async Task<IActionResult> GetContacts()
    {
        try
        {
            var list = await _svc.GetMailContactsAsync();
            return Ok(new ApiResponse<List<Dictionary<string, object>>> { Success = true, Data = list });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpPost("contacts")]
    public async Task<IActionResult> CreateContact([FromBody] CreateContactRequest req)
    {
        try
        {
            var result = await _svc.CreateMailContactAsync(req.Name, req.ExternalEmailAddress, req.Alias, req.OrganizationalUnit);
            return Ok(new ApiResponse<Dictionary<string, object>> { Success = true, Data = result });
        }
        catch (Exception ex) { return BadRequest(new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpDelete("contacts/{identity}")]
    public async Task<IActionResult> DeleteContact(string identity)
    {
        try
        {
            await _svc.DeleteMailContactAsync(identity);
            return Ok(new ApiResponse<object> { Success = true, Message = "Contact supprimé" });
        }
        catch (Exception ex) { return BadRequest(new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchRecipients([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Ok(new ApiResponse<List<object>> { Success = true, Data = new() });
        try
        {
            var results = await _svc.SearchRecipientsAsync(q);
            return Ok(new ApiResponse<List<Dictionary<string, object>>> { Success = true, Data = results });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }
}

// ============================================================================
// FLUX MESSAGERIE (Transport Rules + Message Tracking)
// ============================================================================

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class MailFlowController : ControllerBase
{
    private readonly IMailFlowService _svc;
    private readonly ILogger<MailFlowController> _logger;

    public MailFlowController(IMailFlowService svc, ILogger<MailFlowController> logger)
    {
        _svc = svc;
        _logger = logger;
    }

    [HttpGet("rules")]
    public async Task<IActionResult> GetTransportRules()
    {
        try
        {
            var list = await _svc.GetTransportRulesAsync();
            return Ok(new ApiResponse<List<Dictionary<string, object>>> { Success = true, Data = list });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpPatch("rules/{identity}/state")]
    public async Task<IActionResult> SetRuleState(string identity, [FromBody] SetRuleStateRequest req)
    {
        try
        {
            await _svc.SetTransportRuleEnabledAsync(identity, req.Enabled);
            return Ok(new ApiResponse<object> { Success = true, Message = $"Règle {(req.Enabled ? "activée" : "désactivée")}" });
        }
        catch (Exception ex) { return BadRequest(new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpPost("rules")]
    public async Task<IActionResult> CreateRule([FromBody] CreateTransportRuleRequest req)
    {
        try
        {
            await _svc.CreateTransportRuleAsync(req);
            return Ok(new ApiResponse<object> { Success = true, Message = $"Règle '{req.Name}' créée" });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpDelete("rules/{identity}")]
    public async Task<IActionResult> DeleteRule(string identity)
    {
        try
        {
            await _svc.DeleteTransportRuleAsync(identity);
            return Ok(new ApiResponse<object> { Success = true, Message = $"Règle supprimée" });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpGet("tracking")]
    public async Task<IActionResult> TrackMessages(
        [FromQuery] string? sender,
        [FromQuery] string? recipient,
        [FromQuery] DateTime? start,
        [FromQuery] DateTime? end,
        [FromQuery] int maxResults = 100,
        [FromQuery] string? eventId = null)
    {
        try
        {
            var list = await _svc.TrackMessagesAsync(sender, recipient, start, end, maxResults, eventId);
            return Ok(new ApiResponse<List<Dictionary<string, object>>> { Success = true, Data = list });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpGet("send-connectors")]
    public async Task<IActionResult> GetSendConnectors()
    {
        try
        {
            var list = await _svc.GetSendConnectorsAsync();
            return Ok(new ApiResponse<List<Dictionary<string, object>>> { Success = true, Data = list });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }

    [HttpGet("receive-connectors")]
    public async Task<IActionResult> GetReceiveConnectors()
    {
        try
        {
            var list = await _svc.GetReceiveConnectorsAsync();
            return Ok(new ApiResponse<List<Dictionary<string, object>>> { Success = true, Data = list });
        }
        catch (Exception ex) { return StatusCode(500, new ApiResponse<object> { Success = false, Error = ex.Message }); }
    }
}

// ============================================================================
// REQUEST MODELS (Recipients + MailFlow)
// ============================================================================

public class CreateSharedMailboxRequest
{
    public required string Name { get; set; }
    public required string Alias { get; set; }
    public required string UserPrincipalName { get; set; }
    public string? Database { get; set; }
    public string? OrganizationalUnit { get; set; }
}

public class CreateResourceRequest
{
    public required string Type { get; set; }   // "Room" | "Equipment"
    public required string Name { get; set; }
    public required string Alias { get; set; }
    public required string UserPrincipalName { get; set; }
    public string? Database { get; set; }
    public string? OrganizationalUnit { get; set; }
}

public class CreateContactRequest
{
    public required string Name { get; set; }
    public required string ExternalEmailAddress { get; set; }
    public string? Alias { get; set; }
    public string? OrganizationalUnit { get; set; }
}

public class SetPermissionRequest
{
    public required string User { get; set; }
    public required string AccessRight { get; set; }  // "FullAccess" | "SendAs"
}

public class SetRuleStateRequest
{
    public bool Enabled { get; set; }
}
