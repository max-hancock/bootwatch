# Feature flags

## Report prompt override (`EXPO_PUBLIC_FORCE_REPORT_PROMPT`)

Testing aid for the "Seen a booter recently?" popup. Normally it appears at most once every 3 days (and not on a new user's first open). With `EXPO_PUBLIC_FORCE_REPORT_PROMPT=1` in `.env` it appears on **every launch** of a local dev bundle.

It is ignored outside `__DEV__`, so it cannot turn on in a preview, TestFlight, or App Store build. Restart Expo after changing it.

### How flags work

Expo reads `EXPO_PUBLIC_*` variables from `.env` when the JS bundle is built and inlines them. The app code in `src/config/features.ts` turns them into booleans. No remote server: it is compile-time, per build.
