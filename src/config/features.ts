/** Feature flags (Expo inlines `EXPO_PUBLIC_*` at bundle time). */

/**
 * Testing aid: `EXPO_PUBLIC_FORCE_REPORT_PROMPT=1` shows the "Seen a booter
 * recently?" prompt on every launch, ignoring its cooldown. Dev bundles only —
 * it can never turn on in a release build.
 */
export const forceReportPrompt =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  ['1', 'true', 'yes', 'on'].includes(
    process.env.EXPO_PUBLIC_FORCE_REPORT_PROMPT?.trim().toLowerCase() ?? '',
  );
