# Setting Up the Sighting Notification Webhook

This edge function sends push notifications when a new sighting is inserted. Recipients include anyone who **follows** a complex **or** has an **active parking timer** at that complex **or** at any complex within **~600 m** of the reporter and/or the **selected complex’s** center (so neighbors match even if the map pin is off). Distance uses the sighting’s **latitude/longitude** when present, with fallback to the reported complex’s center.

## Step 1: Deploy the Edge Function

From the Supabase Dashboard:
1. Go to **Edge Functions** in the left sidebar
2. Click **New Function**
3. Name it `notify-sighting`
4. Paste the contents of `supabase/functions/notify-sighting/index.ts`
5. Deploy

Or via CLI (if you have Supabase CLI installed):
```bash
supabase functions deploy notify-sighting
```

## Step 2: Create the Database Webhook

1. Go to **Integrations → Database Webhooks** in the Supabase Dashboard:
   `/dashboard/project/<project-ref>/integrations/webhooks/overview`

   Webhooks used to live under **Database → Webhooks**. That sidebar entry is
   gone — old URLs still redirect, but there is nothing to click your way to
   from the Database section any more.
2. Click **Create a new webhook**
3. Configure:
   - **Name**: `on-new-sighting`
   - **Table**: `sightings`
   - **Events**: `INSERT` only
   - **Type**: Supabase Edge Function
   - **Edge Function**: Select `notify-sighting`
4. Leave **“Verify JWT” on** for `notify-sighting`. Both projects run with
   `verify_jwt = true`, and the webhook satisfies it by sending a service_role
   key in the `Authorization` header — option **B** below. Turning it off also
   works, but then dev stops behaving like production, which is the one thing a
   dev project exists to prevent.

   (Earlier revisions of this file said to turn it off. Production has always
   run with it on; the instruction was wrong, not the setting.)
5. **Webhook auth — the function must receive your key in one of these (see `getCallerCredential` in `index.ts`):**
   - **A)** `x-bootwatch-webhook-secret` = `NOTIFY_SIGHTING_WEBHOOK_SECRET` (Edge **Secrets**), or  
   - **B)** `Authorization: Bearer <service_role>` (from **Settings → API Keys**;
     there is no longer a separate Settings → API page), or  
   - **C)** `apikey: <service_role or anon key>` (same as many Supabase clients) — this is a common source of 401s if the Dashboard only set `apikey` and you weren’t reading it before.  

   The latest `notify-sighting` code accepts all of the above.

   Option **B** used to require the header string to match the key injected
   into the function as `SUPABASE_SERVICE_ROLE_KEY`. On newer projects those
   are no longer the same value: the dashboard still copies a legacy JWT, and
   the function is given an `sb_secret_...` key. A webhook configured exactly
   as production is then 401s from the function *after* platform Verify JWT
   has already accepted the token. The function now accepts a JWT whose
   payload `role` is `service_role` and whose `ref` is this project. Leave
   Verify JWT **on** — that is what makes reading the payload safe.

   **Use each project's own key.** This webhook is a trigger in the project's own
   database and the key is stored inside the trigger definition, so bootwatch-dev
   must be given bootwatch-dev's service_role key. Pasting production's key into
   dev would have dev's sightings authenticate against production — and
   `pg_dump` reproduces trigger bodies verbatim, which is why
   `scripts/clone-schema-to-dev.ps1` strips these triggers out of the baseline
   rather than copying them between projects.
6. **Save** the webhook, then add a new test sighting and check **Edge Functions → notify-sighting → Logs** for a line like `notify-sighting sighting=… parkedUserIds=… recipientTokens=…`

### Manual test (after one real sighting exists)

Replace placeholders and run in **PowerShell** (or use curl on macOS/Linux):

```powershell
$project = "YOUR_PROJECT_REF"
$serviceRole = "YOUR_SERVICE_ROLE_KEY"
$sightingId = "UUID_FROM_sightings_TABLE"
$body = "{`"type`":`"INSERT`",`"table`":`"sightings`",`"schema`":`"public`",`"record`":{`"id`":`"$sightingId`"},`"old_record`":null}"
Invoke-RestMethod -Uri "https://$project.supabase.co/functions/v1/notify-sighting" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $serviceRole" } -Body $body
```

If this returns JSON with `sent` > 0, Expo push and recipients are working; if `sent: 0`, use `check_sighting_push_setup.sql` and the log line to see whether `parkedUserIds` is 0 (timer / `complex_id` / radius) or tokens are missing.

## How It Works

1. User submits a sighting → row inserted into `sightings` table
2. The **app** also calls `supabase.functions.invoke('notify-sighting', …)` with the new row id and the reporter’s session token, so **nearby users get pushes even if the database webhook is misconfigured**. (If you also use a webhook, run `supabase/add_notify_sighting_dispatch.sql` so the second call no-ops and does not double-notify.)
3. Database webhook (if configured) can call the same function; dedup as above
4. Edge function loads the sighting row, builds the set of **nearby complex IDs** (within **~600 m** of the reporter’s location **and** within ~600 m of the **selected complex’s** map coordinates, plus the reported `complex_id` always included), then finds users who:
   - **Follow a complex in that set** (`saved_complexes` overlaps) **and** have `nearby_sighting_alerts` on in Profile, **or**
   - **Have a parking timer** (`active_timers`) for any complex in that set — _including_ after visitor time if they have not tapped “I’ve left” (see `add_active_timers_over_limit.sql`). No profile toggle is required for timer-based alerts.
   - Have a row in `push_tokens` for Expo push
   - Are NOT the person who reported (no self-notifications)
5. Sends push notifications via Expo's push API
6. User's phone shows e.g. "Booter spotted near The Cove!" with body text mentioning **nearby / within a few blocks**

## Notification Content

- **Spotter report**: "Booter spotted near {complex}!" / body references **within a few blocks**
- **Booted report**: "Someone got booted near {complex}!" / body warns if parked **nearby**
