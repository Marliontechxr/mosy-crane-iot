// =============================================================================
// MOSY — Azure SignalR Service Module
// Real-time WebSocket relay for dashboard telemetry updates
// =============================================================================

@description('Environment name')
param environment string

@description('Azure region')
param location string

@description('Tags for all resources')
param tags object

@description('SignalR SKU — Free_F1 for dev, Standard_S1 for prod')
param skuName string = environment == 'prod' ? 'Standard_S1' : 'Free_F1'

var signalRName = 'mosy-signalr-${environment}'

resource signalR 'Microsoft.SignalRService/signalR@2024-03-01' = {
  name: signalRName
  location: location
  tags: tags
  sku: {
    name: skuName
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Default'
      }
      {
        flag: 'EnableConnectivityLogs'
        value: 'True'
      }
    ]
    cors: {
      allowedOrigins: ['*']
    }
    tls: {
      clientCertEnabled: false
    }
  }
}

output signalRName string = signalR.name
output signalRId string = signalR.id
output signalRHostName string = signalR.properties.hostName
