/**
 * Dynamic In-Match Events MVP — minimal integration between the live GameSim, the pure engine
 * (js/engine/matchEvents.js) and Lychee's cards (js/ui/matchEventCards.js).
 *
 * app.js creates one session per live game (wireDomainEvents) and forwards every domain event
 * (handleDomainEvent). The session:
 * - steps the engine at POSSESSION_START / PERIOD_START;
 * - shows a decision and pauses the game only when input is needed (live play at 1x/2x);
 * - auto-resolves with the default choice when there is no one to ask: top speed, quick sim,
 *   play resumed without a pick, or the final buzzer;
 * - applies the picked choice through the existing GameSim API, then resumes if it paused;
 * - exports its state for the save payload, so a reload continues instead of repeating.
 *
 * QA hooks (read once per game, ignored when absent): globalThis.__CLS_MATCH_EVENT_SEED fixes the
 * event seed; globalThis.__CLS_MATCH_EVENT_TUNING overrides MATCH_EVENT_TUNING fields (e.g.
 * { warmupBoundaries: 0, chance: { takeover: 1 } }) to force an event in a browser run.
 */
import { createMatchEventController } from "./matchEventCards.js";
import {
  MATCH_EVENT_TUNING,
  applyMatchEffect,
  autoResolvedNotice,
  createMatchEventState,
  decideMatchEvent,
  exportMatchEventState,
  markApplied,
  matchEventHistoryRows,
  restoreMatchEventState,
  settleMatchEventOutcomes,
  stepMatchEvents,
} from "../engine/matchEvents.js";

function resolveTuning(override) {
  const extra = override && typeof override === "object" ? override : {};
  return Object.freeze({
    ...MATCH_EVENT_TUNING,
    ...extra,
    chance: Object.freeze({ ...MATCH_EVENT_TUNING.chance, ...(extra.chance || {}) }),
    foulLimit: Object.freeze({ ...MATCH_EVENT_TUNING.foulLimit, ...(extra.foulLimit || {}) }),
    defaults: Object.freeze({ ...MATCH_EVENT_TUNING.defaults, ...(extra.defaults || {}) }),
  });
}

export function createMatchEventsSession({
  sim,
  saved = null,
  seed = globalThis.__CLS_MATCH_EVENT_SEED ?? Date.now().toString(36),
  getLang = () => "zh",
  promptMaxSpeed = 2,
  tuning = resolveTuning(globalThis.__CLS_MATCH_EVENT_TUNING),
  ui = null,
  defer = (fn) => Promise.resolve().then(fn),
} = {}) {
  if (!sim) throw new Error("createMatchEventsSession needs the live sim");
  let state = saved ? restoreMatchEventState(saved, { seed: String(seed) }) : createMatchEventState({ seed: String(seed) });
  let pausedByUs = false;
  let busy = false;
  let disposed = false;
  const view = ui || createMatchEventController({
    onDecide: (choiceId) => decide(choiceId),
    onDismiss: () => decide(null),
    getLang,
  });

  const snapshot = () => {
    try {
      return sim.snapshot();
    } catch {
      return null;
    }
  };
  const canPrompt = () => (Number(sim.speed) || 1) <= promptMaxSpeed && sim.running !== false;

  function resolve(choiceId, { auto }) {
    const r = decideMatchEvent(state, choiceId, { auto, snapshot: snapshot() });
    if (!r.entry) return null;
    state = r.state;
    // Effect and record in one synchronous step: a save taken afterwards has both or neither.
    if (r.effects.length) state = markApplied(state, r.entry.id, applyMatchEffect(sim, r.effects));
    view.clear();
    if (auto) view.show(autoResolvedNotice(r.entry));
    return r.entry;
  }

  function resumeIfWePaused() {
    if (!pausedByUs) return;
    pausedByUs = false;
    if (sim.paused && sim.running !== false) sim.setPaused(false);
  }

  /** Player picked (or dismissed: null -> the default). */
  function decide(choiceId) {
    if (disposed || !state.pending) return null;
    const entry = resolve(choiceId ?? state.pending.defaultChoiceId, { auto: false });
    resumeIfWePaused();
    return entry;
  }

  function show(event) {
    if (!canPrompt()) {
      resolve(event.defaultChoiceId, { auto: true });
      return;
    }
    view.show(event);
    if (!sim.paused) {
      pausedByUs = true;
      // Deferred: this runs inside GameSim's onTick. setPaused re-enters onTick (and the domain
      // adapter) synchronously, so pause right after the current tick finishes instead.
      defer(() => {
        if (disposed || !state.pending || !pausedByUs || sim.paused || sim.running === false) return;
        sim.setPaused(true, "event");
      });
    }
  }

  function onDomainEvent(evt) {
    if (disposed || busy || !evt) return;
    busy = true;
    try {
      if (evt.type === "MATCH_END" || evt.type === "PERIOD_END") {
        if (evt.type === "MATCH_END" && state.pending) resolve(state.pending.defaultChoiceId, { auto: true });
        state = settleMatchEventOutcomes(state, evt.snapshot, { final: true, tuning });
        return;
      }
      if (evt.type === "POSSESSION_START" && state.pending) {
        // Play went on without a pick (the player pressed resume): take the default.
        pausedByUs = false;
        resolve(state.pending.defaultChoiceId, { auto: true });
      }
      const r = stepMatchEvents(state, evt, tuning);
      state = settleMatchEventOutcomes(r.state, evt.snapshot, { tuning });
      if (r.event) show(r.event);
    } finally {
      busy = false;
    }
  }

  /** Before quick sim (runFast fires no ticks): settle a pending decision with its default. */
  function autoResolvePending() {
    if (disposed || !state.pending) return null;
    pausedByUs = false;
    return resolve(state.pending.defaultChoiceId, { auto: true });
  }

  /** A restored game with a decision still open: show it again (same id, effects not yet applied). */
  function reshowPending() {
    if (!disposed && state.pending) view.show(state.pending);
  }

  return {
    onDomainEvent,
    decide,
    autoResolvePending,
    reshowPending,
    exportState: () => exportMatchEventState(state),
    history: (lang = getLang()) => matchEventHistoryRows(state, lang),
    get state() {
      return state;
    },
    dispose() {
      disposed = true;
      view.clear();
    },
  };
}
