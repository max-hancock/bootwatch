import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useComplexSightingPatterns } from '../hooks/useComplexSightingPatterns';
import { classifyPeakPatternConfidence, formatHour12Wall, formatPeakPatternSentence } from '../utils/sightingPatterns';
import { useTheme } from '../context/ThemeContext';
import { fontSize, spacing, borderRadius, fonts, type AppColors } from '../theme';

interface Props {
  complexId: string;
  /** Hand-written note from the complex data, shown until the app has enough reports of its own. */
  fallbackHint?: string | null;
  /** Render only when right now is a peak hour (used on the running-timer view, where space is tight). */
  onlyWhenPeak?: boolean;
  /** Spacing for the note itself, so nothing is reserved when there is nothing to show. */
  style?: StyleProp<ViewStyle>;
}

/** Current hour (0–23) in Rexburg time, which is what the stats RPC reports in. */
function currentBoiseHour(): number {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Boise', hour: 'numeric', hourCycle: 'h23' }).format(
        new Date(),
      ),
    );
    if (Number.isFinite(hour)) return hour % 24;
  } catch {
    // Intl time zones unavailable — fall through to the device clock.
  }
  return new Date().getHours();
}

/** Within an hour either side of a peak hour, wrapping past midnight. */
function isNearPeak(hour: number, topHours: number[]): boolean {
  return topHours.some((peak) => {
    const diff = Math.abs(hour - peak);
    return Math.min(diff, 24 - diff) <= 1;
  });
}

/**
 * When boot trucks are usually reported at a complex, shown at the moment
 * someone is deciding to park there. Turns into a warning if right now is one
 * of those times. Same data and thresholds as the complex sheet on the map.
 */
export default function BootPatternNote({ complexId, fallbackHint, onlyWhenPeak, style }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { stats } = useComplexSightingPatterns(complexId, true);

  const confidence = stats ? classifyPeakPatternConfidence(stats.total) : 'none';
  const hasPattern = confidence !== 'none' && !!stats && stats.topHours.length > 0;
  const peakNow = hasPattern && isNearPeak(currentBoiseHour(), stats.topHours);

  if (peakNow) {
    const hours = stats.topHours.map(formatHour12Wall).join(' and ');
    return (
      <View style={[styles.box, styles.boxWarning, style]} accessibilityRole="alert">
        <Ionicons name="warning" size={18} color={colors.warning} />
        <View style={styles.textWrap}>
          <Text style={styles.title}>
            {confidence === 'early' ? 'Possible peak time right now' : 'Peak boot time right now'}
          </Text>
          <Text style={styles.detail}>
            Reports here cluster around {hours}. Keep an eye on your timer.
          </Text>
        </View>
      </View>
    );
  }

  if (onlyWhenPeak) return null;

  const line = hasPattern
    ? formatPeakPatternSentence(stats.topHours, confidence)
    : fallbackHint?.trim() || null;
  if (!line) return null;

  const subline = hasPattern
    ? confidence === 'early'
      ? `Early signal, based on only ${stats.total} reports so far.`
      : `Based on ${stats.total} reports in the last 90 days.`
    : 'Community note until more app reports exist.';

  return (
    <View style={[styles.box, style]}>
      <Ionicons name="time-outline" size={18} color={colors.primary} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{line}</Text>
        <Text style={styles.detail}>{subline}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.infoTint,
      alignSelf: 'stretch',
    },
    boxWarning: {
      borderColor: colors.warning,
      backgroundColor: colors.warningLight,
    },
    textWrap: {
      flex: 1,
    },
    title: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
      lineHeight: 19,
    },
    detail: {
      fontSize: fontSize.xs,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      lineHeight: 16,
      marginTop: 2,
    },
  });
}
