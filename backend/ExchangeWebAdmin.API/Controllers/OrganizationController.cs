using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Controllers;

[ApiController]
[Route("api/organization")]
[Authorize]
public class OrganizationController : ControllerBase
{
    private readonly OrganizationService _org;
    private readonly ILogger<OrganizationController> _logger;

    public OrganizationController(OrganizationService org, ILogger<OrganizationController> logger)
    {
        _org = org;
        _logger = logger;
    }

    // =========================================================================
    // ORGANISATION
    // =========================================================================

    [HttpGet("config")]
    public async Task<IActionResult> GetOrganizationConfig()
    {
        try
        {
            var data = await _org.GetOrganizationConfigAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetOrganizationConfig");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpPut("config")]
    public async Task<IActionResult> SetOrganizationConfig([FromBody] Dictionary<string, object?> fields)
    {
        try
        {
            await _org.SetOrganizationConfigAsync(fields);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur SetOrganizationConfig");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("accepted-domains")]
    public async Task<IActionResult> GetAcceptedDomains()
    {
        try
        {
            var data = await _org.GetAcceptedDomainsAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetAcceptedDomains");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpPut("accepted-domains/{identity}")]
    public async Task<IActionResult> SetAcceptedDomain(string identity, [FromBody] AcceptedDomainUpdateRequest req)
    {
        try
        {
            await _org.SetAcceptedDomainAsync(identity, req.DomainType, req.MakeDefault);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur SetAcceptedDomain {Identity}", identity);
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpPost("accepted-domains")]
    public async Task<IActionResult> NewAcceptedDomain([FromBody] NewAcceptedDomainRequest req)
    {
        try
        {
            await _org.NewAcceptedDomainAsync(req.Name, req.DomainName, req.DomainType);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur NewAcceptedDomain");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpDelete("accepted-domains/{identity}")]
    public async Task<IActionResult> RemoveAcceptedDomain(string identity)
    {
        try
        {
            await _org.RemoveAcceptedDomainAsync(identity);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur RemoveAcceptedDomain {Identity}", identity);
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("email-address-policies")]
    public async Task<IActionResult> GetEmailAddressPolicies()
    {
        try
        {
            var data = await _org.GetEmailAddressPoliciesAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetEmailAddressPolicies");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpPost("email-address-policies")]
    public async Task<IActionResult> NewEmailAddressPolicy([FromBody] NewEmailAddressPolicyRequest req)
    {
        try
        {
            await _org.NewEmailAddressPolicyAsync(req.Name, req.SmtpTemplate, req.IncludedRecipients, req.Priority);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur NewEmailAddressPolicy");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpPatch("email-address-policies/{identity}")]
    public async Task<IActionResult> SetEmailAddressPolicy(string identity, [FromBody] SetEmailAddressPolicyRequest req)
    {
        try
        {
            await _org.SetEmailAddressPolicyAsync(identity, req.SmtpTemplate, req.IncludedRecipients, req.Priority);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur SetEmailAddressPolicy {Identity}", identity);
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpDelete("email-address-policies/{identity}")]
    public async Task<IActionResult> RemoveEmailAddressPolicy(string identity)
    {
        try
        {
            await _org.RemoveEmailAddressPolicyAsync(identity);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur RemoveEmailAddressPolicy {Identity}", identity);
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpPost("email-address-policies/{identity}/apply")]
    public async Task<IActionResult> ApplyEmailAddressPolicy(string identity)
    {
        try
        {
            await _org.ApplyEmailAddressPolicyAsync(identity);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur ApplyEmailAddressPolicy {Identity}", identity);
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("transport-config")]
    public async Task<IActionResult> GetTransportConfig()
    {
        try
        {
            var data = await _org.GetTransportConfigAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetTransportConfig");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpPut("transport-config")]
    public async Task<IActionResult> SetTransportConfig([FromBody] Dictionary<string, object?> fields)
    {
        try
        {
            await _org.SetTransportConfigAsync(fields);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur SetTransportConfig");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    // =========================================================================
    // SERVEURS
    // =========================================================================

    [HttpGet("servers")]
    public async Task<IActionResult> GetExchangeServers()
    {
        try
        {
            var data = await _org.GetExchangeServersAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetExchangeServers");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("servers/{serverName}/health")]
    public async Task<IActionResult> GetServerHealth(string serverName)
    {
        try
        {
            var data = await _org.GetServerHealthAsync(serverName);
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetServerHealth {Server}", serverName);
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("servers/{serverName}/queues")]
    public async Task<IActionResult> GetServerQueues(string serverName)
    {
        try
        {
            var data = await _org.GetTransportQueuesAsync(serverName);
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetServerQueues {Server}", serverName);
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    // =========================================================================
    // UTILISATEURS
    // =========================================================================

    [HttpGet("retention-policies")]
    public async Task<IActionResult> GetRetentionPolicies()
    {
        try
        {
            var data = await _org.GetRetentionPoliciesAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetRetentionPolicies");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("retention-policy-tags")]
    public async Task<IActionResult> GetRetentionPolicyTags()
    {
        try
        {
            var data = await _org.GetRetentionPolicyTagsAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetRetentionPolicyTags");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("role-assignment-policies")]
    public async Task<IActionResult> GetRoleAssignmentPolicies()
    {
        try
        {
            var data = await _org.GetRoleAssignmentPoliciesAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetRoleAssignmentPolicies");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpPut("role-assignment-policies/{name}")]
    public async Task<IActionResult> UpdateRoleAssignmentPolicy(string name, [FromBody] UpdateRoleGroupRequest req)
    {
        try { await _org.UpdateRoleAssignmentPolicyAsync(name, req.Description); return Ok(new { success = true }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpGet("mailbox-plans")]
    public async Task<IActionResult> GetMailboxPlans()
    {
        try
        {
            var data = await _org.GetMailboxPlansAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetMailboxPlans");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("address-lists")]
    public async Task<IActionResult> GetAddressLists()
    {
        try
        {
            var data = await _org.GetAddressListsAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetAddressLists");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("global-address-lists")]
    public async Task<IActionResult> GetGlobalAddressLists()
    {
        try
        {
            var data = await _org.GetGlobalAddressListsAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetGlobalAddressLists");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("offline-address-books")]
    public async Task<IActionResult> GetOfflineAddressBooks()
    {
        try { return Ok(new { success = true, data = await _org.GetOfflineAddressBooksAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpGet("sharing-policies")]
    public async Task<IActionResult> GetSharingPolicies()
    {
        try { return Ok(new { success = true, data = await _org.GetSharingPoliciesAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    // =========================================================================
    // AUTORISATIONS
    // =========================================================================

    [HttpGet("role-groups")]
    public async Task<IActionResult> GetRoleGroups()
    {
        try { return Ok(new { success = true, data = await _org.GetRoleGroupsAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpGet("role-groups/{name}/members")]
    public async Task<IActionResult> GetRoleGroupMembers(string name)
    {
        try { return Ok(new { success = true, data = await _org.GetRoleGroupMembersAsync(name) }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpPost("role-groups")]
    public async Task<IActionResult> CreateRoleGroup([FromBody] CreateRoleGroupRequest req)
    {
        try { await _org.CreateRoleGroupAsync(req.Name, req.Description); return Ok(new { success = true }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpPut("role-groups/{name}")]
    public async Task<IActionResult> UpdateRoleGroup(string name, [FromBody] UpdateRoleGroupRequest req)
    {
        try { await _org.UpdateRoleGroupAsync(name, req.Description); return Ok(new { success = true }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpDelete("role-groups/{name}")]
    public async Task<IActionResult> DeleteRoleGroup(string name)
    {
        try { await _org.DeleteRoleGroupAsync(name); return Ok(new { success = true }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpPost("role-groups/{name}/members/{member}")]
    public async Task<IActionResult> AddRoleGroupMember(string name, string member)
    {
        try { await _org.AddRoleGroupMemberAsync(name, member); return Ok(new { success = true }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpDelete("role-groups/{name}/members/{member}")]
    public async Task<IActionResult> RemoveRoleGroupMember(string name, string member)
    {
        try { await _org.RemoveRoleGroupMemberAsync(name, member); return Ok(new { success = true }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpGet("owa-policies")]
    public async Task<IActionResult> GetOwaMailboxPolicies()
    {
        try { return Ok(new { success = true, data = await _org.GetOwaMailboxPoliciesAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpPut("owa-policies/{name}")]
    public async Task<IActionResult> UpdateOwaMailboxPolicy(string name, [FromBody] UpdateOwaPolicyRequest req)
    {
        try { await _org.UpdateOwaMailboxPolicyAsync(name, req); return Ok(new { success = true }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    // =========================================================================
    // CONFORMITÉ
    // =========================================================================

    [HttpGet("journal-rules")]
    public async Task<IActionResult> GetJournalRules()
    {
        try { return Ok(new { success = true, data = await _org.GetJournalRulesAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    // =========================================================================
    // MOBILE
    // =========================================================================

    [HttpGet("activesync-policies")]
    public async Task<IActionResult> GetActiveSyncPolicies()
    {
        try { return Ok(new { success = true, data = await _org.GetActiveSyncPoliciesAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpGet("mobile-device-access-rules")]
    public async Task<IActionResult> GetMobileDeviceAccessRules()
    {
        try { return Ok(new { success = true, data = await _org.GetMobileDeviceAccessRulesAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    // =========================================================================
    // DOSSIERS PUBLICS
    // =========================================================================

    [HttpGet("public-folder-databases")]
    public async Task<IActionResult> GetPublicFolderDatabases()
    {
        try { return Ok(new { success = true, data = await _org.GetPublicFolderDatabasesAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    // =========================================================================
    // SERVEURS — DAG
    // =========================================================================

    [HttpGet("dag")]
    public async Task<IActionResult> GetDatabaseAvailabilityGroups()
    {
        try { return Ok(new { success = true, data = await _org.GetDatabaseAvailabilityGroupsAsync() }); }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpPost("dag")]
    public async Task<IActionResult> CreateDag([FromBody] CreateDagRequest req)
    {
        try
        {
            await _org.CreateDatabaseAvailabilityGroupAsync(req.Name, req.WitnessServer, req.WitnessDirectory);
            return Ok(new { success = true });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpPut("dag/{name}")]
    public async Task<IActionResult> UpdateDag(string name, [FromBody] UpdateDagRequest req)
    {
        try
        {
            await _org.UpdateDatabaseAvailabilityGroupAsync(name, req.WitnessServer, req.WitnessDirectory);
            return Ok(new { success = true });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpDelete("dag/{name}")]
    public async Task<IActionResult> DeleteDag(string name)
    {
        try
        {
            await _org.DeleteDatabaseAvailabilityGroupAsync(name);
            return Ok(new { success = true });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpPost("dag/{name}/members/{server}")]
    public async Task<IActionResult> AddDagMember(string name, string server)
    {
        try
        {
            await _org.AddDagMemberAsync(name, server);
            return Ok(new { success = true });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }

    [HttpDelete("dag/{name}/members/{server}")]
    public async Task<IActionResult> RemoveDagMember(string name, string server)
    {
        try
        {
            await _org.RemoveDagMemberAsync(name, server);
            return Ok(new { success = true });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, error = ex.Message }); }
    }
}

public record AcceptedDomainUpdateRequest(string? DomainType, bool? MakeDefault);
public record NewAcceptedDomainRequest(string Name, string DomainName, string DomainType);
public record NewEmailAddressPolicyRequest(string Name, string SmtpTemplate, string IncludedRecipients, int? Priority);
public record SetEmailAddressPolicyRequest(string? SmtpTemplate, string? IncludedRecipients, int? Priority);
public record CreateDagRequest(string Name, string WitnessServer, string WitnessDirectory);
public record UpdateDagRequest(string? WitnessServer, string? WitnessDirectory);
public record CreateRoleGroupRequest(string Name, string? Description);
public record UpdateRoleGroupRequest(string? Description);
public record UpdateOwaPolicyRequest(
    // Communication
    bool? InstantMessagingEnabled,
    bool? TextMessagingEnabled,
    bool? ActiveSyncIntegrationEnabled,
    bool? ContactsEnabled,
    // Informations
    bool? JournalEnabled,
    bool? NotesEnabled,
    bool? RemindersAndNotificationsEnabled,
    // Sécurité
    bool? ChangePasswordEnabled,
    bool? JunkEmailEnabled,
    bool? SMimeEnabled,
    bool? IRMEnabled,
    bool? DisplayPhotosEnabled,
    bool? SetPhotoEnabled,
    // Expérience utilisateur
    bool? ThemeSelectionEnabled,
    bool? PremiumClientEnabled,
    bool? SpellCheckerEnabled,
    // Carnet d'adresses
    bool? AllAddressListsEnabled,
    bool? GlobalAddressListEnabled,
    bool? PublicFoldersEnabled,
    // Organisation et fonctionnalités
    bool? CalendarEnabled,
    bool? TasksEnabled,
    bool? RulesEnabled,
    bool? SignaturesEnabled,
    bool? DelegateAccessEnabled,
    bool? RecoverDeletedItemsEnabled,
    bool? SearchFoldersEnabled,
    bool? WacEditingEnabled,
    // Accès fichiers
    bool? DirectFileAccessOnPublicComputersEnabled,
    bool? DirectFileAccessOnPrivateComputersEnabled,
    bool? WebReadyDocumentViewingOnPublicComputersEnabled,
    bool? WebReadyDocumentViewingOnPrivateComputersEnabled,
    bool? WacViewingOnPublicComputersEnabled,
    bool? WacViewingOnPrivateComputersEnabled,
    bool? WSSAccessOnPublicComputersEnabled,
    bool? UNCAccessOnPublicComputersEnabled,
    // Enum
    string? ActionForUnknownFileAndMIMETypes
);
