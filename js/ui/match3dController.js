/**
 * 3D-S1B: the Gold game screen's optional 3D court (docs/implementation/3D-MATCH-VIEWER-PHASE0-AUDIT.md §12).
 *
 * The 2D CourtView stays the default and keeps rendering the whole time, so it is the permanent fallback. This module
 * only OWNS the 3D side: it buffers the events GameSim already emits (raw + derived), normalizes and choreographs
 * them once per possession, and plays them through the S1A MatchPresentationView ("compress, never queue": if the
 * view falls behind it skips ahead, it never makes GameSim wait and never runs ahead of it).
 *
 * It never decides a game fact. Pause and speed are READ from the sim every frame (getSim / getSpeed) instead of being
 * pushed from app.js, so there are no extra pause/speed hooks to forget. WebGL missing or any 3D failure ends in 2D
 * with a note, never a blank court.
 */
import { CourtView3D } from "../engine/court3d.js";
import { ARENA_IDS, ARENA_PRESETS, arenaOptionsFromPage, normalizeArenaId, writeArenaPref } from "../engine/arena/arenaPresets.js";
import { createPresentationEventNormalizer } from "../match/presentation/normalizer.js";
import { choreograph } from "../match/presentation/choreographer.js";
import { createMatchPresentationView } from "../match/presentation/matchView.js";
import { VALID_TIME_SCALES } from "../match/presentation/scheduler.js";
import { createUiGate } from "../match/presentation/uiGate.js";

/**
 * Derived events arrive in causal order: a possession's raw events first, then (from onTick) the POSSESSION_START that announces the
 * NEXT possession with the snapshot taken after this one. So a start HEADS the group that follows it: drain what was buffered before
 * it is added. A period/match end closes the group it follows: drain after it is added.
 */
const HEADS_A_GROUP = new Set(["POSSESSION_START"]);
const CLOSES_A_GROUP = new Set(["PERIOD_END", "MATCH_END"]);

/** A shot's own text and score wait for the ball to land (the end of its beat); everything earlier is already true. */
const LANDING_KINDS = new Set(["score", "miss", "dunk"]);

const scaleOf = (speed) => (VALID_TIME_SCALES.includes(speed) ? speed : 1);

export function createMatch3dController({
  host,
  twoD,
  button,
  arenaSelect = null, // optional <select>: which venue the 3D court is drawn in (a device preference; never touches the match)
  note = null,
  getSim,
  getSpeed = () => 1,
  L = (zh) => zh,
  seed = 0,
  cues = null, // arena sound (createArenaCues): reacts to landed shots and foul beats; null = silent
  createView3d = (el) => CourtView3D.create(el, arenaOptionsFromPage()),
  clock, // optional: the presentation clock (tests inject a fake one); default performance.now()
  raf = (fn) => globalThis.requestAnimationFrame(fn),
  caf = (id) => globalThis.cancelAnimationFrame(id),
} = {}) {
  const normalizer = createPresentationEventNormalizer();
  let view = null; // MatchPresentationView while 3D is on
  let rafId = 0;
  let batch = 0;
  let available = false;
  let wanted = false; // the player's choice, kept across matches
  let opening = false;
  const gate = createUiGate(); // feed + scoreboard follow the presentation cursor while the 3D court is up
  let lastSeq = null; // GameSim's newest event number: what a tick snapshot belongs after
  let heldSeq = null; // the live shot on screen: its own text/score are released when its beat ends
  let cursorSeq = null; // the newest GameSim event the presentation cursor has reached (QA / measurement)

  const releaseHeld = () => {
    if (heldSeq === null) return;
    gate.release(heldSeq);
    heldSeq = null;
  };
  /** The cursor passed `beat`: everything GameSim said up to it may now be shown. A live shot holds back only its own line. */
  const onBeatApplied = (beat, { skipped }) => {
    releaseHeld();
    if (!skipped && beat?.kind === "foul") cues?.foul(); // a foul that is actually being played, not one the cursor skipped past
    const seq = beat?.simSeq;
    if (!Number.isInteger(seq)) return;
    if (cursorSeq === null || seq > cursorSeq) cursorSeq = seq;
    if (!skipped && LANDING_KINDS.has(beat.kind)) {
      gate.release(seq - 1);
      heldSeq = seq;
    } else {
      gate.release(seq);
    }
  };

  const paintButton = () => {
    if (!button) return;
    button.hidden = !available;
    button.setAttribute("aria-pressed", String(!!view));
    button.textContent = view ? L("2D 视图", "2D view") : L("3D 视图", "3D view");
    if (arenaSelect) arenaSelect.hidden = !view;
  };
  if (arenaSelect) {
    arenaSelect.innerHTML = ARENA_IDS.map((id) => `<option value="${id}">${L(ARENA_PRESETS[id].label.zh, ARENA_PRESETS[id].label.en)}</option>`).join("");
    arenaSelect.value = arenaOptionsFromPage().arena;
    arenaSelect.setAttribute("aria-label", L("球馆", "Arena"));
  }
  const say = (zh, en) => {
    if (!note) return;
    note.hidden = !zh;
    note.textContent = zh ? L(zh, en) : "";
  };

  function flush() {
    if (!view) return;
    const { plays } = choreograph(normalizer.flush(), { seed: `${seed}:${batch++}` });
    if (plays.length) view.loadPlays(plays);
  }

  function loop() {
    rafId = 0;
    if (!view) return;
    try {
      const paused = !!getSim()?.paused;
      if (paused && !view.scheduler.isPaused()) view.pause();
      else if (!paused && view.scheduler.isPaused()) view.resume();
      view.setTimeScale(scaleOf(getSpeed()));
      view.tick();
    } catch (err) {
      console.warn("[match3d] playback failed, back to 2D:", err);
      disable();
      say("3D 出了问题，已切回 2D。", "3D hit a problem — switched back to 2D.");
      return;
    }
    rafId = raf(loop);
  }

  async function enable() {
    if (view || opening || !available) return false;
    opening = true;
    wanted = true;
    let view3d;
    try {
      view3d = await createView3d(host);
    } catch (err) {
      console.warn("[match3d] 3D unavailable:", err);
      wanted = false;
      opening = false;
      say("当前设备不支持 3D，已保留 2D。", "3D is not available on this device — staying on 2D.");
      paintButton();
      return false;
    }
    opening = false;
    if (!available) { // the player left the game while WebGL was loading
      view3d.dispose?.();
      return false;
    }
    say("", "");
    normalizer.reset();
    view3d.onShotLanded = (landing) => cues?.shotLanded(landing); // fired by the court when the ball reaches the rim
    view = createMatchPresentationView({ view3d, clock, onBeatApplied, onPlayEnded: releaseHeld });
    gate.setEnabled(true);
    host.hidden = false;
    if (twoD) twoD.hidden = true;
    view3d.resize?.();
    const snap = getSim()?.snapshot?.();
    if (snap) view3d.render(snap);
    paintButton();
    rafId = raf(loop);
    return true;
  }

  function disable({ keepWanted = false } = {}) {
    if (!keepWanted) wanted = false;
    if (rafId) caf(rafId);
    rafId = 0;
    const v = view;
    view = null;
    heldSeq = null;
    gate.setEnabled(false); // 2D shows everything that was waiting, at once
    try { v?.dispose(); } catch { /* already gone */ }
    normalizer.reset();
    host.hidden = true;
    host.innerHTML = "";
    if (twoD) twoD.hidden = false;
    paintButton();
  }

  button?.addEventListener("click", () => (view ? disable() : enable()));
  arenaSelect?.addEventListener("change", async () => {
    let storage = null;
    try { storage = typeof localStorage !== "undefined" ? localStorage : null; } catch { storage = null; }
    writeArenaPref(storage, normalizeArenaId(arenaSelect.value));
    if (view) { // same match, new venue: reopen the view, the presentation restarts from the next possession
      disable({ keepWanted: true });
      await enable();
    }
  });

  return {
    /** Raw GameSim emit payload (call for every event). Ignored while 3D is off. */
    feedRaw(evt) {
      if (Number.isInteger(evt?.seq)) lastSeq = evt.seq;
      if (view) normalizer.feedRaw(evt);
    },
    /**
     * Show `fn` (a feed line, the scoreboard) when the 3D cursor reaches the event it belongs to, or now when 3D is off. `seq`
     * defaults to the newest event (a tick snapshot is "after" the events before it). Never use it for gameplay controls.
     */
    defer(fn, seq = lastSeq) { return gate.defer(seq, fn); },
    /** Fast simulation / skip: drop the animation backlog and show the latest authoritative state now. */
    syncNow() {
      heldSeq = null;
      try { view?.interrupt(); } catch { /* nothing playing */ }
      gate.flush();
    },
    get gatePending() { return gate.pending; },
    get cursorSeq() { return cursorSeq; },
    /** Derived domain event ({ type, meta, snapshot }). A possession start heads the next group, a period/match end closes the last. */
    feedDerived(evt) {
      if (!view || !evt) return;
      if (HEADS_A_GROUP.has(evt.type)) flush();
      normalizer.feedDerived(evt);
      if (CLOSES_A_GROUP.has(evt.type)) flush();
    },
    /** A new match began: only Gold offers 3D; the player's 2D/3D choice carries over. */
    startMatch({ offer }) {
      available = !!offer;
      batch = 0;
      disable({ keepWanted: true });
      if (available && wanted) enable();
    },
    /** The match is over / the screen is left: release WebGL and show 2D again. */
    stop() { available = false; disable({ keepWanted: true }); },
    get active() { return !!view; },
    /** True when 3D has nothing left to play (the scheduler is idle and no play is waiting). For tests and QA to drain. */
    get idle() { return !view || view.scheduler.isIdle(); },
    enable,
    disable,
  };
}
