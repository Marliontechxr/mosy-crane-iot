// =============================================================================
// MOSY — processAlert Azure Function
// IoT Hub Trigger: Processes alert messages with escalation based on severity.
//   - critical: WhatsApp + SMS + supervisor call + SignalR
//   - warning:  WhatsApp + SignalR
//   - info:     log + SignalR
// =============================================================================

import { app, InvocationContext, output } from '@azure/functions';
import type { AlertMessage, AlertDocument } from '@mosy/shared-types';
import { getContainer } from '../shared/cosmos-client.js';
import { uploadDeadLetter } from '../shared/blob-client.js';
import { buildBroadcastMessage } from '../shared/signalr-client.js';
import {
  sendWhatsAppAlert,
  sendSmsAlert,
  initiateSupervisorCall,
} from '../shared/notifications.js';

const signalROutput = output.generic({
  type: 'signalR',
  name: 'signalRMessages',
  hubName: 'mosy-hub',
  connectionStringSetting: 'SIGNALR_CONNECTION_STRING',
});

async function processAlert(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const alert = message as AlertMessage;

  if (!alert?.alert_id || !alert?.crane_id || !alert?.level) {
    context.error('Invalid alert message: missing alert_id, crane_id, or level');
    return;
  }

  context.log(
    `Processing alert: ${alert.alert_id} (crane: ${alert.crane_id}, level: ${alert.level})`
  );

  try {
    // 1. Store in Cosmos DB alerts container
    const container = getContainer('ALERTS');

    const document: AlertDocument = {
      id: `${alert.crane_id}-${alert.alert_id}`,
      craneId: alert.crane_id,
      siteId: '', // Enriched from crane registry
      alertId: alert.alert_id,
      timestamp: alert.timestamp,
      level: alert.level,
      type: alert.type,
      title: alert.title,
      description: alert.description,
      source: alert.source,
      values: alert.values,
      acknowledged: false,
      actions: alert.actions ?? [],
      auto_recovery: alert.auto_recovery,
      created_at: Date.now(),
    };

    await container.items.create(document);
    context.log(`Alert stored in Cosmos DB: ${alert.alert_id}`);

    // 2. Escalate based on level
    switch (alert.level) {
      case 'critical':
        await Promise.allSettled([
          sendWhatsAppAlert(alert, context),
          sendSmsAlert(alert, context),
          initiateSupervisorCall(alert, context),
        ]);
        context.log(`Critical alert escalated: ${alert.alert_id}`);
        break;

      case 'warning':
        await sendWhatsAppAlert(alert, context);
        context.log(`Warning alert notified: ${alert.alert_id}`);
        break;

      case 'info':
        context.log(`Info alert logged: ${alert.alert_id}`);
        break;

      default:
        context.warn(`Unknown alert level "${alert.level}" for ${alert.alert_id}`);
    }

    // 3. Broadcast to SignalR for real-time dashboard
    const signalRMessage = buildBroadcastMessage('alertNotification', {
      type: 'alertNotification',
      craneId: alert.crane_id,
      alertId: alert.alert_id,
      timestamp: alert.timestamp,
      level: alert.level,
      title: alert.title,
      description: alert.description,
      values: alert.values,
      acknowledged: false,
    });

    context.extraOutputs.set(signalROutput, signalRMessage);
  } catch (err) {
    const error = err as Error;
    context.error(`Failed to process alert ${alert.alert_id}: ${error.message}`);

    try {
      await uploadDeadLetter('processAlert', alert.alert_id, alert, error);
    } catch (dlErr) {
      context.error(
        `Dead-letter failed for alert ${alert.alert_id}: ${(dlErr as Error).message}`
      );
    }
  }
}

app.generic('processAlert', {
  trigger: {
    type: 'eventHubTrigger',
    name: 'message',
    eventHubName: '',
    connection: 'IoTHubConnection',
    consumerGroup: '$Default',
    cardinality: 'one',
  },
  extraOutputs: [signalROutput],
  handler: processAlert,
});

export default processAlert;
