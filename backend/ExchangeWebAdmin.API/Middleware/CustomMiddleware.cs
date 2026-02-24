using System.Net;
using System.Text.Json;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Middleware;

/// <summary>
/// Convertit les réponses 500 contenant SESSION_NOT_INITIALIZED en 401
/// (les controllers catchent l'UnauthorizedAccessException et retournent 500
/// avant que le middleware d'exception puisse l'intercepter)
/// </summary>
public class SessionExpiredCheckMiddleware
{
    private readonly RequestDelegate _next;

    public SessionExpiredCheckMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var originalBody = context.Response.Body;
        using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        await _next(context);

        buffer.Position = 0;
        var body = await new StreamReader(buffer).ReadToEndAsync();

        if (context.Response.StatusCode == 500 && body.Contains("SESSION_NOT_INITIALIZED"))
        {
            context.Response.StatusCode = 401;
        }

        buffer.Position = 0;
        context.Response.Body = originalBody;
        await buffer.CopyToAsync(originalBody);
    }
}

/// <summary>
/// Middleware de gestion centralisée des exceptions
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur non gérée: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";

        var isSessionNotInit = exception.Message.StartsWith("SESSION_NOT_INITIALIZED");

        var (statusCode, message, errorCode) = exception switch
        {
            UnauthorizedAccessException when isSessionNotInit
                => (HttpStatusCode.Unauthorized, "Session Exchange expirée. Veuillez vous reconnecter.", "SESSION_EXPIRED"),
            UnauthorizedAccessException
                => (HttpStatusCode.Unauthorized, "Accès non autorisé", "UNAUTHORIZED"),
            ArgumentException
                => (HttpStatusCode.BadRequest, exception.Message, "BAD_REQUEST"),
            KeyNotFoundException
                => (HttpStatusCode.NotFound, "Ressource non trouvée", "NOT_FOUND"),
            InvalidOperationException
                => (HttpStatusCode.BadRequest, exception.Message, "INVALID_OPERATION"),
            _
                => (HttpStatusCode.InternalServerError, exception.Message, "SERVER_ERROR")
        };

        context.Response.StatusCode = (int)statusCode;

        var response = new
        {
            success = false,
            error = errorCode,
            message,
            detail = exception.Message,
            timestamp = DateTime.UtcNow
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(response));
    }
}

/// <summary>
/// Middleware d'audit des actions
/// </summary>
public class AuditLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<AuditLoggingMiddleware> _logger;

    public AuditLoggingMiddleware(RequestDelegate next, ILogger<AuditLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, IAuditService auditService)
    {
        var startTime = DateTime.UtcNow;
        var path = context.Request.Path.Value ?? "";
        var method = context.Request.Method;

        // Ignorer les endpoints non critiques
        if (ShouldAudit(path, method))
        {
            var user = context.User.Identity?.Name ?? "Anonymous";
            
            try
            {
                await _next(context);

                // Logger l'action si elle a réussi
                if (context.Response.StatusCode < 400)
                {
                    await auditService.LogActionAsync(
                        user,
                        $"{method} {path}",
                        ExtractResource(path),
                        $"Status: {context.Response.StatusCode}"
                    );
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erreur lors du traitement de {Method} {Path}", method, path);
                throw;
            }
        }
        else
        {
            await _next(context);
        }
    }

    private static bool ShouldAudit(string path, string method)
    {
        // Ne pas auditer les endpoints de lecture simples et de santé
        if (path.StartsWith("/health") || path.StartsWith("/swagger"))
            return false;

        // Auditer toutes les modifications
        return method != "GET" || path.Contains("/permissions");
    }

    private static string ExtractResource(string path)
    {
        // Extraire le type de ressource du chemin
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        return segments.Length > 1 ? segments[1] : "Unknown";
    }
}
