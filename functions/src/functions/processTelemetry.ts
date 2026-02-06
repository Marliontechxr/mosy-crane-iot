// =============================================================================
// MOSY — processTelemetry Azure Function
// IoT Hub Trigger: Ingests D2C telemetry → enriches → writes to Cosmos DB.
// Dead-letters to Blob Storage on failure.
// =============================================================================

import { app, InvocationContext } from '@azure/functions';
import type { FusedTelemetry, TelemetryDocument } from '@mosy/shared-types';
import { getContainer } from '../shared/cosmos-client.js';
import { uploadDeadLetter } from '../shared/blob-client.js';

async function processTelemetry(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const telemetry = message as FusedTelemetry;

  if (!telemetry?.crane_id || !telemetry?.timestamp) {
    context.error('Invalid telemetry message: missing crane_id or timestamp');
    return;
  }

  const messageId = `${telemetry.crane_id}-${telemetry.sequence}-${telemetry.timestamp}`;

  try {
    const container = getContainer('TELEMETRY');

    const document: TelemetryDocument = {
      id: messageId,
      craneId: telemetry.crane_id,
      siteId: '', // Resolved from crane registry; enriched downstream
      timestamp: telemetry.timestamp,
      sequence: telemetry.sequence,
      load: {
        value_tonnes: telemetry.load.value_tonnes,
        max_safe_tonnes: 0, // Set from crane config
        percent: telemetry.load.confidence > 0 ? telemetry.load.value_tonnes : 0,
        confidence: telemetry.load.confidence,
        source: 'ocr',
      },
      position: {
        boom_angle_degrees: telemetry.position.boom_angle_degrees,
        boom_distance_m: telemetry.position.boom_distance_m,
        hook_height_m: telemetry.position.hook_height_m,
        confidence: telemetry.position.confidence,
      },
      motion: {
        acceleration_x: telemetry.motion.acceleration_vector[0],
        acceleration_y: telemetry.motion.acceleration_vector[1],
        acceleration_z: telemetry.motion.acceleration_vector[2],
        angular_velocity_x: telemetry.motion.angular_velocity[0],
        angular_velocity_y: telemetry.motion.angular_velocity[1],
        angular_velocity_z: telemetry.motion.angular_velocity[2],
      },
      environment: {
        wind_speed_kmh: telemetry.environment.wind_speed_kmh,
        temperature_c: telemetry.environment.temperature_c,
        hazard_zone_motion: telemetry.environment.hazard_zone_motion,
      },
      safety_flags: {
        load_over_limit: telemetry.safety_flags.load_over_limit,
        wind_excessive: telemetry.safety_flags.wind_excessive,
        operator_present: telemetry.safety_flags.operator_present,
        operator_drowsy: telemetry.safety_flags.operator_drowsy,
        uncommanded_motion: telemetry.safety_flags.uncommanded_motion,
      },
      status: telemetry.status,
      ttl: 7776000, // 90 days
    };

    await container.items.create(document);

    context.log(
      `Telemetry stored: ${messageId} (crane: ${telemetry.crane_id}, seq: ${telemetry.sequence})`
    );
  } catch (err) {
    const error = err as Error;
    context.error(`Failed to process telemetry ${messageId}: ${error.message}`);

    try {
      await uploadDeadLetter('processTelemetry', messageId, telemetry, error);
      context.warn(`Dead-lettered telemetry message ${messageId}`);
    } catch (dlErr) {
      context.error(
        `Dead-letter upload also failed for ${messageId}: ${(dlErr as Error).message}`
      );
    }
  }
}

app.generic('processTelemetry', {
  trigger: {
    type: 'eventHubTrigger',
    name: 'message',
    eventHubName: '',
    connection: 'IoTHubConnection',
    consumerGroup: '$Default',
    cardinality: 'one',
  },
  handler: processTelemetry,
});

export default processTelemetry;
