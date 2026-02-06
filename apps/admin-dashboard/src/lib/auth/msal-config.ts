/**
 * MSAL configuration for Microsoft Entra External ID.
 * Blueprint Section 5 — Authentication.
 */
import { type Configuration, LogLevel } from '@azure/msal-browser';

/** MSAL configuration — client IDs are set via environment variables. */
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID ?? '',
    authority: process.env.NEXT_PUBLIC_MSAL_AUTHORITY ?? 'https://login.microsoftonline.com/common',
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '',
    postLogoutRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/signin` : '',
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error('[MSAL]', message);
      },
      logLevel: LogLevel.Warning,
    },
  },
};

/** Scopes requested during sign-in. */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};

/** Scopes for API access tokens. */
export const apiTokenRequest = {
  scopes: [process.env.NEXT_PUBLIC_MSAL_API_SCOPE ?? 'api://mosy-admin-api/read'],
};
