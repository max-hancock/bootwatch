/**
 * Asks for an App Store rating, rarely, right after something went well.
 *
 * - Only after the user's 2nd "happy moment" (a report posted, or leaving
 *   before the timer ran out), so first-time users are never asked.
 * - Then at most once every 4 months. iOS also caps it at 3 times a year and
 *   may silently skip it.
 * - Never in the same stretch of use as another popup (see promptSlot).
 *
 * Safe on binaries without the native module: it just does nothing.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { claimPromptSlot } from './promptSlot';

const MOMENTS_KEY = '@bootwatch_review_moments';
const LAST_ASKED_KEY = '@bootwatch_review_last_asked';

const MOMENTS_BEFORE_ASKING = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const GAP_MS = 120 * DAY_MS;
/** Let the moment's own animation or toast finish first. */
const DELAY_MS = 1200;

let pending = false;

export function recordHappyMoment(): void {
  if (Platform.OS === 'web' || pending) return;
  pending = true;
  void (async () => {
    try {
      const moments = Number(await AsyncStorage.getItem(MOMENTS_KEY)) || 0;
      const count = moments + 1;
      await AsyncStorage.setItem(MOMENTS_KEY, String(count));
      if (count < MOMENTS_BEFORE_ASKING) return;

      const lastAsked = Number(await AsyncStorage.getItem(LAST_ASKED_KEY)) || 0;
      if (Date.now() - lastAsked < GAP_MS) return;

      if (!requireOptionalNativeModule('ExpoStoreReview')) return;
      const StoreReview = await import('expo-store-review');
      if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
      if (!claimPromptSlot()) return;

      await AsyncStorage.setItem(LAST_ASKED_KEY, String(Date.now()));
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      await StoreReview.requestReview();
    } catch {
      // Never let a rating prompt break the flow it follows.
    } finally {
      pending = false;
    }
  })();
}
