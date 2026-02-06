// =============================================================================
// MOSY — Shared SignalR Service Client
// Broadcasts real-time updates to dashboard clients via Azure SignalR.
// =============================================================================

const HUB_NAME = 'mosy-hub';

export interface SignalRMessage {
  target: string;
  arguments: unknown[];
  groupName?: string;
}

/**
 * Build a SignalR output message for broadcasting to all connected clients.
 */
export function buildBroadcastMessage(target: string, payload: unknown): SignalRMessage {
  return {
    target,
    arguments: [payload],
  };
}

/**
 * Build a SignalR output message for broadcasting to a specific crane group.
 */
export function buildGroupMessage(
  craneId: string,
  target: string,
  payload: unknown
): SignalRMessage {
  return {
    target,
    arguments: [payload],
    groupName: `crane-${craneId}`,
  };
}

/**
 * Get the SignalR connection info for client negotiation.
 */
export function getNegotiateResponse(userId?: string): {
  hubName: string;
  userId?: string;
} {
  return {
    hubName: HUB_NAME,
    ...(userId ? { userId } : {}),
  };
}

export { HUB_NAME };
