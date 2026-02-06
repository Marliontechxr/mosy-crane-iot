// =============================================================================
// MOSY — Shared Cosmos DB Client
// Singleton client for all Azure Functions to access mosydb containers.
// =============================================================================

import { CosmosClient, Database, Container } from '@azure/cosmos';
import { COSMOS_DATABASE, COSMOS_CONTAINERS } from '@mosy/shared-types';

let client: CosmosClient | null = null;
let database: Database | null = null;

function getClient(): CosmosClient {
  if (!client) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    if (!endpoint || !key) {
      throw new Error('COSMOS_ENDPOINT and COSMOS_KEY environment variables are required');
    }
    client = new CosmosClient({ endpoint, key });
  }
  return client;
}

function getDatabase(): Database {
  if (!database) {
    database = getClient().database(COSMOS_DATABASE);
  }
  return database;
}

type ContainerKey = keyof typeof COSMOS_CONTAINERS;

export function getContainer(containerKey: ContainerKey): Container {
  return getDatabase().container(COSMOS_CONTAINERS[containerKey].name);
}

export { getClient, getDatabase };
