import React from 'react';
import type { Booking } from '../types';

export type LiveState = 'on_the_way' | 'cleaning' | null;

/**
 * A clean is live from the moment the cleaner sets off until they finish. Only counts on the day
 * of the clean, so a job that was never closed off does not stay lit up. Same rule as the app.
 */
export function liveState(b: Pick<Booking, 'status' | 'date' | 'time' | 'enRouteAt' | 'arrivedAt'>): LiveState {
  const status = String(b.status);
  if (status === 'Completed' || status === 'Cancelled') return null;
  const [y, m, d] = String(b.date || '').slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(b.time || '00:00').split(':').map(Number);
  if (y && m && d) {
    const start = new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
    if (Math.abs(Date.now() - start) > 18 * 3600000) return null;
  }
  if (b.arrivedAt || status === 'In Progress') return 'cleaning';
  if (b.enRouteAt) return 'on_the_way';
  return null;
}

const LABEL: Record<Exclude<LiveState, null>, string> = { on_the_way: 'On the way', cleaning: 'Cleaning now' };

/** Green "On the way" / "Cleaning now" pill with a pulsing dot. Put `cin-live` on the card itself. */
export function LiveBadge({ state, className = '' }: { state: LiveState; className?: string }) {
  if (!state) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {LABEL[state]}
    </span>
  );
}
