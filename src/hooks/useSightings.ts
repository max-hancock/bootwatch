import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ReactionKind, Sighting } from '../types/sighting';
import { complexes } from '../data/complexes';
import { DEFAULT_AVATAR_COLOR } from '../utils/avatarColors';
import { EXTRA_REACTIONS } from '../utils/reactions';

const complexMap = new Map(complexes.map((c) => [c.id, c.name]));

interface ProfileInfo { display_name: string; avatar_color: string; avatar_url: string | null }

async function fetchProfiles(userIds: string[]): Promise<Map<string, ProfileInfo>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_color, avatar_url')
    .in('id', unique);

  const map = new Map<string, ProfileInfo>();
  data?.forEach((p) => {
    map.set(p.id, {
      display_name: p.display_name ?? 'Anonymous',
      avatar_color: p.avatar_color ?? DEFAULT_AVATAR_COLOR,
      avatar_url: p.avatar_url ?? null,
    });
  });
  return map;
}

/**
 * Which of these sightings the signed-in user posted. Anonymous posts have no
 * user_id on the public row; ownership lives in sighting_authors, where RLS
 * only ever returns the caller's own rows.
 */
async function fetchOwnSightingIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('sighting_authors')
    .select('sighting_id')
    .in('sighting_id', ids);
  // Table missing (migration not run on this project yet) — callers fall back to user_id.
  if (error || !data) return [];
  return data.map((r) => r.sighting_id as string);
}

const reactionKey = (sightingId: string, kind: ReactionKind) => `${sightingId}:${kind}`;

/** The signed-in user's own reactions on these sightings (RLS returns no one else's). */
async function fetchMyReactionKeys(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('sighting_reactions')
    .select('sighting_id, kind')
    .in('sighting_id', ids);
  if (error || !data) return [];
  return data.map((r) => reactionKey(r.sighting_id as string, r.kind as ReactionKind));
}

function enrichSighting(row: any, profileMap: Map<string, ProfileInfo>): Sighting {
  const anonymous = row.is_anonymous ?? false;
  const profile = (!anonymous && row.user_id) ? profileMap.get(row.user_id) : undefined;
  return {
    ...row,
    is_anonymous: anonymous,
    complex_name: complexMap.get(row.complex_id) ?? 'Unknown',
    display_name: anonymous ? 'Anonymous' : (profile?.display_name ?? 'Anonymous'),
    avatar_color: anonymous ? '#6B7280' : (profile?.avatar_color ?? DEFAULT_AVATAR_COLOR),
    avatar_url: anonymous ? null : (profile?.avatar_url ?? null),
  };
}

export function useSightings() {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownIds, setOwnIds] = useState<Set<string>>(new Set());
  const [myReactions, setMyReactions] = useState<Set<string>>(new Set());

  const fetchSightings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('sightings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (dbError) throw dbError;

      if (data) {
        const ids = data.map((r) => r.id);
        const [profileMap, own, reacted] = await Promise.all([
          fetchProfiles(data.map((r) => r.user_id)),
          fetchOwnSightingIds(ids),
          fetchMyReactionKeys(ids),
        ]);
        setSightings(data.map((row) => enrichSighting(row, profileMap)));
        setOwnIds(new Set(own));
        setMyReactions(new Set(reacted));
      }
    } catch (e) {
      console.error('[useSightings] fetch failed:', e);
      const message = e instanceof Error ? e.message : JSON.stringify(e);
      setError(message || 'Failed to load sightings');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSightings();

    const channel = supabase
      .channel('sightings-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sightings' }, async (payload) => {
        const [profileMap, own] = await Promise.all([
          fetchProfiles([payload.new.user_id]),
          fetchOwnSightingIds([payload.new.id]),
        ]);
        const newSighting = enrichSighting(payload.new, profileMap);
        setSightings((prev) => [newSighting, ...prev]);
        if (own.length > 0) setOwnIds((prev) => new Set([...prev, ...own]));
      })
      // Reaction counters live on the sighting row, so other people's reactions arrive as UPDATEs.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sightings' }, (payload) => {
        const next = payload.new as Pick<Sighting, 'id' | 'thanks_count' | 'seen_count' | 'emoji_counts'>;
        if (!next.id) return;
        setSightings((prev) =>
          prev.map((s) =>
            s.id === next.id
              ? { ...s, thanks_count: next.thanks_count, seen_count: next.seen_count, emoji_counts: next.emoji_counts }
              : s,
          ),
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sightings' }, (payload) => {
        const deletedId = (payload.old as { id?: string })?.id;
        if (deletedId) {
          setSightings((prev) => prev.filter((s) => s.id !== deletedId));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSightings]);

  function getLatestSighting(complexId: string): Sighting | undefined {
    return sightings.find((s) => s.complex_id === complexId);
  }

  // Best-effort photo cleanup. The DB delete is the source of truth — if storage
  // removal fails, we still consider the sighting deleted (orphan photos are
  // cheap and Supabase has lifecycle policies for cleanup).
  async function removePhotoIfOwned(photoUrl: string | null) {
    if (!photoUrl) return;
    // Public URLs look like .../storage/v1/object/public/sighting-photos/<userId>/<file>
    const marker = '/sighting-photos/';
    const idx = photoUrl.indexOf(marker);
    if (idx === -1) return;
    const path = photoUrl.slice(idx + marker.length);
    if (!path) return;
    await supabase.storage.from('sighting-photos').remove([path]);
  }

  const deleteSighting = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const target = sightings.find((s) => s.id === id);
    // Optimistically remove from UI; restore if the server rejects.
    setSightings((prev) => prev.filter((s) => s.id !== id));

    const { error: dbError } = await supabase.from('sightings').delete().eq('id', id);

    if (dbError) {
      console.error('[useSightings] delete failed:', dbError);
      if (target) setSightings((prev) => [target, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      return { error: dbError.message };
    }

    if (target?.photo_url) {
      void removePhotoIfOwned(target.photo_url);
    }

    return { error: null };
  }, [sightings]);

  const hasReacted = useCallback(
    (id: string, kind: ReactionKind) => myReactions.has(reactionKey(id, kind)),
    [myReactions],
  );

  // Optimistic toggle. A person gets Thanks, Saw it too, and ONE extra emoji per
  // report: picking a different emoji replaces their previous one. The database
  // enforces the same limit (2026-10-06_one_custom_emoji_per_user.sql).
  const toggleReaction = useCallback(async (id: string, kind: ReactionKind) => {
    const had = myReactions.has(reactionKey(id, kind));
    const isExtra = kind !== 'thanks' && kind !== 'seen';
    const replaced =
      !had && isExtra
        ? EXTRA_REACTIONS.find((r) => r.kind !== kind && myReactions.has(reactionKey(id, r.kind)))?.kind
        : undefined;

    const bump = (k: ReactionKind, delta: number) =>
      setSightings((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          if (k === 'thanks') return { ...s, thanks_count: Math.max((s.thanks_count ?? 0) + delta, 0) };
          if (k === 'seen') return { ...s, seen_count: Math.max((s.seen_count ?? 0) + delta, 0) };
          const counts = { ...(s.emoji_counts ?? {}) };
          const next = (counts[k] ?? 0) + delta;
          if (next > 0) counts[k] = next;
          else delete counts[k];
          return { ...s, emoji_counts: counts };
        }),
      );
    const mark = (k: ReactionKind, on: boolean) =>
      setMyReactions((prev) => {
        const next = new Set(prev);
        if (on) next.add(reactionKey(id, k));
        else next.delete(reactionKey(id, k));
        return next;
      });

    if (replaced) {
      mark(replaced, false);
      bump(replaced, -1);
    }
    mark(kind, !had);
    bump(kind, had ? -1 : 1);

    const remove = (k: ReactionKind) =>
      supabase.from('sighting_reactions').delete().eq('sighting_id', id).eq('kind', k);

    let dbError = replaced ? (await remove(replaced)).error : null;
    if (!dbError) {
      dbError = had
        ? (await remove(kind)).error
        : (await supabase.from('sighting_reactions').insert({ sighting_id: id, kind })).error;
    }

    if (dbError) {
      console.warn('[useSightings] reaction failed:', dbError.message);
      // A swap can fail halfway, so resync from the server rather than guess what stuck.
      void fetchSightings();
      return;
    }

    // Tell the poster. The function sends at most one push per reactor per report,
    // so calling it on every added reaction is safe.
    if (!had) {
      void supabase.functions
        .invoke('notify-reaction', { body: { sighting_id: id } })
        .then(({ error: invErr }) => {
          if (invErr) console.warn('[useSightings] notify-reaction', invErr.message);
        })
        .catch((e) => console.warn('[useSightings] notify-reaction', e));
    }
  }, [myReactions, fetchSightings]);

  /** True for the user's own posts, including anonymous ones (which carry no user_id). */
  const isOwnSighting = useCallback((id: string) => ownIds.has(id), [ownIds]);

  return { sightings, loading, error, refresh: fetchSightings, getLatestSighting, deleteSighting, isOwnSighting, hasReacted, toggleReaction };
}
