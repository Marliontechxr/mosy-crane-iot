/**
 * App — root component with route switching between Guidance and Stats modes.
 */
import { useState, useEffect } from 'react';
import { GuidanceMode } from './screens/GuidanceMode';
import { StatsMode } from './screens/StatsMode';
import { CheckInScreen } from './screens/CheckInScreen';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useMqttConnection } from './hooks/useMqttConnection';
import { useTelemetryStore } from './stores/telemetry-store';

export type AppMode = 'guidance' | 'stats';

export function App() {
  const [mode, setMode] = useState<AppMode>('guidance');
  const isOnline = useTelemetryStore((s) => s.mqttConnected);
  const checkedIn = useTelemetryStore((s) => s.checkedIn);

  // Connect to Jetson MQTT broker on mount
  useMqttConnection();

  // Swipe down to switch to stats mode, swipe up to go back
  useEffect(() => {
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      if (deltaY > 100) setMode('stats');
      if (deltaY < -100) setMode('guidance');
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // Show check-in screen if no operator has started a shift
  if (!checkedIn) {
    return (
      <div className="relative h-full w-full">
        <ConnectionStatus connected={isOnline} />
        <CheckInScreen />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ConnectionStatus connected={isOnline} />
      {mode === 'guidance' ? (
        <GuidanceMode onSwitchMode={() => setMode('stats')} />
      ) : (
        <StatsMode onSwitchMode={() => setMode('guidance')} />
      )}
    </div>
  );
}
