// The pre-game lineup board (#setup-roster): who stands where, who is on the bench, and the three status lines under it.
// Pure: no DOM, no `state`. app.js resolves position collisions first (that one mutates the players), builds the model, and
// writes the result; the drag/click wiring stays there because it edits the live setup.
//
// The Chinese strings are byte-for-byte what app.js used to inline: i18n-phrases.js translates them by their exact text.
import { POS_SLOTS } from "../data/franchises.js";
import { normalizePos } from "../data/positions.js";

const FIVE = 5;
// `lang` defaults to zh so the zh output stays byte-for-byte what the tests pin; en is passed by app.js.
const say = (lang, zh, en) => (lang === "en" ? en : zh);
const posOf = (p) => normalizePos(p.playPos || p.pos);

/**
 * The board's data. `byStrength` orders a slot / the bench (best first). normalizePos always answers with one of the five slots, so every starter has one.
 * Returns { picked, slotMap, pool, left }: picked = the starters, slotMap = slot id -> starters, pool = the bench, left = seats still empty.
 */
export function setupRosterModel(players, selected, byStrength) {
  const picked = players.filter((p) => selected.has(p.id));
  const slotMap = Object.fromEntries(POS_SLOTS.map((s) => [s.id, []]));
  for (const p of picked) slotMap[posOf(p)].push(p);
  for (const s of POS_SLOTS) slotMap[s.id].sort(byStrength);
  const pool = players.filter((p) => !selected.has(p.id)).sort(byStrength);
  return { picked, slotMap, pool, left: FIVE - selected.size };
}

/** The five slots plus the bench. `cardHtml(player, { onCourt })` draws one player card. */
export function setupBoardHtml({ slotMap, pool, left }, cardHtml, lang = "zh") {
  const slotsHtml = POS_SLOTS.map((s) => {
    const list = slotMap[s.id];
    if (!list.length) {
      return `<div class="setup-slot empty" data-drop-slot="${s.id}">
        <span class="slot-badge">${s.id}</span>
        <span class="slot-empty-hint">${say(lang, "拖到这里", "Drop here")}</span>
      </div>`;
    }
    const p = list[0];
    return `<div class="setup-slot filled" data-drop-slot="${s.id}" data-id="${p.id}">
        <span class="slot-badge">${s.id}</span>
        ${cardHtml(p, { onCourt: true })}
      </div>`;
  }).join("");

  return `<div class="setup-lineup-board">
    <section class="setup-oncourt-panel">
      <header class="setup-panel-head">
        <h4>${say(lang, "场上五人", "On the floor")}</h4>
        <span class="tiny">${say(lang, "拖到格子换位 · 点一下也可下场", "Drag onto a slot to move · tap to bench")}</span>
      </header>
      <div class="setup-slots setup-slots-row">${slotsHtml}</div>
    </section>
    <section class="setup-pool-panel" data-drop-bench="1">
      <header class="setup-panel-head">
        <h4>${say(lang, "替补席", "Bench")}</h4>
        <span class="tiny">${
          left > 0 ? say(lang, `拖到上方上场（还差 ${left}）`, `Drag up to start (${left} to go)`) : say(lang, "首发已满 · 拖到有人的格子可换人", "Five set · drag onto a starter to swap")
        }</span>
      </header>
      <div class="setup-pool">${
        pool.length
          ? pool.map((p) => cardHtml(p, { onCourt: false })).join("")
          : `<p class="tiny">${say(lang, "替补席空了", "Bench is empty")}</p>`
      }</div>
    </section>
  </div>`;
}

/** The confirm button (enabled only with five starters) and the one-line position note. */
export function setupRosterStatus({ selectedCount, left, picked, slotMap }, lang = "zh") {
  const full = selectedCount === FIVE;
  const confirmLabel = full ? say(lang, "确认开打", "Tip off") : say(lang, `再选 ${left} 人后开打`, `Pick ${left} more to tip off`);
  if (picked.length !== FIVE) return { confirmDisabled: !full, confirmLabel, posNote: say(lang, `还差 ${left} 人 · 从替补席拖到空位`, `${left} to go · drag from the bench to an open slot`) };
  const slots = POS_SLOTS.map((s) => {
    const who = slotMap[s.id][0];
    return who ? `${s.id} ${who.name}` : `${s.id} ${say(lang, "空", "open")}`;
  });
  const overlap = picked.length - new Set(picked.map(posOf)).size;
  return {
    confirmDisabled: !full,
    confirmLabel,
    posNote: overlap ? say(lang, "有位置挤在一起了，把人拖开即可", "Two starters share a spot: drag one apart") : `${say(lang, "首发已齐：", "Starters set: ")}${slots.join(" · ")}`,
  };
}
