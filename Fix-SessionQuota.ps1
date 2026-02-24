# ====================================================================
# PROCÉDURE: Nettoyer les sessions PowerShell sur Exchange Server
# ====================================================================

Write-Host @"

╔═══════════════════════════════════════════════════════════════════╗
║  ⚠️  QUOTA DE SESSIONS POWERSH ELL DÉPASSÉ                        ║
╚═══════════════════════════════════════════════════════════════════╝

PROBLÈME:
  Le serveur Exchange refuse les nouvelles connexions car trop de
  sessions PowerShell sont ouvertes pour votre utilisateur.

SOLUTION 1: Nettoyer depuis le serveur Exchange (RECOMMANDÉ)
────────────────────────────────────────────────────────────

Connectez-vous au serveur Exchange (tls-exch-lab.tls-lab.local)
et exécutez ces commandes en PowerShell Admin:

"@ -ForegroundColor Cyan

Write-Host @"
# 1. Voir toutes les sessions actives
Get-PSSession -ComputerName localhost | Format-Table

# 2. Fermer toutes les sessions d'un utilisateur spécifique
Get-PSSession -ComputerName localhost | 
    Where-Object {`$_.RunAsUser -like '*adminpdu*'} | 
    Remove-PSSession

# 3. OU fermer TOUTES les sessions (attention !)
Get-PSSession -ComputerName localhost | Remove-PSSession

"@ -ForegroundColor Yellow

Write-Host @"

SOLUTION 2: Augmenter le quota (PERMANENT)
────────────────────────────────────────────────

Sur le serveur Exchange, en PowerShell Admin:

"@ -ForegroundColor Cyan

Write-Host @"
# Voir la configuration actuelle
Get-PSSessionConfiguration Microsoft.Exchange | 
    Select-Object Name, MaxShellsPerUser, MaxShells

# Augmenter le quota (exemple: passer de 5 à 20)
Set-PSSessionConfiguration Microsoft.Exchange ``
    -MaxShellsPerUser 20 ``
    -Force

# Redémarrer le service WinRM
Restart-Service WinRM

"@ -ForegroundColor Yellow

Write-Host @"

SOLUTION 3: Attendre l'expiration automatique
────────────────────────────────────────────────────

Les sessions inactives expirent automatiquement après:
  • Timeout par défaut: 15-30 minutes
  • Vous pouvez attendre ou utiliser les solutions ci-dessus

"@ -ForegroundColor Cyan

Write-Host @"

💡 APRÈS LE NETTOYAGE, TESTEZ:
────────────────────────────────────────────────────

C:\Projects\Exchange-WebAdmin\Test-ExchangeConnection.ps1

Si le test réussit, relancez l'API:
  cd C:\Projects\Exchange-WebAdmin\backend\ExchangeWebAdmin.API
  dotnet run --urls "http://localhost:5000"

"@ -ForegroundColor Green

Write-Host ""
