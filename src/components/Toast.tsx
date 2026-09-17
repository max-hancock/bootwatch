import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { fontSize, spacing, borderRadius, shadowCard, fonts, type AppColors } from '../theme';

export interface ToastConfig {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  duration?: number;
}

interface Props {
  toast: ToastConfig | null;
  onDismiss: () => void;
}

const DEFAULT_DURATION_MS = 3000;
const ANIM_IN_MS = 220;
const ANIM_OUT_MS = 220;
const HIDDEN_OFFSET = -120;

export default function Toast({ toast, onDismiss }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top);
  const translateY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;

    if (dismissTimer.current) clearTimeout(dismissTimer.current);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 60,
      }),
      Animated.timing(opacity, { toValue: 1, duration: ANIM_IN_MS, useNativeDriver: true }),
    ]).start();

    dismissTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: HIDDEN_OFFSET,
          duration: ANIM_OUT_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: ANIM_OUT_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDismiss();
      });
    }, toast.duration ?? DEFAULT_DURATION_MS);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [toast, translateY, opacity, onDismiss]);

  if (!toast) return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }], opacity }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        accessibilityLabel={toast.message}
        style={styles.pill}
        hitSlop={8}
      >
        <Ionicons
          name={toast.icon ?? 'checkmark-circle'}
          size={22}
          color={toast.iconColor ?? colors.accent}
        />
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: AppColors, topInset: number) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      top: topInset + spacing.sm,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 1000,
      paddingHorizontal: spacing.lg,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      maxWidth: '100%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.xl,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadowCard,
    },
    message: {
      flexShrink: 1,
      fontSize: fontSize.sm,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
      lineHeight: 20,
    },
  });
}
