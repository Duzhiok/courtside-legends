/**
 * Sound for the 3D match: what the arena says when something real happens on the court. It only ever REACTS to a fact the
 * presentation timeline has already reached (a shot that has landed, a foul beat that is being played), so a cheer can never come
 * before the ball. Injected `sfx` (the audio module's cue table) keeps this pure and testable; every sfx call is already a safe
 * no-op until the page has audio. Rate-limited so 2x/3x fast play does not stack roars into noise.
 */
export const ROAR_GAP_MS = 1400;
export const WHISTLE_GAP_MS = 700;

export function createArenaCues({ sfx, now = () => Date.now() } = {}) {
  let lastRoar = -Infinity;
  let lastWhistle = -Infinity;
  return {
    /** A shot or dunk reached the rim. A miss is silent; a make is a swish and, at most once per ROAR_GAP_MS, a crowd roar. */
    shotLanded({ made, pts = 0, dunk = false } = {}) {
      if (!made || !sfx) return;
      sfx.swish?.();
      const t = now();
      if (t - lastRoar < ROAR_GAP_MS) return;
      lastRoar = t;
      sfx.roar?.(dunk || pts >= 3 ? 1.3 : 0.8);
    },
    /** A foul is being played. */
    foul() {
      if (!sfx) return;
      const t = now();
      if (t - lastWhistle < WHISTLE_GAP_MS) return;
      lastWhistle = t;
      sfx.whistle?.();
    },
  };
}
