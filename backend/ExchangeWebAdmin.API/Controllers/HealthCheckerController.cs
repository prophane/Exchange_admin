using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ExchangeWebAdmin.API.Controllers;

[ApiController]
[Route("api/healthchecker")]
[Authorize]
public class HealthCheckerController : ControllerBase
{
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

    [HttpGet("reports")]
    public IActionResult GetReports()
    {
        try
        {
            var configuredPath = _configuration["HealthChecker:ResultsPath"];
            var resultsPath = string.IsNullOrWhiteSpace(configuredPath)
                ? Path.Combine(_environment.ContentRootPath, "HealthCheckerResults")
                : configuredPath;

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
            var configuredPath = _configuration["HealthChecker:ResultsPath"];
            var resultsPath = string.IsNullOrWhiteSpace(configuredPath)
                ? Path.Combine(_environment.ContentRootPath, "HealthCheckerResults")
                : configuredPath;

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