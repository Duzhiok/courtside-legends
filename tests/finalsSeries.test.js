import test from "node:test";
import assert from "node:assert/strict";
import {
  FINALS_TARGET_WINS,
  buildStagePods,
  findYourOpenMatch,
  finalsSeriesLabel,
  recordFinalsGame,
  startFinalsSeries,
} from "../js/engine/careerBracket.js";
import { reviveCareer, serializeCareer } from "../js/data/savegame.js";

/**
 * T8/R44: 金币晋级赛总决赛改三局两胜系列赛（用户 2026-10-23 拍板，取代原始的
 * 七场四胜设想），每场之间进市场买卖调整。这里测的是纯逻辑层：
 * 系列赛计分、未分胜负时 pod 的总决赛 match 必须保持未结算（这样下一场
 * 还能被 findYourOpenMatch 找到重打），以及存档往返后比分不丢。
 */
function team(id) {
  return { bracketId: id, name: id, isCpu: id !== "you", players: [] };
}

test("startFinalsSeries: fresh best-of-3 against the given opponent", () => {
  const opp = team("cpu-final");
  const s = startFinalsSeries(opp);
  assert.equal(s.opp, opp);
  assert.equal(s.wins, 0);
  assert.equal(s.losses, 0);
  assert.equal(s.target, FINALS_TARGET_WINS);
  assert.equal(FINALS_TARGET_WINS, 2);
});

test("recordFinalsGame: 2-0 ends the series as champion", () => {
  const s = startFinalsSeries(team("cpu-final"));
  assert.deepEqual(recordFinalsGame(s, true), { done: false, champion: false });
  assert.deepEqual(recordFinalsGame(s, true), { done: true, champion: true });
  assert.equal(s.wins, 2);
});

test("recordFinalsGame: 0-2 ends the series eliminated", () => {
  const s = startFinalsSeries(team("cpu-final"));
  assert.deepEqual(recordFinalsGame(s, false), { done: false, champion: false });
  assert.deepEqual(recordFinalsGame(s, false), { done: true, champion: false });
  assert.equal(s.losses, 2);
});

test("recordFinalsGame: 1-1 goes to a deciding game 3, winner takes it", () => {
  const s = startFinalsSeries(team("cpu-final"));
  recordFinalsGame(s, true);
  assert.deepEqual(recordFinalsGame(s, false), { done: false, champion: false });
  assert.deepEqual(recordFinalsGame(s, true), { done: true, champion: true });
  assert.equal(finalsSeriesLabel(s), "总决赛 2–1（先赢 2 场）");
});

test("recordFinalsGame: null series is a safe no-op", () => {
  assert.deepEqual(recordFinalsGame(null, true), { done: false, champion: false });
});

test("finals pod match stays open while the series is undecided", () => {
  // The wiring contract in app.js: undecided series games never call
  // applyMatchResult on the pod's final match, so the same pairing is
  // found again for the next game. This pins the pod side of that contract.
  const you = team("you");
  const opp = team("cpu-final");
  const { pods } = buildStagePods([you, opp]);
  const s = startFinalsSeries(opp);
  recordFinalsGame(s, true); // you take game 1; match intentionally NOT applied
  const open = findYourOpenMatch(pods);
  assert.ok(open, "final match must still be open for game 2");
  assert.equal(open.done, false);
  const other = open.a.bracketId === "you" ? open.b : open.a;
  assert.equal(other.bracketId, "cpu-final");
});

test("savegame roundtrip: series score and opponent survive serialize/revive", () => {
  const you = team("you");
  const opp = team("cpu-final");
  const { pods } = buildStagePods([you, opp]);
  const series = startFinalsSeries(opp);
  recordFinalsGame(series, true);
  recordFinalsGame(series, false);
  const career = {
    kind: "career",
    gold: 500,
    team: you,
    alive: [you, opp],
    pods,
    losses: { you: 0, "cpu-final": 0 },
    used: new Set(),
    series,
    finals: true,
    stageSize: 2,
  };
  const revived = reviveCareer(JSON.parse(JSON.stringify(serializeCareer(career))));
  assert.equal(revived.series.wins, 1);
  assert.equal(revived.series.losses, 1);
  assert.equal(revived.series.target, 2);
  assert.equal(revived.series.opp.bracketId, "cpu-final");
  // Same shared-identity guarantee as the rest of the career: the series
  // opponent is literally the same object as the one in alive[].
  assert.equal(revived.series.opp, revived.alive.find((t) => t.bracketId === "cpu-final"));
});
