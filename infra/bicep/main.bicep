// =============================================================================
// MOSY — Main Bicep Template
// Orchestrates all Azure resource modules for the MOSY platform.
// Deploy: az deployment group create -g rg-mosy-dev -f main.bicep -p parameters/dev.bicepparam
// =============================================================================

targetScope = 'resourceGroup'

@description('Environment name (dev or prod)')
@allowed(['dev', 'prod'])
param environment string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Azure AD tenant ID')
param tenantId string

@description('Object ID of the deploying user (for Key Vault access)')
param deployerObjectId string

@description('Override location for Cosmos DB (use if primary region has capacity issues)')
param cosmosLocation string = location

@description('Project tags applied to all resources')
param tags object = {
  project: 'mosy'
  env: environment
  owner: 'balanetra'
}

// --- IoT Hub ---
module iotHub 'modules/iot-hub.bicep' = {
  name: 'iotHub-${environment}'
  params: {
    environment: environment
    location: location
    tags: tags
  }
}

// --- Cosmos DB ---
module cosmosDb 'modules/cosmos-db.bicep' = {
  name: 'cosmosDb-${environment}'
  params: {
    environment: environment
    location: cosmosLocation
    tags: tags
  }
}

// --- Blob Storage ---
module storage 'modules/storage.bicep' = {
  name: 'storage-${environment}'
  params: {
    environment: environment
    location: location
    tags: tags
  }
}

// --- Azure Functions ---
module functions 'modules/functions.bicep' = {
  name: 'functions-${environment}'
  params: {
    environment: environment
    location: location
    tags: tags
    storageAccountName: storage.outputs.storageAccountName
  }
}

// --- SignalR Service ---
module signalr 'modules/signalr.bicep' = {
  name: 'signalr-${environment}'
  params: {
    environment: environment
    location: location
    tags: tags
  }
}

// --- Key Vault ---
module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVault-${environment}'
  params: {
    environment: environment
    location: location
    tags: tags
    tenantId: tenantId
    deployerObjectId: deployerObjectId
  }
}

// --- App Service (Admin Dashboard) ---
module appService 'modules/app-service.bicep' = {
  name: 'appService-${environment}'
  params: {
    environment: environment
    location: location
    tags: tags
  }
}

// --- Container Registry ---
module containerRegistry 'modules/container-registry.bicep' = {
  name: 'containerRegistry-${environment}'
  params: {
    environment: environment
    location: location
    tags: tags
  }
}

// --- Outputs ---
output resourceGroupName string = resourceGroup().name
output location string = location
output environment string = environment

output iotHubName string = iotHub.outputs.iotHubName
output iotHubHostName string = iotHub.outputs.iotHubHostName

output cosmosAccountName string = cosmosDb.outputs.cosmosAccountName
output cosmosEndpoint string = cosmosDb.outputs.cosmosEndpoint
output cosmosDatabaseName string = cosmosDb.outputs.databaseName

output storageAccountName string = storage.outputs.storageAccountName
output storageBlobEndpoint string = storage.outputs.primaryBlobEndpoint

output functionAppName string = functions.outputs.functionAppName
output functionAppHostName string = functions.outputs.functionAppHostName

output signalRName string = signalr.outputs.signalRName
output signalRHostName string = signalr.outputs.signalRHostName

output keyVaultName string = keyVault.outputs.keyVaultName
output keyVaultUri string = keyVault.outputs.keyVaultUri

output appServiceName string = appService.outputs.appServiceName
output appServiceUrl string = appService.outputs.appServiceUrl

output acrName string = containerRegistry.outputs.acrName
output acrLoginServer string = containerRegistry.outputs.acrLoginServer
