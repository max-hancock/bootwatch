# Agent / Contributor Notes for Bootwatch

This file gives AI assistants and human contributors guardrails when working in
this repo. Read it before making changes that touch production.

## Production reality check

- The iOS app is **live on the App Store** (launched 2026-05-01).
- The repo's `main` branch reflects what's shipped. `dev` is the integration
  branch where features land before being promoted to `main`.
- The production Supabase project backs the live app. Changes to its schema,
  data, RLS policies, edge functions, storage, or auth settings affect real
  users **immediately**, regardless of which app binary is installed.
- The production EAS Update channel (`production`) can push JS/asset changes to
  every installed copy of the app on next open. Only publish to it intentionally.

## Destructive / one-shot scripts — `supabase/_archive/`

Any file under `supabase/_archive/` has **already been executed against
production** and is kept for historical record only. These files:

- Are **NOT** migrations.
- Are **NOT** pending work.
- Must **NEVER** be re-run, modified to be re-runnable, or referenced in new
  migrations.
- Contain hard `raise exception` guards so they abort if executed, but treat
  the guard as a last line of defense — do not rely on it.

If you (human or AI) believe a destructive operation needs to happen again,
write a **new** migration in `supabase/` with an intentional, dated filename
and a comment explaining why. Do not resurrect archived scripts.

## Supabase migrations — general rules

- Files directly in `supabase/` (not `_archive/`) are real migrations meant to
  be runnable against the production project.
- Write migrations to be **idempotent** when possible (`create ... if not
  exists`, `alter table ... add column if not exists`, etc.).
- Never include `delete from <table>;` or `drop table` / `drop column` in a
  migration without an explicit comment block at the top explaining the data
  loss and confirming intent.
- Assume any SQL file you write may be opened in the Supabase SQL Editor by a
  tired human at 1am. Make the consequences of running it impossible to miss.

## Native binary vs OTA — what's safe to change

- Editing `.ts` / `.tsx` files in `src/` does **not** affect live users until
  someone runs `eas update --channel production` (or submits a new build).
- Editing `app.json`, adding native dependencies in `package.json`, or
  changing anything that affects the native shell requires a **new App Store
  submission** — it cannot be hot-fixed via EAS Update.
- The `production` channel is for shipped users. Use the `preview` channel for
  internal testing builds.

## Branching

- `main` — exactly what's in the App Store. Tagged at each release (`v1.0.0`,
  `v1.1.0`, ...).
- `dev` — integration branch. Feature branches merge here first.
- `feat/*`, `fix/*`, `chore/*`, `refactor/*` — short-lived branches off `dev`.

Do not commit directly to `main`. Promote `dev` → `main` only when cutting a
release.

## Before cutting a release

- **App Store Connect URLs.** The GitHub account was renamed from
  `MaximusHancockimus` to `max-hancock` (2026-09-16). The privacy policy and
  support URLs in App Store Connect point at the public repo so users can read
  `PRIVACY.md`. If either still uses the old username it is only working via
  GitHub's rename redirect, which stops the moment anyone registers that
  username and creates a repo called `bootwatch`. Confirm both point at
  `github.com/max-hancock/bootwatch` before submitting. Remove this item once
  verified.
- **"People alerted" count vs the sightings database webhook.** The
  post-report celebration (`src/components/ReportCelebration.tsx`) shows "N
  people nearby were just alerted" using the `sent` value returned when the app
  invokes `notify-sighting`. If the production database webhook on `sightings`
  is enabled (see `supabase/setup_sighting_webhook.md`), it can dispatch first;
  the app's call is then deduped and returns `{ skipped: true }` with no count,
  so the line silently never appears. Before shipping the celebration, check
  whether that webhook is on in production. If it is, change `notify-sighting`
  to store the recipient count in `notify_sighting_dispatch` and return it on
  the skipped path too. Remove this item once resolved.
- **Onboarding is out of date.** `src/screens/OnboardingScreen.tsx` still
  describes the app as three tools (map, timer, feed). Before shipping, update
  its slides to cover what has been added since: the Ranks tab (points, monthly
  and all-time leaderboards, profile cards), reactions on reports (Thanks, Saw
  it too, emoji), and any later community features (e.g. thanks notifications,
  sharing, comments) that are in the release. Existing users never see
  onboarding again, so consider a one-time "What's new" screen for them too.
  Remove this item once the slides match the shipped feature set.
