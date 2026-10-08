import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { complexes } from '../data/complexes';
import { useTheme } from '../context/ThemeContext';
import { fontSize, spacing, borderRadius, fonts, type AppColors } from '../theme';

/** Shape returned by user_report_stats() (supabase/2026-10-06_leaderboard_and_user_stats.sql). */
export interface UserStats {
  user_id: string;
  display_name: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  member_since: string | null;
  month: { points: number; reports: number; place: number | null };
  all_time: { points: number; place: number | null; reports: number; thanks: number; confirmations: number };
  top_complex_id: string | null;
  /** Only present when you look at your own stats; includes anonymous reports. */
  private: { reports: number; anonymous_reports: number; points: number } | null;
}

const complexNames = new Map(complexes.map((c) => [c.id, c.name]));

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Score and report insights for one user. Used in the profile card (other
 * people) and on the Profile tab (yourself). Public numbers only count reports
 * posted under the user's name.
 */
export default function UserStatsPanel({
  userId,
  onLoaded,
}: {
  userId: string | null | undefined;
  onLoaded?: (stats: UserStats) => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const focused = useIsFocused();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId || !focused) return;
    let cancelled = false;
    setFailed(false);
    supabase.rpc('user_report_stats', { p_user_id: userId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        if (error) console.warn('[UserStatsPanel] user_report_stats failed:', error.message);
        setFailed(true);
        return;
      }
      setStats(data as UserStats);
      onLoaded?.(data as UserStats);
    });
    return () => {
      cancelled = true;
    };
    // onLoaded is a render-time callback; refetching when it changes identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, focused]);

  if (failed && !stats) {
    return <Text style={styles.muted}>Stats aren't available right now.</Text>;
  }
  if (!stats) {
    return <ActivityIndicator color={colors.accent} style={styles.loading} />;
  }

  const topComplex = stats.top_complex_id ? complexNames.get(stats.top_complex_id) : undefined;
  const memberSince = stats.member_since
    ? new Date(stats.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <View style={styles.root}>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{stats.month.points.toLocaleString()}</Text>
          <Text style={styles.tileLabel}>points this month</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{stats.month.place ? `#${stats.month.place}` : '–'}</Text>
          <Text style={styles.tileLabel}>rank this month</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{stats.month.reports}</Text>
          <Text style={styles.tileLabel}>{stats.month.reports === 1 ? 'report' : 'reports'} this month</Text>
        </View>
      </View>

      <View style={styles.facts}>
        <Text style={styles.fact}>
          <Text style={styles.factStrong}>{stats.all_time.points.toLocaleString()} points</Text> all time from{' '}
          {plural(stats.all_time.reports, 'report')}
          {stats.all_time.place ? ` · #${stats.all_time.place} all time` : ''}
        </Text>
        <Text style={styles.fact}>🙏 Thanked {plural(stats.all_time.thanks, 'time')}</Text>
        <Text style={styles.fact}>👀 Confirmed by others {plural(stats.all_time.confirmations, 'time')}</Text>
        {topComplex && <Text style={styles.fact}>📍 Reports most at {topComplex}</Text>}
        {memberSince && <Text style={styles.fact}>On BootWatch since {memberSince}</Text>}
      </View>

      {stats.private && stats.private.anonymous_reports > 0 && (
        <View style={styles.privateBox}>
          <Text style={styles.privateText}>
            Counting your {plural(stats.private.anonymous_reports, 'anonymous report')}, you've posted{' '}
            {plural(stats.private.reports, 'report')} worth {stats.private.points.toLocaleString()} points. Only you can see
            this; anonymous reports never count on the leaderboard.
          </Text>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: {
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    loading: {
      marginVertical: spacing.lg,
    },
    muted: {
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },
    tiles: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    tile: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    tileValue: {
      fontSize: fontSize.xl,
      fontFamily: fonts.displayBold,
      color: colors.accent,
    },
    tileLabel: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 2,
    },
    facts: {
      gap: spacing.xs,
    },
    fact: {
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.text,
      lineHeight: 20,
    },
    factStrong: {
      fontFamily: fonts.bodyBold,
    },
    privateBox: {
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: colors.infoTint,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    privateText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body,
      color: colors.text,
      lineHeight: 17,
    },
  });
}
