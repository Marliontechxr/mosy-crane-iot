/**
 * Tests for auth-store — user state, role, authentication status.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth-store';

function resetStore() {
  useAuthStore.setState({
    userId: null,
    userName: null,
    email: null,
    role: 'Viewer',
    isAuthenticated: false,
  });
}

describe('AuthStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('has correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.userId).toBeNull();
    expect(state.userName).toBeNull();
    expect(state.email).toBeNull();
    expect(state.role).toBe('Viewer');
    expect(state.isAuthenticated).toBe(false);
  });

  describe('setUser', () => {
    it('sets all user fields and marks authenticated', () => {
      useAuthStore.getState().setUser({
        id: 'user-123',
        name: 'Rajesh Kumar',
        email: 'rajesh@example.com',
        role: 'Operator',
      });

      const state = useAuthStore.getState();
      expect(state.userId).toBe('user-123');
      expect(state.userName).toBe('Rajesh Kumar');
      expect(state.email).toBe('rajesh@example.com');
      expect(state.role).toBe('Operator');
      expect(state.isAuthenticated).toBe(true);
    });

    it('allows updating user data', () => {
      useAuthStore.getState().setUser({
        id: 'user-123',
        name: 'Rajesh Kumar',
        email: 'rajesh@example.com',
        role: 'Operator',
      });

      useAuthStore.getState().setUser({
        id: 'user-123',
        name: 'Rajesh Kumar',
        email: 'rajesh@example.com',
        role: 'SiteManager',
      });

      expect(useAuthStore.getState().role).toBe('SiteManager');
    });
  });

  describe('clearUser', () => {
    it('resets all fields to defaults', () => {
      useAuthStore.getState().setUser({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'SuperAdmin',
      });

      useAuthStore.getState().clearUser();

      const state = useAuthStore.getState();
      expect(state.userId).toBeNull();
      expect(state.userName).toBeNull();
      expect(state.email).toBeNull();
      expect(state.role).toBe('Viewer');
      expect(state.isAuthenticated).toBe(false);
    });
  });
});
