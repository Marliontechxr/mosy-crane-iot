// =============================================================================
// MOSY — Notification Helpers
// WhatsApp Business API, SMS, and supervisor call integrations.
// =============================================================================

import { InvocationContext } from '@azure/functions';
import type { AlertMessage } from '@mosy/shared-types';

/**
 * Send a WhatsApp alert notification via Azure Communication Services WhatsApp Business API.
 */
export async function sendWhatsAppAlert(
  alert: AlertMessage,
  context: InvocationContext
): Promise<void> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_TOKEN;
  const supervisorPhone = process.env.SUPERVISOR_PHONE;

  if (!apiUrl || !token || !supervisorPhone) {
    context.warn(
      'WhatsApp not configured (WHATSAPP_API_URL, WHATSAPP_TOKEN, SUPERVISOR_PHONE). Skipping notification.'
    );
    return;
  }

  const templateName = `${alert.level.toUpperCase()}_ALERT`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: supervisorPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: alert.crane_id },
            { type: 'text', text: alert.title },
            { type: 'text', text: alert.description },
            { type: 'text', text: JSON.stringify(alert.values) },
          ],
        },
      ],
    },
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      context.error(`WhatsApp API error (${response.status}): ${errorText}`);
    } else {
      context.log(`WhatsApp alert sent to ${supervisorPhone} for crane ${alert.crane_id}`);
    }
  } catch (err) {
    context.error(`WhatsApp notification failed: ${(err as Error).message}`);
  }
}

/**
 * Send an SMS alert via Azure Communication Services.
 */
export async function sendSmsAlert(
  alert: AlertMessage,
  context: InvocationContext
): Promise<void> {
  const connString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
  const supervisorPhone = process.env.SUPERVISOR_PHONE;

  if (!connString || !supervisorPhone) {
    context.warn(
      'SMS not configured (COMMUNICATION_SERVICES_CONNECTION_STRING, SUPERVISOR_PHONE). Skipping.'
    );
    return;
  }

  try {
    const { SmsClient } = await import('@azure/communication-sms');
    const smsClient = new SmsClient(connString);

    const message = `MOSY ${alert.level.toUpperCase()}: ${alert.crane_id} - ${alert.title}`;

    await smsClient.send({
      from: process.env.SMS_SENDER_NUMBER || '+10000000000',
      to: [supervisorPhone],
      message: message.substring(0, 160),
    });

    context.log(`SMS alert sent to ${supervisorPhone} for crane ${alert.crane_id}`);
  } catch (err) {
    context.error(`SMS notification failed: ${(err as Error).message}`);
  }
}

/**
 * Initiate a supervisor call for critical alerts.
 * Placeholder — requires Twilio or Azure Communication Services Voice integration.
 */
export async function initiateSupervisorCall(
  alert: AlertMessage,
  context: InvocationContext
): Promise<void> {
  const supervisorPhone = process.env.SUPERVISOR_PHONE;
  if (!supervisorPhone) {
    context.warn('SUPERVISOR_PHONE not configured. Skipping call initiation.');
    return;
  }

  context.log(
    `[CALL PLACEHOLDER] Would initiate supervisor call to ${supervisorPhone} for CRITICAL alert on crane ${alert.crane_id}: ${alert.title}`
  );
}

/**
 * Send a WhatsApp message with a shift report link.
 */
export async function sendShiftReportWhatsApp(
  operatorName: string,
  craneId: string,
  reportUrl: string,
  context: InvocationContext
): Promise<void> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_TOKEN;
  const supervisorPhone = process.env.SUPERVISOR_PHONE;

  if (!apiUrl || !token || !supervisorPhone) {
    context.warn('WhatsApp not configured. Skipping shift report notification.');
    return;
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: supervisorPhone,
    type: 'template',
    template: {
      name: 'SHIFT_REPORT',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: operatorName },
            { type: 'text', text: craneId },
            { type: 'text', text: reportUrl },
          ],
        },
      ],
    },
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      context.error(`WhatsApp shift report error (${response.status}): ${await response.text()}`);
    } else {
      context.log(`Shift report notification sent for ${operatorName} on crane ${craneId}`);
    }
  } catch (err) {
    context.error(`WhatsApp shift report failed: ${(err as Error).message}`);
  }
}
