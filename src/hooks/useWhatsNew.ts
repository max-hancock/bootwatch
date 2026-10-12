import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { claimPromptSlot } from '../utils/promptSlot';

/**
 * Bump this (and update the lines in src/components/WhatsNew.tsx) when a
 * release has something worth announcing; everyone then sees the card once more.
 */
export const WHATS_NEW_VERSION = '2026-10-community';

const SEEN_KEY = '@bootwatch_whats_new_seen';

/** True until this release's card has been dismissed on this device. */
export async function isWhatsNewPending(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) !== WHATS_NEW_VERSION;
  } catch {
    // Storage unavailable — don't risk showing it on every open.
    return false;
  }
}

/**
 * Also called when onboarding finishes: a brand-new user has just been shown
 * the current features, so there is nothing "new" to tell them.
 */
export function markWhatsNewSeen() {
  AsyncStorage.setItem(SEEN_KEY, WHATS_NEW_VERSION).catch(() => {});
}

/**
 * One-time "What's new" card for people who had the app before this release.
 * It is only marked as seen when dismissed, so closing the app mid-read shows
 * it again next time.
 */
export function useWhatsNew() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isWhatsNewPending().then((pending) => {
      if (!pending || cancelled) return;
      // Takes this launch's popup slot, so the report or invite nudge can't pop up
      // moments after this card is dismissed.
      claimPromptSlot();
      setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    markWhatsNewSeen();
  }, []);

  return { visible, dismiss };
}
