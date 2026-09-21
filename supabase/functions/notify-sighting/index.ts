// Supabase Edge Function: notify-sighting
// Triggered by: (1) Database Webhook on INSERT into sightings, or (2) app calling
// supabase.functions.invoke('notify-sighting', …) with the reporter's access token.
// Auth: service role JWT for this project / anon / NOTIFY_SIGHTING_WEBHOOK_SECRET
//   (see getCallerCredential), OR a valid user JWT for the same user as
//   sighting.user_id (reporter only). The service_role JWT is accepted by
//   payload (role + ref), not only by exact match against the injected
//   SUPABASE_SERVICE_ROLE_KEY - newer projects inject sb_secret_... there.
//   That path assumes Edge Function "Verify JWT" stays ON.
// Optional table public.notify_sighting_dispatch dedupes webhook + app (run add script in repo).
// Dashboard: JWT verification can be ON (user invoke) or OFF (webhook-only) — with OFF, both work.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * ~2–3 short city blocks. Also see a second pass below: complexes near the *reported* complex
 * center (not only the reporter GPS pin) so adjacent properties still match when the pin is off.
 */
const NEARBY_RADIUS_METERS = 600;

interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    user_id: string | null;
    complex_id: string;
    report_type?: string;
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i]! ^ bb[i]!;
  return diff === 0;
}

/** What the caller sent: custom header, Bearer, or `apikey` (many Supabase clients & webhooks use this). */
function getCallerCredential(req: Request): string {
  const a =
    req.headers.get("x-bootwatch-webhook-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim() ||
    req.headers.get("apikey")?.trim() ||
    "";
  return a;
}

function projectRefFromSupabaseUrl(): string {
  const raw = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  try {
    return new URL(raw).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

/** Decode a JWT payload without verifying the signature. Safe only because
 *  Edge Function "Verify JWT" already rejected tokens this project did not
 *  sign. Do not turn Verify JWT off without replacing this with a signature
 *  check. */
function jwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(b64 + pad);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isThisProjectsServiceRoleJwt(cred: string): boolean {
  const payload = jwtPayload(cred);
  if (!payload) return false;
  const expected = projectRefFromSupabaseUrl();
  return payload.role === "service_role" &&
    typeof payload.ref === "string" &&
    expected.length > 0 &&
    payload.ref === expected;
}

function verifyStaticCredentials(cred: string): boolean {
  const notify = Deno.env.get("NOTIFY_SIGHTING_WEBHOOK_SECRET")?.trim() ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
  if (notify.length >= 16 && timingSafeEqual(cred, notify)) return true;
  if (serviceRole && timingSafeEqual(cred, serviceRole)) return true;
  if (notify.length > 0 && notify.length < 16 && timingSafeEqual(cred, notify)) return true;
  if (anon && timingSafeEqual(cred, anon)) return true;
  // Newer Supabase projects inject sb_secret_... as SUPABASE_SERVICE_ROLE_KEY
  // while the dashboard still copies the legacy JWT into webhook headers.
  // Exact string match then 401s a perfectly valid service_role JWT. Accept
  // one whose ref claim is this project; Verify JWT already checked the signature.
  if (isThisProjectsServiceRoleJwt(cred)) return true;
  return false;
}

/** Validates a Supabase user access_token (reporter app invoke). */
async function getUserIdFromAccessToken(jwt: string): Promise<string | null> {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
  if (!base || !anon) return null;
  const res = await fetch(`${base}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: anon },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { id?: string };
  return typeof j.id === "string" ? j.id : null;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function tokensForUsers(supabase: any, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const { data, error } = await supabase
    .from("push_tokens")
    .select("user_id, token")
    .in("user_id", userIds);
  if (error) {
    console.error("[notify-sighting] push_tokens query", error.message);
    return out;
  }
  for (const row of (data ?? []) as { user_id: string; token: string }[]) {
    if (row.user_id && row.token) out.set(row.user_id, row.token);
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const cred = getCallerCredential(req);
    if (!cred) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          detail:
            "Add x-bootwatch-webhook-secret, Authorization: Bearer, or apikey (see docs). " +
            "Or call from the app while signed in (reporter’s access token).",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    let reporterUserId: string | null = null;
    if (!verifyStaticCredentials(cred)) {
      reporterUserId = await getUserIdFromAccessToken(cred);
      if (!reporterUserId) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            detail:
              "Invalid credential. For webhooks use service role or secret headers. " +
              "For app, sign in; invoke sends your session access token automatically.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Request body is not valid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const payload = body as WebhookPayload & { record?: { id: string } };
    const record = payload?.record;
    if (!record?.id) {
      return new Response(
        JSON.stringify({
          error: "Invalid webhook payload: expected { record: { id: '...' } } (see Supabase database webhooks docs).",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sighting, error: sightingErr } = await supabase
      .from("sightings")
      .select("id, user_id, complex_id, latitude, longitude, report_type")
      .eq("id", record.id)
      .single();

    if (sightingErr || !sighting) {
      return new Response(
        JSON.stringify({ error: "Sighting not found", detail: sightingErr?.message }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (reporterUserId !== null) {
      if (sighting.user_id !== reporterUserId) {
        return new Response(
          JSON.stringify({
            error: "Forbidden",
            detail: "User JWT must match the sighting reporter (sighting.user_id).",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Dedup when both DB webhook and app invoke run (second request no-ops if table exists).
    const { error: dedupErr } = await supabase.from("notify_sighting_dispatch").insert({
      sighting_id: sighting.id,
    });
    if (dedupErr) {
      const d = dedupErr.message ?? "";
      if (dedupErr.code === "23505" || /duplicate|unique/i.test(d)) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "already_dispatched" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (!/relation|does not exist|notify_sighting_dispatch/i.test(d)) {
        console.warn("[notify-sighting] notify_sighting_dispatch insert:", d);
      }
    }

    const { data: reportedComplex } = await supabase
      .from("complexes")
      .select("id, name, latitude, longitude")
      .eq("id", sighting.complex_id)
      .single();

    const complexName = reportedComplex?.name ?? "an apartment complex";

    // Prefer reporter coordinates (where they saw the truck); fall back to complex center.
    let anchorLat = sighting.latitude;
    let anchorLng = sighting.longitude;
    if (
      anchorLat == null ||
      anchorLng == null ||
      Number.isNaN(anchorLat) ||
      Number.isNaN(anchorLng)
    ) {
      anchorLat = reportedComplex?.latitude ?? 0;
      anchorLng = reportedComplex?.longitude ?? 0;
    }

    const { data: allComplexes, error: complexesErr } = await supabase
      .from("complexes")
      .select("id, latitude, longitude");

    if (complexesErr || !allComplexes?.length) {
      return new Response(
        JSON.stringify({ error: "Could not load complexes", detail: complexesErr?.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const nearIds = new Set<string>();
    nearIds.add(sighting.complex_id);

    // Vicinity (A): complexes within radius of the reporter’s pin (or complex center fallback).
    for (const c of allComplexes) {
      if (c.latitude == null || c.longitude == null) continue;
      if (haversineMeters(anchorLat, anchorLng, c.latitude, c.longitude) <= NEARBY_RADIUS_METERS) {
        nearIds.add(c.id);
      }
    }

    // Vicinity (B): complexes near the *selected* complex’s DB coordinates (neighbors on the map),
    // so timers at an adjacent complex still match if GPS was dropped far from the center.
    const rLat = reportedComplex?.latitude;
    const rLng = reportedComplex?.longitude;
    if (rLat != null && rLng != null && !Number.isNaN(rLat) && !Number.isNaN(rLng)) {
      for (const c of allComplexes) {
        if (c.latitude == null || c.longitude == null) continue;
        if (haversineMeters(rLat, rLng, c.latitude, c.longitude) <= NEARBY_RADIUS_METERS) {
          nearIds.add(c.id);
        }
      }
    }

    const nearIdList = [...nearIds];

    const { data: followerProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("nearby_sighting_alerts", true)
      .overlaps("saved_complexes", nearIdList);

    const followerIds = (followerProfiles ?? []).map((r) => r.id);
    const followerTokens = await tokensForUsers(supabase, followerIds);

    // Countdown active (expires_at in future) OR over visitor time (over_limit) until they tap
    // "I've left" in the app (row deleted). Two queries to avoid .or() issues with ISO strings.
    const nowIso = new Date().toISOString();
    const { data: parkedWhileCounting, error: errCounting } = await supabase
      .from("active_timers")
      .select("user_id")
      .in("complex_id", nearIdList)
      .gt("expires_at", nowIso);
    if (errCounting) {
      console.error("[notify-sighting] active_timers expires query", errCounting.message);
    }
    const { data: parkedOverLimit, error: errOverLimit } = await supabase
      .from("active_timers")
      .select("user_id")
      .in("complex_id", nearIdList)
      .eq("over_limit", true);
    if (errOverLimit) {
      console.error(
        "[notify-sighting] active_timers over_limit query (add supabase/add_active_timers_over_limit.sql if missing column?)",
        errOverLimit.message,
      );
    }
    const parkedRows = [
      ...((parkedWhileCounting ?? []) as { user_id: string }[]),
      ...((!errOverLimit ? parkedOverLimit : []) ?? []) as { user_id: string }[],
    ];
    const parkedTimers = Array.from(
      new Map(parkedRows.map((r) => [r.user_id, r] as [string, { user_id: string }])).values(),
    );

    const parkedUserIds = [...new Set((parkedTimers ?? []).map((t) => t.user_id))];
    // Parked = explicit “I’m at this complex” (timer). Do not require profile.nearby_sighting_alerts
    // (users often disable “nearby” but still expect alerts while the timer is running).
    const parkedTokenMap = await tokensForUsers(supabase, parkedUserIds);

    const allRecipients = new Map<string, string>();
    for (const [id, tok] of followerTokens) allRecipients.set(id, tok);
    for (const [id, tok] of parkedTokenMap) allRecipients.set(id, tok);

    if (sighting.user_id) allRecipients.delete(sighting.user_id);

    const tokens = [...allRecipients.values()];

    console.log(
      `[notify-sighting] sighting=${record.id} nearComplexes=${nearIdList.length} ` +
        `followerCandidates=${followerIds.length} parkedUserIds=${parkedUserIds.length} ` +
        `recipientTokens=${tokens.length}`,
    );

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({
          sent: 0,
          reason: "no push_tokens for matched users, or no active_timers in nearComplexes, or you are the reporter",
          nearComplexIds: nearIdList,
          nearComplexCount: nearIdList.length,
          parkedUserIdsCount: parkedUserIds.length,
          followerIdsCount: followerIds.length,
          radiusMeters: NEARBY_RADIUS_METERS,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const reportType = sighting.report_type ?? "spotter";
    const title =
      reportType === "booted"
        ? `Someone got booted near ${complexName}!`
        : `Booter spotted near ${complexName}!`;

    const notificationBody =
      reportType === "booted"
        ? "A community member reported getting booted within a few blocks. Be careful if you're parked nearby."
        : "A boot truck was reported nearby (within a few blocks). Check the feed for details.";

    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title,
      body: notificationBody,
      data: { screen: "Feed", sightingId: sighting.id },
    }));

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "identity",
      },
      body: JSON.stringify(messages),
    });

    const pushResult = (await pushResponse.json()) as {
      data?: unknown;
      errors?: unknown;
    };

    if (!pushResponse.ok) {
      console.error("[notify-sighting] Expo HTTP error", pushResponse.status, pushResult);
    }
    // Expo can return 200 with per-message errors in data[]
    const tickets = Array.isArray(pushResult.data)
      ? pushResult.data
      : pushResult.data
        ? [pushResult.data]
        : [];
    for (const t of tickets) {
      if (t && typeof t === "object" && (t as { status?: string }).status === "error") {
        console.error("[notify-sighting] Expo push ticket", JSON.stringify(t));
      }
    }
    if (pushResult.errors) {
      console.error("[notify-sighting] Expo top-level errors", JSON.stringify(pushResult.errors));
    }

    return new Response(
      JSON.stringify({
        sent: tokens.length,
        nearbyComplexCount: nearIdList.length,
        radiusMeters: NEARBY_RADIUS_METERS,
        expoHttpStatus: pushResponse.status,
        expo: pushResult,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
