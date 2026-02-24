// Fichier séparé pour la compatibilité Vite Fast Refresh
// (AuthContext.tsx ne peut exporter que des composants React)
import { useContext } from 'react';
import { AuthContext } from './auth.types';
import type { AuthContextValue } from './auth.types';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
