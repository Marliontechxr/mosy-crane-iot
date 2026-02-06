/**
 * Offline database — IndexedDB stores for pending acks, cached telemetry, shift data.
 * Blueprint Section 12 — offline-first PWA with background sync.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { AlertMessage, FusedTelemetry } from '@mosy/shared-types';

const DB_NAME = 'mosy-tablet';
const DB_VERSION = 1;

interface MosyDB {
  'pending-acks': {
    key: string;
    value: {
      alertId: string;
      craneId: string;
      operatorId: string;
      timestamp: number;
      synced: boolean;
    };
  };
  'cached-telemetry': {
    key: number;
    value: {
      id: number;
      data: FusedTelemetry;
      receivedAt: number;
    };
    indexes: { 'by-time': number };
  };
  'shift-data': {
    key: string;
    value: {
      date: string;
      operatorId: string;
      lifts: number;
      totalTonnes: number;
      hoursWorked: number;
      safetyScore: number;
      alerts: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<MosyDB>> | null = null;

/**
 * Get or create the IndexedDB database.
 */
export function getDb(): Promise<IDBPDatabase<MosyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MosyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Pending alert acknowledgements for background sync
        if (!db.objectStoreNames.contains('pending-acks')) {
          db.createObjectStore('pending-acks', { keyPath: 'alertId' });
        }

        // Cached telemetry for offline viewing
        if (!db.objectStoreNames.contains('cached-telemetry')) {
          const telemetryStore = db.createObjectStore('cached-telemetry', {
            keyPath: 'id',
            autoIncrement: true,
          });
          telemetryStore.createIndex('by-time', 'receivedAt');
        }

        // Shift performance data
        if (!db.objectStoreNames.contains('shift-data')) {
          db.createObjectStore('shift-data', { keyPath: 'date' });
        }
      },
    });
  }
  return dbPromise;
}

// --- Pending Acks ---

/**
 * Queue an alert acknowledgement for background sync.
 */
export async function queueAck(
  alertId: string,
  craneId: string,
  operatorId: string,
): Promise<void> {
  const db = await getDb();
  await db.put('pending-acks', {
    alertId,
    craneId,
    operatorId,
    timestamp: Date.now(),
    synced: false,
  });
}

/**
 * Get all un-synced acknowledgements.
 */
export async function getPendingAcks(): Promise<MosyDB['pending-acks']['value'][]> {
  const db = await getDb();
  const all = await db.getAll('pending-acks');
  return all.filter((a) => !a.synced);
}

/**
 * Mark an acknowledgement as synced.
 */
export async function markAckSynced(alertId: string): Promise<void> {
  const db = await getDb();
  const ack = await db.get('pending-acks', alertId);
  if (ack) {
    await db.put('pending-acks', { ...ack, synced: true });
  }
}

// --- Cached Telemetry ---

/**
 * Cache a telemetry reading for offline access.
 * Keeps at most 3600 entries (1 hour at 1 Hz).
 */
export async function cacheTelemetry(data: FusedTelemetry): Promise<void> {
  const db = await getDb();
  await db.add('cached-telemetry', {
    id: Date.now(),
    data,
    receivedAt: Date.now(),
  });

  // Prune old entries beyond 3600
  const count = await db.count('cached-telemetry');
  if (count > 3600) {
    const tx = db.transaction('cached-telemetry', 'readwrite');
    const store = tx.objectStore('cached-telemetry');
    const cursor = await store.openCursor();
    let deleted = 0;
    const toDelete = count - 3600;
    while (cursor && deleted < toDelete) {
      await cursor.delete();
      deleted++;
      await cursor.continue();
    }
    await tx.done;
  }
}

/**
 * Get the most recent cached telemetry reading.
 */
export async function getLatestCachedTelemetry(): Promise<FusedTelemetry | null> {
  const db = await getDb();
  const tx = db.transaction('cached-telemetry', 'readonly');
  const index = tx.objectStore('cached-telemetry').index('by-time');
  const cursor = await index.openCursor(null, 'prev');
  if (cursor) {
    return cursor.value.data;
  }
  return null;
}

// --- Shift Data ---

/**
 * Save or update today's shift data.
 */
export async function saveShiftData(
  data: MosyDB['shift-data']['value'],
): Promise<void> {
  const db = await getDb();
  await db.put('shift-data', data);
}

/**
 * Get shift data for a date range (inclusive).
 */
export async function getShiftDataRange(
  startDate: string,
  endDate: string,
): Promise<MosyDB['shift-data']['value'][]> {
  const db = await getDb();
  const all = await db.getAll('shift-data');
  return all.filter((d) => d.date >= startDate && d.date <= endDate);
}

/**
 * Get today's shift data.
 */
export async function getTodayShift(
  operatorId: string,
): Promise<MosyDB['shift-data']['value'] | undefined> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const data = await db.get('shift-data', today);
  if (data && data.operatorId === operatorId) return data;
  return undefined;
}
