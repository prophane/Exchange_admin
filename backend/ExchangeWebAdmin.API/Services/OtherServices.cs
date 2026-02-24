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

        var script = $@"
            Get-DistributionGroup -ResultSize {resultSize} | Select-Object Name, DisplayName, 
                PrimarySmtpAddress, Alias, ManagedBy, MemberJoinRestriction, 
                MemberDepartRestriction, WhenCreated | ConvertTo-Json -Depth 3
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        return ParseJsonResult<List<DistributionGroupDto>>(result) ?? new List<DistributionGroupDto>();
    }

    public async Task<DistributionGroupDto?> GetDistributionGroupAsync(string identity)
    {
        var script = $@"
            Get-DistributionGroup -Identity '{identity}' | Select-Object Name, DisplayName,
                PrimarySmtpAddress, Alias, ManagedBy, WhenCreated | ConvertTo-Json -Depth 3
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        return ParseJsonResult<DistributionGroupDto>(result);
    }

    public async Task<IEnumerable<GroupMemberDto>> GetGroupMembersAsync(string identity)
    {
        var script = $@"
            @(Get-DistributionGroupMember -Identity '{identity}' -ResultSize 5000 | 
                Select-Object Name, DisplayName, PrimarySmtpAddress, @{{N='RecipientType'; E={{$_.RecipientType.ToString()}}}}) | 
                ConvertTo-Json -Depth 3
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        return ParseJsonResult<List<GroupMemberDto>>(result) ?? new List<GroupMemberDto>();
    }

    public async Task<DistributionGroupDto> CreateDistributionGroupAsync(CreateDistributionGroupRequest request)
    {
        _logger.LogInformation("Création du groupe {Name}", request.Name);

        var managedByParam = request.ManagedBy != null && request.ManagedBy.Length > 0
            ? $"$params.ManagedBy = @('{string.Join("','", request.ManagedBy)}')"
            : "";

        var ouParam = !string.IsNullOrEmpty(request.OrganizationalUnit)
            ? $"$params.OrganizationalUnit = '{request.OrganizationalUnit}'"
            : "";

        var script = $@"
            $params = @{{
                Name = '{request.Name}'
                Alias = '{request.Alias}'
            }}
            {managedByParam}
            {ouParam}
            
            New-DistributionGroup @params | Select-Object Name, DisplayName, PrimarySmtpAddress | 
                ConvertTo-Json -Depth 3
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        return ParseJsonResult<DistributionGroupDto>(result) 
            ?? throw new InvalidOperationException("Échec de création du groupe");
    }

    public async Task AddMemberAsync(string groupIdentity, string memberIdentity)
    {
        _logger.LogInformation("Ajout de {Member} au groupe {Group}", memberIdentity, groupIdentity);

        var script = $@"
            Add-DistributionGroupMember -Identity '{groupIdentity}' -Member '{memberIdentity}' -Confirm:$false
        ";

        await _psService.ExecuteScriptAsync(script);
    }

    public async Task RemoveMemberAsync(string groupIdentity, string memberIdentity)
    {
        _logger.LogInformation("Suppression de {Member} du groupe {Group}", memberIdentity, groupIdentity);

        var script = $@"
            Remove-DistributionGroupMember -Identity '{groupIdentity}' -Member '{memberIdentity}' -Confirm:$false
        ";

        await _psService.ExecuteScriptAsync(script);
    }

    private T? ParseJsonResult<T>(object result) where T : class
    {
        if (result is List<object> list && list.Count > 0)
        {
            var jsonString = list[0].ToString();
            if (string.IsNullOrEmpty(jsonString))
                return null;

            return System.Text.Json.JsonSerializer.Deserialize<T>(jsonString);
        }
        return null;
    }
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

        var serverParam = !string.IsNullOrEmpty(server) ? $"-Server '{server}'" : "";

        var script = $@"
            Get-Queue {serverParam} | Select-Object Identity, DeliveryType, Status, MessageCount,
                NextHopDomain, LastError | ConvertTo-Json -Depth 3
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        return ParseJsonResult<List<QueueDto>>(result) ?? new List<QueueDto>();
    }

    public async Task<IEnumerable<QueueMessageDto>> GetQueueMessagesAsync(string queueIdentity)
    {
        var script = $@"
            Get-Message -Queue '{queueIdentity}' -ResultSize 1000 | Select-Object Identity, Subject,
                FromAddress, Status, Size, MessageSourceName, DateReceived | ConvertTo-Json -Depth 3
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        return ParseJsonResult<List<QueueMessageDto>>(result) ?? new List<QueueMessageDto>();
    }

    public async Task RetryQueueAsync(string queueIdentity)
    {
        _logger.LogInformation("Relance de la file {Queue}", queueIdentity);

        var script = $@"
            Retry-Queue -Identity '{queueIdentity}' -Confirm:$false
        ";

        await _psService.ExecuteScriptAsync(script);
    }

    private T? ParseJsonResult<T>(object result) where T : class
    {
        if (result is List<object> list && list.Count > 0)
        {
            var jsonString = list[0].ToString();
            if (string.IsNullOrEmpty(jsonString))
                return null;

            return System.Text.Json.JsonSerializer.Deserialize<T>(jsonString);
        }
        return null;
    }
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
        var script = $@"
            Get-MailboxPermission -Identity '{identity}' | 
                Where-Object {{ $_.IsInherited -eq $false -and $_.User -notlike 'NT AUTHORITY\*' }} |
                Select-Object Identity, User, AccessRights, Deny | ConvertTo-Json -Depth 3
        ";

        var result = await _psService.ExecuteScriptAsync(script);
        return ParseJsonResult<List<MailboxPermissionDto>>(result) ?? new List<MailboxPermissionDto>();
    }

    public async Task AddMailboxPermissionAsync(string identity, AddPermissionRequest request)
    {
        _logger.LogInformation("Ajout de permission sur {Identity} pour {User}", identity, request.User);

        var rights = string.Join(",", request.AccessRights);

        var script = $@"
            Add-MailboxPermission -Identity '{identity}' -User '{request.User}' -AccessRights {rights} -Confirm:$false
        ";

        await _psService.ExecuteScriptAsync(script);
    }

    public async Task RemoveMailboxPermissionAsync(string identity, string user, string[] accessRights)
    {
        _logger.LogInformation("Suppression de permission sur {Identity} pour {User}", identity, user);

        var rights = string.Join(",", accessRights);

        var script = $@"
            Remove-MailboxPermission -Identity '{identity}' -User '{user}' -AccessRights {rights} -Confirm:$false
        ";

        await _psService.ExecuteScriptAsync(script);
    }

    private T? ParseJsonResult<T>(object result) where T : class
    {
        if (result is List<object> list && list.Count > 0)
        {
            var jsonString = list[0].ToString();
            if (string.IsNullOrEmpty(jsonString))
                return null;

            return System.Text.Json.JsonSerializer.Deserialize<T>(jsonString);
        }
        return null;
    }
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
