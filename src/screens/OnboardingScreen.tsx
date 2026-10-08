import { useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, ViewToken } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { fontSize, spacing, borderRadius, shadowCard, fonts, type AppColors } from '../theme';

/** Full-color mark with transparent background (same as map watermark). */
const BOOTWATCH_LOGO = require('../../assets/android-icon-foreground.png');

const { width } = Dimensions.get('window');

interface Slide {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  title: string;
  subtitle: string;
  brandIcon?: boolean;
  features?: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; desc: string }[];
}

function getSlides(colors: AppColors): Slide[] {
  return [
    {
      id: '1',
      icon: 'shield-checkmark',
      iconColor: colors.accent,
      brandIcon: true,
      title: 'Welcome to BootWatch',
      subtitle:
        'The community-powered app that protects students from predatory parking enforcement in Rexburg.',
    },
    {
      id: '2',
      icon: 'bulb-outline',
      iconColor: colors.primary,
      title: 'How It Works',
      subtitle: 'Four tools built to keep your car safe:',
      features: [
        {
          icon: 'flame',
          label: 'Risk Heatmap',
          desc: 'A live map of every Rexburg complex: visitor limits, booting companies, and recent boot activity.',
        },
        {
          icon: 'timer',
          label: 'Smart Parking Timer',
          desc: 'Finds the complexes nearest you, counts down the visitor limit, and warns you before time runs out.',
        },
        {
          icon: 'analytics',
          label: 'Community Feed',
          desc: 'Real-time sightings from fellow students, with alerts when a booter is reported near you.',
        },
        {
          icon: 'trophy',
          label: 'Ranks & Reactions',
          desc: 'Earn points for every report, get thanked by people you helped, and climb the leaderboard.',
        },
      ],
    },
    {
      id: '3',
      icon: 'people',
      iconColor: colors.safe,
      title: 'Stronger Together',
      subtitle:
        'Report sightings, follow your complex, and help fellow students avoid getting booted. You can always post anonymously.',
    },
  ];
}

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { colors } = useTheme();
  const slides = useMemo(() => getSlides(colors), [colors]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // A horizontal list doesn't give its items a height, so without this a tall slide
  // is clipped at the bottom instead of scrolling.
  const [slideHeight, setSlideHeight] = useState<number | undefined>(undefined);
  const flatListRef = useRef<FlatList>(null);
  const styles = createStyles(colors);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const getItemLayout = (_: unknown, index: number) => ({
    length: width,
    offset: width * index,
    index,
  });

  function handleNext() {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      onComplete();
    }
  }

  function renderSlide({ item }: { item: Slide }) {
    return (
      <ScrollView
        style={[styles.slideScroll, slideHeight !== undefined && { height: slideHeight }]}
        contentContainerStyle={[styles.slide, item.features && styles.slideCompact]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {item.brandIcon ? (
          <Image
            source={BOOTWATCH_LOGO}
            style={styles.brandIcon}
            resizeMode="contain"
            accessibilityLabel="BootWatch"
          />
        ) : (
          // The feature slide skips the big icon so all of its boxes fit on one screen.
          !item.features && (
            <View style={[styles.iconCircle, { backgroundColor: item.iconColor + '22' }]}>
              <Ionicons name={item.icon} size={56} color={item.iconColor} />
            </View>
          )
        )}
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>

        {item.features && (
          <View style={styles.featureList}>
            {item.features.map((f) => (
              <View key={f.label} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Ionicons name={f.icon} size={22} color={colors.accent} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureLabel}>{f.label}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  const isLast = currentIndex === slides.length - 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setSlideHeight(e.nativeEvent.layout.height)}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        getItemLayout={getItemLayout}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
          ))}
        </View>

        <Pressable style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>{isLast ? 'Get Started' : 'Next'}</Text>
          <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={20} color={colors.textInverse} />
        </Pressable>

        {!isLast && (
          <Pressable style={styles.skipButton} onPress={onComplete}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    slideScroll: {
      width,
      flex: 1,
    },
    slide: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xl,
    },
    slideCompact: {
      paddingVertical: spacing.md,
    },
    brandIcon: {
      width: 150,
      height: 150,
      marginBottom: spacing.lg,
    },
    iconCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    slideTitle: {
      fontSize: fontSize.xxl,
      fontFamily: fonts.displayBold,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    slideSubtitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    featureList: {
      marginTop: spacing.lg,
      gap: spacing.sm,
      width: '100%',
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadowCard,
    },
    featureIcon: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.md,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureText: {
      flex: 1,
    },
    featureLabel: {
      fontSize: fontSize.md,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
    },
    featureDesc: {
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 18,
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
      alignItems: 'center',
      gap: spacing.md,
    },
    dots: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.accent,
      width: 24,
    },
    nextButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.md + 2,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
      width: '100%',
    },
    nextButtonText: {
      color: colors.textInverse,
      fontSize: fontSize.lg,
      fontFamily: fonts.display,
    },
    skipButton: {
      paddingVertical: spacing.sm,
    },
    skipText: {
      color: colors.textSecondary,
      fontSize: fontSize.sm,
      fontFamily: fonts.bodyMedium,
    },
  });
}
