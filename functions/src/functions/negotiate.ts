// =============================================================================
// MOSY — negotiate Azure Function
// HTTP Trigger: SignalR connection negotiation for real-time dashboard clients.
// Route: GET/POST /api/negotiate
// =============================================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext, input } from '@azure/functions';

const signalRInput = input.generic({
  type: 'signalRConnectionInfo',
  name: 'connectionInfo',
  hubName: 'mosy-hub',
  connectionStringSetting: 'SIGNALR_CONNECTION_STRING',
  userId: '{query.userId}',
});

async function negotiate(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const connectionInfo = context.extraInputs.get(signalRInput);

    if (!connectionInfo) {
      return {
        status: 500,
        jsonBody: {
          code: 'SIGNALR_ERROR',
          message: 'Failed to negotiate SignalR connection',
        },
      };
    }

    return {
      status: 200,
      jsonBody: connectionInfo,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    };
  } catch (err) {
    context.error(`SignalR negotiate failed: ${(err as Error).message}`);
    return {
      status: 500,
      jsonBody: {
        code: 'SIGNALR_ERROR',
        message: 'SignalR negotiation failed',
      },
    };
  }
}

app.http('negotiate', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'negotiate',
  extraInputs: [signalRInput],
  handler: negotiate,
});

export default negotiate;
