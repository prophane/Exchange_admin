using ExchangeWebAdmin.API.Models;

namespace ExchangeWebAdmin.API.Services;

public interface IMailFlowService
{
    // Règles de transport
    Task<List<Dictionary<string, object>>> GetTransportRulesAsync();
    Task SetTransportRuleEnabledAsync(string identity, bool enabled);
    Task CreateTransportRuleAsync(CreateTransportRuleRequest req);
    Task DeleteTransportRuleAsync(string identity);
    // Suivi de messages
    Task<List<Dictionary<string, object>>> TrackMessagesAsync(
        string? sender, string? recipient, DateTime? start, DateTime? end, int maxResults, string? eventId = null);
    // Connecteurs
    Task<List<Dictionary<string, object>>> GetSendConnectorsAsync();
    Task<List<Dictionary<string, object>>> GetReceiveConnectorsAsync();
}

public class MailFlowService : IMailFlowService
{
    private readonly IPowerShellService _ps;
    private readonly ILogger<MailFlowService> _logger;

    public MailFlowService(IPowerShellService ps, ILogger<MailFlowService> logger)
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
    // RÈGLES DE TRANSPORT
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetTransportRulesAsync() =>
        await SafeListAsync(
            @"Get-TransportRule | Select-Object Name, State, Priority, Description,
              FromScope, SentToScope, From, SentTo,
              RejectMessageReasonText, RejectMessageEnhancedStatusCode,
              RedirectMessageTo, AddToRecipients, DeleteMessage, Quarantine,
              WhenChanged",
            "Get-TransportRule");

    public async Task SetTransportRuleEnabledAsync(string identity, bool enabled)
    {
        var state = enabled ? "Enabled" : "Disabled";
        _logger.LogInformation("Règle transport {Identity} -> {State}", identity, state);
        await _ps.ExecuteScriptAsync(
            $"Set-TransportRule -Identity '{Esc(identity)}' -State {state}");
    }

    public async Task CreateTransportRuleAsync(CreateTransportRuleRequest req)
    {
        _logger.LogInformation("Création règle transport: {Name}", req.Name);

        // Condition
        var condition = req.ConditionType switch
        {
            "SentTo"        => $"-SentTo '{Esc(req.ConditionValue)}'",
            "From"          => $"-From '{Esc(req.ConditionValue)}'",
            "SubjectContains" => $"-SubjectContainsWords '{Esc(req.ConditionValue)}'",
            "FromScope"     => $"-FromScope '{Esc(req.ConditionValue)}'",
            "SentToScope"   => $"-SentToScope '{Esc(req.ConditionValue)}'",
            _               => ""
        };

        // Action
        var action = req.ActionType switch
        {
            "Reject"    => $"-RejectMessageReasonText '{Esc(req.ActionValue ?? "Message rejeté")}' -RejectMessageEnhancedStatusCode '5.7.1'",
            "Delete"    => "-DeleteMessage $true",
            "Redirect"  => $"-RedirectMessageTo '{Esc(req.ActionValue)}'",
            "CopyTo"    => $"-AddToRecipients '{Esc(req.ActionValue)}'",
            "Quarantine" => "-Quarantine $true",
            _           => $"-RejectMessageReasonText '{Esc(req.ActionValue ?? "Message rejeté")}' -RejectMessageEnhancedStatusCode '5.7.1'"
        };

        var priority = req.Priority.HasValue ? $"-Priority {req.Priority.Value}" : "";
        var state = req.Enabled ? "" : "-State Disabled";
        var comments = !string.IsNullOrEmpty(req.Comments) ? $"-Comments '{Esc(req.Comments)}'" : "";

        var script = $"New-TransportRule -Name '{Esc(req.Name)}' {condition} {action} {priority} {state} {comments}";
        await _ps.ExecuteScriptAsync(script);
    }

    public async Task DeleteTransportRuleAsync(string identity)
    {
        _logger.LogInformation("Suppression règle transport: {Identity}", identity);
        await _ps.ExecuteScriptAsync($"Remove-TransportRule -Identity '{Esc(identity)}' -Confirm:$false");
    }

    // =========================================================================
    // SUIVI DE MESSAGES (Message Tracking)
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> TrackMessagesAsync(
        string? sender, string? recipient, DateTime? start, DateTime? end, int maxResults, string? eventId = null)
    {
        _logger.LogInformation("Suivi messages: {Sender} -> {Recipient} event={EventId}", sender, recipient, eventId);

        var parts = new List<string>();
        if (!string.IsNullOrEmpty(sender))    parts.Add($"-Sender '{Esc(sender)}'");
        if (!string.IsNullOrEmpty(recipient)) parts.Add($"-Recipients '{Esc(recipient)}'");
        if (start.HasValue) parts.Add($"-Start '{start.Value:yyyy-MM-dd HH:mm:ss}'");
        if (end.HasValue)   parts.Add($"-End '{end.Value:yyyy-MM-dd HH:mm:ss}'");
        if (!string.IsNullOrEmpty(eventId))   parts.Add($"-EventId '{Esc(eventId)}'");
        parts.Add($"-ResultSize {maxResults}");

        var script = $"Get-MessageTrackingLog {string.Join(" ", parts)} | Select-Object Timestamp, EventId, Source, Sender, Recipients, MessageSubject, ServerHostname, TotalBytes, MessageId";

        return await SafeListAsync(script, "Get-MessageTrackingLog");
    }

    // =========================================================================
    // CONNECTEURS (délégation depuis ConfigurationService)
    // =========================================================================

    public async Task<List<Dictionary<string, object>>> GetSendConnectorsAsync() =>
        await SafeListAsync(
            @"Get-SendConnector | Select-Object Name, Enabled, RequireTLS, MaxMessageSize, WhenChanged",
            "Get-SendConnector");

    public async Task<List<Dictionary<string, object>>> GetReceiveConnectorsAsync() =>
        await SafeListAsync(
            @"Get-ReceiveConnector | Select-Object Name, Enabled, MaxMessageSize, Server, WhenChanged",
            "Get-ReceiveConnector");
}
