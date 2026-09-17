import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSightings } from '../hooks/useSightings';
import { useAuth } from '../context/AuthContext';
import { Sighting } from '../types/sighting';
import { timeAgo, isWithinHours } from '../utils/time';
import ReportSightingModal from '../components/ReportSightingModal';
import PhotoLightbox from '../components/PhotoLightbox';
import ScreenGradientBackdrop from '../components/ScreenGradientBackdrop';
import { DEFAULT_AVATAR_COLOR } from '../utils/avatarColors';
import { fontSize, spacing, borderRadius, shadowCard } from '../theme';
import { fonts } from '../theme/fonts';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

const BOOTWATCH_EMPTY = require('../../assets/android-icon-monochrome.png');

function PulseBadge({
  active,
  style,
  children,
}: {
  active: boolean;
  style?: object;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, opacity]);
  return <Animated.View style={[style, active && { opacity }]}>{children}</Animated.View>;
}

export default function FeedScreen() {
  const { colors } = useTheme();
  const { show: showToast } = useToast();
  const styles = createStyles(colors);
  const { sightings, loading, error, refresh, deleteSighting } = useSightings();
  const { user } = useAuth();
  const [reportVisible, setReportVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const openLightbox = useCallback((uri: string) => setLightboxUri(uri), []);
  const closeLightbox = useCallback(() => setLightboxUri(null), []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleDelete = useCallback((id: string) => {
    const confirmAndDelete = async () => {
      const { error: delError } = await deleteSighting(id);
      if (delError) {
        if (Platform.OS === 'web') alert(`Could not delete report.\n\n${delError}`);
        else Alert.alert('Could not delete', delError);
      }
    };

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (confirm('Delete this report? This cannot be undone.')) void confirmAndDelete();
      return;
    }

    Alert.alert(
      'Delete report?',
      'This will remove your sighting from the feed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void confirmAndDelete() },
      ],
    );
  }, [deleteSighting]);

  const renderSighting = useCallback(
    ({ item }: { item: Sighting }) => (
      <SightingCard
        item={item}
        styles={styles}
        colors={colors}
        isOwn={!!user && item.user_id === user.id}
        onDelete={handleDelete}
        onPhotoPress={openLightbox}
      />
    ),
    [styles, colors, user, handleDelete, openLightbox],
  );

  if (loading && sightings.length === 0) {
    return (
      <ScreenGradientBackdrop>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </ScreenGradientBackdrop>
    );
  }

  if (error && !loading) {
    return (
      <ScreenGradientBackdrop>
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.danger} />
            <Text style={styles.errorTitle}>Couldn't load feed</Text>
            <Text style={styles.errorSubtitle}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={refresh}>
              <Ionicons name="refresh" size={18} color={colors.textInverse} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      </ScreenGradientBackdrop>
    );
  }

  return (
    <ScreenGradientBackdrop>
      <View style={styles.container}>
        <FlatList
        style={styles.list}
        data={sightings}
        keyExtractor={(item) => item.id}
        renderItem={renderSighting}
        contentContainerStyle={sightings.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          sightings.length > 0 ? (
            <View style={styles.privacyBanner}>
              <View style={styles.privacyIconWrap}>
                <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
              </View>
              <Text style={styles.privacyText}>
                Your reports help the community. Anonymous posting is always available. We never share your identity
                with property managers or booting companies.
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Image
              source={BOOTWATCH_EMPTY}
              style={[styles.emptyBrandLogo, { tintColor: colors.accent }]}
              resizeMode="contain"
              accessibilityLabel="BootWatch"
            />
            <Text style={styles.emptyTitle}>All quiet</Text>
            <Text style={styles.emptySubtitle}>
              No boot trucks on the radar yet. When you spot one, tap + and the crew will see it live.
            </Text>
          </View>
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report a sighting"
        style={[styles.fab, { bottom: spacing.md }]}
        onPress={() => setReportVisible(true)}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </Pressable>

      <ReportSightingModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSuccess={() => {
          refresh();
          showToast({
            message: 'Thanks for the heads-up — others nearby will see it.',
            icon: 'heart',
          });
        }}
      />
      <PhotoLightbox imageUri={lightboxUri} onClose={closeLightbox} />
      </View>
    </ScreenGradientBackdrop>
  );
}

const SightingCard = React.memo(function SightingCard({
  item,
  styles,
  colors,
  isOwn,
  onDelete,
  onPhotoPress,
}: {
  item: Sighting;
  styles: ReturnType<typeof createStyles>;
  colors: import('../theme').AppColors;
  isOwn: boolean;
  onDelete: (id: string) => void;
  onPhotoPress: (uri: string) => void;
}) {
  const isActive = isWithinHours(item.created_at, 0.5);
  const isRecent = !isActive && isWithinHours(item.created_at, 2);
  const isStale = !isActive && !isRecent;
  const name = item.display_name ?? 'Anonymous';
  const initial = name.charAt(0).toUpperCase();
  const isBooted = item.report_type === 'booted';

  const cardVariant = isBooted
    ? styles.cardBooted
    : isActive
      ? styles.cardActive
      : isRecent
        ? styles.cardRecent
        : styles.cardStale;

  const avatarBg = isBooted ? colors.danger : item.is_anonymous ? colors.neutral : item.avatar_color ?? DEFAULT_AVATAR_COLOR;

  const avatarIcon: React.ComponentProps<typeof Ionicons>['name'] | null = item.is_anonymous
    ? 'shield-checkmark'
    : null;

  const showAvatarPhoto = !item.is_anonymous && !!item.avatar_url;

  const tsStyle = isActive ? styles.timestampActive : isRecent ? styles.timestampRecent : undefined;

  return (
    <View style={[styles.card, cardVariant]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          {avatarIcon ? (
            <Ionicons name={avatarIcon} size={16} color={colors.textInverse} />
          ) : showAvatarPhoto ? (
            <Image
              source={{ uri: item.avatar_url! }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarText}>{initial}</Text>
          )}
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.narrative, isStale && styles.narrativeStale]}>
            <Text style={styles.narrativeName}>{name}</Text>
            {isBooted ? ' got booted at ' : ' spotted a booter at '}
            <Text style={[styles.narrativeComplex, isStale && styles.narrativeComplexStale]}>{item.complex_name}</Text>
          </Text>
          <Text style={[styles.timestamp, tsStyle]}>{timeAgo(item.created_at)}</Text>
        </View>
        {isActive && (
          <PulseBadge active style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>LIVE</Text>
          </PulseBadge>
        )}
        {isRecent && !isActive && (
          <View style={styles.recentBadge}>
            <Text style={styles.recentBadgeText}>RECENT</Text>
          </View>
        )}
        {isOwn && (
          <Pressable
            onPress={() => onDelete(item.id)}
            hitSlop={10}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Delete this report"
          >
            <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
      {item.photo_url && (
        <Pressable
          onPress={() => onPhotoPress(item.photo_url!)}
          style={({ pressed }) => [styles.photoPressable, pressed && styles.photoPressablePressed]}
          accessibilityLabel="View full-size photo"
          accessibilityRole="imagebutton"
        >
          <Image source={{ uri: item.photo_url }} style={styles.photo} resizeMode="cover" />
        </Pressable>
      )}
    </View>
  );
});

function createStyles(colors: import('../theme').AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    list: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    listContent: {
      padding: spacing.md,
      gap: spacing.md,
    },
    privacyBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      backgroundColor: colors.infoTint,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.primary,
      ...shadowCard,
    },
    privacyIconWrap: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.sm,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    privacyText: {
      flex: 1,
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.text,
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadowCard,
    },
    cardStale: {
      borderLeftWidth: 3,
      borderLeftColor: colors.border,
    },
    cardActive: {
      borderLeftWidth: 4,
      borderLeftColor: colors.danger,
      backgroundColor: colors.dangerLight,
    },
    cardRecent: {
      borderLeftWidth: 4,
      borderLeftColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    cardBooted: {
      borderLeftWidth: 4,
      borderLeftColor: colors.danger,
      backgroundColor: colors.dangerLight,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.neutral,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarText: {
      fontSize: fontSize.md,
      fontFamily: fonts.display,
      color: colors.textInverse,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 20,
    },
    cardHeaderText: {
      flex: 1,
    },
    narrative: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.text,
      lineHeight: 22,
    },
    narrativeName: {
      fontFamily: fonts.bodyMedium,
    },
    narrativeComplex: {
      fontFamily: fonts.bodyBold,
      color: colors.primary,
    },
    narrativeStale: {
      opacity: 0.65,
    },
    narrativeComplexStale: {
      color: colors.textSecondary,
    },
    timestamp: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      marginTop: 4,
    },
    timestampActive: {
      color: colors.danger,
      fontFamily: fonts.bodyMedium,
    },
    timestampRecent: {
      color: colors.accent,
      fontFamily: fonts.bodyMedium,
    },
    activeBadge: {
      backgroundColor: colors.danger,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.sm,
    },
    activeBadgeText: {
      fontSize: 10,
      fontFamily: fonts.displayBold,
      color: colors.textInverse,
      letterSpacing: 1,
    },
    recentBadge: {
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.sm,
    },
    recentBadgeText: {
      fontSize: 10,
      fontFamily: fonts.displayBold,
      color: colors.textInverse,
      letterSpacing: 0.8,
    },
    deleteButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    deleteButtonPressed: {
      opacity: 0.6,
    },
    photoPressable: {
      marginTop: spacing.sm,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
    },
    photoPressablePressed: {
      opacity: 0.88,
    },
    photo: {
      width: '100%',
      height: 160,
    },
    emptyContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      gap: spacing.md,
      maxWidth: 320,
    },
    emptyBrandLogo: {
      width: 200,
      height: 200,
      marginBottom: spacing.sm,
    },
    emptyTitle: {
      fontSize: fontSize.xxl,
      fontFamily: fonts.displayBold,
      color: colors.text,
    },
    emptySubtitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },
    fab: {
      position: 'absolute',
      right: spacing.lg,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20,
      ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
      shadowColor: colors.danger,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 10,
      borderWidth: 2,
      borderColor: colors.background,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    errorTitle: {
      fontSize: fontSize.xl,
      fontFamily: fonts.display,
      color: colors.text,
    },
    errorSubtitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
      marginTop: spacing.sm,
    },
    retryText: {
      color: colors.textInverse,
      fontSize: fontSize.md,
      fontFamily: fonts.bodyMedium,
    },
  });
}
