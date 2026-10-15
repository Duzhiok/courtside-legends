/**
 * Full-court view with half-court push progression.
 * Home basket at bottom, away basket at top.
 * Possession advances the whole 5 into the attacking half — not static matchup dots.
 */

/** Frontcourt slots: y=0 near rim, y=100 near half-court. */
const SETS = {
  balanced: [
    { x: 50, y: 22 },
    { x: 18, y: 48 },
    { x: 82, y: 48 },
    { x: 32, y: 68 },
    { x: 68, y: 72 },
  ],
  triangle: [
    { x: 50, y: 18 },
    { x: 28, y: 42 },
    { x: 72, y: 42 },
    { x: 50, y: 58 },
    { x: 16, y: 70 },
  ],
  smallball: [
    { x: 50, y: 28 },
    { x: 10, y: 55 },
    { x: 90, y: 55 },
    { x: 30, y: 78 },
    { x: 70, y: 78 },
  ],
  iso_heavy: [
    { x: 58, y: 35 },
    { x: 16, y: 62 },
    { x: 84, y: 62 },
    { x: 28, y: 82 },
    { x: 78, y: 84 },
  ],
  grind: [
    { x: 50, y: 26 },
    { x: 34, y: 46 },
    { x: 66, y: 46 },
    { x: 40, y: 66 },
    { x: 60, y: 66 },
  ],
  motion: [
    { x: 46, y: 30 },
    { x: 18, y: 52 },
    { x: 82, y: 52 },
    { x: 34, y: 74 },
    { x: 66, y: 76 },
  ],
  pace_space: [
    { x: 50, y: 32 },
    { x: 8, y: 58 },
    { x: 92, y: 58 },
    { x: 26, y: 80 },
    { x: 74, y: 80 },
  ],
  morale_boost: [
    { x: 50, y: 24 },
    { x: 22, y: 50 },
    { x: 78, y: 50 },
    { x: 36, y: 70 },
    { x: 64, y: 70 },
  ],
};

const DEF_GAP = [
  { dx: 0, dy: -14 },
  { dx: 8, dy: -11 },
  { dx: -8, dy: -11 },
  { dx: 10, dy: -8 },
  { dx: -10, dy: -8 },
];

export class CourtView {
  constructor(rootEl) {
    this.root = rootEl;
    this.tokens = new Map();
    this._built = false;
    this._lastLineup = "";
    this._possession = null;
    this._phaseStart = 0;
    this._handlerIdx = 0;
    this._raf = 0;
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
        <div class="ball-dot" id="court-ball"></div>
        <div class="court-tokens" id="court-tokens"></div>
        <div class="court-label" id="court-formation">推进中</div>
      </div>
    `;
    this.stage = this.root.querySelector("#court-stage");
    this.tokenBox = this.root.querySelector("#court-tokens");
    this.ball = this.root.querySelector("#court-ball");
    this.formLabel = this.root.querySelector("#court-formation");
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

  render(snap) {
    this.ensureDom();
    const offSide = snap.possession;
    const attackingUp = offSide === "home"; // home attacks toward top (away hoop)
    const off = attackingUp ? snap.home : snap.away;
    const def = attackingUp ? snap.away : snap.home;
    const tacticId = off.tactic?.id || "balanced";
    const slots = SETS[tacticId] || SETS.balanced;

    if (this._possession !== offSide) {
      this._possession = offSide;
      this._phaseStart = performance.now();
      this._handlerIdx = Math.floor(Math.random() * Math.min(3, off.onCourt.length || 1));
    }

    const elapsed = performance.now() - this._phaseStart;
    // 0–1 over ~2.6s: bring ball up → set offense
    const phase = clamp(elapsed / 2600, 0, 1);
    const phaseName =
      phase < 0.25 ? "发球推进" : phase < 0.55 ? "过半场" : phase < 0.85 ? "落位进攻" : "终结回合";

    this.formLabel.textContent = `${off.name} · ${off.tactic?.name || "均衡"} · ${
      attackingUp ? "主队攻向客队篮" : "客队攻向主队篮"
    } · ${phaseName}`;

    const lineup = [
      ...off.onCourt.map((p) => p.id),
      ...def.onCourt.map((p) => p.id),
      offSide,
      tacticId,
    ].join("|");
    if (lineup !== this._lastLineup) {
      this._lastLineup = lineup;
      this.rebuildTokens(off, def, attackingUp);
    }

    const t = performance.now() / 1000;
    const offPos = [];

    off.onCourt.forEach((p, i) => {
      const slot = slots[i] || slots[0];
      const base = this.toCourt(slot, attackingUp, phase);
      // slight live drift once set
      const drift = phase > 0.7 ? 1 : 0.35;
      const x = base.x + Math.sin(t * 1.4 + i) * 1.2 * drift;
      const y = base.y + Math.cos(t * 1.1 + i * 0.9) * 1.0 * drift;
      offPos[i] = { x, y };
      const side = attackingUp ? "home" : "away";
      this.moveToken(`${side}-${p.id}`, x, y, p, true, shortName(p.name));
    });

    def.onCourt.forEach((p, i) => {
      const slot = slots[i] || slots[0];
      const gap = DEF_GAP[i] || DEF_GAP[0];
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
    });

    // Ball travels with push: handler index
    const hi = clamp(this._handlerIdx, 0, Math.max(0, off.onCourt.length - 1));
    const hp = offPos[hi] || offPos[0];
    if (this.ball && hp) {
      this.ball.style.left = `${hp.x}%`;
      this.ball.style.top = `${hp.y}%`;
      this.ball.classList.toggle("in-frontcourt", phase > 0.45);
    }

    // Keep animating between sim ticks
    cancelAnimationFrame(this._raf);
    if (phase < 1) {
      this._raf = requestAnimationFrame(() => this.render(snap));
    }
  }

  rebuildTokens(off, def, attackingUp) {
    this.tokenBox.innerHTML = "";
    this.tokens.clear();
    const add = (p, side, isOff) => {
      const el = document.createElement("div");
      el.className = `court-token ${side} ${isOff ? "offense" : "defense"}`;
      el.innerHTML = `
        <div class="tok-avatar">
          <img src="${p.photo || ""}" alt="" loading="lazy" referrerpolicy="no-referrer"
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
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
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
