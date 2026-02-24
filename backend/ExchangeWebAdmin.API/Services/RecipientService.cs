using ExchangeWebAdmin.API.Models;

namespace ExchangeWebAdmin.API.Services;

public interface IRecipientService
{
    // Boîtes partagées
    Task<List<Dictionary<string, object>>> GetSharedMailboxesAsync();
    Task<Dictionary<string, object>> CreateSharedMailboxAsync(string name, string alias, string upn, string? database, string? ou);
    Task SetSharedMailboxPermissionsAsync(string identity, string user, string accessRight);
    // Ressources (salles + équipements)
    Task<List<Dictionary<string, object>>> GetResourcesAsync();
    Task<Dictionary<string, object>> CreateResourceAsync(string type, string name, string alias, string upn, string? database, string? ou);
    // Contacts
    Task<List<Dictionary<string, object>>> GetMailContactsAsync();
    Task<Dictionary<string, object>> CreateMailContactAsync(string name, string externalEmail, string? alias, string? ou);
    Task DeleteMailContactAsync(string identity);
    // Recherche destinataires (autocomplete)
    Task<List<Dictionary<string, object>>> SearchRecipientsAsync(string query);
}

public class RecipientService : IRecipientService
{
    private readonly IPowerShellService _ps;
    private readonly ILogger<RecipientService> _logger;

    public RecipientService(IPowerShellService ps, ILogger<RecipientService> logger)
    {
        _ps = ps;
        _logger = logger;
    }

    private static string Esc(string? v) => (v ?? "").Replace("'", "''");

    private async Task<List<Dictionary<string, object>>> SafeListAsync(string script, string ctx)
    {
        try
        {
            var result = await _ps.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> list ? list : new();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Commande PS non disponible ({Ctx})", ctx);
            return new();
        }
    }

    // =========================================================================
    // BOÎTES PARTAGÉES
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetSharedMailboxesAsync() =>
        await SafeListAsync(
            @"Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize Unlimited |
              Select-Object Name, DisplayName, Alias, PrimarySmtpAddress, Database,
                            OrganizationalUnit, WhenCreated, WhenChanged",
            "Get-Mailbox SharedMailbox");

    public async Task<Dictionary<string, object>> CreateSharedMailboxAsync(
        string name, string alias, string upn, string? database, string? ou)
    {
        _logger.LogInformation("Création boîte partagée {Name}", name);

        var sb = new System.Text.StringBuilder();
        sb.Append($"New-Mailbox -Name '{Esc(name)}' -Alias '{Esc(alias)}' -UserPrincipalName '{Esc(upn)}' -Shared");
        if (!string.IsNullOrEmpty(database)) sb.Append($" -Database '{Esc(database)}'");
        if (!string.IsNullOrEmpty(ou))       sb.Append($" -OrganizationalUnit '{Esc(ou)}'");

        await _ps.ExecuteScriptAsync(sb.ToString());

        var result = await SafeListAsync(
            $"Get-Mailbox -Identity '{Esc(upn)}' | Select-Object Name, DisplayName, Alias, PrimarySmtpAddress, Database, OrganizationalUnit",
            "Get-Mailbox after create shared");

        return result.Count > 0 ? result[0] : new();
    }

    public async Task SetSharedMailboxPermissionsAsync(string identity, string user, string accessRight)
    {
        _logger.LogInformation("Permission boîte partagée {Identity} -> {User} ({Right})", identity, user, accessRight);
        await _ps.ExecuteScriptAsync(
            $"Add-MailboxPermission -Identity '{Esc(identity)}' -User '{Esc(user)}' -AccessRights {Esc(accessRight)} -InheritanceType All -AutoMapping $false");
    }

    // =========================================================================
    // RESSOURCES (Salles + Équipements)
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetResourcesAsync() =>
        await SafeListAsync(
            @"Get-Mailbox -RecipientTypeDetails RoomMailbox,EquipmentMailbox -ResultSize Unlimited |
              Select-Object Name, DisplayName, Alias, PrimarySmtpAddress, Database,
                            OrganizationalUnit, RecipientTypeDetails, WhenCreated",
            "Get-Mailbox Resources");

    public async Task<Dictionary<string, object>> CreateResourceAsync(
        string type, string name, string alias, string upn, string? database, string? ou)
    {
        // type = "Room" | "Equipment"
        _logger.LogInformation("Création ressource {Type}: {Name}", type, name);

        var flag = type == "Room" ? "-Room" : "-Equipment";
        var sb = new System.Text.StringBuilder();
        sb.Append($"New-Mailbox -Name '{Esc(name)}' -Alias '{Esc(alias)}' -UserPrincipalName '{Esc(upn)}' {flag}");
        if (!string.IsNullOrEmpty(database)) sb.Append($" -Database '{Esc(database)}'");
        if (!string.IsNullOrEmpty(ou))       sb.Append($" -OrganizationalUnit '{Esc(ou)}'");

        await _ps.ExecuteScriptAsync(sb.ToString());

        var result = await SafeListAsync(
            $"Get-Mailbox -Identity '{Esc(upn)}' | Select-Object Name, DisplayName, Alias, PrimarySmtpAddress, Database, OrganizationalUnit, RecipientTypeDetails",
            "Get-Mailbox after create resource");

        return result.Count > 0 ? result[0] : new();
    }

    // =========================================================================
    // CONTACTS MESSAGERIE
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetMailContactsAsync() =>
        await SafeListAsync(
            @"Get-MailContact -ResultSize Unlimited |
              Select-Object Name, DisplayName, Alias, ExternalEmailAddress,
                            OrganizationalUnit, WhenCreated, WhenChanged",
            "Get-MailContact");

    public async Task<Dictionary<string, object>> CreateMailContactAsync(
        string name, string externalEmail, string? alias, string? ou)
    {
        _logger.LogInformation("Création contact {Name} -> {Email}", name, externalEmail);

        var sb = new System.Text.StringBuilder();
        sb.Append($"New-MailContact -Name '{Esc(name)}' -ExternalEmailAddress '{Esc(externalEmail)}'");
        if (!string.IsNullOrEmpty(alias)) sb.Append($" -Alias '{Esc(alias)}'");
        if (!string.IsNullOrEmpty(ou))    sb.Append($" -OrganizationalUnit '{Esc(ou)}'");

        await _ps.ExecuteScriptAsync(sb.ToString());

        var result = await SafeListAsync(
            $"Get-MailContact -Identity '{Esc(name)}' | Select-Object Name, DisplayName, Alias, ExternalEmailAddress, OrganizationalUnit, WhenCreated",
            "Get-MailContact after create");

        return result.Count > 0 ? result[0] : new();
    }

    public async Task DeleteMailContactAsync(string identity)
    {
        _logger.LogInformation("Suppression contact {Identity}", identity);
        await _ps.ExecuteScriptAsync($"Remove-MailContact -Identity '{Esc(identity)}' -Confirm:$false");
    }

    public async Task<List<Dictionary<string, object>>> SearchRecipientsAsync(string query)
    {
        var q = Esc(query.Trim());
        // Get-Recipient supporte -Filter avec LDAP filter syntax
        var script = $@"Get-Recipient -Filter {{(DisplayName -like '*{q}*') -or (Alias -like '*{q}*') -or (PrimarySmtpAddress -like '*{q}*')}} -ResultSize 15 |
            Select-Object Name, DisplayName, Alias, PrimarySmtpAddress, RecipientType";
        return await SafeListAsync(script, "Get-Recipient search");
    }
}
