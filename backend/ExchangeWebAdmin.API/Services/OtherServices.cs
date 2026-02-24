using ExchangeWebAdmin.API.Models;

namespace ExchangeWebAdmin.API.Services;

// ============================================================================
// Distribution Group Service
// ============================================================================

public interface IDistributionGroupService
{
    Task<IEnumerable<DistributionGroupDto>> GetDistributionGroupsAsync(int resultSize = 1000);
    Task<DistributionGroupDto?> GetDistributionGroupAsync(string identity);
    Task<IEnumerable<GroupMemberDto>> GetGroupMembersAsync(string identity);
    Task<DistributionGroupDto> CreateDistributionGroupAsync(CreateDistributionGroupRequest request);
    Task AddMemberAsync(string groupIdentity, string memberIdentity);
    Task RemoveMemberAsync(string groupIdentity, string memberIdentity);
}

public class DistributionGroupService : IDistributionGroupService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<DistributionGroupService> _logger;

    public DistributionGroupService(IPowerShellService psService, ILogger<DistributionGroupService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<IEnumerable<DistributionGroupDto>> GetDistributionGroupsAsync(int resultSize = 1000)
    {
        _logger.LogInformation("Récupération de {ResultSize} groupes de distribution", resultSize);
        var script = $"Get-DistributionGroup -ResultSize {resultSize} | Select-Object Name, DisplayName, PrimarySmtpAddress, Alias, ManagedBy, MemberJoinRestriction, MemberDepartRestriction, WhenCreated";
        var result = await _psService.ExecuteScriptAsync(script);
        return MapToGroupDtos(result);
    }

    public async Task<DistributionGroupDto?> GetDistributionGroupAsync(string identity)
    {
        var safeId = identity.Replace("'", "''");
        var script = $"Get-DistributionGroup -Identity '{safeId}' | Select-Object Name, DisplayName, PrimarySmtpAddress, Alias, ManagedBy, MemberJoinRestriction, MemberDepartRestriction, WhenCreated";
        var result = await _psService.ExecuteScriptAsync(script);
        return MapToGroupDtos(result).FirstOrDefault();
    }

    public async Task<IEnumerable<GroupMemberDto>> GetGroupMembersAsync(string identity)
    {
        var safeId = identity.Replace("'", "''");
        // Pas de calculated property (@{N=...;E={...}}) ni ConvertTo-Json → interdit en NoLanguage
        // RecipientType est un enum .NET : FlattenValue retourne déjà son .ToString()
        var script = $"Get-DistributionGroupMember -Identity '{safeId}' -ResultSize 5000 | Select-Object Name, DisplayName, PrimarySmtpAddress, RecipientType";
        var result = await _psService.ExecuteScriptAsync(script);
        return MapToGroupMemberDtos(result);
    }

    public async Task<DistributionGroupDto> CreateDistributionGroupAsync(CreateDistributionGroupRequest request)
    {
        _logger.LogInformation("Création du groupe {Name}", request.Name);
        // Pas de splatting ($params = @{...}) ni ConvertTo-Json → interdit en NoLanguage
        var safeN = request.Name.Replace("'", "''");
        var safeA = request.Alias.Replace("'", "''");
        var script = $"New-DistributionGroup -Name '{safeN}' -Alias '{safeA}'";
        var extraParams = new Dictionary<string, object>();
        if (!string.IsNullOrEmpty(request.DisplayName))        extraParams["DisplayName"]        = request.DisplayName;
        if (!string.IsNullOrEmpty(request.PrimarySmtpAddress)) extraParams["PrimarySmtpAddress"] = request.PrimarySmtpAddress;
        if (!string.IsNullOrEmpty(request.OrganizationalUnit)) extraParams["OrganizationalUnit"] = request.OrganizationalUnit;
        if (!string.IsNullOrEmpty(request.Notes))              extraParams["Notes"]              = request.Notes;
        if (request.ManagedBy?.Length > 0)                     extraParams["ManagedBy"]          = request.ManagedBy;
        var result = await _psService.ExecuteScriptAsync(script, extraParams.Count > 0 ? extraParams : null);
        return MapToGroupDtos(result).FirstOrDefault()
            ?? throw new InvalidOperationException("Échec de création du groupe");
    }

    public async Task AddMemberAsync(string groupIdentity, string memberIdentity)
    {
        _logger.LogInformation("Ajout de {Member} au groupe {Group}", memberIdentity, groupIdentity);
        var safeG = groupIdentity.Replace("'", "''");
        var safeM = memberIdentity.Replace("'", "''");
        await _psService.ExecuteScriptAsync($"Add-DistributionGroupMember -Identity '{safeG}' -Member '{safeM}' -Confirm:$false");
    }

    public async Task RemoveMemberAsync(string groupIdentity, string memberIdentity)
    {
        _logger.LogInformation("Suppression de {Member} du groupe {Group}", memberIdentity, groupIdentity);
        var safeG = groupIdentity.Replace("'", "''");
        var safeM = memberIdentity.Replace("'", "''");
        await _psService.ExecuteScriptAsync($"Remove-DistributionGroupMember -Identity '{safeG}' -Member '{safeM}' -Confirm:$false");
    }

    private static IEnumerable<DistributionGroupDto> MapToGroupDtos(object result)
    {
        if (result is not List<Dictionary<string, object>> rows) return [];
        return rows.Select(d => new DistributionGroupDto
        {
            Name                    = SafeStr(d.GetValueOrDefault("Name")),
            DisplayName             = SafeStr(d.GetValueOrDefault("DisplayName")),
            PrimarySmtpAddress      = SafeStr(d.GetValueOrDefault("PrimarySmtpAddress")),
            Alias                   = SafeStr(d.GetValueOrDefault("Alias")),
            ManagedBy               = SafeList(d.GetValueOrDefault("ManagedBy")),
            MemberJoinRestriction   = SafeStr(d.GetValueOrDefault("MemberJoinRestriction")),
            MemberDepartRestriction = SafeStr(d.GetValueOrDefault("MemberDepartRestriction")),
            WhenCreated             = SafeDate(d.GetValueOrDefault("WhenCreated")),
        });
    }

    private static IEnumerable<GroupMemberDto> MapToGroupMemberDtos(object result)
    {
        if (result is not List<Dictionary<string, object>> rows) return [];
        return rows.Select(d => new GroupMemberDto
        {
            Name               = SafeStr(d.GetValueOrDefault("Name")),
            DisplayName        = SafeStr(d.GetValueOrDefault("DisplayName")),
            PrimarySmtpAddress = SafeStr(d.GetValueOrDefault("PrimarySmtpAddress")),
            RecipientType      = SafeStr(d.GetValueOrDefault("RecipientType")),
        });
    }

    private static string? SafeStr(object? v) => v switch
    {
        null                                                     => null,
        string s                                                 => string.IsNullOrEmpty(s) ? null : s,
        Dictionary<string, object> d when d.ContainsKey("Name")  => d["Name"]?.ToString(),
        Dictionary<string, object> d when d.ContainsKey("Value") => d["Value"]?.ToString(),
        _                                                        => v.ToString()
    };

    private static string[]? SafeList(object? v) => v switch
    {
        null           => null,
        List<object> l => l.Select(x => x?.ToString() ?? "").Where(x => x.Length > 0).ToArray(),
        string s       => string.IsNullOrEmpty(s) ? null : [s],
        _              => null
    };

    private static DateTime? SafeDate(object? v) => v switch
    {
        null                                            => null,
        DateTime dt                                     => dt,
        string s when DateTime.TryParse(s, out var dt)  => dt,
        _                                               => null
    };
}

// ============================================================================
// Database Service
// ============================================================================

public interface IDatabaseService
{
    Task<IEnumerable<MailboxDatabaseDto>> GetDatabasesAsync();
    Task<MailboxDatabaseDto?> GetDatabaseAsync(string identity);
    Task UpdateDatabaseAsync(string identity, string? issueWarningQuota, string? prohibitSendQuota,
        string? prohibitSendReceiveQuota, string? mailboxRetention, string? deletedItemRetention);
}

public class DatabaseService : IDatabaseService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<DatabaseService> _logger;

    public DatabaseService(IPowerShellService psService, ILogger<DatabaseService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<IEnumerable<MailboxDatabaseDto>> GetDatabasesAsync()
    {
        _logger.LogInformation("Récupération des bases de données");

        // Pas de ConvertTo-Json : ExecuteScriptAsync retourne déjà List<Dictionary<string,object>>
        var script = @"Get-MailboxDatabase -Status | Select-Object Name, Server, EdbFilePath, LogFolderPath,
            IssueWarningQuota, ProhibitSendQuota, ProhibitSendReceiveQuota,
            Mounted, MailboxRetention, DeletedItemRetention, WhenCreated";

        var result = await _psService.ExecuteScriptAsync(script);
        return MapToDatabaseDtos(result);
    }

    public async Task<MailboxDatabaseDto?> GetDatabaseAsync(string identity)
    {
        var safeId = identity.Replace("'", "''");
        var script = $@"Get-MailboxDatabase -Identity '{safeId}' -Status | Select-Object Name, Server, EdbFilePath, LogFolderPath,
            IssueWarningQuota, ProhibitSendQuota, ProhibitSendReceiveQuota,
            Mounted, MailboxRetention, DeletedItemRetention, WhenCreated";

        var result = await _psService.ExecuteScriptAsync(script);
        return MapToDatabaseDtos(result).FirstOrDefault();
    }

    public async Task UpdateDatabaseAsync(string identity, string? issueWarningQuota, string? prohibitSendQuota,
        string? prohibitSendReceiveQuota, string? mailboxRetention, string? deletedItemRetention)
    {
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

    // Mappe List<Dictionary<string,object>> → List<MailboxDatabaseDto>
    // Gère les cas où FlattenValue a retourné un objet complexe (dict) au lieu d'une string
    private static IEnumerable<MailboxDatabaseDto> MapToDatabaseDtos(object result)
    {
        if (result is not List<Dictionary<string, object>> rows)
            return [];

        return rows.Select(d => new MailboxDatabaseDto
        {
            Name                     = SafeStr(d.GetValueOrDefault("Name")),
            Server                   = SafeStr(d.GetValueOrDefault("Server")),
            EdbFilePath              = SafeStr(d.GetValueOrDefault("EdbFilePath")),
            LogFolderPath            = SafeStr(d.GetValueOrDefault("LogFolderPath")),
            IssueWarningQuota        = SafeStr(d.GetValueOrDefault("IssueWarningQuota")),
            ProhibitSendQuota        = SafeStr(d.GetValueOrDefault("ProhibitSendQuota")),
            ProhibitSendReceiveQuota = SafeStr(d.GetValueOrDefault("ProhibitSendReceiveQuota")),
            MailboxRetention         = SafeStr(d.GetValueOrDefault("MailboxRetention")),
            DeletedItemRetention     = SafeStr(d.GetValueOrDefault("DeletedItemRetention")),
            WhenCreated              = SafeStr(d.GetValueOrDefault("WhenCreated")),
            Mounted                  = d.GetValueOrDefault("Mounted") is bool b && b,
        });
    }

    // Extrait une string depuis une valeur FlattenValue (string directe ou dict Exchange)
    private static string? SafeStr(object? v) => v switch
    {
        null                             => null,
        string s                         => string.IsNullOrEmpty(s) ? null : s,
        // Objet Exchange désérialisé → FlattenValue l'a étendu en dict
        // "Name" présent → ADServerIdParameter, EnhancedFileInfo, etc.
        Dictionary<string, object> d when d.ContainsKey("Name")
                                         => d["Name"]?.ToString(),
        Dictionary<string, object> d when d.ContainsKey("Value")
                                         => d["Value"]?.ToString(),
        _                                => v.ToString()
    };
}

// ============================================================================
// Queue Service
// ============================================================================

public interface IQueueService
{
    Task<IEnumerable<QueueDto>> GetQueuesAsync(string? server = null);
    Task<IEnumerable<QueueMessageDto>> GetQueueMessagesAsync(string queueIdentity);
    Task RetryQueueAsync(string queueIdentity);
}

public class QueueService : IQueueService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<QueueService> _logger;

    public QueueService(IPowerShellService psService, ILogger<QueueService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<IEnumerable<QueueDto>> GetQueuesAsync(string? server = null)
    {
        _logger.LogInformation("Récupération des files d'attente");
        var script = string.IsNullOrEmpty(server)
            ? "Get-Queue | Select-Object Identity, DeliveryType, Status, MessageCount, NextHopDomain, LastError"
            : $"Get-Queue -Server '{server.Replace("'", "''")}' | Select-Object Identity, DeliveryType, Status, MessageCount, NextHopDomain, LastError";
        var result = await _psService.ExecuteScriptAsync(script);
        return MapToQueueDtos(result);
    }

    public async Task<IEnumerable<QueueMessageDto>> GetQueueMessagesAsync(string queueIdentity)
    {
        var safeQ = queueIdentity.Replace("'", "''");
        var script = $"Get-Message -Queue '{safeQ}' -ResultSize 1000 | Select-Object Identity, Subject, FromAddress, Status, Size, MessageSourceName, DateReceived";
        var result = await _psService.ExecuteScriptAsync(script);
        return MapToQueueMessageDtos(result);
    }

    public async Task RetryQueueAsync(string queueIdentity)
    {
        _logger.LogInformation("Relance de la file {Queue}", queueIdentity);
        var safeQ = queueIdentity.Replace("'", "''");
        await _psService.ExecuteScriptAsync($"Retry-Queue -Identity '{safeQ}' -Confirm:$false");
    }

    private static IEnumerable<QueueDto> MapToQueueDtos(object result)
    {
        if (result is not List<Dictionary<string, object>> rows) return [];
        return rows.Select(d => new QueueDto
        {
            Identity      = SafeStr(d.GetValueOrDefault("Identity")),
            DeliveryType  = SafeStr(d.GetValueOrDefault("DeliveryType")),
            Status        = SafeStr(d.GetValueOrDefault("Status")),
            MessageCount  = d.GetValueOrDefault("MessageCount") is int mc ? mc : 0,
            NextHopDomain = SafeStr(d.GetValueOrDefault("NextHopDomain")),
            LastError     = SafeStr(d.GetValueOrDefault("LastError")),
        });
    }

    private static IEnumerable<QueueMessageDto> MapToQueueMessageDtos(object result)
    {
        if (result is not List<Dictionary<string, object>> rows) return [];
        return rows.Select(d => new QueueMessageDto
        {
            Identity          = SafeStr(d.GetValueOrDefault("Identity")),
            Subject           = SafeStr(d.GetValueOrDefault("Subject")),
            FromAddress       = SafeStr(d.GetValueOrDefault("FromAddress")),
            Status            = SafeStr(d.GetValueOrDefault("Status")),
            Size              = d.GetValueOrDefault("Size") is long sz ? sz : 0,
            MessageSourceName = SafeStr(d.GetValueOrDefault("MessageSourceName")),
            DateReceived      = SafeDate(d.GetValueOrDefault("DateReceived")),
        });
    }

    private static string? SafeStr(object? v) => v switch
    {
        null                                                     => null,
        string s                                                 => string.IsNullOrEmpty(s) ? null : s,
        Dictionary<string, object> d when d.ContainsKey("Name")  => d["Name"]?.ToString(),
        Dictionary<string, object> d when d.ContainsKey("Value") => d["Value"]?.ToString(),
        _                                                        => v.ToString()
    };

    private static DateTime? SafeDate(object? v) => v switch
    {
        null                                           => null,
        DateTime dt                                    => dt,
        string s when DateTime.TryParse(s, out var dt) => dt,
        _                                              => null
    };
}

// ============================================================================
// Permission Service
// ============================================================================

public interface IPermissionService
{
    Task<IEnumerable<MailboxPermissionDto>> GetMailboxPermissionsAsync(string identity);
    Task AddMailboxPermissionAsync(string identity, AddPermissionRequest request);
    Task RemoveMailboxPermissionAsync(string identity, string user, string[] accessRights);
}

public class PermissionService : IPermissionService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<PermissionService> _logger;

    public PermissionService(IPowerShellService psService, ILogger<PermissionService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<IEnumerable<MailboxPermissionDto>> GetMailboxPermissionsAsync(string identity)
    {
        var safeId = identity.Replace("'", "''");
        // Where-Object avec scriptblock interdit en NoLanguage → filtrage en C#
        var script = $"Get-MailboxPermission -Identity '{safeId}' | Select-Object Identity, User, AccessRights, IsInherited, Deny";
        var result = await _psService.ExecuteScriptAsync(script);
        return MapToPermissionDtos(result);
    }

    public async Task AddMailboxPermissionAsync(string identity, AddPermissionRequest request)
    {
        _logger.LogInformation("Ajout de permission sur {Identity} pour {User}", identity, request.User);
        var safeId   = identity.Replace("'", "''");
        var safeUser = request.User.Replace("'", "''");
        var rights   = string.Join(",", request.AccessRights);
        await _psService.ExecuteScriptAsync($"Add-MailboxPermission -Identity '{safeId}' -User '{safeUser}' -AccessRights {rights} -Confirm:$false");
    }

    public async Task RemoveMailboxPermissionAsync(string identity, string user, string[] accessRights)
    {
        _logger.LogInformation("Suppression de permission sur {Identity} pour {User}", identity, user);
        var safeId   = identity.Replace("'", "''");
        var safeUser = user.Replace("'", "''");
        var rights   = string.Join(",", accessRights);
        await _psService.ExecuteScriptAsync($"Remove-MailboxPermission -Identity '{safeId}' -User '{safeUser}' -AccessRights {rights} -Confirm:$false");
    }

    private static IEnumerable<MailboxPermissionDto> MapToPermissionDtos(object result)
    {
        if (result is not List<Dictionary<string, object>> rows) return [];
        return rows
            .Where(d =>
            {
                // Filtrer en C# : exclure droits hérités et comptes NT AUTHORITY
                if (d.GetValueOrDefault("IsInherited") is bool b && b) return false;
                if (d.GetValueOrDefault("IsInherited")?.ToString()?.Equals("True", StringComparison.OrdinalIgnoreCase) == true) return false;
                var u = d.GetValueOrDefault("User")?.ToString() ?? "";
                return !u.StartsWith("NT AUTHORITY\\", StringComparison.OrdinalIgnoreCase);
            })
            .Select(d => new MailboxPermissionDto
            {
                Identity     = SafeStr(d.GetValueOrDefault("Identity")),
                User         = SafeStr(d.GetValueOrDefault("User")),
                AccessRights = SafeList(d.GetValueOrDefault("AccessRights")),
                Deny         = d.GetValueOrDefault("Deny") is bool deny && deny,
            });
    }

    private static string? SafeStr(object? v) => v switch
    {
        null                                                     => null,
        string s                                                 => string.IsNullOrEmpty(s) ? null : s,
        Dictionary<string, object> d when d.ContainsKey("Name")  => d["Name"]?.ToString(),
        Dictionary<string, object> d when d.ContainsKey("Value") => d["Value"]?.ToString(),
        _                                                        => v.ToString()
    };

    private static string[]? SafeList(object? v) => v switch
    {
        null           => null,
        List<object> l => l.Select(x => x?.ToString() ?? "").Where(x => x.Length > 0).ToArray(),
        string s       => string.IsNullOrEmpty(s) ? null : [s],
        _              => null
    };
}

// ============================================================================
// Audit Service
// ============================================================================

public interface IAuditService
{
    Task LogActionAsync(string user, string action, string resource, string? details = null);
    Task<IEnumerable<AuditEntry>> GetAuditLogsAsync(DateTime? from = null, DateTime? to = null);
}

public class AuditEntry
{
    public DateTime Timestamp { get; set; }
    public required string User { get; set; }
    public required string Action { get; set; }
    public required string Resource { get; set; }
    public string? Details { get; set; }
    public bool Success { get; set; }
}

public class AuditService : IAuditService
{
    private readonly ILogger<AuditService> _logger;
    private readonly string _auditLogPath;

    public AuditService(ILogger<AuditService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _auditLogPath = configuration["SecuritySettings:AuditLogPath"] ?? "C:\\Logs\\ExchangeWebAdmin";
        
        if (!Directory.Exists(_auditLogPath))
        {
            Directory.CreateDirectory(_auditLogPath);
        }
    }

    public async Task LogActionAsync(string user, string action, string resource, string? details = null)
    {
        var entry = new AuditEntry
        {
            Timestamp = DateTime.UtcNow,
            User = user,
            Action = action,
            Resource = resource,
            Details = details,
            Success = true
        };

        var logFile = Path.Combine(_auditLogPath, $"audit-{DateTime.UtcNow:yyyyMMdd}.log");
        var logLine = System.Text.Json.JsonSerializer.Serialize(entry);

        await File.AppendAllTextAsync(logFile, logLine + Environment.NewLine);
        
        _logger.LogInformation("Audit: {User} - {Action} - {Resource}", user, action, resource);
    }

    public async Task<IEnumerable<AuditEntry>> GetAuditLogsAsync(DateTime? from = null, DateTime? to = null)
    {
        var entries = new List<AuditEntry>();
        var fromDate = from ?? DateTime.UtcNow.AddDays(-7);
        var toDate = to ?? DateTime.UtcNow;

        for (var date = fromDate; date <= toDate; date = date.AddDays(1))
        {
            var logFile = Path.Combine(_auditLogPath, $"audit-{date:yyyyMMdd}.log");
            
            if (!File.Exists(logFile))
                continue;

            var lines = await File.ReadAllLinesAsync(logFile);
            
            foreach (var line in lines)
            {
                try
                {
                    var entry = System.Text.Json.JsonSerializer.Deserialize<AuditEntry>(line);
                    if (entry != null)
                        entries.Add(entry);
                }
                catch
                {
                    // Ignorer les lignes mal formées
                }
            }
        }

        return entries.OrderByDescending(e => e.Timestamp);
    }
}
