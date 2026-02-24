using ExchangeWebAdmin.API.Models;

namespace ExchangeWebAdmin.API.Services;

public interface IMailboxService
{
    Task<IEnumerable<MailboxDto>> GetMailboxesAsync(int resultSize = 1000);
    Task<MailboxDto?> GetMailboxAsync(string identity);
    Task<MailboxStatisticsDto?> GetMailboxStatisticsAsync(string identity);
    Task<MailboxDto> CreateMailboxAsync(CreateMailboxRequest request);
    Task<MailboxDto> UpdateMailboxAsync(string identity, UpdateMailboxRequest request);
    Task DeleteMailboxAsync(string identity, bool permanent = false);
    Task<IEnumerable<string>> GetOrganizationalUnitsAsync();
}

public class MailboxService : IMailboxService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<MailboxService> _logger;

    public MailboxService(IPowerShellService psService, ILogger<MailboxService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<IEnumerable<MailboxDto>> GetMailboxesAsync(int resultSize = 1000)
    {
        _logger.LogInformation("Récupération de {ResultSize} boîtes aux lettres", resultSize);

        // Récupération des boîtes aux lettres - les types Exchange seront convertis automatiquement
        var script = $@"
            Get-Mailbox -ResultSize {resultSize} | Select-Object Name, DisplayName,
                PrimarySmtpAddress, Alias, Database, OrganizationalUnit,
                RecipientType, RecipientTypeDetails,
                WhenCreated, WhenChanged, IssueWarningQuota,
                ProhibitSendQuota, ProhibitSendReceiveQuota, UseDatabaseQuotaDefaults
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        
        // Le résultat est déjà une liste de dictionnaires
        if (result is List<Dictionary<string, object>> dictList)
        {
            return dictList.Select(d => new MailboxDto
            {
                Name = d.GetValueOrDefault("Name")?.ToString() ?? "",
                DisplayName = d.GetValueOrDefault("DisplayName")?.ToString() ?? "",
                PrimarySmtpAddress = d.GetValueOrDefault("PrimarySmtpAddress")?.ToString() ?? "",
                Alias = d.GetValueOrDefault("Alias")?.ToString() ?? "",
                Database = d.GetValueOrDefault("Database")?.ToString() ?? "",
                OrganizationalUnit = d.GetValueOrDefault("OrganizationalUnit")?.ToString() ?? "",
                RecipientType = d.GetValueOrDefault("RecipientType")?.ToString() ?? "",
                RecipientTypeDetails = d.GetValueOrDefault("RecipientTypeDetails")?.ToString() ?? "",
                WhenCreated = d.GetValueOrDefault("WhenCreated") as DateTime?,
                WhenChanged = d.GetValueOrDefault("WhenChanged") as DateTime?,
                IssueWarningQuota = d.GetValueOrDefault("IssueWarningQuota")?.ToString(),
                ProhibitSendQuota = d.GetValueOrDefault("ProhibitSendQuota")?.ToString(),
                ProhibitSendReceiveQuota = d.GetValueOrDefault("ProhibitSendReceiveQuota")?.ToString(),
                UseDatabaseQuotaDefaults = d.GetValueOrDefault("UseDatabaseQuotaDefaults") as bool? ?? false
            }).ToList();
        }

        return new List<MailboxDto>();
    }

    public async Task<MailboxDto?> GetMailboxAsync(string identity)
    {
        _logger.LogInformation("Récupération de la boîte aux lettres {Identity}", identity);

        var mbxScript = $@"
            Get-Mailbox -Identity '{identity}' | Select-Object Name, DisplayName,
                PrimarySmtpAddress, Alias, Database, OrganizationalUnit,
                RecipientType, RecipientTypeDetails,
                WhenCreated, WhenChanged, IssueWarningQuota,
                ProhibitSendQuota, ProhibitSendReceiveQuota, UseDatabaseQuotaDefaults,
                HiddenFromAddressListsEnabled, EmailAddresses, MailTip,
                ForwardingAddress, DeliverToMailboxAndForward, UserPrincipalName
        ";

        var userScript = $@"
            Get-User -Identity '{identity}' | Select-Object FirstName, LastName, Initials,
                Phone, MobilePhone, Fax, Title, Department, Company, Office, Manager,
                StreetAddress, City, StateOrProvince, PostalCode, CountryOrRegion, Notes
        ";

        var mbxResult = await _psService.ExecuteScriptAsync(mbxScript);
        var userResult = await _psService.ExecuteScriptAsync(userScript);

        MailboxDto? dto = null;

        if (mbxResult is List<Dictionary<string, object>> dl && dl.Count > 0)
        {
            var d = dl[0];

            // EmailAddresses: extract only SMTP addresses
            var emailAddrs = Array.Empty<string>();
            if (d.GetValueOrDefault("EmailAddresses") is System.Collections.IEnumerable ea)
            {
                emailAddrs = ea.Cast<object>()
                    .Select(o => o?.ToString() ?? "")
                    .Where(s => s.StartsWith("SMTP:", StringComparison.OrdinalIgnoreCase))
                    .Select(s => s.Substring(5))
                    .ToArray();
            }

            dto = new MailboxDto
            {
                Name = d.GetValueOrDefault("Name")?.ToString() ?? "",
                DisplayName = d.GetValueOrDefault("DisplayName")?.ToString() ?? "",
                PrimarySmtpAddress = d.GetValueOrDefault("PrimarySmtpAddress")?.ToString() ?? "",
                Alias = d.GetValueOrDefault("Alias")?.ToString() ?? "",
                Database = d.GetValueOrDefault("Database")?.ToString() ?? "",
                OrganizationalUnit = d.GetValueOrDefault("OrganizationalUnit")?.ToString() ?? "",
                RecipientType = d.GetValueOrDefault("RecipientType")?.ToString() ?? "",
                RecipientTypeDetails = d.GetValueOrDefault("RecipientTypeDetails")?.ToString() ?? "",
                WhenCreated = d.GetValueOrDefault("WhenCreated") as DateTime?,
                WhenChanged = d.GetValueOrDefault("WhenChanged") as DateTime?,
                IssueWarningQuota = d.GetValueOrDefault("IssueWarningQuota")?.ToString(),
                ProhibitSendQuota = d.GetValueOrDefault("ProhibitSendQuota")?.ToString(),
                ProhibitSendReceiveQuota = d.GetValueOrDefault("ProhibitSendReceiveQuota")?.ToString(),
                UseDatabaseQuotaDefaults = d.GetValueOrDefault("UseDatabaseQuotaDefaults") as bool? ?? false,
                HiddenFromAddressListsEnabled = d.GetValueOrDefault("HiddenFromAddressListsEnabled") as bool? ?? false,
                EmailAddresses = emailAddrs,
                MailTip = d.GetValueOrDefault("MailTip")?.ToString(),
                ForwardingAddress = d.GetValueOrDefault("ForwardingAddress")?.ToString(),
                DeliverToMailboxAndForward = d.GetValueOrDefault("DeliverToMailboxAndForward") as bool? ?? false,
                UserPrincipalName = d.GetValueOrDefault("UserPrincipalName")?.ToString(),
            };
        }

        if (dto != null && userResult is List<Dictionary<string, object>> ul && ul.Count > 0)
        {
            var u = ul[0];
            dto.FirstName = u.GetValueOrDefault("FirstName")?.ToString();
            dto.LastName = u.GetValueOrDefault("LastName")?.ToString();
            dto.Initials = u.GetValueOrDefault("Initials")?.ToString();
            dto.Phone = u.GetValueOrDefault("Phone")?.ToString();
            dto.MobilePhone = u.GetValueOrDefault("MobilePhone")?.ToString();
            dto.Fax = u.GetValueOrDefault("Fax")?.ToString();
            dto.Title = u.GetValueOrDefault("Title")?.ToString();
            dto.Department = u.GetValueOrDefault("Department")?.ToString();
            dto.Company = u.GetValueOrDefault("Company")?.ToString();
            dto.Office = u.GetValueOrDefault("Office")?.ToString();
            dto.Manager = u.GetValueOrDefault("Manager")?.ToString();
            dto.StreetAddress = u.GetValueOrDefault("StreetAddress")?.ToString();
            dto.City = u.GetValueOrDefault("City")?.ToString();
            dto.StateOrProvince = u.GetValueOrDefault("StateOrProvince")?.ToString();
            dto.PostalCode = u.GetValueOrDefault("PostalCode")?.ToString();
            dto.CountryOrRegion = u.GetValueOrDefault("CountryOrRegion")?.ToString();
            dto.Notes = u.GetValueOrDefault("Notes")?.ToString();
        }

        return dto;
    }

    public async Task<MailboxStatisticsDto?> GetMailboxStatisticsAsync(string identity)
    {
        _logger.LogInformation("Récupération des statistiques pour {Identity}", identity);

        // Pas de calculated properties (script blocks bloqués en restricted mode)
        // TotalItemSize et TotalDeletedItemSize seront convers en string côté C#
        var script = $"Get-MailboxStatistics -Identity '{EscapePs(identity)}' | Select-Object DisplayName, ItemCount, TotalItemSize, TotalDeletedItemSize, LastLogonTime, LastLogoffTime, Database";

        var result = await _psService.ExecuteScriptAsync(script);

        if (result is List<Dictionary<string, object>> dictList && dictList.Count > 0)
        {
            var d = dictList[0];
            return new MailboxStatisticsDto
            {
                DisplayName = d.GetValueOrDefault("DisplayName")?.ToString() ?? "",
                ItemCount = ParseLong(d.GetValueOrDefault("ItemCount")),
                TotalItemSize = d.GetValueOrDefault("TotalItemSize")?.ToString() ?? "",
                TotalDeletedItemSize = d.GetValueOrDefault("TotalDeletedItemSize")?.ToString() ?? "",
                LastLogonTime = d.GetValueOrDefault("LastLogonTime") as DateTime?,
                LastLogoffTime = d.GetValueOrDefault("LastLogoffTime") as DateTime?,
                Database = d.GetValueOrDefault("Database")?.ToString() ?? ""
            };
        }

        return null;
    }

    public async Task<IEnumerable<string>> GetOrganizationalUnitsAsync()
    {
        _logger.LogInformation("Récupération des UOs Active Directory");
        // -ExpandProperty retourne des strings brutes non lisibles par le convertisseur — on prend l'objet complet
        var script = @"Get-OrganizationalUnit -IncludeContainers | Select-Object Name, DistinguishedName";
        var result = await _psService.ExecuteScriptAsync(script);
        if (result is List<Dictionary<string, object>> dictList)
            return dictList
                .Select(d => d.GetValueOrDefault("DistinguishedName")?.ToString() ?? string.Empty)
                .Where(s => !string.IsNullOrEmpty(s))
                .OrderBy(s => s)
                .ToList();
        return new List<string>();
    }

    public async Task<MailboxDto> CreateMailboxAsync(CreateMailboxRequest request)
    {
        _logger.LogInformation("Création de la boîte aux lettres {UserPrincipalName}", request.UserPrincipalName);

        // ConvertTo-SecureString n'est PAS disponible dans la session Exchange distante.
        // On crée le SecureString côté .NET et on le passe via $args[0] à Invoke-Command.
        var securePassword = new System.Security.SecureString();
        foreach (char c in request.Password) securePassword.AppendChar(c);
        securePassword.MakeReadOnly();

        var scriptParts = new System.Text.StringBuilder();
        scriptParts.Append($"New-Mailbox -Name '{EscapePs(request.Name)}' -Alias '{EscapePs(request.Alias)}' -UserPrincipalName '{EscapePs(request.UserPrincipalName)}' -Password $args[0]");
        if (!string.IsNullOrEmpty(request.FirstName)) scriptParts.Append($" -FirstName '{EscapePs(request.FirstName)}'");
        if (!string.IsNullOrEmpty(request.LastName))  scriptParts.Append($" -LastName '{EscapePs(request.LastName)}'");
        if (!string.IsNullOrEmpty(request.Database))  scriptParts.Append($" -Database '{EscapePs(request.Database)}'");
        if (!string.IsNullOrEmpty(request.OrganizationalUnit)) scriptParts.Append($" -OrganizationalUnit '{EscapePs(request.OrganizationalUnit)}'");
        if (request.ResetPasswordOnNextLogon == "true") scriptParts.Append(" -ResetPasswordOnNextLogon $true");

        var parameters = new Dictionary<string, object> { { "Password", securePassword } };
        await _psService.ExecuteScriptAsync(scriptParts.ToString(), parameters);

        // Relire la boîte nouvellement créée
        var fetchScript = $"Get-Mailbox -Identity '{EscapePs(request.UserPrincipalName)}' | Select-Object Name, DisplayName, PrimarySmtpAddress, Alias, Database, OrganizationalUnit";
        var fetchResult = await _psService.ExecuteScriptAsync(fetchScript);

        if (fetchResult is List<Dictionary<string, object>> dl && dl.Count > 0)
        {
            var d = dl[0];
            var mailbox = new MailboxDto
            {
                Name        = d.GetValueOrDefault("Name")?.ToString() ?? request.Name,
                DisplayName = d.GetValueOrDefault("DisplayName")?.ToString() ?? request.Name,
                PrimarySmtpAddress = d.GetValueOrDefault("PrimarySmtpAddress")?.ToString() ?? request.UserPrincipalName,
                Alias       = d.GetValueOrDefault("Alias")?.ToString() ?? request.Alias,
                Database    = d.GetValueOrDefault("Database")?.ToString() ?? "",
                OrganizationalUnit = d.GetValueOrDefault("OrganizationalUnit")?.ToString() ?? "",
            };
            _logger.LogInformation("Boîte aux lettres créée: {PrimarySmtpAddress}", mailbox.PrimarySmtpAddress);
            return mailbox;
        }

        // Retourner un DTO minimal si le Get échoue (création quand même réussie)
        return new MailboxDto { Name = request.Name, Alias = request.Alias, PrimarySmtpAddress = request.UserPrincipalName };
    }

    private static string EscapePs(string? value) => (value ?? string.Empty).Replace("'", "''");

    private static int ParseLong(object? value)
    {
        if (value == null) return 0;
        return value switch
        {
            int i    => i,
            long l   => (int)l,
            uint u   => (int)u,
            ulong ul => (int)ul,
            double d => (int)d,
            float f  => (int)f,
            _        => int.TryParse(value.ToString(), out int r) ? r : 0
        };
    }

    public async Task<MailboxDto> UpdateMailboxAsync(string identity, UpdateMailboxRequest request)
    {
        _logger.LogInformation("Modification de la boîte aux lettres {Identity}", identity);

        // --- Set-Mailbox ---
        var mbxParts = new List<string> { $"-Identity '{EscapePs(identity)}'" };
        if (!string.IsNullOrEmpty(request.DisplayName))
            mbxParts.Add($"-DisplayName '{EscapePs(request.DisplayName)}'");
        if (!string.IsNullOrEmpty(request.Alias))
            mbxParts.Add($"-Alias '{EscapePs(request.Alias)}'");
        if (!string.IsNullOrEmpty(request.IssueWarningQuota))
            mbxParts.Add($"-IssueWarningQuota '{EscapePs(request.IssueWarningQuota)}'");
        if (!string.IsNullOrEmpty(request.ProhibitSendQuota))
            mbxParts.Add($"-ProhibitSendQuota '{EscapePs(request.ProhibitSendQuota)}'");
        if (!string.IsNullOrEmpty(request.ProhibitSendReceiveQuota))
            mbxParts.Add($"-ProhibitSendReceiveQuota '{EscapePs(request.ProhibitSendReceiveQuota)}'");
        if (request.UseDatabaseQuotaDefaults.HasValue)
            mbxParts.Add($"-UseDatabaseQuotaDefaults ${request.UseDatabaseQuotaDefaults.Value.ToString().ToLower()}");
        if (request.HiddenFromAddressListsEnabled.HasValue)
            mbxParts.Add($"-HiddenFromAddressListsEnabled ${request.HiddenFromAddressListsEnabled.Value.ToString().ToLower()}");
        if (request.MailTip != null)
            mbxParts.Add($"-MailTip '{EscapePs(request.MailTip)}'");
        if (!string.IsNullOrEmpty(request.ForwardingAddress))
            mbxParts.Add($"-ForwardingAddress '{EscapePs(request.ForwardingAddress)}'");
        if (request.DeliverToMailboxAndForward.HasValue)
            mbxParts.Add($"-DeliverToMailboxAndForward ${request.DeliverToMailboxAndForward.Value.ToString().ToLower()}");

        await _psService.ExecuteScriptAsync($"Set-Mailbox {string.Join(" ", mbxParts)}");

        // --- Set-User (if user-level fields provided) ---
        var userParts = new List<string> { $"-Identity '{EscapePs(identity)}'" };
        if (!string.IsNullOrEmpty(request.FirstName))   userParts.Add($"-FirstName '{EscapePs(request.FirstName)}'");
        if (!string.IsNullOrEmpty(request.LastName))    userParts.Add($"-LastName '{EscapePs(request.LastName)}'");
        if (request.Initials != null)                   userParts.Add($"-Initials '{EscapePs(request.Initials)}'");
        if (!string.IsNullOrEmpty(request.Phone))       userParts.Add($"-Phone '{EscapePs(request.Phone)}'");
        if (!string.IsNullOrEmpty(request.MobilePhone)) userParts.Add($"-MobilePhone '{EscapePs(request.MobilePhone)}'");
        if (!string.IsNullOrEmpty(request.Fax))         userParts.Add($"-Fax '{EscapePs(request.Fax)}'");
        if (!string.IsNullOrEmpty(request.Title))       userParts.Add($"-Title '{EscapePs(request.Title)}'");
        if (!string.IsNullOrEmpty(request.Department))  userParts.Add($"-Department '{EscapePs(request.Department)}'");
        if (!string.IsNullOrEmpty(request.Company))     userParts.Add($"-Company '{EscapePs(request.Company)}'");
        if (!string.IsNullOrEmpty(request.Office))      userParts.Add($"-Office '{EscapePs(request.Office)}'");
        if (!string.IsNullOrEmpty(request.Manager))     userParts.Add($"-Manager '{EscapePs(request.Manager)}'");
        if (!string.IsNullOrEmpty(request.StreetAddress)) userParts.Add($"-StreetAddress '{EscapePs(request.StreetAddress)}'");
        if (!string.IsNullOrEmpty(request.City))        userParts.Add($"-City '{EscapePs(request.City)}'");
        if (!string.IsNullOrEmpty(request.StateOrProvince)) userParts.Add($"-StateOrProvince '{EscapePs(request.StateOrProvince)}'");
        if (!string.IsNullOrEmpty(request.PostalCode))  userParts.Add($"-PostalCode '{EscapePs(request.PostalCode)}'");
        if (!string.IsNullOrEmpty(request.CountryOrRegion)) userParts.Add($"-CountryOrRegion '{EscapePs(request.CountryOrRegion)}'");
        if (!string.IsNullOrEmpty(request.Notes))       userParts.Add($"-Notes '{EscapePs(request.Notes)}'");

        if (userParts.Count > 1)
            await _psService.ExecuteScriptAsync($"Set-User {string.Join(" ", userParts)}");

        // Relire après modification
        return await GetMailboxAsync(identity) ?? new MailboxDto { Name = identity, PrimarySmtpAddress = identity };
    }

    public async Task DeleteMailboxAsync(string identity, bool permanent = false)
    {
        _logger.LogWarning("Suppression de la boîte aux lettres {Identity} (Permanent: {Permanent})", identity, permanent);

        var script = permanent
            ? $"Remove-Mailbox -Identity '{identity}' -Permanent $true -Confirm:$false"
            : $"Disable-Mailbox -Identity '{identity}' -Confirm:$false";

        await _psService.ExecuteScriptAsync(script);
        
        _logger.LogInformation("Boîte aux lettres supprimée: {Identity}", identity);
    }

}
