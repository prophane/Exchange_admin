# Guide de Démarrage - Exchange Web Admin

## Démarrage Rapide

```powershell
.\Start-WebAdmin.ps1
```
Ou double-cliquer sur `START.cmd`.

Ou manuellement :

```powershell
# Terminal 1 — Backend
cd backend\ExchangeWebAdmin.API
dotnet run --urls "http://localhost:5000"

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Navigateur : **http://localhost:3000**

---

## Prérequis (premier clone)

1. **.NET 8 SDK** — https://dotnet.microsoft.com/download/dotnet/8.0
2. **Node.js >= 18** — https://nodejs.org/
3. Accès HTTPS (port 443) vers le serveur Exchange (WinRM/PowerShell)

```powershell
# Restaurer les dépendances (une seule fois)
cd backend\ExchangeWebAdmin.API; dotnet restore; cd ..\..
cd frontend; npm install; cd ..
```

---

## Authentification

- Login : `domaine\utilisateur` ou `utilisateur@domaine.com`
- Le backend utilise **WSManConnectionInfo** pour valider les credentials directement contre Exchange
- **La machine backend n'a pas besoin d'être membre du domaine AD**
- En cas de succès : JWT (8h) retourné au frontend

---

## Architecture

```
Navigateur (http://localhost:3000)
React 18 + Ant Design 5 + Vite + TypeScript
       |
       | HTTP REST API (Axios)
       v
Backend API (http://localhost:5000) — ASP.NET Core 8 + JWT
  Services: PowerShellService    — WSManConnectionInfo → runspace distant Exchange
            ConfigurationService  — VDirs, Connecteurs, Certs
            AuthService           — Validation credentials via WSMan
            CmdletLogService      — Historique cmdlets PS
       |
       v
Serveur Exchange (WinRM HTTPS port 443)
```

---

## 🎯 Fonctionnalités

### Tableau de bord
- Statistiques globales : boîtes, bases, queues, serveurs
- Activité récente Exchange

### Destinataires
- Boîtes aux lettres — Liste, création, modification, statistiques
- Groupes de distribution — Membres, propriétaires

### Serveurs
- Serveurs Exchange — Rôles, version, état
- Groupes de disponibilité (DAG)
- Bases de données — Montage, taille, backups
- Certificats — Expiration, services assignés
- **Répertoires Virtuels** :
  - OWA (Outlook Web App)
  - ECP (Exchange Control Panel)
  - EAS (ActiveSync)
  - EWS (Exchange Web Services)
  - OAB (Offline Address Book)
  - PowerShell
  - **Outlook Anywhere (RPC)** ← nouveau
  - **MAPI over HTTP** ← nouveau (Exchange 2013+)
- Outlook Anywhere — Page dédiée

### Mail Flow
- Connecteurs de réception / d'envoi
- Règles de transport
- Suivi des messages

### Organisation, Protection, Mobile

### Log PS
- Journal de toutes les cmdlets PowerShell exécutées
- Statut, durée — bouton **Log PS** bas à droite

---

## Configuration (`appsettings.json`)

Fichier : `backend/ExchangeWebAdmin.API/appsettings.json`

```json
"ExchangeInfrastructures": [
  {
    "Id": "mon-exchange",
    "Label": "Mon Exchange",
    "ServerFqdn": "exchange.mondomaine.local",
    "ConnectionUri": "https://exchange.mondomaine.local/PowerShell",
    "ConfigurationName": "Microsoft.Exchange",
    "Authentication": "Basic"
  }
]
```

Plusieurs infrastructures peuvent être définies — elles apparaissent dans le sélecteur au login.

---

## 📁 Structure

```
Exchange-WebAdmin/
├── backend/ExchangeWebAdmin.API/
│   ├── Controllers/
│   ├── Services/
│   │   ├── PowerShellService.cs     ← cœur du système
│   │   ├── ConfigurationService.cs
│   │   ├── AuthService.cs
│   │   └── CmdletLogService.cs
│   └── Models/
├── frontend/src/
│   ├── pages/
│   │   ├── Configuration/
│   │   │   ├── VirtualDirectories.tsx  ← OWA/ECP/EAS/EWS/OAB/PS/RPC/MAPI
│   │   │   └── OutlookAnywhere.tsx
│   │   └── ...
│   └── services/api.service.ts
├── Start-WebAdmin.ps1
├── Setup-WinRM.ps1
└── Fix-SessionQuota.ps1
```

---

## Dépannage

### Quota sessions Exchange dépassé
```powershell
.\Fix-SessionQuota.ps1
```

### Test connexion Exchange
```powershell
.\Test-ExchangeConnection.ps1
```

### Backend port 5000 occupé
```powershell
Get-NetTCPConnection -LocalPort 5000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Erreur "SESSION_NOT_INITIALIZED"
- Se connecter via la page login avant d'accéder aux autres pages

### Répertoires Virtuels ou Certificats vides
- Vérifier que la session Exchange est active (login)
- Contrôler les logs backend (`backend.log` ou console dotnet)

---

## Environnement

| Élément | Valeur |
|---|---|
| Backend | http://localhost:5000 |
| Frontend | http://localhost:3000 |
| Auth | WSManConnectionInfo Basic (configurable) |
| Exchange | Configurable dans `appsettings.json` |

---

**Version :** 4.0 — WSManConnectionInfo (sans domain join), FlattenValue PSObject, labels rétention  
**Dernière mise à jour :** Février 2026
