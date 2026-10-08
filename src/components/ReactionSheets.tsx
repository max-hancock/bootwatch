import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { ReactionKind } from '../types/sighting';
import { EXTRA_REACTIONS, reactionEmoji } from '../utils/reactions';
import { DEFAULT_AVATAR_COLOR } from '../utils/avatarColors';
import { useTheme } from '../context/ThemeContext';
import { fontSize, spacing, borderRadius, shadowFloat, fonts, type AppColors } from '../theme';

/** Grid of the extra emoji behind the "+" on a feed card. */
export function EmojiPickerModal({
  visible,
  onClose,
  isSelected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  isSelected: (kind: ReactionKind) => boolean;
  onSelect: (kind: ReactionKind) => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card}>
          <Text style={styles.title}>Add a reaction</Text>
          <View style={styles.emojiGrid}>
            {EXTRA_REACTIONS.map((r) => {
              const selected = isSelected(r.kind);
              return (
                <Pressable
                  key={r.kind}
                  onPress={() => onSelect(r.kind)}
                  style={({ pressed }) => [
                    styles.emojiCell,
                    selected && styles.emojiCellSelected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={r.kind}
                >
                  <Text style={styles.emojiGlyph}>{r.emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface Reactor {
  kind: string;
  display_name: string;
  avatar_color: string | null;
  avatar_url: string | null;
  reacted_at: string;
}

/**
 * Who reacted to one of your own reports. The server only returns rows to the
 * report's author (see sighting_reactors in the 2026-10-05 migration).
 */
export function ReactorsModal({ sightingId, onClose }: { sightingId: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [reactors, setReactors] = useState<Reactor[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!sightingId) return;
    let cancelled = false;
    setReactors(null);
    setFailed(false);
    supabase.rpc('sighting_reactors', { p_sighting_id: sightingId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[ReactorsModal] sighting_reactors failed:', error.message);
        setFailed(true);
        return;
      }
      setReactors((data ?? []) as Reactor[]);
    });
    return () => {
      cancelled = true;
    };
  }, [sightingId]);

  return (
    <Modal visible={sightingId !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Reactions</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {failed ? (
            <Text style={styles.empty}>Couldn't load reactions. Try again in a moment.</Text>
          ) : reactors === null ? (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          ) : reactors.length === 0 ? (
            <Text style={styles.empty}>
              No reactions yet. When people thank you or react to this report, they'll show up here.
            </Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {reactors.map((r, i) => (
                <View key={`${r.display_name}-${r.kind}-${i}`} style={styles.row}>
                  <View style={[styles.avatar, { backgroundColor: r.avatar_color ?? DEFAULT_AVATAR_COLOR }]}>
                    {r.avatar_url ? (
                      <Image source={{ uri: r.avatar_url }} style={styles.avatarImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.avatarText}>{r.display_name.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.display_name}
                  </Text>
                  <Text style={styles.rowEmoji}>{reactionEmoji(r.kind)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      maxHeight: '70%',
      backgroundColor: colors.background,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      ...shadowFloat,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: fontSize.lg,
      fontFamily: fonts.displayBold,
      color: colors.text,
    },
    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    emojiCell: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiCellSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.infoTint,
    },
    emojiGlyph: {
      fontSize: 28,
    },
    pressed: {
      opacity: 0.7,
    },
    loading: {
      marginVertical: spacing.lg,
    },
    empty: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      lineHeight: 22,
      marginTop: spacing.md,
    },
    list: {
      marginTop: spacing.md,
    },
    listContent: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
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
    name: {
      flex: 1,
      fontSize: fontSize.md,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
    },
    rowEmoji: {
      fontSize: fontSize.lg,
    },
  });
}
