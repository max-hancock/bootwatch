// Supabase Edge Function: notify-reaction
//
// Called by the app right after a user reacts to a sighting. Sends a push to
// the person who posted that sighting.
//
// Rules:
//  - One notification per reactor per sighting, ever. A second reaction from the
//    same person (or removing and re-adding one) sends nothing. Enforced by the
//    public.reaction_notifications table (see
//    supabase/2026-10-08_reaction_notifications.sql).
//  - The first INDIVIDUAL_LIMIT reactors on a sighting each get their own
//    notification ("User231 thanked you"). After that, notifications are grouped
//    ("User231 and 5 others reacted to your report") and only sent when the
//    total reaches one of GROUPED_MILESTONES, so a popular report does not buzz
//    its poster for every single reaction.
//  - Never notifies someone about their own reaction, and respects the poster's
//    profiles.reaction_alerts switch.
//
// Auth: the reactor's own access token. The function checks that this user
// really has a reaction on the sighting, so it cannot be used to send arbitrary
// pushes. Dashboard: leave "Verify JWT" ENABLED.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Reactors 1..N on a sighting are announced one by one. */
const INDIVIDUAL_LIMIT = 3;
/** After that, a grouped notification goes out only at these totals. */
const GROUPED_MILESTONES = [5, 10, 25, 50, 100, 250, 500, 1000];

/** Keep in step with src/utils/reactions.ts. */
const EMOJI: Record<string, string> = {
  thanks: "🙏",
  seen: "👀",
  goat: "🐐",
  cry: "😭",
  laugh: "😂",
  fire: "🔥",
  skull: "💀",
  salute: "🫡",
  clap: "👏",
  heart: "❤️",
  rage: "😤",
  siren: "🚨",
  crown: "👑",
  hundred: "💯",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing Authorization header" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);
    const reactorId = userData.user.id;

    let body: { sighting_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Request body is not valid JSON" }, 400);
    }
    const sightingId = typeof body.sighting_id === "string" ? body.sighting_id : "";
    if (!sightingId) return json({ error: "Expected { sighting_id: '...' }" }, 400);

    // The caller must actually have a reaction on this sighting.
    const { data: reactions, error: reactionsErr } = await admin
      .from("sighting_reactions")
      .select("kind, created_at")
      .eq("sighting_id", sightingId)
      .eq("user_id", reactorId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (reactionsErr) return json({ error: "Could not read reactions", detail: reactionsErr.message }, 500);
    const latest = reactions?.[0];
    if (!latest) return json({ sent: 0, reason: "no_reaction_from_caller" });

    const { data: authorRow } = await admin
      .from("sighting_authors")
      .select("user_id")
      .eq("sighting_id", sightingId)
      .maybeSingle();
    const authorId: string | null = authorRow?.user_id ?? null;
    if (!authorId) return json({ sent: 0, reason: "no_author" });
    if (authorId === reactorId) return json({ sent: 0, reason: "own_sighting" });

    // Dedup: first reaction from this person on this sighting wins; later ones stop here.
    const { error: dedupErr } = await admin
      .from("reaction_notifications")
      .insert({ sighting_id: sightingId, reactor_id: reactorId });
    if (dedupErr) {
      if (dedupErr.code === "23505" || /duplicate|unique/i.test(dedupErr.message ?? "")) {
        return json({ sent: 0, reason: "already_notified_for_this_reactor" });
      }
      // Without the dedup table we cannot guarantee "once per person", so send nothing.
      return json({ error: "Could not record notification", detail: dedupErr.message }, 500);
    }

    const { count: reactorCount } = await admin
      .from("reaction_notifications")
      .select("reactor_id", { count: "exact", head: true })
      .eq("sighting_id", sightingId);
    const total = reactorCount ?? 1;

    const grouped = total > INDIVIDUAL_LIMIT;
    if (grouped && !GROUPED_MILESTONES.includes(total)) {
      return json({ sent: 0, reason: "between_milestones", reactors: total });
    }

    const { data: authorProfile } = await admin
      .from("profiles")
      .select("reaction_alerts")
      .eq("id", authorId)
      .maybeSingle();
    if (authorProfile?.reaction_alerts === false) {
      return json({ sent: 0, reason: "author_opted_out" });
    }

    const { data: tokenRow } = await admin
      .from("push_tokens")
      .select("token")
      .eq("user_id", authorId)
      .maybeSingle();
    if (!tokenRow?.token) return json({ sent: 0, reason: "author_has_no_push_token" });

    const [{ data: reactorProfile }, { data: sighting }] = await Promise.all([
      admin.from("profiles").select("display_name").eq("id", reactorId).maybeSingle(),
      admin.from("sightings").select("complex_id").eq("id", sightingId).maybeSingle(),
    ]);
    const name = reactorProfile?.display_name?.trim() || "Someone";

    let place = "";
    if (sighting?.complex_id) {
      const { data: complex } = await admin
        .from("complexes")
        .select("name")
        .eq("id", sighting.complex_id)
        .maybeSingle();
      if (complex?.name) place = ` at ${complex.name}`;
    }

    let title: string;
    let message: string;
    if (grouped) {
      const others = total - 1;
      title = `${name} and ${others} others reacted to your report`;
      message = `Your report${place} is getting noticed.`;
    } else if (latest.kind === "thanks") {
      title = `🙏 ${name} thanked you`;
      message = `For your report${place}.`;
    } else if (latest.kind === "seen") {
      title = `👀 ${name} saw it too`;
      message = `They confirmed your report${place}.`;
    } else {
      title = `${EMOJI[latest.kind] ?? "👍"} ${name} reacted to your report`;
      message = `Your report${place}.`;
    }

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "identity",
      },
      body: JSON.stringify([
        {
          to: tokenRow.token,
          sound: "default",
          title,
          body: message,
          data: { screen: "Feed", sightingId },
        },
      ]),
    });
    const pushResult = await pushResponse.json().catch(() => null);
    if (!pushResponse.ok) {
      console.error("[notify-reaction] Expo HTTP error", pushResponse.status, pushResult);
    }

    return json({ sent: 1, grouped, reactors: total, expoHttpStatus: pushResponse.status });
  } catch (error) {
    console.error("[notify-reaction] unexpected:", error);
    return json({ error: String(error) }, 500);
  }
});
