/**
 * Full-court view with half-court push progression.
 * Home basket at bottom, away basket at top.
 * Possession advances the whole 5 into the attacking half — not static matchup dots.
 *
 * M3 (ROADMAP §6): the three independent rAF loops (push loop, shot arc,
 * dunk drive) + the skillPop timeout now run on one unified animation queue
 * (js/engine/courtAnimationQueue.js). CourtView's external interface is
 * unchanged — render(snap) / onShot / onDunk / skillPop — so rollback is
 * just restoring files. Animations are pure DOM: they never touch the sim,
 * and with effects off (or prefers-reduced-motion) the court renders the
 * same final positions statically, so the score is identical either way.
 */

import { photoUrl } from "../data/photo.js";
import { createAnimationQueue } from "./courtAnimationQueue.js";

/**
 * Frontcourt slots: y=0 near rim, y=100 near half-court.
 * Index order is always C → PF → SF → SG → PG (rim to perimeter),
 * so point guards never sit under the basket.
 */
const SLOT_POS = ["C", "PF", "SF", "SG", "PG"];

const SETS = {
  balanced: [
    { x: 50, y: 20 }, // C paint
    { x: 22, y: 42 }, // PF elbow/weak
    { x: 78, y: 44 }, // SF wing
    { x: 16, y: 68 }, // SG wing
    { x: 50, y: 78 }, // PG top
  ],
  triangle: [
    { x: 50, y: 16 },
    { x: 28, y: 40 },
    { x: 72, y: 40 },
    { x: 18, y: 62 },
    { x: 50, y: 72 },
  ],
  smallball: [
    { x: 50, y: 26 },
    { x: 14, y: 50 },
    { x: 86, y: 50 },
    { x: 28, y: 74 },
    { x: 72, y: 78 },
  ],
  iso_heavy: [
    { x: 50, y: 24 },
    { x: 18, y: 48 },
    { x: 82, y: 50 },
    { x: 30, y: 72 },
    { x: 62, y: 70 }, // PG / iso handler high
  ],
  grind: [
    { x: 50, y: 22 },
    { x: 34, y: 44 },
    { x: 66, y: 44 },
    { x: 28, y: 66 },
    { x: 55, y: 70 },
  ],
  motion: [
    { x: 50, y: 26 },
    { x: 18, y: 48 },
    { x: 82, y: 48 },
    { x: 30, y: 72 },
    { x: 70, y: 76 },
  ],
  pace_space: [
    { x: 50, y: 28 },
    { x: 10, y: 54 },
    { x: 90, y: 54 },
    { x: 24, y: 76 },
    { x: 76, y: 80 },
  ],
  morale_boost: [
    { x: 50, y: 22 },
    { x: 22, y: 46 },
    { x: 78, y: 46 },
    { x: 34, y: 68 },
    { x: 66, y: 72 },
  ],
  // B24: the six most-used tactics get their own frontcourt shape.
  // Slots are C → PF → SF → SG → PG; y=0 near rim, y=100 near half-court.
  pnr_spam: [
    { x: 56, y: 46 }, // C up high to screen, stacked under the handler
    { x: 18, y: 50 },
    { x: 86, y: 52 },
    { x: 16, y: 76 },
    { x: 56, y: 80 }, // PG handler above the screen
  ],
  post_up: [
    { x: 68, y: 12 }, // C deep on the block
    { x: 30, y: 30 }, // PF high opposite, ready to flash
    { x: 82, y: 48 },
    { x: 12, y: 72 },
    { x: 50, y: 80 },
  ],
  five_out: [
    { x: 50, y: 58 }, // C as the top hub — nobody under the rim
    { x: 12, y: 56 },
    { x: 88, y: 56 },
    { x: 26, y: 82 },
    { x: 74, y: 82 },
  ],
  twin_towers: [
    { x: 38, y: 14 }, // both bigs on the blocks
    { x: 64, y: 16 },
    { x: 82, y: 48 },
    { x: 16, y: 70 },
    { x: 50, y: 80 },
  ],
  paint_attack: [
    { x: 50, y: 14 }, // three inside: C, PF, SF all crash the paint
    { x: 30, y: 26 },
    { x: 72, y: 30 },
    { x: 18, y: 68 },
    { x: 62, y: 76 },
  ],
  transition: [
    { x: 42, y: 42 }, // bigs trailing
    { x: 62, y: 38 },
    { x: 86, y: 66 }, // wings filling the lanes, ahead of the ball
    { x: 14, y: 70 },
    { x: 50, y: 86 }, // PG pushing ahead with the ball
  ],
};

const DEF_GAP = [
  { dx: 0, dy: -12 }, // on C
  { dx: 7, dy: -10 },
  { dx: -7, dy: -10 },
  { dx: 9, dy: -8 },
  { dx: 0, dy: -9 }, // on PG — stay between ball and rim, not under
];

/** Place on-court players onto C→PG slots by playPos / natural pos. */
function lineupForSlots(onCourt) {
  const list = [...(onCourt || [])];
  const used = new Set();
  const out = [];
  for (const want of SLOT_POS) {
    const hit =
      list.find((p) => !used.has(p.id) && normPos(p.playPos || p.pos) === want) ||
      list.find((p) => !used.has(p.id) && nearPos(normPos(p.playPos || p.pos), want));
    if (hit) {
      out.push(hit);
      used.add(hit.id);
    } else {
      out.push(null);
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    const fill = list.find((p) => !used.has(p.id));
    if (fill) {
      out[i] = fill;
      used.add(fill.id);
    }
  }
  return out.filter(Boolean);
}

function normPos(pos) {
  const p = String(pos || "SF").toUpperCase();
  if (SLOT_POS.includes(p)) return p;
  if (p.includes("G") && p.startsWith("P")) return "PG";
  if (p.includes("G")) return "SG";
  if (p.includes("C")) return "C";
  if (p.includes("F") && p.startsWith("P")) return "PF";
  return "SF";
}

function nearPos(have, want) {
  const order = SLOT_POS;
  const a = order.indexOf(have);
  const b = order.indexOf(want);
  return a >= 0 && b >= 0 && Math.abs(a - b) === 1;
}

function handlerSlotIndex(ordered) {
  const pg = ordered.findIndex((p) => normPos(p.playPos || p.pos) === "PG");
  if (pg >= 0) return pg;
  const sg = ordered.findIndex((p) => normPos(p.playPos || p.pos) === "SG");
  if (sg >= 0) return sg;
  return Math.max(0, ordered.length - 1);
}

const SIMPLE_MODE_KEY = "courtside-simple-players";
const EFFECTS_KEY = "courtside-court-effects";

function loadSimpleMode() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SIMPLE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function loadEffects() {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(EFFECTS_KEY) !== "0" : true;
  } catch {
    return true;
  }
}

function detectReducedMotion() {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** Quadratic-bezier point for arcs (shot flight, pass arc): same curve both use. */
function arcPoint(from, to, u) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(9, len * 0.12);
  const cx = (from.x + to.x) / 2 + (-dy / len) * bulge;
  const cy = (from.y + to.y) / 2 + (dx / len) * bulge;
  const v = 1 - u;
  return {
    x: v * v * from.x + 2 * v * u * cx + u * u * to.x,
    y: v * v * from.y + 2 * v * u * cy + u * u * to.y,
  };
}

export class CourtView {
  constructor(rootEl, opts = {}) {
    this.root = rootEl;
    this.labels = {
      simple: opts.labels?.simple || "人物：简易",
      photo: opts.labels?.photo || "人物：照片",
      fxOn: opts.labels?.fxOn || "动效：开",
      fxOff: opts.labels?.fxOff || "动效：关",
    };
    this.tokens = new Map();
    this._built = false;
    this._lastLineup = "";
    this._possession = null;
    this._phaseStart = 0;
    this._phase = 1;
    this._handlerIdx = 0;
    this.simple = loadSimpleMode();
    this._effects = loadEffects();
    this._reducedMotion = detectReducedMotion();
    this._lastSnap = null;
    this._shot = null;
    this._dunk = null;
    this._pass = null;
    this._suppressShotFor = null;
    this._lastTokenPos = new Map();
    this._lastHandlerPos = null;
    this._lastAttackingUp = true;
    this._trails = new Map(); // token key -> last positions (newest last), max 3
    this._holderKey = null;
    // One queue owns every animation (push loop, shot arc, dunk drive, pass
    // arc, skill pops, feedback cleanup) — no independent rAF/timeout left.
    this.queue = createAnimationQueue();
    this._reducedListener = null;
    try {
      if (typeof matchMedia === "function") {
        const mq = matchMedia("(prefers-reduced-motion: reduce)");
        this._reducedListener = (e) => this.setReducedMotion(!!e.matches);
        if (mq.addEventListener) mq.addEventListener("change", this._reducedListener);
      }
    } catch {
      /* non-browser or old browser: the constructor-time check stands */
    }
  }

  /** Animations (arcs, drives, trails, pops) run only when effects are on and motion is not reduced. The halo is a state marker, not motion, so it stays. */
  _animOn() {
    return this._effects && !this._reducedMotion;
  }

  /** Flip between photo avatars and simple capsule players. */
  setSimpleMode(v) {
    this.simple = !!v;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SIMPLE_MODE_KEY, this.simple ? "1" : "0");
      }
    } catch {
      /* private mode: the toggle still works for this session */
    }
    if (this.modeBtn) {
      this.modeBtn.textContent = this.simple ? this.labels.simple : this.labels.photo;
    }
    this._lastLineup = "";
    if (this._lastSnap) this.render(this._lastSnap);
  }

  /** Turn court animations on/off (persisted). Off = static positions every tick: tokens, halo and formation stay live; only interpolation/arcs/drives/pops stop, so the score is identical either way. */
  setEffectsEnabled(v) {
    this._effects = !!v;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(EFFECTS_KEY, this._effects ? "1" : "0");
      }
    } catch {
      /* private mode: the toggle still works for this session */
    }
    if (this.fxBtn) this.fxBtn.textContent = this._effects ? this.labels.fxOn : this.labels.fxOff;
    if (!this._effects) this._stopAllMotion();
    if (this._lastSnap) this.render(this._lastSnap);
  }

  /** prefers-reduced-motion: degrade or turn animations off (also honoured live via the media-query listener). */
  setReducedMotion(v) {
    const next = !!v;
    if (next === this._reducedMotion) return;
    this._reducedMotion = next;
    if (this.stage && this.stage.dataset) {
      this.stage.dataset.reducedMotion = next ? "1" : "0";
    }
    if (next) this._stopAllMotion();
    if (this._lastSnap) this.render(this._lastSnap);
  }

  /** Cancel every in-flight animation and clear transient visuals (used when effects/reduced-motion turn animations off). */
  _stopAllMotion() {
    this.queue.cancelAll();
    this._shot = null;
    this._dunk = null;
    this._pass = null;
    this._clearPassArc();
    if (this.stage) {
      this.stage.classList.remove("shot-made", "shot-missed");
    }
    if (this.ball) {
      this.ball.style.transition = "";
      this.ball.style.width = "";
      this.ball.style.height = "";
    }
    for (const el of this.tokens.values()) {
      el.classList.remove("skill-pop", "sub-flash", "dunking");
      el.style.transition = "";
      el.style.transform = "";
    }
  }

  /** Drive the animation queue manually (tests and non-rAF environments). */
  tick(now) {
    this.queue.tick(now);
  }

  ensureDom() {
    if (this._built) return;
    this.root.innerHTML = `
      <div class="fullcourt" id="court-stage">
        <div class="fc-markings">
          <div class="fc-baseline top"></div>
          <div class="fc-baseline bottom"></div>
          <div class="fc-sideline left"></div>
          <div class="fc-sideline right"></div>
          <div class="fc-half"></div>
          <div class="fc-circle"></div>
          <div class="fc-key top"></div>
          <div class="fc-key bottom"></div>
          <div class="fc-ft-circle top"></div>
          <div class="fc-ft-circle bottom"></div>
          <div class="fc-hoop top"></div>
          <div class="fc-hoop bottom"></div>
          <div class="fc-backboard top"></div>
          <div class="fc-backboard bottom"></div>
          <div class="fc-zone-tag top">客队篮筐</div>
          <div class="fc-zone-tag bottom">主队篮筐</div>
        </div>
        <svg class="court-fx" id="court-fx" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <g id="court-trails"></g>
          <path id="court-pass-arc" d="" />
        </svg>
        <div class="ball-dot" id="court-ball"></div>
        <div class="court-tokens" id="court-tokens"></div>
        <div class="court-label" id="court-formation">推进中</div>
        <button class="court-fx-btn" id="court-fx-btn" type="button"></button>
        <button class="court-mode-btn" id="court-mode-btn" type="button"></button>
      </div>
    `;
    this.stage = this.root.querySelector("#court-stage");
    this.tokenBox = this.root.querySelector("#court-tokens");
    this.ball = this.root.querySelector("#court-ball");
    this.formLabel = this.root.querySelector("#court-formation");
    this.fxSvg = this.root.querySelector("#court-fx");
    this.trailsG = this.root.querySelector("#court-trails");
    this.passArcPath = this.root.querySelector("#court-pass-arc");
    this.modeBtn = this.root.querySelector("#court-mode-btn");
    if (this.modeBtn) {
      this.modeBtn.textContent = this.simple ? this.labels.simple : this.labels.photo;
      this.modeBtn.addEventListener("click", () => this.setSimpleMode(!this.simple));
    }
    this.fxBtn = this.root.querySelector("#court-fx-btn");
    if (this.fxBtn) {
      this.fxBtn.textContent = this._effects ? this.labels.fxOn : this.labels.fxOff;
      this.fxBtn.addEventListener("click", () => this.setEffectsEnabled(!this._effects));
    }
    if (this.stage && this.stage.dataset) {
      this.stage.dataset.reducedMotion = this._reducedMotion ? "1" : "0";
    }
    this._built = true;
  }

  /** Map frontcourt-relative slot → full court % coords. attackingUp = home has ball. */
  toCourt(slot, attackingUp, phase) {
    // Start (phase 0): backcourt near own basket; End (phase 1): set frontcourt
    const startY = attackingUp ? 78 + slot.y * 0.12 : 22 - slot.y * 0.12;
    const endY = attackingUp
      ? 6 + (slot.y / 100) * 40 // top half
      : 94 - (slot.y / 100) * 40; // bottom half
    const y = lerp(startY, endY, easeOut(phase));
    const startX = 50 + (slot.x - 50) * 0.35;
    const x = lerp(startX, slot.x, easeOut(phase));
    return { x: clamp(x, 8, 92), y: clamp(y, 6, 94) };
  }

  /** Paint one frame from a snapshot (pure projection: never mutates the snapshot or the sim). */
  render(snap) {
    this.ensureDom();
    const isNewTick = snap !== this._lastSnap;
    this._lastSnap = snap;
    this._paint(snap, isNewTick);
    // Keep animating between sim ticks while the push is in progress — one
    // queue job, not a bare rAF. Effects off / reduced motion: phase is 1,
    // so nothing is scheduled and the frame above is the final position.
    this.queue.cancel("push");
    if (this._phase < 1 && this._animOn()) {
      this.queue.enqueue({
        id: "push",
        priority: 0,
        step: () => {
          this._paint(snap, false);
          return this._phase >= 1;
        },
      });
    }
  }

  _paint(snap, isNewTick) {
    const offSide = snap.possession;
    const attackingUp = offSide === "home"; // home attacks toward top (away hoop)
    const off = attackingUp ? snap.home : snap.away;
    const def = attackingUp ? snap.away : snap.home;
    const tacticId = off.tactic?.id || "balanced";
    const slots = SETS[tacticId] || SETS.balanced;

    const offOrdered = lineupForSlots(off.onCourt);
    const defOrdered = lineupForSlots(def.onCourt);

    if (this._possession !== offSide) {
      this._possession = offSide;
      this._phaseStart = performance.now();
      this._handlerIdx = handlerSlotIndex(offOrdered);
      // A new possession means any dunk's follow-up score already came and
      // went; never let a stale suppression swallow a later jump shot.
      this._suppressShotFor = null;
    }

    const elapsed = performance.now() - this._phaseStart;
    // 0–1 over ~2.6s: bring ball up → set offense. Effects off / reduced
    // motion: jump straight to the set positions (still a live court, not a
    // static board — tokens, halo and formation stay current every tick).
    const phase = this._animOn() ? clamp(elapsed / 2600, 0, 1) : 1;
    this._phase = phase;
    // Simple players bob while the team is still pushing up the court.
    if (this.stage) this.stage.classList.toggle("pushing", phase < 1);
    const phaseName =
      phase < 0.25 ? "发球推进" : phase < 0.55 ? "过半场" : phase < 0.85 ? "落位进攻" : "终结回合";

    this.formLabel.textContent = `${off.name} · ${off.tactic?.name || "均衡"} · ${
      attackingUp ? "主队攻向客队篮" : "客队攻向主队篮"
    } · ${phaseName}`;

    const lineup = [
      ...offOrdered.map((p) => `${p.id}:${normPos(p.playPos || p.pos)}`),
      ...defOrdered.map((p) => `${p.id}:${normPos(p.playPos || p.pos)}`),
      offSide,
      tacticId,
    ].join("|");
    if (lineup !== this._lastLineup) {
      this._lastLineup = lineup;
      this.rebuildTokens(off, def, attackingUp);
      this._handlerIdx = handlerSlotIndex(offOrdered);
    }

    const t = performance.now() / 1000;
    const offPos = [];

    offOrdered.forEach((p, i) => {
      const slot = slots[i] || slots[slots.length - 1];
      const base = this.toCourt(slot, attackingUp, phase);
      // slight live drift once set
      const drift = phase > 0.7 ? 1 : 0.35;
      const x = base.x + Math.sin(t * 1.4 + i) * 1.2 * drift;
      const y = base.y + Math.cos(t * 1.1 + i * 0.9) * 1.0 * drift;
      offPos[i] = { x, y };
      const side = attackingUp ? "home" : "away";
      this.moveToken(`${side}-${p.id}`, x, y, p, true, shortName(p.name));
      this._lastTokenPos.set(`${side}-${p.id}`, { x, y });
    });

    defOrdered.forEach((p, i) => {
      const slot = slots[i] || slots[slots.length - 1];
      const gap = DEF_GAP[i] || DEF_GAP[DEF_GAP.length - 1];
      // Defense also transitions, staying between ball and their own basket
      const base = this.toCourt(
        { x: clamp(slot.x + gap.dx, 10, 90), y: clamp(slot.y + gap.dy, 5, 95) },
        attackingUp,
        Math.min(1, phase + 0.08)
      );
      const x = base.x + Math.sin(t * 1.2 + i + 2) * 1.0;
      const y = base.y + Math.cos(t * 1.35 + i) * 0.9;
      const side = attackingUp ? "away" : "home";
      this.moveToken(`${side}-${p.id}`, x, y, p, false, shortName(p.name));
      this._lastTokenPos.set(`${side}-${p.id}`, { x, y });
    });

    // Ball with the PG / primary handler slot (not whoever happened to be index 0)
    const hi = clamp(this._handlerIdx, 0, Math.max(0, offOrdered.length - 1));
    const hp = offPos[hi] || offPos[offPos.length - 1];
    if (hp) {
      this._lastHandlerPos = hp;
      this._lastAttackingUp = attackingUp;
    }
    // Ball-holder halo: the token where the ball sits gets a ring, so the eye
    // finds the handler without reading names. Static CSS, not motion — it
    // stays even with effects off / reduced motion.
    const handler = offOrdered[hi];
    if (handler) {
      this._setBallHolder(`${attackingUp ? "home" : "away"}-${handler.id}`);
    }
    // Movement trails: record on new ticks only (not on push re-paints), so a
    // trail is one dot per possession step, not one per animation frame.
    if (isNewTick && this._animOn()) this._recordTrails();
    // A shot arc, a dunk drive or a pass arc owns the ball while it plays;
    // render must not fight any of them.
    if (this.ball && hp && !this._shot && !this._dunk && !this._pass) {
      this.ball.style.left = `${hp.x}%`;
      this.ball.style.top = `${hp.y}%`;
      this.ball.classList.toggle("in-frontcourt", phase > 0.45);
    }
  }

  _setBallHolder(key) {
    if (this._holderKey === key) return;
    const prev = this._holderKey && this.tokens.get(this._holderKey);
    if (prev) prev.classList.remove("ball-holder");
    this._holderKey = key;
    const el = this.tokens.get(key);
    if (el) el.classList.add("ball-holder");
  }

  /** One trail dot per token per tick (max 3, fading with age), drawn in the SVG overlay. */
  _recordTrails() {
    if (!this.trailsG) return;
    for (const [key, pos] of this._lastTokenPos) {
      const hist = this._trails.get(key) || [];
      const last = hist[hist.length - 1];
      if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > 0.8) {
        hist.push({ x: pos.x, y: pos.y });
        if (hist.length > 3) hist.shift();
        this._trails.set(key, hist);
      }
    }
    let html = "";
    for (const hist of this._trails.values()) {
      // Oldest first so the newest dot paints on top.
      hist.forEach((p, i) => {
        const age = hist.length - 1 - i; // 0 = newest
        const r = 1.6 - age * 0.35;
        const op = 0.55 - age * 0.18;
        html += `<circle class="trail-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(2)}" opacity="${op.toFixed(2)}" />`;
      });
    }
    this.trailsG.innerHTML = html;
  }

  /** Trails reset every possession (the domain adapter calls this on POSSESSION_START). */
  clearTrails() {
    this._trails.clear();
    if (this.trailsG) this.trailsG.innerHTML = "";
  }

  _clearPassArc() {
    this._pass = null;
    if (this.passArcPath && this.passArcPath.setAttribute) {
      this.passArcPath.setAttribute("d", "");
    }
  }

  /** Animate the ball from the shooter to the rim on a jump shot. */
  onShot(shot) {
    // The dunk drive already showed this make; the score event that follows
    // a dunk must not also play a jump-shot arc for the same basket.
    if (shot?.shooterId && this._suppressShotFor === shot.shooterId) {
      this._suppressShotFor = null;
      return;
    }
    if (!this.ball || !this._lastHandlerPos) return;
    if (!this._animOn()) return; // effects off / reduced motion: no arc, ball stays put
    const shootSide = this._lastAttackingUp ? "home" : "away";
    const from =
      (shot?.shooterId && this._lastTokenPos.get(`${shootSide}-${shot.shooterId}`)) ||
      this._lastHandlerPos;
    const to = this._lastAttackingUp ? { x: 50, y: 6 } : { x: 50, y: 94 };
    // A shot ends any in-flight pass; the ball is the shooter's now.
    this.queue.cancel("pass");
    this._clearPassArc();
    this._shot = {
      from: { ...from },
      to,
      start: performance.now(),
      made: !!shot?.made,
      // Direction away from the rim, toward mid-court (for the miss bounce).
      out: this._lastAttackingUp ? 1 : -1,
      feedbackShown: false,
    };
    // The ball's CSS transition would smear per-frame arc updates into lag.
    this.ball.style.transition = "none";
    this._shotFrame(this._shot.start);
    if (this._shot) {
      this.queue.enqueue({
        id: "shot",
        priority: 10,
        step: (now) => {
          this._shotFrame(now);
          return !this._shot;
        },
      });
    }
  }

  /**
   * One frame of the shot arc. Returns true when the arc is finished.
   * The queue drives it in the browser; tests call it directly.
   */
  _shotFrame(now) {
    const s = this._shot;
    if (!s || !this.ball) return true;
    const FLIGHT = 750;
    const END = s.made ? 150 : 300;
    const elapsed = now - s.start;
    if (elapsed < FLIGHT) {
      const u = elapsed / FLIGHT;
      const p = arcPoint(s.from, s.to, u);
      // Height reads as size on a top-down court: swell, then fall.
      const size = 12 + 8 * Math.sin(Math.PI * u);
      this.ball.style.left = `${p.x}%`;
      this.ball.style.top = `${p.y}%`;
      this.ball.style.width = `${size}px`;
      this.ball.style.height = `${size}px`;
      return false;
    }
    // Shot feedback: the rim flashes made (green) or missed (amber) once the
    // ball arrives; it clears on a delayed queue job, not a bare timeout.
    if (!s.feedbackShown) {
      s.feedbackShown = true;
      if (this.stage) {
        this.stage.classList.add(s.made ? "shot-made" : "shot-missed");
        this.queue.enqueue({
          id: "shot-feedback",
          delay: 700,
          step: () => {
            this.stage.classList.remove("shot-made", "shot-missed");
            return true;
          },
        });
      }
    }
    if (elapsed < FLIGHT + END) {
      const v = (elapsed - FLIGHT) / END;
      this.ball.style.left = `${s.to.x}%`;
      if (s.made) {
        // Through the net: shrink at the rim.
        this.ball.style.top = `${s.to.y}%`;
        const size = 12 - 4 * v;
        this.ball.style.width = `${size}px`;
        this.ball.style.height = `${size}px`;
      } else {
        // Off the iron: bounce toward mid-court, settle just off the rim.
        this.ball.style.top = `${s.to.y + s.out * (5 * Math.sin(Math.PI * v) + 4 * v)}%`;
        this.ball.style.width = "12px";
        this.ball.style.height = "12px";
      }
      return false;
    }
    // Land exactly on the resting spot, even if frames skipped the
    // ending phase: at the rim when made, just short of it when missed.
    this.ball.style.left = `${s.to.x}%`;
    this.ball.style.top = `${s.to.y + (s.made ? 0 : s.out * 4)}%`;
    this._shot = null;
    this.ball.style.transition = "";
    this.ball.style.width = "";
    this.ball.style.height = "";
    return true;
  }

  /** Drive the dunker token to the rim. Returns false when there is no
      token to animate (no render yet, or the player is not on court):
      the caller then falls back to the plain shot arc via the score event
      that follows every dunk. */
  onDunk(playerId) {
    const side = this._lastAttackingUp ? "home" : "away";
    const key = `${side}-${playerId}`;
    const el = this.tokens.get(key);
    if (!el || !this.ball) return false;
    if (!this._animOn()) return false;
    const from = this._lastTokenPos.get(key) || this._lastHandlerPos;
    if (!from) return false;
    // A dunk owns the ball from here; drop any in-flight shot arc or pass.
    this.queue.cancel("shot");
    this.queue.cancel("pass");
    this._clearPassArc();
    this._shot = null;
    this._suppressShotFor = playerId;
    this._dunk = {
      key,
      el,
      from: { ...from },
      to: this._lastAttackingUp ? { x: 50, y: 6 } : { x: 50, y: 94 },
      start: performance.now(),
      rimShaken: false,
    };
    // The token's CSS glide would smear per-frame drive updates into lag.
    el.style.transition = "none";
    el.classList.add("dunking");
    this.ball.style.transition = "none";
    this._dunkFrame(this._dunk.start);
    if (this._dunk) {
      this.queue.enqueue({
        id: "dunk",
        priority: 10,
        step: (now) => {
          this._dunkFrame(now);
          return !this._dunk;
        },
      });
    }
    return true;
  }

  /**
   * One frame of the dunk drive. Returns true when the drive is finished.
   * The queue drives it in the browser; tests call it directly.
   */
  _dunkFrame(now) {
    const d = this._dunk;
    if (!d || !this.ball) return true;
    const DRIVE = 420;
    const NET = 150;
    const SETTLE = 200;
    const elapsed = now - d.start;
    const easeOut = (u) => 1 - Math.pow(1 - u, 3);
    if (elapsed < DRIVE) {
      const u = easeOut(elapsed / DRIVE);
      const x = d.from.x + (d.to.x - d.from.x) * u;
      const y = d.from.y + (d.to.y - d.from.y) * u;
      d.el.style.left = `${x}%`;
      d.el.style.top = `${y}%`;
      d.el.style.transform = `translate(-50%, -50%) scale(${1 + 0.5 * u})`;
      this.ball.style.left = `${x}%`;
      this.ball.style.top = `${y}%`;
      return false;
    }
    if (elapsed < DRIVE + NET) {
      const v = (elapsed - DRIVE) / NET;
      d.el.style.left = `${d.to.x}%`;
      d.el.style.top = `${d.to.y}%`;
      d.el.style.transform = "translate(-50%, -50%) scale(1.5)";
      // Through the net: the ball shrinks at the rim, and the rim shakes once.
      this.ball.style.left = `${d.to.x}%`;
      this.ball.style.top = `${d.to.y}%`;
      const size = 12 - 6 * v;
      this.ball.style.width = `${size}px`;
      this.ball.style.height = `${size}px`;
      if (!d.rimShaken) {
        d.rimShaken = true;
        this._shakeRim();
      }
      return false;
    }
    if (elapsed < DRIVE + NET + SETTLE) {
      d.el.style.transform = "translate(-50%, -50%) scale(1.25)";
      this.ball.style.left = `${d.to.x}%`;
      this.ball.style.top = `${d.to.y}%`;
      return false;
    }
    d.el.style.transition = "";
    d.el.style.transform = "";
    d.el.classList.remove("dunking");
    this.ball.style.transition = "";
    this.ball.style.width = "";
    this.ball.style.height = "";
    this._dunk = null;
    return true;
  }

  /** Animate a pass: the ball arcs from passer to receiver (meta.pass from the engine). Returns false when there is nothing to draw. */
  onPass(pass) {
    if (!this.ball || !this._lastHandlerPos) return false;
    if (!this._animOn()) return false;
    const side = this._lastAttackingUp ? "home" : "away";
    const from = this._lastTokenPos.get(`${side}-${pass?.passerId}`);
    const to = this._lastTokenPos.get(`${side}-${pass?.receiverId}`);
    if (!from || !to || (from.x === to.x && from.y === to.y)) return false;
    this._pass = { from: { ...from }, to: { ...to }, start: performance.now() };
    this.ball.style.transition = "none";
    this.queue.enqueue({
      id: "pass",
      priority: 5,
      step: (now) => this._passFrame(now),
    });
    return true;
  }

  /** One frame of the pass arc. Returns true when the ball has arrived. */
  _passFrame(now) {
    const p = this._pass;
    if (!p || !this.ball) return true;
    const FLIGHT = 380;
    const elapsed = now - p.start;
    if (elapsed >= FLIGHT) {
      this.ball.style.left = `${p.to.x}%`;
      this.ball.style.top = `${p.to.y}%`;
      this._clearPassArc();
      return true;
    }
    const u = elapsed / FLIGHT;
    const pt = arcPoint(p.from, p.to, u);
    this.ball.style.left = `${pt.x}%`;
    this.ball.style.top = `${pt.y}%`;
    if (this.passArcPath && this.passArcPath.setAttribute) {
      const mid = arcPoint(p.from, p.to, 0.5);
      this.passArcPath.setAttribute(
        "d",
        `M ${p.from.x} ${p.from.y} Q ${mid.x} ${mid.y} ${p.to.x} ${p.to.y}`
      );
    }
    return false;
  }

  _shakeRim() {
    if (!this.stage) return;
    const hoop = this.stage.querySelector(this._lastAttackingUp ? ".fc-hoop.top" : ".fc-hoop.bottom");
    if (!hoop) return;
    hoop.classList.remove("rim-shake");
    void hoop.offsetWidth; // restart the animation when dunks come in quick succession
    hoop.classList.add("rim-shake");
  }

  /** Pulse the token of a player whose signature skill just triggered. No
      text label: the feed already names the skill, and a label would need
      i18n plumbing for every skill id. The token is found by id on either
      side, so no offense/defense side is needed. */
  skillPop(playerId) {
    if (!this._animOn()) return;
    const el = this.tokens.get(`home-${playerId}`) || this.tokens.get(`away-${playerId}`);
    if (!el) return;
    el.classList.add("skill-pop");
    this.queue.enqueue({
      id: `skill-${playerId}`,
      delay: 900,
      step: () => {
        el.classList.remove("skill-pop");
        return true;
      },
    });
  }

  /** Brief highlight for a player who just checked in (SUBSTITUTION derived event). Same queue-delayed removal as skillPop, different class. */
  flashToken(playerId) {
    if (!this._animOn()) return;
    const el = this.tokens.get(`home-${playerId}`) || this.tokens.get(`away-${playerId}`);
    if (!el) return;
    el.classList.add("sub-flash");
    this.queue.enqueue({
      id: `flash-${playerId}`,
      delay: 900,
      step: () => {
        el.classList.remove("sub-flash");
        return true;
      },
    });
  }

  rebuildTokens(off, def, attackingUp) {
    this.tokenBox.innerHTML = "";
    this.tokens.clear();
    this._holderKey = null;
    const add = (p, side, isOff) => {
      const el = document.createElement("div");
      el.className = `court-token ${side} ${isOff ? "offense" : "defense"}${this.simple ? " simple" : ""}`;
      // Simple mode: a CSS humanoid player (head + jersey torso + arms
      // + legs) instead of a photo. Names, points and roles stay
      // identical, so moveToken() keeps working unchanged. This is the
      // programmatic player prototype (DECISIONS D4 temp default) until
      // the production art pipeline is chosen.
      el.innerHTML = this.simple
        ? `
        <div class="tok-figure">
          <div class="tok-head"></div>
          <div class="tok-torso">${normPos(p.playPos || p.pos)}</div>
          <div class="tok-arm left"></div>
          <div class="tok-arm right"></div>
          <div class="tok-leg left"></div>
          <div class="tok-leg right"></div>
          <span class="tok-pts">${p.stats?.pts ?? 0}</span>
        </div>
        <span class="tok-name" title="${p.name}">${shortName(p.name)}</span>
        <span class="tok-role">${isOff ? "攻" : "防"}</span>
      `
        : `
        <div class="tok-avatar">
          <img src="${photoUrl(p)}" alt="" loading="lazy" referrerpolicy="no-referrer"
            onerror="this.style.opacity=0.2" />
          <span class="tok-pts">${p.stats?.pts ?? 0}</span>
        </div>
        <span class="tok-name" title="${p.name}">${shortName(p.name)}</span>
        <span class="tok-role">${isOff ? "攻" : "防"}</span>
      `;
      this.tokenBox.appendChild(el);
      this.tokens.set(`${side}-${p.id}`, el);
    };
    const offSide = attackingUp ? "home" : "away";
    const defSide = attackingUp ? "away" : "home";
    off.onCourt.forEach((p) => add(p, offSide, true));
    def.onCourt.forEach((p) => add(p, defSide, false));
  }

  moveToken(key, x, y, p, isOff, name) {
    const el = this.tokens.get(key);
    if (!el) return;
    // A dunking token drives itself; render must not drag it back to its slot.
    if (!el.classList.contains("dunking")) {
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
    }
    const pts = el.querySelector(".tok-pts");
    if (pts) pts.textContent = String(p.stats?.pts ?? 0);
    const nm = el.querySelector(".tok-name");
    if (nm) nm.textContent = name;
    el.classList.toggle("hot", (p.stats?.pts || 0) >= 15);
    el.classList.toggle("offense", isOff);
    el.classList.toggle("defense", !isOff);
  }
}

function shortName(name) {
  const s = String(name || "");
  // Prefer last token of English / Chinese name, keep readable length
  const parts = s.replace(/·/g, " ").trim().split(/\s+/);
  const last = parts[parts.length - 1] || s;
  return last.length > 6 ? last.slice(0, 6) : last;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
