/**
 * CheckInScreen — full-screen operator check-in before shift starts.
 * Displays a grid of known operators for one-tap check-in,
 * plus a manual entry form for unlisted operators.
 *
 * Layout (landscape):
 * +------------------+---------------------------------------------+
 * |  MOSY Logo       |  Operator cards grid (2 columns)            |
 * |  Crane ID        |                                             |
 * |  Date / Time     |                                             |
 * |  Instructions    |  "Not in the list?" manual entry            |
 * +------------------+---------------------------------------------+
 */
import { useState, useEffect } from 'react';
import { useTelemetryStore } from '@/stores/telemetry-store';
import { publishMessage } from '@/lib/mqtt-publish';

/** Colour palette for operator initials avatars. */
const AVATAR_COLOURS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-purple-600',
  'bg-rose-600',
] as const;

/** Demo operator list — used for quick one-tap check-in. */
const DEMO_OPERATORS = [
  { id: 'OP-001', name: 'Rajesh Kumar' },
  { id: 'OP-002', name: 'Suresh Patel' },
  { id: 'OP-003', name: 'Vikram Singh' },
  { id: 'OP-004', name: 'Arun Sharma' },
  { id: 'OP-005', name: 'Deepak Rao' },
] as const;

/**
 * Extract up to 2 initials from a full name.
 * @param name - Full operator name (e.g. "Rajesh Kumar")
 * @returns Uppercase initials string (e.g. "RK")
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * CheckInScreen component — gate screen shown before Guidance/Stats modes.
 * The operator must tap their name (or fill the manual form) to begin a shift.
 */
export function CheckInScreen() {
  const craneId = useTelemetryStore((s) => s.craneId);
  const setOperator = useTelemetryStore((s) => s.setOperator);

  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualId, setManualId] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Tick clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Perform operator check-in: update store and publish MQTT message.
   * @param operatorId - Employee ID (e.g. "OP-001")
   * @param operatorName - Full name
   */
  function handleCheckIn(operatorId: string, operatorName: string): void {
    const now = Date.now();

    setOperator({
      id: operatorId,
      name: operatorName,
      shiftStart: now,
    });

    publishMessage(`mosy/${craneId}/operator/check-in`, {
      timestamp: new Date(now).toISOString(),
      crane_id: craneId,
      operator_id: operatorId,
      operator_name: operatorName,
      action: 'check-in',
    });
  }

  /**
   * Handle manual form submission — validates inputs before check-in.
   */
  function handleManualSubmit(): void {
    const trimmedName = manualName.trim();
    const trimmedId = manualId.trim();
    if (!trimmedName || !trimmedId) return;
    handleCheckIn(trimmedId, trimmedName);
  }

  return (
    <div className="flex h-full w-full bg-[#0A0F1C]">
      {/* ── Left panel (30%) ── */}
      <div className="flex w-[30%] flex-col justify-between border-r border-slate-800 p-6">
        <div className="space-y-6">
          {/* MOSY Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-black text-white">
              M
            </div>
            <span className="text-2xl font-bold tracking-wide text-slate-100">
              MOSY
            </span>
          </div>

          {/* Crane ID */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
              Crane Unit
            </p>
            <p className="text-lg font-semibold text-slate-200 font-mono">
              {craneId}
            </p>
          </div>

          {/* Date & Time */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
              Date &amp; Time
            </p>
            <p className="text-lg font-semibold text-slate-200 font-mono">
              {currentTime.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </p>
            <p className="text-2xl font-bold text-blue-400 font-mono">
              {currentTime.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })}
            </p>
          </div>
        </div>

        {/* Instruction */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm leading-relaxed text-slate-400">
            Tap your name to start shift
          </p>
        </div>
      </div>

      {/* ── Right panel (70%) ── */}
      <div className="flex w-[70%] flex-col p-6">
        {/* Operator cards grid */}
        <div className="grid flex-1 grid-cols-2 gap-4 content-start">
          {DEMO_OPERATORS.map((op, idx) => (
            <button
              key={op.id}
              type="button"
              onClick={() => handleCheckIn(op.id, op.name)}
              className="flex h-[120px] items-center gap-4 rounded-xl border border-slate-700 bg-slate-800/60 px-5 transition-all active:scale-[0.97] active:bg-slate-700"
              aria-label={`Check in as ${op.name}`}
            >
              {/* Initials avatar */}
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${AVATAR_COLOURS[idx % AVATAR_COLOURS.length]}`}
              >
                {getInitials(op.name)}
              </div>
              {/* Name & ID */}
              <div className="text-left">
                <p className="text-base font-semibold text-slate-200">
                  {op.name}
                </p>
                <p className="text-sm text-slate-500 font-mono">{op.id}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Manual entry section */}
        <div className="mt-4 border-t border-slate-800 pt-4">
          {!showManualEntry ? (
            <button
              type="button"
              onClick={() => setShowManualEntry(true)}
              className="text-sm text-blue-400 underline underline-offset-4 active:text-blue-300"
            >
              Not in the list?
            </button>
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="manual-name"
                  className="block text-xs font-medium text-slate-500"
                >
                  Full Name
                </label>
                <input
                  id="manual-name"
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="manual-id"
                  className="block text-xs font-medium text-slate-500"
                >
                  Employee ID
                </label>
                <input
                  id="manual-id"
                  type="text"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="e.g. OP-006"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={handleManualSubmit}
                disabled={!manualName.trim() || !manualId.trim()}
                className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors active:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start Shift
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowManualEntry(false);
                  setManualName('');
                  setManualId('');
                }}
                className="rounded-lg bg-slate-800 px-4 py-3 text-sm text-slate-400 active:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
