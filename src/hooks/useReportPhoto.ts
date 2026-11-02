/**
 * "Report photo" for sighting photos and profile photos.
 *
 * The server hides a photo for everyone once 2 people report it
 * (supabase/2026-11-02_photo_reports.sql). The person who reported it stops
 * seeing it straight away: reported URLs are remembered on the device and
 * every place that shows a photo checks `isPhotoHidden`.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { haptics } from '../utils/haptics';

export type PhotoKind = 'sighting' | 'avatar';
type Reason = 'inappropriate' | 'personal_info' | 'not_relevant';

const STORAGE_KEY = '@bootwatch_reported_photos';
/** Keep the list small; old entries are long since hidden or reviewed. */
const MAX_REMEMBERED = 200;

// ─── Reported URLs, shared by every screen ───
let reported = new Set<string>();
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      reported = new Set([...(JSON.parse(raw) as string[]), ...reported]);
      notify();
    }
  } catch {
    /* ignore */
  }
}

function remember(url: string) {
  reported = new Set([...reported, url]);
  notify();
  const list = [...reported].slice(-MAX_REMEMBERED);
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list)).catch(() => {});
}

/**
 * `isHidden(url)` is true for photos this user reported. Re-renders when they
 * report one anywhere in the app; `version` changes too, for list extraData.
 */
export function useHiddenPhotos() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    void load();
    return () => {
      listeners.delete(l);
    };
  }, []);
  // New function each version so memoized rows that take it re-render.
  const isHidden = useCallback(
    (url: string | null | undefined) => !!url && reported.has(url),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );
  return { isHidden, version };
}

// ─── The report flow ───
function chooseReason(kind: PhotoKind): Promise<Reason | null> {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    return Promise.resolve(confirm('Report this photo as inappropriate?') ? 'inappropriate' : null);
  }
  return new Promise((resolve) => {
    Alert.alert(
      'Report photo',
      'Why are you reporting it? Photos reported by more than one person are hidden until we review them.',
      [
        { text: 'Inappropriate or offensive', onPress: () => resolve('inappropriate') },
        { text: 'Shows faces, plates or personal info', onPress: () => resolve('personal_info') },
        {
          text: kind === 'sighting' ? 'Not a boot truck / spam' : 'Spam or impersonation',
          onPress: () => resolve('not_relevant'),
        },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

function showError(message: string) {
  if (Platform.OS === 'web') alert(message); // eslint-disable-line no-alert
  else Alert.alert('Could not report photo', message);
}

export function useReportPhoto() {
  const { show: showToast } = useToast();

  /**
   * Asks for a reason and sends the report. Resolves true once the photo is
   * reported (or was already), so the caller can close whatever showed it.
   */
  return useCallback(
    async (kind: PhotoKind, targetId: string, photoUrl: string): Promise<boolean> => {
      const reason = await chooseReason(kind);
      if (!reason) return false;

      const { data, error } = await supabase.rpc('report_photo', {
        p_kind: kind,
        p_target: targetId,
        p_reason: reason,
      });
      if (error) {
        haptics.error();
        // Messages with a hint are written for users (own photo, daily limit).
        showError(error.hint ? error.message : 'Please try again in a moment.');
        return false;
      }

      haptics.success();
      remember(photoUrl);
      showToast({
        message:
          data === 'already_reported'
            ? 'You already reported this photo.'
            : "Thanks. You won't see this photo again, and we'll review it.",
        icon: 'flag',
      });
      return true;
    },
    [showToast],
  );
}
