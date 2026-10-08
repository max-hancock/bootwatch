export type ReportType = 'spotter' | 'booted';

/** 'thanks' = appreciation for the report; 'seen' = "I saw it too" (confirms it). */
export type ReactionKind =
  | 'thanks'
  | 'seen'
  // Extra emoji behind the "+" button (src/utils/reactions.ts).
  | 'goat' | 'cry' | 'laugh' | 'fire' | 'skull' | 'salute'
  | 'clap' | 'heart' | 'rage' | 'siren' | 'crown' | 'hundred';

export interface Sighting {
  id: string;
  user_id: string | null;
  complex_id: string;
  latitude: number;
  longitude: number;
  photo_url: string | null;
  report_type: ReportType;
  is_anonymous: boolean;
  created_at: string;
  /** Undefined on projects where the reactions migration hasn't run. */
  thanks_count?: number;
  seen_count?: number;
  /** Totals for the extra emoji, e.g. { goat: 2 }. Undefined before its migration has run. */
  emoji_counts?: Record<string, number>;
  complex_name?: string;
  display_name?: string;
  avatar_color?: string;
  avatar_url?: string | null;
}
