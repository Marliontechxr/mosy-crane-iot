// =============================================================================
// MOSY — App Service Module
// Hosts the Next.js 16 admin dashboard
// =============================================================================

@description('Environment name')
param environment string

@description('Azure region')
param location string

@description('Tags for all resources')
param tags object

@description('App Service Plan SKU — B1 for dev, B2 for prod')
param skuName string = environment == 'prod' ? 'B2' : 'B1'

var appServiceName = 'mosy-admin-${environment}'
var appServicePlanName = 'mosy-asp-admin-${environment}'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  properties: {
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appServiceName
  location: location
  tags: union(tags, { 'azd-service-name': 'admin-dashboard' })
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appSettings: [
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~22' }
        { name: 'NODE_ENV', value: environment == 'prod' ? 'production' : 'development' }
      ]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
    }
  }
}

output appServiceName string = appService.name
output appServiceId string = appService.id
output appServiceHostName string = appService.properties.defaultHostName
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
