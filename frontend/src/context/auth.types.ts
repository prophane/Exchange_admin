import { createContext } from 'react';

export interface AuthUser {
  username: string;
  displayName: string;
  domain: string;
  authMethod: 'SSO' | 'Credentials';
  expiresAt: string;
  infrastructureId?: string;
  infrastructureLabel?: string;
  infrastructureVersion?: string;
  serverFqdn?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
