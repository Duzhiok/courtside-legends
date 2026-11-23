// The season hub's rotation board (B61): the page's HTML for a real team. It must read the team and never write it.
import test from "node:test";
import assert from "node:assert/strict";
import { realTeam } from "./helpers/realGame.js";

const { rotationBoardHtml } = await import("../js/ui/seasonRotationView.js");
const { ensureRoles, ensurePlayerOrders } = await import("../js/engine/gameplan.js");
const { TACTICS } = await import("../js/data/coaches.js");
const { SKILL_PACKS } = await import("../js/data/skills.js");

/** The 1996 Bulls, ready the way renderSeasonRotation leaves a team before it draws the page. */
function bulls(over = {}) {
  const t = realTeam("CHI", 1996);
  t.players.forEach((p, i) => { p.id = p.id || `p${i}`; });
  ensureRoles(t.players);
  ensurePlayerOrders(t.players);
  return { ...t, starterIds: t.players.slice(0, 5).map((p) => p.id), coach: { specialTactics: ["balanced"] }, ...over };
}
const draw = (you, lang = "en", learnedOf = () => []) => rotationBoardHtml(you, { lang, learnedOf });
const rowIds = (html) => [...html.matchAll(/<div class="rot-row[^"]*" data-id="([^"]+)"/g)].map((m) => m[1]);
/** The <option> that carries `selected` inside one <select id=...>. */
const selectedIn = (html, id) => {
  const body = html.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`))[1];
  return [...body.matchAll(/<option value="([^"]*)"\s*selected/g)].map((m) => m[1]);
};

test("every player gets a row; the starters sit above the bench and nobody is on both lists", () => {
  const you = bulls();
  const html = draw(you);
  const [top, bench] = html.split("Bench rotation");
  assert.deepEqual(new Set(rowIds(top)), new Set(you.starterIds), "the starting five is the first block");
  assert.equal(rowIds(bench).length, you.players.length - 5);
  assert.equal(new Set(rowIds(html)).size, you.players.length, "no duplicates");
  assert.equal((html.match(/rot-start-cb"[^>]*checked/g) || []).length, 5, "five ticked boxes");
});

test("a starter id that left the roster is ignored, not drawn", () => {
  const you = bulls();
  you.starterIds = [...you.starterIds, "long-gone"];
  const ids = rowIds(draw(you));
  assert.ok(!ids.includes("long-gone"));
  assert.equal(ids.length, you.players.length);
});

test("a starter id that left the roster changes nothing on the page (minute bar, clashes, fit)", () => {
  const clean = bulls();
  clean.players.forEach((p, i) => { p.targetMinutes = 34 - i * 3; }); // minutes spread over the roster so every block has something to count
  const ghosted = { ...clean, starterIds: [...clean.starterIds, "long-gone"] };
  assert.equal(draw(ghosted, "en"), draw(clean, "en"));
  assert.equal(draw(ghosted, "zh"), draw(clean, "zh"));
});

test("no starterIds on the team: the saved rotation's five are the starters (a freshly loaded save)", () => {
  const base = bulls();
  const five = base.players.slice(2, 7).map((p) => p.id);
  const you = { ...base, starterIds: undefined, rotation: { starterIds: five } };
  const [top, bench] = draw(you).split("Bench rotation");
  assert.deepEqual(new Set(rowIds(top)), new Set(five));
  assert.equal(rowIds(bench).length, base.players.length - 5);
  assert.ok(!/<strong>—<\/strong><\/span>\s*<span class="rot-stat"><em>Chemistry/.test(draw(you)), "a full five gets a real lineup-fit number");
  const none = draw({ ...base, starterIds: undefined, rotation: undefined });
  assert.equal((none.match(/class="rot-row starter"/g) || []).length, 0, "and with no five anywhere nobody starts");
  assert.equal(rowIds(none).length, base.players.length, "but everybody is still listed");
});

test("English and Chinese headings, the same page otherwise", () => {
  const en = draw(bulls(), "en"), zh = draw(bulls(), "zh");
  assert.ok(en.includes("Rotation board") && en.includes("Starting five") && !en.includes("排兵布阵"));
  assert.ok(zh.includes("排兵布阵") && !zh.includes("Rotation board"));
  assert.deepEqual(rowIds(en), rowIds(zh));
});

test("the ball handler: the game plan wins, then the saved rotation, else nobody", () => {
  const you = bulls();
  const [a, b] = [you.players[1].id, you.players[2].id];
  assert.deepEqual(selectedIn(draw({ ...you, gameplan: { offenseFocusId: a }, rotation: { offenseFocusId: b } }), "rot-focus"), [a]);
  assert.deepEqual(selectedIn(draw({ ...you, gameplan: {}, rotation: { offenseFocusId: b } }), "rot-focus"), [b]);
  assert.deepEqual(selectedIn(draw(you), "rot-focus"), [], "no focus: the (none) option stays unselected-by-id");
});

test("the default tactic is the coach's first one; a retired id selects nothing and does not throw", () => {
  const other = Object.keys(TACTICS).find((id) => id !== "balanced");
  assert.deepEqual(selectedIn(draw(bulls({ coach: { specialTactics: [other, "balanced"] } })), "rot-tactic"), [other]);
  assert.deepEqual(selectedIn(draw(bulls({ coach: { specialTactics: ["balanced"] } })), "rot-tactic"), ["balanced"]);
  assert.doesNotThrow(() => draw(bulls({ coach: { specialTactics: ["a_tactic_that_was_removed", "balanced"] } })));
  assert.deepEqual(selectedIn(draw(bulls({ coach: { specialTactics: ["a_tactic_that_was_removed", "balanced"] } })), "rot-tactic"), []);
  assert.doesNotThrow(() => draw(bulls({ coach: undefined })), "a team with no coach still draws");
});

test("learnedOf is asked about every player, and what it returns reaches the page", () => {
  const you = bulls();
  const asked = [];
  const base = draw(you, "en", (p) => { asked.push(p.id); return []; });
  assert.deepEqual(new Set(asked), new Set(you.players.map((p) => p.id)));
  const skill = Object.keys(SKILL_PACKS)[0];
  const withSkill = draw(you, "en", (p) => (p.id === you.players[0].id ? [skill] : []));
  assert.notEqual(withSkill, base, "a learned skill changes the page");
});

test("names are escaped on the way out", () => {
  const you = bulls();
  you.players[0].name = '<img src=x onerror="alert(1)">';
  const html = draw(you);
  assert.ok(!html.includes('<img src=x onerror'), "no raw markup");
  assert.ok(html.includes("&lt;img src=x onerror"), "and the name is still shown, escaped");
});

test("drawing reads the team and writes nothing", () => {
  const you = bulls({ gameplan: { offenseFocusId: "x" }, rotation: { starterIds: ["a"] } });
  const before = JSON.stringify(you);
  draw(you, "en");
  draw(you, "zh");
  assert.equal(JSON.stringify(you), before);
});
