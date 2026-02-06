'use client';

/**
 * AuthProvider — wraps the app with MsalProvider and handles auth initialization.
 */
import React, { useEffect, useState } from 'react';
import {
  PublicClientApplication,
  EventType,
  type AuthenticationResult,
} from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './msal-config';

const msalInstance = new PublicClientApplication(msalConfig);

/** Initialize MSAL and set active account from cache. */
async function initializeMsal(): Promise<void> {
  await msalInstance.initialize();
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const result = event.payload as AuthenticationResult;
      msalInstance.setActiveAccount(result.account);
    }
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeMsal().then(() => setIsInitialized(true));
  }, []);

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">Initializing authentication...</div>
      </div>
    );
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}

export { msalInstance };
