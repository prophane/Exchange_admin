using ExchangeWebAdmin.API.Models;

namespace ExchangeWebAdmin.API.Services;

// ============================================================================
// VERSION SIMPLIFIÉE - Sans ConvertTo-Json pour compatibilité PS 2.0
// ============================================================================

public class DistributionGroupServiceSimple : IDistributionGroupService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<DistributionGroupService> _logger;

    public DistributionGroupServiceSimple(IPowerShellService psService, ILogger<DistributionGroupService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<IEnumerable<DistributionGroupDto>> GetDistributionGroupsAsync(int resultSize = 1000)
    {
        _logger.LogInformation("Récupération de {ResultSize} groupes de distribution", resultSize);

        var script = $@"
            Get-DistributionGroup -ResultSize {resultSize} | Select-Object Name, DisplayName, 
                PrimarySmtpAddress, Alias, ManagedBy, MemberJoinRestriction, 
                MemberDepartRestriction, WhenCreated
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        
        if (result is List<Dictionary<string, object>> dictList)
        {
            return dictList.Select(d => new DistributionGroupDto
            {
                Name = d.GetValueOrDefault("Name")?.ToString() ?? "",
                DisplayName = d.GetValueOrDefault("DisplayName")?.ToString() ?? "",
                PrimarySmtpAddress = d.GetValueOrDefault("PrimarySmtpAddress")?.ToString() ?? "",
                Alias = d.GetValueOrDefault("Alias")?.ToString() ?? "",
                ManagedBy = d.GetValueOrDefault("ManagedBy") is object[] arr ? arr.Select(o => o?.ToString() ?? "").ToArray() : null,
                MemberJoinRestriction = MapRestriction(d.GetValueOrDefault("MemberJoinRestriction")?.ToString()),
                MemberDepartRestriction = MapRestriction(d.GetValueOrDefault("MemberDepartRestriction")?.ToString()),
                WhenCreated = d.GetValueOrDefault("WhenCreated") as DateTime?
            }).ToList();
        }

        return new List<DistributionGroupDto>();
    }

    public async Task<DistributionGroupDto?> GetDistributionGroupAsync(string identity)
    {
        var script = $@"
            Get-DistributionGroup -Identity '{identity}' | Select-Object Name, DisplayName,
                PrimarySmtpAddress, Alias, ManagedBy, WhenCreated
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        
        if (result is List<Dictionary<string, object>> dictList && dictList.Count > 0)
        {
            var d = dictList[0];
            return new DistributionGroupDto
            {
                Name = d.GetValueOrDefault("Name")?.ToString() ?? "",
                DisplayName = d.GetValueOrDefault("DisplayName")?.ToString() ?? "",
                PrimarySmtpAddress = d.GetValueOrDefault("PrimarySmtpAddress")?.ToString() ?? "",
                Alias = d.GetValueOrDefault("Alias")?.ToString() ?? "",
                ManagedBy = d.GetValueOrDefault("ManagedBy") is object[] arr ? arr.Select(o => o?.ToString() ?? "").ToArray() : null,
                WhenCreated = d.GetValueOrDefault("WhenCreated") as DateTime?
            };
        }

        return null;
    }

    public async Task<IEnumerable<GroupMemberDto>> GetGroupMembersAsync(string identity)
    {
        var script = $@"
            Get-DistributionGroupMember -Identity '{identity}' -ResultSize 5000 | 
                Select-Object Name, DisplayName, PrimarySmtpAddress, RecipientTypeDetails
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        
        if (result is List<Dictionary<string, object>> dictList)
        {
            return dictList.Select(d => new GroupMemberDto
            {
                Name = d.GetValueOrDefault("Name")?.ToString() ?? "",
                DisplayName = d.GetValueOrDefault("DisplayName")?.ToString() ?? "",
                PrimarySmtpAddress = d.GetValueOrDefault("PrimarySmtpAddress")?.ToString() ?? "",
                RecipientType = MapRecipientType(d.GetValueOrDefault("RecipientTypeDetails")?.ToString() ?? "")
            }).ToList();
        }

        return new List<GroupMemberDto>();
    }

    private static string MapRestriction(string? raw) => raw switch
    {
        "0" or "Open"             => "Ouvert",
        "1" or "Closed"           => "Fermé",
        "2" or "ApprovalRequired" => "Approbation requise",
        null or ""                => "-",
        _                         => raw
    };

    private static string MapRecipientType(string raw) => raw switch
    {
        // Noms texte (Exchange retourne parfois le nom)
        "UserMailbox"                       => "Boîte aux lettres",
        "LinkedMailbox"                     => "Boîte liée",
        "SharedMailbox"                     => "Boîte partagée",
        "LegacyMailbox"                     => "Boîte héritée",
        "RoomMailbox"                       => "Salle",
        "EquipmentMailbox"                  => "Équipement",
        "MailContact"                       => "Contact",
        "MailUser"                          => "Utilisateur mail",
        "MailUniversalDistributionGroup"    => "Groupe de distribution",
        "MailUniversalSecurityGroup"        => "Groupe de sécurité",
        "DynamicDistributionGroup"          => "Groupe dynamique",
        "GroupMailbox"                      => "Boîte de groupe",
        // Valeurs numériques RecipientTypeDetails (via remoting)
        "1"                                 => "Boîte aux lettres",
        "2"                                 => "Boîte liée",
        "4"                                 => "Boîte partagée",
        "8"                                 => "Boîte héritée",
        "16"                                => "Salle",
        "32"                                => "Équipement",
        "128"                               => "Contact",
        "2048"                              => "Utilisateur mail",
        "67108864"                          => "Groupe dynamique",
        "1073741824"                        => "Groupe de distribution",
        "2147483648"                        => "Groupe de sécurité",
        _ when !string.IsNullOrEmpty(raw)   => raw,
        _                                   => "Utilisateur"
    };

    public async Task<DistributionGroupDto> CreateDistributionGroupAsync(CreateDistributionGroupRequest request)
    {
        _logger.LogInformation("Création du groupe {Name}", request.Name);

        var displayNamePart = !string.IsNullOrEmpty(request.DisplayName)
            ? $"-DisplayName '{request.DisplayName.Replace("'", "''")}'"
            : $"-DisplayName '{request.Name.Replace("'", "''")}'";

        var smtpPart = !string.IsNullOrEmpty(request.PrimarySmtpAddress)
            ? $"-PrimarySmtpAddress '{request.PrimarySmtpAddress.Replace("'", "''")}'"
            : "";

        var notesPart = !string.IsNullOrEmpty(request.Notes)
            ? $"-Notes '{request.Notes.Replace("'", "''")}'"
            : "";

        var script = $@"
            New-DistributionGroup -Name '{request.Name.Replace("'", "''")}'  -Alias '{request.Alias.Replace("'", "''")}' {displayNamePart} {smtpPart} {notesPart} -Type Distribution |
                Select-Object Name, DisplayName, PrimarySmtpAddress, Alias
        ";

        var result = await _psService.ExecuteScriptAsync(script);

        if (result is List<Dictionary<string, object>> list && list.Count > 0)
        {
            var d = list[0];
            return new DistributionGroupDto
            {
                Name = d.GetValueOrDefault("Name")?.ToString(),
                DisplayName = d.GetValueOrDefault("DisplayName")?.ToString(),
                PrimarySmtpAddress = d.GetValueOrDefault("PrimarySmtpAddress")?.ToString(),
                Alias = d.GetValueOrDefault("Alias")?.ToString(),
            };
        }

        return new DistributionGroupDto { Name = request.Name, Alias = request.Alias };
    }

    public async Task AddMemberAsync(string groupIdentity, string memberIdentity)
    {
        var script = $"Add-DistributionGroupMember -Identity '{groupIdentity}' -Member '{memberIdentity}'";
        await _psService.ExecuteScriptAsync(script);
    }

    public async Task RemoveMemberAsync(string groupIdentity, string memberIdentity)
    {
        var script = $"Remove-DistributionGroupMember -Identity '{groupIdentity}' -Member '{memberIdentity}' -Confirm:$false";
        await _psService.ExecuteScriptAsync(script);
    }
}

// ============================================================================
// Database Service - Version Simple
// ============================================================================

public class DatabaseServiceSimple : IDatabaseService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<DatabaseService> _logger;

    public DatabaseServiceSimple(IPowerShellService psService, ILogger<DatabaseService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<IEnumerable<MailboxDatabaseDto>> GetDatabasesAsync()
    {
        _logger.LogInformation("Récupération des bases de données");

        var script = @"Get-MailboxDatabase -Status | Select-Object Name, Server, Mounted, MountAtStartup, EdbFilePath, LogFolderPath, IssueWarningQuota, ProhibitSendQuota, ProhibitSendReceiveQuota, MailboxRetention, DeletedItemRetention, WhenCreated";

        var result = await _psService.ExecuteScriptAsync(script);

        if (result is List<Dictionary<string, object>> dictList)
        {
            return dictList.Select(d => new MailboxDatabaseDto
            {
                Name                       = d.GetValueOrDefault("Name")?.ToString() ?? "",
                Server                     = d.GetValueOrDefault("Server")?.ToString() ?? "",
                Mounted                    = d.GetValueOrDefault("Mounted") is true || d.GetValueOrDefault("MountAtStartup") is true,
                EdbFilePath                = d.GetValueOrDefault("EdbFilePath")?.ToString(),
                LogFolderPath              = d.GetValueOrDefault("LogFolderPath")?.ToString(),
                IssueWarningQuota          = d.GetValueOrDefault("IssueWarningQuota")?.ToString(),
                ProhibitSendQuota          = d.GetValueOrDefault("ProhibitSendQuota")?.ToString(),
                ProhibitSendReceiveQuota   = d.GetValueOrDefault("ProhibitSendReceiveQuota")?.ToString(),
                MailboxRetention           = d.GetValueOrDefault("MailboxRetention")?.ToString(),
                DeletedItemRetention       = d.GetValueOrDefault("DeletedItemRetention")?.ToString(),
                WhenCreated                = d.GetValueOrDefault("WhenCreated")?.ToString(),
            }).ToList();
        }

        return new List<MailboxDatabaseDto>();
    }

    public async Task<MailboxDatabaseDto?> GetDatabaseAsync(string identity)
    {
        var script = $"Get-MailboxDatabase -Identity '{identity}' -Status | Select-Object Name, Server, Mounted, MountAtStartup, EdbFilePath, LogFolderPath, IssueWarningQuota, ProhibitSendQuota, ProhibitSendReceiveQuota, MailboxRetention, DeletedItemRetention, WhenCreated";

        var result = await _psService.ExecuteScriptAsync(script);

        if (result is List<Dictionary<string, object>> dictList && dictList.Count > 0)
        {
            var d = dictList[0];
            return new MailboxDatabaseDto
            {
                Name                       = d.GetValueOrDefault("Name")?.ToString() ?? "",
                Server                     = d.GetValueOrDefault("Server")?.ToString() ?? "",
                Mounted                    = d.GetValueOrDefault("Mounted") is true || d.GetValueOrDefault("MountAtStartup") is true,
                EdbFilePath                = d.GetValueOrDefault("EdbFilePath")?.ToString(),
                LogFolderPath              = d.GetValueOrDefault("LogFolderPath")?.ToString(),
                IssueWarningQuota          = d.GetValueOrDefault("IssueWarningQuota")?.ToString(),
                ProhibitSendQuota          = d.GetValueOrDefault("ProhibitSendQuota")?.ToString(),
                ProhibitSendReceiveQuota   = d.GetValueOrDefault("ProhibitSendReceiveQuota")?.ToString(),
                MailboxRetention           = d.GetValueOrDefault("MailboxRetention")?.ToString(),
                DeletedItemRetention       = d.GetValueOrDefault("DeletedItemRetention")?.ToString(),
                WhenCreated                = d.GetValueOrDefault("WhenCreated")?.ToString(),
            };
        }

        return null;
    }

    public async Task MountDatabaseAsync(string identity)
    {
        var script = $"Mount-Database -Identity '{identity}'";
        await _psService.ExecuteScriptAsync(script);
    }

    public async Task DismountDatabaseAsync(string identity)
    {
        var script = $"Dismount-Database -Identity '{identity}' -Confirm:$false";
        await _psService.ExecuteScriptAsync(script);
    }

    public async Task UpdateDatabaseAsync(string identity, string? issueWarningQuota, string? prohibitSendQuota,
        string? prohibitSendReceiveQuota, string? mailboxRetention, string? deletedItemRetention)
    {
        _logger.LogInformation("Mise à jour base de données {Identity}", identity);
        var id = identity.Replace("'", "''");
        var parts = new List<string> { $"Set-MailboxDatabase -Identity '{id}'" };
        if (!string.IsNullOrWhiteSpace(issueWarningQuota))
            parts.Add($"-IssueWarningQuota '{issueWarningQuota.Replace("'", "''")}'");
        if (!string.IsNullOrWhiteSpace(prohibitSendQuota))
            parts.Add($"-ProhibitSendQuota '{prohibitSendQuota.Replace("'", "''")}'");
        if (!string.IsNullOrWhiteSpace(prohibitSendReceiveQuota))
            parts.Add($"-ProhibitSendReceiveQuota '{prohibitSendReceiveQuota.Replace("'", "''")}'");
        if (!string.IsNullOrWhiteSpace(mailboxRetention))
            parts.Add($"-MailboxRetention '{mailboxRetention.Replace("'", "''")}'");
        if (!string.IsNullOrWhiteSpace(deletedItemRetention))
            parts.Add($"-DeletedItemRetention '{deletedItemRetention.Replace("'", "''")}'");
        if (parts.Count > 1)
            await _psService.ExecuteScriptAsync(string.Join(" ", parts));
    }
}

// ============================================================================
// Queue Service - Version Simple
// ============================================================================

public class QueueServiceSimple : IQueueService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<QueueService> _logger;

    public QueueServiceSimple(IPowerShellService psService, ILogger<QueueService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<IEnumerable<QueueDto>> GetQueuesAsync(string? server = null)
    {
        _logger.LogInformation("Récupération des files d'attente");

        var serverParam = string.IsNullOrEmpty(server) ? "" : $"-Server '{server}'";
        var script = $@"
            Get-Queue {serverParam} | Select-Object Identity, DeliveryType, Status, 
                MessageCount, NextHopDomain, LastError
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        
        if (result is List<Dictionary<string, object>> dictList)
        {
            return dictList.Select(d => new QueueDto
            {
                Identity = d.GetValueOrDefault("Identity")?.ToString() ?? "",
                DeliveryType = d.GetValueOrDefault("DeliveryType")?.ToString() ?? "",
                Status = d.GetValueOrDefault("Status")?.ToString() ?? "",
                MessageCount = Convert.ToInt32(d.GetValueOrDefault("MessageCount") ?? 0),
                NextHopDomain = d.GetValueOrDefault("NextHopDomain")?.ToString(),
                LastError = d.GetValueOrDefault("LastError")?.ToString()
            }).ToList();
        }

        return new List<QueueDto>();
    }

    public async Task<IEnumerable<QueueMessageDto>> GetQueueMessagesAsync(string queueIdentity)
    {
        var script = $@"
            Get-Message -Queue '{queueIdentity}' -ResultSize 1000 | 
                Select-Object Identity, Subject, FromAddress, Status, Size, DateReceived
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        
        if (result is List<Dictionary<string, object>> dictList)
        {
            return dictList.Select(d => new QueueMessageDto
            {
                Identity = d.GetValueOrDefault("Identity")?.ToString() ?? "",
                Subject = d.GetValueOrDefault("Subject")?.ToString() ?? "",
                FromAddress = d.GetValueOrDefault("FromAddress")?.ToString() ?? "",
                Status = d.GetValueOrDefault("Status")?.ToString() ?? "",
                Size = Convert.ToInt64(d.GetValueOrDefault("Size") ?? 0L),
                DateReceived = d.GetValueOrDefault("DateReceived") as DateTime?
            }).ToList();
        }

        return new List<QueueMessageDto>();
    }

    public async Task RetryQueueAsync(string queueIdentity)
    {
        var script = $"Retry-Queue -Identity '{queueIdentity}' -Confirm:$false";
        await _psService.ExecuteScriptAsync(script);
    }

    public async Task SuspendQueueAsync(string queueIdentity)
    {
        var script = $"Suspend-Queue -Identity '{queueIdentity}' -Confirm:$false";
        await _psService.ExecuteScriptAsync(script);
    }

    public async Task ResumeQueueAsync(string queueIdentity)
    {
        var script = $"Resume-Queue -Identity '{queueIdentity}' -Confirm:$false";
        await _psService.ExecuteScriptAsync(script);
    }
}
