# Feature flags

## Timer mascot (`EXPO_PUBLIC_SHOW_MASCOT`)

Controls the raccoon illustration on the **active parking timer** screen.

| Situation | Mascot |
|-----------|--------|
| Local `npx expo start` and variable **not set** | **Shown** (`__DEV__` default) |
| Production / EAS release build and variable **not set** | **Hidden** |
| `EXPO_PUBLIC_SHOW_MASCOT=1` or `true` | **Always shown** |
| `EXPO_PUBLIC_SHOW_MASCOT=0` or `false` | **Always hidden** (even locally) |

### How to set it

Add to your **`.env`** in the project root (same file as Supabase keys). Restart Expo after changing.

```env
# Show mascot everywhere (e.g. TestFlight internal build)
EXPO_PUBLIC_SHOW_MASCOT=1

# Or hide everywhere (e.g. while designing a store build locally)
EXPO_PUBLIC_SHOW_MASCOT=0
```

Omit the line entirely for: **mascot in dev only**, **no mascot in store builds**.

### How it works (short)

Expo reads `EXPO_PUBLIC_*` variables when the JS bundle is built and replaces `process.env.EXPO_PUBLIC_SHOW_MASCOT` with the actual string. The app code in `src/config/features.ts` turns that into `true` / `false`. No remote server — it’s compile-time, per build.

### EAS Build

In **EAS** → project → **Environment variables**, set `EXPO_PUBLIC_SHOW_MASCOT` per profile (`development` vs `production`) so internal builds can have the mascot and App Store builds can omit it.

## Report prompt override (`EXPO_PUBLIC_FORCE_REPORT_PROMPT`)

Testing aid for the "Seen a booter recently?" popup. Normally it appears at most once every 3 days (and not on a new user's first open). With `EXPO_PUBLIC_FORCE_REPORT_PROMPT=1` in `.env` it appears on **every launch** of a local dev bundle.

It is ignored outside `__DEV__`, so it cannot turn on in a preview, TestFlight, or App Store build. Restart Expo after changing it.
