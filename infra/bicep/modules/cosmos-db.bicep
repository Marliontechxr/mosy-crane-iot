// =============================================================================
// MOSY — Cosmos DB Module
// Azure Cosmos DB SQL API with mosydb database and all 10 containers
// Uses shared database-level throughput (400 RU/s) for dev cost efficiency.
// Production should use per-container throughput with autoscale.
// =============================================================================

@description('Environment name')
param environment string

@description('Azure region')
param location string

@description('Tags for all resources')
param tags object

var cosmosAccountName = 'mosy-cosmos-${environment}'
var databaseName = 'mosydb'

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'ConsistentPrefix'
      maxIntervalInSeconds: 5
      maxStalenessPrefix: 100
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    enableAutomaticFailover: false
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
  }
}

// Database with shared throughput (400 RU/s for dev, autoscale 400-1000 for prod)
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
    options: {
      throughput: 400
    }
  }
}

// ---------------------------------------------------------------------------
// Shared indexing policy for all containers
// ---------------------------------------------------------------------------
var defaultIndexingPolicy = {
  indexingMode: 'consistent'
  automatic: true
  includedPaths: [
    { path: '/*' }
  ]
  excludedPaths: [
    { path: '/"_etag"/?' }
  ]
}

// ---------------------------------------------------------------------------
// Container definitions: name, partitionKey, ttlSeconds, compositeIndexes
// Throughput is shared at database level (no per-container throughput)
// ---------------------------------------------------------------------------
var containers = [
  {
    name: 'telemetry'
    partitionKey: '/craneId'
    ttl: 7776000    // 90 days
    compositeIndexes: [
      [
        { path: '/craneId', order: 'ascending' }
        { path: '/timestamp', order: 'descending' }
      ]
    ]
  }
  {
    name: 'alerts'
    partitionKey: '/craneId'
    ttl: -1
    compositeIndexes: [
      [
        { path: '/craneId', order: 'ascending' }
        { path: '/level', order: 'ascending' }
      ]
    ]
  }
  {
    name: 'shifts'
    partitionKey: '/operatorId'
    ttl: -1
    compositeIndexes: [
      [
        { path: '/operatorId', order: 'ascending' }
        { path: '/shift_start', order: 'descending' }
      ]
    ]
  }
  {
    name: 'lifts'
    partitionKey: '/craneId'
    ttl: 31536000    // 1 year
    compositeIndexes: []
  }
  {
    name: 'cranes'
    partitionKey: '/siteId'
    ttl: -1
    compositeIndexes: []
  }
  {
    name: 'operators'
    partitionKey: '/siteId'
    ttl: -1
    compositeIndexes: []
  }
  {
    name: 'sites'
    partitionKey: '/organizationId'
    ttl: -1
    compositeIndexes: []
  }
  {
    name: 'calibrations'
    partitionKey: '/craneId'
    ttl: -1
    compositeIndexes: []
  }
  {
    name: 'diagnostics'
    partitionKey: '/craneId'
    ttl: 2592000    // 30 days
    compositeIndexes: []
  }
  {
    name: 'incidents'
    partitionKey: '/siteId'
    ttl: -1
    compositeIndexes: []
  }
]

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [
  for container in containers: {
    parent: database
    name: container.name
    properties: {
      resource: {
        id: container.name
        partitionKey: {
          paths: [container.partitionKey]
          kind: 'Hash'
        }
        defaultTtl: container.ttl
        indexingPolicy: union(defaultIndexingPolicy, {
          compositeIndexes: container.compositeIndexes
        })
      }
    }
  }
]

output cosmosAccountName string = cosmosAccount.name
output cosmosAccountId string = cosmosAccount.id
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output databaseName string = databaseName
