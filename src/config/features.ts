/** Feature flags (Expo inlines `EXPO_PUBLIC_*` at bundle time). */

/** On only in dev bundles, so a testing aid can never turn on in a release build. */
const devFlag = (raw: string | undefined) =>
  typeof __DEV__ !== 'undefined' && __DEV__ && ['1', 'true', 'yes', 'on'].includes(raw?.trim().toLowerCase() ?? '');

/**
 * Testing aid: `EXPO_PUBLIC_FORCE_REPORT_PROMPT=1` shows the "Seen a booter
 * recently?" prompt on every launch, ignoring its cooldown.
 */
export const forceReportPrompt = devFlag(process.env.EXPO_PUBLIC_FORCE_REPORT_PROMPT);

/**
 * Testing aid: `EXPO_PUBLIC_FORCE_INVITE_PROMPT=1` shows the "Enjoying
 * BootWatch? Spread the word" popup on every launch, ignoring its schedule.
 */
export const forceInvitePrompt = devFlag(process.env.EXPO_PUBLIC_FORCE_INVITE_PROMPT);
