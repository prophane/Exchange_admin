using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Compression;
using System.Text;

namespace ExchangeWebAdmin.API.Controllers;

public class StartHealthCheckerRequest
{
    public string? Server { get; set; }
}

public class HealthCheckerRunState
{
    public string RunId { get; set; } = string.Empty;
    public string Status { get; set; } = "queued";
    public string? Server { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public int? ExitCode { get; set; }
    public string Output { get; set; } = string.Empty;
    public string Error { get; set; } = string.Empty;
}

[ApiController]
[Route("api/healthchecker")]
[Authorize]
public class HealthCheckerController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, HealthCheckerRunState> _runs = new();
    private static int _isRunning = 0;

    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<HealthCheckerController> _logger;

    public HealthCheckerController(
        IConfiguration configuration,
        IWebHostEnvironment environment,
        ILogger<HealthCheckerController> logger)
    {
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    private string GetResultsPath()
    {
        var configuredPath = _configuration["HealthChecker:ResultsPath"];
        return string.IsNullOrWhiteSpace(configuredPath)
            ? Path.Combine(_environment.ContentRootPath, "HealthCheckerResults")
            : configuredPath;
    }

    private static string TrimOutput(string text, int maxChars = 6000)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        if (text.Length <= maxChars) return text;
        return text[^maxChars..];
    }

    private static bool IsValidHealthCheckerScript(byte[] bytes)
    {
        if (bytes == null || bytes.Length < 200) return false;

        var text = Encoding.UTF8.GetString(bytes);
        var start = text.Length > 2000 ? text[..2000] : text;

        // Cas fréquent d'échec de téléchargement: page HTML/proxy/erreur
        if (start.Contains("<!DOCTYPE", StringComparison.OrdinalIgnoreCase)
            || start.Contains("<html", StringComparison.OrdinalIgnoreCase)
            || start.Contains("<head", StringComparison.OrdinalIgnoreCase)
            || start.Contains("<body", StringComparison.OrdinalIgnoreCase))
            return false;

        // Signature simple attendue d'un script PowerShell HealthChecker
        return text.Contains("HealthChecker", StringComparison.OrdinalIgnoreCase)
            && (text.Contains("param(", StringComparison.OrdinalIgnoreCase)
                || text.Contains("function ", StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasRequiredBundleFiles(string rootPath)
    {
        var required = new[]
        {
            Path.Combine(rootPath, "Diagnostics", "HealthChecker", "HealthChecker.ps1"),
            Path.Combine(rootPath, "Diagnostics", "HealthChecker", "Helpers", "Get-ErrorsThatOccurred.ps1"),
            Path.Combine(rootPath, "Diagnostics", "HealthChecker", "Writers", "Write-Functions.ps1"),
            Path.Combine(rootPath, "Shared", "LoggerFunctions.ps1"),
            Path.Combine(rootPath, "Shared", "Confirm-Administrator.ps1"),
        };

        return required.All(System.IO.File.Exists);
    }

    private static void CopyDirectory(string sourceDir, string destinationDir)
    {
        Directory.CreateDirectory(destinationDir);

        foreach (var file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDir, file);
            var target = Path.Combine(destinationDir, relative);
            var targetFolder = Path.GetDirectoryName(target);
            if (!string.IsNullOrWhiteSpace(targetFolder))
                Directory.CreateDirectory(targetFolder);
            System.IO.File.Copy(file, target, overwrite: true);
        }
    }

    private async Task<string> EnsureHealthCheckerScriptAsync(string resultsPath)
    {
        Directory.CreateDirectory(resultsPath);
        var scriptPath = Path.Combine(resultsPath, "Diagnostics", "HealthChecker", "HealthChecker.ps1");

        if (HasRequiredBundleFiles(resultsPath))
        {
            var existingBytes = await System.IO.File.ReadAllBytesAsync(scriptPath);
            if (IsValidHealthCheckerScript(existingBytes))
                return scriptPath;

            var badPath = Path.Combine(
                resultsPath,
                $"HealthChecker.invalid.{DateTime.Now:yyyyMMdd_HHmmss}.txt");
            System.IO.File.Move(scriptPath, badPath, overwrite: true);
            _logger.LogWarning("Script HealthChecker local invalide, déplacé vers {BadPath}", badPath);
        }

        // Nettoyage ancien mode (script standalone placé à la racine)
        var oldStandalonePath = Path.Combine(resultsPath, "HealthChecker.ps1");
        if (System.IO.File.Exists(oldStandalonePath))
        {
            var oldBadPath = Path.Combine(
                resultsPath,
                $"HealthChecker.standalone.old.{DateTime.Now:yyyyMMdd_HHmmss}.ps1");
            System.IO.File.Move(oldStandalonePath, oldBadPath, overwrite: true);
            _logger.LogInformation("Ancien script standalone déplacé vers {OldBadPath}", oldBadPath);
        }

        _logger.LogInformation("Téléchargement du bundle HealthChecker dans {Path}", resultsPath);

        using var http = new HttpClient();

        var zipUrl = "https://github.com/microsoft/CSS-Exchange/archive/refs/heads/main.zip";
        var zipPath = Path.Combine(resultsPath, $"css-exchange-main-{DateTime.Now:yyyyMMddHHmmss}.zip");
        var extractRoot = Path.Combine(resultsPath, $"_tmp_css_exchange_{Guid.NewGuid():N}");

        try
        {
            var zipBytes = await http.GetByteArrayAsync(zipUrl);
            await System.IO.File.WriteAllBytesAsync(zipPath, zipBytes);

            Directory.CreateDirectory(extractRoot);
            ZipFile.ExtractToDirectory(zipPath, extractRoot, overwriteFiles: true);

            var repoRoot = Directory.GetDirectories(extractRoot)
                .FirstOrDefault(d => Path.GetFileName(d).StartsWith("CSS-Exchange-", StringComparison.OrdinalIgnoreCase));

            if (string.IsNullOrWhiteSpace(repoRoot))
                throw new InvalidOperationException("Archive CSS-Exchange invalide (racine introuvable)");

            var srcHealthChecker = Path.Combine(repoRoot, "Diagnostics", "HealthChecker");
            var srcShared = Path.Combine(repoRoot, "Shared");

            if (!Directory.Exists(srcHealthChecker) || !Directory.Exists(srcShared))
                throw new InvalidOperationException("Archive CSS-Exchange invalide (HealthChecker/Shared manquants)");

            CopyDirectory(srcHealthChecker, Path.Combine(resultsPath, "Diagnostics", "HealthChecker"));
            CopyDirectory(srcShared, Path.Combine(resultsPath, "Shared"));

            if (!HasRequiredBundleFiles(resultsPath))
                throw new InvalidOperationException("Bundle HealthChecker incomplet après extraction");

            var scriptBytes = await System.IO.File.ReadAllBytesAsync(scriptPath);
            if (!IsValidHealthCheckerScript(scriptBytes))
                throw new InvalidOperationException("HealthChecker.ps1 extrait mais invalide");

            _logger.LogInformation("Bundle HealthChecker téléchargé et extrait avec succès");
            return scriptPath;
        }
        finally
        {
            try { if (System.IO.File.Exists(zipPath)) System.IO.File.Delete(zipPath); } catch { }
            try { if (Directory.Exists(extractRoot)) Directory.Delete(extractRoot, recursive: true); } catch { }
        }
    }

    private static string QuoteArg(string value)
    {
        return '"' + value.Replace("\"", "\\\"") + '"';
    }

    private async Task ExecuteHealthCheckerRunAsync(string runId, string? server)
    {
        try
        {
            if (!_runs.TryGetValue(runId, out var state)) return;

            state.Status = "running";

            var resultsPath = GetResultsPath();
            var scriptPath = await EnsureHealthCheckerScriptAsync(resultsPath);

            var args = new StringBuilder();
            args.Append("-NoProfile -ExecutionPolicy Bypass -File ");
            args.Append(QuoteArg(scriptPath));
            if (!string.IsNullOrWhiteSpace(server))
            {
                args.Append(" -Server ");
                args.Append(QuoteArg(server));
            }
            args.Append(" -OutputFilePath ");
            args.Append(QuoteArg(resultsPath));

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = args.ToString(),
                WorkingDirectory = resultsPath,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            using var process = new Process { StartInfo = psi };
            process.Start();

            var stdOutTask = process.StandardOutput.ReadToEndAsync();
            var stdErrTask = process.StandardError.ReadToEndAsync();

            await process.WaitForExitAsync();

            var stdOut = await stdOutTask;
            var stdErr = await stdErrTask;

            state.ExitCode = process.ExitCode;
            state.Output = TrimOutput(stdOut);
            state.Error = TrimOutput(stdErr);
            state.EndedAt = DateTime.UtcNow;
            state.Status = process.ExitCode == 0 && string.IsNullOrWhiteSpace(stdErr) ? "completed" : "failed";
        }
        catch (Exception ex)
        {
            if (_runs.TryGetValue(runId, out var failedState))
            {
                failedState.Status = "failed";
                failedState.EndedAt = DateTime.UtcNow;
                failedState.Error = TrimOutput(ex.ToString());
            }
            _logger.LogError(ex, "Erreur d'exécution HealthChecker (runId={RunId})", runId);
        }
        finally
        {
            Interlocked.Exchange(ref _isRunning, 0);
        }
    }

    [HttpPost("run")]
    public IActionResult StartRun([FromBody] StartHealthCheckerRequest? req)
    {
        try
        {
            if (Interlocked.CompareExchange(ref _isRunning, 1, 0) != 0)
            {
                var current = _runs.Values
                    .Where(r => r.Status == "running" || r.Status == "queued")
                    .OrderByDescending(r => r.StartedAt)
                    .FirstOrDefault();

                return Conflict(new
                {
                    success = false,
                    error = "Une analyse HealthChecker est déjà en cours",
                    data = current == null ? null : new
                    {
                        runId = current.RunId,
                        status = current.Status,
                        startedAt = current.StartedAt,
                        server = current.Server,
                    }
                });
            }

            var runId = Guid.NewGuid().ToString("N");
            var state = new HealthCheckerRunState
            {
                RunId = runId,
                Status = "queued",
                Server = req?.Server,
                StartedAt = DateTime.UtcNow,
            };
            _runs[runId] = state;

            _ = Task.Run(() => ExecuteHealthCheckerRunAsync(runId, req?.Server));

            return Accepted(new
            {
                success = true,
                data = new
                {
                    runId,
                    status = state.Status,
                    startedAt = state.StartedAt,
                    server = state.Server,
                }
            });
        }
        catch (Exception ex)
        {
            Interlocked.Exchange(ref _isRunning, 0);
            _logger.LogError(ex, "Erreur au démarrage d'une analyse HealthChecker");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("run/{runId}")]
    public IActionResult GetRunStatus(string runId)
    {
        if (!_runs.TryGetValue(runId, out var state))
            return NotFound(new { success = false, error = "Run introuvable" });

        return Ok(new
        {
            success = true,
            data = new
            {
                runId = state.RunId,
                status = state.Status,
                server = state.Server,
                startedAt = state.StartedAt,
                endedAt = state.EndedAt,
                exitCode = state.ExitCode,
                output = state.Output,
                error = state.Error,
            }
        });
    }

    [HttpGet("reports")]
    public IActionResult GetReports()
    {
        try
        {
            var resultsPath = GetResultsPath();

            if (!Directory.Exists(resultsPath))
            {
                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        path = resultsPath,
                        reports = Array.Empty<object>()
                    }
                });
            }

            var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".html", ".htm", ".txt", ".xml", ".log", ".json", ".zip"
            };

            var reports = new DirectoryInfo(resultsPath)
                .GetFiles("*", SearchOption.TopDirectoryOnly)
                .Where(f => allowedExtensions.Contains(f.Extension))
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .Select(f => new
                {
                    fileName = f.Name,
                    extension = f.Extension,
                    sizeBytes = f.Length,
                    lastWriteTime = f.LastWriteTime
                })
                .ToList();

            return Ok(new
            {
                success = true,
                data = new
                {
                    path = resultsPath,
                    reports
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des rapports HealthChecker");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("reports/{fileName}")]
    public IActionResult DownloadReport(string fileName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(fileName))
                return BadRequest(new { success = false, error = "Nom de fichier requis" });

            var safeFileName = Path.GetFileName(fileName);
            var resultsPath = GetResultsPath();

            var fullPath = Path.Combine(resultsPath, safeFileName);
            if (!System.IO.File.Exists(fullPath))
                return NotFound(new { success = false, error = "Rapport introuvable" });

            var ext = Path.GetExtension(safeFileName).ToLowerInvariant();
            var contentType = ext switch
            {
                ".html" or ".htm" => "text/html",
                ".txt" => "text/plain",
                ".xml" => "application/xml",
                ".json" => "application/json",
                ".zip" => "application/zip",
                _ => "application/octet-stream"
            };

            return PhysicalFile(fullPath, contentType, safeFileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors du téléchargement d'un rapport HealthChecker");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    // ──────────────────────────────────────────────
    // Analysis endpoint – parse TXT reports
    // ──────────────────────────────────────────────

    [HttpGet("analysis")]
    public IActionResult GetAnalysis()
    {
        try
        {
            var resultsPath = GetResultsPath();
            if (!Directory.Exists(resultsPath))
                return Ok(new { success = true, data = new { servers = new List<object>() } });

            var txtFiles = Directory.GetFiles(resultsPath, "HealthChecker-*.txt")
                .Where(f => !Path.GetFileName(f).Contains("Debug", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(f => System.IO.File.GetLastWriteTimeUtc(f))
                .ToList();

            var servers = new List<object>();
            foreach (var filePath in txtFiles)
            {
                try
                {
                    var fileName = Path.GetFileName(filePath);
                    var (serverName, reportDate) = ParseReportFileName(fileName);
                    var content = System.IO.File.ReadAllText(filePath, Encoding.UTF8);
                    var sections = ParseReportSections(content);
                    var exchangeVersion = ExtractValue(sections, "Exchange Information", "Version");
                    var serverRole = ExtractValue(sections, "Exchange Information", "Role");
                    var osVersion = ExtractValue(sections, "Operating System Information", "Operating System");
                    var buildNumber = ExtractValue(sections, "Exchange Information", "Build");

                    // Count findings
                    int red = 0, yellow = 0, green = 0, info = 0;
                    foreach (var sec in sections)
                        foreach (var item in sec.Items)
                            switch (item.Severity) { case "red": red++; break; case "yellow": yellow++; break; case "green": green++; break; default: info++; break; }

                    var htmlFile = Path.ChangeExtension(filePath, ".html");
                    var hasHtml = System.IO.File.Exists(htmlFile);

                    servers.Add(new
                    {
                        serverName,
                        reportDate,
                        fileName,
                        htmlFileName = hasHtml ? Path.GetFileName(htmlFile) : (string?)null,
                        exchangeVersion = exchangeVersion ?? buildNumber ?? "—",
                        serverRole = serverRole ?? "—",
                        osVersion = osVersion ?? "—",
                        overallStatus = red > 0 ? "red" : yellow > 0 ? "yellow" : "green",
                        summary = new { red, yellow, green, info },
                        sections = sections.Select(s => new
                        {
                            title = s.Title,
                            items = s.Items.Select(i => new { name = i.Name, value = i.Value, severity = i.Severity }).ToList()
                        }).ToList(),
                        fileSize = new FileInfo(filePath).Length
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to parse report: {File}", filePath);
                }
            }

            return Ok(new { success = true, data = new { servers } });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analyzing HealthChecker reports");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    // ── Parsing helpers ──

    private static (string serverName, string reportDate) ParseReportFileName(string fileName)
    {
        // Pattern: HealthChecker-SERVERNAME-YYYYMMDDHHMMSS.txt
        var nameNoExt = Path.GetFileNameWithoutExtension(fileName);
        var prefix = "HealthChecker-";
        if (!nameNoExt.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return (nameNoExt, "");

        var rest = nameNoExt[prefix.Length..];
        // Find the last dash followed by 14 digits (timestamp)
        var lastDash = rest.LastIndexOf('-');
        if (lastDash > 0 && rest.Length - lastDash - 1 >= 14)
        {
            var datePart = rest[(lastDash + 1)..];
            var serverPart = rest[..lastDash];
            // Parse date: YYYYMMDDHHMMSS
            if (datePart.Length >= 14 &&
                DateTime.TryParseExact(datePart[..14], "yyyyMMddHHmmss", null,
                    System.Globalization.DateTimeStyles.None, out var dt))
            {
                return (serverPart, dt.ToString("yyyy-MM-dd HH:mm:ss"));
            }
            return (serverPart, datePart);
        }
        return (rest, "");
    }

    private record ReportSection(string Title, List<ReportItem> Items);
    private record ReportItem(string Name, string Value, string Severity);

    private static List<ReportSection> ParseReportSections(string content)
    {
        var sections = new List<ReportSection>();
        var lines = content.Split('\n').Select(l => l.TrimEnd('\r')).ToArray();

        string? currentTitle = null;
        var currentItems = new List<ReportItem>();

        for (int i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            var trimmed = line.Trim();

            // Section header: line between ====== separators
            if (trimmed.StartsWith("===") && trimmed.EndsWith("===") && trimmed.Length > 10)
            {
                // Next non-empty line is the title
                if (i + 1 < lines.Length)
                {
                    var nextLine = lines[i + 1].Trim();
                    if (!string.IsNullOrEmpty(nextLine) && !nextLine.StartsWith("==="))
                    {
                        // Save previous section
                        if (currentTitle != null && currentItems.Count > 0)
                            sections.Add(new ReportSection(currentTitle, new List<ReportItem>(currentItems)));

                        currentTitle = nextLine;
                        currentItems.Clear();
                        i++; // skip the title line
                        // skip next separator if present
                        if (i + 1 < lines.Length && lines[i + 1].Trim().StartsWith("==="))
                            i++;
                        continue;
                    }
                }
                continue;
            }

            // Key-value pairs (tab-indented, colon-separated)
            if (currentTitle != null && !string.IsNullOrWhiteSpace(trimmed) && trimmed.Contains(':'))
            {
                var colonIdx = trimmed.IndexOf(':');
                if (colonIdx > 0 && colonIdx < trimmed.Length - 1)
                {
                    var name = trimmed[..colonIdx].Trim();
                    var value = trimmed[(colonIdx + 1)..].Trim();
                    if (name.Length > 0 && name.Length < 120)
                    {
                        var severity = ClassifySeverity(name, value);
                        currentItems.Add(new ReportItem(name, value, severity));
                    }
                }
            }
            else if (currentTitle != null && !string.IsNullOrWhiteSpace(trimmed) && trimmed.Length > 3)
            {
                // Non key-value line (description, finding, etc.)
                var severity = ClassifySeverity(trimmed, "");
                currentItems.Add(new ReportItem(trimmed, "", severity));
            }
        }

        // Save last section
        if (currentTitle != null && currentItems.Count > 0)
            sections.Add(new ReportSection(currentTitle, new List<ReportItem>(currentItems)));

        return sections;
    }

    private static readonly string[] RedKeywords = {
        "failed", "error", "vulnerable", "cve-", "critical", "unsupported",
        "not patched", "not supported", "exposed", "out of date",
        "security update", "immediate", "action required", "su required",
        "not installed", "misconfigured", "open relay"
    };
    private static readonly string[] YellowKeywords = {
        "warning", "recommended", "consider", "outdated", "should",
        "not configured", "not enabled", "not ideal", "not recommended",
        "disabled", "legacy", "deprecated", "missing", "mismatch",
        "non-optimal", "slow", "high", "low memory", "old"
    };
    private static readonly string[] GreenKeywords = {
        "passed", "ok", "supported", "enabled", "configured correctly",
        "up to date", "installed", "compliant", "secure", "optimal"
    };

    private static string ClassifySeverity(string name, string value)
    {
        var combined = $"{name} {value}".ToLowerInvariant();

        foreach (var kw in RedKeywords)
            if (combined.Contains(kw)) return "red";
        foreach (var kw in GreenKeywords)
            if (combined.Contains(kw)) return "green";
        foreach (var kw in YellowKeywords)
            if (combined.Contains(kw)) return "yellow";

        return "info";
    }

    private static string? ExtractValue(List<ReportSection> sections, string sectionSubstring, string nameSubstring)
    {
        var section = sections.FirstOrDefault(s =>
            s.Title.Contains(sectionSubstring, StringComparison.OrdinalIgnoreCase));
        if (section == null) return null;
        var item = section.Items.FirstOrDefault(i =>
            i.Name.Contains(nameSubstring, StringComparison.OrdinalIgnoreCase));
        return item?.Value;
    }
}