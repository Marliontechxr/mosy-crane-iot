/**
 * Crane store — fleet data, selected crane, real-time telemetry.
 * Blueprint Section 11 — Zustand state management.
 */
import { create } from 'zustand';
import type {
  FleetCraneSummary,
  CraneDetailResponse,
  TelemetryPoint,
} from '@mosy/shared-types';

/** Maximum telemetry points to keep in memory (1 hour at 1Hz). */
const MAX_TELEMETRY_POINTS = 3600;

interface CraneState {
  /** All cranes in the fleet. */
  fleet: FleetCraneSummary[];
  /** Currently selected crane detail. */
  selectedCrane: CraneDetailResponse | null;
  /** Real-time telemetry buffer for selected crane. */
  telemetryBuffer: TelemetryPoint[];
  /** Fleet loading state. */
  isLoading: boolean;
  /** Error message if fleet fetch failed. */
  error: string | null;

  /** Fetch fleet data from API. */
  fetchFleet: (token: string) => Promise<void>;
  /** Select a crane and load its details. */
  selectCrane: (craneId: string, token: string) => Promise<void>;
  /** Clear selected crane. */
  clearSelection: () => void;
  /** Push a telemetry point from SignalR. */
  pushTelemetry: (point: TelemetryPoint) => void;
  /** Update a crane's real-time status in the fleet list. */
  updateCraneStatus: (craneId: string, updates: Partial<FleetCraneSummary>) => void;
}

export const useCraneStore = create<CraneState>((set, get) => ({
  fleet: [],
  selectedCrane: null,
  telemetryBuffer: [],
  isLoading: false,
  error: null,

  fetchFleet: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/fleet', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Fleet fetch failed: ${res.status}`);
      const data = await res.json();
      set({ fleet: data.cranes, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  selectCrane: async (craneId: string, token: string) => {
    set({ isLoading: true, error: null, telemetryBuffer: [] });
    try {
      const res = await fetch(`/api/crane/${craneId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Crane fetch failed: ${res.status}`);
      const data = await res.json();
      set({ selectedCrane: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  clearSelection: () => {
    set({ selectedCrane: null, telemetryBuffer: [] });
  },

  pushTelemetry: (point: TelemetryPoint) => {
    set((state) => {
      const buffer = [...state.telemetryBuffer, point];
      if (buffer.length > MAX_TELEMETRY_POINTS) {
        buffer.splice(0, buffer.length - MAX_TELEMETRY_POINTS);
      }
      return { telemetryBuffer: buffer };
    });
  },

  updateCraneStatus: (craneId: string, updates: Partial<FleetCraneSummary>) => {
    set((state) => ({
      fleet: state.fleet.map((c) =>
        c.id === craneId ? { ...c, ...updates } : c
      ),
    }));
  },
}));
