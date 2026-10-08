import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ScreenGradientBackdrop from '../components/ScreenGradientBackdrop';
import UserProfileCard from '../components/UserProfileCard';
import { DEFAULT_AVATAR_COLOR } from '../utils/avatarColors';
import { fontSize, spacing, borderRadius, shadowCard, fonts, type AppColors } from '../theme';

/** Row returned by leaderboard() (supabase/2026-10-06_leaderboard_and_user_stats.sql). */
interface LeaderboardRow {
  place: number;
  user_id: string;
  display_name: string;
  avatar_color: string | null;
  avatar_url: string | null;
  points: number;
  reports: number;
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** The monthly board is a fresh race each month; all-time scores are never reset. */
type Scope = 'month' | 'all';

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<LeaderboardRow | null>(null);
  const [scope, setScope] = useState<Scope>('month');
  const [howVisible, setHowVisible] = useState(false);

  const load = useCallback(async () => {
    const { data, error } =
      scope === 'month'
        ? await supabase.rpc('leaderboard', { p_limit: 50, p_months_ago: 0 })
        : await supabase.rpc('leaderboard_all_time', { p_limit: 50 });
    if (error) {
      console.warn('[Leaderboard] leaderboard failed:', error.message);
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows((data ?? []) as LeaderboardRow[]);
  }, [scope]);

  // Scores move whenever anyone reports or reacts, so refresh each time the tab is opened.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const onBoard = !!user && !!rows?.some((r) => r.user_id === user.id);

  if (rows === null) {
    return (
      <ScreenGradientBackdrop>
        <View style={styles.centered}>
          {failed ? (
            <>
              <Ionicons name="cloud-offline-outline" size={48} color={colors.danger} />
              <Text style={styles.emptyTitle}>Couldn't load the leaderboard</Text>
              <Pressable style={styles.retryButton} onPress={() => void load()}>
                <Ionicons name="refresh" size={18} color={colors.textInverse} />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator size="large" color={colors.accent} />
          )}
        </View>
      </ScreenGradientBackdrop>
    );
  }

  return (
    <ScreenGradientBackdrop>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.scopeToggle}>
              {(['month', 'all'] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setScope(s)}
                  style={[styles.scopeButton, scope === s && styles.scopeButtonActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: scope === s }}
                >
                  <Text style={[styles.scopeText, scope === s && styles.scopeTextActive]}>
                    {s === 'month' ? 'This month' : 'All time'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.titleRow}>
              <Text style={styles.month}>{scope === 'month' ? monthLabel : 'All time'}</Text>
              <Pressable
                onPress={() => setHowVisible(true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="How points work"
              >
                <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              {scope === 'month'
                ? 'A fresh race starts on the 1st. Your all-time score is never reset.'
                : 'Every point ever earned. These scores never reset.'}
            </Text>
            {scope === 'month' && rows.length > 0 && !onBoard && (
              <View style={styles.nudge}>
                <Ionicons name="trophy-outline" size={18} color={colors.accent} />
                <Text style={styles.nudgeText}>
                  You're not on the board yet this month. Post a report under your name to get on it.
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏆</Text>
            <Text style={styles.emptyTitle}>The board is wide open</Text>
            <Text style={styles.emptyText}>
              {scope === 'month'
                ? 'No one has scored yet this month. Report a sighting under your name and take first place.'
                : 'No one has scored yet. Report a sighting under your name and take first place.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = !!user && item.user_id === user.id;
          return (
            <Pressable
              onPress={() => setSelected(item)}
              style={({ pressed }) => [styles.row, isMe && styles.rowMe, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Rank ${item.place}, ${item.display_name}, ${item.points} points`}
            >
              <Text style={[styles.place, MEDALS[item.place] ? styles.placeMedal : null]}>
                {MEDALS[item.place] ?? item.place}
              </Text>
              <View style={[styles.avatar, { backgroundColor: item.avatar_color ?? DEFAULT_AVATAR_COLOR }]}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.avatarText}>{item.display_name.charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name}
                  {isMe ? ' (you)' : ''}
                </Text>
                <Text style={styles.reports}>
                  {item.reports} {item.reports === 1 ? 'report' : 'reports'}
                </Text>
              </View>
              <View style={styles.pointsWrap}>
                <Text style={styles.points}>{item.points.toLocaleString()}</Text>
                <Text style={styles.pointsLabel}>pts</Text>
              </View>
            </Pressable>
          );
        }}
      />
      <Modal visible={howVisible} transparent animationType="fade" onRequestClose={() => setHowVisible(false)}>
        <View style={styles.howOverlay}>
          <Pressable style={styles.howBackdrop} onPress={() => setHowVisible(false)} accessibilityLabel="Close" />
          {/* Keep in step with report_points() in the leaderboard migration. */}
          <View style={styles.howItWorks}>
            <View style={styles.titleRow}>
              <Text style={styles.howTitle}>How points work</Text>
              <Pressable
                onPress={() => setHowVisible(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.howLine}>
              <Text style={styles.howStrong}>100 points</Text> for each report you post
            </Text>
            <Text style={styles.howLine}>
              <Text style={styles.howStrong}>+25 points</Text> for every reaction your report gets
            </Text>
            <Text style={styles.howNote}>
              The monthly board starts fresh on the 1st. Your all-time score is never reset.
            </Text>
            <Text style={styles.howNote}>
              Anonymous reports still help everyone, but they don't count here, so no one can work out who posted
              them.
            </Text>
          </View>
        </View>
      </Modal>
      <UserProfileCard
        userId={selected?.user_id ?? null}
        preview={selected ?? undefined}
        onClose={() => setSelected(null)}
      />
    </ScreenGradientBackdrop>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    listContent: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    header: {
      marginBottom: spacing.sm,
    },
    scopeToggle: {
      flexDirection: 'row',
      padding: 3,
      marginBottom: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    scopeButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
    },
    scopeButtonActive: {
      backgroundColor: colors.accentSoft,
    },
    scopeText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bodyMedium,
      color: colors.textSecondary,
    },
    scopeTextActive: {
      color: colors.accent,
    },
    month: {
      fontSize: fontSize.xl,
      fontFamily: fonts.displayBold,
      color: colors.text,
    },
    subtitle: {
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      marginTop: 2,
    },
    nudge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    nudgeText: {
      flex: 1,
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.text,
      lineHeight: 19,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      ...shadowCard,
    },
    rowMe: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    rowPressed: {
      opacity: 0.75,
    },
    place: {
      width: 32,
      textAlign: 'center',
      fontSize: fontSize.md,
      fontFamily: fonts.displayBold,
      color: colors.textSecondary,
    },
    placeMedal: {
      fontSize: fontSize.xl,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      fontSize: fontSize.md,
      fontFamily: fonts.display,
      color: colors.textInverse,
    },
    rowText: {
      flex: 1,
    },
    name: {
      fontSize: fontSize.md,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
    },
    reports: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      marginTop: 2,
    },
    pointsWrap: {
      alignItems: 'flex-end',
    },
    points: {
      fontSize: fontSize.lg,
      fontFamily: fonts.displayBold,
      color: colors.accent,
    },
    pointsLabel: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body,
      color: colors.textSecondary,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },
    emptyEmoji: {
      fontSize: 48,
    },
    emptyTitle: {
      fontSize: fontSize.lg,
      fontFamily: fonts.displayBold,
      color: colors.text,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 300,
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
    },
    retryText: {
      color: colors.textInverse,
      fontSize: fontSize.md,
      fontFamily: fonts.bodyMedium,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    howOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
    },
    howBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    howItWorks: {
      width: '100%',
      maxWidth: 340,
      padding: spacing.lg,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      gap: spacing.sm,
    },
    howTitle: {
      fontSize: fontSize.lg,
      fontFamily: fonts.displayBold,
      color: colors.text,
    },
    howLine: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.text,
      lineHeight: 22,
    },
    howStrong: {
      fontFamily: fonts.bodyBold,
      color: colors.accent,
    },
    howNote: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      lineHeight: 17,
    },
  });
}
