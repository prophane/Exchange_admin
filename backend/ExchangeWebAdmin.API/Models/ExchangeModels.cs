namespace ExchangeWebAdmin.API.Models;

/// <summary>
/// Définition d'une infrastructure Exchange (multi-tenant / multi-version)
/// </summary>
public class ExchangeInfrastructure
{
    public string Id               { get; set; } = string.Empty;
    public string Label            { get; set; } = string.Empty;
    public string Version          { get; set; } = string.Empty;
    public string ServerFqdn       { get; set; } = string.Empty;
    public string ConnectionUri    { get; set; } = string.Empty;
    public string ConfigurationName { get; set; } = "Microsoft.Exchange";
    public string Authentication   { get; set; } = "Basic";
    /// <summary>Si true : utilise Connect-ExchangeServer via RemoteExchange.ps1 (Kerberos implicit) au lieu de New-PSSession WinRM.</summary>
    public bool   UseLocalShell    { get; set; } = false;
    /// <summary>Chemin vers RemoteExchange.ps1 sur le serveur Exchange local.</summary>
    public string RemoteExchangeScriptPath { get; set; } = @"C:\Program Files\Microsoft\Exchange Server\V15\bin\RemoteExchange.ps1";
}

/// <summary>
/// Configuration Exchange
/// </summary>
public class ExchangeSettings
{
    public string ServerFqdn { get; set; } = "tls-exch-lab.tls-lab.local";
    public bool UseSSL { get; set; } = false;
    public string ConnectionUri { get; set; } = string.Empty;
    public string ConfigurationName { get; set; } = "Microsoft.Exchange";
    public string Authentication { get; set; } = "Kerberos";
    public SessionPoolSettings SessionPoolSize { get; set; } = new();
    public int TimeoutSeconds { get; set; } = 60;
    public int RetryAttempts { get; set; } = 3;
}

public class SessionPoolSettings
{
    public int Min { get; set; } = 2;
    public int Max { get; set; } = 10;
}

/// <summary>
/// Modèle de boîte aux lettres
/// </summary>
public class MailboxDto
{
    // Get-Mailbox fields
    public string? Name { get; set; }
    public string? DisplayName { get; set; }
    public string? PrimarySmtpAddress { get; set; }
    public string? Alias { get; set; }
    public string? Database { get; set; }
    public string? OrganizationalUnit { get; set; }
    public string? RecipientType { get; set; }
    public string? RecipientTypeDetails { get; set; }
    public DateTime? WhenCreated { get; set; }
    public DateTime? WhenChanged { get; set; }
    public string? IssueWarningQuota { get; set; }
    public string? ProhibitSendQuota { get; set; }
    public string? ProhibitSendReceiveQuota { get; set; }
    public bool UseDatabaseQuotaDefaults { get; set; }
    public bool HiddenFromAddressListsEnabled { get; set; }
    public string[]? EmailAddresses { get; set; }
    public string? MailTip { get; set; }
    public string? ForwardingAddress { get; set; }
    public bool DeliverToMailboxAndForward { get; set; }

    // Get-User fields
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Initials { get; set; }
    public string? UserPrincipalName { get; set; }
    public string? Phone { get; set; }
    public string? MobilePhone { get; set; }
    public string? Fax { get; set; }
    public string? Title { get; set; }
    public string? Department { get; set; }
    public string? Company { get; set; }
    public string? Office { get; set; }
    public string? Manager { get; set; }
    public string? StreetAddress { get; set; }
    public string? City { get; set; }
    public string? StateOrProvince { get; set; }
    public string? PostalCode { get; set; }
    public string? CountryOrRegion { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// Modèle de création de boîte aux lettres
/// </summary>
public class CreateMailboxRequest
{
    public required string Name { get; set; }
    public required string Alias { get; set; }
    public required string UserPrincipalName { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public required string Password { get; set; }
    public string? Database { get; set; }
    public string? OrganizationalUnit { get; set; }
    public string? ResetPasswordOnNextLogon { get; set; }
}

/// <summary>
/// Modèle de modification de boîte aux lettres
/// </summary>
public class UpdateMailboxRequest
{
    // Set-Mailbox fields
    public string? DisplayName { get; set; }
    public string? Alias { get; set; }
    public string? IssueWarningQuota { get; set; }
    public string? ProhibitSendQuota { get; set; }
    public string? ProhibitSendReceiveQuota { get; set; }
    public bool? UseDatabaseQuotaDefaults { get; set; }
    public bool? HiddenFromAddressListsEnabled { get; set; }
    public string? MailTip { get; set; }
    public string? ForwardingAddress { get; set; }
    public bool? DeliverToMailboxAndForward { get; set; }

    // Set-User fields
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Initials { get; set; }
    public string? Phone { get; set; }
    public string? MobilePhone { get; set; }
    public string? Fax { get; set; }
    public string? Title { get; set; }
    public string? Department { get; set; }
    public string? Company { get; set; }
    public string? Office { get; set; }
    public string? Manager { get; set; }
    public string? StreetAddress { get; set; }
    public string? City { get; set; }
    public string? StateOrProvince { get; set; }
    public string? PostalCode { get; set; }
    public string? CountryOrRegion { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// Statistiques de boîte aux lettres
/// </summary>
public class MailboxStatisticsDto
{
    public string? DisplayName { get; set; }
    public int ItemCount { get; set; }
    public string? TotalItemSize { get; set; }
    public string? TotalDeletedItemSize { get; set; }
    public DateTime? LastLogonTime { get; set; }
    public DateTime? LastLogoffTime { get; set; }
    public string? Database { get; set; }
}

/// <summary>
/// Modèle de groupe de distribution
/// </summary>
public class DistributionGroupDto
{
    public string? Name { get; set; }
    public string? DisplayName { get; set; }
    public string? PrimarySmtpAddress { get; set; }
    public string? Alias { get; set; }
    public string[]? ManagedBy { get; set; }
    public string? MemberJoinRestriction { get; set; }
    public string? MemberDepartRestriction { get; set; }
    public DateTime? WhenCreated { get; set; }
}

/// <summary>
/// Modèle de création de groupe de distribution
/// </summary>
public class CreateDistributionGroupRequest
{
    public required string Name { get; set; }
    public required string Alias { get; set; }
    public string? DisplayName { get; set; }
    public string? PrimarySmtpAddress { get; set; }
    public string? Notes { get; set; }
    public string[]? ManagedBy { get; set; }
    public string? OrganizationalUnit { get; set; }
}

/// <summary>
/// Modèle de membre de groupe
/// </summary>
public class GroupMemberDto
{
    public string? Name { get; set; }
    public string? DisplayName { get; set; }
    public string? PrimarySmtpAddress { get; set; }
    public string? RecipientType { get; set; }
}

/// <summary>
/// Modèle de base de données
/// </summary>
public class MailboxDatabaseDto
{
    public string? Name { get; set; }
    public string? Server { get; set; }
    public string? EdbFilePath { get; set; }
    public string? LogFolderPath { get; set; }
    public string? IssueWarningQuota { get; set; }
    public string? ProhibitSendQuota { get; set; }
    public string? ProhibitSendReceiveQuota { get; set; }
    public string? MailboxRetention { get; set; }
    public string? DeletedItemRetention { get; set; }
    public string? WhenCreated { get; set; }
    public bool Mounted { get; set; }
}

/// <summary>
/// Modèle de file d'attente
/// </summary>
public class QueueDto
{
    public string? Identity { get; set; }
    public string? DeliveryType { get; set; }
    public string? Status { get; set; }
    public int MessageCount { get; set; }
    public string? NextHopDomain { get; set; }
    public string? LastError { get; set; }
}

/// <summary>
/// Modèle de message dans une file
/// </summary>
public class QueueMessageDto
{
    public string? Identity { get; set; }
    public string? Subject { get; set; }
    public string? FromAddress { get; set; }
    public string? Status { get; set; }
    public long Size { get; set; }
    public string? MessageSourceName { get; set; }
    public DateTime? DateReceived { get; set; }
}

/// <summary>
/// Modèle de permission
/// </summary>
public class MailboxPermissionDto
{
    public string? Identity { get; set; }
    public string? User { get; set; }
    public string[]? AccessRights { get; set; }
    public bool Deny { get; set; }
}

/// <summary>
/// Modèle d'ajout de permission
/// </summary>
public class AddPermissionRequest
{
    public required string User { get; set; }
    public required string[] AccessRights { get; set; }
}

/// <summary>
/// Réponse générique API
/// </summary>
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Message { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// Réponse paginée
/// </summary>
public class PaginatedResponse<T>
{
    public IEnumerable<T> Items { get; set; } = Enumerable.Empty<T>();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
}

/// <summary>
/// Paramètres de requête avec pagination
/// </summary>
public class QueryParameters
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
    public string? SearchTerm { get; set; }
    public string? SortBy { get; set; }
    public bool SortDescending { get; set; } = false;
}

public class CreateTransportRuleRequest
{
    public required string Name { get; set; }
    /// <summary>SentTo | From | SubjectContains | FromScope | SentToScope</summary>
    public string? ConditionType { get; set; }
    public string? ConditionValue { get; set; }
    /// <summary>Reject | Delete | Redirect | CopyTo | Quarantine</summary>
    public required string ActionType { get; set; }
    public string? ActionValue { get; set; }
    public int? Priority { get; set; }
    public bool Enabled { get; set; } = true;
    public string? Comments { get; set; }
}
