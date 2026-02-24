using System.Collections.Concurrent;

namespace ExchangeWebAdmin.API.Services;

public class CmdletLogEntry
{
    public int Index       { get; set; }
    public DateTime StartTime  { get; set; }
    public DateTime? EndTime   { get; set; }
    public string Status   { get; set; } = "Running";   // Running | Completed | Failed
    public string Command  { get; set; } = "";
    public long   DurationMs { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Singleton qui enregistre les cmdlets PowerShell exécutées (max 500 entrées).
/// Similaire au journal de commandes de l'EAC Exchange.
/// </summary>
public class CmdletLogService
{
    private readonly ConcurrentQueue<CmdletLogEntry> _entries = new();
    private int _counter = 0;
    private const int MaxEntries = 500;

    /// <summary>Démarre une entrée de log et retourne son index pour la compléter ensuite.</summary>
    public CmdletLogEntry Begin(string script)
    {
        var entry = new CmdletLogEntry
        {
            Index     = Interlocked.Increment(ref _counter) - 1,
            StartTime = DateTime.Now,
            Status    = "Running",
            Command   = ExtractCommand(script),
        };

        _entries.Enqueue(entry);

        // Garder seulement les MaxEntries dernières
        while (_entries.Count > MaxEntries && _entries.TryDequeue(out _)) { }

        return entry;
    }

    /// <summary>Marque une entrée comme terminée.</summary>
    public void Complete(CmdletLogEntry entry, Exception? error = null)
    {
        entry.EndTime    = DateTime.Now;
        entry.DurationMs = (long)(entry.EndTime.Value - entry.StartTime).TotalMilliseconds;
        if (error == null)
        {
            entry.Status = "Completed";
        }
        else
        {
            entry.Status       = "Failed";
            entry.ErrorMessage = error.Message;
        }
    }

    public IReadOnlyList<CmdletLogEntry> GetAll() =>
        _entries.OrderByDescending(e => e.Index).ToList();

    public void Clear()
    {
        while (_entries.TryDequeue(out _)) { }
        Interlocked.Exchange(ref _counter, 0);
    }

    // Extrait la première cmdlet significative du script (ignore les lignes vides/espaces)
    private static string ExtractCommand(string script)
    {
        var lines = script.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (!string.IsNullOrEmpty(trimmed))
                return trimmed.Length > 300 ? trimmed[..300] + "…" : trimmed;
        }
        return script.Trim();
    }
}
