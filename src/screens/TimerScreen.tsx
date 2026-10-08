import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useRoute } from '@react-navigation/native';
import { complexes, CUSTOM_TIMER_ID, getComplexById } from '../data/complexes';
import { useParkingTimer, TimerPhase } from '../hooks/useParkingTimer';
import { formatDistance, useNearestComplexes } from '../hooks/useNearestComplexes';
import { Complex } from '../types/complex';
import BootPatternNote from '../components/BootPatternNote';
import { fontSize, spacing, borderRadius, fonts } from '../theme';
import { useTheme } from '../context/ThemeContext';
import ScreenGradientBackdrop from '../components/ScreenGradientBackdrop';
import { formatVisitorLimitMinutes } from '../utils/parkingDisplay';
import { getVisitorLimitMarkerColor } from '../utils/visitorLimitColors';

/** Quick picks when a complex has no posted visitor limit to count down from. */
const OWN_TIME_OPTIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function TimerScreen() {
  const { colors } = useTheme();
  const route = useRoute<any>();
  const timer = useParkingTimer();

  const PHASE_COLORS: Record<TimerPhase, string> = {
    idle: colors.primary,
    running: colors.safe,
    warning: colors.warning,
    critical: colors.danger,
    expired: colors.danger,
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [showPushExplainer, setShowPushExplainer] = useState(false);
  const [search, setSearch] = useState('');
  /** Minutes the user chose themselves, for a complex with no posted visitor limit. */
  const [ownMinutes, setOwnMinutes] = useState('');

  // Look up the closest complexes whenever the setup screen is on show, so someone
  // who has just parked can pick theirs without searching.
  const isFocused = useIsFocused();
  const nearest = useNearestComplexes(isFocused && !timer.isRunning && timer.phase !== 'expired');

  useFocusEffect(
    useCallback(() => {
      setShowPushExplainer(timer.permissionStatus === 'granted');
    }, [timer.permissionStatus]),
  );

  useEffect(() => {
    const onSetup = !timer.isRunning && timer.phase !== 'expired';
    if (onSetup && timer.permissionStatus === 'granted') {
      setShowPushExplainer(true);
    }
  }, [timer.isRunning, timer.phase, timer.permissionStatus]);

  const dismissPushExplainer = useCallback(() => {
    setShowPushExplainer(false);
  }, []);

  // Handle "Park Here" navigation from MapScreen
  useEffect(() => {
    const complexId = route.params?.complexId;
    if (complexId && timer.phase === 'idle') {
      setSelectedId(complexId);
      setShowSelector(false);
    }
  }, [route.params?.complexId, timer.phase]);

  useEffect(() => {
    if (timer.activeComplexId && selectedId == null) {
      setSelectedId(timer.activeComplexId);
    }
  }, [timer.activeComplexId, selectedId]);

  const selectedComplex = useMemo(
    () => (selectedId && selectedId !== CUSTOM_TIMER_ID ? getComplexById(selectedId) : null),
    [selectedId],
  );

  const activeDisplayComplex = useMemo(() => {
    const id = selectedId && selectedId !== CUSTOM_TIMER_ID ? selectedId : timer.activeComplexId;
    if (!id) return null;
    return getComplexById(id) ?? null;
  }, [selectedId, timer.activeComplexId]);

  // Unlimited or unknown visitor limit: there is nothing to count down from, so the
  // user sets their own time (and still gets area alerts for that complex).
  const needsOwnTime = !!selectedComplex && !((selectedComplex.visitorTimeLimitMinutes ?? 0) > 0);

  useEffect(() => {
    setOwnMinutes('');
  }, [selectedId]);

  const durationMinutes = useMemo(() => {
    const typed = selectedId === CUSTOM_TIMER_ID ? customMinutes : needsOwnTime ? ownMinutes : null;
    if (typed !== null) {
      const parsed = parseInt(typed, 10);
      return isNaN(parsed) || parsed <= 0 ? 0 : parsed;
    }
    return selectedComplex?.visitorTimeLimitMinutes ?? 0;
  }, [selectedId, selectedComplex, customMinutes, needsOwnTime, ownMinutes]);

  const filteredComplexes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? complexes.filter((c) => c.name.toLowerCase().includes(q)) : complexes;
  }, [search]);

  const pickComplex = useCallback((id: string) => {
    setSelectedId(id);
    setShowSelector(false);
    setSearch('');
  }, []);

  const canStart = durationMinutes > 0 && !timer.isRunning && timer.phase !== 'expired';

  const handleStart = useCallback(() => {
    if (canStart) {
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const complexId = selectedId !== CUSTOM_TIMER_ID ? selectedId ?? undefined : undefined;
      timer.start(durationMinutes, complexId, needsOwnTime);
    }
  }, [canStart, durationMinutes, selectedId, timer, needsOwnTime]);

  const phaseColor = PHASE_COLORS[timer.phase];

  const styles = createStyles(colors);
  const tickAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const shouldPulse =
      timer.isRunning && (timer.phase === 'running' || timer.phase === 'warning' || timer.phase === 'critical');
    if (!shouldPulse) {
      tickAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(tickAnim, { toValue: 1.02, duration: 900, useNativeDriver: true }),
        Animated.timing(tickAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [timer.isRunning, timer.phase, tickAnim]);

  // ─── Active Timer View ───
  // One fixed screen, no scrolling: the timer, typical boot times, one
  // notification line, and the leave button.
  if (timer.isRunning || timer.phase === 'expired') {
    const notificationsOn = timer.permissionStatus === 'granted';
    const overLimit =
      timer.phase === 'expired' && timer.parkingOverLimit && !!(timer.activeComplexId || activeDisplayComplex);
    // The complex has no posted limit, so the countdown was a time the user set themselves.
    const selfSet = !!activeDisplayComplex && !((activeDisplayComplex.visitorTimeLimitMinutes ?? 0) > 0);
    return (
      <ScreenGradientBackdrop>
      <View style={styles.timerActive}>
        {activeDisplayComplex && (
          <View style={styles.activeComplexInfo}>
            <Text style={styles.activeComplexName}>{activeDisplayComplex.name}</Text>
          </View>
        )}
        {selectedId === CUSTOM_TIMER_ID && !activeDisplayComplex && (
          <Text style={styles.activeComplexName}>Custom Timer</Text>
        )}

        <Animated.Text
          style={[styles.countdown, { color: phaseColor, transform: [{ scale: tickAnim }] }]}
        >
          {formatTime(timer.remainingSeconds)}
        </Animated.Text>

        <Text style={[styles.phaseLabel, { color: phaseColor }]}>
          {timer.phase === 'running' && "You're good \u2014 timer running"}
          {timer.phase === 'warning' && "Heads up \u2014 under 10 minutes"}
          {timer.phase === 'critical' &&
            (selfSet ? 'Under 5 minutes left on your timer' : "Move now \u2014 under 5 minutes!")}
          {timer.phase === 'expired' &&
            (selfSet
              ? "Your timer is done. You’ll still get area alerts until you’ve left. Tap I’ve left when you go."
              : overLimit
                ? "Visitor time is up. You’ll still get area alerts until you’ve left. Tap I’ve left when you go."
                : "Time is up \u2014 move your car!")}
        </Text>

        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              {
                backgroundColor: phaseColor,
                width:
                  timer.totalSeconds > 0
                    ? `${Math.min(100, Math.max(0, (timer.remainingSeconds / timer.totalSeconds) * 100))}%`
                    : '0%',
              },
            ]}
          />
        </View>

        {activeDisplayComplex && timer.phase !== 'expired' && (
          <BootPatternNote
            complexId={activeDisplayComplex.id}
            fallbackHint={activeDisplayComplex.peakActivityHint}
            style={styles.patternNoteActive}
          />
        )}

        {/* The one notification line. When notifications are off it is a button to Settings. */}
        <Pressable
          disabled={notificationsOn || Platform.OS === 'web'}
          onPress={() => void Linking.openSettings()}
          style={[styles.notifRow, !notificationsOn && styles.notifRowOff]}
          accessibilityRole={notificationsOn ? 'text' : 'button'}
        >
          <Ionicons
            name={notificationsOn ? 'notifications' : 'notifications-off'}
            size={16}
            color={notificationsOn ? colors.primary : colors.warning}
          />
          <Text style={styles.notifRowText} numberOfLines={2}>
            {notificationsOn
              ? 'Alerts on for low time and nearby booter reports'
              : Platform.OS === 'web'
                ? "Notifications are off, so you won't get alerts"
                : 'Notifications are off. Tap to turn on alerts.'}
          </Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={timer.cancel}>
          <Ionicons name="stop-circle-outline" size={22} color={colors.danger} />
          <Text style={styles.cancelButtonText}>
            {overLimit ? "I've left" : timer.phase === 'expired' ? 'Dismiss' : "I'm Leaving"}
          </Text>
        </Pressable>
      </View>
      </ScreenGradientBackdrop>
    );
  }

  const renderComplexRow = (c: Complex, meters?: number) => (
    <Pressable
      key={meters === undefined ? c.id : `near-${c.id}`}
      style={[styles.selectorItem, selectedId === c.id && styles.selectorItemActive]}
      onPress={() => pickComplex(c.id)}
    >
      <View
        style={[
          styles.riskDot,
          { backgroundColor: getVisitorLimitMarkerColor(c.visitorTimeLimitMinutes, c.visitorLimitSignageKnown) },
        ]}
      />
      <View style={styles.selectorItemContent}>
        <Text style={styles.selectorItemText} numberOfLines={2} ellipsizeMode="tail">
          {c.name}
        </Text>
        <Text style={styles.selectorItemMeta}>
          {formatVisitorLimitMinutes(c.visitorTimeLimitMinutes, c.visitorLimitSignageKnown)}
          {meters !== undefined ? ` · ${formatDistance(meters)} away` : ''}
        </Text>
      </View>
    </Pressable>
  );

  // ─── Setup View ───
  return (
    <ScreenGradientBackdrop>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.setupContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Start a Parking Timer</Text>
      <Text style={styles.subheading}>Select where you're parked</Text>

      {showPushExplainer && (
        <View style={styles.pushExplainerRow}>
          <Ionicons name="notifications-outline" size={18} color={colors.primary} />
          <Text style={styles.pushExplainerText} numberOfLines={2}>
            We’ll alert you for low time and nearby booter reports.
          </Text>
          <Pressable
            onPress={dismissPushExplainer}
            accessibilityLabel="Dismiss notification info"
            hitSlop={12}
            style={styles.pushExplainerClose}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {/* Selected complex preview */}
      {selectedComplex && !showSelector && (
        <Pressable style={styles.selectedCard} onPress={() => setShowSelector(true)}>
          <View style={styles.selectedCardHeader}>
            <Text style={styles.selectedCardName} numberOfLines={2} ellipsizeMode="tail">
              {selectedComplex.name}
            </Text>
          </View>
          <Text style={styles.selectedCardDetail}>
            {formatVisitorLimitMinutes(
              selectedComplex.visitorTimeLimitMinutes,
              selectedComplex.visitorLimitSignageKnown,
            )}
            {' · '}
            {selectedComplex.bootingCompany ?? 'No boot company'}
          </Text>
          <Text style={styles.changeText}>Tap to change</Text>
        </Pressable>
      )}

      {/* When boot trucks usually show up here, right as they decide to park */}
      {selectedComplex && !showSelector && (
        <BootPatternNote
          complexId={selectedComplex.id}
          fallbackHint={selectedComplex.peakActivityHint}
          style={styles.patternNoteSetup}
        />
      )}

      {/* No posted limit: let them set their own time instead of a dead Start button */}
      {needsOwnTime && selectedComplex && !showSelector && (
        <View style={styles.customTimerCard}>
          <Text style={styles.ownTimeTitle}>How long are you staying?</Text>
          <Text style={styles.ownTimeHint}>
            {selectedComplex.visitorLimitSignageKnown === false
              ? "We don't have the visitor limit for this complex yet. Check the sign, then set your own timer."
              : 'No visitor time limit is posted here. Set a timer anyway to get booter alerts while you are parked.'}
          </Text>
          <View style={styles.ownTimeChips}>
            {OWN_TIME_OPTIONS.map((opt) => {
              const active = ownMinutes === String(opt.minutes);
              return (
                <Pressable
                  key={opt.minutes}
                  onPress={() => setOwnMinutes(String(opt.minutes))}
                  style={[styles.ownTimeChip, active && styles.ownTimeChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.ownTimeChipText, active && styles.ownTimeChipTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.customInputRow}>
            <TextInput
              style={styles.customInput}
              value={ownMinutes}
              onChangeText={setOwnMinutes}
              placeholder="60"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={3}
              accessibilityLabel="Minutes"
            />
            <Text style={styles.customInputLabel}>minutes</Text>
          </View>
        </View>
      )}

      {/* Custom timer preview */}
      {selectedId === CUSTOM_TIMER_ID && !showSelector && (
        <View style={styles.customTimerCard}>
          <Text style={styles.selectedCardName}>Custom Timer</Text>
          <View style={styles.customInputRow}>
            <TextInput
              style={styles.customInput}
              value={customMinutes}
              onChangeText={setCustomMinutes}
              placeholder="30"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={styles.customInputLabel}>minutes</Text>
          </View>
          <Pressable onPress={() => setShowSelector(true)}>
            <Text style={styles.changeText}>Select a complex instead</Text>
          </Pressable>
        </View>
      )}

      {/* Complex selector */}
      {(showSelector || !selectedId) && (
        <View style={styles.selectorList}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search complexes..."
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Closest complexes first, from GPS. Hidden while searching. */}
          {search.trim().length === 0 && nearest.length > 0 && (
            <>
              <Text style={styles.selectorSectionLabel}>Nearest to you</Text>
              {nearest.map((n) => renderComplexRow(n.complex, n.meters))}
              <Text style={styles.selectorSectionLabel}>All complexes</Text>
            </>
          )}

          {search.trim().length === 0 && (
            <Pressable
              style={[styles.selectorItem, selectedId === CUSTOM_TIMER_ID && styles.selectorItemActive]}
              onPress={() => pickComplex(CUSTOM_TIMER_ID)}
            >
              <Ionicons name="create-outline" size={20} color={colors.primary} />
              <Text style={styles.selectorItemText}>Custom Timer</Text>
            </Pressable>
          )}

          {filteredComplexes.map((c) => renderComplexRow(c))}

          {filteredComplexes.length === 0 && (
            <Text style={styles.selectorEmpty}>No complexes match "{search.trim()}".</Text>
          )}
        </View>
      )}

      {/* Duration summary + Start button */}
      {selectedId && !showSelector && (
        <View style={styles.startSection}>
          <Text style={styles.durationSummary}>
            Timer: {durationMinutes > 0 ? formatVisitorLimitMinutes(durationMinutes) : 'Choose how long above'}
          </Text>
          <Pressable
            style={[styles.startButton, !canStart && styles.startButtonDisabled]}
            onPress={handleStart}
            disabled={!canStart}
          >
            <Ionicons name="timer" size={22} color={colors.textInverse} />
            <Text style={styles.startButtonText}>Start Timer</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
    </ScreenGradientBackdrop>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  setupContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heading: {
    fontSize: fontSize.xxl,
    fontFamily: fonts.displayBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subheading: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  pushExplainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.infoTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pushExplainerText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  pushExplainerClose: {
    padding: spacing.xs,
    marginRight: -spacing.xs,
  },

  // Selected complex card
  selectedCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  selectedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  selectedCardName: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.lg,
    fontFamily: fonts.display,
    color: colors.text,
  },
  patternNoteSetup: {
    marginBottom: spacing.md,
  },
  patternNoteActive: {
    maxWidth: 400,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 400,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  notifRowOff: {
    borderColor: colors.warning,
    backgroundColor: colors.warningLight,
  },
  notifRowText: {
    flexShrink: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.text,
  },
  selectedCardDetail: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  changeText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    color: colors.primary,
  },

  // Custom timer card
  customTimerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.xl,
    fontFamily: fonts.displayBold,
    color: colors.text,
    width: 80,
    textAlign: 'center',
  },
  customInputLabel: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: colors.textSecondary,
  },

  ownTimeTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
  },
  ownTimeHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  ownTimeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ownTimeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  ownTimeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.infoTint,
  },
  ownTimeChipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
  },
  ownTimeChipTextActive: {
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: colors.text,
    outlineStyle: 'none' as any,
  },
  selectorSectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
  selectorEmpty: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  // Selector list
  selectorList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  selectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  selectorItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.infoTint,
  },
  selectorItemContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectorItemText: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
  },
  selectorItemMeta: {
    flexShrink: 0,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
  },
  riskDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Start section
  startSection: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  durationSummary: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  startButtonDisabled: {
    opacity: 0.4,
  },
  startButtonText: {
    color: colors.textInverse,
    fontSize: fontSize.lg,
    fontFamily: fonts.display,
  },

  // Active timer
  timerActive: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  activeComplexInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeComplexName: {
    fontSize: fontSize.lg,
    fontFamily: fonts.display,
    color: colors.text,
  },
  countdown: {
    fontSize: fontSize.display,
    fontFamily: fonts.displayBold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  phaseLabel: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  progressBarTrack: {
    width: '80%',
    height: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelButtonText: {
    color: colors.danger,
    fontSize: fontSize.lg,
    fontFamily: fonts.bodyMedium,
  },

  // Permission banner
});
}
