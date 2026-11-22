// The pick-and-roll roles panel on the Gold tactics board: model, HTML and clicks. Design goals only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { createEditorState, isDirty, tacticalDraftReducer as reduce } from "../js/ui/tactics/tacticalDraft.js";
import { buildTacticsBoardModel } from "../js/ui/tactics/tacticsBoardModel.js";
import { renderTacticsBoardHtml, mountTacticsBoard, ERROR_TEXT, WARNING_TEXT } from "../js/ui/tactics/tacticsBoardView.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool = rows.filter((r) => r.season === 2020).map(seasonToCard);

function makeTeam(name) {
  const players = pool.slice(0, 12).map((p) => structuredClone(p));
  if (name) players[2].name = name;
  return {
    name: "You", players, starterIds: players.slice(0, 5).map((p) => p.id),
    coach: { id: "coach-1", specialTactics: ["triangle", "balanced"] },
    gameplan: { tempo: "normal", offenseFocusId: players[0].id, matchup: null, matchupAssignments: {} },
  };
}
const withAction = (team, action) => { team.players[0].orders = { ...(team.players[0].orders || {}), action }; return team; };
const board = (team, state, lang = "en") => buildTacticsBoardModel({ team, draft: state.draft, lang, dirty: isDirty(state) });
const pnrState = (team) => reduce(createEditorState(team), { type: "SET_BALL_ACTION", actionId: "pnr" });
const id = (team, i) => team.players[i].id;

test("the panel exists only while the handler's play is the pick and roll", () => {
  const team = makeTeam();
  assert.equal(board(team, reduce(createEditorState(team), { type: "SET_BALL_ACTION", actionId: "iso" })).pnr, null);
  assert.equal(board(makeTeam(), createEditorState({ ...makeTeam(), gameplan: { tempo: "normal", offenseFocusId: null } })).pnr, null, "no handler");
  assert.ok(board(team, pnrState(team)).pnr);
  assert.equal(renderTacticsBoardHtml(board(team, reduce(createEditorState(team), { type: "SET_BALL_ACTION", actionId: "iso" })), "en").includes("tb-pnr"), false);
});

test("an untouched plan shows the recommendation everywhere and nothing as changed", () => {
  const team = makeTeam();
  const { pnr } = board(team, pnrState(team));
  assert.equal(pnr.anyChanged, false);
  assert.equal(pnr.screener.filter((p) => p.selected).length, 1);
  assert.equal(pnr.screener.find((p) => p.selected).recommended, true);
  assert.equal(pnr.afterScreen.filter((o) => o.selected).length, 1);
  assert.ok(pnr.afterScreen.find((o) => o.selected).recommended);
  assert.equal([...pnr.screener, ...pnr.afterScreen, ...pnr.finish, ...pnr.offBall].some((o) => o.changed), false);
  assert.equal(pnr.screener.some((p) => p.id === id(team, 0)), false, "the handler is nobody's screener");
  const offIds = pnr.offBall.map((p) => p.id);
  assert.equal(offIds.length, 3, "the three men who are neither handler nor screener");
  assert.equal(offIds.includes(id(team, 0)) || offIds.includes(pnr.screener.find((p) => p.selected).id), false);
});

test("choices are marked changed, fake_kick is never the recommendation", () => {
  const team = makeTeam();
  let s = pnrState(team);
  s = reduce(s, { type: "SET_PNR", patch: { afterScreen: "slip", finish: "fake_kick", screenerId: id(team, 3), offBall: { [id(team, 1)]: "cut" } } });
  const { pnr } = board(team, s);
  assert.equal(pnr.anyChanged, true);
  assert.equal(pnr.afterScreen.find((o) => o.id === "slip").changed, true);
  assert.equal(pnr.finish.find((o) => o.id === "fake_kick").recommended, false);
  assert.equal(pnr.screener.find((p) => p.id === id(team, 3)).selected, true);
  assert.equal(pnr.offBall.every((p) => p.id !== id(team, 3)), true, "the screener is off the off-ball list");
  const ghost = board(team, reduce(s, { type: "SET_PNR", patch: { afterScreen: "ghost" } })).pnr;
  assert.equal(ghost.offBall.some((p) => p.id === id(team, 3)), true, "a ghosting screener plays off the ball like the others");
});

test("HTML: buttons are pressable states, the selected option's hint is shown, no unmeasured warning is shown, reset only when something changed", () => {
  const team = makeTeam("Bad <img src=x> Name");
  const html = (s, lang = "en") => renderTacticsBoardHtml(board(team, s, lang), lang);
  const base = html(pnrState(team));
  for (const kind of ["pnr-screener", "pnr-after", "pnr-off", "pnr-finish"]) assert.ok(base.includes(`data-tb="${kind}"`), kind);
  assert.equal(base.includes("pnr-reset"), false);
  assert.equal(base.includes("<img"), false, "names are escaped");
  assert.equal(/risk|高风险/i.test(base), false, "a warning needs a measurement behind it; slip and ghost measure within noise of roll");
  const slip = html(reduce(pnrState(team), { type: "SET_PNR", patch: { afterScreen: "slip" } }));
  assert.ok(slip.includes("no screen pass bonus"), "what the engine does is written where the choice is made");
  assert.ok(slip.includes('data-tb="pnr-reset"'));
  assert.ok(html(pnrState(team), "zh").includes("挡拆配合"));
  // an off-ball choice that happens to equal the recommendation is still a choice the coach made, and must look like one
  const offId = board(team, pnrState(team)).pnr.offBall[0];
  const sameAsRec = offId.choices.find((c) => c.recommended).id;
  const row = (h) => h.split("tb-pnr-man").find((r) => r.includes(`data-tb="pnr-off" data-id="${offId.id}"`));
  assert.equal(row(base).includes("tb-badge-set"), false);
  assert.ok(row(html(reduce(pnrState(team), { type: "SET_PNR", patch: { offBall: { [offId.id]: sameAsRec } } }))).includes("tb-badge-set"));
});

test("every new validation code has a message in both languages", () => {
  for (const code of ["PNR_SCREENER_NOT_ON_TEAM", "PNR_SCREENER_IS_HANDLER", "PNR_AFTER_SCREEN_UNKNOWN"]) assert.equal(ERROR_TEXT[code].length, 2, code);
  for (const code of ["PNR_SCREENER_NOT_A_STARTER", "PNR_POP_WITHOUT_SHOT"]) assert.equal(WARNING_TEXT[code].length, 2, code);
});

const fakeRoot = () => {
  const root = { innerHTML: "", contains: () => true };
  root.addEventListener = (type, fn) => { if (type === "click") root.handler = fn; };
  root.removeEventListener = () => {};
  root.click = (tb, idv = "", val = "", pressed = "false") => root.handler({ target: { closest: () => ({ dataset: { tb, id: idv, val }, getAttribute: () => pressed, disabled: false }) } });
  return root;
};

test("clicking: choose, apply writes gameplan.pnr, reset clears, re-picking what is shown is not an edit", () => {
  const team = withAction(makeTeam(), "pnr");
  let saves = 0;
  const root = fakeRoot();
  const ui = mountTacticsBoard(root, { team, lang: "en", save: () => { saves += 1; return true; } });
  assert.ok(root.innerHTML.includes("tb-pnr"), "the player's handler is already on the pick and roll");
  root.click("pnr-after", "slip", "", "true"); // pressed already: ignored
  assert.equal(isDirty(ui.getState()), false);
  assert.deepEqual(ui.applyPending(), { ok: true, applied: false });
  assert.equal("pnr" in team.gameplan, false, "an untouched board writes no roles");
  root.click("pnr-after", "slip");
  root.click("pnr-off", id(team, 1), "cut");
  root.click("pnr-finish", "fake_kick");
  assert.equal(isDirty(ui.getState()), true);
  assert.equal(ui.applyPending().ok, true);
  assert.equal(team.gameplan.pnr.afterScreen, "slip");
  assert.equal(team.gameplan.pnr.finish, "fake_kick");
  assert.equal(team.gameplan.pnr.offBall[id(team, 1)], "cut", "the value on the clicked button is the one saved");
  assert.ok(saves >= 1);
  root.click("pnr-reset");
  assert.equal(ui.getState().draft.pnr, null);
  assert.equal(ui.applyPending().ok, true);
  assert.equal("pnr" in team.gameplan, false, "back to recommended writes nothing");
});
