# ============================================================
# Stop-WebAdmin.ps1 — Arret Exchange Web Admin
# ============================================================
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
try { chcp 65001 | Out-Null } catch {}

function Kill-Port($port, $label) {
    $pids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
              Select-Object -ExpandProperty OwningProcess -Unique)
    if ($pids.Count -eq 0) {
        Write-Host "   --  $label   (port $port libre)" -ForegroundColor DarkGray
        return
    }
    foreach ($pid in $pids) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "   OK  $label  $($proc.ProcessName) (PID $pid)" -ForegroundColor Green
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   EXCHANGE WEB ADMIN - ARRET"                -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

Kill-Port 5000 "Backend  "
Kill-Port 3000 "Frontend "

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   ARRET TERMINE"                             -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
