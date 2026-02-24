#Requires -Version 5.1
<#
.SYNOPSIS
    Reproduit localement les conditions NoLanguage d'Exchange SE
    Tests les méthodes AddCommand/AddScript pour identifier l'erreur
#>

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " TEST LOCAL - NoLanguage Runspace (simule Exchange SE)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

function Test-Method {
    param([string]$Name, [scriptblock]$TestBlock)
    Write-Host "--- TEST: $Name" -ForegroundColor Yellow
    try {
        & $TestBlock
        Write-Host "  [OK]" -ForegroundColor Green
    } catch {
        Write-Host "  [ERREUR] $($_.Exception.GetType().Name): $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# ─────────────────────────────────────────────
# Créer un runspace LOCAL en NoLanguage mode
# ─────────────────────────────────────────────
Write-Host "[1] Création du runspace NoLanguage..." -ForegroundColor Cyan
$iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
$iss.LanguageMode = [System.Management.Automation.PSLanguageMode]::NoLanguage

$rs = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace($iss)
$rs.Open()
Write-Host "  LanguageMode actuel: $($rs.SessionStateProxy.LanguageMode)" -ForegroundColor Green
Write-Host ""

# ─────────────────────────────────────────────
# TEST A : AddScript (méthode interdite)
# ─────────────────────────────────────────────
Test-Method "AddScript simple (doit ECHOUER)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddScript("Get-Process -Name svchost") | Out-Null
    $ps.Invoke() | Out-Null
    $ps.Dispose()
}

# ─────────────────────────────────────────────
# TEST B : AddCommand avec useLocalScope=false (l'ancien bug)
# ─────────────────────────────────────────────
Test-Method "AddCommand avec useLocalScope=false (doit ECHOUER)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    # Cet overload est interdit en NoLanguage
    $ps.AddCommand("Get-Process", $false) | Out-Null  # false = useLocalScope
    $ps.Invoke() | Out-Null
    $ps.Dispose()
}

# ─────────────────────────────────────────────
# TEST C : AddCommand simple (sans useLocalScope) — méthode actuelle du code
# ─────────────────────────────────────────────
Test-Method "AddCommand simple (doit REUSSIR)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddCommand("Get-Process") | Out-Null
    $ps.AddParameter("Name", "svchost") | Out-Null
    $results = $ps.Invoke()
    Write-Host "  Résultats: $($results.Count) processus trouvés" -ForegroundColor Cyan
    $ps.Dispose()
}

# ─────────────────────────────────────────────
# TEST D : Pipeline AddCommand | AddCommand (simule le BuildPipelineFromScript)
# ─────────────────────────────────────────────
Test-Method "Pipeline AddCommand | AddCommand (doit REUSSIR)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddCommand("Get-Process") | Out-Null
    $ps.AddParameter("Name", "svchost") | Out-Null
    $ps.AddCommand("Select-Object") | Out-Null
    $ps.AddParameter("Property", @("Name","Id","CPU")) | Out-Null
    $results = $ps.Invoke()
    Write-Host "  Résultats: $($results.Count) entrées" -ForegroundColor Cyan
    $ps.Dispose()
}

# ─────────────────────────────────────────────
# TEST E : AddCommand avec un cmdlet INCONNU (simule Exchange - cmdlet pas dispo localement)
# ─────────────────────────────────────────────
Test-Method "AddCommand avec cmdlet inconnu Get-Mailbox (erreur attendue mais quel type?)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddCommand("Get-Mailbox") | Out-Null
    $ps.AddParameter("ResultSize", 1) | Out-Null
    $results = $ps.Invoke()
    if ($ps.HadErrors) {
        $errs = $ps.Streams.Error.ReadAll()
        Write-Host "  Erreurs non-terminantes: $($errs[0])" -ForegroundColor DarkYellow
    }
    $ps.Dispose()
}

# ─────────────────────────────────────────────
# TEST F : LanguageMode RestrictedLanguage (autre mode restrictif)
# ─────────────────────────────────────────────
Write-Host "[2] Test avec RestrictedLanguage..." -ForegroundColor Cyan
$issR = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
$issR.LanguageMode = [System.Management.Automation.PSLanguageMode]::RestrictedLanguage
$rsR = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace($issR)
$rsR.Open()
Write-Host "  LanguageMode: $($rsR.SessionStateProxy.LanguageMode)" -ForegroundColor Green
Write-Host ""

Test-Method "AddScript en RestrictedLanguage (doit ECHOUER)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rsR
    $ps.AddScript("Get-Process") | Out-Null
    $ps.Invoke() | Out-Null
    $ps.Dispose()
}

Test-Method "AddCommand en RestrictedLanguage (doit REUSSIR)" {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rsR
    $ps.AddCommand("Get-Process") | Out-Null
    $ps.AddParameter("Name", "svchost") | Out-Null
    $results = $ps.Invoke()
    Write-Host "  Résultats: $($results.Count)" -ForegroundColor Cyan
    $ps.Dispose()
}

# ─────────────────────────────────────────────
# TEST G : Simuler EXACTEMENT ce que fait TestConnectionAsync du C#
# (même séquence d'appels)
# ─────────────────────────────────────────────
Write-Host ""
Write-Host "[3] Simulation exacte de TestConnectionAsync..." -ForegroundColor Cyan
Test-Method "TestConnectionAsync simulation (NoLanguage, AddCommand Get-Process)" {
    # Réutilise le même $ps sur le runspace (comme le singleton C#)
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs

    # Premier appel (TestConnection)
    $ps.Commands.Clear()
    $ps.AddCommand("Get-Process") | Out-Null
    $ps.AddParameter("Name", "svchost") | Out-Null
    $r1 = $ps.Invoke()
    Write-Host "  TestConnection: $($r1.Count) résultats" -ForegroundColor Cyan

    # Deuxième appel (ExecuteScript - simule GetMailboxes)
    $ps.Commands.Clear()
    $ps.Streams.Error.Clear()
    $ps.Streams.Warning.Clear()
    $ps.AddCommand("Get-Process") | Out-Null
    $ps.AddParameter("Name", "svchost") | Out-Null
    $ps.AddCommand("Select-Object") | Out-Null
    $ps.AddParameter("Property", @("Name","Id","CPU")) | Out-Null
    $r2 = $ps.Invoke()
    Write-Host "  ExecuteScript: $($r2.Count) résultats" -ForegroundColor Cyan

    $ps.Dispose()
}

# ─────────────────────────────────────────────
# Nettoyage
# ─────────────────────────────────────────────
$rs.Dispose()
$rsR.Dispose()

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " RÉSUMÉ : si tous les AddCommand passent, le code C# est OK." -ForegroundColor Cyan
Write-Host " Si le problème persiste sur Exchange SE, c'est la config"   -ForegroundColor Cyan
Write-Host " WSMan distante qui force un mode différent."                 -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
