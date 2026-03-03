# Notes pour GitHub Copilot — Exchange Web Admin

## ⚠️ RÈGLE CRITIQUE — Compatibilité Exchange

### Environnement réel
- **Version Exchange** : **Exchange Server SE** (version 15.x)
- La fonction `ExVersion()` dans `OrganizationService.cs` retourne `14` pour Exchange 2010, `15` pour 2013+
- L'infra utilisée est détectée via `_ps.GetCurrentInfrastructure()?.Version`
- **ExVersion() retourne donc 15** → tous les blocs `if (exVer >= 15)` sont actifs

### Problème récurrent réel → Sérialisation JSON camelCase ↔ PascalCase
Le vrai problème récurrent **n'est PAS la compatibilité Exchange 2010** mais la **désérialisation JSON**.

Le frontend envoie du JSON camelCase (`instantMessagingEnabled`) mais les records C# du backend ont des propriétés PascalCase (`InstantMessagingEnabled`). System.Text.Json est case-insensitive par défaut donc ça passe en général, **MAIS** :
- Si un champ envoyé par le frontend **n'existe pas dans le record C#**, il est silencieusement ignoré → la valeur reste `null` → la commande PS ne l'inclut pas (comportement correct)
- Si la commande PS construite est invalide (paramètre inconnu, mauvaise syntaxe) → exception PowerShell → HTTP 500

### Règle absolue pour les cmdlets PowerShell
**TOUT paramètre qui n'existe pas sur la version Exchange cible DOIT être conditionné.**
Sur Exchange SE (exVer=15) tous les paramètres modernes sont disponibles.

### À chaque nouvelle modification backend
Vérifier :
1. Le champ est-il dans le `record` C# de la requête ?
2. Le champ est-il géré dans le service (appel à `B()` ou ajout dans `p`) ?
3. Le paramètre PS existe-t-il sur Exchange SE ?

### Paramètres Exchange 2013+ uniquement (jamais hors du bloc exVer >= 15)
Liste non exhaustive — mettre systématiquement dans `if (exVer >= 15)` :
- `SMimeEnabled`, `DisplayPhotosEnabled`, `SetPhotoEnabled`
- `MobileDeviceContactSyncEnabled` ← **N'EXISTE PAS sur Exchange SE ni Exchange 2010** — à ne jamais envoyer
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
