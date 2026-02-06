/**
 * ConnectionStatus — small indicator showing MQTT broker connection state.
 */

interface ConnectionStatusProps {
  connected: boolean;
}

export function ConnectionStatus({ connected }: ConnectionStatusProps) {
  return (
    <div className="absolute top-2 right-2 z-50 flex items-center gap-1.5 rounded-full bg-mosy-surface/80 px-3 py-1 text-xs backdrop-blur-sm">
      <div
        className={`h-2 w-2 rounded-full ${
          connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      <span className="text-mosy-muted">
        {connected ? 'LIVE' : 'OFFLINE'}
      </span>
    </div>
  );
}
