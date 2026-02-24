#Requires -Version 5.1
<#
.SYNOPSIS
    Test de connexion WSMan vers Exchange SE (outlook.prophane.net)
    Reproduit exactement les appels du C# PowerShellService
.EXAMPLE
    .\Test-ExchangeSE-Connection.ps1
    .\Test-ExchangeSE-Connection.ps1 -User "DOMAIN\admin" -Server "outlook.prophane.net"
#>
param(
    [string]$Server        = "outlook.prophane.net",
    [string]$User          = "",
    [string]$ConfigName    = "Microsoft.Exchange",
    [string]$Auth          = "Basic"
)

$uri = "https://$Server/PowerShell"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " TEST Exchange SE - $uri" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ─── Credentials ─────────────────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($User)) {
    $User = Read-Host "Username (ex: DOMAIN\admin ou admin@domain.com)"
}
$SecPass = Read-Host "Mot de passe" -AsSecureString
$cred = New-Object System.Management.Automation.PSCredential($User, $SecPass)
Write-Host ""

function Test-Method {
    param([string]$Name, [scriptblock]$Block)
    Write-Host "--- TEST: $Name" -ForegroundColor Yellow
    try {
        & $Block
        Write-Host "  [OK]" -ForegroundColor Green
    } catch {
        $type = $_.Exception.GetType().Name
        $msg  = $_.Exception.Message -replace "`r`n"," "
        # Tronquer si trop long
        if ($msg.Length -gt 200) { $msg = $msg.Substring(0,200) + "..." }
        Write-Host "  [ERREUR] ${type}: $msg" -ForegroundColor Red
    }
    Write-Host ""
}

# ─── Ouvrir le runspace distant ───────────────────────────────────────────────
Write-Host "[1] Ouverture du runspace WSMan..." -ForegroundColor Cyan
$authMech = [System.Management.Automation.Runspaces.AuthenticationMechanism]::Basic
$connInfo = New-Object System.Management.Automation.Runspaces.WSManConnectionInfo(
    [Uri]$uri, $ConfigName, $cred
)
$connInfo.AuthenticationMechanism = $authMech
$connInfo.OperationTimeout        = 60000
$connInfo.OpenTimeout             = 30000
$connInfo.SkipCACheck             = $true
$connInfo.SkipCNCheck             = $true
$connInfo.SkipRevocationCheck     = $true

try {
    $rs = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace($connInfo)
    $rs.Open()
    Write-Host "  Runspace ouvert - LanguageMode: $($rs.SessionStateProxy.LanguageMode)" -ForegroundColor Green
} catch {
    Write-Host "  [FATAL] Impossible d'ouvrir le runspace: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ─── TEST A : AddScript (ancienne méthode - doit ECHOUER) ────────────────────
Test-Method "AddScript Get-Mailbox (ancienne methode - doit ECHOUER)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddScript("Get-Mailbox -ResultSize 1") | Out-Null
    $r = $ps.Invoke()
    Write-Host "  Resultats: $($r.Count)" -ForegroundColor Cyan
    $ps.Dispose()
}

# ─── TEST B : AddCommand avec useLocalScope=false (2e bug - doit ECHOUER) ────
Test-Method "AddCommand(cmd, false) - useLocalScope=false (doit ECHOUER)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    # Overload: AddCommand(string cmdlet, bool useLocalScope)
    $ps.AddCommand("Get-Mailbox", $false) | Out-Null
    $ps.AddParameter("ResultSize", 1) | Out-Null
    $r = $ps.Invoke()
    Write-Host "  Resultats: $($r.Count)" -ForegroundColor Cyan
    $ps.Dispose()
}

# ─── TEST C : AddCommand simple (méthode actuelle C# - doit REUSSIR) ─────────
Test-Method "AddCommand simple Get-Mailbox -ResultSize 1 (code actuel - doit REUSSIR)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddCommand("Get-Mailbox") | Out-Null
    $ps.AddParameter("ResultSize", 1) | Out-Null
    $r = $ps.Invoke()
    Write-Host "  Resultats: $($r.Count) mailbox(es)" -ForegroundColor Cyan
    if ($r.Count -gt 0) {
        $mb = $r[0]
        Write-Host "  Premier: $($mb.Properties['Name']?.Value)" -ForegroundColor DarkCyan
    }
    if ($ps.HadErrors) {
        $errs = $ps.Streams.Error.ReadAll()
        Write-Host "  Erreurs non-terminantes: $($errs -join '; ')" -ForegroundColor DarkYellow
    }
    $ps.Dispose()
}

# ─── TEST D : Pipeline AddCommand | Select-Object (BuildPipelineFromScript) ──
Test-Method "Pipeline Get-Mailbox | Select-Object Name,PrimarySmtpAddress" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddCommand("Get-Mailbox") | Out-Null
    $ps.AddParameter("ResultSize", 3) | Out-Null
    $ps.AddCommand("Select-Object") | Out-Null
    $ps.AddParameter("Property", @("Name","PrimarySmtpAddress","RecipientType")) | Out-Null
    $r = $ps.Invoke()
    Write-Host "  Resultats: $($r.Count) mailbox(es)" -ForegroundColor Cyan
    foreach ($mb in $r) {
        Write-Host "    - $($mb.Properties['Name']?.Value)" -ForegroundColor DarkCyan
    }
    $ps.Dispose()
}

# ─── TEST E : Réutilisation du même PS object (comme le singleton C#) ────────
Test-Method "Reutilisation meme PowerShell object (Commands.Clear + re-Invoke)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs

    # 1er appel
    $ps.Commands.Clear()
    $ps.AddCommand("Get-Mailbox") | Out-Null
    $ps.AddParameter("ResultSize", 1) | Out-Null
    $r1 = $ps.Invoke()
    Write-Host "  1er Invoke: $($r1.Count) resultat(s)" -ForegroundColor Cyan

    # 2e appel (meme objet PS, après Commands.Clear)
    $ps.Commands.Clear()
    $ps.Streams.Error.Clear()
    $ps.AddCommand("Get-Mailbox") | Out-Null
    $ps.AddParameter("ResultSize", 2) | Out-Null
    $ps.AddCommand("Select-Object") | Out-Null
    $ps.AddParameter("Property", @("Name","Alias")) | Out-Null
    $r2 = $ps.Invoke()
    Write-Host "  2e Invoke: $($r2.Count) resultat(s)" -ForegroundColor Cyan

    $ps.Dispose()
}

# ─── TEST F : Get-ExchangeDiagnosticInfo (cmdlet Exchange-only) ──────────────
Test-Method "Get-OrganizationConfig (Exchange admin cmdlet)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddCommand("Get-OrganizationConfig") | Out-Null
    $ps.AddCommand("Select-Object") | Out-Null
    $ps.AddParameter("Property", @("Name","DefaultPublicFolderAge","ExchangeVersion")) | Out-Null
    $r = $ps.Invoke()
    Write-Host "  Resultats: $($r.Count)" -ForegroundColor Cyan
    if ($ps.HadErrors) {
        Write-Host "  Erreurs: $($ps.Streams.Error.ReadAll() -join '; ')" -ForegroundColor DarkYellow
    }
    $ps.Dispose()
}

# ─── Nettoyage ────────────────────────────────────────────────────────────────
$rs.Dispose()

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " FIN DES TESTS" -ForegroundColor Cyan
Write-Host " - Tests A et B doivent ECHOUER (c'etaient les anciens bugs)" -ForegroundColor White
Write-Host " - Tests C D E F doivent REUSSIR (code actuel)" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
