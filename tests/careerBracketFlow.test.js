import test from "node:test";
import assert from "node:assert/strict";
import {
  allPodsDone,
  applyMatchResult,
  buildStagePods,
  careerStageLabel,
  collectAdvancers,
  finalizePod,
  findYourOpenMatch,
  listPodMatches,
  nextStageSize,
  progressPodAfterMid,
  progressPodAfterOpeners,
} from "../js/engine/careerBracket.js";

/**
 * Queue item 10 (B) — playoff/series flow checks: the career bracket
 * (gold ladder / custom budget draft) playoff flow at the engine level.
 * The finals best-of-3 series itself is already pinned in
 * tests/finalsSeries.test.js (scoring, open-match contract, save roundtrip);
 * this file pins the part that had zero coverage: pod double-elimination
 * progression and the full 32-team bracket playing down to one champion.
 * app.js wiring (resolveCareerYourResult / advanceCareerToNextStage /
 * syncCareerMatchesFromPods / the four result-screen branches) was checked
 * by reading against these contracts — see the 09:26 loop log.
 */
function team(id) {
  return { bracketId: id, name: id, isCpu: id !== "you", players: [] };
}

function teams(n, prefix = "t") {
  return Array.from({ length: n }, (_, i) => team(`${prefix}${i}`));
}

// Deterministic shuffle: buildStagePods takes an rng; a constant keeps the
// pod draw fixed so the bracket assertions don't depend on Math.random.
const fixedRng = () => 0.5;

function playPod(pod, pickWinner) {
  // Play every match the pod can produce, in the order the engine opens them.
  const play = (m) => {
    if (!m || m.done) return;
    applyMatchResult(m, pickWinner(m));
  };
  play(pod.openerA);
  play(pod.openerB);
  progressPodAfterOpeners(pod);
  play(pod.winnersMatch);
  play(pod.revivalMatch);
  progressPodAfterMid(pod);
  play(pod.deciderMatch);
  finalizePod(pod);
}

test("buildStagePods: 32 teams become 8 pods of 4 with 16 openers", () => {
  const alive = [team("you"), ...teams(31, "cpu")];
  const { pods, openers } = buildStagePods(alive, { rng: fixedRng });
  assert.equal(pods.length, 8);
  assert.equal(openers.length, 16);
  for (const pod of pods) {
    assert.equal(pod.teams.length, 4);
    assert.equal(pod.isFinal, undefined);
    assert.equal(pod.openerA.kind, "opener");
    assert.equal(pod.openerB.kind, "opener");
    assert.equal(pod.done, false);
    assert.deepEqual(pod.advancers, []);
    assert.deepEqual(pod.eliminated, []);
  }
  const yours = pods.flatMap((p) => [p.openerA, p.openerB]).filter((m) => m.yours);
  assert.equal(yours.length, 1, "exactly one opener involves the user");
});

test("buildStagePods: 2 teams become one finals pod with a single final match", () => {
  const { pods, openers } = buildStagePods([team("you"), team("cpu-final")], {
    rng: fixedRng,
  });
  assert.equal(pods.length, 1);
  assert.equal(pods[0].isFinal, true);
  assert.equal(pods[0].openerA.kind, "final");
  assert.equal(pods[0].openerB, null);
  assert.equal(openers.length, 1);
  assert.equal(openers[0].yours, true);
});

test("progressPodAfterOpeners: waits for both openers, then opens winners + revival", () => {
  const { pods } = buildStagePods(teams(4), { rng: fixedRng });
  const pod = pods[0];
  assert.deepEqual(progressPodAfterOpeners(pod), []);
  applyMatchResult(pod.openerA, pod.openerA.a);
  assert.deepEqual(progressPodAfterOpeners(pod), []);
  applyMatchResult(pod.openerB, pod.openerB.b);
  const opened = progressPodAfterOpeners(pod);
  assert.equal(opened.length, 2);
  assert.equal(pod.winnersMatch.kind, "winners");
  assert.equal(pod.revivalMatch.kind, "revival");
  assert.equal(pod.winnersMatch.a, pod.openerA.winner);
  assert.equal(pod.winnersMatch.b, pod.openerB.winner);
  assert.equal(pod.revivalMatch.a, pod.openerA.loser);
  assert.equal(pod.revivalMatch.b, pod.openerB.loser);
  // Idempotent: a second call opens nothing new.
  assert.deepEqual(progressPodAfterOpeners(pod), []);
});

test("progressPodAfterMid: winners winner advances at once, revival loser is out, decider is set", () => {
  const { pods } = buildStagePods(teams(4), { rng: fixedRng });
  const pod = pods[0];
  applyMatchResult(pod.openerA, pod.openerA.a); // t0 beats t1
  applyMatchResult(pod.openerB, pod.openerB.a); // t2 beats t3
  progressPodAfterOpeners(pod);
  assert.deepEqual(progressPodAfterMid(pod), [], "waits for both mid matches");
  applyMatchResult(pod.winnersMatch, pod.winnersMatch.a); // t0 beats t2
  assert.deepEqual(progressPodAfterMid(pod), [], "still waits for the revival");
  applyMatchResult(pod.revivalMatch, pod.revivalMatch.b); // t3 beats t1
  const opened = progressPodAfterMid(pod);
  assert.equal(opened.length, 1);
  assert.equal(pod.deciderMatch.kind, "decider");
  // Expectations are derived from the played matches, not hardcoded ids:
  // the pod draw is shuffled, so which team is where varies by seed.
  assert.deepEqual(
    pod.advancers.map((t) => t.bracketId),
    [pod.winnersMatch.winner.bracketId],
    "winners-match winner advances immediately"
  );
  assert.deepEqual(
    pod.eliminated.map((t) => t.bracketId),
    [pod.revivalMatch.loser.bracketId],
    "revival loser (second loss) is eliminated"
  );
  assert.equal(pod.deciderMatch.a, pod.winnersMatch.loser, "winners-match loser");
  assert.equal(pod.deciderMatch.b, pod.revivalMatch.winner, "revival winner");
  assert.deepEqual(progressPodAfterMid(pod), [], "idempotent");
});

test("finalizePod: after the decider exactly 2 advance and 2 are eliminated", () => {
  const { pods } = buildStagePods(teams(4), { rng: fixedRng });
  const pod = pods[0];
  // Play .a in both openers, .a in the winners match, .b in the revival and decider.
  // (The draw is shuffled, so the test reads the winners/losers off the matches.)
  applyMatchResult(pod.openerA, pod.openerA.a);
  applyMatchResult(pod.openerB, pod.openerB.a);
  progressPodAfterOpeners(pod);
  applyMatchResult(pod.winnersMatch, pod.winnersMatch.a);
  applyMatchResult(pod.revivalMatch, pod.revivalMatch.b);
  progressPodAfterMid(pod);
  assert.equal(pod.done, false, "not done before the decider");
  finalizePod(pod);
  assert.equal(pod.done, false, "finalize is a no-op while the decider is open");
  applyMatchResult(pod.deciderMatch, pod.deciderMatch.b);
  finalizePod(pod);
  assert.equal(pod.done, true);
  assert.deepEqual(
    pod.advancers.map((t) => t.bracketId).sort(),
    [pod.winnersMatch.winner.bracketId, pod.deciderMatch.winner.bracketId].sort()
  );
  assert.deepEqual(
    pod.eliminated.map((t) => t.bracketId).sort(),
    [pod.revivalMatch.loser.bracketId, pod.deciderMatch.loser.bracketId].sort()
  );
  // Double-elimination invariant: every eliminated team lost twice.
  // The revival loser lost opener + revival; the decider loser lost winners + decider.
  assert.equal(listPodMatches([pod]).filter((m) => m.done).length, 5);
});

test("finalizePod: finals pod settles on its single match", () => {
  const { pods } = buildStagePods([team("you"), team("cpu-final")], {
    rng: fixedRng,
  });
  const pod = pods[0];
  finalizePod(pod);
  assert.equal(pod.done, false, "no-op while the final is open");
  applyMatchResult(pod.openerA, pod.openerA.a);
  finalizePod(pod);
  assert.equal(pod.done, true);
  assert.deepEqual(
    pod.advancers.map((t) => t.bracketId),
    ["you"]
  );
  assert.deepEqual(
    pod.eliminated.map((t) => t.bracketId),
    ["cpu-final"]
  );
});

test("findYourOpenMatch: follows the pod path opener -> winners/revival -> decider", () => {
  const alive = [team("you"), ...teams(3)];
  const { pods } = buildStagePods(alive, { rng: fixedRng });
  const pod = pods.find((p) => p.teams.some((t) => t.bracketId === "you"));
  let open = findYourOpenMatch(pods);
  assert.equal(open, pod.openerA.a.bracketId === "you" || pod.openerA.b.bracketId === "you" ? pod.openerA : pod.openerB);
  // Win the opener: the user's next match is the winners match.
  const yourOpener = open;
  applyMatchResult(yourOpener, team("you"));
  const otherOpener = yourOpener === pod.openerA ? pod.openerB : pod.openerA;
  applyMatchResult(otherOpener, otherOpener.a);
  progressPodAfterOpeners(pod);
  open = findYourOpenMatch(pods);
  assert.equal(open, pod.winnersMatch);
  // Lose the winners match: the user drops to the decider, not out.
  const winnersLoser =
    pod.winnersMatch.a.bracketId === "you" ? pod.winnersMatch.a : pod.winnersMatch.b;
  const winnersWinner =
    winnersLoser === pod.winnersMatch.a ? pod.winnersMatch.b : pod.winnersMatch.a;
  applyMatchResult(pod.winnersMatch, winnersWinner);
  assert.ok(
    pod.winnersMatch.loser.bracketId === "you",
    "the user lost the winners match"
  );
  applyMatchResult(pod.revivalMatch, pod.revivalMatch.a);
  progressPodAfterMid(pod);
  open = findYourOpenMatch(pods);
  assert.equal(open, pod.deciderMatch);
  applyMatchResult(pod.deciderMatch, team("you"));
  finalizePod(pod);
  assert.equal(findYourOpenMatch(pods), null);
  assert.ok(pod.advancers.some((t) => t.bracketId === "you"), "one loss still advances");
});

test("full bracket: 32 teams play down to one champion, 76 matches, stage sizes halve", () => {
  // Winner rule: the user always wins; every CPU match goes to the first-listed team.
  const pickWinner = (m) => {
    if (m.a.bracketId === "you" || m.b.bracketId === "you") return team("you");
    return m.a;
  };
  let alive = [team("you"), ...teams(31, "cpu")];
  let totalMatches = 0;
  const stageSizes = [];
  while (alive.length > 1) {
    stageSizes.push(alive.length);
    const { pods } = buildStagePods(alive, { rng: fixedRng });
    for (const pod of pods) playPod(pod, pickWinner);
    assert.ok(allPodsDone(pods), `all pods done at stage ${alive.length}`);
    const advancers = collectAdvancers(pods);
    assert.equal(advancers.length, alive.length / 2, "half the field advances");
    assert.ok(advancers.some((t) => t.bracketId === "you"), "user still alive");
    totalMatches += pods.flatMap((p) => listPodMatches([p])).filter((m) => m.done).length;
    alive = advancers;
  }
  assert.deepEqual(stageSizes, [32, 16, 8, 4, 2]);
  assert.equal(alive.length, 1);
  assert.equal(alive[0].bracketId, "you", "user wins the bracket");
  // 40 + 20 + 10 + 5 + 1: five matches per 4-team pod, one final.
  assert.equal(totalMatches, 76);
});

test("full bracket: user out after two losses in the round of 32", () => {
  const you = team("you");
  const alive = [you, ...teams(31, "cpu")];
  const { pods } = buildStagePods(alive, { rng: fixedRng });
  const pod = pods.find((p) => p.teams.some((t) => t.bracketId === "you"));
  const pickWinner = (m) => {
    // The user loses every match they play; CPU matches go to the first team.
    if (m.a.bracketId === "you" || m.b.bracketId === "you") {
      return m.a.bracketId === "you" ? m.b : m.a;
    }
    return m.a;
  };
  playPod(pod, pickWinner);
  assert.equal(pod.done, true);
  assert.ok(!pod.advancers.some((t) => t.bracketId === "you"), "user does not advance");
  assert.ok(pod.eliminated.some((t) => t.bracketId === "you"), "user is eliminated");
  // The pod still completes with exactly 2 advancers from the other teams.
  assert.equal(pod.advancers.length, 2);
  assert.equal(pod.eliminated.length, 2);
});

test("nextStageSize / careerStageLabel: stage ladder and finals label", () => {
  assert.equal(nextStageSize(32), 16);
  assert.equal(nextStageSize(16), 8);
  assert.equal(nextStageSize(8), 4);
  assert.equal(nextStageSize(4), 2);
  assert.equal(nextStageSize(2), null);
  assert.equal(nextStageSize(99), null);
  assert.equal(careerStageLabel(32), "三十二强 · 32进16");
  assert.equal(careerStageLabel(2), "总决赛 · 2进1");
  assert.equal(careerStageLabel(2, { finals: true }), "总决赛 · 2进1");
  assert.equal(careerStageLabel(16, { lang: "en" }), "Round of 16 · 16→8");
  assert.equal(careerStageLabel(99), "99 强");
});
