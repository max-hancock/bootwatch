import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useNotifications, type PermissionStatus } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';

export type TimerPhase = 'idle' | 'running' | 'warning' | 'critical' | 'expired';

interface TimerState {
  phase: TimerPhase;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
}

const WARNING_THRESHOLD = 600; // 10 minutes
const CRITICAL_THRESHOLD = 300; // 5 minutes

function getPhase(remaining: number, isCounting: boolean): TimerPhase {
  if (!isCounting) {
    if (remaining > 0) return 'running';
    return 'idle';
  }
  if (remaining <= 0) return 'expired';
  if (remaining <= CRITICAL_THRESHOLD) return 'critical';
  if (remaining <= WARNING_THRESHOLD) return 'warning';
  return 'running';
}

/** Floor to match what users read on the clock; same source as progress bar. */
function secondsUntil(endMs: number): number {
  return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
}

function totalSessionSeconds(endMs: number, createdMs: number, remaining: number): number {
  const fromCreated = Math.max(1, Math.round((endMs - createdMs) / 1000));
  // Remaining must be ≤ full session; if `created_at` was stale, `fromCreated` can be too large
  if (fromCreated < remaining) {
    return Math.max(remaining, 1);
  }
  return fromCreated;
}

export type ParkingTimerContextValue = TimerState & {
  /** selfSet: the user chose the duration because the complex has no posted visitor limit. */
  start: (durationMinutes: number, complexId?: string, selfSet?: boolean) => Promise<void>;
  cancel: () => Promise<void>;
  permissionStatus: PermissionStatus;
  activeComplexId: string | null;
  parkingOverLimit: boolean;
  rehydrateFromServer: () => Promise<void>;
};

const ParkingTimerContext = createContext<ParkingTimerContextValue | null>(null);

export function ParkingTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimerState>({
    phase: 'idle',
    totalSeconds: 0,
    remainingSeconds: 0,
    isRunning: false,
  });
  const [activeComplexId, setActiveComplexId] = useState<string | null>(null);
  const [parkingOverLimit, setParkingOverLimit] = useState(false);

  const endTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  const { permissionStatus, requestPermissions, scheduleNotification, cancelAllScheduled } = useNotifications();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const tick = useCallback(() => {
    if (!endTimeRef.current) return;
    const endMs = endTimeRef.current;
    const remaining = secondsUntil(endMs);

    if (remaining <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      endTimeRef.current = null;
      if (!mounted.current) return;
      setParkingOverLimit(true);
      setState((prev) => ({
        ...prev,
        remainingSeconds: 0,
        isRunning: false,
        phase: 'expired',
      }));

      void supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return;
        const { data: current } = await supabase
          .from('active_timers')
          .select('complex_id, expires_at, visitor_limit_ends_at')
          .eq('user_id', user.id)
          .maybeSingle();
        if (current?.complex_id) {
          const limitEnd = current.visitor_limit_ends_at ?? current.expires_at;
          await supabase
            .from('active_timers')
            .update({
              over_limit: true,
              visitor_limit_ends_at: limitEnd,
            })
            .eq('user_id', user.id);
        }
      });
      return;
    }

    if (!mounted.current) return;
    setState((prev) => ({
      ...prev,
      remainingSeconds: remaining,
      isRunning: true,
      phase: getPhase(remaining, true),
    }));
  }, []);

  const rehydrateFromServer = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      if (!endTimeRef.current) {
        if (mounted.current) {
          setActiveComplexId(null);
          setParkingOverLimit(false);
        }
      }
      return;
    }
    const { data: row, error } = await supabase
      .from('active_timers')
      .select('complex_id, expires_at, over_limit, visitor_limit_ends_at, created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !row) {
      if (!endTimeRef.current) {
        if (mounted.current) {
          setActiveComplexId(null);
          setParkingOverLimit(false);
        }
      }
      return;
    }

    if (!mounted.current) return;

    setActiveComplexId(row.complex_id);
    const endMs = new Date(row.expires_at).getTime();
    const now = Date.now();
    const limitEndMs = row.visitor_limit_ends_at
      ? new Date(row.visitor_limit_ends_at).getTime()
      : endMs;
    const createdMs = row.created_at ? new Date(row.created_at).getTime() : limitEndMs - 30 * 60 * 1000;

    if (row.over_limit || endMs <= now) {
      if (!row.over_limit && endMs <= now) {
        await supabase.from('active_timers').update({ over_limit: true }).eq('user_id', user.id);
      }
      endTimeRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const rem = 0;
      const totalFromSession = totalSessionSeconds(endMs, createdMs, rem);
      if (mounted.current) {
        setParkingOverLimit(true);
        setState({
          phase: 'expired',
          totalSeconds: totalFromSession,
          remainingSeconds: 0,
          isRunning: false,
        });
      }
      return;
    }

    const rem = secondsUntil(endMs);
    const totalFromSession = totalSessionSeconds(endMs, createdMs, rem);

    endTimeRef.current = endMs;
    if (mounted.current) {
      setParkingOverLimit(false);
      setState({
        phase: getPhase(rem, true),
        totalSeconds: totalFromSession,
        remainingSeconds: rem,
        isRunning: true,
      });
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 1000);
  }, [tick]);

  useEffect(() => {
    void rehydrateFromServer();
  }, [rehydrateFromServer]);

  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        void rehydrateFromServer();
        if (endTimeRef.current) tick();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [tick, rehydrateFromServer]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const start = useCallback(
    async (durationMinutes: number, complexId?: string, selfSet = false) => {
      const totalSeconds = durationMinutes * 60;
      const endTime = Date.now() + totalSeconds * 1000;
      endTimeRef.current = endTime;
      setParkingOverLimit(false);

      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, 1000);

      if (complexId) setActiveComplexId(complexId);
      else setActiveComplexId(null);

      const remainingAligned = secondsUntil(endTime);
      setState({
        phase: 'running',
        totalSeconds,
        remainingSeconds: Math.min(totalSeconds, Math.max(0, remainingAligned)),
        isRunning: true,
      });

      if (complexId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const endIso = new Date(endTime).toISOString();
          const nowIso = new Date().toISOString();
          await supabase.from('active_timers').upsert(
            {
              user_id: user.id,
              complex_id: complexId,
              expires_at: endIso,
              visitor_limit_ends_at: endIso,
              over_limit: false,
              created_at: nowIso,
            },
            { onConflict: 'user_id' },
          );
        }
      }

      await cancelAllScheduled();

      let granted = permissionStatus === 'granted';
      if (!granted) {
        granted = await requestPermissions();
      }

      if (granted) {
        if (totalSeconds > 600) {
          await scheduleNotification(
            '⏱️ 10 minutes left!',
            selfSet
              ? 'The timer you set is almost up.'
              : 'Your visitor parking time is almost up. Head back soon.',
            totalSeconds - 600,
          );
        }
        if (totalSeconds > 300) {
          await scheduleNotification(
            selfSet ? '⏱️ 5 minutes left' : '⚠️ 5 minutes left!',
            selfSet ? 'The timer you set ends in 5 minutes.' : 'Move your car now to avoid getting booted!',
            totalSeconds - 300,
          );
        }
        // No posted limit means nothing is being enforced at this moment, so don't tell them to move.
        await scheduleNotification(
          selfSet ? '⏱️ Timer finished' : '🚨 Time expired!',
          selfSet
            ? "The time you set is up. Open BootWatch and tap I've left when you go."
            : 'Your visitor parking time is up. Move your car immediately!',
          totalSeconds,
        );
      }
    },
    [tick, permissionStatus, requestPermissions, scheduleNotification, cancelAllScheduled],
  );

  const cancel = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    endTimeRef.current = null;
    setActiveComplexId(null);
    setParkingOverLimit(false);
    await cancelAllScheduled();
    setState({ phase: 'idle', totalSeconds: 0, remainingSeconds: 0, isRunning: false });

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('active_timers').delete().eq('user_id', user.id);
    }
  }, [cancelAllScheduled]);

  const value = useMemo<ParkingTimerContextValue>(
    () => ({
      ...state,
      start,
      cancel,
      permissionStatus,
      activeComplexId,
      parkingOverLimit,
      rehydrateFromServer,
    }),
    [state, start, cancel, permissionStatus, activeComplexId, parkingOverLimit, rehydrateFromServer],
  );

  return (
    <ParkingTimerContext.Provider value={value}>{children}</ParkingTimerContext.Provider>
  );
}

export function useParkingTimer() {
  const ctx = useContext(ParkingTimerContext);
  if (ctx == null) {
    throw new Error('useParkingTimer must be used within a ParkingTimerProvider');
  }
  return ctx;
}
