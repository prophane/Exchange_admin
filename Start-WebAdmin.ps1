# ============================================================
# Start-WebAdmin.ps1 — Lancement Exchange Web Admin
# ============================================================
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
try { chcp 65001 | Out-Null } catch {}

$root        = $PSScriptRoot
$backendDir  = "$root\backend\ExchangeWebAdmin.API"
$frontendDir = "$root\frontend"
$backendUrl  = "http://localhost:5000"
$frontendUrl = "http://localhost:3000"

function Write-Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "  [$n/$total] $msg" -ForegroundColor Cyan
}
function Write-OK($msg)   { Write-Host "        OK  $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "        --  $msg" -ForegroundColor DarkGray }
function Write-Warn($msg) { Write-Host "        !!  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "       ERR  $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   EXCHANGE WEB ADMIN - DEMARRAGE"            -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan

# -- Etape 1 : NuGet --------------------------------------------------------
Write-Step 1 4 "Packages NuGet..."
if (-not (Test-Path "$backendDir\bin")) {
    Write-Host "        Restauration NuGet en cours..." -ForegroundColor Gray
    $r = Start-Process dotnet -ArgumentList "restore" -WorkingDirectory $backendDir -Wait -PassThru -NoNewWindow
    if ($r.ExitCode -ne 0) {
        Write-Err "dotnet restore a echoue (code $($r.ExitCode)). Verifiez .NET SDK."
        exit 1
    }
    Write-OK "NuGet restaure"
} else {
    Write-Skip "Packages NuGet deja presents"
}

# -- Etape 2 : npm ----------------------------------------------------------
Write-Step 2 4 "Packages npm..."
if (-not (Test-Path "$frontendDir\node_modules")) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Err "npm introuvable. Installez Node.js puis relancez."
        exit 1
    }
    Write-Host "        npm install en cours..." -ForegroundColor Gray
    $r = Start-Process cmd.exe -ArgumentList "/c npm install" -WorkingDirectory $frontendDir -Wait -PassThru -NoNewWindow
    if ($r.ExitCode -ne 0) {
        Write-Err "npm install a echoue (code $($r.ExitCode))."
        exit 1
    }
    Write-OK "npm install termine"
} else {
    Write-Skip "node_modules deja presents"
}

# -- Etape 3 : Backend ------------------------------------------------------
Write-Step 3 4 "Lancement Backend API..."
if (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue) {
    Write-Skip "Backend deja en ecoute sur le port 5000"
} else {
    Start-Process powershell.exe `
        -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -Command `"cd '$backendDir'; dotnet run --urls '$backendUrl'`"" `
        -WindowStyle Normal
    Write-Host "        Attente demarrage backend" -ForegroundColor Gray -NoNewline
    $deadline = (Get-Date).AddSeconds(60)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep 2
        Write-Host "." -ForegroundColor Gray -NoNewline
        try {
            $resp = Invoke-WebRequest "$backendUrl/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -lt 500) { $ready = $true; break }
        } catch { <# pas encore pret #> }
    }
    Write-Host ""
    if ($ready) {
        Write-OK "Backend operationnel sur $backendUrl"
    } else {
        Write-Warn "Backend non detecte apres 60 s (demarrage peut-etre encore en cours)"
    }
}

# -- Etape 4 : Frontend -----------------------------------------------------
Write-Step 4 4 "Lancement Frontend React..."
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
    Write-Skip "Frontend deja en ecoute sur le port 3000"
} else {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Err "npm introuvable. Lancez manuellement : cd $frontendDir  puis  npm run dev"
    } else {
        Start-Process powershell.exe `
            -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -Command `"cd '$frontendDir'; npm run dev`"" `
            -WindowStyle Normal
        Write-OK "Frontend lance dans une nouvelle fenetre"
    }
}

# -- Resume -----------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   DEMARRAGE TERMINE"                         -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Backend  : $backendUrl"  -ForegroundColor White
Write-Host "   Frontend : $frontendUrl" -ForegroundColor White
Write-Host ""
Write-Host "   Pour arreter : .\Stop-WebAdmin.ps1" -ForegroundColor DarkGray
Write-Host ""

Start-Process $frontendUrl
