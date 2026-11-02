/**
 * Lock-screen / Dynamic Island countdown for the parking timer (iOS 16.2+).
 *
 * iOS draws the countdown itself, so it keeps ticking while the app is closed.
 * Tapping it opens the Timer tab (`bootwatch://timer`). Every call is a no-op
 * on Android, web, older iOS, or a binary built before the native module was
 * added, so this file is safe to ship by OTA.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type { LiveActivityConfig, LiveActivityState } from 'expo-live-activity';
import { getComplexById } from '../data/complexes';

const STORAGE_KEY = '@bootwatch_timer_live_activity';

/** Deep link path the activity opens; App.tsx sends it to the Timer tab. */
export const TIMER_DEEP_LINK_PATH = 'timer';

type LiveActivityModule = typeof import('expo-live-activity');

let cached: LiveActivityModule | null | undefined;

/** The JS wrapper, or null when the native side is missing. */
function getModule(): LiveActivityModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== 'ios') return cached;
  // The wrapper logs errors (not throws) when native is missing, so check first.
  if (!requireOptionalNativeModule('ExpoLiveActivity')) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-live-activity') as LiveActivityModule;
  } catch {
    cached = null;
  }
  return cached;
}

const CONFIG: LiveActivityConfig = {
  backgroundColor: '#0C1014',
  titleColor: '#FFFFFF',
  subtitleColor: '#FFFFFFB3',
  progressViewTint: '#2DD4BF',
  progressViewLabelColor: '#FFFFFF',
  deepLinkUrl: `/${TIMER_DEEP_LINK_PATH}`,
  timerType: 'digital',
  padding: { horizontal: 20, top: 16, bottom: 16 },
};

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** True when the user picked the length because the complex posts no limit. */
function isSelfSet(complexId: string | null): boolean {
  if (!complexId) return true;
  const c = getComplexById(complexId);
  return !c || !((c.visitorTimeLimitMinutes ?? 0) > 0);
}

function runningState(endMs: number, complexId: string | null): LiveActivityState {
  const name = complexId ? getComplexById(complexId)?.name : undefined;
  const selfSet = isSelfSet(complexId);
  return {
    title: name ?? 'Parking timer',
    subtitle: selfSet ? `Your timer ends at ${formatClock(endMs)}` : `Visitor parking ends at ${formatClock(endMs)}`,
    progressBar: { date: endMs },
  };
}

function expiredState(complexId: string | null): LiveActivityState {
  const name = complexId ? getComplexById(complexId)?.name : undefined;
  const selfSet = isSelfSet(complexId);
  return {
    title: selfSet ? 'Timer finished' : 'Time’s up — move your car',
    subtitle: name ? `${name} · tap when you’ve left` : 'Tap when you’ve left',
    progressBar: { progress: 1 },
  };
}

interface Stored {
  id: string;
  endMs: number;
  complexId: string | null;
  expired?: boolean;
}

async function readStored(): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

async function writeStored(value: Stored | null): Promise<void> {
  try {
    if (value) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Runs calls one after another so overlapping start/refresh calls never show two countdowns. */
let queue: Promise<void> = Promise.resolve();
function serial(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task, task);
  return queue;
}

/** Show (or replace) the countdown for a timer ending at `endMs`. */
export function showTimerActivity(endMs: number, complexId: string | null): Promise<void> {
  return serial(() => show(endMs, complexId));
}

async function show(endMs: number, complexId: string | null): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  const prev = await readStored();
  if (prev && !prev.expired && prev.endMs === endMs && prev.complexId === complexId) {
    // Already started for this timer. If the user swiped it away, leave it gone.
    return;
  }
  try {
    if (prev) mod.stopActivity(prev.id, runningState(prev.endMs, prev.complexId));
  } catch {
    /* activity already gone */
  }
  try {
    const id = mod.startActivity(runningState(endMs, complexId), CONFIG);
    await writeStored(id ? { id, endMs, complexId } : null);
  } catch {
    // User turned Live Activities off for BootWatch in Settings.
    await writeStored(null);
  }
}

/** Switch the countdown to its "time's up" message. */
export function markTimerActivityExpired(): Promise<void> {
  return serial(markExpired);
}

async function markExpired(): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  const prev = await readStored();
  if (!prev || prev.expired) return;
  try {
    mod.updateActivity(prev.id, expiredState(prev.complexId));
    await writeStored({ ...prev, expired: true });
  } catch {
    await writeStored(null);
  }
}

/** Remove the countdown (timer cancelled or user left). */
export function endTimerActivity(): Promise<void> {
  return serial(end);
}

async function end(): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  const prev = await readStored();
  if (!prev) return;
  await writeStored(null);
  try {
    mod.stopActivity(prev.id, expiredState(prev.complexId));
  } catch {
    /* already gone */
  }
}
