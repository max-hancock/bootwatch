import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { forceReportPrompt } from '../config/features';

const LAST_PROMPT_KEY = '@bootwatch_report_prompt_at';

/** Minimum gap between "Seen a booter recently?" nudges. */
const PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * How long after a new user's first open before the nudge can appear. Long
 * enough to clear onboarding and the notification permission dialog, short
 * enough that it lands on their next visit.
 */
const NEW_USER_DELAY_MS = 10 * 60 * 1000;

/** Restart the cooldown — e.g. after the user posts a report, so we don't nudge someone who just contributed. */
export function snoozeReportPrompt() {
  AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now())).catch(() => {});
}

/**
 * Decides when to show the report nudge: on app open / return to foreground,
 * at most once per cooldown. A brand-new user's first open only starts a short
 * clock, so it isn't stacked on top of onboarding and permission dialogs.
 */
export function useReportPrompt() {
  const [visible, setVisible] = useState(forceReportPrompt);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const raw = await AsyncStorage.getItem(LAST_PROMPT_KEY);
      const last = raw ? Number(raw) : NaN;
      const now = Date.now();
      if (Number.isNaN(last)) {
        // First open: backdate so the nudge is due NEW_USER_DELAY_MS from now.
        await AsyncStorage.setItem(LAST_PROMPT_KEY, String(now - PROMPT_COOLDOWN_MS + NEW_USER_DELAY_MS));
        return;
      }
      if (now - last < PROMPT_COOLDOWN_MS) return;
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
    return () => sub.remove();
  }, [check]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, dismiss };
}
