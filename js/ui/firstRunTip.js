/**
 * M2a: one-time onboarding tips ("seen it once, never again").
 *
 * Storage is injected so tests don't need a browser. A missing key means "not seen yet". If the
 * storage throws (private mode, quota, disabled), dismissing still sticks for the rest of this page
 * session through the in-memory set -- the tip must never nag on every game just because
 * localStorage is unavailable.
 */

export const PLAY_NOW_TIP_KEY = "cls_tip_play_now_v1";

const seenThisSession = new Set();

export function shouldShowTip(storage, key) {
  if (seenThisSession.has(key)) return false;
  try {
    return storage?.getItem(key) !== "seen";
  } catch {
    return true;
  }
}

export function markTipSeen(storage, key) {
  seenThisSession.add(key);
  try {
    storage?.setItem(key, "seen");
  } catch {
    // Storage refused; the session set above still keeps the tip dismissed until reload.
  }
}

/** Test hook: forget the in-memory dismissals. */
export function resetTipSession() {
  seenThisSession.clear();
}
