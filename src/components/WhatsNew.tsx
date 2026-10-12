import { useEffect, useRef } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useWhatsNew } from '../hooks/useWhatsNew';
import { fontSize, spacing, borderRadius, shadowFloat, fonts, type AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** What this release added. Update alongside WHATS_NEW_VERSION in useWhatsNew.ts. */
const ITEMS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'trophy',
    title: 'Ranks',
    desc: 'Earn points for your reports and climb the monthly leaderboard.',
  },
  {
    icon: 'heart',
    title: 'Reactions',
    desc: 'Thank people, confirm sightings, and see who reacted to yours.',
  },
  {
    icon: 'navigate',
    title: 'Faster timer',
    desc: 'Your nearest complexes show up first, with typical boot times.',
  },
];

/**
 * One-time "What's new" card for existing users, shown over the tabs on their
 * first open after the update. Same overlay pattern as ReportPrompt, which
 * waits until this has been dismissed.
 */
export default function WhatsNew() {
  const { visible, dismiss } = useWhatsNew();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();
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

  const openRanks = () => {
    dismiss();
    navigation.navigate('Ranks');
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

        <Text style={styles.title}>What's new in BootWatch</Text>

        <View style={styles.items}>
          {ITEMS.map((item) => (
            <View key={item.title} style={styles.item}>
              <View style={styles.itemIcon}>
                <Ionicons name={item.icon} size={20} color={colors.accent} />
              </View>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={openRanks}
          accessibilityRole="button"
        >
          <Ionicons name="trophy" size={20} color={colors.textInverse} />
          <Text style={styles.primaryButtonText}>Check out Ranks</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 510,
      elevation: 31,
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
    title: {
      fontSize: fontSize.xl,
      fontFamily: fonts.displayBold,
      color: colors.text,
      marginRight: spacing.lg,
    },
    items: {
      gap: spacing.md,
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    itemIcon: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.md,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemText: {
      flex: 1,
    },
    itemTitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
    },
    itemDesc: {
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      lineHeight: 18,
      marginTop: 2,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
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
    pressed: {
      opacity: 0.75,
    },
  });
}
