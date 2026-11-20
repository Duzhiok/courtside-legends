/**
 * The presentation gate (S3): while the 3D court is the screen, the play-by-play text and the scoreboard may not run ahead of the
 * action. GameSim emits a whole possession at once; the 3D court then plays it over a few seconds. Anything that SHOWS an event
 * (a feed line, the score, the clock, a sound) is `defer`red under that event's GameSim `seq` and released, in order, as the
 * presentation cursor reaches it.
 *
 * Pure bookkeeping: it never decides a game fact and never delays GameSim, a tactical command or a save. When it is off (2D mode)
 * `defer` runs the function at once, which is exactly today's behaviour.
 *
 * Bounded: more than `maxPending` waiting entries means something upstream stalled, so the oldest are shown rather than held.
 */
export function createUiGate({ maxPending = 120 } = {}) {
  let on = false;
  const queue = []; // { seq, fn }, seq non-decreasing (GameSim emits in order)
  let forced = 0;

  const run = (entry) => {
    try {
      entry.fn();
    } catch (err) {
      console.error("[uiGate]", err);
    }
  };

  const release = (upToSeq) => {
    while (queue.length && queue[0].seq <= upToSeq) run(queue.shift());
  };
  const flush = () => {
    while (queue.length) run(queue.shift());
  };

  return {
    get enabled() {
      return on;
    },
    /** Turning the gate off shows everything that was waiting: nothing is ever lost, only shown late. */
    setEnabled(next) {
      if (!next) flush();
      on = !!next;
    },
    /** Show `fn` now (gate off, or no seq to order it by) or when the cursor reaches `seq`. Returns true when it was held. */
    defer(seq, fn) {
      if (!on || !Number.isInteger(seq)) {
        fn();
        return false;
      }
      queue.push({ seq, fn });
      if (queue.length > maxPending) {
        forced++;
        run(queue.shift());
      }
      return true;
    },
    /** The cursor has reached `upToSeq`: show every held entry up to and including it, in order. */
    release,
    flush,
    get pending() {
      return queue.length;
    },
    /** How many entries were force-shown because the queue overflowed (should stay 0). */
    get forced() {
      return forced;
    },
  };
}
