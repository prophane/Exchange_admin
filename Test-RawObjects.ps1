#Requires -Version 5.1
<#
.SYNOPSIS
    Inspecte les objets bruts retournés par Exchange SE
    pour DAG et Bases de données (type exact + valeur de chaque propriété)
#>
param(
    [string]$Server   = "outlook.prophane.net",
    [string]$User     = "",
    [string]$Auth     = "Basic",
    [string]$Config   = "Microsoft.Exchange"
)

if ([string]::IsNullOrWhiteSpace($User)) { $User = Read-Host "Username (ex: DOMAIN\admin)" }
$SecPass = Read-Host "Mot de passe" -AsSecureString
$cred    = New-Object System.Management.Automation.PSCredential($User, $SecPass)

$connInfo = New-Object System.Management.Automation.Runspaces.WSManConnectionInfo(
    [Uri]"https://$Server/PowerShell", $Config, $cred)
$connInfo.AuthenticationMechanism = $Auth
$connInfo.SkipCACheck = $connInfo.SkipCNCheck = $connInfo.SkipRevocationCheck = $true
$connInfo.OperationTimeout = 60000; $connInfo.OpenTimeout = 30000

Write-Host "[*] Connexion..." -ForegroundColor Cyan
$rs = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace($connInfo)
$rs.Open()
Write-Host "[OK] Connecté - LanguageMode: $($rs.SessionStateProxy.LanguageMode)`n" -ForegroundColor Green

function Invoke-PSCmd {
    param([string]$Cmd, [hashtable]$Params = @{})
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.Runspace = $rs
    $ps.AddCommand($Cmd) | Out-Null
    foreach ($kv in $Params.GetEnumerator()) { $ps.AddParameter($kv.Key, $kv.Value) | Out-Null }
    $results = $ps.Invoke()
    if ($ps.HadErrors) { Write-Host "  ERREURS: $($ps.Streams.Error.ReadAll() -join '; ')" -ForegroundColor Red }
    $ps.Dispose()
    return $results
}

function Show-ObjectProps {
    param($obj, [string]$label)
    Write-Host "  [$label]" -ForegroundColor Yellow
    $psObj = [System.Management.Automation.PSObject]::AsPSObject($obj)
    foreach ($prop in $psObj.Properties) {
        $val = $prop.Value
        $type = if ($val -eq $null) { "null" } else { $val.GetType().FullName }
        $display = if ($val -eq $null) { "<null>" }
                   elseif ($val -is [System.Collections.IEnumerable] -and $val -isnot [string]) {
                       $items = @($val)
                       "[$($items.Count) items: $($items -join ', ')]"
                   } else { "$val" }
        Write-Host "    $($prop.Name.PadRight(30)) [$type]" -NoNewline
        Write-Host " = $display" -ForegroundColor Cyan
    }
    Write-Host ""
}

# ─── DAG ────────────────────────────────────────────────────────────────────
Write-Host "════════════════════════════════════" -ForegroundColor Magenta
Write-Host " Get-DatabaseAvailabilityGroup" -ForegroundColor Magenta
Write-Host "════════════════════════════════════" -ForegroundColor Magenta
$dags = Invoke-PSCmd "Get-DatabaseAvailabilityGroup"
Write-Host "  $($dags.Count) DAG(s) trouvé(s)`n" -ForegroundColor Green
for ($i = 0; $i -lt $dags.Count; $i++) {
    Show-ObjectProps $dags[$i] "DAG $i - $($dags[$i].Name)"
}

# ─── Databases ──────────────────────────────────────────────────────────────
Write-Host "════════════════════════════════════" -ForegroundColor Magenta
Write-Host " Get-MailboxDatabase -Status" -ForegroundColor Magenta
Write-Host "════════════════════════════════════" -ForegroundColor Magenta
$dbs = Invoke-PSCmd "Get-MailboxDatabase" -Params @{ Status = $true }
Write-Host "  $($dbs.Count) base(s) trouvée(s)`n" -ForegroundColor Green
for ($i = 0; $i -lt [Math]::Min($dbs.Count, 2); $i++) {
    Show-ObjectProps $dbs[$i] "DB $i - $($dbs[$i].Name)"
}

$rs.Dispose()
Write-Host "[DONE]" -ForegroundColor Green
