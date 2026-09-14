import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { complexes } from '../data/complexes';
import { useSavedComplexes } from '../hooks/useSavedComplexes';
import { AVATAR_COLORS, DEFAULT_AVATAR_COLOR } from '../utils/avatarColors';
import { base64ToArrayBuffer } from '../utils/base64ToBytes';
import { fontSize, spacing, borderRadius, shadowCard, fonts, type AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const DISPLAY_NAME_CHANGES_PER_WEEK = 2;
const DISPLAY_NAME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 30;
// Mirror of the server-side charset rule in validate_display_name().
const DISPLAY_NAME_ALLOWED_RE = /^[A-Za-z0-9 '._-]+$/;

function friendlyDisplayNameError(error: { message?: string; code?: string }): string {
  const msg = error.message ?? '';
  const code = (error as { code?: string }).code ?? '';
  if (msg.includes('display_name_change_limit_reached')) {
    return 'You can only change your display name 2 times per week.';
  }
  if (msg.includes('display_name_reserved')) {
    return 'That name is reserved. Please choose another.';
  }
  if (msg.includes('display_name_banned')) {
    return "That name isn't allowed. Please choose another.";
  }
  if (msg.includes('display_name_invalid_characters')) {
    return "Only letters, numbers, spaces, and ' . - _ are allowed.";
  }
  if (msg.includes('display_name_too_short')) {
    return `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters.`;
  }
  if (msg.includes('display_name_too_long')) {
    return `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`;
  }
  if (code === '23505' || /profiles_display_name_ci_unique|duplicate key/i.test(msg)) {
    return 'That name is already taken. Please choose another.';
  }
  return error.message || 'Could not update display name.';
}

interface Profile {
  display_name: string | null;
  saved_complexes: string[];
  avatar_color: string | null;
  avatar_url: string | null;
  display_name_change_history: string[] | null;
}

// Allowed avatar formats. Keep GIF in the list so users can use animated
// avatars, but enforce a size cap below so egress stays bounded.
const ALLOWED_AVATAR_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'] as const;
type AllowedAvatarExt = (typeof ALLOWED_AVATAR_EXTS)[number];

// 2 MB client-side cap. Matches the bucket-level limit in
// `supabase/storage_setup.sql`; we check both so users get a friendly
// message before the upload round-trip and the server still rejects if the
// client check is bypassed.
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const MIME_TO_EXT: Record<string, AllowedAvatarExt> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
};

// Path in the storage bucket: {user.id}/avatar-{ts}.{ext}. Keeping file names
// per-upload (rather than overwriting a fixed name) sidesteps CDN cache issues
// that otherwise make changes look like they didn't take.
//
// Prefer the mime type from the picker (reliable) and fall back to the URI
// extension (unreliable on blob: URLs from web). If neither identifies a
// supported format we return null so the caller can reject the upload; that
// keeps unknown formats from landing in the bucket with a wrong content-type.
function buildAvatarPath(
  userId: string,
  uri: string,
  mimeType: string | undefined,
): { path: string; contentType: string } | null {
  const fromMime = mimeType ? MIME_TO_EXT[mimeType.toLowerCase()] : undefined;
  const rawExt = (uri.split('?')[0].split('.').pop() ?? '').toLowerCase();
  const fromExt = (ALLOWED_AVATAR_EXTS as readonly string[]).includes(rawExt)
    ? (rawExt as AllowedAvatarExt)
    : undefined;
  const ext = fromMime ?? fromExt;
  if (!ext) return null;
  const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return { path: `${userId}/avatar-${Date.now()}.${ext}`, contentType };
}

// Parse a public-URL back to the storage path so we can delete the old file
// when the user replaces or removes their photo.
function extractAvatarStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = '/storage/v1/object/public/avatars/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.substring(idx + marker.length));
}

function recentChangeTimestamps(history: string[] | null | undefined): number[] {
  if (!history) return [];
  const cutoff = Date.now() - DISPLAY_NAME_WINDOW_MS;
  return history
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t) && t > cutoff)
    .sort((a, b) => a - b);
}

function nextAvailableChange(history: string[] | null | undefined): Date | null {
  const recent = recentChangeTimestamps(history);
  if (recent.length < DISPLAY_NAME_CHANGES_PER_WEEK) return null;
  const oldestInWindow = recent[recent.length - DISPLAY_NAME_CHANGES_PER_WEEK];
  return new Date(oldestInWindow + DISPLAY_NAME_WINDOW_MS);
}

export default function ProfileScreen() {
  const { colors, mode, setMode } = useTheme();
  const { user, signOut, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(DEFAULT_AVATAR_COLOR);
  const [saving, setSaving] = useState(false);
  const [nearbyAlerts, setNearbyAlerts] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const { savedIds, toggle: toggleComplex } = useSavedComplexes();

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name, saved_complexes, avatar_color, nearby_sighting_alerts, display_name_change_history, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setSelectedColor(data.avatar_color ?? DEFAULT_AVATAR_COLOR);
          setNearbyAlerts(data.nearby_sighting_alerts !== false);
        }
      });
  }, [user]);

  const recentChangeCount = useMemo(
    () => recentChangeTimestamps(profile?.display_name_change_history).length,
    [profile?.display_name_change_history],
  );
  const remainingChanges = Math.max(0, DISPLAY_NAME_CHANGES_PER_WEEK - recentChangeCount);
  const nextChangeDate = useMemo(
    () => nextAvailableChange(profile?.display_name_change_history),
    [profile?.display_name_change_history],
  );
  const limitReached = remainingChanges === 0;

  function handleStartEditName() {
    setDraftName(profile?.display_name ?? '');
    setNameError(null);
    setEditingName(true);
  }

  function handleCancelEditName() {
    setEditingName(false);
    setDraftName('');
    setNameError(null);
  }

  async function handleSaveDisplayName() {
    if (!user) return;
    // Mirror the server normalizer: trim + collapse internal whitespace runs.
    const next = draftName.trim().replace(/\s+/g, ' ');
    if (next.length < DISPLAY_NAME_MIN_LENGTH) {
      setNameError(`Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters.`);
      return;
    }
    if (next.length > DISPLAY_NAME_MAX_LENGTH) {
      setNameError(`Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`);
      return;
    }
    if (!DISPLAY_NAME_ALLOWED_RE.test(next)) {
      setNameError("Only letters, numbers, spaces, and ' . - _ are allowed.");
      return;
    }
    if (next === (profile?.display_name ?? '')) {
      handleCancelEditName();
      return;
    }

    setNameSaving(true);
    setNameError(null);
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: next })
      .eq('id', user.id)
      .select('display_name, saved_complexes, avatar_color, nearby_sighting_alerts, display_name_change_history, avatar_url')
      .single();

    if (error) {
      setNameSaving(false);
      setNameError(friendlyDisplayNameError(error));
      return;
    }

    // Keep Supabase Auth user_metadata in sync so OAuth re-syncs / other clients
    // that fall back to auth metadata (e.g. AuthContext.ensureProfile) show the
    // same name. Non-fatal: we still consider the rename successful on failure.
    await supabase.auth.updateUser({ data: { display_name: next } });

    setNameSaving(false);
    if (data) setProfile(data);
    setEditingName(false);
    setDraftName('');
  }

  async function handleNearbyAlertsChange(value: boolean) {
    setNearbyAlerts(value);
    if (!user) return;
    await supabase.from('profiles').update({ nearby_sighting_alerts: value }).eq('id', user.id);
  }

  async function handlePickAvatar() {
    if (!user) return;
    setPhotoError(null);

    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPhotoError('Photo library permission was denied.');
        return;
      }
    }

    // Single library session. The old flow opened the picker twice (probe →
    // crop, or a second pass for GIF bytes). Many users left the flow on the
    // second screen with no error — it looked like upload failed. On web,
    // `allowsEditing` is not applied; you still get one pick. GIFs are passed
    // through the native editor where supported; they may be re-encoded
    // (e.g. first frame) on some platforms.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: Platform.OS !== 'web',
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const asset = picked.assets[0];
    const uri = asset.uri;
    setPhotoUploading(true);

    try {
      const pathInfo = buildAvatarPath(user.id, uri, asset.mimeType ?? undefined);
      if (!pathInfo) {
        throw new Error('Unsupported image format. Please pick a JPG, PNG, WebP, HEIC, or GIF.');
      }
      const { path, contentType } = pathInfo;

      // Prefer base64 from the picker; fall back to fetch (web, or rare native
      // cases). Avoid global `atob` — use the same safe decoder as sighting
      // uploads. fetch(localUri) is unreliable on some iOS library URIs.
      let arrayBuffer: ArrayBuffer | null = null;
      if (asset.base64) {
        try {
          arrayBuffer = base64ToArrayBuffer(asset.base64);
        } catch {
          arrayBuffer = null;
        }
      }
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error('Could not read the selected image. Please try again.');
        }
        arrayBuffer = await response.arrayBuffer();
      }

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Could not read the selected image. Please try a different photo.');
      }

      // Enforce the size cap client-side so users see a clear message before
      // the network round-trip. The bucket also rejects over-cap uploads, so
      // a bypassed client can't sneak in a 40 MB GIF.
      if (arrayBuffer.byteLength > AVATAR_MAX_BYTES) {
        const mb = (arrayBuffer.byteLength / (1024 * 1024)).toFixed(1);
        throw new Error(
          `That image is ${mb} MB — profile photos must be under 2 MB. Try a smaller image${contentType === 'image/gif' ? ' or a shorter GIF' : ''}.`,
        );
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const previousPath = extractAvatarStoragePath(profile?.avatar_url);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (updateError) throw updateError;

      // Best-effort cleanup of the previous image; if it fails the row already
      // points at the new URL so the UI is correct regardless.
      if (previousPath && previousPath !== path) {
        await supabase.storage.from('avatars').remove([previousPath]);
      }

      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not upload photo.';
      setPhotoError(message);
      if (Platform.OS !== 'web') Alert.alert('Upload failed', message);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!user || !profile?.avatar_url) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const previousPath = extractAvatarStoragePath(profile.avatar_url);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id);
      if (updateError) throw updateError;
      if (previousPath) {
        await supabase.storage.from('avatars').remove([previousPath]);
      }
      setProfile((prev) => (prev ? { ...prev, avatar_url: null } : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove photo.';
      setPhotoError(message);
    } finally {
      setPhotoUploading(false);
    }
  }

  // Two-step confirm: Apple wants deletion to be deliberate, not a one-tap
  // mistake. The first alert explains the consequences; the second is the
  // commit point. On web there's no Alert.alert, so we fall back to confirm().
  function handleDeleteAccountPress() {
    if (deleting) return;

    const runDelete = async () => {
      setDeleting(true);
      const { error } = await deleteAccount();
      setDeleting(false);
      if (error) {
        const message = `Could not delete account: ${error}`;
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          window.alert(message);
        } else {
          Alert.alert('Delete failed', message);
        }
      }
    };

    const title = 'Delete your BootWatch account?';
    const body =
      'This permanently removes your profile, saved complexes, notification settings, and profile photo. ' +
      'Sighting reports you submitted will stay in the feed but will no longer be linked to you. ' +
      'This cannot be undone.';

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`${title}\n\n${body}`)) {
        // eslint-disable-next-line no-alert
        if (window.confirm('Are you absolutely sure? This cannot be undone.')) {
          void runDelete();
        }
      }
      return;
    }

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Are you sure?',
            'This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete account', style: 'destructive', onPress: runDelete },
            ],
          ),
      },
    ]);
  }

  async function handleColorSelect(color: string) {
    setSelectedColor(color);
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').update({ avatar_color: color }).eq('id', user.id);
    setSaving(false);
  }

  const displayName = profile?.display_name ?? 'User';
  const savedComplexes = complexes.filter((c) => savedIds.includes(c.id));

  const styles = createStyles(colors);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          onPress={handlePickAvatar}
          disabled={photoUploading}
          style={styles.avatarPressable}
          accessibilityLabel={profile?.avatar_url ? 'Change profile photo' : 'Add profile photo'}
        >
          <View style={[styles.avatar, { backgroundColor: selectedColor }]}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          {/* Badge is a sibling of `avatar` so it isn't clipped by the
              circle's `overflow: hidden`. It overlaps both the photo and
              the border ring instead of being cropped inside the circle. */}
          <View style={styles.avatarBadge} pointerEvents="none">
            {photoUploading ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Ionicons name="camera" size={14} color={colors.textInverse} />
            )}
          </View>
        </Pressable>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {profile?.avatar_url && !photoUploading && (
          <Pressable onPress={handleRemoveAvatar} hitSlop={8} style={styles.removePhotoButton}>
            <Text style={styles.removePhotoText}>Remove photo</Text>
          </Pressable>
        )}
        {photoError && <Text style={styles.photoErrorText}>{photoError}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display name</Text>
        {editingName ? (
          <View style={styles.nameEditColumn}>
            <TextInput
              style={styles.nameInput}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              autoCapitalize="words"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              placeholder="Your display name"
              placeholderTextColor={colors.textSecondary}
              editable={!nameSaving}
            />
            <View style={styles.nameEditActions}>
              <Pressable onPress={handleCancelEditName} disabled={nameSaving} hitSlop={6}>
                <Text style={styles.nameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveDisplayName}
                disabled={nameSaving || !draftName.trim()}
                style={[
                  styles.nameSaveButton,
                  (nameSaving || !draftName.trim()) && styles.nameSaveButtonDisabled,
                ]}
                hitSlop={6}
              >
                <Text style={styles.nameSaveText}>{nameSaving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.nameDisplayRow}>
            <Text style={styles.nameDisplayText}>{displayName}</Text>
            <Pressable
              onPress={handleStartEditName}
              disabled={limitReached}
              style={[styles.editNameButton, limitReached && styles.editNameButtonDisabled]}
              hitSlop={8}
            >
              <Ionicons
                name="pencil"
                size={14}
                color={limitReached ? colors.textSecondary : colors.accent}
              />
              <Text
                style={[
                  styles.editNameButtonText,
                  limitReached && styles.editNameButtonTextDisabled,
                ]}
              >
                Edit
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.nameHint}>
          {limitReached && nextChangeDate
            ? `Limit reached. You can change your display name again on ${nextChangeDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`
            : `You can change your display name up to ${DISPLAY_NAME_CHANGES_PER_WEEK} times per week. ${remainingChanges} change${remainingChanges === 1 ? '' : 's'} remaining.`}
        </Text>
        {nameError && <Text style={styles.nameErrorText}>{nameError}</Text>}
      </View>

      {/* Avatar color is only meaningful when the initial-letter fallback is
          showing. Once the user has a profile photo the swatch picker is
          hidden to avoid implying it affects the photo. The `avatar_color`
          value is still kept on the profile row so it re-appears with the
          same selection if the photo is later removed. */}
      {!profile?.avatar_url && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Color</Text>
          <View style={styles.colorGrid}>
            {AVATAR_COLORS.map((c) => (
              <Pressable key={c} onPress={() => handleColorSelect(c)} style={styles.colorOption}>
                <View style={[styles.colorSwatch, { backgroundColor: c }]}>
                  {c === selectedColor && (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
          {saving && <Text style={styles.savingText}>Saving...</Text>}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.themeToggle}>
          {(['light', 'dark', 'system'] as const).map((opt) => (
            <Pressable
              key={opt}
              style={[styles.themeOption, mode === opt && styles.themeOptionActive]}
              onPress={() => setMode(opt)}
            >
              <Ionicons
                name={opt === 'light' ? 'sunny-outline' : opt === 'dark' ? 'moon-outline' : 'phone-portrait-outline'}
                size={18}
                color={mode === opt ? colors.accent : colors.textSecondary}
              />
              <Text style={[styles.themeOptionText, mode === opt && styles.themeOptionTextActive]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.switchRow}>
          <View style={styles.switchLabels}>
            <Text style={styles.switchTitle}>Nearby sighting alerts</Text>
            <Text style={styles.switchHint}>
              Push when a booter is reported within about two blocks of a complex you follow or where you have an
              active parking timer.
            </Text>
          </View>
          <Switch
            value={nearbyAlerts}
            onValueChange={handleNearbyAlertsChange}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.background}
            ios_backgroundColor={colors.border}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Followed Complexes</Text>
        <Text style={styles.sectionSubtitle}>
          Complexes you follow (used when nearby alerts are on). Tap the bell on the map to add or remove.
        </Text>
        {savedComplexes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={24} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No followed complexes</Text>
            <Text style={styles.emptySubtext}>
              Tap the bell icon on any complex from the Map tab to follow it and get boot spotter alerts.
            </Text>
          </View>
        ) : (
          <View style={styles.savedList}>
            {savedComplexes.map((cx) => (
              <View key={cx.id} style={styles.savedItem}>
                <Ionicons name="notifications" size={18} color={colors.accent} />
                <Text style={styles.savedItemText}>{cx.name}</Text>
                <Pressable onPress={() => toggleComplex(cx.id)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable style={styles.menuItem} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.menuItemTextDanger}>Sign Out</Text>
        </Pressable>
        <View style={styles.menuDivider} />
        <Pressable
          style={styles.menuItem}
          onPress={handleDeleteAccountPress}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          )}
          <Text style={styles.menuItemTextDanger}>
            {deleting ? 'Deleting…' : 'Delete Account'}
          </Text>
        </Pressable>
        <Text style={styles.deleteHint}>
          Permanently removes your profile and personal data. Sighting reports stay in the feed but are anonymized.
        </Text>
      </View>

      <Text style={styles.version}>BootWatch v1.0.0</Text>
    </ScrollView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  avatarPressable: {
    marginBottom: spacing.sm,
    // Relative anchor for the absolutely-positioned badge; without this the
    // badge would position itself against the ScrollView instead of the
    // avatar circle.
    position: 'relative',
    width: 72,
    height: 72,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarText: {
    fontSize: fontSize.xxl,
    fontFamily: fonts.displayBold,
    color: colors.textInverse,
  },
  avatarImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    borderRadius: 36,
    resizeMode: 'cover',
  },
  avatarBadge: {
    position: 'absolute',
    // Pulled outward so the badge sits on the border instead of being
    // cropped inside the circle. The `avatar` view has `overflow: hidden`
    // which would clip anything living inside it.
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  removePhotoButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  removePhotoText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  photoErrorText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.danger,
    marginTop: spacing.xs,
    textAlign: 'center',
    maxWidth: 240,
  },
  name: {
    fontSize: fontSize.xl,
    fontFamily: fonts.displayBold,
    color: colors.text,
  },
  email: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  nameDisplayText: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
  },
  editNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentSoft,
  },
  editNameButtonDisabled: {
    backgroundColor: colors.surface,
  },
  editNameButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    color: colors.accent,
  },
  editNameButtonTextDisabled: {
    color: colors.textSecondary,
  },
  nameEditColumn: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  nameInput: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: colors.text,
  },
  nameEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  nameCancelText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    color: colors.textSecondary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  nameSaveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  nameSaveButtonDisabled: {
    opacity: 0.5,
  },
  nameSaveText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    color: colors.textInverse,
  },
  nameHint: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  nameErrorText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.danger,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  themeToggle: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  themeOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  themeOptionText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
  },
  themeOptionTextActive: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
  },
  sectionSubtitle: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  switchLabels: {
    flex: 1,
  },
  switchTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  switchHint: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    padding: 2,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  savedList: {
    gap: spacing.sm,
  },
  savedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savedItemText: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
    flex: 1,
  },
  savedItemMeta: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  menuItemTextDanger: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyMedium,
    color: colors.danger,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  deleteHint: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  version: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingBottom: spacing.md,
  },
});
}
