// =============================================================================
// MOSY — Blob Storage Module
// Azure Storage Account v2 with blob containers
// =============================================================================

@description('Environment name')
param environment string

@description('Azure region')
param location string

@description('Tags for all resources')
param tags object

var storageAccountName = 'mosystorage${environment}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

var containerNames = [
  'camera-snapshots'
  'shift-reports'
  'model-artifacts'
  'edge-logs'
  'calibration-profiles'
  'telemetry-archive'
]

resource blobContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [
  for containerName in containerNames: {
    parent: blobService
    name: containerName
    properties: {
      publicAccess: 'None'
    }
  }
]

output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output primaryBlobEndpoint string = storageAccount.properties.primaryEndpoints.blob
