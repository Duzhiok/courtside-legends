import test from "node:test";
import assert from "node:assert/strict";
import * as season from "../js/engine/season.js";
import * as skills from "../js/data/skills.js";

/** A tiny finished season: our star dominates, so he wins MVP and a spot on All-NBA. */
function finishedSeason() {
  const star = { id: "star", name: "Our Star", skills: ["bank_45"], pos: "SF" };
  const stats = (pts, reb, ast) => ({ gp: 70, min: 2400, pts: pts * 70, reb: reb * 70, ast: ast * 70, stl: 70, blk: 70, tov: 140 });
  return {
    userTeamId: "USER",
    teams: {
      USER: { name: "Us", players: [star] },
      OTHER: { name: "Them", players: [] },
    },
    standings: { USER: { w: 65, l: 17 }, OTHER: { w: 20, l: 62 } },
    playerSeason: {
      star: { playerId: "star", name: "Our Star", teamId: "USER", pos: "SF", ovr: 95, stats: stats(32, 9, 7) },
      rival: { playerId: "rival", name: "Rival", teamId: "OTHER", pos: "PG", ovr: 78, stats: stats(14, 3, 4) },
    },
  };
}

test("winning MVP / All-NBA is an honour only: no skill reward is created or granted", () => {
  const st = finishedSeason();
  const before = [...st.teams.USER.players[0].skills];
  const awards = season.computeAwards(st);
  assert.equal(awards.mvp.playerId, "star", "our star really did win MVP");
  assert.equal(st.awardSkillRewards, undefined, "no reward list");
  assert.deepEqual(st.teams.USER.players[0].skills, before, "skills untouched");
});

test("the old award-skill machinery is gone from the engine and the skill catalogue", () => {
  for (const name of ["claimAwardSkill", "buildUserAwardSkillRewards"]) assert.equal(season[name], undefined, name);
  for (const name of ["listAwardSkillCatalog", "listAwardSkillChoices", "pickMergeSkill", "MERGE_SKILL_POOL"]) {
    assert.equal(skills[name], undefined, `${name} would reopen a free-skill path`);
  }
  assert.ok(Array.isArray(skills.MERGE_ATTR_KEYS), "the ★ attribute list must survive the clean-up");
});
