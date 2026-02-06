/**
 * Demo Mode Banner — shows a yellow bar at top of page when NEXT_PUBLIC_DEMO_MODE=true.
 */

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;

  return (
    <div className="bg-amber-500 text-black text-center text-sm font-medium py-1.5 px-4">
      DEMO MODE — Simulated data for demonstration purposes
    </div>
  );
}
