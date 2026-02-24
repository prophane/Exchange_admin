@echo off
chcp 65001 >nul
title Exchange Web Admin - Démarrage

echo.
echo ═══════════════════════════════════════════
echo   EXCHANGE WEB ADMIN - LANCEMENT RAPIDE
echo ═══════════════════════════════════════════
echo.

echo 🔍 Test de la connexion Exchange...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-WebAdmin.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Test échoué - Vérifier que Exchange est bien redémarré
    pause
    exit /b 1
)

echo.
echo ═══════════════════════════════════════════
echo   PRÊT À DÉMARRER
echo ═══════════════════════════════════════════
echo.
echo 📋 Options:
echo    [1] Lancer Backend + Frontend (automatique)
echo    [2] Instructions manuelles
echo    [3] Quitter
echo.

set /p choice="Votre choix (1/2/3): "

if "%choice%"=="1" goto auto
if "%choice%"=="2" goto manual
if "%choice%"=="3" goto end

:auto
echo.
echo 🚀 Lancement automatique...
echo.

REM Démarrer backend dans nouvelle fenêtre
start "Exchange Web Admin - Backend API" powershell -NoExit -Command "cd '%~dp0backend\ExchangeWebAdmin.API'; Write-Host 'Demarrage Backend API...' -ForegroundColor Cyan; dotnet run --urls 'http://localhost:5000'"

REM Attendre 5 secondes
timeout /t 5 /nobreak >nul

REM Démarrer frontend dans nouvelle fenêtre
start "Exchange Web Admin - Frontend React" powershell -NoExit -Command "cd '%~dp0frontend'; Write-Host 'Demarrage Frontend React...' -ForegroundColor Cyan; npm run dev"

REM Attendre 8 secondes
timeout /t 8 /nobreak >nul

REM Ouvrir navigateur
echo.
echo 🌐 Ouverture du navigateur...
start http://localhost:5173

echo.
echo ═══════════════════════════════════════════
echo   ✅ DÉMARRAGE TERMINÉ
echo ═══════════════════════════════════════════
echo.
echo Backend API:     http://localhost:5000
echo Frontend Web:    http://localhost:5173
echo.
echo 💡 Deux fenêtres PowerShell sont ouvertes:
echo    • Exchange Web Admin - Backend API
echo    • Exchange Web Admin - Frontend React
echo.
echo ⚠️  NE PAS FERMER CES FENÊTRES tant que vous
echo     utilisez l'interface Web!
echo.
pause
goto end

:manual
echo.
echo ═══════════════════════════════════════════
echo   INSTRUCTIONS MANUELLES
echo ═══════════════════════════════════════════
echo.
echo Terminal 1 - Backend:
echo   cd %~dp0backend\ExchangeWebAdmin.API
echo   dotnet run --urls 'http://localhost:5000'
echo.
echo Terminal 2 - Frontend:
echo   cd %~dp0frontend
echo   npm run dev
echo.
echo Navigateur:
echo   http://localhost:5173
echo.
pause
goto end

:end
exit /b 0
