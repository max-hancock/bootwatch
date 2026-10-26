# BootWatch — Progress Log

A running log of what was built at each step, what was installed, and why. Reference this to understand what's in the project and how the pieces fit together.

---

## Step 1.1 — Initialize Expo Project

**What we did**: Created a new React Native app using Expo's TypeScript template.

**What is Expo?** Expo is a framework on top of React Native that handles the hard parts of mobile development for you — building for iOS/Android, managing native APIs (camera, notifications, location), and deploying to app stores. Without Expo, you'd need Xcode and Android Studio set up locally, which is a nightmare. With Expo, you write TypeScript and it handles the rest.

**What is React Native?** A framework that lets you write mobile apps using JavaScript/TypeScript instead of Swift (iOS) or Kotlin (Android). Your code compiles to real native components, not a webview — so it feels like a real app because it is one.

**What got created**:

| File/Folder | What It Is |
|---|---|
| `App.tsx` | The root component — everything in the app starts here |
| `index.ts` | Entry point that registers `App.tsx` with Expo |
| `app.json` | Expo config — app name ("BootWatch"), icons, splash screen, platform settings |
| `tsconfig.json` | TypeScript configuration — strict mode enabled |
| `package.json` | Dependency manifest — lists every library the app uses |
| `assets/` | Placeholder icons and splash screen images (we'll replace these later) |
| `node_modules/` | Installed dependencies (git-ignored, never edit this) |

**Key versions**:
- Expo SDK 55
- React 19.2
- React Native 0.83
- TypeScript 5.9

---

## Step 1.2 — Install Core Dependencies

**What we did**: Installed every library the app needs for its core features. Here's what each one does and why we need it:

### Navigation
| Package | What It Does |
|---|---|
| `@react-navigation/native` | The core navigation library for React Native — handles moving between screens, managing screen history (like a browser's back button), and passing data between screens |
| `@react-navigation/bottom-tabs` | Adds the bottom tab bar (Map / Timer / Feed / Profile). This is the primary way users move around the app |
| `react-native-screens` | Native screen optimization — makes navigation transitions faster and more memory-efficient by using real native screen containers instead of JavaScript views |
| `react-native-safe-area-context` | Handles the "safe area" on modern phones (notches, rounded corners, home indicators). Without this, your UI would render behind the notch on an iPhone |

### Maps
| Package | What It Does |
|---|---|
| `react-native-maps` | Renders Google Maps (Android) or Apple Maps (iOS) in the app. We use this for the complex directory map, spotter pins, and eventually the heat map |

### Notifications & Device
| Package | What It Does |
|---|---|
| `expo-notifications` | Handles push notifications — both local (parking timer alerts) and remote (boot spotter alerts from other users). Abstracts away APNs (Apple) and FCM (Google) |
| `expo-device` | Detects device info — needed to check if we're on a physical device (push notifications don't work on simulators) |
| `expo-constants` | Provides app constants like the Expo project ID, which is needed to register for push notifications |

### Location & Camera
| Package | What It Does |
|---|---|
| `expo-location` | Accesses the phone's GPS to auto-detect which apartment complex the user is near |
| `expo-image-picker` | Lets users take or select a photo when reporting a boot truck sighting |

### Backend (Supabase)
| Package | What It Does |
|---|---|
| `@supabase/supabase-js` | The Supabase client library — talks to our database, handles auth, file uploads, and real-time subscriptions. This is our entire backend connection |
| `@react-native-async-storage/async-storage` | Persistent key-value storage on the device. Supabase uses this to store the user's auth session so they don't have to log in every time they open the app |
| `react-native-url-polyfill` | Polyfill that makes URL parsing work correctly in React Native. Required by the Supabase client |

### UI
| Package | What It Does |
|---|---|
| `@expo/vector-icons` | Icon library with thousands of icons (MaterialIcons, Ionicons, FontAwesome, etc.). Used for the tab bar icons and throughout the UI |
| `expo-status-bar` | Controls the status bar appearance (the bar at the top of the phone with time, battery, signal). Came with the template |

---

## Step 1.3 — Bottom Tab Navigation

**What we did**: Set up the app's primary navigation structure — a bottom tab bar with four tabs: Map, Timer, Feed, and Profile.

**What is React Navigation?** It's the standard navigation library for React Native. It manages which screen is visible, handles transitions, and passes data between screens. The bottom tab navigator specifically creates the tab bar you see at the bottom of apps like Instagram or Spotify.

**What got created**:

| File | What It Does |
|---|---|
| `src/navigation/TabNavigator.tsx` | Defines the four tabs, their icons (outline when inactive, filled when active), and visual styling. This is the central routing hub of the app. |

**How it works**: `App.tsx` wraps the `TabNavigator` inside a `NavigationContainer` (required by React Navigation). Each tab points to a screen component. When you tap a tab, React Navigation renders that screen and manages the transition.

---

## Step 1.4 — Placeholder Screens

**What we did**: Created four placeholder screen components — one for each tab. Each shows a centered icon, title, and subtitle describing the screen's future purpose.

**What got created**:

| File | Tab | Purpose |
|---|---|---|
| `src/screens/MapScreen.tsx` | Map | Complex directory & risk heat map |
| `src/screens/TimerScreen.tsx` | Timer | Parking countdown with push alerts |
| `src/screens/FeedScreen.tsx` | Feed | Real-time boot truck sightings |
| `src/screens/ProfileScreen.tsx` | Profile | User account & saved complexes |

These are starter versions that we replace with real functionality in later steps.

---

## Step 1.5 — Theme Constants

**What we did**: Defined the app's visual design system — colors, spacing, font sizes, font weights, and border radii — in a single shared file.

**Why a theme file?** Instead of hardcoding colors and sizes in every component, we define them once and import everywhere. This means if we want to change the primary blue or adjust spacing, we change one file and the entire app updates.

**What got created**:

| File | What It Does |
|---|---|
| `src/theme/index.ts` | Exports `colors`, `spacing`, `fontSize`, `fontWeight`, and `borderRadius` constants |

**Color system**:
- **Blue** (`primary`) — main actions, links, active tab
- **Red** (`danger`) — boot alerts, high risk
- **Yellow** (`warning`) — timer warnings, moderate risk
- **Green** (`safe`) — safe zones, low risk
- **Gray** (`neutral`) — secondary text, inactive elements

---

## Step 1.6 — Verify App Runs

**What we did**: Tested the app on web (`npx expo start --web`). The native map (`react-native-maps`) doesn't work on Expo Go yet with SDK 55, so we're testing on web during development. Installed web dependencies (`react-dom`, `react-native-web`, `@expo/metro-runtime`) to enable browser testing.

**Known issue**: Expo Go on phones doesn't support SDK 55 yet. For now we test via web browser. When ready for mobile testing, we'll either downgrade SDK or create a development build.

---

## Step 2.1 — Complex Data Model

**What we did**: Defined the TypeScript types that describe an apartment complex in our system.

**What got created**:

| File | What It Does |
|---|---|
| `src/types/complex.ts` | Exports `Complex` interface, `RiskLevel` type (`high`, `moderate`, `low`, `unknown`), and `SignageQuality` type |

**Complex fields**: `id`, `name`, `address`, `latitude`, `longitude`, `visitorTimeLimitMinutes`, `bootingCompany`, `signageQuality`, `riskLevel`, `notes`

This is the data contract — every component that displays complex info references these types, so if we add a field later, TypeScript tells us everywhere that needs updating.

---

## Step 2.2 — Seed Data

**What we did**: Created a file with 12 Rexburg apartment complexes as placeholder seed data. Each has coordinates, visitor time limits, booting company info, signage quality, risk level, and notes.

**What got created**:

| File | What It Does |
|---|---|
| `src/data/complexes.ts` | Exports the `complexes` array and `REXBURG_CENTER` map region. This is the data the map and timer screens pull from. |

**Important**: This data is placeholder. The names are real Rexburg complexes but the details (coordinates, time limits, booting companies) need to be verified with actual on-the-ground research before launch.

---

## Step 2.3–2.6 — Map Screen, Markers, Search, and Detail Sheet

**What we did**: Built the full Map tab — the first screen users see. On native devices it renders a real map with colored markers. On web it renders a scrollable card list (since `react-native-maps` doesn't support web).

**What got created**:

| File | What It Does |
|---|---|
| `src/screens/MapScreen.tsx` | Full map screen with search bar, complex list (web) or native map, and detail sheet integration |
| `src/components/NativeMap.tsx` | Wrapper around `react-native-maps` that only loads on native platforms (avoids crashing web) |
| `src/components/ComplexDetailSheet.tsx` | Bottom sheet modal showing complex details: name, risk badge, address, time limit, booting company, signage quality, notes, and a "Park Here" button |
| `src/components/RiskBadge.tsx` | Small colored pill badge (red/yellow/green) that displays the risk level |
| `src/utils/risk.ts` | Maps risk levels to their colors and labels, used by markers and badges throughout the app |

**How it works**:
1. Map screen loads → shows search bar + list of complexes (web) or map with colored markers (native)
2. User taps a complex → `ComplexDetailSheet` slides up from the bottom
3. Sheet shows all parking details for that complex
4. User taps "Park Here" → navigates to the Timer tab with that complex pre-selected

**Web vs. Native**: `react-native-maps` crashes on web even if you don't render it — just importing it breaks the bundle. We solved this by putting the map in a separate `NativeMap` component and only loading it via `require()` when `Platform.OS !== 'web'`.

---

## .env File

**We don't have one yet — and that's intentional.** The `.env` file will hold secret keys for Supabase (API URL and anon key). We create it in **Step 4** when we set up the Supabase project. It's listed in `.gitignore` so it will never be committed to GitHub.

When we get there, it will look like:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

The `EXPO_PUBLIC_` prefix is an Expo convention that makes these values accessible in your app code. The anon key is safe to include in the app — it only grants access that your Row Level Security policies allow.

---

## Step 2.7 — Interactive Web Map with Leaflet

**What we did**: Replaced the plain card list on web with a full interactive map using Leaflet + OpenStreetMap. The map is now the hero of the screen, with the complex list available via a collapsible bottom panel.

**Why Leaflet?** `react-native-maps` only works on native (iOS/Android). For web, we needed a separate map library. Leaflet is free, open-source, uses OpenStreetMap tiles (no API key), and is the most widely used web mapping library.

**What got created/changed**:

| File | What It Does |
|---|---|
| `src/components/WebMap.tsx` | Interactive Leaflet map for web. Shows colored circle markers for each complex (red/yellow/green by risk). Detects and shows user's live location as a blue dot. Markers have tooltips on hover and open the detail sheet on click. |
| `src/screens/MapScreen.tsx` | Rewritten. Map fills the screen. Search bar floats over the top with a drop shadow. Collapsible bottom panel slides up to show the complex list. Panel shows complex count and can be toggled by tapping the handle. |

**New dependency**: `leaflet` + `@types/leaflet`

**How it works**:
1. Map loads centered on Rexburg with colored circle markers for each complex
2. Browser requests location permission — if granted, a blue dot shows the user's position
3. Search bar floats over the map — typing filters both the markers and the panel list
4. Bottom panel shows "12 Complexes" collapsed — tap to expand and see the scrollable card list
5. Tapping a marker on the map OR a card in the panel opens the same detail sheet as before
6. "Park Here" from the detail sheet still navigates to the Timer tab

**Design decisions**:
- Map takes 100% of the screen — this is the visual centerpiece and future heat map foundation
- Panel is collapsible so it doesn't compete with the map for space
- Search bar has a white background + shadow so it's readable over any map tile
- Circle markers with white borders and drop shadows are visible on any terrain

---

## Step 3.1–3.9 — Parking Timer

**What we did**: Built the complete parking timer feature — the core day-one value of the app.

**What got created**:

| File | What It Does |
|---|---|
| `src/hooks/useNotifications.ts` | Notification abstraction. Handles permission requests, schedules local notifications at specific delays, cancels all scheduled notifications. Configures handler so alerts show in foreground. No-ops on web. |
| `src/hooks/useParkingTimer.ts` | Core timer hook. Uses `Date.now()` math for accuracy (not decrements). Four phases: `running` → `warning` (< 10 min) → `critical` (< 5 min) → `expired`. Resumes accurately after app backgrounds via `AppState` listener. Schedules three push notifications on start. |
| `src/screens/TimerScreen.tsx` | Full timer UI with two views: setup (complex selector + custom timer + start button) and active (large countdown + progress bar + cancel button). |

**How the timer works**:
1. Setup view: user picks a complex from a scrollable list — timer auto-fills with that complex's visitor time limit
2. Or picks "Custom Timer" and enters minutes manually
3. Taps "Start Timer" — requests notification permission if needed, schedules push alerts, starts countdown
4. Active view: 72px countdown display shifts green → yellow → red as time runs low
5. Phase labels: "You're good", "Heads up — under 10 minutes", "Move now — under 5 minutes!", "Time is up — move your car!"
6. Progress bar shrinks proportionally
7. Push notifications fire at 10 min, 5 min, and expiration — even if app is backgrounded or killed
8. "I'm Leaving" button cancels timer and all scheduled notifications
9. If notifications are denied, a yellow warning banner appears

**"Park Here" quick start**: Tapping "Park Here" on any complex detail sheet navigates to Timer with that complex pre-selected (via React Navigation route params).

**Edge cases handled**: app backgrounded (AppState listener re-syncs), app killed (scheduled notifications still fire), timer already running (selector hidden), permissions denied (warning banner shown, timer still works without alerts).

---

## Step 4.1–4.8 — Supabase Backend & Authentication

**What we did**: Set up the entire backend infrastructure using Supabase — database, authentication, row-level security, and user profiles.

**What is Supabase?** An open-source Firebase alternative that provides a Postgres database, authentication, file storage, real-time subscriptions, and edge functions — all with a generous free tier. It replaces what would normally require setting up a server, database, and auth system from scratch.

**What got created**:

| File | What It Does |
|---|---|
| `src/lib/supabase.ts` | Initializes the Supabase client with project URL and anon key from environment variables. Configures session persistence using AsyncStorage so users stay logged in. |
| `src/context/AuthContext.tsx` | React context providing global auth state (`session`, `user`, `loading`). Exposes `signUp`, `signIn`, `signOut` functions. Auto-creates profile rows for users missing them (handles accounts created before the trigger existed). |
| `src/screens/AuthScreen.tsx` | Combined sign-up/sign-in screen with email/password authentication. Handles display name input for sign-up, loading states, error messages, and email confirmation flow. |
| `src/screens/ProfileScreen.tsx` | Displays user avatar (with customizable color), display name, email, saved complexes list, and sign-out button. |
| `supabase/schema.sql` | Full database schema: `profiles`, `complexes`, `sightings` tables with RLS policies, `handle_new_user` trigger, indexes, and seed data for 12 Rexburg complexes. |
| `.env` | Environment variables for `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (git-ignored). |

**Database tables**:
- **`profiles`** — extends `auth.users` with `display_name`, `saved_complexes`, `push_token`, `avatar_color`
- **`complexes`** — apartment complex directory (seeded with 12 Rexburg locations)
- **`sightings`** — boot truck reports with `user_id`, `complex_id`, coordinates, photo URL, `report_type`, `is_anonymous`, timestamp

**Row Level Security (RLS)**: Everyone can read profiles/complexes/sightings. Only authenticated users can insert sightings. Users can only update their own profile. Users can insert their own profile row (for missing profile recovery).

**Auth flow**: Sign up → email confirmation → sign in → auto-create profile if missing → see Profile tab.

---

## Step 5.1–5.9 — Boot Spotter Feed

**What we did**: Built the community-driven boot truck sighting feed — the viral growth engine of the app.

**What got created**:

| File | What It Does |
|---|---|
| `src/types/sighting.ts` | TypeScript types for `Sighting` (including `report_type`, `is_anonymous`, `avatar_color`) and `ReportType` (`spotter` or `booted`). |
| `src/hooks/useSightings.ts` | Core sightings hook. Fetches the 50 most recent sightings from Supabase, enriches them with display names and avatar colors from `profiles`, subscribes to real-time inserts via Supabase Realtime. Respects the `is_anonymous` flag — anonymous posts get "Anonymous" name and gray color. |
| `src/utils/time.ts` | Utility functions: `timeAgo` (relative timestamps like "3 min ago") and `isWithinHours` (checks if a timestamp is within N hours, used for aging tiers). |
| `src/screens/FeedScreen.tsx` | Full feed UI with three-tier aging system, narrative-style sighting cards, privacy banner, and floating action button. |
| `src/components/ReportSightingModal.tsx` | Report modal with: report type selector (spotted vs. got booted), complex search bar, time offset picker, anonymous toggle, photo picker, and submit button. |
| `src/components/ComplexDetailSheet.tsx` | Updated with "Booter last reported X ago" banner wired to real sighting data. |
| `src/screens/MapScreen.tsx` | Updated to pass latest sighting timestamps to the detail sheet. |

**Feed three-tier aging system**:
- **0–30 minutes** → Red border, red timestamp, "ACTIVE" badge — this is happening now
- **30 min–2 hours** → Yellow border, yellow timestamp, "RECENT" badge — still relevant
- **2+ hours** → Muted gray text, no badge — stale but historically useful

**Narrative format**: Cards read like community posts — "MaxH spotted a booter at The Cove" or "MaxH got booted at The Grand" — with avatar initials colored by user's chosen color.

**Real-time**: New sightings from other users appear instantly in the feed via Supabase Realtime subscriptions. Pull-to-refresh is available as fallback.

---

## Step 5.10–5.13 — Avatar Colors, Privacy, and UX Polish

**What we did**: Added customizable avatar colors, anonymous posting, a privacy disclaimer, and complex search in the report modal.

**What got created**:

| File | What It Does |
|---|---|
| `src/utils/avatarColors.ts` | 10 curated avatar colors (blue, red, green, amber, purple, pink, cyan, orange, indigo, teal) with a default blue. |
| `src/screens/ProfileScreen.tsx` | New "Avatar Color" section with a grid of 10 colored circles. Tapping saves to Supabase instantly. Profile avatar updates in real-time. |
| `supabase/add_avatar_color.sql` | Migration: adds `avatar_color` column to `profiles`. |
| `supabase/add_report_type.sql` | Migration: adds `report_type` column to `sightings`. |
| `supabase/add_anonymous_flag.sql` | Migration: adds `is_anonymous` column to `sightings`. |
| `supabase/fix_profile_insert_policy.sql` | RLS policy allowing users to insert their own profile row. |

**Privacy features**:
- **Anonymous posting toggle** — per-report switch in the report modal. When on, the sighting shows "Anonymous" with a gray shield icon.
- **No public profiles** — no way to tap on a username and see their report history.
- **Privacy disclaimer banner** — blue banner at the top of the feed: "Your reports help the community. Anonymous posting is always available. We never share your identity with property managers or booting companies."

**Complex search in report modal**: Search bar with instant filtering above the complex list so users don't have to scroll through dozens of complexes.

---

## Status Overview

| Step | Status |
|---|---|
| 1.1 — Initialize Expo project | Complete |
| 1.2 — Install core dependencies | Complete |
| 1.3 — Bottom tab navigation | Complete |
| 1.4 — Placeholder screens | Complete |
| 1.5 — Theme constants | Complete |
| 1.6 — Verify app runs | Complete |
| 2.1 — Complex data model | Complete |
| 2.2 — Seed data | Complete |
| 2.3 — Map with markers | Complete |
| 2.4 — Complex detail sheet | Complete |
| 2.5 — Search/filter bar | Complete |
| 2.6 — Color-coded markers | Complete |
| 2.7 — Interactive web map (Leaflet) | Complete |
| 3.1 — Timer screen UI | Complete |
| 3.2 — Timer countdown logic | Complete |
| 3.3 — Complex selector auto-fill | Complete |
| 3.4 — Custom timer option | Complete |
| 3.5 — Push notification permissions | Complete |
| 3.6 — Scheduled notifications (10/5/0 min) | Complete |
| 3.7 — Park Here quick start flow | Complete |
| 3.8 — Edge case handling | Complete |
| 3.9 — Timer styling (color shifts) | Complete |
| 4.1 — Supabase project setup | Complete |
| 4.2 — Supabase client config | Complete |
| 4.3 — Database tables & schema | Complete |
| 4.4 — Row Level Security | Complete |
| 4.5 — Auth flow (sign-up/sign-in) | Complete |
| 4.6 — Profile tab | Complete |
| 4.7 — Seed data to Supabase | Complete |
| 4.8 — Auth end-to-end verification | Complete |
| 5.1 — Feed screen UI | Complete |
| 5.2 — Fetch sightings from Supabase | Complete |
| 5.3 — Report sighting flow | Complete |
| 5.4 — Photo upload to Supabase Storage | Complete |
| 5.5 — Supabase Realtime subscriptions | Complete |
| 5.6 — Pull-to-refresh | Complete |
| 5.7 — Sighting pins on map | Complete |
| 5.8 — Feed styling & aging tiers | Complete |
| 5.9 — Booter last reported banner | Complete |
| 5.10 — Customizable avatar colors | Complete |
| 5.11 — Anonymous posting | Complete |
| 5.12 — Privacy disclaimer | Complete |
| 5.13 — Complex search in report modal | Complete |
| 6.x — Spotter push notifications | Complete |
| 7.x — Heat map | Complete |
| 8A — Dark / light mode | Complete |
| 8B — Onboarding flow | Complete |
| 8C — Error handling | Complete |
| 8D — Performance pass | Complete |
| 8E — UI polish & map theming | Complete |
| 8F — Feed / Timer gradients | Complete |
| 9.1 — Complex data import pipeline | Complete |

---

## Step 8E — UI polish & map theming

**Why:** Align secondary screens and map chrome with the same typography (Outfit / DM Sans), `shadowCard` / `shadowFloat`, radii, and `AppColors` usage as Map / Feed / Timer.

**What to know:**
- **`src/theme/index.ts`** — `safe` green matches heat-map “good” green (`#16A34A`) so pins and risk colors read consistently.
- **`src/components/WebMap.tsx`** — User location dot uses theme primary/safe styling on web.
- **`src/screens/MapScreen.tsx`** — “Complexes” map-mode control uses accent (yellow) for the icon only; no heavy yellow pill behind it.
- **`src/screens/AuthScreen.tsx`**, **`OnboardingScreen.tsx`**, **`ProfileScreen.tsx`**, **`ReportSightingModal.tsx`**, **`ErrorBoundary.tsx`** — Theme-driven colors and shared elevation/radius patterns. `ErrorBoundary` uses `Appearance` for light/dark (it wraps the tree above `ThemeProvider`, so it cannot call `useTheme()`).

**Feature flags:** **`src/config/features.ts`** + **`.env` / `.env.example`** — e.g. `EXPO_PUBLIC_SHOW_MASCOT` toggles timer mascot art without code changes.

---

## Step 8F — Feed & Timer screen gradients

**Why:** Softer than a flat charcoal fill; full-screen vertical wash from background → surface → surface-muted.

**What to know:**
- **Dependency:** `expo-linear-gradient` (Expo SDK–pinned via `npx expo install expo-linear-gradient`).
- **`src/components/ScreenGradientBackdrop.tsx`** — Wraps children in `flex: 1`; gradient is `absoluteFill` behind content; uses `useTheme().colors` so light/dark both work.
- **`src/screens/FeedScreen.tsx`** — Loading, error, and main list states sit inside the backdrop; list/root views use transparent backgrounds so the gradient shows through.
- **`src/screens/TimerScreen.tsx`** — Same for setup (`ScrollView`) and active timer layouts.

---

## Step 9.1 — Complex / visitor data pipeline

**Why:** You have many complexes; hand-editing `complexes.ts` for every sign photo is slow and error-prone. One JSON source + a script keeps the app bundle and Supabase in sync.

**The flow (memorize this):**

1. **`src/data/rexburg-housing.json`** — Master list: each row needs at least `name`, `lat`, `lng`. Optional verified fields (when present, they **replace** the old rotating placeholders):
   - `visitorTimeLimitMinutes` (number or `null` if unclear)
   - `bootingCompany` (string or `null`)
   - `signageQuality` — `'well-marked' | 'moderate' | 'sneaky' | 'unknown'`
   - `riskLevel` — `'high' | 'moderate' | 'low' | 'unknown'`
   - `notes` — verbatim or summary from the sign; you can note photo filenames here for your own audit trail
2. **`node scripts/generate-complexes.mjs`** — Reads the JSON, assigns stable `id`s (slug from name, with `-2`, `-3` suffixes for duplicate names), writes:
   - **`src/data/complexes.ts`** — What the app imports (`REXBURG_CENTER`, `complexes`, `getComplexById`, timer, map, reports).
   - **`supabase/sync_complexes_from_app.sql`** — `INSERT ... ON CONFLICT (id) DO UPDATE` so Supabase `public.complexes` stays aligned with app IDs (needed for `sightings.complex_id` FK).
3. **Supabase** — Run the generated SQL in the SQL Editor when you want the server copy updated.

**Sign photos:** Not stored in the `Complex` type yet. Keep files named by complex `id` (e.g. `kensington-manor.jpg`) and reference them in `notes` until you add storage + a URL field if needed.

---

## Step 8A: Dark / Light Mode

**What was done:**
- Defined `lightColors` and `darkColors` palettes in `src/theme/index.ts`
- Created `ThemeContext` (`src/context/ThemeContext.tsx`) with `ThemeProvider`, persisting mode to AsyncStorage
- Exported `useTheme()` hook returning `{ colors, isDark, mode, setMode }`
- Refactored ~15 files to use `const { colors } = useTheme()` instead of static `import { colors }`
- Converted all `StyleSheet.create()` calls to `createStyles(colors)` pattern so styles react to theme changes
- Added `infoTint` to palette (replacing hardcoded `#EFF6FF`)
- Updated `app.json` `userInterfaceStyle` to `"automatic"`
- Added `ThemedStatusBar` component to `App.tsx` for correct status bar style per theme

## Step 8A (cont): Theme Toggle

**What was done:**
- Added an "Appearance" section to `ProfileScreen` with 3-option selector (Light / Dark / System)
- Each option shows an icon (sun, moon, phone) and highlights the active choice
- Selection persists via AsyncStorage

## Step 8B: Onboarding Flow

**What was done:**
- Created `src/screens/OnboardingScreen.tsx` with 3 horizontal swipeable slides:
  1. "Welcome to BootWatch" — app identity and tagline
  2. "How It Works" — 3 feature cards (Map, Timer, Feed)
  3. "Stronger Together" — community and anonymity
- Pagination dots and Next/Skip/Get Started buttons
- Wired into `App.tsx` with `@bootwatch_onboarded` AsyncStorage flag
- First launch shows onboarding; subsequent launches skip to auth

## Step 8C: Error Handling

**What was done:**
- Created `src/components/ErrorBoundary.tsx` — class component that catches React runtime crashes, shows recovery UI with retry button
- Wrapped the entire app in `ErrorBoundary` in `App.tsx`
- Added `error` state to `useSightings`, `useHeatData`, and `useSavedComplexes` hooks
- `FeedScreen`: full-screen error state with retry button when sightings fail to load
- `MapScreen`: red error banner ("Data unavailable — tap to retry") when sightings or heat data fail
- `ReportSightingModal`: yellow photo warning toast ("Report saved, but photo upload failed") that auto-dismisses after 5 seconds

## Step 8D: Performance Pass

**What was done:**
- Extracted `SightingCard` as a `React.memo`-wrapped component, preventing re-renders when other feed items change
- Wrapped `renderSighting` in `useCallback` for FlatList optimization
- Added 60-second TTL cache to `useHeatData` — skip re-fetch if data is less than 60 seconds old (avoids re-fetching on every map mode toggle)

**New files:**
- `src/context/ThemeContext.tsx`
- `src/screens/OnboardingScreen.tsx`
- `src/components/ErrorBoundary.tsx`

**Modified files:**
- `src/theme/index.ts` — dual palettes, `AppColors` type
- `App.tsx` — ThemeProvider, ErrorBoundary, onboarding gate, ThemedStatusBar
- `app.json` — `userInterfaceStyle: "automatic"`
- `src/navigation/TabNavigator.tsx` — `useTheme()`
- `src/utils/risk.ts` — `getRiskConfig()` function
- `src/screens/AuthScreen.tsx` — `useTheme()` + `createStyles()`
- `src/screens/FeedScreen.tsx` — `useTheme()`, `createStyles()`, error UI, memoized `SightingCard`
- `src/screens/TimerScreen.tsx` — `useTheme()` + `createStyles()`
- `src/screens/MapScreen.tsx` — `useTheme()`, `createStyles()`, error banner
- `src/screens/ProfileScreen.tsx` — `useTheme()`, `createStyles()`, theme toggle UI
- `src/components/ComplexDetailSheet.tsx` — `useTheme()` + `createStyles()`
- `src/components/ReportSightingModal.tsx` — `useTheme()`, `createStyles()`, photo warning
- `src/hooks/useSightings.ts` — error state
- `src/hooks/useHeatData.ts` — error state + TTL cache
- `src/hooks/useSavedComplexes.ts` — error state

---

*Updated as features land — recent entries: 8E (UI/map theming), 8F (gradients), 9.1 (JSON → complexes + SQL).*
