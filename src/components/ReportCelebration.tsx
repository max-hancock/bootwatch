import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ReportType } from '../types/sighting';
import { fontSize, spacing, borderRadius, shadowFloat, fonts, type AppColors } from '../theme';

const BOOTWATCH_LOGO = require('../../assets/splash-icon.png');

export interface CelebrationConfig {
  reportType: ReportType;
  /** How many people the report pushed an alert to; null when unknown. */
  alerted: Promise<number | null>;
}

interface Props {
  celebration: CelebrationConfig | null;
  onDone: () => void;
}

/** Lets the report sheet finish sliding away before the moment starts. */
const START_DELAY_MS = 250;
const HOLD_MS = 3200;
const FADE_OUT_MS = 250;
const PARTICLE_COUNT = 12;
const BURST_DISTANCE = 104;
/** The logo is dark line art, so it sits on a light disc in both themes. */
const LOGO_DISC_COLOR = '#FFFBEB';

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * The reporter's total, anonymous posts included. sighting_authors only returns
 * the caller's own rows (RLS); the user_id count is the fallback for projects
 * where that table doesn't exist yet.
 */
async function countOwnReports(userId: string): Promise<number | null> {
  const authored = await supabase
    .from('sighting_authors')
    .select('sighting_id', { count: 'exact', head: true });
  if (!authored.error && authored.count !== null) return authored.count;
  const legacy = await supabase
    .from('sightings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return legacy.count ?? null;
}

function FadeInLine({ children, style }: { children: React.ReactNode; style: object }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.Text style={[style, { opacity }]}>{children}</Animated.Text>;
}

/**
 * The "you just helped" moment after a report: BootWatch logo pop + burst, then the real
 * numbers behind it (people alerted, the reporter's running total).
 *
 * "I got booted" reports get a calm version with no burst — that person is
 * having a bad day, so we acknowledge rather than celebrate.
 */
export default function ReportCelebration({ celebration, onDone }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = createStyles(colors);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const [alerted, setAlerted] = useState<number | null>(null);
  const [tally, setTally] = useState<number | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!celebration) return;
    let cancelled = false;
    setAlerted(null);
    setTally(null);
    overlayOpacity.setValue(0);
    iconScale.setValue(0);
    burst.setValue(0);
    scan.setValue(0);

    celebration.alerted.then((n) => {
      if (!cancelled) setAlerted(n);
    });
    if (userId) {
      void countOwnReports(userId).then((count) => {
        if (!cancelled && count) setTally(count);
      });
    }

    const calm = celebration.reportType === 'booted';
    const startTimer = setTimeout(async () => {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (cancelled) return;
      Animated.timing(overlayOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      if (calm || reduceMotion) {
        Animated.timing(iconScale, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        return;
      }
      Animated.spring(iconScale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
      // After the pop, the binoculars sweep left and right once, like they're scanning the lot.
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(scan, { toValue: -1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start();
      Animated.timing(burst, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, START_DELAY_MS);

    const endTimer = setTimeout(() => {
      Animated.timing(overlayOpacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished && !cancelled) onDone();
        },
      );
    }, START_DELAY_MS + HOLD_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearTimeout(endTimer);
    };
  }, [celebration, userId, overlayOpacity, iconScale, burst, scan, onDone]);

  if (!celebration) return null;

  const calm = celebration.reportType === 'booted';
  const tint = calm ? colors.primary : colors.accent;
  const particleColors = [colors.accent, colors.danger, colors.primary];

  const alertedLine =
    alerted && alerted > 0
      ? calm
        ? `${alerted} ${alerted === 1 ? 'person' : 'people'} nearby ${alerted === 1 ? 'was' : 'were'} just warned.`
        : `${alerted} ${alerted === 1 ? 'person' : 'people'} nearby ${alerted === 1 ? 'was' : 'were'} just alerted.`
      : null;
  const tallyLine =
    tally === null
      ? null
      : tally === 1
        ? 'Your first report. Welcome to the watch.'
        : `That's your ${ordinal(tally)} report.`;

  const title = calm ? 'Sorry that happened' : 'Report sent!';
  const subtitle = calm
    ? 'Thanks for sharing it. Your report helps others avoid the same thing.'
    : 'Thanks for looking out for everyone.';

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Pressable
        style={styles.dismissArea}
        onPress={onDone}
        accessibilityRole="alert"
        accessibilityLabel={[title, subtitle, alertedLine, tallyLine].filter(Boolean).join(' ')}
      >
        <View style={styles.card}>
          <View style={styles.iconStage}>
            {!calm &&
              Array.from({ length: PARTICLE_COUNT }, (_, i) => {
                const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
                // Alternate reach so the burst reads as a spray, not a ring.
                const reach = BURST_DISTANCE * (i % 2 === 0 ? 1 : 0.68);
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.particle,
                      {
                        backgroundColor: particleColors[i % particleColors.length],
                        opacity: burst.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                        transform: [
                          { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * reach] }) },
                          { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * reach] }) },
                          { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.4] }) },
                        ],
                      },
                    ]}
                  />
                );
              })}
            <Animated.View
              style={[
                styles.iconCircle,
                { backgroundColor: calm ? colors.infoTint : LOGO_DISC_COLOR, borderColor: tint },
                {
                  transform: [
                    { scale: iconScale },
                    { rotate: scan.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] }) },
                  ],
                },
              ]}
            >
              {calm ? (
                <Ionicons name="heart" size={44} color={tint} />
              ) : (
                <Image source={BOOTWATCH_LOGO} style={styles.logo} resizeMode="contain" />
              )}
            </Animated.View>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.stats}>
            {alertedLine && <FadeInLine style={[styles.statStrong, { color: tint }]}>{alertedLine}</FadeInLine>}
            {tallyLine && <FadeInLine style={styles.stat}>{tallyLine}</FadeInLine>}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 900,
      elevation: 40,
      backgroundColor: 'rgba(15, 23, 42, 0.35)',
    },
    dismissArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      ...shadowFloat,
    },
    iconStage: {
      width: 112,
      height: 112,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    iconCircle: {
      width: 104,
      height: 104,
      borderRadius: 52,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Oversized on purpose: the artwork has transparent padding around the binoculars.
    logo: {
      width: 116,
      height: 116,
    },
    particle: {
      position: 'absolute',
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    title: {
      fontSize: fontSize.xl,
      fontFamily: fonts.displayBold,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginTop: spacing.xs,
    },
    // Fixed height so the card doesn't jump when the numbers arrive.
    stats: {
      minHeight: 52,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    statStrong: {
      fontSize: fontSize.md,
      fontFamily: fonts.bodyBold,
      textAlign: 'center',
    },
    stat: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bodyMedium,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
