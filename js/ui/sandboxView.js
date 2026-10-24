/**
 * 时空对决 screen. Self-contained: owns its picks + events; app.js injects the
 * card pool, view helpers and an onStart(teamA, teamB) callback.
 */
import { searchCards } from "../data/cardSearch.js";
import {
  SANDBOX_MAX,
  SANDBOX_MIN,
  addToSide,
  buildSandboxTeam,
  fillWithCopies,
  removeFromSide,
} from "../modes/sandboxDuel.js";

const SIDES = ["A", "B"];
const RESULT_LIMIT = 12;
/** Keeps duplicate ids unique across both teams (Jordan can be on both sides). */
const SLOT_OFFSET = { A: 0, B: 100 };

function sideTemplate(side) {
  return `<section class="sandbox-side" data-side="${side}" aria-label="${side} 队">
      <input class="sandbox-name" data-name="${side}" value="${side === "A" ? "时空队 A" : "时空队 B"}" aria-label="${side} 队队名" maxlength="20" />
      <input type="search" data-search="${side}" placeholder="英文名/中文名/外号 + 年份，如「乔丹 1991」「Kobe 2006」" aria-label="${side} 队搜索球员" />
      <div class="sandbox-results" data-results="${side}"></div>
      <h4 class="tiny" data-count="${side}"></h4>
      <ol class="sandbox-roster" data-roster="${side}"></ol>
    </section>`;
}

export function mountSandbox({ root, pool, ovrOf, esc, onStart }) {
  if (root.dataset.mounted) return;
  root.dataset.mounted = "1";
  const picks = { A: [], B: [] };
  const found = { A: [], B: [] };
  root.querySelector("[data-sandbox-body]").innerHTML = `
    <label class="tiny sandbox-option"><input type="checkbox" data-parity checked /> 跨时代平衡（补齐老年代没统计的盖帽 / 抢断 / 三分）</label>
    <div class="sandbox-sides">${SIDES.map(sideTemplate).join("")}</div>
    <p class="tiny sandbox-error" role="alert" data-error></p>
    <div class="actions sandbox-start"><button type="button" class="btn primary" data-start>开打 · 时空对决</button></div>`;

  const q = (selector) => root.querySelector(selector);
  const cardLine = (card) => `${esc(card.name)} · ${card.season} · ${esc(card.team)} · ${card.pos} · OVR ${ovrOf(card)}`;

  function renderResults(side) {
    q(`[data-results="${side}"]`).innerHTML = found[side]
      .map((card, i) => `<div class="sandbox-result">
          <span>${cardLine(card)}</span>
          <span class="btn-row">
            <button type="button" class="btn small" data-add="${side}:${i}">+1</button>
            <button type="button" class="btn small ghost" data-fill="${side}:${i}" title="整队换成 ${SANDBOX_MIN} 个他">×${SANDBOX_MIN}</button>
          </span>
        </div>`)
      .join("");
  }

  /** Same card collapses into one "×N" row; picks stays a flat list. */
  function groupedRows(side) {
    const rows = new Map();
    picks[side].forEach((card, index) => {
      const row = rows.get(card.id) || { card, first: index, count: 0 };
      row.count += 1;
      rows.set(card.id, row);
    });
    return [...rows.values()];
  }

  function renderRoster(side) {
    q(`[data-count="${side}"]`).textContent = `已选 ${picks[side].length}/${SANDBOX_MAX}（至少 ${SANDBOX_MIN}）`;
    q(`[data-roster="${side}"]`).innerHTML = groupedRows(side)
      .map(({ card, first, count }) => `<li><span>${cardLine(card)}</span>
          <span class="sandbox-qty">
            <button type="button" class="btn small ghost" data-remove="${side}:${first}" aria-label="少一个 ${esc(card.name)}">−</button>
            <strong aria-label="${count} 个">×${count}</strong>
            <button type="button" class="btn small ghost" data-more="${side}:${first}" aria-label="多一个 ${esc(card.name)}">+</button>
          </span></li>`)
      .join("");
  }

  function setError(message) {
    q("[data-error]").textContent = message || "";
  }

  root.addEventListener("input", (event) => {
    const side = event.target.dataset.search;
    if (!side) return;
    found[side] = searchCards(pool(), event.target.value, { limit: RESULT_LIMIT, ovrOf });
    renderResults(side);
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add],[data-fill],[data-remove],[data-more],[data-start]");
    if (!button) return;
    setError("");
    try {
      if (button.dataset.start != null) {
        const options = { eraParity: q("[data-parity]").checked, pool: pool() };
        const [teamA, teamB] = SIDES.map((side) =>
          buildSandboxTeam(q(`[data-name="${side}"]`).value.trim() || `时空队 ${side}`, picks[side], { ...options, slotOffset: SLOT_OFFSET[side] })
        );
        onStart(teamA, teamB);
        return;
      }
      const [side, index] = (button.dataset.add || button.dataset.fill || button.dataset.remove || button.dataset.more).split(":");
      if (button.dataset.add) picks[side] = addToSide(picks[side], found[side][index]);
      else if (button.dataset.fill) picks[side] = fillWithCopies(found[side][index]);
      else if (button.dataset.more) picks[side] = addToSide(picks[side], picks[side][Number(index)]);
      else picks[side] = removeFromSide(picks[side], Number(index));
      renderRoster(side);
    } catch (error) {
      setError(error.message);
    }
  });

  SIDES.forEach(renderRoster);
}
