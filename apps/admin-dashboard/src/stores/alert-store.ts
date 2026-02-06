/**
 * Alert store — alerts array, unread count, filters.
 */
import { create } from 'zustand';
import type { AlertListItem, AlertLevel } from '@mosy/shared-types';

interface AlertFilters {
  level?: AlertLevel;
  craneId?: string;
  acknowledged?: boolean;
}

interface AlertState {
  /** All alerts. */
  alerts: AlertListItem[];
  /** Unread (unacknowledged) count. */
  unreadCount: number;
  /** Active filters. */
  filters: AlertFilters;
  /** Loading state. */
  isLoading: boolean;

  /** Fetch alerts from API. */
  fetchAlerts: (token: string, filters?: AlertFilters) => Promise<void>;
  /** Add a new alert from SignalR. */
  addAlert: (alert: AlertListItem) => void;
  /** Acknowledge an alert. */
  acknowledgeAlert: (alertId: string, token: string, userId: string) => Promise<void>;
  /** Update filters. */
  setFilters: (filters: AlertFilters) => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  unreadCount: 0,
  filters: {},
  isLoading: false,

  fetchAlerts: async (token: string, filters?: AlertFilters) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      const f = filters ?? get().filters;
      if (f.level) params.set('level', f.level);
      if (f.craneId) params.set('crane', f.craneId);
      if (f.acknowledged !== undefined) params.set('acknowledged', String(f.acknowledged));

      const res = await fetch(`/api/alerts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Alerts fetch failed: ${res.status}`);
      const data: AlertListItem[] = await res.json();
      set({
        alerts: data,
        unreadCount: data.filter((a) => !a.acknowledged).length,
        isLoading: false,
        filters: f,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  addAlert: (alert: AlertListItem) => {
    set((state) => ({
      alerts: [alert, ...state.alerts],
      unreadCount: alert.acknowledged ? state.unreadCount : state.unreadCount + 1,
    }));
  },

  acknowledgeAlert: async (alertId: string, token: string, userId: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ acknowledged_by: userId, notes: '' }),
      });
      if (!res.ok) throw new Error(`Acknowledge failed: ${res.status}`);
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === alertId ? { ...a, acknowledged: true } : a
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (err) {
      console.error('[AlertStore] Acknowledge failed:', err);
    }
  },

  setFilters: (filters: AlertFilters) => {
    set({ filters });
  },
}));
