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

@description('Project tags applied to all resources')
param tags object = {
  project: 'mosy'
  env: environment
  owner: 'balanetra'
}

// --- Module Placeholders ---
// These will be implemented in Phase 1: Azure Infrastructure

// module iotHub 'modules/iot-hub.bicep' = { ... }
// module cosmosDb 'modules/cosmos-db.bicep' = { ... }
// module storage 'modules/storage.bicep' = { ... }
// module functions 'modules/functions.bicep' = { ... }
// module signalr 'modules/signalr.bicep' = { ... }
// module keyVault 'modules/keyvault.bicep' = { ... }
// module appService 'modules/app-service.bicep' = { ... }
// module containerRegistry 'modules/container-registry.bicep' = { ... }

// --- Outputs ---
output resourceGroupName string = resourceGroup().name
output location string = location
output environment string = environment
