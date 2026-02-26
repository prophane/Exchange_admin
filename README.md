# Exchange Web Admin

Interface web moderne pour administrer un serveur Microsoft Exchange,
combinant un backend ASP.NET Core 8 (API REST) et un frontend React/Vite.

## Fonctionnalités

- Boîtes aux lettres, groupes, connecteurs, certificats, files d'attente, répertoires virtuels, conformité...
- Authentification JWT via WSManConnectionInfo — **la machine n'a pas besoin d'être membre du domaine AD**
- Interface Ant Design responsive

## Prérequis

| Outil | Version minimale |
|---|---|
| [.NET SDK](https://dotnet.microsoft.com/download) | 8.0 |
| [Node.js](https://nodejs.org/) | 18+ |
| Accès WinRM HTTPS | port 443 vers le serveur Exchange |

## Installation (premier clone)

```powershell
git clone https://github.com/prophane/Exchange_admin.git Exchange-WebAdmin
cd Exchange-WebAdmin

# Dépendances backend
cd backend\ExchangeWebAdmin.API
dotnet restore
cd ..\..

# Dépendances frontend
cd frontend
npm install
cd ..
```

## Configuration

Éditer `backend/ExchangeWebAdmin.API/appsettings.json` :
- `ExchangeInfrastructures` : renseigner le FQDN et l'URL PowerShell de votre serveur Exchange
- `JwtSettings.SecretKey` : changer la clé JWT (min. 32 caractères)
- `HealthChecker.ResultsPath` : dossier où HealthChecker écrit les rapports (ex: `C:\Logs\ExchangeHealthChecker`)

## HealthChecker (menu + exécution depuis l'application)

- Menu disponible : **HealthChecker**
- L'application peut :
	- lancer l'analyse HealthChecker (`POST /api/healthchecker/run`),
	- suivre l'état d'exécution (`GET /api/healthchecker/run/{runId}`),
	- lister les rapports (`GET /api/healthchecker/reports`),
	- ouvrir/télécharger un rapport (`GET /api/healthchecker/reports/{fileName}`).

Prérequis côté serveur backend :
- `powershell.exe` disponible,
- droits d'écriture sur `HealthChecker.ResultsPath`,
- accès Internet sortant vers `https://aka.ms/ExchangeHealthChecker` (téléchargement auto du script s'il est absent).

## Démarrage

```
START.cmd          ← double-clic Windows
```
Ou :
```powershell
.\Start-WebAdmin.ps1
```
Ou manuellement :
```powershell
# Terminal 1 — Backend
cd backend\ExchangeWebAdmin.API
dotnet run --urls "http://localhost:5000"

# Terminal 2 — Frontend
cd frontend
npm run dev
```

## Accès

Navigateur : **http://localhost:3000**

Login : `domaine\utilisateur` ou `utilisateur@domaine.com`

## Structure

```
Exchange-WebAdmin/
├── backend/ExchangeWebAdmin.API/   # API ASP.NET Core 8
│   ├── Controllers/
│   ├── Services/
│   └── appsettings.json            # Config Exchange + JWT (à adapter)
├── frontend/                       # React 18 + Vite + Ant Design
├── START.cmd                       # Lanceur Windows
└── Start-WebAdmin.ps1              # Lanceur PowerShell
```

## Licence
MIT