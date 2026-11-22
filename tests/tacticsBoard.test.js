// UI 3.0 slice 1: the Gold tactics board view model + HTML. Design goals only: numbers come from the sim helpers,
// every row is tagged sim/advice, a clean draft cannot be applied, an edit can, and user text is escaped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { lineupFit } from "../js/engine/chemistry.js";
import { TACTICS } from "../js/data/coaches.js";
import { createEditorState, isDirty, tacticalDraftReducer as reduce } from "../js/ui/tactics/tacticalDraft.js";
import { buildTacticsBoardModel } from "../js/ui/tactics/tacticsBoardModel.js";
import { renderTacticsBoardHtml, mountTacticsBoard, ERROR_TEXT, WARNING_TEXT } from "../js/ui/tactics/tacticsBoardView.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool = rows.filter((r) => r.season === 2020).map(seasonToCard);
const makeTeam = (offset = 0) => {
  const players = pool.slice(offset, offset + 12).map((p) => structuredClone(p));
  return {
    name: "You", players, starterIds: players.slice(0, 5).map((p) => p.id),
    coach: { id: "coach-1", name: "Coach <b>X</b>", specialTactics: ["triangle", "balanced"] },
    gameplan: { tempo: "normal", offenseFocusId: null, matchup: null, matchupAssignments: {} },
  };
};
const model = (team, state, opponent = null) =>
  buildTacticsBoardModel({ team, draft: state.draft, opponent, lang: "en", dirty: isDirty(state) });

test("board: five placed starters, active system fit is GameSim's lineupFit, every row tagged", () => {
  const team = makeTeam();
  const m = model(team, createEditorState(team), makeTeam(20));
  assert.equal(m.slots.filter((s) => s.player).length, 5);
  const active = m.systems.find((s) => s.active);
  assert.equal(active.id, "triangle");
  const starters = team.starterIds.map((id) => team.players.find((p) => p.id === id));
  assert.equal(active.fit, Math.max(0, Math.min(100, Math.round(lineupFit(starters, team.coach, TACTICS.triangle)))));
  assert.ok(m.rows.every((r) => r.tag === "sim" || r.tag === "advice"));
  assert.equal(m.rows.find((r) => r.key === "threat").tag, "advice");
  assert.equal(m.canApply, false, "a clean draft has nothing to apply");
});

test("board: an edit makes it applyable; picking a handler shows his plays with the suggested one selected", () => {
  const team = makeTeam();
  let s = reduce(createEditorState(team), { type: "SET_SCHEME", schemeId: "balanced" });
  assert.equal(model(team, s).canApply, true);
  const pg = team.starterIds[0];
  s = reduce(s, { type: "SET_BALL_HANDLER", playerId: pg });
  const m = model(team, s);
  assert.equal(m.handlerId, pg);
  assert.equal(m.slots.find((x) => x.player?.id === pg).player.isHandler, true);
  assert.equal(m.ballActions.filter((a) => a.selected).length, 1);
  assert.ok(m.ballActions.find((a) => a.selected).suggested);
});

test("html: escapes user text and exposes the controls", () => {
  const team = makeTeam();
  const html = renderTacticsBoardHtml(model(team, createEditorState(team)), "en");
  assert.ok(!html.includes("<b>X</b>") && html.includes("&lt;b&gt;X&lt;/b&gt;"));
  for (const hook of ['data-tb="scheme"', 'data-tb="handler"', 'data-tb="apply"', 'data-tb="reset"']) assert.ok(html.includes(hook), hook);
  assert.ok(html.includes("Sim effect"));
});

// Minimal DOM: just enough for mountTacticsBoard to paint and to receive one click at a time.
const fakeRoot = () => {
  const root = { innerHTML: "", handler: null, contains: () => true, removeEventListener() {} };
  root.addEventListener = (type, fn) => { if (type === "click") root.handler = fn; };
  root.click = (tb, id = "") => root.handler({ target: { closest: () => ({ dataset: { tb, id }, getAttribute: () => "false", disabled: false }) } });
  return root;
};

test("SYNC_STARTERS follows the roster list without marking the tactics unsaved; a handler who left is cleared", () => {
  const team = makeTeam();
  const pg = team.starterIds[0];
  let s = reduce(createEditorState(team), { type: "SET_BALL_HANDLER", playerId: pg });
  s = reduce(s, { type: "MARK_SAVED" });
  assert.equal(isDirty(s), false);
  const swapped = [...team.starterIds.slice(1), team.players[7].id]; // the handler leaves the five
  s = reduce(s, { type: "SYNC_STARTERS", starterIds: swapped });
  assert.deepEqual(s.draft.starterIds, swapped);
  assert.equal(s.draft.ballHandlerId, null);
  assert.equal(isDirty(s), false, "a roster change is not a tactics edit");
  const m = model(team, s);
  assert.ok(m.slots.some((x) => x.player?.id === team.players[7].id), "the new starter is on the court");
});

test("applyPending: board edits are committed (and saved) when the game starts; a clean board does nothing", () => {
  const team = makeTeam();
  let saves = 0;
  const root = fakeRoot();
  const board = mountTacticsBoard(root, { team, lang: "en", save: () => { saves += 1; return true; } });
  assert.deepEqual(board.applyPending(), { ok: true, applied: false });
  assert.equal(saves, 0, "nothing pending: no write, no save");
  root.click("scheme", "balanced");
  assert.equal(team.coach.specialTactics[0], "triangle", "a preview never touches the team");
  const res = board.applyPending();
  assert.equal(res.ok, true);
  assert.equal(team.coach.specialTactics[0], "balanced");
  assert.equal(saves, 1);
  assert.equal(board.applyPending().applied, false, "applying twice is a no-op");
});

test("applyPending: a plan the engine cannot run is refused, the team is untouched, the board shows the error", () => {
  const team = makeTeam();
  const root = fakeRoot();
  const board = mountTacticsBoard(root, { team, lang: "en", save: () => true });
  root.click("scheme", "balanced");
  board.syncStarters(team.starterIds.slice(0, 3)); // only 3 starters: not a legal five
  const before = JSON.stringify(team.coach);
  const res = board.applyPending();
  assert.equal(res.ok, false);
  assert.equal(JSON.stringify(team.coach), before);
  assert.ok(root.innerHTML.includes("is-error"));
});

test("applyPending: a valid plan whose save fails is still applied, and the board says the save failed (not 'cannot run')", () => {
  const team = makeTeam();
  const root = fakeRoot();
  const board = mountTacticsBoard(root, { team, lang: "en", save: () => false });
  root.click("scheme", "balanced");
  const res = board.applyPending();
  assert.equal(res.ok, true);
  assert.equal(res.saveFailed, true);
  assert.equal(team.coach.specialTactics[0], "balanced", "the plan is in the team even though the disk refused it");
  assert.equal(root.innerHTML.includes("is-error"), false, "no 'cannot run' error: validation passed");
  assert.ok(root.innerHTML.includes("is-warn") && root.innerHTML.includes("could not be written"), "the board warns the save did not land");
});

test("court places starters with the same position rule as the setup roster (wide positions like G / F-C)", () => {
  const team = makeTeam();
  const five = team.starterIds.map((id) => team.players.find((p) => p.id === id));
  const wide = ["G", "G-F", "F", "F-C", "C"]; // raw strings that only normalizePos can resolve
  five.forEach((p, i) => { p.pos = wide[i]; delete p.playPos; });
  const m = model(team, createEditorState(team));
  const slotOf = Object.fromEntries(m.slots.filter((s) => s.player).map((s) => [s.player.id, s.slot]));
  assert.equal(Object.keys(slotOf).length, 5, "all five are placed");
  assert.equal(slotOf[five[0].id], "SG", "G reads as SG, exactly as the roster list does");
  assert.equal(slotOf[five[4].id], "C");
});

test("a blocked plan says WHY, in plain words, in both languages; a stale defense target is only a warning and shows no error", () => {
  const team = makeTeam();
  const opp = makeTeam(12);
  const modelFor = (patch, lang) => {
    const state = createEditorState(team);
    return buildTacticsBoardModel({ team, draft: { ...state.draft, ...patch }, opponent: opp, lang, dirty: true });
  };
  const fourStarters = { starterIds: team.starterIds.slice(0, 4) };
  assert.match(renderTacticsBoardHtml(modelFor(fourStarters, "zh"), "zh"), /当前方案无法执行：首发必须是 5 名不同的球员/);
  assert.match(renderTacticsBoardHtml(modelFor({ ...fourStarters, tempo: "warp" }, "en"), "en"), /This plan cannot run: Pick 5 different starters; Invalid tempo/);
  // last game's defense target is not on this opponent: engine ignores it, so the player is NOT told the plan cannot run
  const stale = modelFor({ defense: { scheme: "double", targetId: team.players[0].id, defenderId: null, assignments: {} } }, "zh");
  assert.deepEqual(stale.errors, []);
  const staleHtml = renderTacticsBoardHtml(stale, "zh");
  assert.doesNotMatch(staleHtml, /无法执行/);
  assert.match(staleHtml, /注意：盯防目标不在本场对手里，这套防守不会触发/);
  assert.match(staleHtml, /is-warn/);
  const staleEn = renderTacticsBoardHtml(modelFor({ defense: { scheme: "double", targetId: team.players[0].id, defenderId: null, assignments: {} } }, "en"), "en");
  assert.match(staleEn, /Note: The defensive target is not on this opponent/);
  assert.doesNotMatch(renderTacticsBoardHtml(modelFor({}, "zh"), "zh"), /注意：/);
  for (const code of ["STARTERS_INVALID", "SCHEME_UNKNOWN", "TEMPO_INVALID", "HANDLER_NOT_ON_TEAM", "BALL_ACTION_INVALID", "DEFENSE_SCHEME_INVALID", "DEFENDER_NOT_ON_TEAM"]) {
    assert.ok(ERROR_TEXT[code]?.[0] && ERROR_TEXT[code]?.[1], `${code} has zh and en text`);
  }
  for (const code of Object.keys(WARNING_TEXT)) assert.ok(WARNING_TEXT[code][0] && WARNING_TEXT[code][1], `${code} has zh and en text`);
});
