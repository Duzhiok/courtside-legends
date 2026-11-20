// UI 3.0 slice 0: the tactics draft. Previews never touch the team, apply is all-or-nothing, navigation is not an edit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";
import {
  DEFENSE_SCHEMES, applyDraft, canonical, commitDraft, composeGameplan, createDraft, createEditorState, isDirty,
  tacticalDraftReducer as reduce, validateDraft,
} from "../js/ui/tactics/tacticalDraft.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool = rows.filter((r) => r.season === 2020).map(seasonToCard);

function makeTeam(offset = 0) {
  const players = pool.slice(offset, offset + 12).map((p) => structuredClone(p));
  return {
    name: "You",
    players,
    starterIds: players.slice(0, 5).map((p) => p.id),
    coach: { id: "coach-1", specialTactics: ["triangle", "balanced"] },
    gameplan: { tempo: "normal", offenseFocusId: null, matchup: null, matchupAssignments: {} },
  };
}
const planOf = (t) => JSON.stringify({ c: t.coach, s: t.starterIds, g: t.gameplan, o: t.players.map((p) => p.orders) });

test("createDraft is a view of the team: applying an untouched draft changes no behaviour field", () => {
  const team = makeTeam();
  const next = applyDraft(team, createDraft(team));
  assert.deepEqual(next.coach.specialTactics, ["triangle", "balanced"]);
  assert.deepEqual(next.starterIds, team.starterIds);
  assert.equal(next.gameplan.tempo, "normal");
  assert.equal(next.gameplan.offenseFocusId, null);
});

test("applyDraft is pure: the input team is not mutated", () => {
  const team = makeTeam();
  const before = planOf(team);
  const state = reduce(createEditorState(team), { type: "SET_TEMPO", tempo: "push" });
  applyDraft(team, state.draft);
  assert.equal(planOf(team), before);
});

test("navigation (select player, switch tab) is not an edit; a real edit is; editing back is not", () => {
  const team = makeTeam();
  let s = createEditorState(team);
  s = reduce(s, { type: "SELECT_PLAYER", playerId: team.starterIds[0] });
  s = reduce(s, { type: "SET_TAB", tab: "defense" });
  assert.equal(isDirty(s), false);
  assert.equal(s.revision, 0, "navigation does not bump the preview revision");
  s = reduce(s, { type: "SET_TEMPO", tempo: "push" });
  assert.equal(isDirty(s), true);
  s = reduce(s, { type: "SET_TEMPO", tempo: "normal" });
  assert.equal(isDirty(s), false, "dirty is derived from the canonical draft, not from having clicked");
});

test("choosing the same ball handler again is a no-op; changing it resets to the suggested action", () => {
  const team = makeTeam();
  let s = createEditorState(team);
  const h = team.starterIds[1];
  s = reduce(s, { type: "SET_BALL_HANDLER", playerId: h });
  const rev = s.revision;
  assert.equal(reduce(s, { type: "SET_BALL_HANDLER", playerId: h }), s);
  s = reduce(s, { type: "SET_BALL_ACTION", actionId: "iso" });
  s = reduce(s, { type: "SET_BALL_HANDLER", playerId: team.starterIds[2] });
  assert.equal(s.draft.ballAction, null);
  assert.ok(s.revision > rev);
});

test("RESET restores the opening snapshot; MARK_SAVED moves the baseline", () => {
  const team = makeTeam();
  let s = createEditorState(team);
  s = reduce(s, { type: "SET_TEMPO", tempo: "push" });
  assert.equal(isDirty(reduce(s, { type: "RESET" })), false);
  s = reduce(s, { type: "MARK_SAVED" });
  assert.equal(isDirty(s), false);
  assert.equal(canonical(s.savedSnapshot), canonical(s.draft));
});

test("validation: engine-impossible plans are errors, poor-but-legal plans are only warnings", () => {
  const team = makeTeam();
  const ok = createDraft(team);
  assert.deepEqual(validateDraft(ok, { team }).errors, []);
  const bad = (patch) => validateDraft({ ...ok, ...patch }, { team }).errors;
  assert.deepEqual(bad({ starterIds: ok.starterIds.slice(0, 4) }), ["STARTERS_INVALID"]);
  assert.deepEqual(bad({ starterIds: [...ok.starterIds.slice(0, 4), ok.starterIds[0]] }), ["STARTERS_INVALID"]);
  assert.deepEqual(bad({ offensiveSchemeId: "nope" }), ["SCHEME_UNKNOWN"]);
  assert.deepEqual(bad({ tempo: "warp" }), ["TEMPO_INVALID"]);
  assert.deepEqual(bad({ ballHandlerId: "ghost" }), ["HANDLER_NOT_ON_TEAM"]);
  assert.deepEqual(bad({ ballAction: "dunk" }), ["BALL_ACTION_INVALID"]);
  assert.deepEqual(bad({ defense: { ...ok.defense, scheme: "zone", targetId: "x" } }), ["DEFENSE_SCHEME_INVALID"]);
  // a defensive scheme with no target is something the engine simply ignores: a warning, never an error
  const noTarget = validateDraft({ ...ok, defense: { ...ok.defense, scheme: "focus", targetId: null } }, { team });
  assert.deepEqual(noTarget.errors, []);
  assert.deepEqual(noTarget.warnings, ["DEFENSE_TARGET_MISSING"]);
  const bench = team.players[8].id;
  const warn = validateDraft({ ...ok, ballHandlerId: bench }, { team });
  assert.deepEqual(warn.errors, []);
  assert.deepEqual(warn.warnings, ["HANDLER_NOT_A_STARTER"]);
});

test("a defense target must exist on the opponent when the opponent is known", () => {
  const team = makeTeam();
  const opp = makeTeam(12);
  const d = { ...createDraft(team), defense: { scheme: "double", targetId: opp.players[0].id, defenderId: null, assignments: {} } };
  assert.deepEqual(validateDraft(d, { team, opponent: opp }).errors, []);
  const lost = { ...d, defense: { ...d.defense, targetId: team.players[0].id } };
  const stale = validateDraft(lost, { team, opponent: opp });
  assert.deepEqual(stale.errors, [], "a target kept from last game's opponent must not block this game");
  assert.deepEqual(stale.warnings, ["DEFENSE_TARGET_NOT_ON_OPPONENT"]);
  assert.deepEqual(DEFENSE_SCHEMES, ["focus", "double", "bump"]);
});

test("commitDraft writes into the SAME team object and keeps the default tactic first", () => {
  const team = makeTeam();
  const ref = team;
  let s = createEditorState(team);
  s = reduce(s, { type: "SET_SCHEME", schemeId: "balanced" });
  s = reduce(s, { type: "SET_TEMPO", tempo: "push" });
  s = reduce(s, { type: "SET_BALL_HANDLER", playerId: team.starterIds[1] });
  s = reduce(s, { type: "SET_BALL_ACTION", actionId: "drive_kick" });
  const r = commitDraft(team, s.draft, { save: () => true });
  assert.equal(r.ok, true);
  assert.equal(team, ref, "identity preserved");
  assert.deepEqual(team.coach.specialTactics, ["balanced", "triangle"], "chosen tactic first, pool kept");
  assert.equal(team.gameplan.tempo, "push");
  assert.equal(team.gameplan.offenseFocusId, team.starterIds[1]);
  assert.equal(team.players.find((p) => p.id === team.starterIds[1]).orders.action, "drive_kick");
});

test("a failed save (throw or false) restores every field: apply is all-or-nothing", () => {
  for (const failing of [() => { throw new Error("quota"); }, () => false]) {
    const team = makeTeam();
    const before = planOf(team);
    let s = createEditorState(team);
    s = reduce(s, { type: "SET_TEMPO", tempo: "push" });
    s = reduce(s, { type: "SET_BALL_HANDLER", playerId: team.starterIds[1] });
    const r = commitDraft(team, s.draft, { save: failing });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors, ["SAVE_FAILED"]);
    assert.equal(planOf(team), before, "nothing was half-applied");
  }
});

test("an invalid draft is rejected before anything is written", () => {
  const team = makeTeam();
  const before = planOf(team);
  const r = commitDraft(team, { ...createDraft(team), tempo: "warp" }, { save: () => { throw new Error("must not save"); } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ["TEMPO_INVALID"]);
  assert.equal(planOf(team), before);
});

test("composeGameplan is the one shape: no target and no board means no matchup", () => {
  assert.deepEqual(composeGameplan({ tempo: "push" }), { matchup: null, matchupAssignments: {}, offenseFocusId: null, tempo: "push" });
  const g = composeGameplan({ targetId: "t1", scheme: "bump", assignments: { t1: "d1" }, tempo: "bogus" });
  assert.deepEqual(g.matchup, { defenderId: "d1", targetId: "t1", scheme: "bump", assignments: { t1: "d1" } });
  assert.equal(g.tempo, "normal", "unknown tempo normalises like the engine does");
});

test("GameSim actually runs the applied plan (tempo + ball handler reach the match)", () => {
  const team = makeTeam();
  const handler = team.starterIds[1];
  let s = createEditorState(team);
  s = reduce(s, { type: "SET_TEMPO", tempo: "push" });
  s = reduce(s, { type: "SET_BALL_HANDLER", playerId: handler });
  assert.equal(commitDraft(team, s.draft, { save: () => true }).ok, true);
  const away = makeTeam(12);
  const sim = new GameSim({ home: team, away, youSide: "home", onEvent() {}, onTick() {}, onEnd() {} });
  assert.equal(sim.you().gameplan.tempo, "push");
  assert.equal(sim.you().gameplan.offenseFocusId, handler);
  assert.deepEqual(sim.you().starterIds ?? team.starterIds, team.starterIds);
});

test("the engine really does tolerate a missing or stale defense target: the game runs and the plan simply never fires", () => {
  for (const stale of [null, "nobody-with-this-id"]) {
    const team = makeTeam();
    team.gameplan = { ...(team.gameplan || {}), matchup: { defenderId: null, targetId: stale, scheme: "double", assignments: {} } };
    const away = makeTeam(12);
    const sim = new GameSim({ home: team, away, youSide: "home", onEvent() {}, onTick() {}, onEnd() {} });
    assert.doesNotThrow(() => { for (let i = 0; i < 12; i++) sim.step(); });
    // The engine keeps the plan as given, but every use of it is `targetId === the ball handler's id`: a stale target matches nobody.
    assert.equal(away.players.some((p) => p.id === sim.defensePlan?.targetId), false, "the target is nobody on this opponent, so the scheme never fires");
  }
});

test("previews never write: running the reducer and validation leaves the team byte-identical", () => {
  const team = makeTeam();
  const before = JSON.stringify(team);
  let s = createEditorState(team);
  for (const a of [{ type: "SET_SCHEME", schemeId: "balanced" }, { type: "SET_TEMPO", tempo: "grind" }, { type: "SET_BALL_HANDLER", playerId: team.starterIds[2] }, { type: "RESET" }]) {
    s = reduce(s, a);
    validateDraft(s.draft, { team });
  }
  assert.equal(JSON.stringify(team), before);
});
