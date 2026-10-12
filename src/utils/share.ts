import { Platform, Share } from 'react-native';
import { Sighting } from '../types/sighting';

/** BootWatch on the App Store (ascAppId in eas.json). */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6763401488';

export type ShareOutcome = 'shared' | 'copied' | 'dismissed';

/**
 * Clock time rather than "5m ago": the message gets read later in a group
 * chat, where a relative time would be wrong by then.
 */
function whenText(createdAt: string): string {
  const date = new Date(createdAt);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const ageHours = (Date.now() - date.getTime()) / 3_600_000;
  if (ageHours < 12) return `at ${time}`;
  return `on ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

/** The poster's name is deliberately left out: a share goes outside the app. */
export function sightingShareMessage(sighting: Sighting): string {
  const place = sighting.complex_name ?? 'a Rexburg complex';
  const when = whenText(sighting.created_at);
  // A boot that already happened is a warning to others, not a live sighting.
  if (sighting.report_type === 'booted') {
    return `🚨 Someone just got booted at ${place} ${when}. Don't be next. Check BootWatch before you park: ${APP_STORE_URL}`;
  }
  return `🚨 Boot truck spotted at ${place} ${when}. Check BootWatch before you park: ${APP_STORE_URL}`;
}

async function shareText(message: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') {
    // Browsers without the share sheet (most desktops) get the text on the clipboard instead.
    const nav = (globalThis as any).navigator;
    if (typeof nav?.share === 'function') {
      try {
        await nav.share({ text: message });
        return 'shared';
      } catch {
        return 'dismissed';
      }
    }
    try {
      await nav?.clipboard?.writeText(message);
      return 'copied';
    } catch {
      return 'dismissed';
    }
  }

  try {
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    return 'dismissed';
  }
}

/** Opens the system share sheet with an invitation to get the app. */
export function shareInvite(): Promise<ShareOutcome> {
  return shareText(
    `I use BootWatch to avoid getting booted in Rexburg. It shows the visitor limit at every complex and alerts you when a boot truck is spotted nearby. Get it here: ${APP_STORE_URL}`,
  );
}

/** Opens the system share sheet with a ready-to-send message about this report. */
export function shareSighting(sighting: Sighting): Promise<ShareOutcome> {
  return shareText(sightingShareMessage(sighting));
}
