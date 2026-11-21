// Freeze diagnostic: when the main thread stalls hard enough that the game
// looks dead (the 2026-11-20 rotation-board freeze: only a refresh helped),
// leave a fingerprint — which screen, what the player last did, how long the
// thread was stuck. Kept tiny and best-effort: any failure here must never
// break the game, and it only writes to storage for real stalls (>= 1s) plus
// a small "last known state" on each screen change / interaction.
//
// Why a heartbeat instead of PerformanceObserver('longtask'): Safari (the
// user's iPhone) does not report longtask entries, so the observer would be
// dead on the device that freezes. A 500ms setInterval heartbeat works
// everywhere: a tick that arrives >2.5s late means the thread was blocked.
// Background tabs throttle timers, so ticks while hidden are ignored.

export const FREEZE_DIAG_KEY = "cls_freeze_diag_v1";
export const FREEZE_DIAG_CAP = 5;
export const FREEZE_DIAG_LONGTASK_MS = 1000;
export const FREEZE_DIAG_HEARTBEAT_MS = 500;
export const FREEZE_DIAG_HEARTBEAT_GAP_MS = 2500;

/** One stall record: when, how long the thread was stuck, where, doing what. */
export function freezeRecord({ at, blockedMs, screen, action }) {
  return {
    at: typeof at === "number" ? at : Date.now(),
    blockedMs: Math.round(blockedMs),
    screen: screen || null,
    action: action || null,
  };
}

export function freezeShouldPersist(blockedMs) {
  return blockedMs >= FREEZE_DIAG_LONGTASK_MS;
}

/** Append a record to a list, newest last, capped. Pure. */
export function pushFreezeRecord(records, record, cap = FREEZE_DIAG_CAP) {
  return [...(records || []), record].slice(-cap);
}

export function readFreezeDiag(storage) {
  try {
    const raw = storage?.getItem(FREEZE_DIAG_KEY);
    if (!raw) return { state: null, stalls: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { state: null, stalls: [] };
    return { state: parsed.state || null, stalls: Array.isArray(parsed.stalls) ? parsed.stalls : [] };
  } catch {
    return { state: null, stalls: [] };
  }
}

export function writeFreezeDiag(storage, diag) {
  try {
    storage?.setItem(FREEZE_DIAG_KEY, JSON.stringify(diag));
    return true;
  } catch {
    return false;
  }
}

/** Short label for the element a player last touched (id wins, then text). */
export function actionLabelFromTarget(target) {
  if (!target) return null;
  if (target.id) return `#${target.id}`;
  const action = target.dataset?.action || target.getAttribute?.("data-action");
  if (action) return action;
  const text = (target.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (text) return text;
  return target.tagName ? target.tagName.toLowerCase() : null;
}

/**
 * Create the diagnostic. `deps` lets tests inject fakes; production passes
 * the real globals. Returns { noteScreen, noteAction, handleStall, state, start }.
 * Nothing here throws: every external touch is guarded.
 */
export function createFreezeDiag(deps = {}) {
  const {
    now = () => Date.now(),
    perfNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    storage = null,
    setIntervalFn = (fn, ms) => setInterval(fn, ms),
    PerformanceObserverCtor = typeof PerformanceObserver !== "undefined" ? PerformanceObserver : null,
    documentRef = typeof document !== "undefined" ? document : null,
    windowRef = typeof window !== "undefined" ? window : null,
  } = deps;

  let screen = null;
  let action = null;
  let ring = [];
  let started = false;
  let lastTick = null;

  const persistState = () => {
    const prev = readFreezeDiag(storage);
    writeFreezeDiag(storage, { ...prev, state: { screen, action, at: now() } });
  };

  const record = (blockedMs) => {
    const rec = freezeRecord({ at: now(), blockedMs, screen, action });
    ring = pushFreezeRecord(ring, rec, 20);
    if (freezeShouldPersist(blockedMs)) {
      const prev = readFreezeDiag(storage);
      writeFreezeDiag(storage, { ...prev, stalls: pushFreezeRecord(prev.stalls, rec) });
      try {
        console.warn("[freeze-diag] main thread stalled", rec);
      } catch {
        /* ignore */
      }
    }
    return rec;
  };

  const diag = {
    noteScreen(name) {
      if (!name) return;
      screen = name;
      persistState();
    },
    noteAction(label) {
      if (!label) return;
      action = String(label).slice(0, 80);
      persistState();
    },
    handleStall(blockedMs) {
      return record(blockedMs);
    },
    state() {
      return { screen, action, ring: [...ring] };
    },
    start() {
      if (started) return diag;
      started = true;
      try {
        // Surface last session's stalls once, so a freeze that ended in a
        // refresh is visible in the console on the next boot (and in any
        // remote debug session) without opening storage by hand.
        const prev = readFreezeDiag(storage);
        if (prev.stalls.length) {
          try {
            console.warn("[freeze-diag] stalls recorded last session", prev);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
      try {
        if (windowRef) windowRef.__CLS_FREEZE_DIAG = diag;
      } catch {
        /* ignore */
      }
      try {
        documentRef?.addEventListener?.("click", (e) => diag.noteAction(actionLabelFromTarget(e.target)), true);
        documentRef?.addEventListener?.("change", (e) => diag.noteAction(actionLabelFromTarget(e.target)), true);
      } catch {
        /* ignore */
      }
      try {
        if (PerformanceObserverCtor) {
          const po = new PerformanceObserverCtor((list) => {
            for (const entry of list.getEntries()) {
              if (entry.duration >= FREEZE_DIAG_LONGTASK_MS) record(entry.duration);
            }
          });
          po.observe({ entryTypes: ["longtask"] });
        }
      } catch {
        /* ignore */
      }
      try {
        lastTick = perfNow();
        setIntervalFn(() => {
          const t = perfNow();
          const gap = t - lastTick;
          lastTick = t;
          if (gap >= FREEZE_DIAG_HEARTBEAT_GAP_MS && documentRef?.visibilityState !== "hidden") {
            record(gap - FREEZE_DIAG_HEARTBEAT_MS);
          }
        }, FREEZE_DIAG_HEARTBEAT_MS);
      } catch {
        /* ignore */
      }
      return diag;
    },
  };
  return diag;
}

/** Production entry: one shared diagnostic, started once. */
let shared = null;
export function startFreezeDiag(deps) {
  if (!shared) shared = createFreezeDiag(deps);
  shared.start();
  return shared;
}
export function freezeDiag() {
  return shared;
}
