/**
 * At most one unprompted popup per stretch of use. The report nudge and the
 * invite nudge each check their own schedule, then call this right before
 * showing; whichever gets there second stays quiet and tries again another day.
 * In-memory on purpose: a fresh launch is a fresh slot.
 */
const SLOT_MS = 6 * 60 * 60 * 1000;

let claimedAt = 0;

export function claimPromptSlot(): boolean {
  const now = Date.now();
  if (now - claimedAt < SLOT_MS) return false;
  claimedAt = now;
  return true;
}
