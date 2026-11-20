/**
 * The real live match wiring on a fake clock, with no browser: a real GameSim stepped one possession at a time (its own
 * possessionDelay() is the clock), the real domain-event adapter, the real match3dController (normalizer, choreographer, scheduler,
 * presentation view) and a recording stand-in for the WebGL court. It mirrors app.js: raw events -> controller.feedRaw, onTick ->
 * adapter.observeTick -> controller.feedDerived; the scoreboard/feed paint the moment an event arrives.
 *
 * Used by tests/presentationSync.test.js and scripts/measure/presentation-sync.mjs, so what the script prints is what the tests guard.
 */
import { GameSim } from "../../js/engine/sim.js";
import { createDomainEventAdapter } from "../../js/engine/domainEvents.js";
import { createMatch3dController } from "../../js/ui/match3dController.js";
import { snapshotTo3DPositions } from "../../js/engine/court3d.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";
import { realTeam } from "./realGame.js";

const FRAME_MS = 16;
const el = () => ({ hidden: false, innerHTML: "", textContent: "", setAttribute() {}, addEventListener() {} });

export async function playThroughController({ gated = true, hold = null, skipDrain = false, speed = 1, possessions = 60, seed = "sync-1", home = realTeam("CHI", 1996), away = realTeam("SEA", 1996), view3dHooks = {} } = {}) {
  let now = 0;
  let possessionNo = 0;
  let domScore = { home: 0, away: 0 };
  const feedShownAt = new Map(); // seq -> when its feed line appeared on screen
  const scoreAtSeq = new Map(); // seq -> the score GameSim reported with that event
  let pendingPeak = 0;
  let spoilerMs = 0; // the scoreboard showed an event the presentation cursor had not reached yet
  let behindRun = 0;
  let behindMaxMs = 0; // longest stretch the scoreboard trailed the cursor (a live shot's points wait for the ball to land)
  let lastRendered = null; // the snapshot the 3D court is built from (court3d._snap)
  const shotsSim = []; // every shot GameSim emitted
  const shotsShown = []; // every shot the 3D court drew
  const frames = [];
  let owner = null; // who the 3D court has the ball with (mirrors court3d._ballOwner)
  let justRendered = false;
  const passes = []; // every pass the 3D court drew
  const openings = []; // every holder named right after a possession was drawn

  const spot = () => {
    const all = lastRendered ? snapshotTo3DPositions(lastRendered, 1, now / 1000) : [];
    return { all, handler: all.find((p) => p.isHandler)?.playerId ?? null };
  };
  const stub = {
    render(snap) {
      if (lastRendered && lastRendered.possession !== snap.possession) owner = null; // court3d: the other team has the ball now
      lastRendered = snap;
      justRendered = true;
      view3dHooks.render?.(snap, now);
    },
    setBallOwner(id) {
      const onOffense = !!spot().all.find((p) => p.playerId === id)?.isOffense;
      if (justRendered && id) openings.push({ id, onOffense });
      justRendered = false;
      stub.ownerPrior = owner;
      owner = id || null;
    },
    onPass({ passerId, receiverId, eventId }) {
      const { all } = spot();
      const on = (id) => !!all.find((p) => p.playerId === id)?.isOffense;
      passes.push({ passerId, receiverId, eventId, passerOnOffense: on(passerId), receiverOnOffense: on(receiverId), passerHadIt: owner === passerId });
      justRendered = false;
      owner = receiverId;
    },
    ownerPrior: null,
    onShot({ shooterId, made, eventId }) {
      justRendered = false;
      const { all, handler } = spot();
      const shooter = all.find((p) => p.playerId === shooterId);
      shotsShown.push({ t: now, shooterId, made, eventId, handler, ownerPrior: stub.ownerPrior, shooterOnOffense: !!shooter?.isOffense, domScore: { ...domScore }, possessionNo, ...(view3dHooks.onShotExtra?.() || {}) });
    },
    onDunk() {}, resize() {}, dispose() {},
    ...Object.fromEntries(Object.entries(view3dHooks).filter(([k]) => !["render", "onShotExtra"].includes(k)).map(([k, fn]) => [k, (...a) => fn(...a, now, spot())])),
  };

  const sim = new GameSim({
    home, away, youSide: "home", injuries: false, speed, rng: seededStream(hashSeed(seed)),
    onEvent: (e) => {
      ctl.feedRaw(e);
      if (e.meta?.shot && (e.type === "score" || e.type === "miss")) shotsSim.push({ t: now, seq: e.seq, shooterId: e.meta.shot.shooterId, made: e.type === "score", score: { ...e.score }, possessionNo });
      if (e.score) scoreAtSeq.set(e.seq, e.score.home + e.score.away);
      // app.js handleSimEvent: the feed line + paintScore(e) wait for the cursor (coach/system lines show at once); gated=false is the old behaviour
      const show = () => {
        feedShownAt.set(e.seq, now);
        if (e.score) domScore = { ...e.score };
      };
      if (e.type === "coach" && !e.meta?.pass) { // text at once; never the score it carries while 3D has the cursor
        feedShownAt.set(e.seq, now);
        if (!gated && e.score) domScore = { ...e.score };
      } else if (!gated) show();
      else ctl.defer(show, e.seq);
    },
    onTick: (snap) => {
      adapter.observeTick(snap);
      const paint = () => { domScore = { ...snap.score }; };
      if (gated) ctl.defer(paint); else paint(); // app.js paintScoreWithCursor
    },
    onEnd: () => {},
  });
  const adapter = createDomainEventAdapter({ onDomainEvent: (evt) => ctl.feedDerived(evt) });
  const ctl = createMatch3dController({
    host: el(), twoD: el(), button: null, note: null, seed,
    getSim: () => sim, getSpeed: () => speed, clock: () => now,
    createView3d: async () => stub,
    raf: (fn) => frames.push(fn), caf: () => { frames.length = 0; },
  });
  ctl.startMatch({ offer: true });
  await ctl.enable();

  let nextStep = 0;
  const holdSample = { start: null, end: null }; // what the screen shows when a pause begins and just before it ends
  const sample = () => ({ cursorSeq: ctl.cursorSeq, shown: { ...domScore }, feedLines: feedShownAt.size, pending: ctl.gatePending, beat: ctl.idle ? null : "playing" });
  const frame = () => {
    const fn = frames.shift();
    if (fn) fn();
    pendingPeak = Math.max(pendingPeak, ctl.gatePending);
    const implied = ctl.cursorSeq === null ? 0 : scoreAtSeq.get(ctl.cursorSeq); // the score of the event the presentation cursor has reached
    const shown = domScore.home + domScore.away;
    if (implied !== undefined && shown > implied) spoilerMs += FRAME_MS;
    if (implied !== undefined && shown < implied) { behindRun += FRAME_MS; behindMaxMs = Math.max(behindMaxMs, behindRun); } else behindRun = 0;
  };
  while (possessionNo < possessions && sim.quarter <= 4) {
    const holding = !!hold && now >= hold.from && now < hold.to; // the player pauses the game: GameSim waits, the screen must freeze
    if (hold && now >= hold.from && holdSample.start === null) holdSample.start = sample();
    if (hold && now >= hold.to - FRAME_MS && holdSample.end === null) holdSample.end = sample();
    if (holding) sim.paused = true;
    else if (hold && now >= hold.to && sim.paused) sim.paused = false;
    if (!holding && now >= nextStep) {
      sim.step();
      possessionNo++;
      nextStep = now + sim.possessionDelay();
      if (sim.paused && !holding) sim.paused = false; // a quarter break pauses GameSim; the player would press Continue
    }
    frame();
    now += FRAME_MS;
  }
  const drainEnd = now + 60000; // let 3D finish what it is still playing, so "never shown" means dropped, not "still running"
  while (!skipDrain && !ctl.idle && now < drainEnd) { frame(); now += FRAME_MS; }

  const pct = (xs, q) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : NaN);
  const bySeq = new Map(shotsSim.map((s) => [s.seq, s]));
  const paired = shotsShown.map((shown) => ({ shown, sim: bySeq.get(Number(String(shown.eventId).replace("sim:", ""))) })).filter((x) => x.sim);
  const lags = paired.map(({ shown, sim: s }) => shown.t - s.t);
  const lead = paired.map(({ shown, sim: s }) => shown.domScore.home + shown.domScore.away - (s.score.home + s.score.away));
  const ahead = paired.map(({ shown, sim: s }) => shown.possessionNo - s.possessionNo);
  const n = shotsShown.length;
  // Commentary-to-animation delay: when the shot's feed line appeared minus when the 3D court started that shot.
  const feedDelay = paired.map(({ shown }) => feedShownAt.get(Number(String(shown.eventId).replace("sim:", ""))) - shown.t).filter(Number.isFinite);
  return {
    shotsSim, shotsShown, paired, sim, ctl, passes, openings, holdSample, shownScore: () => ({ ...domScore }), feedLinesShown: () => feedShownAt.size,
    summary: {
      speed, wallSec: Math.round(now / 1000), shotsSim: shotsSim.length, shotsShown: n, neverShown: shotsSim.length - n,
      shownWithEventId: paired.length,
      feedAfterShotStartMedianMs: pct(feedDelay, 0.5), feedAfterShotStartP90Ms: pct(feedDelay, 0.9), feedAfterShotStartMaxMs: Math.max(0, ...feedDelay),
      feedBeforeShotStart: feedDelay.filter((d) => d < 0).length,
      scoreboardSpoilerMs: spoilerMs, scoreboardBehindMaxMs: behindMaxMs, gatePendingPeak: pendingPeak, gateStuck: ctl.gatePending,
      ballOwnerMismatches: shotsShown.filter((x) => x.ownerPrior !== x.shooterId).length,
      lagMedianMs: pct(lags, 0.5), lagP90Ms: pct(lags, 0.9), lagMaxMs: Math.max(0, ...lags),
      possessionsAheadMedian: pct(ahead, 0.5), possessionsAheadMax: Math.max(0, ...ahead),
      scoreboardAheadMedianPts: pct(lead, 0.5), scoreboardAheadMaxPts: Math.max(0, ...lead),
      shooterOnOffense: `${shotsShown.filter((s) => s.shooterOnOffense).length}/${n}`,
      ballWithShooter: `${shotsShown.filter((s) => s.ownerPrior === s.shooterId).length}/${n}`,
      passesShown: passes.length,
      passesFromTheHolder: `${passes.filter((p) => p.passerHadIt).length}/${passes.length}`,
      passesOnOffense: `${passes.filter((p) => p.passerOnOffense && p.receiverOnOffense).length}/${passes.length}`,
      openingHolderOnOffense: `${openings.filter((o) => o.onOffense).length}/${openings.length}`,
    },
  };
}
