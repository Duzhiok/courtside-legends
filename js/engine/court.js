/**
 * Animated half-court stage: headshot tokens + formation slots.
 * Prepared for later sprite/action layers.
 */

const OFFENSE_FORMATIONS = {
  balanced: [
    { x: 50, y: 78 },
    { x: 22, y: 62 },
    { x: 78, y: 62 },
    { x: 35, y: 42 },
    { x: 65, y: 38 },
  ],
  triangle: [
    { x: 50, y: 72 },
    { x: 28, y: 48 },
    { x: 72, y: 48 },
    { x: 50, y: 28 },
    { x: 18, y: 70 },
  ],
  smallball: [
    { x: 50, y: 80 },
    { x: 12, y: 55 },
    { x: 88, y: 55 },
    { x: 30, y: 35 },
    { x: 70, y: 35 },
  ],
  iso_heavy: [
    { x: 55, y: 55 },
    { x: 18, y: 70 },
    { x: 82, y: 70 },
    { x: 25, y: 30 },
    { x: 75, y: 28 },
  ],
  grind: [
    { x: 50, y: 68 },
    { x: 30, y: 55 },
    { x: 70, y: 55 },
    { x: 40, y: 35 },
    { x: 60, y: 35 },
  ],
  motion: [
    { x: 45, y: 75 },
    { x: 20, y: 50 },
    { x: 80, y: 50 },
    { x: 35, y: 30 },
    { x: 65, y: 32 },
  ],
  pace_space: [
    { x: 50, y: 82 },
    { x: 10, y: 48 },
    { x: 90, y: 48 },
    { x: 28, y: 28 },
    { x: 72, y: 28 },
  ],
  morale_boost: [
    { x: 50, y: 76 },
    { x: 24, y: 58 },
    { x: 76, y: 58 },
    { x: 38, y: 36 },
    { x: 62, y: 36 },
  ],
};

const DEFENSE_OFFSET = [
  { dx: 0, dy: -10 },
  { dx: 6, dy: -8 },
  { dx: -6, dy: -8 },
  { dx: 4, dy: -6 },
  { dx: -4, dy: -6 },
];

export class CourtView {
  constructor(rootEl) {
    this.root = rootEl;
    this.tokens = new Map();
    this.ball = null;
    this._built = false;
    this._lastSig = "";
  }

  ensureDom() {
    if (this._built) return;
    this.root.innerHTML = `
      <div class="court-stage" id="court-stage">
        <div class="court-paint"></div>
        <div class="court-key"></div>
        <div class="court-arc"></div>
        <div class="hoop"></div>
        <div class="ball-dot" id="court-ball"></div>
        <div class="court-tokens" id="court-tokens"></div>
        <div class="court-label" id="court-formation">阵型</div>
      </div>
      <div class="play-feed" id="play-feed"></div>
    `;
    this.stage = this.root.querySelector("#court-stage");
    this.tokenBox = this.root.querySelector("#court-tokens");
    this.ball = this.root.querySelector("#court-ball");
    this.formLabel = this.root.querySelector("#court-formation");
    this._built = true;
  }

  render(snap) {
    this.ensureDom();
    const offSide = snap.possession;
    const off = offSide === "home" ? snap.home : snap.away;
    const def = offSide === "home" ? snap.away : snap.home;
    const tacticId = off.tactic?.id || "balanced";
    const slots = OFFENSE_FORMATIONS[tacticId] || OFFENSE_FORMATIONS.balanced;
    this.formLabel.textContent = `${off.name} · ${off.tactic?.name || "均衡"} · ${
      offSide === "home" ? "主队进攻" : "客队进攻"
    }`;

    const sig = [
      ...off.onCourt.map((p) => p.id),
      ...def.onCourt.map((p) => p.id),
      tacticId,
      offSide,
    ].join("|");

    if (sig !== this._lastSig) {
      this._lastSig = sig;
      this.rebuildTokens(off, def, offSide);
    }

    // Animate positions with slight jitter for "live" feel
    const t = Date.now() / 1000;
    off.onCourt.forEach((p, i) => {
      const slot = slots[i] || slots[0];
      const jitterX = Math.sin(t * 1.7 + i) * 1.8;
      const jitterY = Math.cos(t * 1.3 + i * 1.1) * 1.5;
      this.moveToken(`${offSide}-${p.id}`, slot.x + jitterX, slot.y + jitterY, p, true);
    });
    def.onCourt.forEach((p, i) => {
      const slot = slots[i] || slots[0];
      const offst = DEFENSE_OFFSET[i] || DEFENSE_OFFSET[0];
      const jitterX = Math.sin(t * 1.5 + i + 3) * 1.4;
      const jitterY = Math.cos(t * 1.6 + i) * 1.2;
      const sideKey = offSide === "home" ? "away" : "home";
      this.moveToken(
        `${sideKey}-${p.id}`,
        clamp(slot.x + offst.dx + jitterX, 6, 94),
        clamp(slot.y + offst.dy + jitterY, 8, 92),
        p,
        false
      );
    });

    // Ball near ball-handler (highest pts on offense as proxy, or first)
    const handler = [...off.onCourt].sort((a, b) => b.stats.pts - a.stats.pts)[0] || off.onCourt[0];
    const hi = off.onCourt.findIndex((p) => p.id === handler?.id);
    const hs = slots[hi >= 0 ? hi : 0];
    if (this.ball && hs) {
      this.ball.style.left = `calc(${hs.x}% + 14px)`;
      this.ball.style.top = `calc(${hs.y}% - 6px)`;
    }
  }

  rebuildTokens(off, def, offSide) {
    this.tokenBox.innerHTML = "";
    this.tokens.clear();
    const add = (p, side, isOff) => {
      const el = document.createElement("div");
      el.className = `court-token ${side} ${isOff ? "offense" : "defense"}`;
      el.innerHTML = `
        <img src="${p.photo || ""}" alt="" loading="lazy" referrerpolicy="no-referrer"
          onerror="this.style.display='none'" />
        <span class="tok-pts">${p.stats?.pts ?? 0}</span>
        <span class="tok-name">${p.name.split("·").pop().slice(-4)}</span>
        <span class="tok-role">${isOff ? "攻" : "防"}</span>
      `;
      this.tokenBox.appendChild(el);
      this.tokens.set(`${side}-${p.id}`, el);
    };
    const defSide = offSide === "home" ? "away" : "home";
    off.onCourt.forEach((p) => add(p, offSide, true));
    def.onCourt.forEach((p) => add(p, defSide, false));
  }

  moveToken(key, x, y, p, isOff) {
    const el = this.tokens.get(key);
    if (!el) return;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    const pts = el.querySelector(".tok-pts");
    if (pts) pts.textContent = String(p.stats?.pts ?? 0);
    el.classList.toggle("hot", (p.stats?.pts || 0) >= 15);
    el.classList.toggle("offense", isOff);
    el.classList.toggle("defense", !isOff);
  }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
