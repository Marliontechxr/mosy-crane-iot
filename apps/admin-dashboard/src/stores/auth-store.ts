/**
 * Auth store — user state, role, authentication status.
 */
import { create } from 'zustand';
import type { UserRole } from '@mosy/shared-types';

interface AuthState {
  userId: string | null;
  userName: string | null;
  email: string | null;
  role: UserRole;
  isAuthenticated: boolean;

  setUser: (user: { id: string; name: string; email: string; role: UserRole }) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  userName: null,
  email: null,
  role: 'Viewer',
  isAuthenticated: false,

  setUser: (user) =>
    set({
      userId: user.id,
      userName: user.name,
      email: user.email,
      role: user.role,
      isAuthenticated: true,
    }),

  clearUser: () =>
    set({
      userId: null,
      userName: null,
      email: null,
      role: 'Viewer',
      isAuthenticated: false,
    }),
}));
