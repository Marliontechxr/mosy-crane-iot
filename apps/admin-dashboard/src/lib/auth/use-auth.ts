'use client';

/**
 * useAuth hook — provides login, logout, token acquisition, and role checking.
 */
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { useCallback, useMemo } from 'react';
import { loginRequest, apiTokenRequest } from './msal-config';
import type { UserRole } from '@mosy/shared-types';

/** Role hierarchy: SuperAdmin > SiteManager > Operator > Viewer. */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  SuperAdmin: 4,
  SiteManager: 3,
  Operator: 2,
  Viewer: 1,
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export function useAuth() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const user = useMemo((): AuthUser | null => {
    if (!isAuthenticated || accounts.length === 0) return null;
    const account = accounts[0];
    const claims = account.idTokenClaims as Record<string, unknown> | undefined;
    const roles = (claims?.roles as string[]) ?? [];
    const role: UserRole = roles.includes('SuperAdmin')
      ? 'SuperAdmin'
      : roles.includes('SiteManager')
        ? 'SiteManager'
        : roles.includes('Operator')
          ? 'Operator'
          : 'Viewer';

    return {
      id: account.localAccountId,
      name: account.name ?? account.username,
      email: account.username,
      role,
    };
  }, [isAuthenticated, accounts]);

  const login = useCallback(async () => {
    try {
      await instance.loginPopup(loginRequest);
    } catch (error) {
      console.error('[Auth] Login failed:', error);
      throw error;
    }
  }, [instance]);

  const logout = useCallback(async () => {
    try {
      await instance.logoutPopup({ mainWindowRedirectUri: '/auth/signin' });
    } catch (error) {
      console.error('[Auth] Logout failed:', error);
    }
  }, [instance]);

  const getAccessToken = useCallback(async (): Promise<string> => {
    try {
      const result = await instance.acquireTokenSilent({
        ...apiTokenRequest,
        account: accounts[0],
      });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        const result = await instance.acquireTokenPopup(apiTokenRequest);
        return result.accessToken;
      }
      throw error;
    }
  }, [instance, accounts]);

  /** Check if user has at least the given role level. */
  const hasRole = useCallback(
    (requiredRole: UserRole): boolean => {
      if (!user) return false;
      return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[requiredRole];
    },
    [user]
  );

  return {
    user,
    isAuthenticated,
    login,
    logout,
    getAccessToken,
    hasRole,
  };
}
