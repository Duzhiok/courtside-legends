// B61: the setup lineup board moved out of app.js. The old inline code is kept here, verbatim, as the oracle: for real
// rosters and every kind of starting five (0..7 picked, stacked positions, empty slots, odd positions) the extracted
// functions must produce the same seats, the same HTML and the same status lines, byte for byte.
import test from "node:test";
import assert from "node:assert/strict";
import { overall } from "../js/data/players.js";
import { POS_SLOTS } from "../js/data/franchises.js";
import { normalizePos } from "../js/data/positions.js";
import { setupBoardHtml, setupRosterModel, setupRosterStatus } from "../js/ui/setupRosterView.js";
import { realTeam } from "./helpers/realGame.js";

const byOverallDesc = (a, b) => overall(b) - overall(a) || String(a.name || "").localeCompare(String(b.name || ""));
const cardHtml = (p, { onCourt }) => `<card ${p.id} ${onCourt ? "on" : "bench"}>`;

/** What renderSetupRoster inlined before B61 (data + board html + the two status lines), copied as it was. */
function legacy(players, selected) {
  const picked = players.filter((p) => selected.has(p.id));
  const slotMap = Object.fromEntries(POS_SLOTS.map((s) => [s.id, []]));
  for (const p of picked) {
    const pos = normalizePos(p.playPos || p.pos);
    (slotMap[pos] || slotMap.SF).push(p);
  }
  for (const s of POS_SLOTS) slotMap[s.id].sort(byOverallDesc);
  const pool = players.filter((p) => !selected.has(p.id)).sort(byOverallDesc);
  const left = 5 - selected.size;
  const slotsHtml = POS_SLOTS.map((s) => {
    const list = slotMap[s.id];
    if (!list.length) {
      return `<div class="setup-slot empty" data-drop-slot="${s.id}">
        <span class="slot-badge">${s.id}</span>
        <span class="slot-empty-hint">拖到这里</span>
      </div>`;
    }
    const p = list[0];
    return `<div class="setup-slot filled" data-drop-slot="${s.id}" data-id="${p.id}">
        <span class="slot-badge">${s.id}</span>
        ${cardHtml(p, { onCourt: true })}
      </div>`;
  }).join("");
  const html = `<div class="setup-lineup-board">
    <section class="setup-oncourt-panel">
      <header class="setup-panel-head">
        <h4>场上五人</h4>
        <span class="tiny">拖到格子换位 · 点一下也可下场</span>
      </header>
      <div class="setup-slots setup-slots-row">${slotsHtml}</div>
    </section>
    <section class="setup-pool-panel" data-drop-bench="1">
      <header class="setup-panel-head">
        <h4>替补席</h4>
        <span class="tiny">${
          left > 0 ? `拖到上方上场（还差 ${left}）` : "首发已满 · 拖到有人的格子可换人"
        }</span>
      </header>
      <div class="setup-pool">${
        pool.length
          ? pool.map((p) => cardHtml(p, { onCourt: false })).join("")
          : `<p class="tiny">替补席空了</p>`
      }</div>
    </section>
  </div>`;
  const confirm = { disabled: selected.size !== 5, label: selected.size === 5 ? "确认开打" : `再选 ${left} 人后开打` };
  let posNote;
  if (picked.length === 5) {
    const slots = POS_SLOTS.map((s) => {
      const who = slotMap[s.id][0];
      return who ? `${s.id} ${who.name}` : `${s.id} 空`;
    });
    const overlap = picked.length - new Set(picked.map((p) => normalizePos(p.playPos || p.pos))).size;
    posNote = overlap ? `有位置挤在一起了，把人拖开即可` : `首发已齐：${slots.join(" · ")}`;
  } else {
    posNote = `还差 ${left} 人 · 从替补席拖到空位`;
  }
  return { picked, slotMap, pool, left, html, confirm, posNote };
}

// A small seeded generator so the cases are the same every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEAMS = [["CHI", 1996], ["LAL", 2001], ["BOS", 1986], ["GSW", 2016], ["SAS", 2014]];
const ODD_POS = ["G-F", "F-C", "PG", "SG", "SF", "PF", "C", "G", "F", ""];

test("the extracted board equals the old inline one: seats, bench, html, confirm button, position note", () => {
  const rand = rng(61);
  let cases = 0;
  let stacked = 0;
  let fiveFull = 0;
  for (const [code, year] of TEAMS) {
    const base = realTeam(code, year).players;
    assert.ok(base.length >= 8, `${code} ${year} has a real roster`);
    for (let n = 0; n < 40; n += 1) {
      // Fresh copies, some with a playPos (maybe stacked on one slot), some with an odd source position.
      const players = base.map((p) => ({
        ...p,
        id: p.id,
        pos: rand() < 0.2 ? ODD_POS[Math.floor(rand() * ODD_POS.length)] : p.pos,
        playPos: rand() < 0.6 ? ODD_POS[Math.floor(rand() * ODD_POS.length)] || undefined : undefined,
      }));
      const size = Math.floor(rand() * 8); // 0..7: under, exactly five, over
      const ids = [...players].sort(() => rand() - 0.5).slice(0, size).map((p) => p.id);
      const selected = new Set(ids);
      const old = legacy(players, selected);
      const model = setupRosterModel(players, selected, byOverallDesc);
      const status = setupRosterStatus({ selectedCount: selected.size, ...model });
      assert.deepEqual(model.picked.map((p) => p.id), old.picked.map((p) => p.id));
      assert.deepEqual(Object.fromEntries(Object.entries(model.slotMap).map(([k, v]) => [k, v.map((p) => p.id)])),
        Object.fromEntries(Object.entries(old.slotMap).map(([k, v]) => [k, v.map((p) => p.id)])));
      assert.deepEqual(model.pool.map((p) => p.id), old.pool.map((p) => p.id));
      assert.equal(model.left, old.left);
      assert.equal(setupBoardHtml(model, cardHtml), old.html, `${code} ${year} #${n} (${size} picked)`);
      assert.equal(status.confirmDisabled, old.confirm.disabled);
      assert.equal(status.confirmLabel, old.confirm.label);
      assert.equal(status.posNote, old.posNote);
      if (size === 5) fiveFull += 1;
      if (size === 5 && old.posNote.startsWith("有位置挤")) stacked += 1;
      cases += 1;
    }
  }
  // The comparison must have reached the branches that matter, not only the easy ones.
  assert.equal(cases, 200);
  assert.ok(fiveFull >= 10, `five-starter cases ${fiveFull}`);
  assert.ok(stacked >= 1, `stacked-position cases ${stacked}`);
});

test("board: an empty slot shows the drop hint, a full bench shows the full line, an empty bench says so", () => {
  const players = realTeam("CHI", 1996).players.slice(0, 5);
  const none = setupBoardHtml(setupRosterModel(players, new Set(), byOverallDesc), cardHtml);
  assert.equal((none.match(/setup-slot empty/g) || []).length, POS_SLOTS.length, "nobody picked: every slot is empty");
  assert.match(none, /拖到上方上场（还差 5）/);
  const all = setupBoardHtml(setupRosterModel(players, new Set(players.map((p) => p.id)), byOverallDesc), cardHtml);
  assert.match(all, /首发已满/);
  assert.match(all, /替补席空了/);
});

test("status: five starters enable the button; an unplaced slot or a stacked position is named", () => {
  const players = realTeam("CHI", 1996).players.slice(0, 5).map((p, i) => ({ ...p, playPos: POS_SLOTS[i].id }));
  const sel = new Set(players.map((p) => p.id));
  const ok = setupRosterStatus({ selectedCount: 5, ...setupRosterModel(players, sel, byOverallDesc) });
  assert.equal(ok.confirmDisabled, false);
  assert.equal(ok.confirmLabel, "确认开打");
  assert.match(ok.posNote, /^首发已齐：/);
  const stackedPlayers = players.map((p) => ({ ...p, playPos: "C" }));
  const bad = setupRosterStatus({ selectedCount: 5, ...setupRosterModel(stackedPlayers, sel, byOverallDesc) });
  assert.equal(bad.posNote, "有位置挤在一起了，把人拖开即可");
  const three = setupRosterStatus({ selectedCount: 3, ...setupRosterModel(players, new Set([...sel].slice(0, 3)), byOverallDesc) });
  assert.equal(three.confirmDisabled, true);
  assert.equal(three.confirmLabel, "再选 2 人后开打");
});
