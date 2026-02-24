using ExchangeWebAdmin.API.Services;
using ExchangeWebAdmin.API.Models;
using ExchangeWebAdmin.API.Middleware;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Configuration Serilog
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .CreateLogger();

builder.Host.UseSerilog();

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() 
    { 
        Title = "Exchange 2010 Web Admin API", 
        Version = "v1",
        Description = "API REST pour l'administration d'Exchange 2010 via WinRM"
    });
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "JWT Authorization: Bearer {token}",
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Configuration CORS
var corsOrigins = builder.Configuration.GetSection("CorsSettings:AllowedOrigins").Get<string[]>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(corsOrigins ?? new[] { "http://localhost:3000" })
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// Authentication : JWT (defaut) + Negotiate (SSO)
var jwtSettings = builder.Configuration.GetSection("JwtSettings").Get<JwtSettings>()
    ?? throw new InvalidOperationException(
        "[FATAL] JwtSettings manquant dans appsettings.json. " +
        "Vérifiez que le backend est lancé depuis le répertoire du projet ou avec 'dotnet run'.");
var jwtKey = Encoding.UTF8.GetBytes(jwtSettings.SecretKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme    = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey         = new SymmetricSecurityKey(jwtKey),
        ValidateIssuer           = true,
        ValidIssuer              = jwtSettings.Issuer,
        ValidateAudience         = true,
        ValidAudience            = jwtSettings.Audience,
        ValidateLifetime         = true,
        ClockSkew                = TimeSpan.FromMinutes(1)
    };
})
.AddNegotiate();

builder.Services.AddAuthorization(options =>
{
    // Politique par défaut : JWT requis
    options.DefaultPolicy = new AuthorizationPolicyBuilder(JwtBearerDefaults.AuthenticationScheme)
        .RequireAuthenticatedUser()
        .Build();
    options.FallbackPolicy = options.DefaultPolicy;
});

// Configure JwtSettings
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));

// AuthService
builder.Services.AddScoped<IAuthService, AuthService>();

// Caching
builder.Services.AddMemoryCache();

// Services personnalisés
builder.Services.AddSingleton<CmdletLogService>();
builder.Services.AddSingleton<IPowerShellService, PowerShellService>();
builder.Services.AddScoped<IMailboxService, MailboxService>();
builder.Services.AddScoped<IDistributionGroupService, DistributionGroupServiceSimple>();
builder.Services.AddScoped<IDatabaseService, DatabaseServiceSimple>();
builder.Services.AddScoped<IQueueService, QueueServiceSimple>();
builder.Services.AddScoped<IPermissionService, PermissionService>();
builder.Services.AddScoped<ConfigurationService>();
builder.Services.AddScoped<OrganizationService>();
builder.Services.AddScoped<IRecipientService, RecipientService>();
builder.Services.AddScoped<IMailFlowService, MailFlowService>();
builder.Services.AddSingleton<IAuditService, AuditService>();
builder.Services.AddSingleton<LetsEncryptService>();

// Configuration
builder.Services.Configure<ExchangeSettings>(
    builder.Configuration.GetSection("ExchangeSettings"));

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Exchange Web Admin API v1");
        c.RoutePrefix = string.Empty; // Swagger à la racine
    });
}

// Middleware personnalisés
app.UseMiddleware<SessionExpiredCheckMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<AuditLoggingMiddleware>();

// HTTPS Redirection (désactivé par défaut pour le développement)
// app.UseHttpsRedirection();

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Endpoint de santé (public)
app.MapGet("/health", () => new 
{ 
    Status = "Healthy", 
    Timestamp = DateTime.UtcNow,
    Service = "Exchange Web Admin API"
}).AllowAnonymous();

Log.Information("Exchange Web Admin API démarrant...");
Log.Information("Serveur Exchange: {ExchangeServer}", 
    builder.Configuration["ExchangeSettings:ServerFqdn"]);

app.Run();

Log.Information("Exchange Web Admin API arrêté");
