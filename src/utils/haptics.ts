/**
 * One place for the app's taps and buzzes, so the same kind of action always
 * feels the same. Every call is a no-op on web and never throws.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const enabled = Platform.OS !== 'web';

function run(fn: () => Promise<void>) {
  if (!enabled) return;
  fn().catch(() => {});
}

export const haptics = {
  /** Picking from a set: reactions, emoji, toggles. */
  select: () => run(() => Haptics.selectionAsync()),
  /** A small confirmed action: save, share. */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A bigger action: starting or stopping the timer. */
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Something needs attention soon, like the timer running low. */
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Something failed or time ran out. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
