import { ReactionKind } from '../types/sighting';

/**
 * The fun reactions behind the "+" button. A fixed set rather than the full
 * emoji keyboard: it keeps hostile emoji off other people's reports and needs
 * no native picker. Keys must match the check constraint in
 * supabase/2026-10-05_reaction_emoji_and_reactor_list.sql.
 */
export const EXTRA_REACTIONS: { kind: ReactionKind; emoji: string }[] = [
  { kind: 'goat', emoji: '🐐' },
  { kind: 'cry', emoji: '😭' },
  { kind: 'laugh', emoji: '😂' },
  { kind: 'fire', emoji: '🔥' },
  { kind: 'skull', emoji: '💀' },
  { kind: 'salute', emoji: '🫡' },
  { kind: 'clap', emoji: '👏' },
  { kind: 'heart', emoji: '❤️' },
  { kind: 'rage', emoji: '😤' },
  { kind: 'siren', emoji: '🚨' },
  { kind: 'crown', emoji: '👑' },
  { kind: 'hundred', emoji: '💯' },
];

const EMOJI_BY_KIND: Record<string, string> = {
  thanks: '🙏',
  seen: '👀',
  ...Object.fromEntries(EXTRA_REACTIONS.map((r) => [r.kind, r.emoji])),
};

export function reactionEmoji(kind: string): string {
  return EMOJI_BY_KIND[kind] ?? '👍';
}
