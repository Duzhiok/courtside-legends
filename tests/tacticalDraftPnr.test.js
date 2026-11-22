// Pick-and-roll roles on the tactics draft (tactics-pnr-roles-design.md §2-3.6). The draft keeps only what the coach CHOSE; an unset
// choice is "recommended" and plays the engine's automatic behaviour, so applying an untouched draft never changes a game.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";
import { recommendPnrPlan } from "../js/engine/pnrPlan.js";
import {
  applyDraft, commitDraft, composeGameplan, createDraft, createEditorState, isDirty, pnrIsActive,
  tacticalDraftReducer as reduce, validateDraft,
} from "../js/ui/tactics/tacticalDraft.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool = rows.filter((r) => r.season === 2020).map(seasonToCard);

function makeTeam(pnr = null) {
  const players = pool.slice(0, 12).map((p) => structuredClone(p));
  return {
    name: "You", players, starterIds: players.slice(0, 5).map((p) => p.id),
    coach: { id: "coach-1", specialTactics: ["triangle", "balanced"] },
    gameplan: { tempo: "normal", offenseFocusId: players[0].id, matchup: null, matchupAssignments: {}, ...(pnr ? { pnr } : {}) },
  };
}
const withPnrAction = (team) => { team.players[0].orders = { ...(team.players[0].orders || {}), action: "pnr" }; return team; };
const draftOf = (team, patch = {}) => ({ ...createDraft(team), ...patch });

test("a team with no roles writes none: an untouched draft adds no gameplan.pnr field", () => {
  const team = makeTeam();
  assert.equal(createDraft(team).pnr, null);
  assert.equal("pnr" in applyDraft(team, createDraft(team)).gameplan, false);
  assert.equal("pnr" in composeGameplan({ tempo: "normal" }), false);
});

test("saved roles survive an untouched apply, and the tip-off composer carries them", () => {
  const team = makeTeam({ screenerId: team0(1), afterScreen: "slip", finish: "mid", offBall: { [team0(2)]: "cut" } });
  const out = applyDraft(team, createDraft(team)).gameplan.pnr;
  assert.deepEqual(out, { screenerId: team0(1), afterScreen: "slip", offBall: { [team0(2)]: "cut" }, finish: "mid" });
  assert.deepEqual(composeGameplan({ tempo: "normal", pnr: out }).pnr, out);
});
function team0(i) { return pool[i].id; }

test("dirty saved values are washed out when the draft is born, so Apply is never stuck grey", () => {
  const handlerId = team0(0);
  const dirty = (pnr) => createDraft(makeTeam(pnr)).pnr;
  assert.equal(dirty({ screenerId: "sold-last-week", afterScreen: "roll" })?.screenerId, null, "a screener who left the team");
  assert.equal(dirty({ screenerId: handlerId, afterScreen: "roll" })?.screenerId, null, "the handler as his own screener");
  assert.equal(dirty({ afterScreen: "moonwalk", finish: "mid" })?.afterScreen, null, "an unknown after-screen");
  assert.deepEqual(dirty({ afterScreen: "moonwalk" }), null, "nothing usable is left");
  assert.deepEqual(dirty({ finish: "drive", offBall: { gone: "cut", [team0(3)]: "spot" } }).offBall, { [team0(3)]: "spot" });
  assert.deepEqual(validateDraft(createDraft(makeTeam({ screenerId: "x", afterScreen: "moonwalk" })), { team: makeTeam() }).errors, []);
});

test("SET_PNR keeps only choices, null clears one back to 'recommended', and editing back is not dirty", () => {
  const team = makeTeam();
  let s = createEditorState(team);
  s = reduce(s, { type: "SET_PNR", patch: { afterScreen: "pop", offBall: { [team0(3)]: "cut" } } });
  assert.deepEqual(s.draft.pnr, { screenerId: null, afterScreen: "pop", offBall: { [team0(3)]: "cut" }, finish: null });
  assert.equal(isDirty(s), true);
  s = reduce(s, { type: "SET_PNR", patch: { offBall: { [team0(4)]: "spot" } } });
  assert.deepEqual(s.draft.pnr.offBall, { [team0(3)]: "cut", [team0(4)]: "spot" }, "per-man choices merge");
  s = reduce(s, { type: "SET_PNR", patch: { afterScreen: null, offBall: { [team0(3)]: null, [team0(4)]: null } } });
  assert.equal(s.draft.pnr, null, "everything cleared is no plan at all");
  assert.equal(isDirty(s), false);
});

test("the handler cannot be the screener, and a screener or off-ball man who leaves the five drops out without making the board dirty", () => {
  const team = makeTeam();
  let s = createEditorState(team);
  s = reduce(s, { type: "SET_PNR", patch: { screenerId: team0(1), offBall: { [team0(2)]: "cut" } } });
  s = reduce(s, { type: "SET_BALL_HANDLER", playerId: team0(1) });
  assert.equal(s.draft.pnr?.screenerId ?? null, null, "the new handler was the screener: that choice goes");
  assert.equal(s.draft.pnr.offBall[team0(2)], "cut", "the others stay");
  // start from a saved plan, then change the five
  const saved = makeTeam({ screenerId: team0(1), afterScreen: "roll", offBall: { [team0(2)]: "cut" } });
  let t = createEditorState(saved);
  t = reduce(t, { type: "SYNC_STARTERS", starterIds: [team0(0), team0(2), team0(3), team0(4), team0(5)] });
  assert.equal(t.draft.pnr.screenerId, null, "the screener left the five");
  assert.equal(t.savedSnapshot.pnr.screenerId, null, "and the saved snapshot follows");
  assert.equal(isDirty(t), false, "changing a starter never marks the tactics unsaved");
  assert.equal(t.draft.pnr.offBall[team0(2)], "cut");
});

test("validation: the five codes, and warnings never block", () => {
  const team = withPnrAction(makeTeam());
  const codes = (pnr, over = {}) => validateDraft(draftOf(team, { pnr, ...over }), { team });
  assert.ok(codes({ screenerId: "ghost-of-the-past" }).errors.includes("PNR_SCREENER_NOT_ON_TEAM"));
  assert.ok(codes({ screenerId: team0(0) }).errors.includes("PNR_SCREENER_IS_HANDLER"));
  assert.ok(codes({ afterScreen: "moonwalk" }).errors.includes("PNR_AFTER_SCREEN_UNKNOWN"));
  const bench = codes({ screenerId: team0(8) });
  assert.ok(bench.warnings.includes("PNR_SCREENER_NOT_A_STARTER") && !bench.errors.length, "a bench screener plays, with a warning");
  assert.deepEqual(codes(null).errors, []);
  assert.deepEqual(codes({ screenerId: team0(1), afterScreen: "roll", finish: "mid", offBall: { [team0(2)]: "spot" } }).errors, []);
});

test("PNR_POP_WITHOUT_SHOT: only when the plan is a pick and roll, and only for a screener without a shot", () => {
  const team = withPnrAction(makeTeam());
  // two men we control: one with no shot at all, one a real floor shooter
  const noShot = Object.assign(team.players[1], { three: 35, threeTend: 10, offenseStyle: "post", playPos: "C", paint: 85 });
  const shooter = Object.assign(team.players[2], { three: 85, threeTend: 60, offenseStyle: "spot" });
  const starters = team.players.slice(0, 5).map((p) => p.id);
  const draft = (screenerId, afterScreen = "pop") => ({ ...createDraft(team), starterIds: starters, pnr: { screenerId, afterScreen, offBall: {}, finish: null } });
  assert.ok(validateDraft(draft(noShot.id), { team }).warnings.includes("PNR_POP_WITHOUT_SHOT"));
  assert.ok(!validateDraft(draft(shooter.id), { team }).warnings.includes("PNR_POP_WITHOUT_SHOT"));
  assert.ok(!validateDraft(draft(noShot.id, "roll"), { team }).warnings.includes("PNR_POP_WITHOUT_SHOT"), "roll is fine");
  const iso = makeTeam(); iso.players[0].orders = { ...(iso.players[0].orders || {}), action: "iso" };
  assert.equal(pnrIsActive({ ...createDraft(iso), ballAction: "iso" }, iso), false);
  assert.ok(!validateDraft({ ...draft(noShot.id), ballAction: "iso" }, { team: iso }).warnings.includes("PNR_POP_WITHOUT_SHOT"), "not a pick and roll: nothing to warn about");
});

test("commitDraft writes the roles onto the live team and the game receives them", () => {
  const team = makeTeam();
  let s = createEditorState(team);
  s = reduce(s, { type: "SET_BALL_ACTION", actionId: "pnr" });
  s = reduce(s, { type: "SET_PNR", patch: { screenerId: team0(2), afterScreen: "slip", finish: "fake_kick" } });
  assert.equal(pnrIsActive(s.draft, team), true);
  const res = commitDraft(team, s.draft);
  assert.equal(res.ok, true);
  assert.equal(team.gameplan.pnr.afterScreen, "slip");
  const away = { name: "Them", players: pool.slice(12, 24).map((p) => structuredClone(p)) };
  const sim = new GameSim({ home: team, away, youSide: "home", injuries: false, speed: 3, onEvent() {}, onTick() {}, onEnd() {} });
  assert.deepEqual(sim.home.gameplan.pnr, team.gameplan.pnr, "the sim carries the saved roles");
  assert.equal(sim.home.players?.[0]?.orders?.action ?? team.players[0].orders.action, "pnr");
});

test("recommendations are the engine's own automatic choices", () => {
  const team = withPnrAction(makeTeam());
  const starters = team.players.slice(0, 5);
  const rec = recommendPnrPlan(starters, starters[0]);
  assert.ok(rec.screenerId && rec.screenerId !== starters[0].id);
  assert.ok(["roll", "pop"].includes(rec.afterScreen));
  assert.deepEqual(Object.keys(rec.offBall).sort(), starters.slice(1).filter((p) => p.id !== rec.screenerId).map((p) => p.id).sort());
  assert.ok(Object.values(rec.offBall).every((v) => ["spot", "cut"].includes(v)));
  assert.ok(["mid", "drive"].includes(rec.finish), "fake_kick is never recommended");
  assert.equal(recommendPnrPlan(starters, null).finish, null);
});
