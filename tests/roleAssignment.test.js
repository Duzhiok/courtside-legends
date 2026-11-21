// assignRoles was sped up by working out the (player, job) scores once per call instead of once per permutation (the season hub's
// opponent panel scores 792 lineups through it). The ORACLE below is the previous implementation, copied as it was: every lineup, system,
// lean and override combination must give the same jobs, scores and mismatch flags.
import test from "node:test";
import assert from "node:assert/strict";
import { realTeam } from "./helpers/realGame.js";
import { permutations } from "../js/myteam/rolePermutations.js";
import { assignRoles, roleScore, roleTemplate, ROLES, ovr, mismatchKind, withRoleScoreMemo } from "../js/myteam/playerRoleFit.js";

const JOB_WEIGHT = [1.5, 1.2, 1, 1, 1];
const LEAN = { offense: ["creator", "spacer", "postScorer", "runner"], defense: ["stopper", "rimProtector", "rebounder"] };
const leanBonus = (roleId, lean) => (LEAN[lean]?.includes(roleId) ? 1.06 : 1);
const naturalRole = (player) => Object.keys(ROLES).map((id) => ({ id, score: roleScore(id, player) })).sort((x, y) => y.score - x.score)[0];

function oracle(starters, tacticId, overrides = {}, lean = "balanced") {
  const list = (starters || []).filter(Boolean).slice(0, 5);
  const jobs = roleTemplate(tacticId);
  const free = list.filter((p) => !overrides[p.id] || !ROLES[overrides[p.id]]);
  const remaining = [...jobs];
  for (const p of list) {
    const o = overrides[p.id];
    if (o && ROLES[o]) { const i = remaining.indexOf(o); if (i >= 0) remaining.splice(i, 1); }
  }
  const pool = remaining.length >= free.length ? remaining : jobs;
  const out = {};
  let rest = free;
  let restJobs = pool;
  if (pool[0] === jobs[0] && free.length > 1) {
    const engine = [...free].sort((x, y) => roleScore(jobs[0], y) - roleScore(jobs[0], x) || ovr(y) - ovr(x))[0];
    out[engine.id] = { roleId: jobs[0], overridden: false };
    rest = free.filter((p) => p !== engine);
    restJobs = pool.slice(1);
  }
  let best = null;
  for (const perm of permutations(restJobs, rest.length)) {
    const total = perm.reduce((t, job, i) => t + roleScore(job, rest[i]) * (JOB_WEIGHT[jobs.indexOf(job)] || 1) * leanBonus(job, lean), 0);
    if (!best || total > best.total) best = { total, perm };
  }
  rest.forEach((p, i) => { out[p.id] = { roleId: best?.perm[i] || "secondary", overridden: false }; });
  for (const p of list) if (!out[p.id]) out[p.id] = { roleId: overrides[p.id], overridden: true };
  for (const p of list) {
    const r = out[p.id];
    r.score = roleScore(r.roleId, p);
    r.natural = naturalRole(p);
    r.mismatchKind = mismatchKind(p, r.roleId, r.score, r.natural);
    r.mismatch = !!r.mismatchKind;
  }
  return out;
}

const TACTICS = ["balanced", "pnr_spam", "horns", "motion", "triangle", "smallball", "post_up", "twin_towers", "grind", "switch_all", "transition", "crash_boards", "freestyle", "not-a-real-system"];
const cards = [["CHI", 1996], ["LAL", 2001], ["GSW", 2016], ["BOS", 1986]].flatMap(([code, year]) => realTeam(code, year).players);

test("assignRoles gives exactly what the previous implementation gave (every system, lean, with and without pinned jobs)", () => {
  let checked = 0;
  for (let start = 0; start + 5 <= cards.length; start += 3) {
    const five = cards.slice(start, start + 5);
    for (const tactic of TACTICS) {
      for (const lean of ["balanced", "offense", "defense"]) {
        assert.deepEqual(assignRoles(five, tactic, {}, lean), oracle(five, tactic, {}, lean), `${five.map((c) => c.id)} ${tactic} ${lean}`);
        checked++;
      }
      const pinned = { [five[1].id]: "rimProtector", [five[3].id]: "spacer" };
      assert.deepEqual(assignRoles(five, tactic, pinned), oracle(five, tactic, pinned), `pinned ${tactic}`);
      const everyone = Object.fromEntries(five.map((c) => [c.id, "stopper"]));
      assert.deepEqual(assignRoles(five, tactic, everyone), oracle(five, tactic, everyone), `all pinned ${tactic}`);
      checked += 2;
    }
  }
  assert.ok(cards.length >= 30, `real cards loaded: ${cards.length}`);
  assert.ok(checked > 500, `compared ${checked} cases`);
});

test("short lineups and empty input behave as before", () => {
  for (const n of [0, 1, 2, 3, 4]) {
    const few = cards.slice(0, n);
    assert.deepEqual(assignRoles(few, "pnr_spam"), oracle(few, "pnr_spam"), `${n} players`);
  }
  assert.deepEqual(assignRoles(null, "balanced"), oracle(null, "balanced"));
});

const scoreNow = (p) => Math.max(0, Math.min(99, Math.round(ROLES.spacer.score(p))));

test("withRoleScoreMemo remembers scores only inside its scope, so an edited card is never scored from stale memory", () => {
  const p = { ...cards[0] };
  const before = roleScore("spacer", p);
  withRoleScoreMemo(() => {
    assert.equal(roleScore("spacer", p), before);
    p.catchShoot = 99;
    p.three = 99;
    assert.equal(roleScore("spacer", p), before, "inside the scope the first answer is kept (an analysis must not edit the cards it reads)");
    withRoleScoreMemo(() => assert.equal(roleScore("spacer", p), before, "a nested scope shares the outer memory"));
    assert.equal(roleScore("spacer", p), before, "...and ending the nested scope does not drop it");
  });
  assert.notEqual(roleScore("spacer", p), before, "outside the scope the edit is seen again");
  assert.equal(roleScore("spacer", p), scoreNow(p));
  assert.throws(() => withRoleScoreMemo(() => { roleScore("spacer", p); throw new Error("boom"); }), /boom/);
  p.catchShoot = 1;
  assert.equal(roleScore("spacer", p), scoreNow(p), "a throw inside the scope still ends it");
});

test("permutationList is the same list of picks as the generator, in the same order, and is shared between calls", async () => {
  const { permutations, permutationList } = await import("../js/myteam/rolePermutations.js");
  for (const [pool, k] of [[["a", "b", "c", "d", "e"], 5], [["spacer", "spacer", "stopper", "highPost", "rimProtector"], 4], [["x", "x", "x"], 3], [["p", "q"], 2], [["p", "q"], 0], [[], 0], [["p"], 3]]) {
    assert.deepEqual(permutationList(pool, k), [...permutations(pool, k)], `${pool.join()} / ${k}`);
  }
  const a = permutationList(["a", "b", "c"], 2);
  assert.equal(permutationList(["a", "b", "c"], 2), a, "built once");
  assert.notDeepEqual(permutationList(["a", "b", "c"], 3), a, "a different k is a different list");
});
