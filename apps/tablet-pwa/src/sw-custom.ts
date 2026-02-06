/**
 * MOSY — Custom Service Worker for Background Sync
 *
 * Extends Workbox-generated SW with background sync handlers:
 *  - sync-acknowledgments: Flush pending alert acks from IndexedDB
 *  - sync-telemetry: Batch upload cached telemetry
 *
 * This file is imported by vite-plugin-pwa as injectManifest source.
 */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { openDB } from 'idb';

// Workbox precaching (auto-injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Runtime caching for Jetson API calls
registerRoute(
  ({ url }) => /^https?:\/\/192\.168\.4\.\d+/.test(url.href),
  new NetworkFirst({
    cacheName: 'mosy-api-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 }),
    ],
  })
);

// ---------------------------------------------------------------------------
// IndexedDB access (matches offline-db.ts schema)
// ---------------------------------------------------------------------------

const DB_NAME = 'mosy-tablet';
const DB_VERSION = 1;

async function getSwDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pending-acks')) {
        db.createObjectStore('pending-acks', { keyPath: 'alertId' });
      }
      if (!db.objectStoreNames.contains('cached-telemetry')) {
        const store = db.createObjectStore('cached-telemetry', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-time', 'receivedAt');
      }
      if (!db.objectStoreNames.contains('shift-data')) {
        db.createObjectStore('shift-data', { keyPath: 'date' });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Background Sync: sync-acknowledgments
// ---------------------------------------------------------------------------

async function syncAcknowledgments(): Promise<void> {
  const db = await getSwDb();
  const allAcks = await db.getAll('pending-acks');
  const pending = allAcks.filter((a) => !a.synced);

  if (pending.length === 0) return;

  console.log(`[SW] Syncing ${pending.length} pending acknowledgments`);

  for (const ack of pending) {
    try {
      const response = await fetch(`/api/alerts/${ack.alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acknowledged_by: ack.operatorId,
          notes: `Offline ack at ${new Date(ack.timestamp).toISOString()}`,
        }),
      });

      if (response.ok) {
        // Mark as synced in IndexedDB
        await db.put('pending-acks', { ...ack, synced: true });
        console.log(`[SW] Synced ack for alert ${ack.alertId}`);
      } else {
        console.warn(`[SW] Failed to sync ack ${ack.alertId}: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[SW] Network error syncing ack ${ack.alertId}:`, err);
      // Retry will happen on next sync event
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Background Sync: sync-telemetry
// ---------------------------------------------------------------------------

async function syncTelemetry(): Promise<void> {
  const db = await getSwDb();
  const tx = db.transaction('cached-telemetry', 'readwrite');
  const store = tx.objectStore('cached-telemetry');
  const allEntries = await store.getAll();

  if (allEntries.length === 0) return;

  console.log(`[SW] Syncing ${allEntries.length} cached telemetry entries`);

  // Batch upload (max 100 per request)
  const batchSize = 100;
  for (let i = 0; i < allEntries.length; i += batchSize) {
    const batch = allEntries.slice(i, i + batchSize);
    try {
      const response = await fetch('/api/telemetry/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: batch.map((e) => e.data) }),
      });

      if (response.ok) {
        // Remove synced entries
        const deleteTx = db.transaction('cached-telemetry', 'readwrite');
        const deleteStore = deleteTx.objectStore('cached-telemetry');
        for (const entry of batch) {
          await deleteStore.delete(entry.id);
        }
        await deleteTx.done;
        console.log(`[SW] Synced ${batch.length} telemetry entries`);
      }
    } catch (err) {
      console.warn('[SW] Failed to sync telemetry batch:', err);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Sync Event Handler
// ---------------------------------------------------------------------------

self.addEventListener('sync', (event: ExtendableEvent & { tag?: string }) => {
  const tag = (event as unknown as { tag: string }).tag;
  if (tag === 'sync-acknowledgments') {
    event.waitUntil(syncAcknowledgments());
  } else if (tag === 'sync-telemetry') {
    event.waitUntil(syncTelemetry());
  }
});

// ---------------------------------------------------------------------------
// Activate — claim clients immediately
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
