#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Configuration WinRM pour permettre la connexion Basic HTTP vers Exchange 2010
    À exécuter UNE SEULE FOIS en tant qu'Administrateur sur la machine hébergeant le backend.
#>

Write-Host "=== Configuration WinRM pour Exchange 2010 Web Admin ===" -ForegroundColor Cyan

# Autoriser le trafic non chiffré (HTTP) côté client
Write-Host "-> AllowUnencrypted = true..." -NoNewline
Set-Item WSMan:\localhost\Client\AllowUnencrypted $true -Force
Write-Host " OK" -ForegroundColor Green

# Ajouter le serveur Exchange aux hôtes de confiance
Write-Host "-> TrustedHosts += tls-exch-lab.tls-lab.local..." -NoNewline
$current = (Get-Item WSMan:\localhost\Client\TrustedHosts).Value
if ($current -notlike "*tls-exch-lab.tls-lab.local*") {
    $newValue = if ([string]::IsNullOrEmpty($current)) { "tls-exch-lab.tls-lab.local" } else { "$current,tls-exch-lab.tls-lab.local" }
    Set-Item WSMan:\localhost\Client\TrustedHosts -Value $newValue -Force
}
Write-Host " OK" -ForegroundColor Green

# Vérification
Write-Host "`n=== Configuration actuelle ===" -ForegroundColor Cyan
Write-Host "AllowUnencrypted : $((Get-Item WSMan:\localhost\Client\AllowUnencrypted).Value)"
Write-Host "TrustedHosts     : $((Get-Item WSMan:\localhost\Client\TrustedHosts).Value)"

# Test de connexion
Write-Host "`n=== Test de connexion Exchange ===" -ForegroundColor Cyan
$cred = Get-Credential -Message "Entrez les credentials TLS-LAB\adminpdu" -UserName "TLS-LAB\adminpdu"
$so = New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck -NoEncryption
try {
    $s = New-PSSession -ConfigurationName Microsoft.Exchange `
        -ConnectionUri 'http://tls-exch-lab.tls-lab.local/powershell' `
        -Authentication Basic -Credential $cred -SessionOption $so -ErrorAction Stop
    Write-Host "✅ Connexion Exchange réussie: $($s.ComputerName)" -ForegroundColor Green
    Remove-PSSession $s
} catch {
    Write-Host "❌ Échec: $_" -ForegroundColor Red
}

Write-Host "`nConfiguration WinRM terminée. Vous pouvez démarrer le backend." -ForegroundColor Cyan
