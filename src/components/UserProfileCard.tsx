import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import UserStatsPanel, { UserStats } from './UserStatsPanel';
import { DEFAULT_AVATAR_COLOR } from '../utils/avatarColors';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useHiddenPhotos, useReportPhoto } from '../hooks/useReportPhoto';
import { fontSize, spacing, borderRadius, shadowFloat, fonts, type AppColors } from '../theme';

interface Props {
  /** User to show; null hides the card. */
  userId: string | null;
  onClose: () => void;
  /** Shown while the stats load, when the caller already knows them (e.g. a leaderboard row). */
  preview?: { display_name: string; avatar_color: string | null; avatar_url: string | null };
}

/** Public profile card: who someone is on BootWatch and what they've contributed. */
export default function UserProfileCard({ userId, onClose, preview }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    setStats(null);
  }, [userId]);

  const name = stats?.display_name ?? preview?.display_name ?? 'BootWatch user';
  const avatarColor = stats?.avatar_color ?? preview?.avatar_color ?? DEFAULT_AVATAR_COLOR;
  const { user } = useAuth();
  const { isHidden } = useHiddenPhotos();
  const reportPhoto = useReportPhoto();
  const rawAvatarUrl = stats?.avatar_url ?? preview?.avatar_url ?? null;
  const avatarUrl = isHidden(rawAvatarUrl) ? null : rawAvatarUrl;
  const canReport = !!avatarUrl && !!userId && userId !== user?.id;

  const handleReport = async () => {
    if (!avatarUrl || !userId) return;
    if (await reportPhoto('avatar', userId, avatarUrl)) onClose();
  };

  return (
    <Modal visible={userId !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card}>
          <Pressable
            style={styles.close}
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>

          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>

          {canReport && (
            <Pressable
              onPress={() => void handleReport()}
              hitSlop={8}
              style={styles.reportLink}
              accessibilityRole="button"
              accessibilityLabel="Report profile photo"
            >
              <Ionicons name="flag-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.reportLinkText}>Report photo</Text>
            </Pressable>
          )}

          <View style={styles.stats}>
            <UserStatsPanel userId={userId} onLoaded={setStats} />
          </View>
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
      maxWidth: 360,
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      ...shadowFloat,
    },
    close: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: spacing.sm,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      fontSize: fontSize.xl,
      fontFamily: fonts.displayBold,
      color: colors.textInverse,
    },
    name: {
      fontSize: fontSize.xl,
      fontFamily: fonts.displayBold,
      color: colors.text,
      maxWidth: '85%',
    },
    stats: {
      alignSelf: 'stretch',
    },
    reportLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: spacing.xs,
    },
    reportLinkText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body,
      color: colors.textSecondary,
    },
  });
}
