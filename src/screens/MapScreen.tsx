import { useCallback, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BOOTWATCH_MARK = require('../../assets/android-icon-foreground.png');
import { useNavigation } from '@react-navigation/native';
import { complexes } from '../data/complexes';
import { Complex } from '../types/complex';
import { useSightings } from '../hooks/useSightings';
import { useSavedComplexes } from '../hooks/useSavedComplexes';
import { useHeatData, getHeatLevel, HEAT_COLORS, HEAT_LABELS } from '../hooks/useHeatData';
import ComplexDetailSheet from '../components/ComplexDetailSheet';
import ReportSightingModal from '../components/ReportSightingModal';
import { fontSize, fontWeight, spacing, borderRadius, shadowFloat, shadowCard, fonts } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { formatVisitorLimitMinutes } from '../utils/parkingDisplay';
import { VISITOR_LIMIT_LEGEND, getVisitorLimitMarkerColor } from '../utils/visitorLimitColors';

let NativeMap: any = null;
let WebMap: any = null;
if (Platform.OS === 'web') {
  WebMap = require('../components/WebMap').default;
} else {
  NativeMap = require('../components/NativeMap').default;
}

type MapMode = 'complexes' | 'heatmap';

export default function MapScreen() {
  const { colors } = useTheme();
  const { show: showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedComplex, setSelectedComplex] = useState<Complex | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('complexes');
  const [mapLegendExpanded, setMapLegendExpanded] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportInitialComplexId, setReportInitialComplexId] = useState<string | null>(null);
  const navigation = useNavigation<any>();
  const { getLatestSighting, error: sightingsError, refresh: refreshSightings } = useSightings();
  const { isSaved, toggle: toggleSave } = useSavedComplexes();
  const { getEntry, error: heatError, refresh: refreshHeat } = useHeatData();

  const filtered = useMemo(
    () => complexes.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  const heatColorOverrides = useMemo(() => {
    if (mapMode !== 'heatmap') return undefined;
    const map = new Map<string, string>();
    for (const c of filtered) {
      const entry = getEntry(c.id);
      map.set(c.id, HEAT_COLORS[getHeatLevel(entry.count)]);
    }
    return map;
  }, [mapMode, filtered, getEntry]);

  const handleMarkerPress = useCallback((complex: Complex) => {
    setSelectedComplex(complex);
    setSheetVisible(true);
    setPanelExpanded(false);
  }, []);

  const handleParkHere = useCallback(
    (complex: Complex) => {
      setSheetVisible(false);
      navigation.navigate('Timer', { complexId: complex.id });
    },
    [navigation],
  );

  const handleReportFromSheet = useCallback((complex: Complex) => {
    setSheetVisible(false);
    setReportInitialComplexId(complex.id);
    setReportVisible(true);
  }, []);

  const closeReportModal = useCallback(() => {
    setReportVisible(false);
    setReportInitialComplexId(null);
  }, []);

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Map fills the screen */}
      <View style={styles.mapWrapper}>
        {Platform.OS === 'web' && WebMap ? (
          <WebMap complexes={filtered} onMarkerPress={handleMarkerPress} colorOverrides={heatColorOverrides} />
        ) : NativeMap ? (
          <NativeMap complexes={filtered} onMarkerPress={handleMarkerPress} colorOverrides={heatColorOverrides} />
        ) : null}
      </View>

      {(sightingsError || heatError) && (
        <Pressable
          style={styles.errorBanner}
          onPress={() => { refreshSightings(); refreshHeat(true); }}
        >
          <Ionicons name="cloud-offline-outline" size={16} color={colors.textInverse} />
          <Text style={styles.errorBannerText}>Data unavailable — tap to retry</Text>
        </Pressable>
      )}

      {/* Search bar + mode toggle floating over map */}
      <View style={styles.searchOverlay}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search complexes..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={(text) => { setSearch(text); if (text) setPanelExpanded(true); }}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} onPress={() => setSearch('')} />
          )}
        </View>

        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeButton, mapMode === 'complexes' && styles.modeButtonActive]}
            onPress={() => setMapMode('complexes')}
          >
            <Ionicons
              name="business-outline"
              size={14}
              color={mapMode === 'complexes' ? colors.accent : colors.textSecondary}
            />
            <Text style={[styles.modeButtonText, mapMode === 'complexes' && styles.modeButtonTextActive]}>
              Complexes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mapMode === 'heatmap' && styles.modeButtonActive]}
            onPress={() => setMapMode('heatmap')}
          >
            <Ionicons name="flame-outline" size={14} color={mapMode === 'heatmap' ? colors.danger : colors.textSecondary} />
            <Text
              style={[styles.modeButtonText, mapMode === 'heatmap' && styles.modeButtonTextActive, styles.modeButtonTextWrap]}
              numberOfLines={2}
            >
              Booter activity
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Map key — visitor limits (complexes) or activity tiers (booter activity); collapsible */}
      <View style={styles.legend}>
        <Pressable
          style={styles.legendHeader}
          onPress={() => setMapLegendExpanded((e) => !e)}
          accessibilityRole="button"
          accessibilityLabel={mapLegendExpanded ? 'Hide map key' : 'Show map key'}
          accessibilityState={{ expanded: mapLegendExpanded }}
        >
          <Text style={styles.legendTitle}>
            {mapMode === 'heatmap' ? 'Last 30 days' : 'Visitor limit'}
          </Text>
          <Ionicons
            name={mapLegendExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>
        {mapLegendExpanded &&
          (mapMode === 'heatmap'
            ? (['high', 'moderate', 'low', 'none'] as const).map((level) => (
                <View key={level} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: HEAT_COLORS[level] }]} />
                  <Text style={styles.legendLabel}>{HEAT_LABELS[level]}</Text>
                </View>
              ))
            : VISITOR_LIMIT_LEGEND.map((row) => (
                <View key={row.label} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: row.color }]} />
                  <Text style={styles.legendLabel}>{row.label}</Text>
                </View>
              )))}
      </View>

      {/* Brand watermark — sits above the panel, fades when the apartment list opens */}
      {!panelExpanded && (
        <View style={styles.brandWatermark} pointerEvents="none">
          <Image source={BOOTWATCH_MARK} style={styles.brandWatermarkLogo} resizeMode="contain" />
          <View style={styles.brandWatermarkTextRow}>
            <Text style={styles.brandWatermarkText}>BootWatch</Text>
            <Text style={styles.brandWatermarkTm}>™</Text>
          </View>
        </View>
      )}

      {/* Collapsible bottom panel */}
      <View style={[styles.panel, panelExpanded && styles.panelExpanded]}>
        <Pressable style={styles.panelHandle} onPress={() => setPanelExpanded(!panelExpanded)}>
          <View style={styles.handleBar} />
          <View style={styles.panelHeaderRow}>
            <Text style={styles.panelTitle}>
              {filtered.length} Complex{filtered.length !== 1 ? 'es' : ''}
            </Text>
            <Ionicons
              name={panelExpanded ? 'chevron-down' : 'chevron-up'}
              size={20}
              color={colors.textSecondary}
            />
          </View>
        </Pressable>

        {panelExpanded && (
          <ScrollView style={styles.panelList} contentContainerStyle={styles.panelListContent}>
            {filtered.map((c) => {
              const heat = getEntry(c.id);
              const level = getHeatLevel(heat.count);
              const limitPin = getVisitorLimitMarkerColor(
                c.visitorTimeLimitMinutes,
                c.visitorLimitSignageKnown,
              );
              return (
                <Pressable key={c.id} style={styles.card} onPress={() => handleMarkerPress(c)}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardName}>{c.name}</Text>
                    {mapMode === 'heatmap' ? (
                      <View style={[styles.heatBadge, { backgroundColor: HEAT_COLORS[level] + '20' }]}>
                        <View style={[styles.heatBadgeDot, { backgroundColor: HEAT_COLORS[level] }]} />
                        <Text style={[styles.heatBadgeText, { color: HEAT_COLORS[level] }]}>
                          {heat.count} {heat.count === 1 ? 'report' : 'reports'}
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.limitBadge,
                          { borderColor: limitPin, backgroundColor: `${limitPin}22` },
                        ]}
                      >
                        <Text style={[styles.limitBadgeText, { color: limitPin }]}>
                          {formatVisitorLimitMinutes(c.visitorTimeLimitMinutes, c.visitorLimitSignageKnown)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardMeta}>
                    <View style={styles.cardMetaItem}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.cardMetaText}>
                        {formatVisitorLimitMinutes(c.visitorTimeLimitMinutes, c.visitorLimitSignageKnown)}
                      </Text>
                    </View>
                    {c.bootingCompany && (
                      <View style={styles.cardMetaItem}>
                        <Ionicons name="car-outline" size={14} color={colors.textSecondary} />
                        <Text style={styles.cardMetaText}>{c.bootingCompany}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ComplexDetailSheet
        complex={selectedComplex}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onParkHere={handleParkHere}
        onReport={handleReportFromSheet}
        lastSightingAt={
          selectedComplex
            ? (() => {
                const s = getLatestSighting(selectedComplex.id);
                return s ? new Date(s.created_at) : null;
              })()
            : null
        }
        isSaved={selectedComplex ? isSaved(selectedComplex.id) : false}
        onToggleSave={(c) => toggleSave(c.id)}
        sightingCount={selectedComplex ? getEntry(selectedComplex.id).count : 0}
      />

      <ReportSightingModal
        visible={reportVisible}
        onClose={closeReportModal}
        onSuccess={() => {
          refreshSightings();
          void refreshHeat(true);
          showToast({
            message: 'Thanks for the heads-up — others nearby will see it.',
            icon: 'heart',
          });
        }}
        initialComplexId={reportInitialComplexId}
      />
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapWrapper: {
    flex: 1,
  },

  // Search overlay
  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    padding: spacing.md,
  },
  brandWatermark: {
    position: 'absolute',
    bottom: 60,
    left: spacing.md,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  brandWatermarkLogo: {
    width: 42,
    height: 42,
  },
  brandWatermarkTextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  brandWatermarkText: {
    fontSize: fontSize.xl,
    fontFamily: fonts.displayBold,
    color: colors.text,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  brandWatermarkTm: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    color: colors.textSecondary,
    marginTop: 4,
    marginLeft: 2,
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadowFloat,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: colors.text,
    paddingVertical: 0,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    ...shadowCard,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  modeButtonTextActive: {
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  modeButtonTextWrap: {
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.2,
  },

  // Legend
  legend: {
    position: 'absolute',
    top: 120,
    right: spacing.md,
    zIndex: 10,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    maxWidth: 220,
    ...shadowFloat,
  },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 0,
    paddingVertical: 2,
  },
  legendTitle: {
    fontSize: fontSize.xs,
    fontFamily: fonts.display,
    color: colors.textSecondary,
    flex: 1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.text,
  },

  // Bottom panel
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: 80,
    borderTopWidth: 1,
    borderColor: colors.border,
    ...shadowFloat,
  },
  panelExpanded: {
    maxHeight: '55%',
  },
  panelHandle: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  panelTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.display,
    color: colors.text,
  },
  panelList: {
    flex: 1,
  },
  panelListContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },

  // Complex cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardName: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  heatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  heatBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heatBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  limitBadge: {
    maxWidth: '46%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  limitBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
    textAlign: 'right',
  },
  cardMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardMetaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  errorBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.danger,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  errorBannerText: {
    color: colors.textInverse,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
}
