import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { forceInvitePrompt } from '../config/features';
import { claimPromptSlot } from '../utils/promptSlot';
import { isWhatsNewPending } from './useWhatsNew';

/** Timestamp (ms) before which the invite popup must not show. */
const NEXT_ELIGIBLE_KEY = '@bootwatch_invite_prompt_next';

const DAY_MS = 24 * 60 * 60 * 1000;
/** "Enjoying BootWatch?" only makes sense once someone has used it for a while. */
const FIRST_DELAY_MS = 7 * DAY_MS;
/** Gap after it is shown and dismissed. */
const REPEAT_MS = 14 * DAY_MS;
/** Gap after they actually share: they have done their part for a while. */
const AFTER_SHARE_MS = 60 * DAY_MS;
/**
 * True once the invite popup's wait is over. The report nudge checks this and
 * stands aside: it comes round every 3 days, so if it always went first, anyone
 * who opens the app less often than that would never see the invite.
 */
export async function isInvitePromptDue(): Promise<boolean> {
  try {
    const next = Number(await AsyncStorage.getItem(NEXT_ELIGIBLE_KEY));
    return Number.isFinite(next) && next > 0 && Date.now() >= next;
  } catch {
    return false;
  }
}

function scheduleNext(delayMs: number) {
  AsyncStorage.setItem(NEXT_ELIGIBLE_KEY, String(Date.now() + delayMs)).catch(() => {});
}

/**
 * Call whenever the user shares an invite, from the popup or anywhere else:
 * they have done their part, so the popup leaves them alone for longer.
 */
export function snoozeInvitePromptAfterShare() {
  scheduleNext(AFTER_SHARE_MS);
}

/**
 * Decides when to show the "Enjoying BootWatch? Spread the word" popup: not in
 * a user's first week, then at most every two weeks, never on the same open as
 * the "What's new" card or the report nudge. When it and the report nudge are
 * both due, this one goes first and the report nudge waits for the next open.
 */
export function useInvitePrompt() {
  const [visible, setVisible] = useState(forceInvitePrompt);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      if (await isWhatsNewPending()) return;
      const raw = await AsyncStorage.getItem(NEXT_ELIGIBLE_KEY);
      const next = raw ? Number(raw) : NaN;
      if (Number.isNaN(next)) {
        // First time we've seen this device: start the one-week clock.
        scheduleNext(FIRST_DELAY_MS);
        return;
      }
      if (Date.now() < next) return;
      if (!claimPromptSlot()) return;
      scheduleNext(REPEAT_MS);
      setVisible(true);
    } catch {
      // Storage unavailable — skip rather than risk showing it every open.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, dismiss };
}
