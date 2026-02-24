# ============================================
# STOP-WebAdmin.ps1 : Arrêt Backend & Frontend
# ============================================

# Forcer UTF-8 pour que les caractères spéciaux s'affichent correctement
# quelle que soit la machine (chcp 65001 n'est pas toujours actif)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
try { chcp 65001 | Out-Null } catch {}

Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ARRÊT - EXCHANGE WEB ADMIN" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

# Arrêt Backend (dotnet sur port 5000)
Write-Host "🛑 Arrêt du backend (dotnet sur port 5000)..." -ForegroundColor Yellow
$dotnetProcs = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
if ($dotnetProcs) {
    $dotnetProcs | ForEach-Object {
        Write-Host "  → Stop process: $($_.ProcessName) (PID $($_.Id))" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force
    }
    Write-Host "✅ Backend arrêté" -ForegroundColor Green
} else {
    Write-Host "Aucun backend à arrêter (port 5000 libre)" -ForegroundColor Gray
}

# Arrêt Frontend (node sur port 3000)
Write-Host "🛑 Arrêt du frontend (node sur port 3000)..." -ForegroundColor Yellow
$nodeProcs = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
if ($nodeProcs) {
    $nodeProcs | ForEach-Object {
        Write-Host "  → Stop process: $($_.ProcessName) (PID $($_.Id))" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force
    }
    Write-Host "✅ Frontend arrêté" -ForegroundColor Green
} else {
    Write-Host "Aucun frontend à arrêter (port 3000 libre)" -ForegroundColor Gray
}

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ ARRÊT TERMINÉ" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan
