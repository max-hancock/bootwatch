import { useEffect, useState, type CSSProperties } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { complexes } from '../data/complexes';
import { base64ToUint8Array } from '../utils/base64ToBytes';
import { ReportType } from '../types/sighting';
import { getVisitorLimitMarkerColor } from '../utils/visitorLimitColors';
import { fontSize, spacing, borderRadius, shadowFloat, fonts } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useReportCelebration } from '../context/ReportCelebrationContext';
import { snoozeReportPrompt } from '../hooks/useReportPrompt';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When set and the modal opens, pre-select this complex (e.g. opened from map apartment sheet). */
  initialComplexId?: string | null;
}

const TIME_OPTIONS = [
  { label: 'Just now', minutes: 0 },
  { label: '5 min ago', minutes: 5 },
  { label: '15 min ago', minutes: 15 },
  { label: '30 min ago', minutes: 30 },
  { label: '1 hour ago', minutes: 60 },
];

export default function ReportSightingModal({ visible, onClose, onSuccess, initialComplexId }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { celebrate } = useReportCelebration();
  const styles = createStyles(colors);
  const [reportType, setReportType] = useState<ReportType>('spotter');
  const [selectedComplexId, setSelectedComplexId] = useState<string | null>(null);
  const [timeOffset, setTimeOffset] = useState(0);
  const [complexSearch, setComplexSearch] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  useEffect(() => {
    if (visible && initialComplexId) {
      setSelectedComplexId(initialComplexId);
    }
  }, [visible, initialComplexId]);

  function clearPhoto() {
    setPhotoUri(null);
    setPhotoBase64(null);
    setPhotoMime(null);
  }

  async function promptPhotoSource() {
    if (Platform.OS === 'web') {
      // Web only supports library/file picker.
      void pickFromLibrary();
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) void pickFromCamera();
          if (index === 2) void pickFromLibrary();
        },
      );
      return;
    }

    Alert.alert('Add photo', 'How would you like to add a photo?', [
      { text: 'Take Photo', onPress: () => void pickFromCamera() },
      { text: 'Choose from Library', onPress: () => void pickFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function ensureCameraPermission(): Promise<boolean> {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) {
      Alert.alert(
        'Camera access needed',
        'Enable camera access for BootWatch in Settings to take a photo.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return false;
    }
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    return granted;
  }

  function applyAsset(asset: ImagePicker.ImagePickerAsset) {
    setPhotoUri(asset.uri);
    setPhotoBase64(asset.base64 ?? null);
    setPhotoMime(asset.mimeType ?? null);
  }

  async function pickFromCamera() {
    const ok = await ensureCameraPermission();
    if (!ok) return;
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: true,
      aspect: [4, 3],
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      applyAsset(result.assets[0]);
    }
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsEditing: true,
      aspect: [4, 3],
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      applyAsset(result.assets[0]);
    }
  }

  async function uploadPhoto(): Promise<{ url: string | null; reason?: string }> {
    try {
      const base64 = photoBase64;
      const uri = photoUri;
      if (!base64 && !uri) return { url: null, reason: 'no source' };

      const extFromUri = (uri?.split('.').pop() ?? '').toLowerCase().split('?')[0];
      const mime = photoMime
        ?? (extFromUri === 'png' ? 'image/png' : extFromUri === 'heic' ? 'image/heic' : 'image/jpeg');
      const ext = mime === 'image/png' ? 'png' : mime === 'image/heic' ? 'heic' : 'jpg';
      // Anonymous photos go under anon/ with a random name: the public URL is
      // stored on the sighting, so the usual <user id>/ folder would identify the poster.
      // Needs supabase/2026-10-04_anonymous_sighting_photo_paths.sql on the project.
      const fileName = isAnonymous
        ? `anon/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}.${ext}`
        : `${user!.id}/${Date.now()}.${ext}`;

      // expo-image-picker returns base64 directly when requested. This avoids
      // the broken `fetch(file://...).arrayBuffer()` path on iOS native, which
      // silently yields zero bytes for ph:// and some file:// URIs in release
      // builds. We decode the base64 with a pure-JS routine because Hermes's
      // global `atob` has historically been unreliable in release builds.
      let bytes: Uint8Array | null = null;
      if (base64) {
        bytes = base64ToUint8Array(base64);
      } else if (uri) {
        const response = await fetch(uri);
        const ab = await response.arrayBuffer();
        bytes = new Uint8Array(ab);
      }

      if (!bytes || bytes.byteLength === 0) {
        return { url: null, reason: 'empty bytes' };
      }

      const { error } = await supabase.storage
        .from('sighting-photos')
        .upload(fileName, bytes, { contentType: mime, upsert: false });

      if (error) {
        const reason = (error as any).message || (error as any).error || 'storage error';
        console.warn('[ReportSighting] upload error', error);
        return { url: null, reason };
      }

      const { data } = supabase.storage.from('sighting-photos').getPublicUrl(fileName);
      return { url: data.publicUrl };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[ReportSighting] upload threw', err);
      return { url: null, reason };
    }
  }

  async function handleSubmit() {
    if (!user) {
      if (Platform.OS === 'web') alert('Sign in to submit a report.');
      else Alert.alert('Sign in required', 'You need an account to post a sighting.');
      return;
    }
    if (!selectedComplexId) return;
    setSubmitting(true);

    const complex = complexes.find((c) => c.id === selectedComplexId)!;
    let photoUrl: string | null = null;

    let uploadReason: string | undefined;
    if (photoUri || photoBase64) {
      const result = await uploadPhoto();
      photoUrl = result.url;
      uploadReason = result.reason;
    }

    const sightingTime = new Date(Date.now() - timeOffset * 60 * 1000).toISOString();

    // user_id and created_at are enforced server-side (RLS + sightings_before_insert trigger).
    const { data: inserted, error } = await supabase
      .from('sightings')
      .insert({
        complex_id: selectedComplexId,
        latitude: complex.latitude,
        longitude: complex.longitude,
        photo_url: photoUrl,
        report_type: reportType,
        is_anonymous: isAnonymous,
        created_at: sightingTime,
      })
      .select('id')
      .single();

    setSubmitting(false);

    if (error) {
      console.error('[ReportSighting] insert failed', error);
      const fk =
        error.code === '23503' ||
        /complex_id|complexes|foreign key/i.test(error.message ?? '');
      const hint = fk
        ? 'Your Supabase `complexes` table is missing this property ID. In the Supabase SQL Editor, run `supabase/sync_complexes_from_app.sql` (regenerate with `node scripts/generate-complexes.mjs`), then try again.'
        : '';
      const body = [hint, error.message].filter(Boolean).join('\n\n');
      if (Platform.OS === 'web') alert(`Could not submit report.\n\n${body}`);
      else Alert.alert('Could not submit report', body || 'Please try again.');
    } else {
      // Resolves to how many people were pushed an alert, for the celebration.
      // Null when unknown — e.g. the DB webhook dispatched first and this call was deduped.
      const alerted: Promise<number | null> = inserted?.id
        ? supabase.functions
            .invoke('notify-sighting', {
              body: {
                type: 'INSERT',
                table: 'sightings',
                schema: 'public',
                record: { id: inserted.id },
                old_record: null,
              },
            })
            .then(({ data, error: invErr }) => {
              if (invErr) {
                console.warn('[ReportSighting] notify-sighting', invErr.message);
                return null;
              }
              return typeof data?.sent === 'number' ? (data.sent as number) : null;
            })
            .catch((e) => {
              console.warn('[ReportSighting] notify-sighting', e);
              return null;
            })
        : Promise.resolve(null);
      celebrate({ reportType, alerted });
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      snoozeReportPrompt();
      const hadPhotoFailure =(!!photoUri || !!photoBase64) && !photoUrl;
      const failureReason = uploadReason;
      setReportType('spotter');
      setSelectedComplexId(null);
      setTimeOffset(0);
      setIsAnonymous(false);
      setComplexSearch('');
      clearPhoto();
      onSuccess();
      onClose();
      if (hadPhotoFailure) {
        // Use a blocking alert so the real reason is impossible to miss while we
        // are still debugging the upload pipeline.
        const body = failureReason
          ? `Reason: ${failureReason}`
          : 'No reason returned.';
        if (Platform.OS === 'web') {
          alert(`Report saved, but photo upload failed.\n\n${body}`);
        } else {
          Alert.alert('Photo upload failed', `Report saved.\n\n${body}`);
        }
      }
    }
  }

  function handleClose() {
    setReportType('spotter');
    setSelectedComplexId(null);
    setTimeOffset(0);
    setIsAnonymous(false);
    setComplexSearch('');
    clearPhoto();
    onClose();
  }

  const filteredComplexes = complexSearch.trim()
    ? complexes.filter((c) => c.name.toLowerCase().includes(complexSearch.toLowerCase()))
    : complexes;

  return (
    <>
    {photoWarning && (
      <View style={styles.photoWarning}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={styles.photoWarningText}>{photoWarning}</Text>
        <Pressable onPress={() => setPhotoWarning(null)} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    )}
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      {/* Backdrop + sheet as siblings: nested Pressables swallow/bubble taps badly on web */}
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} accessibilityLabel="Close report" />
        <View style={styles.sheet}>
          <View style={styles.accentStrip} />
          <ScrollView
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator
            contentContainerStyle={styles.sheetScrollContent}
            nestedScrollEnabled
          >
            <View style={styles.handle} />
            <Text style={styles.title}>Report</Text>
            <Text style={styles.subtitle}>What happened?</Text>

            <View style={styles.typeRow}>
              <Pressable
                style={[styles.typeOption, reportType === 'spotter' && styles.typeOptionSelected]}
                onPress={() => setReportType('spotter')}
              >
                <Ionicons name="eye-outline" size={22} color={reportType === 'spotter' ? colors.warning : colors.textSecondary} />
                <Text style={[styles.typeLabel, reportType === 'spotter' && styles.typeLabelSelected]}>
                  Spotted a boot truck
                </Text>
              </Pressable>
              <Pressable
                style={[styles.typeOption, reportType === 'booted' && styles.typeOptionBooted]}
                onPress={() => setReportType('booted')}
              >
                <Ionicons name="lock-closed-outline" size={22} color={reportType === 'booted' ? colors.danger : colors.textSecondary} />
                <Text style={[styles.typeLabel, reportType === 'booted' && styles.typeLabelBooted]}>
                  I got booted
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Where?</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search complexes..."
                placeholderTextColor={colors.textSecondary}
                value={complexSearch}
                onChangeText={setComplexSearch}
                autoCorrect={false}
              />
              {complexSearch.length > 0 && (
                <Pressable onPress={() => setComplexSearch('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>

            <ScrollView
              style={styles.complexListBox}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {filteredComplexes.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.item, selectedComplexId === c.id && styles.itemSelected]}
                  onPress={() => setSelectedComplexId(c.id)}
                >
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: getVisitorLimitMarkerColor(
                          c.visitorTimeLimitMinutes,
                          c.visitorLimitSignageKnown,
                        ),
                      },
                    ]}
                  />
                  <Text style={styles.itemText}>{c.name}</Text>
                  {selectedComplexId === c.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.sectionLabel}>When did you see it?</Text>
            <View style={styles.timeRow}>
              {TIME_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.minutes}
                  style={[styles.timeChip, timeOffset === opt.minutes && styles.timeChipSelected]}
                  onPress={() => setTimeOffset(opt.minutes)}
                >
                  <Text style={[styles.timeChipText, timeOffset === opt.minutes && styles.timeChipTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.anonRow} onPress={() => setIsAnonymous((v) => !v)}>
              <View style={styles.anonLabel}>
                <Ionicons name="shield-checkmark-outline" size={20} color={isAnonymous ? colors.primary : colors.textSecondary} />
                <View>
                  <Text style={styles.anonTitle}>Post anonymously</Text>
                  <Text style={styles.anonSubtitle}>Your name won't appear on this report</Text>
                </View>
              </View>
              <View style={[styles.toggle, isAnonymous && styles.toggleActive]}>
                <View style={[styles.toggleThumb, isAnonymous && styles.toggleThumbActive]} />
              </View>
            </Pressable>

            <Pressable style={styles.photoButton} onPress={() => void promptPhotoSource()}>
              {photoUri ? (
                <View>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  <Pressable
                    style={styles.photoRemove}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      clearPhoto();
                    }}
                    hitSlop={8}
                    accessibilityLabel="Remove photo"
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
                  <Text style={styles.photoPlaceholderText}>Add photo (optional)</Text>
                </View>
              )}
            </Pressable>

            {!selectedComplexId && (
              <Text style={styles.submitHint}>Select a complex above to enable submit.</Text>
            )}

            <ReportSightingSubmitButton
              styles={styles}
              colors={colors}
              disabled={!selectedComplexId || submitting}
              submitting={submitting}
              onSubmit={() => void handleSubmit()}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}

function createStyles(colors: import('../theme').AppColors) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '85%',
    width: '100%',
    zIndex: 1,
    elevation: 24,
    overflow: 'hidden',
    ...shadowFloat,
  },
  accentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.accent,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    zIndex: 2,
  },
  sheetScrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    gap: 0,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.displayBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'web' ? spacing.sm : spacing.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: colors.text,
    outlineStyle: 'none' as any,
  },
  complexListBox: {
    maxHeight: 180,
    marginBottom: spacing.md,
    ...(Platform.OS === 'web'
      ? { overflow: 'hidden' as const, borderRadius: borderRadius.md }
      : {}),
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  itemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.infoTint,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  itemText: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeOptionSelected: {
    borderColor: colors.warning,
    backgroundColor: colors.warningLight,
  },
  typeOptionBooted: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  typeLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
  },
  typeLabelSelected: {
    color: colors.warning,
    fontFamily: fonts.bodyMedium,
  },
  typeLabelBooted: {
    color: colors.danger,
    fontFamily: fonts.bodyMedium,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  timeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.infoTint,
  },
  timeChipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
  },
  timeChipTextSelected: {
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
  },
  anonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    cursor: 'pointer' as any,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  anonLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  anonTitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
  },
  anonSubtitle: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginTop: 1,
  },
  photoButton: {
    marginBottom: spacing.md,
  },
  photoPreview: {
    width: '100%',
    height: 120,
    borderRadius: borderRadius.md,
  },
  photoRemove: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholder: {
    width: '100%',
    height: 80,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  photoPlaceholderText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
  },
  submitWrap: {
    zIndex: 50,
    elevation: 50,
    width: '100%',
  },
  submitButton: {
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    minHeight: 48,
    width: '100%',
  },
  submitButtonDisabled: {
    opacity: 0.4,
    ...(Platform.OS === 'web' ? { cursor: 'not-allowed' as any } : {}),
  },
  submitHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  submitButtonText: {
    color: colors.textInverse,
    fontSize: fontSize.lg,
    fontFamily: fonts.display,
  },
  photoWarning: {
    position: 'absolute',
    bottom: 80,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    zIndex: 100,
  },
  photoWarningText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
  },
});
}

type ReportModalStyles = ReturnType<typeof createStyles>;

function ReportSightingSubmitButton({
  styles,
  colors,
  disabled,
  submitting,
  onSubmit,
}: {
  styles: ReportModalStyles;
  colors: import('../theme').AppColors;
  disabled: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  if (Platform.OS === 'web') {
    const flat = StyleSheet.flatten([styles.submitButton, disabled && styles.submitButtonDisabled]);
    const webStyle: CSSProperties = {
      ...(flat as CSSProperties),
      width: '100%',
      borderStyle: 'solid',
      borderWidth: 0,
      cursor: disabled ? 'not-allowed' : 'pointer',
      WebkitTapHighlightColor: 'transparent',
    };
    return (
      <View style={styles.submitWrap}>
        <button
          type="button"
          disabled={disabled}
          style={webStyle}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) onSubmit();
          }}
        >
          {submitting ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <>
              <Ionicons name="alert-circle" size={20} color={colors.textInverse} />
              <Text style={styles.submitButtonText}>Report Sighting</Text>
            </>
          )}
        </button>
      </View>
    );
  }

  return (
    <View style={styles.submitWrap}>
      <Pressable
        style={[styles.submitButton, disabled && styles.submitButtonDisabled]}
        onPress={onSubmit}
        disabled={disabled}
        accessibilityState={{ disabled }}
      >
        {submitting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            <Ionicons name="alert-circle" size={20} color={colors.textInverse} />
            <Text style={styles.submitButtonText}>Report Sighting</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
