import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { forceReportPrompt } from '../config/features';
import { isWhatsNewPending } from './useWhatsNew';
import { claimPromptSlot } from '../utils/promptSlot';
import { isInvitePromptDue } from './useInvitePrompt';

const LAST_PROMPT_KEY = '@bootwatch_report_prompt_at';

/** Minimum gap between "Seen a booter recently?" nudges. */
const PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * How long after a new user first reaches the app before the nudge appears.
 * It shows during that first session (many new users never come back for a
 * second one), but not straight away: this gives the notification and location
 * permission dialogs time to be answered so nothing stacks on top of them.
 */
const NEW_USER_DELAY_MS = 45 * 1000;

/** If the nudge comes due within this long, wait for it in-session instead of until the next open. */
const IN_SESSION_WAIT_MS = 5 * 60 * 1000;

/** Restart the cooldown — e.g. after the user posts a report, so we don't nudge someone who just contributed. */
export function snoozeReportPrompt() {
  AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now())).catch(() => {});
}

/**
 * Decides when to show the report nudge: on app open / return to foreground,
 * at most once per cooldown. A brand-new user gets it a short while into their
 * first session, once the permission dialogs are out of the way.
 */
export function useReportPrompt() {
  const [visible, setVisible] = useState(forceReportPrompt);
  const checking = useRef(false);
  const recheck = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      // The "What's new" card goes first; this nudge waits for a later open
      // (without using up its cooldown) so the two never stack.
      if (await isWhatsNewPending()) return;
      const raw = await AsyncStorage.getItem(LAST_PROMPT_KEY);
      const last = raw ? Number(raw) : NaN;
      const now = Date.now();
      // Come back when it falls due, if that is soon enough to still be in this session.
      const recheckIn = (ms: number) => {
        if (recheck.current) clearTimeout(recheck.current);
        recheck.current = setTimeout(() => void check(), ms + 250);
      };
      if (Number.isNaN(last)) {
        // First open: backdate so the nudge is due NEW_USER_DELAY_MS from now.
        await AsyncStorage.setItem(LAST_PROMPT_KEY, String(now - PROMPT_COOLDOWN_MS + NEW_USER_DELAY_MS));
        recheckIn(NEW_USER_DELAY_MS);
        return;
      }
      const remaining = PROMPT_COOLDOWN_MS - (now - last);
      if (remaining > 0) {
        if (remaining <= IN_SESSION_WAIT_MS) recheckIn(remaining);
        return;
      }
      // One unprompted popup per open. The invite popup is rarer, so when it is due it
      // goes first and this one waits for the next open without using up its cooldown.
      if (await isInvitePromptDue()) return;
      if (!claimPromptSlot()) return;
      await AsyncStorage.setItem(LAST_PROMPT_KEY, String(now));
      setVisible(true);
    } catch {
      // Storage unavailable — skip the nudge rather than risk showing it every open.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      sub.remove();
      if (recheck.current) clearTimeout(recheck.current);
    };
  }, [check]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, dismiss };
}
