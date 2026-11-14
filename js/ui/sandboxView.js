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

const defaultTeamName = (side, lang) => (lang === "en" ? `Time Team ${side}` : `时空队 ${side}`);
const defaultStartLabel = (lang) => (lang === "en" ? "Tip Off · Time Duel" : "开打 · 时空对决");

function sideTemplate(side, lang = "zh", teamNameOf = defaultTeamName) {
  const en = lang === "en";
  const teamName = teamNameOf(side, lang);
  return `<section class="sandbox-side" data-side="${side}" aria-label="${en ? `Team ${side}` : `${side} 队`}">
      <input class="sandbox-name" data-name="${side}" value="${teamName}" aria-label="${en ? `Team ${side} name` : `${side} 队队名`}" maxlength="20" />
      <div class="search-wrap">
        <input type="search" data-search="${side}" placeholder="${en ? "English/Chinese name, nickname + year, e.g. Jordan 1991, Kobe 2006" : "英文名/中文名/外号 + 年份，如「乔丹 1991」「Kobe 2006」"}" aria-label="${en ? `Team ${side} search` : `${side} 队搜索球员`}" />
        <button type="button" class="search-clear" data-clear="${side}" aria-label="${en ? `Clear Team ${side} search` : `清空 ${side} 队搜索`}" title="${en ? "Clear search" : "清空搜索"}" hidden>×</button>
      </div>
      <div class="sandbox-results" data-results="${side}"></div>
      <h4 class="tiny" data-count="${side}"></h4>
      <ol class="sandbox-roster" data-roster="${side}"></ol>
    </section>`;
}

/**
 * Options beyond the sandbox defaults let other free modes reuse this picker (3v3 half-court:
 * `min: 3, max: 3, unique: true`, its own team names and start label). Defaults are unchanged.
 */
export function mountSandbox({
  root,
  pool,
  ovrOf,
  esc,
  onStart,
  lang = "zh",
  min = SANDBOX_MIN,
  max = SANDBOX_MAX,
  unique = false,
  teamName: teamNameOf = defaultTeamName,
  startLabel = defaultStartLabel,
}) {
  if (root.dataset.mounted) return;
  root.dataset.mounted = "1";
  let currentLang = lang;
  const picks = { A: [], B: [] };
  const found = { A: [], B: [] };
  root.querySelector("[data-sandbox-body]").innerHTML = `
    <label class="tiny sandbox-option"><input type="checkbox" data-parity checked /> ${lang === "en" ? "Cross-era balance (fills in blocks / steals / threes missing from old-era stats)" : "跨时代平衡（补齐老年代没统计的盖帽 / 抢断 / 三分）"}</label>
    <div class="sandbox-sides">${SIDES.map((s) => sideTemplate(s, lang, teamNameOf)).join("")}</div>
    <p class="tiny sandbox-error" role="alert" data-error></p>
    <div class="actions sandbox-start"><button type="button" class="btn primary" data-start>${startLabel(lang)}</button></div>`;

  const q = (selector) => root.querySelector(selector);
  const cardLine = (card) => `${esc(card.name)} · ${card.season} · ${esc(card.team)} · ${card.pos} · OVR ${ovrOf(card)}`;

  function renderResults(side) {
    q(`[data-results="${side}"]`).innerHTML = found[side]
      .map((card, i) => `<div class="sandbox-result">
          <span>${cardLine(card)}</span>
          <span class="btn-row">
            <button type="button" class="btn small" data-add="${side}:${i}">+1</button>
            ${unique ? "" : `<button type="button" class="btn small ghost" data-fill="${side}:${i}" title="${currentLang === "en" ? `Fill the whole team with ${min} copies of them` : `整队换成 ${min} 个他`}">×${min}</button>`}
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
    q(`[data-count="${side}"]`).textContent = currentLang === "en" ? `Picked ${picks[side].length}/${max} (min ${min})` : `已选 ${picks[side].length}/${max}（至少 ${min}）`;
    q(`[data-roster="${side}"]`).innerHTML = groupedRows(side)
      .map(({ card, first, count }) => `<li><span>${cardLine(card)}</span>
          <span class="sandbox-qty">
            <button type="button" class="btn small ghost" data-remove="${side}:${first}" aria-label="${currentLang === "en" ? `One fewer ${esc(card.name)}` : `少一个 ${esc(card.name)}`}">−</button>
            <strong aria-label="${currentLang === "en" ? `${count} copies` : `${count} 个`}">×${count}</strong>
            ${unique ? "" : `<button type="button" class="btn small ghost" data-more="${side}:${first}" aria-label="${currentLang === "en" ? `One more ${esc(card.name)}` : `多一个 ${esc(card.name)}`}">+</button>`}
            <button type="button" class="btn small ghost sandbox-remove-all" data-remove-all="${side}:${first}" aria-label="${currentLang === "en" ? `Remove all ${esc(card.name)}` : `一键移除全部 ${esc(card.name)}`}" title="${currentLang === "en" ? `Remove this player entirely (all ${count})` : `一键移除这名球员（全部 ${count} 个）`}">✕</button>
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
    const clearBtn = q(`[data-clear="${side}"]`);
    if (clearBtn) clearBtn.hidden = !event.target.value;
  });

  root.addEventListener("click", (event) => {
    const clearBtn = event.target.closest("[data-clear]");
    if (clearBtn) {
      // × 清空：一次点掉整串搜索词，回到未搜索状态并重新聚焦——不用逐字退格。
      const side = clearBtn.dataset.clear;
      const input = q(`[data-search="${side}"]`);
      if (input) input.value = "";
      found[side] = [];
      renderResults(side);
      clearBtn.hidden = true;
      input?.focus();
      return;
    }
    const button = event.target.closest("[data-add],[data-fill],[data-remove],[data-more],[data-remove-all],[data-start]");
    if (!button) return;
    setError("");
    try {
      if (button.dataset.start != null) {
        const options = { eraParity: q("[data-parity]").checked, pool: pool() };
        const [teamA, teamB] = SIDES.map((side) =>
          buildSandboxTeam(q(`[data-name="${side}"]`).value.trim() || teamNameOf(side, currentLang), picks[side], { ...options, slotOffset: SLOT_OFFSET[side], min, max })
        );
        onStart(teamA, teamB);
        return;
      }
      if (button.dataset.removeAll) {
        // 一键删掉这名已选球员的全部副本（×5 科比不用连点五次 −）。
        const [side, index] = button.dataset.removeAll.split(":");
        const card = picks[side][Number(index)];
        if (card) picks[side] = picks[side].filter((c) => c.id !== card.id);
        renderRoster(side);
        return;
      }
      const [side, index] = (button.dataset.add || button.dataset.fill || button.dataset.remove || button.dataset.more).split(":");
      const limits = { max, unique };
      if (button.dataset.add) picks[side] = addToSide(picks[side], found[side][index], limits);
      else if (button.dataset.fill) picks[side] = fillWithCopies(found[side][index], min);
      else if (button.dataset.more) picks[side] = addToSide(picks[side], picks[side][Number(index)], limits);
      else picks[side] = removeFromSide(picks[side], Number(index));
      renderRoster(side);
    } catch (error) {
      setError(error.message);
    }
  });

  /** Re-render language-dependent chrome in place (picks and search state stay). */
  root.__sandboxSetLang = (nextLang) => {
    const prevLang = currentLang;
    currentLang = nextLang;
    const en = nextLang === "en";
    const parity = q("[data-parity]");
    if (parity?.parentElement) {
      parity.parentElement.childNodes.forEach((node) => {
        if (node.nodeType === 3) node.textContent = en ? "Cross-era balance (fills in blocks / steals / threes missing from old-era stats)" : "跨时代平衡（补齐老年代没统计的盖帽 / 抢断 / 三分）";
      });
    }
    const startBtn = q("[data-start]");
    if (startBtn) startBtn.textContent = startLabel(nextLang);
    for (const side of SIDES) {
      const section = q(`[data-side="${side}"]`);
      if (section) section.setAttribute("aria-label", en ? `Team ${side}` : `${side} 队`);
      const nameInput = q(`[data-name="${side}"]`);
      const prevDefault = teamNameOf(side, prevLang);
      if (nameInput && nameInput.value === prevDefault) nameInput.value = teamNameOf(side, nextLang);
      if (nameInput) nameInput.setAttribute("aria-label", en ? `Team ${side} name` : `${side} 队队名`);
      const searchInput = q(`[data-search="${side}"]`);
      if (searchInput) {
        searchInput.placeholder = en ? "English/Chinese name, nickname + year, e.g. Jordan 1991, Kobe 2006" : "英文名/中文名/外号 + 年份，如「乔丹 1991」「Kobe 2006」";
        searchInput.setAttribute("aria-label", en ? `Team ${side} search` : `${side} 队搜索球员`);
      }
      const clearBtn = q(`[data-clear="${side}"]`);
      if (clearBtn) {
        clearBtn.setAttribute("aria-label", en ? `Clear Team ${side} search` : `清空 ${side} 队搜索`);
        clearBtn.title = en ? "Clear search" : "清空搜索";
      }
      renderResults(side);
      renderRoster(side);
    }
  };

  SIDES.forEach(renderRoster);
}
