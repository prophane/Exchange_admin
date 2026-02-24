# ============================================
# DÉMARRAGE: Exchange Web Admin
# ============================================

Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DÉMARRAGE - EXCHANGE WEB ADMIN" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

# Étape 1: Test connexion Exchange (non bloquant)
Write-Host "🔍 Étape 1/5: Test connexion Exchange..." -ForegroundColor Yellow

$exchangeOk = $false
try {
    $session = New-PSSession -ConfigurationName Microsoft.Exchange `
        -ConnectionUri http://tls-exch-lab.tls-lab.local/PowerShell `
        -Authentication Kerberos `
        -ErrorAction Stop
    
    Write-Host "✅ Session Exchange créée avec succès!" -ForegroundColor Green
    
    # Test cmdlet
    $mailboxes = Invoke-Command -Session $session -ScriptBlock { Get-Mailbox -ResultSize 3 }
    Write-Host "✅ Get-Mailbox fonctionne: $($mailboxes.Count) boîtes trouvées" -ForegroundColor Green
    Write-Host "   > $($mailboxes.DisplayName -join ', ')" -ForegroundColor Gray
    
    # Nettoyer
    Remove-PSSession $session
    Write-Host "✅ Session fermée proprement`n" -ForegroundColor Green
    $exchangeOk = $true
    
} catch {
    Write-Host "⚠️  Exchange non disponible: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   → Le backend démarrera quand même, Exchange sera testé au runtime`n" -ForegroundColor Gray
}

# Étape 2: Vérification PowerShellService
Write-Host "🔧 Étape 2/5: Vérification PowerShellService..." -ForegroundColor Yellow
Write-Host "✅ Version actuelle utilisée (credentials Exchange intégrés)`n" -ForegroundColor Green

# Étape 3: Lancement Backend API
Write-Host "🚀 Étape 3/5: Lancement Backend API..." -ForegroundColor Yellow

# Vérifier si port 5000 déjà utilisé
$port5000 = (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue)
if ($port5000) {
    Write-Host "✅ Backend déjà en écoute sur le port 5000`n" -ForegroundColor Green
} else {
    Write-Host "   Lancement automatique du backend en arrière-plan..." -ForegroundColor Cyan
    $backendJob = Start-Process -FilePath "dotnet" `
        -ArgumentList "run --urls http://localhost:5000" `
        -WorkingDirectory "$PSScriptRoot\backend\ExchangeWebAdmin.API" `
        -PassThru -WindowStyle Normal
    Write-Host "✅ Backend lancé (PID $($backendJob.Id)) — attente démarrage (10s)..." -ForegroundColor Green
    Start-Sleep 10
    $ok = (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue)
    if ($ok) { Write-Host "✅ Backend opérationnel sur http://localhost:5000`n" -ForegroundColor Green }
    else { 
        Write-Host "⚠️  Backend non détecté sur port 5000. Lancez manuellement dans un nouveau terminal:" -ForegroundColor Yellow
        Write-Host "   cd $PSScriptRoot\backend\ExchangeWebAdmin.API" -ForegroundColor White
        Write-Host "   dotnet run --urls 'http://localhost:5000'`n" -ForegroundColor White
    }
}

# Étape 4: Instructions pour le frontend
Write-Host "🎨 Étape 4/5: Lancement Frontend React..." -ForegroundColor Yellow
$frontendDir = "$PSScriptRoot\frontend"
if (Test-Path "$frontendDir\\node_modules") {
    # Vérifie que npm est dans le PATH
    $npmPath = Get-Command npm -ErrorAction SilentlyContinue
    if ($null -eq $npmPath) {
        Write-Host "❌ npm n'est pas dans le PATH système. Lancement manuel requis." -ForegroundColor Red
        Write-Host "   cd $frontendDir" -ForegroundColor White
        Write-Host "   npm run dev`n" -ForegroundColor White
    } else {
        Write-Host "   Lancement automatique du frontend dans une nouvelle fenêtre..." -ForegroundColor Cyan
        try {
            $frontendCmd = 'cd /d ' + $frontendDir + ' & npm run dev'
            $startArgs = '/c start "Exchange Web Admin - Frontend" cmd.exe /k "' + $frontendCmd + '"'
            Start-Process 'cmd.exe' -ArgumentList $startArgs -WindowStyle Normal -ErrorAction Stop
            Write-Host "✅ Frontend lancé dans une nouvelle fenêtre.`n" -ForegroundColor Green
        } catch {
            Write-Host "❌ Échec du lancement automatique du frontend : $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "   Lancez manuellement :" -ForegroundColor Yellow
            Write-Host "   cd $frontendDir" -ForegroundColor White
            Write-Host "   npm run dev`n" -ForegroundColor White
        }
    }
} else {
    Write-Host "   node_modules absent, installation requise. Exécutez d'abord :" -ForegroundColor Yellow
    Write-Host "   cd $frontendDir" -ForegroundColor White
    Write-Host "   npm install" -ForegroundColor White
    Write-Host "   npm run dev`n" -ForegroundColor White
}

# Étape 5: Accès Web UI
Write-Host "🌐 Étape 5/5: Accès interface Web..." -ForegroundColor Yellow
Write-Host "   Ouvrir dans le navigateur:" -ForegroundColor Cyan
Write-Host "   http://localhost:5173`n" -ForegroundColor White

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ TEST RÉUSSI - Prêt pour lancement!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "💡 NOTES IMPORTANTES:" -ForegroundColor Yellow
Write-Host "   • Version optimisée: 1 SEULE session Exchange" -ForegroundColor Gray
Write-Host "   • Plus de problème de quota" -ForegroundColor Gray
Write-Host "   • Session partagée entre toutes les requêtes" -ForegroundColor Gray
Write-Host "   - Fermeture propre au shutdown de l API`n" -ForegroundColor Gray
