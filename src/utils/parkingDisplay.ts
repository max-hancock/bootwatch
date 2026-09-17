import type { Complex } from '../types/complex';

/** e.g. "10:00" → "10am", "00:00" → "12am", "13:30" → "1:30pm" */
export function formatTime24To12(hhmm: string): string {
  const [hs, ms] = hhmm.split(':');
  let h = parseInt(hs, 10);
  const m = parseInt(ms ?? '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const minPart = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${h12}${minPart}${suffix}`;
}

export function formatVisitorTimeRange12(start: string, end: string): string {
  return `${formatTime24To12(start)}–${formatTime24To12(end)}`;
}

/**
 * Visitor limit for compact UI (map cards, lists).
 * - Signage unknown (`visitorLimitSignageKnown === false`): `? min`
 * - Signage known, no numeric cap: `∞ min`
 * - Otherwise: minutes / hours phrase
 */
export function formatVisitorLimitMinutes(
  minutes: number | null | undefined,
  signageKnown: boolean | undefined = true,
): string {
  if (signageKnown === false) return '? min';
  if (minutes == null || minutes <= 0) return '∞ min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? '1 hour' : `${h} hours`;
  const hrPart = h === 1 ? '1 hr' : `${h} hr`;
  return `${hrPart} ${m} min`;
}

/**
 * Multi-line summary for detail sheet. Uses visitorWeekdayHours / visitorFridayHours when present.
 */
export function formatParkingHoursSummary(complex: Complex): string {
  const wd = complex.visitorWeekdayHours;
  if (!wd?.start || !wd?.end) return 'Not on file';

  const lines: string[] = [`Mon–Thu: ${formatVisitorTimeRange12(wd.start, wd.end)}`];

  if (!Object.prototype.hasOwnProperty.call(complex, 'visitorFridayHours')) {
    return lines.join('\n');
  }

  const fr = complex.visitorFridayHours;
  if (!fr) {
    lines.push('Fri: Not listed on surveyed sign');
    return lines.join('\n');
  }
  if (fr.start && fr.end) {
    lines.push(`Fri: ${formatVisitorTimeRange12(fr.start, fr.end)}`);
  }
  return lines.join('\n');
}
