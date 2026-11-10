/**
 * Legend Duel D3 — 2D court view (DOM).
 *
 * Renders the half-court for one duel: an SVG court (viewBox 0 0 100 50),
 * the two player markers, the ball, a score/stamina HUD, the offense /
 * defense choice buttons, and the recent-possession log. The view is
 * PRESENTATION ONLY:
 *
 * - Player movement (keyboard arrows/WASD, number keys, touch drag) moves
 *   markers on the court — and, since D3.1, feeds the spacing map: when a
 *   choice resolves, duelView passes spacingByOffense(current.takeover)
 *   into playPossession, so the live positions shift the make probability
 *   through the bounded, explainable spacing terms (open / contest / rim /
 *   beaten, each |≤3%|, total |≤6%|). A choice button (or its number key)
 *   is still the only way a possession resolves, and it goes through the
 *   onChoice callback the owner (duelView.js) wires to playPossession().
 *   The active terms are shown on the choice buttons and in the spot line
 *   so the player can see WHY a shot is better or worse from where they
 *   stand.
 * - The ball-flight after a shot is cosmetic: the event already resolved
 *   inside DuelSim; the ball animates from the recorded shot spot to the
 *   rim and back to the ball-handler. Input is never locked for it — acting
 *   early just re-renders the next possession.
 * - D3.2 — the player markers are bobblehead sprites (js/ui/duelSprites.js):
 *   a big head, a small body, a team-colour jersey, with poses for idle /
 *   moving / dribbling / shooting / contesting (celebrate lives on the
 *   result screen). Poses are derived from the same live state the court
 *   already renders (possession, lastShot, movement) and are swapped only
 *   when the action changes; they never touch outcomes. The ball is a
 *   separate element whose inner dot bounces while the ball-handler
 *   dribbles (class duel-ball--dribbling).
 * - Choice buttons keep their `data-duel-choice` hooks (4 on offense, 3 on
 *   defense) and the quit button keeps `#btn-duel-quit`, so the existing
 *   QA script (scripts/qa/duel.mjs) keeps working against the court.
 */
import { L } from "../i18n.js";
import { OFFENSE_CHOICES, DEFENSE_CHOICES } from "../duel/duelSim.js";
import {
  COURT,
  OFFENSE_LABEL,
  DEFENSE_LABEL,
  SPACING_LABEL,
  zoneAt,
  suggestedOffense,
  suggestedDefense,
  spacingForShot,
  moveControlled,
  moveControlledTo,
  controlledPoint,
  keyToMove,
  keyToChoice,
} from "../duel/duelTakeover.js";
import { duelSpriteHtml, spriteActionFor } from "./duelSprites.js";

function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const ZONE_LABEL = {
  paint: ["内线", "In the paint"],
  midrange: ["中距离", "Midrange"],
  outside: ["三分线外", "Beyond the arc"],
};

/** D3.1 — one spacing term as a chip, e.g. "空位 +3%" / "Open +3%". */
function spacingChipText(terms) {
  if (!terms || !terms.length) return "";
  return terms.map((term) => {
    const [zh, en] = SPACING_LABEL[term.key];
    const sign = term.value >= 0 ? "+" : "−";
    return `${L(zh, en)} ${sign}${Math.round(Math.abs(term.value) * 100)}%`;
  }).join(" · ");
}

function staminaBar(value) {
  return `
    <div style="height:8px;border-radius:4px;background:#1d2b23;overflow:hidden;">
      <div style="height:100%;width:${Math.round(value)}%;background:${value < 30 ? "#c0392b" : "#e8c15a"};"></div>
    </div>`;
}

/** D3.2 — one court player: a bobblehead sprite + the name tag below it. `appearance` is the challenger's own skin/hair (avatar challenger only, from opts.challengerAppearance); the legend always keeps the generic figure. */
function marker(duelist, side, action, appearance) {
  const name = duelist.displayName || duelist.name;
  return `<div class="duel-marker duel-marker-${side}" data-side="${side}">${duelSpriteHtml(duelist, { action, appearance })}<span class="duel-marker-tag">${esc(name)}</span></div>`;
}

/** Court lines for the 0 0 100 50 half-court (basket at top, y grows away). */
function courtSvg() {
  return `<svg id="duel-court" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(L("单挑半场", "Duel half-court"))}">
    <rect x="2" y="0" width="96" height="50" class="duel-court-floor" />
    <rect x="2" y="0" width="96" height="50" class="duel-court-line" />
    <rect x="38" y="0" width="24" height="14" class="duel-court-line duel-court-paint" />
    <circle cx="50" cy="14" r="6" class="duel-court-line" />
    <path d="M 26,4 A 24,24 0 0 1 74,4" class="duel-court-line" fill="none" />
    <line x1="26" y1="4" x2="26" y2="0" class="duel-court-line" />
    <line x1="74" y1="4" x2="74" y2="0" class="duel-court-line" />
    <line x1="44" y1="2" x2="56" y2="2" class="duel-court-board" />
    <circle cx="50" cy="4" r="1.8" class="duel-court-rim" />
    <path d="M 44,50 A 6,6 0 0 1 56,50" class="duel-court-line" fill="none" />
  </svg>`;
}

/**
 * Mount the court for one possession render. `opts`:
 * - getState() -> DuelSim state, getTakeover() -> takeover object,
 *   setTakeover(t) -> store the moved takeover (duelView's `current`).
 * - challenger / legend duelists, photoHtml(duelist, size) from duelView.
 * - challengerAppearance: the avatar challenger's own { skin, hair } (or
 *   null) — the legend's sprite never takes one.
 * - onChoice(choice) -> resolve one possession (playPossession in duelView).
 * - onQuit() -> abandon this duel without recording it.
 * Returns { destroy, updateMarkers }.
 */
export function mountDuelCourt(container, opts) {
  const state = opts.getState();
  const takeover = opts.getTakeover();
  const { challenger, legend } = opts;
  // The avatar challenger's own skin/hair (null = generic figure); the
  // legend always keeps the generic figure + team jersey.
  const challengerAppearance = opts.challengerAppearance || null;
  const myBall = state.possession === "a";
  const zone = zoneAt(controlledPoint(takeover).x, controlledPoint(takeover).y);
  const suggested = myBall ? suggestedOffense(zone) : suggestedDefense(zone);
  const log = state.log.slice(-6).reverse();
  const shot = takeover.lastShot;
  const flash = shot
    ? (shot.made
      ? L(`命中 +${shot.points}！`, `Made +${shot.points}!`)
      : L("没进", "Missed"))
    : "";
  // D3.2 — the sprite poses at mount: the just-resolved shot is still
  // flashing (its ~900ms window starts here), so the shooter shows the
  // release pose and everyone else watches.
  const shotUntil = shot ? Date.now() + 900 : 0;
  const initialActionA = spriteActionFor({ takeover, myBall, side: "a", shotActive: !!shot });
  const initialActionB = spriteActionFor({ takeover, myBall, side: "b", shotActive: !!shot });

  container.innerHTML = `
    <div class="duel-court-hud">
      <div class="duel-hud-side">
        <div>${opts.photoHtml(challenger, 56)}</div>
        <div><strong>${esc(challenger.displayName || challenger.name)}</strong></div>
        <div class="tiny">${esc(L("你", "You"))} · OVR ${esc(challenger.ovr)}</div>
        <div class="duel-score">${state.a.score}</div>
        ${staminaBar(state.a.stamina)}
        <div class="tiny">${esc(L("体力", "Stamina"))} ${Math.round(state.a.stamina)}</div>
      </div>
      <div class="duel-hud-mid">
        <div class="duel-vs">VS</div>
        <div class="tiny">${myBall ? esc(L("你的球权", "Your ball")) : esc(L("传奇球权", "Legend's ball"))}</div>
        <div class="tiny">${esc(L(`第 ${state.turn + 1} 回合`, `Possession ${state.turn + 1}`))}</div>
        ${flash ? `<div class="duel-flash">${esc(flash)}</div>` : ""}
      </div>
      <div class="duel-hud-side">
        <div>${opts.photoHtml(legend, 56)}</div>
        <div><strong>${esc(legend.displayName || legend.name)}</strong></div>
        <div class="tiny">${esc(L("传奇", "Legend"))} · OVR ${esc(legend.ovr)}</div>
        <div class="duel-score">${state.b.score}</div>
        ${staminaBar(state.b.stamina)}
        <div class="tiny">${esc(L("体力", "Stamina"))} ${Math.round(state.b.stamina)}</div>
      </div>
    </div>
    <div class="duel-court-wrap">
      ${courtSvg()}
      <div class="duel-court-markers">
        ${marker(challenger, "a", initialActionA, challengerAppearance)}
        ${marker(legend, "b", initialActionB)}
      </div>
    </div>
    <p class="tiny duel-spot-line" id="duel-spot-line"></p>
    <h3>${esc(myBall ? L("你的进攻选择", "Your offensive move") : L("你的防守策略", "Your defensive call"))}</h3>
    <div class="mode-grid">
      ${(myBall ? OFFENSE_CHOICES : DEFENSE_CHOICES).map((choice) => {
        const [zh, en, sub] = myBall ? OFFENSE_LABEL[choice] : DEFENSE_LABEL[choice];
        const isSuggested = choice === suggested;
        // D3.1: each offense button shows its live spacing terms (empty on defense).
        const chip = myBall ? spacingChipText(spacingForShot(takeover, choice).terms) : "";
        return `<button type="button" class="mode-card${isSuggested ? " duel-suggested" : ""}" data-duel-choice="${choice}"><strong>${esc(L(zh, en))}${isSuggested ? ` ${esc(L("· 推荐", "· Suggested"))}` : ""}</strong><span>${esc(sub)}</span><span class="duel-spacing" data-spacing-for="${choice}">${esc(chip)}</span></button>`;
      }).join("")}
    </div>
    <p class="tiny">${esc(myBall
      ? L("方向键 / WASD 移动球员，拖动球场也可以；数字键 1–4 出手。站位影响出手机会：空位和篮下位置提高命中率，贴防降低命中率——结果仍由球员属性和 DuelSim 计算。", "Move with arrow keys / WASD or drag the court; number keys 1–4 shoot. Positioning affects shot quality: open looks and rim position raise the make chance, tight contests lower it — DuelSim still decides the outcome.")
      : L("方向键 / WASD 移动防守人，拖动球场也可以；数字键 1–3 选防守站位。贴住持球人能干扰传奇的跳投，放空则会送出空位——结果仍由球员属性和 DuelSim 计算。", "Move the defender with arrow keys / WASD or drag the court; number keys 1–3 set the defense. Staying tight contests the legend's jumpers; sagging off gives up open looks — DuelSim still decides the outcome."))}</p>
    <p><button type="button" class="btn small ghost" id="btn-duel-quit">${esc(L("放弃本场（不计入战绩）", "Quit this duel (not recorded)"))}</button></p>
    ${log.length ? `<h3>${esc(L("最近回合", "Recent possessions"))}</h3><ul class="tiny">${log.map((e) => {
      const shooterName = e.shooter === "a" ? (challenger.displayName || challenger.name) : (legend.displayName || legend.name);
      const off = OFFENSE_LABEL[e.offense];
      const def = DEFENSE_LABEL[e.defense];
      return `<li>${esc(shooterName)} · ${esc(L(off[0], off[1]))} vs ${esc(L(def[0], def[1]))} — ${e.made ? esc(L(`命中 +${e.points}`, `Made +${e.points}`)) : esc(L("没进", "Missed"))}（${e.scoreA}-${e.scoreB}）</li>`;
    }).join("")}</ul>` : ""}
  `;

  // Markers live in the overlay div (HTML, not inside the SVG) so CSS
  // transforms + transitions work the same on desktop and mobile. Positions
  // are percentages of the court wrap, which shares the SVG's aspect ratio.
  const wrap = container.querySelector(".duel-court-wrap");
  const svg = container.querySelector("#duel-court");
  const markers = [...container.querySelectorAll(".duel-marker")];
  const [markerA, markerB] = markers;
  const ball = document.createElement("div");
  ball.className = "duel-ball";
  // D3.2 — the ball is a positioning box; the dot inside is what bounces
  // while the ball-handler dribbles (class duel-ball--dribbling). With a
  // just-resolved shot the ball is in the air, so dribbling starts once
  // the flight is over (see the shot block below).
  ball.innerHTML = '<span class="duel-ball-dot"></span>';
  wrap.appendChild(ball);
  if (!shot) ball.classList.add("duel-ball--dribbling");

  const posToPct = (p) => ({ x: (p.x / COURT.W) * 100, y: (p.y / COURT.H) * 100 });
  // Markers are positioned by left/top percentages of the court wrap (the
  // wrap keeps the SVG's 2:1 aspect ratio, so % lines up with court units);
  // the CSS translate(-50%,-50%) centers each marker on its point, and
  // left/top transitions animate the move.
  const place = (el, p) => {
    const pct = posToPct(p);
    el.style.left = `${pct.x}%`;
    el.style.top = `${pct.y}%`;
  };
  const placeBall = (p) => {
    const pct = posToPct(p);
    ball.style.left = `${pct.x}%`;
    ball.style.top = `${pct.y}%`;
  };

  // D3.2 — sprite pose state (view-owned transients, NOT game state):
  // movingUntil = the ~250ms window after a move (moving pose);
  // lastActionA/B = the pose last rendered (the SVG is only swapped when
  // the action changes, so the CSS bob is not restarted by every move).
  let movingUntil = 0;
  let moveTimer = null;
  let shotTimer = null;
  let lastActionA = initialActionA;
  let lastActionB = initialActionB;
  function scheduleMoveEnd() {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      moveTimer = null;
      updateMarkers();
    }, 260);
  }

  const spotLine = container.querySelector("#duel-spot-line");
  function updateMarkers() {
    const t = opts.getTakeover();
    const s = opts.getState();
    // t.ball is always the ball-handler's spot, t.defender the defender's:
    // on your ball the challenger has it, on the legend's ball the legend does.
    const challengerPos = s.possession === "a" ? t.ball : t.defender;
    const legendPos = s.possession === "a" ? t.defender : t.ball;
    place(markerA, challengerPos);
    place(markerB, legendPos);
    const z = zoneAt(controlledPoint(t).x, controlledPoint(t).y);
    const sug = s.possession === "a" ? suggestedOffense(z) : suggestedDefense(z);
    const [zoneZh, zoneEn] = ZONE_LABEL[z];
    const sugLabel = s.possession === "a" ? OFFENSE_LABEL[sug] : DEFENSE_LABEL[sug];
    // D3.1: live spacing breakdown — on offense, the suggested choice's
    // terms; on defense, what the defender's position does to the legend's
    // jump shot (tight = contested, sagged = open).
    if (s.possession === "a") {
      const terms = spacingChipText(spacingForShot(t, sug).terms);
      spotLine.textContent = terms
        ? L(`位置：${zoneZh} · 建议：${sugLabel[0]}（${terms}）`, `Spot: ${zoneEn} · Suggested: ${sugLabel[1]} (${terms})`)
        : L(`位置：${zoneZh} · 建议：${sugLabel[0]}`, `Spot: ${zoneEn} · Suggested: ${sugLabel[1]}`);
    } else {
      const terms = spacingChipText(spacingForShot(t, "outside").terms);
      spotLine.textContent = terms
        ? L(`站位：${zoneZh} · 建议：${sugLabel[0]} · ${terms}`, `Position: ${zoneEn} · Suggested: ${sugLabel[1]} · ${terms}`)
        : L(`站位：${zoneZh} · 建议：${sugLabel[0]}`, `Position: ${zoneEn} · Suggested: ${sugLabel[1]}`);
    }
    // D3.1: refresh the per-choice spacing chips as the player moves.
    container.querySelectorAll("[data-spacing-for]").forEach((el) => {
      const c = el.getAttribute("data-spacing-for");
      el.textContent = s.possession === "a" ? spacingChipText(spacingForShot(t, c).terms) : "";
    });
    if (!t.lastShot) placeBall(t.ball);
    markerA.classList.toggle("duel-has-ball", s.possession === "a");
    markerB.classList.toggle("duel-has-ball", s.possession === "b");
    // D3.2 — sprite poses from the same live state (see duelSprites.js):
    // the shooter holds the release pose while the shot flashes, the
    // controlled player bobs while moving, the defender contests when
    // tight, the ball-handler dribbles. The SVG is only swapped when the
    // action actually changes.
    const myBall = s.possession === "a";
    const shotActive = !!t.lastShot && Date.now() < shotUntil;
    const actionA = spriteActionFor({ takeover: t, myBall, side: "a", moving: Date.now() < movingUntil, shotActive });
    const actionB = spriteActionFor({ takeover: t, myBall, side: "b", shotActive });
    if (actionA !== lastActionA) {
      lastActionA = actionA;
      const slot = markerA.querySelector(".duel-sprite");
      if (slot) slot.outerHTML = duelSpriteHtml(challenger, { action: actionA, appearance: challengerAppearance });
    }
    if (actionB !== lastActionB) {
      lastActionB = actionB;
      const slot = markerB.querySelector(".duel-sprite");
      if (slot) slot.outerHTML = duelSpriteHtml(legend, { action: actionB });
    }
  }
  updateMarkers();

  // Ball flight after a resolved shot: from the recorded shot spot to the
  // rim, then back to the ball-handler. Cosmetic only — the event already
  // happened; a token + destroy() clear the flight; no input is ever locked.
  let flightToken = 0;
  let clearFlight = null;
  if (shot) {
    // D3.2 — the ball is in the air: the shooting pose reverts and the
    // dribble resumes once the flight is over (same ~950ms window).
    shotTimer = setTimeout(() => {
      shotTimer = null;
      ball.classList.add("duel-ball--dribbling");
      updateMarkers();
    }, 950);
    const token = ++flightToken;
    ball.style.transition = "none";
    placeBall(shot.spot);
    requestAnimationFrame(() => {
      if (token !== flightToken) return;
      ball.style.transition = "left .5s ease-in, top .5s ease-in";
      placeBall({ x: COURT.BASKET.x, y: COURT.BASKET.y });
    });
    const back = setTimeout(() => {
      if (token !== flightToken) return;
      ball.style.transition = "left .3s ease-out, top .3s ease-out";
      placeBall(opts.getTakeover().ball);
    }, 650);
    clearFlight = () => clearTimeout(back);
  }

  // Keyboard: arrows/WASD move, 1-4 / 1-3 resolve the possession.
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const move = keyToMove(e.key);
    if (move) {
      e.preventDefault();
      opts.setTakeover(moveControlled(opts.getTakeover(), move.dx, move.dy));
      // D3.2 — the controlled player shows the moving pose for ~250ms.
      movingUntil = Date.now() + 250;
      scheduleMoveEnd();
      updateMarkers();
      return;
    }
    const choice = keyToChoice(e.key, opts.getState().possession === "a");
    if (choice) {
      e.preventDefault();
      opts.onChoice(choice);
    }
  };
  document.addEventListener("keydown", onKey);

  // Touch / mouse drag on the court: the controlled player follows the
  // pointer. The svg has touch-action:none so a drag never scrolls the page.
  let dragging = false;
  const toCourt = (e) => {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * COURT.W,
      y: ((e.clientY - rect.top) / rect.height) * COURT.H,
    };
  };
  const onPointerDown = (e) => {
    dragging = true;
    svg.setPointerCapture?.(e.pointerId);
    const p = toCourt(e);
    opts.setTakeover(moveControlledTo(opts.getTakeover(), p.x, p.y));
    // D3.2 — a tap / drag shows the moving pose for ~250ms.
    movingUntil = Date.now() + 250;
    scheduleMoveEnd();
    updateMarkers();
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const p = toCourt(e);
    opts.setTakeover(moveControlledTo(opts.getTakeover(), p.x, p.y));
    movingUntil = Date.now() + 250;
    scheduleMoveEnd();
    updateMarkers();
  };
  const onPointerUp = () => { dragging = false; };
  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);

  container.querySelectorAll("[data-duel-choice]").forEach((btn) => {
    btn.addEventListener("click", () => opts.onChoice(btn.getAttribute("data-duel-choice")));
  });
  container.querySelector("#btn-duel-quit")?.addEventListener("click", () => opts.onQuit());

  return {
    updateMarkers,
    destroy() {
      flightToken += 1;
      if (typeof clearFlight === "function") clearFlight();
      if (moveTimer) clearTimeout(moveTimer);
      if (shotTimer) clearTimeout(shotTimer);
      document.removeEventListener("keydown", onKey);
      svg.removeEventListener("pointerdown", onPointerDown);
      svg.removeEventListener("pointermove", onPointerMove);
      svg.removeEventListener("pointerup", onPointerUp);
      svg.removeEventListener("pointercancel", onPointerUp);
    },
  };
}
