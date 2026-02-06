// =============================================================================
// MOSY — IoT Hub Module
// Azure IoT Hub S1 for device messaging and telemetry ingestion
// =============================================================================

@description('Environment name')
param environment string

@description('Azure region')
param location string

@description('Tags for all resources')
param tags object

var iotHubName = 'mosy-iothub-${environment}'

resource iotHub 'Microsoft.Devices/IotHubs@2023-06-30' = {
  name: iotHubName
  location: location
  tags: tags
  sku: {
    name: 'S1'
    capacity: 1
  }
  properties: {
    eventHubEndpoints: {
      events: {
        retentionTimeInDays: 1
        partitionCount: 4
      }
    }
    cloudToDevice: {
      maxDeliveryCount: 10
      defaultTtlAsIso8601: 'PT1H'
      feedback: {
        ttlAsIso8601: 'PT1H'
        lockDurationAsIso8601: 'PT1M'
        maxDeliveryCount: 10
      }
    }
    messagingEndpoints: {
      fileNotifications: {
        ttlAsIso8601: 'PT1H'
        lockDurationAsIso8601: 'PT1M'
        maxDeliveryCount: 10
      }
    }
  }
}

output iotHubName string = iotHub.name
output iotHubHostName string = iotHub.properties.hostName
output iotHubId string = iotHub.id
output eventHubEndpoint string = iotHub.properties.eventHubEndpoints.events.endpoint
output eventHubPath string = iotHub.properties.eventHubEndpoints.events.path
