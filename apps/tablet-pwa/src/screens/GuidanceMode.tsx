/**
 * GuidanceMode — full-screen camera feed with HUD overlay.
 * Blueprint Section 12 — primary operator view during crane operations.
 *
 * Layout (landscape):
 * ┌─────────────────────────────────────────────┐
 * │  [LoadGauge]            [AlertBadge]         │
 * │                                              │
 * │           MJPEG Camera Feed                  │
 * │          (with GuidanceLines)                │
 * │                                              │
 * │  [Wind] [Clearance]           [swipe ↓]     │
 * └─────────────────────────────────────────────┘
 */
import { useRef, useEffect, useState } from 'react';
import { useTelemetryStore } from '@/stores/telemetry-store';
import { CameraFeed } from '@/components/CameraFeed';
import { LoadGauge } from '@/components/hud/LoadGauge';
import { WindIndicator } from '@/components/hud/WindIndicator';
import { ClearanceDisplay } from '@/components/hud/ClearanceDisplay';
import { AlertBadge } from '@/components/hud/AlertBadge';
import { GuidanceLines } from '@/components/hud/GuidanceLines';

/** Default rated capacity for POC crane (tonnes). */
const RATED_CAPACITY_TONNES = 50;

/** MJPEG stream URL from Jetson OCR service. */
const CAMERA_STREAM_URL = 'http://192.168.4.1:8084/stream';

interface GuidanceModeProps {
  onSwitchMode: () => void;
}

export function GuidanceMode({ onSwitchMode }: GuidanceModeProps) {
  const telemetry = useTelemetryStore((s) => s.telemetry);
  const alertCount = useTelemetryStore((s) => s.alertCount);
  const maxAlertLevel = useTelemetryStore((s) => s.maxAlertLevel);
  const groundClearanceM = useTelemetryStore((s) => s.groundClearanceM);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1024, height: 600 });

  // Track container size for guidance lines
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const load = telemetry?.load.value_tonnes ?? 0;
  const windSpeed = telemetry?.environment.wind_speed_kmh ?? 0;
  const windDir = telemetry?.environment.wind_direction_degrees ?? 0;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
      {/* Camera feed — full background */}
      <CameraFeed
        streamUrl={CAMERA_STREAM_URL}
        alt="Crane camera feed"
        className="absolute inset-0"
      />

      {/* Guidance lines overlay */}
      <div className="absolute inset-0">
        <GuidanceLines width={dimensions.width} height={dimensions.height} />
      </div>

      {/* HUD overlay — top left: load gauge */}
      <div className="absolute top-4 left-4 z-10">
        <LoadGauge
          currentTonnes={load}
          ratedCapacityTonnes={RATED_CAPACITY_TONNES}
          size={140}
        />
      </div>

      {/* HUD overlay — top right: alert badge */}
      <div className="absolute top-4 right-16 z-10">
        <AlertBadge
          count={alertCount}
          maxLevel={maxAlertLevel}
        />
      </div>

      {/* HUD overlay — bottom left: wind + clearance */}
      <div className="absolute bottom-4 left-4 z-10 flex items-end gap-6">
        <WindIndicator speedKmh={windSpeed} directionDeg={windDir} />
        <ClearanceDisplay distanceM={groundClearanceM} />
      </div>

      {/* HUD overlay — bottom right: swipe hint */}
      <div className="absolute bottom-4 right-4 z-10">
        <button
          onClick={onSwitchMode}
          className="flex flex-col items-center gap-1 rounded-lg bg-mosy-surface/60 px-3 py-2 text-mosy-muted backdrop-blur-sm active:bg-mosy-surface/80 transition-colors"
          type="button"
          aria-label="Switch to stats mode"
        >
          <svg width={20} height={20} viewBox="0 0 20 20" fill="currentColor" opacity={0.6}>
            <path d="M10 14l-5-5h10l-5 5z" />
          </svg>
          <span className="text-[10px] uppercase tracking-wider">Stats</span>
        </button>
      </div>

      {/* HUD overlay — top center: boom angle + hook height */}
      {telemetry && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-6 rounded-lg bg-mosy-surface/60 px-4 py-2 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <span className="text-xs text-mosy-muted">BOOM</span>
            <span className="text-sm font-bold font-mono text-white">
              {telemetry.position.boom_angle_degrees.toFixed(1)}°
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs text-mosy-muted">HOOK</span>
            <span className="text-sm font-bold font-mono text-white">
              {telemetry.position.hook_height_m.toFixed(1)}m
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
