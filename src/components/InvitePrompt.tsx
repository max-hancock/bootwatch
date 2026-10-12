import { useEffect, useRef } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { snoozeInvitePromptAfterShare, useInvitePrompt } from '../hooks/useInvitePrompt';
import { shareInvite } from '../utils/share';
import { useToast } from '../context/ToastContext';
import { fontSize, spacing, borderRadius, shadowFloat, fonts, type AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

/**
 * Closable "Enjoying BootWatch? Spread the word" popup. Same overlay pattern as
 * ReportPrompt; the schedule lives in useInvitePrompt.
 */
export default function InvitePrompt() {
  const { visible, dismiss } = useInvitePrompt();
  const { colors } = useTheme();
  const { show: showToast } = useToast();
  const styles = createStyles(colors);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, opacity, dismiss]);

  if (!visible) return null;

  const handleInvite = async () => {
    dismiss();
    const outcome = await shareInvite();
    if (outcome === 'dismissed') return;
    snoozeInvitePromptAfterShare();
    if (outcome === 'copied') showToast({ message: 'Copied. Paste it to a friend.', icon: 'copy' });
  };

  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Dismiss" />
      <View style={styles.card} accessibilityViewIsModal onAccessibilityEscape={dismiss}>
        <Pressable
          style={styles.close}
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>

        <View style={styles.iconWrap}>
          <Ionicons name="people" size={28} color={colors.accent} />
        </View>
        <Text style={styles.title}>Enjoying BootWatch?</Text>
        <Text style={styles.body}>
          Spread the word. Every student who joins is one more set of eyes protecting cars from getting booted.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={() => void handleInvite()}
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={20} color={colors.textInverse} />
          <Text style={styles.primaryButtonText}>Invite a friend</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={dismiss}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Not now</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 500,
      elevation: 30,
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
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.xl,
      fontFamily: fonts.displayBold,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: spacing.lg,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      width: '100%',
      minHeight: 48,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      fontSize: fontSize.lg,
      fontFamily: fonts.display,
      color: colors.textInverse,
    },
    secondaryButton: {
      width: '100%',
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.xs,
    },
    secondaryButtonText: {
      fontSize: fontSize.md,
      fontFamily: fonts.bodyMedium,
      color: colors.textSecondary,
    },
    pressed: {
      opacity: 0.75,
    },
  });
}
