# Test de connexion Exchange pour diagnostiquer le problème
Write-Host "🔍 Test de connexion Exchange PowerShell..." -ForegroundColor Cyan

try {
    # Créer une PSSession distante vers Exchange
    Write-Host "1. Création de la PSSession..." -ForegroundColor Yellow
    $session = New-PSSession -ConfigurationName Microsoft.Exchange `
        -ConnectionUri "http://tls-exch-lab.tls-lab.local/PowerShell" `
        -Authentication Kerberos `
        -ErrorAction Stop
    
    Write-Host "   ✅ Session créée: $($session.ComputerName)" -ForegroundColor Green
    
    # Importer les cmdlets
    Write-Host "2. Import des cmdlets Exchange..." -ForegroundColor Yellow
    $module = Import-PSSession -Session $session `
        -CommandName Get-Mailbox,Get-MailboxStatistics `
        -DisableNameChecking `
        -AllowClobber `
        -WarningAction SilentlyContinue `
        -ErrorAction Stop
    
    Write-Host "   ✅ Cmdlets importés" -ForegroundColor Green
    
    # Tester Get-Mailbox
    Write-Host "3. Test de Get-Mailbox..." -ForegroundColor Yellow
    $mailboxes = Get-Mailbox -ResultSize 3
    
    Write-Host "   ✅ $($mailboxes.Count) boîtes récupérées" -ForegroundColor Green
    $mailboxes | Select-Object DisplayName, PrimarySmtpAddress | Format-Table
    
    Write-Host "`n✅ Test réussi! L'approche fonctionne." -ForegroundColor Green
    
    # Nettoyer
    Remove-PSSession $session
    
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Type: $($_.Exception.GetType().FullName)" -ForegroundColor Gray
}
