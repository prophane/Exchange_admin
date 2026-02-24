#Requires -Version 5.1
<#
.SYNOPSIS
    Corrige l'encodage des fichiers PowerShell et optionnellement commit sur Git
.DESCRIPTION
    Convertit tous les fichiers .ps1 en UTF-8 avec BOM pour compatibilité
    Traite uniquement les fichiers modifiés dans la dernière heure
    Option pour automatiquement commit et push les changements
.PARAMETER GitCommit
    Si spécifié, effectue automatiquement git add, commit et push après correction
.PARAMETER CommitMessage
    Message personnalisé pour le commit Git (par défaut: auto-généré)
.EXAMPLE
    .\Fix-Encoding.ps1o
    .\Fix-Encoding.ps1 -GitCommit
    .\Fix-Encoding.ps1 -GitCommit -CommitMessage "Fix: correction encodage scripts Exchange"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [switch]$GitCommit,
    
    [Parameter(Mandatory=$false)]
    [string]$CommitMessage = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$NoGit
)

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Normaliser le chemin pour eviter les problemes avec les chemins longs ou UNC
# Convertir en chemin court si possible
$gitPath = $scriptPath

# Si chemin trop long (>260 caracteres) ou UNC/reseau, essayer d'utiliser un chemin local
if ($scriptPath.Length -gt 260 -or $scriptPath -like "\\*" -or $scriptPath -match "^[A-Z]:\\.*\\.*\\.*\\.*\\") {
    Write-Host "[INFO] Chemin complexe detecte: $scriptPath" -ForegroundColor Cyan
    
    # Essayer de trouver un dossier Git local equivalent
    $possibleLocalPaths = @(
        "C:\scripts",
        "C:\Users\$env:USERNAME\Documents\Scripts",
        "$env:USERPROFILE\Scripts"
    )
    
    foreach ($localPath in $possibleLocalPaths) {
        if (Test-Path $localPath) {
            # Verifier si c'est un repo Git
            $testGitPath = Join-Path $localPath ".git"
            if (Test-Path $testGitPath) {
                $gitPath = $localPath
                Write-Host "[INFO] Utilisation du depot Git local: $gitPath" -ForegroundColor Green
                break
            }
        }
    }
    
    # Si aucun chemin local trouve, utiliser le chemin actuel tel quel
    if ($gitPath -eq $scriptPath) {
        Write-Host "[WARN] Aucun depot Git local trouve, utilisation du chemin actuel" -ForegroundColor Yellow
    }
}

$oneHourAgo = (Get-Date).AddHours(-1)
# Filtrer les fichiers .ps1 modifies dans la derniere heure (recursif sur les sous-dossiers)
$psFiles = Get-ChildItem -Path $scriptPath -Filter "*.ps1" -Recurse | 
    Where-Object { 
        $_.Name -ne "Fix-Encoding.ps1" -and 
        $_.LastWriteTime -gt $oneHourAgo 
    }

Write-Host "Fichiers modifies dans la derniere heure: $($psFiles.Count)" -ForegroundColor Cyan
Write-Host "Correction de l'encodage..." -ForegroundColor Yellow

foreach ($file in $psFiles) {
    try {
        # Lire le contenu actuel
        $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        
        # Reecrire en UTF-8 avec BOM
        $utf8WithBom = New-Object System.Text.UTF8Encoding $true
        [System.IO.File]::WriteAllText($file.FullName, $content, $utf8WithBom)
        
        Write-Host "OK $($file.Name) - Encodage corrige" -ForegroundColor Green
    }
    catch {
        Write-Host "ERREUR $($file.Name) - Erreur: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "OK Correction terminee. $($psFiles.Count) fichier(s) corrige(s) en UTF-8 avec BOM." -ForegroundColor Green
Write-Host "Cela devrait resoudre les problemes d'accents sur differents PC." -ForegroundColor Cyan

# Demander si on veut commit (sauf si -GitCommit deja specifie ou -NoGit)
if (-not $GitCommit -and -not $NoGit -and $psFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Voulez-vous committer ces changements sur Git ? [O/n] (Entree = Oui): " -ForegroundColor Yellow -NoNewline
    $response = Read-Host
    
    if ([string]::IsNullOrWhiteSpace($response) -or $response -eq "O" -or $response -eq "o") {
        $GitCommit = $true
    }
}

# Option Git Commit
if ($GitCommit) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "[GIT] Commit automatique..." -ForegroundColor Yellow
    
    # Detecter Git (dans PATH ou chemin par defaut)
    $gitExe = $null
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCmd) {
        $gitExe = "git"
    } elseif (Test-Path "C:\Program Files\Git\cmd\git.exe") {
        $gitExe = "C:\Program Files\Git\cmd\git.exe"
    } else {
        Write-Host "[ERROR] Git non trouve. Veuillez installer Git ou l'ajouter au PATH." -ForegroundColor Red
        return
    }
    
    # Verifier si on est dans un repo Git
    Push-Location $gitPath
    try {
        # Test explicite de la presence de .git
        $gitFolder = Join-Path $gitPath ".git"
        
        if (-not (Test-Path $gitFolder)) {
            Write-Host "[WARN] Dossier .git introuvable dans: $gitPath" -ForegroundColor Yellow
            Write-Host "[INFO] Chemin teste: $gitFolder" -ForegroundColor Gray
            Write-Host "[INFO] Initialisez un depot Git avec: git init" -ForegroundColor Cyan
            return
        }
        
        $isGitRepo = & $gitExe rev-parse --is-inside-work-tree 2>$null
        
        if ($isGitRepo -eq "true") {
            # Afficher les infos du repo
            $currentBranch = & $gitExe rev-parse --abbrev-ref HEAD 2>$null
            Write-Host "[GIT] Depot detecte - Branche: $currentBranch" -ForegroundColor Green
            
            # Git add
            Write-Host "[GIT] Staging des fichiers..." -ForegroundColor Cyan
            & $gitExe add -A
            
            # Generer message si non fourni
            if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
                $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
                $fileNames = ($psFiles.Name -join ", ")
                if ($fileNames.Length -gt 80) {
                    $fileNames = "$($psFiles.Count) fichiers"
                }
                $CommitMessage = "Fix: correction encodage UTF-8 BOM ($fileNames) - $timestamp"
            }
            
            # Commit
            Write-Host "[GIT] Commit: $CommitMessage" -ForegroundColor Cyan
            & $gitExe commit -m $CommitMessage
            
            if ($LASTEXITCODE -eq 0) {
                # Push (utiliser la branche courante au lieu de forcer master)
                Write-Host "[GIT] Push vers origin/$currentBranch..." -ForegroundColor Cyan
                & $gitExe push origin $currentBranch
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "[OK] Commit et push reussis!" -ForegroundColor Green
                } else {
                    Write-Host "[WARN] Push echoue (code: $LASTEXITCODE). Verifiez la configuration remote." -ForegroundColor Yellow
                    Write-Host "[INFO] Vous pouvez pusher manuellement avec: git push origin $currentBranch" -ForegroundColor Gray
                }
            } else {
                Write-Host "[INFO] Aucun changement a committer (ou erreur)" -ForegroundColor Gray
            }
        } else {
            Write-Host "[WARN] Ce dossier n'est pas un depot Git valide" -ForegroundColor Yellow
            Write-Host "[INFO] Dossier analyse: $gitPath" -ForegroundColor Gray
        }
    }
    catch {
        Write-Host "[ERROR] Erreur Git: $($_.Exception.Message)" -ForegroundColor Red
    }
    finally {
        Pop-Location
    }
}
