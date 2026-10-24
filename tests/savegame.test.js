import test from "node:test";
import assert from "node:assert/strict";
import { applyMatchResult, buildStagePods, progressPodAfterMid, progressPodAfterOpeners } from "../js/engine/careerBracket.js";
import { serializeCareer, reviveCareer, jsonClone } from "../js/data/savegame.js";

/**
 * R27: a fresh 32-team 金币晋级赛/自定义预算轮抽 career was serializing to ~7.9MB and
 * blowing the localStorage quota before a single match was played — because every team
 * object is referenced from `career.team`, `alive[]`, every pod's `teams[]`, and every
 * match's a/b/winner/loser, and a naive JSON.stringify duplicates each shared reference
 * into an independent full copy instead of writing it once. These tests pin the fix
 * (dedupe by bracketId, restore shared identity on revive) directly, with no localStorage
 * involved — serializeCareer/reviveCareer are pure data transforms.
 */
function bigRoster(bracketId, count = 12) {
  // Padded to resemble a real season card's rough size (skills, ratings, etc.)
  return Array.from({ length: count }, (_, i) => ({
    id: `${bracketId}-p${i}`,
    name: `Player ${bracketId}-${i}`,
    pos: ["PG", "SG", "SF", "PF", "C"][i % 5],
    skills: ["dime_dropper", "rainmaker", "lockdown"],
    ratings: { scoring: 80, three: 75, mid: 70, paint: 72, pass: 68, defense: 74, speed: 71 },
    note: "x".repeat(200), // stand-in for the extra bulk real cards carry
  }));
}

function freshBracketCareer(teamCount = 32) {
  const teams = Array.from({ length: teamCount }, (_, i) => {
    const bracketId = i === 0 ? "you" : `cpu-${i}`;
    return { bracketId, name: bracketId, isCpu: bracketId !== "you", players: bigRoster(bracketId) };
  });
  const { pods } = buildStagePods(teams);
  // Simulate the CPU-only half of a round progressing the way syncCareerMatchesFromPods
  // does in real play: finish every opener that doesn't involve "you", which creates
  // winnersMatch/revivalMatch (more shared references to the SAME team objects) before
  // the human has even played their own first game. This is what the real ~7.9MB
  // reproduction case looked like, not a pristine round-1-only bracket.
  for (const pod of pods) {
    if (pod.openerA.a.bracketId !== "you" && pod.openerA.b.bracketId !== "you") {
      applyMatchResult(pod.openerA, pod.openerA.a);
    }
    if (pod.openerB && pod.openerB.a.bracketId !== "you" && pod.openerB.b.bracketId !== "you") {
      applyMatchResult(pod.openerB, pod.openerB.a);
    }
    if (pod.openerA.done && pod.openerB?.done) progressPodAfterOpeners(pod);
    if (pod.winnersMatch && pod.winnersMatch.a.bracketId !== "you" && pod.winnersMatch.b.bracketId !== "you") {
      applyMatchResult(pod.winnersMatch, pod.winnersMatch.a);
    }
    if (pod.revivalMatch && pod.revivalMatch.a.bracketId !== "you" && pod.revivalMatch.b.bracketId !== "you") {
      applyMatchResult(pod.revivalMatch, pod.revivalMatch.a);
    }
    if (pod.winnersMatch?.done && pod.revivalMatch?.done) progressPodAfterMid(pod);
  }
  const you = teams[0];
  return {
    kind: "career",
    gold: 300,
    losses: Object.fromEntries(teams.map((t) => [t.bracketId, 0])),
    used: new Set(["some-player-id"]),
    team: you,
    alive: teams,
    pods,
    roundMatches: [],
    series: null,
    skillInventory: [],
  };
}

test("serializeCareer: a fresh 32-team bracket shrinks dramatically vs. a naive deep clone", () => {
  const career = freshBracketCareer(32);
  const naiveSize = JSON.stringify(jsonClone(career)).length;
  const dedupedSize = JSON.stringify(serializeCareer(career)).length;
  assert.ok(naiveSize > 800_000, `fixture should reproduce real-world bloat (got ${naiveSize} bytes)`);
  // The whole point: should not just be "a bit smaller", should be an order of magnitude down.
  assert.ok(
    dedupedSize < naiveSize / 4,
    `deduped (${dedupedSize}) should be well under 1/4 of naive (${naiveSize})`
  );
});

test("serializeCareer: each team's roster appears exactly once in the payload, not once per bracket slot", () => {
  const career = freshBracketCareer(8);
  const serialized = serializeCareer(career);
  assert.equal(Object.keys(serialized.__teamsById).length, 8, "one entry per distinct bracketId");
  // A player id unique to "you" should show up exactly once in the whole serialized blob,
  // even though "you" appears in alive[], pods[].teams[], and multiple match slots.
  const blob = JSON.stringify(serialized);
  const occurrences = blob.split("you-p0").length - 1;
  assert.equal(occurrences, 1, "the human team's player should be written exactly once");
});

test("reviveCareer round-trips a bracket career with no data loss", () => {
  const career = freshBracketCareer(8);
  const revived = reviveCareer(serializeCareer(career));
  assert.equal(revived.team.bracketId, "you");
  assert.equal(revived.team.players.length, 12);
  assert.equal(revived.alive.length, 8);
  assert.equal(revived.pods.length, career.pods.length);
  assert.ok(revived.used instanceof Set);
  assert.ok(revived.used.has("some-player-id"));
  assert.equal(revived.gold, 300);
});

test("reviveCareer restores (not just preserves) shared object identity for the human team", () => {
  const career = freshBracketCareer(8);
  const revived = reviveCareer(serializeCareer(career));
  const youInAlive = revived.alive.find((t) => t.bracketId === "you");
  assert.equal(revived.team, youInAlive, "c.team and its alive[] slot must be the literal same object");
  // Also check "you" wherever they show up in the pods (either opener match, either side).
  const findYouMatch = (pod) =>
    [pod.openerA, pod.openerB].find((m) => m?.a?.bracketId === "you" || m?.b?.bracketId === "you");
  const youMatch = revived.pods.map(findYouMatch).find(Boolean);
  assert.ok(youMatch, "fixture should have 'you' in one of the opener matches");
  const youInMatch = youMatch.a?.bracketId === "you" ? youMatch.a : youMatch.b;
  assert.equal(youInMatch, revived.team, "the match-slot reference must be the same object as c.team");
});

test("reviveCareer: mutating c.team.players is visible through every other reference to the same team", () => {
  const career = freshBracketCareer(8);
  const revived = reviveCareer(serializeCareer(career));
  revived.team.players.push({ id: "new-signing", name: "New Signing", pos: "C" });
  const youInAlive = revived.alive.find((t) => t.bracketId === "you");
  assert.equal(youInAlive.players.length, 13, "shared reference means the signing shows up everywhere 'you' appears");
});

test("serializeCareer/reviveCareer: missing optional fields (no pods, no series) don't crash", () => {
  const minimal = { kind: "duel", gold: 0, teamA: { bracketId: "a", players: [] }, teamB: { bracketId: "b", players: [] } };
  const revived = reviveCareer(serializeCareer(minimal));
  assert.equal(revived.kind, "duel");
  assert.deepEqual(revived.alive, []);
  assert.deepEqual(revived.pods, []);
  // Fields this function doesn't know about (duel's teamA/teamB) pass through untouched.
  assert.equal(revived.teamA.bracketId, "a");
  assert.equal(revived.teamB.bracketId, "b");
});

test("serializeCareer/reviveCareer: null/undefined career is a safe no-op", () => {
  assert.equal(serializeCareer(null), null);
  assert.equal(reviveCareer(null), null);
});
