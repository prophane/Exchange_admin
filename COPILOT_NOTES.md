# Notes pour GitHub Copilot — Exchange Web Admin

## ⚠️ RÈGLE CRITIQUE — Compatibilité Exchange 2010

### Environnement
- **Version Exchange** : **Exchange 2010** (version 14.x)
- La fonction `ExVersion()` dans `OrganizationService.cs` retourne `14` pour Exchange 2010, `15` pour 2013+
- L'infra utilisée est détectée via `_ps.GetCurrentInfrastructure()?.Version`

### Règle absolue pour les cmdlets PowerShell
**TOUT paramètre qui n'existe pas dans Exchange 2010 DOIT être dans un bloc `if (exVer >= 15)`.**

Si un paramètre Exchange 2013+ est envoyé à Exchange 2010 → la commande PS échoue entièrement → HTTP 500.

### Paramètres Exchange 2013+ uniquement (jamais hors du bloc exVer >= 15)
Liste non exhaustive — mettre systématiquement dans `if (exVer >= 15)` :
- `SMimeEnabled`, `DisplayPhotosEnabled`, `SetPhotoEnabled`
- `MobileDeviceContactSyncEnabled`
- `WacEditingEnabled`, `WacViewingOnPublicComputersEnabled`, `WacViewingOnPrivateComputersEnabled`
- `WeatherEnabled`, `PlacesEnabled`, `LocalEventsEnabled`, `InterestingCalendarsEnabled`
- `-Arbitration`, `-AuditLog`, `-AuxAuditLog` (Get-Mailbox switches) → présents sur 2010, à vérifier
- Tous paramètres `WAC` (Web App Companion)

### Pattern correct dans OrganizationService.cs
```csharp
// Champs Exchange 2010+ (toutes versions)
B("InstantMessagingEnabled", f.InstantMessagingEnabled);
// ...

// EXCHANGE 2013+ UNIQUEMENT — tout champ 2013+ doit être dans CE bloc
if (exVer >= 15)
{
    B("SMimeEnabled", f.SMimeEnabled);
    B("MobileDeviceContactSyncEnabled", f.MobileDeviceContactSyncEnabled);
    B("WeatherEnabled", f.WeatherEnabled);
    // etc.
}
```

---

## Stack technique

| Couche | Technologie | Port |
|--------|------------|------|
| Backend | ASP.NET Core 8, C# | 5000 |
| Frontend | React 18, Vite, TypeScript, Ant Design 5 | 3000 |
| Auth | JWT via WSManConnectionInfo Exchange | — |

### Démarrage
```powershell
.\Start-WebAdmin.ps1   # démarre backend + frontend dans 2 fenêtres PS séparées
.\Stop-WebAdmin.ps1    # arrête les deux processus
```

### Git
- Remote : `https://github.com/prophane/Exchange_admin`
- Branche : `master`
- Push automatique après chaque modification

---

## Architecture clés

### Backend
- `Services/OrganizationService.cs` — toute la logique cmdlets Exchange (OWA, ActiveSync, etc.)
- `Services/MailboxService.cs` — boîtes aux lettres (Get-Mailbox + Get-RemoteMailbox)
- `Controllers/ExchangeControllers.cs` — endpoints `/api/mailboxes/*`
- `Controllers/OrganizationController.cs` — endpoints `/api/organization/*`

### Frontend
- `pages/Permissions/PermissionsPage.tsx` — OWA policies, groupes de rôles, stratégies d'attribution
- `pages/Mailboxes/MailboxList.tsx` — boîtes utilisateur/remote/linked uniquement
- `pages/Mailboxes/SystemMailboxList.tsx` — boîtes système (arbitration, audit, etc.)
- `pages/Recipients/RecipientsPage.tsx` — 6 onglets destinataires
- `services/api.service.ts` — couche API axios

---

## Problèmes résolus (historique)

| Problème | Cause | Solution |
|---------|-------|---------|
| HTTP 500 sur Set-OwaMailboxPolicy | `MobileDeviceContactSyncEnabled` envoyé à Exchange 2010 | Mis dans `if (exVer >= 15)` |
| HTTP 500 récurrent sur cmdlets Exchange | Paramètres Exchange 2013+ hors du bloc `exVer >= 15` | Toujours vérifier la compat version |
| Page blanche au démarrage | `ServerOutlined` n'existe pas dans `@ant-design/icons` | Remplacé par `HddOutlined` |
| Boîtes système absentes | `Get-Mailbox` seul ne les retourne pas | Nouveau endpoint avec switches `-Arbitration` etc. |
| RemoteMailbox absentes | `Get-Mailbox` ne retourne pas les remote | Ajout de `Get-RemoteMailbox` dans `GetMailboxesAsync` |
