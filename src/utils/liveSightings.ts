import { Sighting } from '../types/sighting';

/** How long a report counts as "live" on the map. */
export const LIVE_WINDOW_MINUTES = 60;

/** The most recent report at one complex within the live window. */
export interface LiveMarker {
  minutesAgo: number;
  /** The newest report was "I got booted", rather than a truck sighting. */
  booted: boolean;
}

export const LIVE_RED = '#DC2626';

/**
 * Newest report per complex from the last LIVE_WINDOW_MINUTES, keyed by complex id.
 * `sightings` is the feed list (newest first).
 */
export function getLiveMarkers(sightings: Sighting[], now: number): Map<string, LiveMarker> {
  const out = new Map<string, LiveMarker>();
  for (const s of sightings) {
    if (out.has(s.complex_id)) continue;
    const minutesAgo = Math.floor((now - new Date(s.created_at).getTime()) / 60000);
    // Reports dated slightly in the future (clock skew) count as "now".
    if (minutesAgo >= LIVE_WINDOW_MINUTES) continue;
    out.set(s.complex_id, {
      minutesAgo: Math.max(0, minutesAgo),
      booted: s.report_type === 'booted',
    });
  }
  return out;
}
