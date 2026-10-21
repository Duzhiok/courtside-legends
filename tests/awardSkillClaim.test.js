import test from "node:test";
import assert from "node:assert/strict";
import { claimAwardSkill } from "../js/engine/season.js";

test("award skill claim records the selected skill separately from pre-existing skills", () => {
  const player = { id: "p1", name: "Tim", skills: ["bank_45"] };
  const st = {
    userTeamId: "USER",
    teams: { USER: { players: [player] } },
    awardSkillRewards: [{ id: "reward-1", playerId: "p1", playerName: "Tim", awardName: "最快进步" }],
  };
  const result = claimAwardSkill(st, "reward-1", "rainmaker");
  assert.equal(result.ok, true);
  assert.equal(st.awardSkillRewards[0].skillName, "三分雨");
  assert.deepEqual(st.awardSkillRewards[0].previousSkillIds, ["bank_45"]);
  assert.deepEqual(player.skills, ["bank_45", "rainmaker"]);
});
