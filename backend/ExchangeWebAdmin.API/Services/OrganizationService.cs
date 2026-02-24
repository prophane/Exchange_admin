using Microsoft.Extensions.Options;
using ExchangeWebAdmin.API.Models;
using ExchangeWebAdmin.API.Controllers;

namespace ExchangeWebAdmin.API.Services;

public class OrganizationService
{
    private readonly IPowerShellService _ps;
    private readonly ILogger<OrganizationService> _logger;

    public OrganizationService(IPowerShellService ps, ILogger<OrganizationService> logger)
    {
        _ps = ps;
        _logger = logger;
    }

    private async Task<List<Dictionary<string, object>>> SafeListAsync(string script, string context)
    {
        try
        {
            var result = await _ps.ExecuteScriptAsync(script);
            return result is List<Dictionary<string, object>> list ? list : new();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Commande PS non disponible ({Context}) — retour liste vide", context);
            return new();
        }
    }

    private async Task<Dictionary<string, object>> SafeDictAsync(string script, string context)
    {
        try
        {
            var result = await _ps.ExecuteScriptAsync(script);
            if (result is List<Dictionary<string, object>> list && list.Count > 0) return list[0];
            return new();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Commande PS non disponible ({Context}) — retour vide", context);
            return new();
        }
    }

    /// <summary>
    /// Retourne la version Exchange sous forme d'entier comparable :
    ///   14 = Exchange 2010
    ///   15 = Exchange 2013, 2016, 2019, SE
    /// Permet d'activer/désactiver les paramètres cmdlet selon la version.
    /// </summary>
    private int ExVersion()
    {
        var v = _ps.GetCurrentInfrastructure()?.Version ?? "";
        if (v.Contains("2010") || v.StartsWith("14")) return 14;
        return 15; // 2013, 2016, 2019, SE
    }
    // =========================================================================
    // ORGANISATION — Paramètres généraux
    // =========================================================================

    public async Task<Dictionary<string, object>> GetOrganizationConfigAsync() =>
        await SafeDictAsync(
            @"Get-OrganizationConfig | Select-Object Name,
              MapiHttpEnabled,
              HierarchicalAddressBookEnabled,
              MailTipsAllTipsEnabled, MailTipsExternalRecipientsTipsEnabled,
              MailTipsGroupMetricsEnabled, MailTipsLargeAudienceThreshold,
              MailTipsMailboxSourcedTipsEnabled,
              CustomerFeedbackEnabled, ReadTrackingEnabled,
              DistributionGroupDefaultOU, WhenCreated, WhenChanged",
            "Get-OrganizationConfig");

    public async Task SetOrganizationConfigAsync(Dictionary<string, object?> fields)
    {
        _logger.LogInformation("Mise à jour de la configuration de l'organisation");

        var parts = new List<string>();
        if (fields.TryGetValue("HierarchicalAddressBookEnabled", out var hab) && hab != null)
            parts.Add($"-HierarchicalAddressBookEnabled ${(bool)hab}");
        if (fields.TryGetValue("MailTipsAllTipsEnabled", out var mtAll) && mtAll != null)
            parts.Add($"-MailTipsAllTipsEnabled ${(bool)mtAll}");
        if (fields.TryGetValue("MailTipsExternalRecipientsTipsEnabled", out var mtExt) && mtExt != null)
            parts.Add($"-MailTipsExternalRecipientsTipsEnabled ${(bool)mtExt}");
        if (fields.TryGetValue("MailTipsGroupMetricsEnabled", out var mtGrp) && mtGrp != null)
            parts.Add($"-MailTipsGroupMetricsEnabled ${(bool)mtGrp}");
        if (fields.TryGetValue("MailTipsLargeAudienceThreshold", out var mtLat) && mtLat != null)
            parts.Add($"-MailTipsLargeAudienceThreshold {mtLat}");
        if (fields.TryGetValue("MailTipsMailboxSourcedTipsEnabled", out var mtMbx) && mtMbx != null)
            parts.Add($"-MailTipsMailboxSourcedTipsEnabled ${(bool)mtMbx}");
        if (fields.TryGetValue("CustomerFeedbackEnabled", out var cfe) && cfe != null)
            parts.Add($"-CustomerFeedbackEnabled ${(bool)cfe}");
        if (fields.TryGetValue("ReadTrackingEnabled", out var rte) && rte != null)
            parts.Add($"-ReadTrackingEnabled ${(bool)rte}");

        if (parts.Count == 0) return;
        var script = $"Set-OrganizationConfig {string.Join(" ", parts)}";
        await _ps.ExecuteScriptAsync(script);
    }

    // =========================================================================
    // ORGANISATION — Domaines acceptés
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetAcceptedDomainsAsync() =>
        await SafeListAsync(
            @"Get-AcceptedDomain | Select-Object Name, DomainName, DomainType, Default, AddressBookEnabled",
            "Get-AcceptedDomain");

    public async Task SetAcceptedDomainAsync(string identity, string? domainType, bool? makeDefault)
    {
        _logger.LogInformation("Mise à jour du domaine accepté {Identity}", identity);

        var parts = new List<string> { $"'{identity}'" };
        if (!string.IsNullOrEmpty(domainType)) parts.Add($"-DomainType '{domainType}'");
        if (makeDefault.HasValue && makeDefault.Value) parts.Add("-MakeDefault $true");

        await _ps.ExecuteScriptAsync($"Set-AcceptedDomain {string.Join(" ", parts)}");
    }

    public async Task NewAcceptedDomainAsync(string name, string domainName, string domainType)
    {
        _logger.LogInformation("Création du domaine accepté {Name} ({DomainName})", name, domainName);
        var esc = (string s) => s.Replace("'", "''");
        await _ps.ExecuteScriptAsync(
            $"New-AcceptedDomain -Name '{esc(name)}' -DomainName '{esc(domainName)}' -DomainType '{esc(domainType)}'");
    }

    public async Task RemoveAcceptedDomainAsync(string identity)
    {
        _logger.LogInformation("Suppression du domaine accepté {Identity}", identity);
        await _ps.ExecuteScriptAsync($"Remove-AcceptedDomain -Identity '{identity.Replace("'", "''")}' -Confirm:$false");
    }

    // =========================================================================
    // ORGANISATION — Politiques d'adresse e-mail
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetEmailAddressPoliciesAsync() =>
        await SafeListAsync(
            @"Get-EmailAddressPolicy | Select-Object Name, Priority, RecipientFilterType,
              EnabledEmailAddressTemplates, EnabledPrimarySMTPAddressTemplate,
              LastUpdatedRecipientFilter, WhenChanged",
            "Get-EmailAddressPolicy");

    public async Task ApplyEmailAddressPolicyAsync(string identity)
    {
        _logger.LogInformation("Application de la politique d'adresse e-mail {Identity}", identity);
        await _ps.ExecuteScriptAsync($"Update-EmailAddressPolicy '{identity}'");
    }

    public async Task NewEmailAddressPolicyAsync(string name, string smtpTemplate, string includedRecipients, int? priority)
    {
        _logger.LogInformation("Création de la politique d'adresse e-mail {Name}", name);
        var esc = (string s) => s.Replace("'", "''");
        var prio = priority.HasValue ? $"-Priority {priority.Value}" : "";
        await _ps.ExecuteScriptAsync(
            $"New-EmailAddressPolicy -Name '{esc(name)}' -EnabledEmailAddressTemplates '{esc(smtpTemplate)}' -IncludedRecipients {includedRecipients} {prio}".TrimEnd());
    }

    public async Task SetEmailAddressPolicyAsync(string identity, string? smtpTemplate, string? includedRecipients, int? priority)
    {
        _logger.LogInformation("Modification de la politique d'adresse e-mail {Identity}", identity);
        var esc = (string s) => s.Replace("'", "''");
        var parts = new System.Collections.Generic.List<string>
        {
            $"Set-EmailAddressPolicy -Identity '{esc(identity)}'"
        };
        if (!string.IsNullOrWhiteSpace(smtpTemplate))
            parts.Add($"-EnabledEmailAddressTemplates '{esc(smtpTemplate)}'");
        if (!string.IsNullOrWhiteSpace(includedRecipients))
            parts.Add($"-IncludedRecipients {includedRecipients}");
        if (priority.HasValue)
            parts.Add($"-Priority {priority.Value}");
        await _ps.ExecuteScriptAsync(string.Join(" ", parts));
    }

    public async Task RemoveEmailAddressPolicyAsync(string identity)
    {
        _logger.LogInformation("Suppression de la politique d'adresse e-mail {Identity}", identity);
        await _ps.ExecuteScriptAsync($"Remove-EmailAddressPolicy -Identity '{identity.Replace("'", "''")}' -Confirm:$false");
    }

    // =========================================================================
    // ORGANISATION — Configuration du transport
    // =========================================================================

    public async Task<Dictionary<string, object>> GetTransportConfigAsync() =>
        await SafeDictAsync(
            @"Get-TransportConfig | Select-Object MaxSendSize, MaxReceiveSize, MaxRecipientEnvelopeLimit,
              ExternalDsnReportingAuthority, InternalDsnReportingAuthority,
              ShadowRedundancyEnabled, VoicemailJournalingEnabled,
              MaxDumpsterSizePerStorageGroup, MaxDumpsterTime",
            "Get-TransportConfig");

    public async Task SetTransportConfigAsync(Dictionary<string, object?> fields)
    {
        _logger.LogInformation("Mise à jour de la configuration du transport");

        var parts = new List<string>();
        if (fields.TryGetValue("MaxSendSize", out var mss) && mss != null)
            parts.Add($"-MaxSendSize '{mss}'");
        if (fields.TryGetValue("MaxReceiveSize", out var mrs) && mrs != null)
            parts.Add($"-MaxReceiveSize '{mrs}'");
        if (fields.TryGetValue("MaxRecipientEnvelopeLimit", out var mrel) && mrel != null)
            parts.Add($"-MaxRecipientEnvelopeLimit {mrel}");
        if (fields.TryGetValue("ShadowRedundancyEnabled", out var sre) && sre != null)
            parts.Add($"-ShadowRedundancyEnabled ${(bool)sre}");

        if (parts.Count == 0) return;
        await _ps.ExecuteScriptAsync($"Set-TransportConfig {string.Join(" ", parts)}");
    }

    // =========================================================================
    // SERVEURS — Informations sur les serveurs Exchange
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetExchangeServersAsync() =>
        await SafeListAsync(
            @"Get-ExchangeServer | Select-Object Name, Fqdn, Edition, AdminDisplayVersion,
              ServerRole, Site, WhenCreated, Domain, IsEdgeServer, IsHubTransportServer,
              IsMailboxServer, IsClientAccessServer, IsUnifiedMessagingServer",
            "Get-ExchangeServer");

    public async Task<List<Dictionary<string, object>>> GetServerHealthAsync(string serverName) =>
        await SafeListAsync(
            $"Test-ServiceHealth -Server '{serverName}' | Select-Object Role, RequiredServicesRunning, ServicesNotRunning, ServicesRunning",
            $"Test-ServiceHealth:{serverName}");

    public async Task<List<Dictionary<string, object>>> GetTransportQueuesAsync(string? serverName)
    {
        var serverFilter = string.IsNullOrEmpty(serverName) ? "" : $"-Server '{serverName}'";
        return await SafeListAsync(
            $"Get-Queue {serverFilter} | Select-Object Identity, DeliveryType, Status, MessageCount, NextHopDomain, LastRetryTime, NextRetryTime",
            "Get-Queue");
    }

    // =========================================================================
    // UTILISATEURS — Politiques de rétention
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetRetentionPoliciesAsync() =>
        await SafeListAsync(
            @"Get-RetentionPolicy | Select-Object Name, IsDefault, WhenChanged",
            "Get-RetentionPolicy");

    // Mapping des enums Exchange (entiers) → noms lisibles
    private static readonly Dictionary<string, string> _elcFolderTypeMap = new()
    {
        ["0"] = "All", ["1"] = "Calendar", ["2"] = "Contacts", ["3"] = "DeletedItems",
        ["4"] = "Drafts", ["5"] = "Inbox", ["6"] = "JunkEmail", ["7"] = "Journal",
        ["8"] = "Notes", ["9"] = "Outbox", ["10"] = "SentItems", ["11"] = "Tasks",
        ["12"] = "All", ["17"] = "Personal", ["18"] = "RecoverableItems",
    };
    private static readonly Dictionary<string, string> _retentionActionMap = new()
    {
        ["0"] = "None", ["1"] = "MoveToDeletedItems", ["2"] = "MoveToFolder",
        ["3"] = "DeleteAndAllowRecovery", ["4"] = "PermanentlyDelete",
        ["5"] = "MarkAsPastRetentionLimit", ["6"] = "MoveToArchive",
    };

    private static void NormalizeRetentionTag(Dictionary<string, object> row)
    {
        if (row.TryGetValue("Type", out var t))
        {
            var s = t?.ToString() ?? "";
            if (_elcFolderTypeMap.TryGetValue(s, out var name)) row["Type"] = name;
        }
        if (row.TryGetValue("RetentionAction", out var a))
        {
            var s = a?.ToString() ?? "";
            if (_retentionActionMap.TryGetValue(s, out var name)) row["RetentionAction"] = name;
        }
        // Convertir AgeLimitForRetention (TimeSpan "365.00:00:00") → jours entiers pour le frontend
        if (row.TryGetValue("AgeLimitForRetention", out var age))
        {
            var s = age?.ToString() ?? "";
            if (s == "Unlimited" || s == "") { row["AgeLimitForRetention"] = null!; }
            else if (TimeSpan.TryParse(s, out var ts))
            {
                row["AgeLimitForRetention"] = (int)ts.TotalDays;
            }
        }
    }

    public async Task<List<Dictionary<string, object>>> GetRetentionPolicyTagsAsync()
    {
        var list = await SafeListAsync(
            @"Get-RetentionPolicyTag | Select-Object Name, Type, AgeLimitForRetention, RetentionAction, MessageClass, IsDefaultTag",
            "Get-RetentionPolicyTag");
        foreach (var row in list) NormalizeRetentionTag(row);
        return list;
    }

    // =========================================================================
    // UTILISATEURS — Politiques d'attribution de rôles
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetRoleAssignmentPoliciesAsync() =>
        await SafeListAsync(
            @"Get-RoleAssignmentPolicy | Select-Object Name, Description, IsDefault, WhenChanged",
            "Get-RoleAssignmentPolicy");

    public async Task UpdateRoleAssignmentPolicyAsync(string name, string? description)
    {
        var parts = new List<string> { $"-Identity '{name.Replace("'", "''")}'"};
        if (description != null) parts.Add($"-Description '{description.Replace("'", "''")}'");
        await _ps.ExecuteScriptAsync($"Set-RoleAssignmentPolicy {string.Join(" ", parts)}");
    }

    // =========================================================================
    // UTILISATEURS — Plans de boîtes aux lettres
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetMailboxPlansAsync() =>
        await SafeListAsync(
            @"Get-MailboxPlan | Select-Object DisplayName, Alias, MaxReceiveSize, MaxSendSize, IssueWarningQuota, ProhibitSendQuota, ProhibitSendReceiveQuota, IsDefault, WhenChanged",
            "Get-MailboxPlan");

    // =========================================================================
    // UTILISATEURS — Carnets d'adresses
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetAddressListsAsync()
    {
        var list = await SafeListAsync(
            @"Get-AddressList -ResultSize Unlimited | Select-Object Name, RecipientFilterType, RecipientFilter, Container",
            "Get-AddressList");
        foreach (var item in list)
            item["RecipientFilter"] = item.GetValueOrDefault("RecipientFilter")?.ToString();
        return list;
    }

    public async Task<List<Dictionary<string, object>>> GetGlobalAddressListsAsync() =>
        await SafeListAsync(
            @"Get-GlobalAddressList | Select-Object Name, RecipientFilterType, IsDefaultGlobalAddressList",
            "Get-GlobalAddressList");

    public async Task<List<Dictionary<string, object>>> GetOfflineAddressBooksAsync()
    {
        var list = await SafeListAsync(
            @"Get-OfflineAddressBook | Select-Object Name, IsDefault, LastRequestedTime, GeneratingMailbox",
            "Get-OfflineAddressBook");
        foreach (var item in list)
            item["GeneratingMailbox"] = item.GetValueOrDefault("GeneratingMailbox")?.ToString();
        return list;
    }

    // =========================================================================
    // ORGANISATION — Partage (Sharing Policies)
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetSharingPoliciesAsync() =>
        await SafeListAsync(
            @"Get-SharingPolicy | Select-Object Name, Enabled, Domains, WhenChanged",
            "Get-SharingPolicy");

    // =========================================================================
    // AUTORISATIONS — Groupes de rôles / Stratégies OWA
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetRoleGroupsAsync() =>
        await SafeListAsync(
            @"Get-RoleGroup | Select-Object Name, Description, RoleGroupType, WhenChanged",
            "Get-RoleGroup");

    public async Task<List<Dictionary<string, object>>> GetRoleGroupMembersAsync(string name)
        => await SafeListAsync(
            $"Get-RoleGroupMember -Identity '{name}' | Select-Object Name, RecipientType, PrimarySmtpAddress, DisplayName",
            "Get-RoleGroupMember");

    public async Task CreateRoleGroupAsync(string name, string? description)
    {
        var parts = new List<string> { $"-Name '{name}'" };
        if (!string.IsNullOrWhiteSpace(description)) parts.Add($"-Description '{description.Replace("'", "''")}'");
        await _ps.ExecuteScriptAsync($"New-RoleGroup {string.Join(" ", parts)}");
    }

    public async Task UpdateRoleGroupAsync(string name, string? description)
    {
        var parts = new List<string> { $"-Identity '{name}'" };
        if (description != null) parts.Add($"-Description '{description.Replace("'", "''")}'");
        await _ps.ExecuteScriptAsync($"Set-RoleGroup {string.Join(" ", parts)}");
    }

    public async Task DeleteRoleGroupAsync(string name)
        => await _ps.ExecuteScriptAsync($"Remove-RoleGroup -Identity '{name}' -Confirm:$false");

    public async Task AddRoleGroupMemberAsync(string groupName, string member)
        => await _ps.ExecuteScriptAsync($"Add-RoleGroupMember -Identity '{groupName}' -Member '{member}'");

    public async Task RemoveRoleGroupMemberAsync(string groupName, string member)
        => await _ps.ExecuteScriptAsync($"Remove-RoleGroupMember -Identity '{groupName}' -Member '{member}' -Confirm:$false");

    public async Task<List<Dictionary<string, object>>> GetOwaMailboxPoliciesAsync()
    {
        var exVer = ExVersion();

        // Champs communs à toutes les versions (2010+)
        var fields = new List<string>
        {
            "Name", "IsDefault",
            "InstantMessagingEnabled", "TextMessagingEnabled", "ActiveSyncIntegrationEnabled",
            "ContactsEnabled", "AllowOfflineOn",
            "JournalEnabled", "NotesEnabled", "RemindersAndNotificationsEnabled",
            "ChangePasswordEnabled", "JunkEmailEnabled", "IRMEnabled",
            "ThemeSelectionEnabled", "PremiumClientEnabled", "SpellCheckerEnabled",
            "AllAddressListsEnabled", "GlobalAddressListEnabled", "PublicFoldersEnabled",
            "CalendarEnabled", "TasksEnabled", "RulesEnabled", "SignaturesEnabled",
            "DelegateAccessEnabled", "RecoverDeletedItemsEnabled", "SearchFoldersEnabled",
            "ActionForUnknownFileAndMIMETypes",
            "DirectFileAccessOnPublicComputersEnabled", "DirectFileAccessOnPrivateComputersEnabled",
            "WebReadyDocumentViewingOnPublicComputersEnabled", "WebReadyDocumentViewingOnPrivateComputersEnabled",
            "WSSAccessOnPublicComputersEnabled", "UNCAccessOnPublicComputersEnabled",
            "WhenChanged"
        };

        // Champs ajoutés dans Exchange 2013+
        if (exVer >= 15)
        {
            fields.AddRange(new[]
            {
                "SMimeEnabled", "DisplayPhotosEnabled", "SetPhotoEnabled",
                "WacEditingEnabled",
                "WacViewingOnPublicComputersEnabled", "WacViewingOnPrivateComputersEnabled",
                "WeatherEnabled", "PlacesEnabled", "LocalEventsEnabled", "InterestingCalendarsEnabled"
            });
        }

        var select = string.Join(", ", fields);
        return await SafeListAsync(
            $"Get-OwaMailboxPolicy | Select-Object {select}",
            "Get-OwaMailboxPolicy");
    }

    public async Task UpdateOwaMailboxPolicyAsync(string name, UpdateOwaPolicyRequest f)
    {
        var exVer = ExVersion();
        var p = new List<string> { $"-Identity '{name.Replace("'", "''")}'"};
        void B(string param, bool? v) { if (v.HasValue) p.Add($"-{param}:{(v.Value ? "$true" : "$false")}"); }

        // Communication (toutes versions)
        B("InstantMessagingEnabled",    f.InstantMessagingEnabled);
        B("TextMessagingEnabled",       f.TextMessagingEnabled);
        B("ActiveSyncIntegrationEnabled", f.ActiveSyncIntegrationEnabled);
        B("ContactsEnabled",            f.ContactsEnabled);
        // Informations (toutes versions)
        B("JournalEnabled",             f.JournalEnabled);
        B("NotesEnabled",               f.NotesEnabled);
        B("RemindersAndNotificationsEnabled", f.RemindersAndNotificationsEnabled);
        // Sécurité (toutes versions)
        B("ChangePasswordEnabled",      f.ChangePasswordEnabled);
        B("JunkEmailEnabled",           f.JunkEmailEnabled);
        B("IRMEnabled",                 f.IRMEnabled);
        // Sécurité Exchange 2013+ uniquement
        if (exVer >= 15)
        {
            B("SMimeEnabled",           f.SMimeEnabled);
            B("DisplayPhotosEnabled",   f.DisplayPhotosEnabled);
            B("SetPhotoEnabled",        f.SetPhotoEnabled);
        }
        // Expérience utilisateur (toutes versions)
        B("ThemeSelectionEnabled",      f.ThemeSelectionEnabled);
        B("PremiumClientEnabled",       f.PremiumClientEnabled);
        B("SpellCheckerEnabled",        f.SpellCheckerEnabled);
        // Carnet d'adresses (toutes versions)
        B("AllAddressListsEnabled",     f.AllAddressListsEnabled);
        B("GlobalAddressListEnabled",   f.GlobalAddressListEnabled);
        B("PublicFoldersEnabled",       f.PublicFoldersEnabled);
        // Organisation (toutes versions)
        B("CalendarEnabled",            f.CalendarEnabled);
        B("TasksEnabled",               f.TasksEnabled);
        B("RulesEnabled",               f.RulesEnabled);
        B("SignaturesEnabled",          f.SignaturesEnabled);
        B("DelegateAccessEnabled",      f.DelegateAccessEnabled);
        B("RecoverDeletedItemsEnabled", f.RecoverDeletedItemsEnabled);
        B("SearchFoldersEnabled",       f.SearchFoldersEnabled);
        // WAC Exchange 2013+ uniquement
        if (exVer >= 15)
        {
            B("WacEditingEnabled",      f.WacEditingEnabled);
            B("WacViewingOnPublicComputersEnabled",  f.WacViewingOnPublicComputersEnabled);
            B("WacViewingOnPrivateComputersEnabled", f.WacViewingOnPrivateComputersEnabled);
        }
        // Accès fichiers (toutes versions)
        B("DirectFileAccessOnPublicComputersEnabled",  f.DirectFileAccessOnPublicComputersEnabled);
        B("DirectFileAccessOnPrivateComputersEnabled", f.DirectFileAccessOnPrivateComputersEnabled);
        B("WebReadyDocumentViewingOnPublicComputersEnabled",  f.WebReadyDocumentViewingOnPublicComputersEnabled);
        B("WebReadyDocumentViewingOnPrivateComputersEnabled", f.WebReadyDocumentViewingOnPrivateComputersEnabled);
        B("WSSAccessOnPublicComputersEnabled",   f.WSSAccessOnPublicComputersEnabled);
        B("UNCAccessOnPublicComputersEnabled",   f.UNCAccessOnPublicComputersEnabled);
        // Enum MIME (toutes versions)
        if (!string.IsNullOrWhiteSpace(f.ActionForUnknownFileAndMIMETypes))
            p.Add($"-ActionForUnknownFileAndMIMETypes {f.ActionForUnknownFileAndMIMETypes}");

        await _ps.ExecuteScriptAsync($"Set-OwaMailboxPolicy {string.Join(" ", p)}");
    }

    // =========================================================================
    // CONFORMITÉ — Journal / eDiscovery
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetJournalRulesAsync() =>
        await SafeListAsync(
            @"Get-JournalRule | Select-Object Name, Enabled, Scope, Recipient, JournalEmailAddress",
            "Get-JournalRule");

    // =========================================================================
    // MOBILE — Stratégies ActiveSync
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetActiveSyncPoliciesAsync() =>
        await SafeListAsync(
            @"Get-ActiveSyncMailboxPolicy | Select-Object Name, IsDefault, DevicePasswordEnabled,
              AlphanumericDevicePasswordRequired, PasswordRecoveryEnabled,
              MaxDevicePasswordFailedAttempts, DeviceEncryptionEnabled,
              AllowSimpleDevicePassword, MinDevicePasswordLength, WhenChanged",
            "Get-ActiveSyncMailboxPolicy");

    public async Task<List<Dictionary<string, object>>> GetMobileDeviceAccessRulesAsync() =>
        await SafeListAsync(
            @"Get-ActiveSyncDeviceAccessRule | Select-Object Name, Characteristic, QueryString, AccessLevel",
            "Get-ActiveSyncDeviceAccessRule");

    // =========================================================================
    // DOSSIERS PUBLICS
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetPublicFolderDatabasesAsync() =>
        await SafeListAsync(
            @"Get-PublicFolderDatabase | Select-Object Name, Server, EdbFilePath, LogFolderPath,
              MaintenanceSchedule, QuotaNotificationSchedule, IssueWarningQuota, ProhibitPostQuota,
              MaxItemSize, WhenCreated",
            "Get-PublicFolderDatabase");

    // =========================================================================
    // SERVEURS — DAG
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetDatabaseAvailabilityGroupsAsync() =>
        await SafeListAsync(
            @"Get-DatabaseAvailabilityGroup -Status | Select-Object Name, WitnessServer, WitnessDirectory, OperationalServers, Servers, WhenCreated",
            "Get-DatabaseAvailabilityGroup");

    public async Task CreateDatabaseAvailabilityGroupAsync(string name, string witnessServer, string witnessDirectory)
    {
        var script = $"New-DatabaseAvailabilityGroup -Name '{name}' -WitnessServer '{witnessServer}' -WitnessDirectory '{witnessDirectory}'";
        await _ps.ExecuteScriptAsync(script);
    }

    public async Task UpdateDatabaseAvailabilityGroupAsync(string name, string? witnessServer, string? witnessDirectory)
    {
        var parts = new List<string> { $"-Identity '{name}'" };
        if (!string.IsNullOrWhiteSpace(witnessServer))    parts.Add($"-WitnessServer '{witnessServer}'");
        if (!string.IsNullOrWhiteSpace(witnessDirectory)) parts.Add($"-WitnessDirectory '{witnessDirectory}'");
        await _ps.ExecuteScriptAsync($"Set-DatabaseAvailabilityGroup {string.Join(" ", parts)}");
    }

    public async Task DeleteDatabaseAvailabilityGroupAsync(string name)
    {
        await _ps.ExecuteScriptAsync($"Remove-DatabaseAvailabilityGroup -Identity '{name}' -Confirm:$false");
    }

    public async Task AddDagMemberAsync(string dagName, string serverName)
    {
        await _ps.ExecuteScriptAsync($"Add-DatabaseAvailabilityGroupServer -Identity '{dagName}' -MailboxServer '{serverName}'");
    }

    public async Task RemoveDagMemberAsync(string dagName, string serverName)
    {
        await _ps.ExecuteScriptAsync($"Remove-DatabaseAvailabilityGroupServer -Identity '{dagName}' -MailboxServer '{serverName}' -Confirm:$false");
    }
}
