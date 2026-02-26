using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using System.Diagnostics;
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

    private async Task<string> EnsureHealthCheckerScriptAsync(string resultsPath)
    {
        Directory.CreateDirectory(resultsPath);
        var scriptPath = Path.Combine(resultsPath, "HealthChecker.ps1");

        if (System.IO.File.Exists(scriptPath))
            return scriptPath;

        _logger.LogInformation("Téléchargement du script HealthChecker dans {Path}", scriptPath);

        using var http = new HttpClient();
        var bytes = await http.GetByteArrayAsync("https://aka.ms/ExchangeHealthChecker");
        await System.IO.File.WriteAllBytesAsync(scriptPath, bytes);

        return scriptPath;
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
            state.Status = process.ExitCode == 0 ? "completed" : "failed";
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
}