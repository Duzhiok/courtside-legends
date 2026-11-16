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
import { renderTacticsBoardHtml } from "../js/ui/tactics/tacticsBoardView.js";

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
