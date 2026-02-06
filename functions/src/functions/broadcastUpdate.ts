// =============================================================================
// MOSY — broadcastUpdate Azure Function
// IoT Hub Trigger → SignalR Output: Routes telemetry to dashboard clients
// in real-time via crane-specific SignalR groups.
// =============================================================================

import { app, InvocationContext, output } from '@azure/functions';
import type { FusedTelemetry, AlertMessage } from '@mosy/shared-types';

const signalROutput = output.generic({
  type: 'signalR',
  name: 'signalRMessages',
  hubName: 'mosy-hub',
  connectionStringSetting: 'SIGNALR_CONNECTION_STRING',
});

type UpdateType = 'telemetryUpdate' | 'alertNotification' | 'stateChange' | 'craneOnline' | 'craneOffline';

function detectMessageType(message: Record<string, unknown>): UpdateType {
  if (message.alert_id) return 'alertNotification';
  if (message.current_state) return 'stateChange';
  return 'telemetryUpdate';
}

function buildTelemetryPayload(telemetry: FusedTelemetry): Record<string, unknown> {
  return {
    type: 'telemetryUpdate',
    craneId: telemetry.crane_id,
    timestamp: telemetry.timestamp,
    data: {
      load_tonnes: telemetry.load?.value_tonnes ?? 0,
      load_percent: telemetry.load?.confidence ?? 0,
      boom_angle: telemetry.position?.boom_angle_degrees ?? 0,
      boom_distance_m: telemetry.position?.boom_distance_m ?? 0,
      hook_height_m: telemetry.position?.hook_height_m ?? 0,
      wind_speed_kmh: telemetry.environment?.wind_speed_kmh ?? 0,
      operator_present: telemetry.safety_flags?.operator_present ?? false,
      operator_perclos: telemetry.safety_flags?.operator_drowsy ? 1 : 0,
      alerts_count: 0,
    },
  };
}

function buildAlertPayload(alert: AlertMessage): Record<string, unknown> {
  return {
    type: 'alertNotification',
    craneId: alert.crane_id,
    alertId: alert.alert_id,
    timestamp: alert.timestamp,
    level: alert.level,
    title: alert.title,
    description: alert.description,
    values: alert.values,
    acknowledged: false,
  };
}

function buildStateChangePayload(message: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'stateChange',
    craneId: String(message.crane_id ?? ''),
    timestamp: (message.timestamp as number) ?? Date.now(),
    stateType: String(message.state_type ?? 'unknown'),
    previousState: String(message.previous_state ?? ''),
    currentState: String(message.current_state ?? ''),
    metadata: (message.metadata as Record<string, unknown>) ?? {},
  };
}

async function broadcastUpdate(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const msg = message as Record<string, unknown>;

  if (!msg?.crane_id) {
    context.warn('broadcastUpdate received message without crane_id, skipping');
    return;
  }

  const craneId = String(msg.crane_id);
  const messageType = detectMessageType(msg);

  let payload: Record<string, unknown>;

  switch (messageType) {
    case 'alertNotification':
      payload = buildAlertPayload(msg as unknown as AlertMessage);
      break;
    case 'stateChange':
      payload = buildStateChangePayload(msg);
      break;
    case 'telemetryUpdate':
    default:
      payload = buildTelemetryPayload(msg as unknown as FusedTelemetry);
      break;
  }

  // Send to crane-specific group and broadcast
  const signalRMessages = [
    {
      target: messageType,
      groupName: `crane-${craneId}`,
      arguments: [payload],
    },
    {
      target: messageType,
      arguments: [payload],
    },
  ];

  context.extraOutputs.set(signalROutput, signalRMessages);

  context.log(
    `Broadcast ${messageType} for crane ${craneId} (group: crane-${craneId})`
  );
}

app.generic('broadcastUpdate', {
  trigger: {
    type: 'eventHubTrigger',
    name: 'message',
    eventHubName: '',
    connection: 'IoTHubConnection',
    consumerGroup: 'broadcast',
    cardinality: 'one',
  },
  extraOutputs: [signalROutput],
  handler: broadcastUpdate,
});

export default broadcastUpdate;
