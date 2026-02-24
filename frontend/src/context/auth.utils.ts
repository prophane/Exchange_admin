// Fichier séparé pour que Vite Fast Refresh fonctionne correctement
// (AuthContext.tsx ne peut exporter que des composants React)

export const TOKEN_KEY = 'exchange_admin_token';
export const USER_KEY  = 'exchange_admin_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
