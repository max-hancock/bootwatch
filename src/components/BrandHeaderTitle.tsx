import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { fontSize, fonts } from '../theme';

const BOOTWATCH_LOGO = require('../../assets/splash-icon.png');

/** Same soft white glow the wordmark had on the old map watermark. */
const WORDMARK_GLOW = 'rgba(255,255,255,0.9)';

/**
 * Logo + glowing "BootWatch™" wordmark for the navigation header, with the
 * screen name beside it. Puts the brand in every screenshot without taking any
 * room away from the content below.
 */
export default function BrandHeaderTitle({ section }: { section: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.root} accessibilityRole="header" accessibilityLabel={`BootWatch ${section}`}>
      <Image source={BOOTWATCH_LOGO} style={styles.logo} resizeMode="contain" />
      <View style={styles.wordmarkRow}>
        <Text style={[styles.wordmark, { color: colors.text }]}>BootWatch</Text>
        <Text style={[styles.tm, { color: colors.textSecondary }]}>™</Text>
      </View>
      <Text style={[styles.section, { color: colors.accent }]}>{section}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Oversized with negative margins: the artwork has transparent padding around the binoculars.
  logo: {
    width: 52,
    height: 52,
    marginVertical: -4,
    marginLeft: -6,
    marginRight: -2,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  wordmark: {
    fontSize: fontSize.xl,
    fontFamily: fonts.displayBold,
    letterSpacing: 0.3,
    textShadowColor: WORDMARK_GLOW,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  tm: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    marginTop: 4,
    marginLeft: 2,
    textShadowColor: WORDMARK_GLOW,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  section: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 6,
    marginLeft: 8,
  },
});
