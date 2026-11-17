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
import { createPresentationEventNormalizer } from "../match/presentation/normalizer.js";
import { choreograph } from "../match/presentation/choreographer.js";
import { createMatchPresentationView } from "../match/presentation/matchView.js";
import { VALID_TIME_SCALES } from "../match/presentation/scheduler.js";

/** A derived event of these types closes the previous possession: flush what was buffered. */
const FLUSH_ON = new Set(["POSSESSION_START", "PERIOD_END", "MATCH_END"]);

const scaleOf = (speed) => (VALID_TIME_SCALES.includes(speed) ? speed : 1);

export function createMatch3dController({
  host,
  twoD,
  button,
  note = null,
  getSim,
  getSpeed = () => 1,
  L = (zh) => zh,
  seed = 0,
  createView3d = (el) => CourtView3D.create(el),
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

  const paintButton = () => {
    if (!button) return;
    button.hidden = !available;
    button.setAttribute("aria-pressed", String(!!view));
    button.textContent = view ? L("2D 视图", "2D view") : L("3D 视图", "3D view");
  };
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
    view = createMatchPresentationView({ view3d });
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
    try { v?.dispose(); } catch { /* already gone */ }
    normalizer.reset();
    host.hidden = true;
    host.innerHTML = "";
    if (twoD) twoD.hidden = false;
    paintButton();
  }

  button?.addEventListener("click", () => (view ? disable() : enable()));

  return {
    /** Raw GameSim emit payload (call for every event). Ignored while 3D is off. */
    feedRaw(evt) { if (view) normalizer.feedRaw(evt); },
    /** Derived domain event ({ type, meta, snapshot }). A possession/period boundary flushes the buffered plays. */
    feedDerived(evt) {
      if (!view || !evt) return;
      normalizer.feedDerived(evt);
      if (FLUSH_ON.has(evt.type)) flush();
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
    enable,
    disable,
  };
}
