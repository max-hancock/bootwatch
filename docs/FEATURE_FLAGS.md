# Feature flags

## Report prompt override (`EXPO_PUBLIC_FORCE_REPORT_PROMPT`)

Testing aid for the "Seen a booter recently?" popup. Normally it appears at most once every 3 days (and not on a new user's first open). With `EXPO_PUBLIC_FORCE_REPORT_PROMPT=1` in `.env` it appears on **every launch** of a local dev bundle.

It is ignored outside `__DEV__`, so it cannot turn on in a preview, TestFlight, or App Store build. Restart Expo after changing it.

## Invite prompt override (`EXPO_PUBLIC_FORCE_INVITE_PROMPT`)

Testing aid for the "Enjoying BootWatch? Spread the word" popup. Normally it waits until a user has had the app for a week, then appears at most every two weeks (every 60 days after they share), and never on the same open as the report popup. With `EXPO_PUBLIC_FORCE_INVITE_PROMPT=1` in `.env` it appears on **every launch** of a local dev bundle.

Ignored outside `__DEV__`. Restart Expo after changing it. Turn the report override off while using this one, or both popups show at once.

### How flags work

Expo reads `EXPO_PUBLIC_*` variables from `.env` when the JS bundle is built and inlines them. The app code in `src/config/features.ts` turns them into booleans. No remote server: it is compile-time, per build.
