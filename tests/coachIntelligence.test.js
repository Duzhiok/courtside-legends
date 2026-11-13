import test from "node:test";
import assert from "node:assert/strict";
import { realCards } from "./helpers/realGame.js";
import { COACHES, TACTICS, isStarterCoach } from "../js/data/coaches.js";
import { analyzeTeam } from "../js/myteam/coachDrivenAnalysis.js";
import { recommendLineups, SWAP_MARGIN } from "../js/myteam/lineupRecommendations.js";
import { assignRoles } from "../js/myteam/playerRoleFit.js";
import { selectableSystems, coachProfile } from "../js/coaching/coachTacticalProfile.js";
import { ensureStarterCoach } from "../js/coaching/starterCoach.js";

const pick = (b, y) => realCards(b).find((c) => c.season === y) || realCards(b).at(-1);
const FIVE = [pick("doncilu01", 2024), pick("hardati02", 2019), pick("dragigo01", 2013), pick("millspa01", 2013), pick("mutomdi01", 1998)];
const coach = (id) => COACHES.find((c) => c.id === id);
const roleOf = (r, p) => r.playerRoleFits[p.id].roleId;

test("the same five get different roles and conflicts under different systems", () => {
  const c = coach("kerr-2016-gsw");
  const pnr = analyzeTeam({ coach: c, tacticalSystem: "pnr_spam", starters: FIVE });
  const out = analyzeTeam({ coach: c, tacticalSystem: "five_out", starters: FIVE });
  const grind = analyzeTeam({ coach: c, tacticalSystem: "grind", starters: FIVE });
  assert.equal(roleOf(pnr, FIVE[0]), "creator"); // Luka runs the pick and roll
  assert.equal(roleOf(pnr, FIVE[4]), "rollBig"); // Mutombo is the screener
  assert.equal(roleOf(grind, FIVE[4]), "rimProtector");
  assert.ok(out.conflicts.some((x) => x.code === "spacing"), "five-out exposes the spacing problem");
  assert.ok(!pnr.conflicts.some((x) => x.code === "spacing"));
  assert.ok(pnr.tacticalSynergies.some((s) => s.code === "pnr"));
});

test("a strong player can have a poor fit in a system, without getting weaker", () => {
  const before = JSON.stringify(FIVE);
  const r = analyzeTeam({ coach: coach("kerr-2016-gsw"), tacticalSystem: "five_out", starters: FIVE });
  const mutombo = r.playerRoleFits[FIVE[4].id];
  assert.ok(mutombo.fit < 70, "a 99 rim protector is a poor five-out piece");
  assert.ok(r.conflicts.some((x) => x.code === "role_mismatch"));
  assert.equal(JSON.stringify(FIVE), before, "analysis never mutates the cards");
  assert.equal(r.intrinsicStrengths.interiorDefense.score, analyzeTeam({ coach: coach("phil-1996-chi"), tacticalSystem: "grind", starters: FIVE }).intrinsicStrengths.interiorDefense.score, "base strengths ignore the coach");
});

test("native vs off-system is data-driven, and the coach changes what the player can pick", () => {
  const kerr = coach("kerr-2016-gsw");
  const phil = coach("phil-1996-chi");
  const k = selectableSystems(kerr, FIVE);
  assert.ok(k.filter((s) => s.native).length >= 1 && k.some((s) => !s.native));
  assert.ok(coachProfile(phil).nativeSystems.includes("triangle"));
  assert.ok(!coachProfile(kerr).nativeSystems.includes("triangle"));
  const off = analyzeTeam({ coach: phil, tacticalSystem: "five_out", starters: FIVE });
  assert.ok(off.conflicts.some((x) => x.code === "off_system"));
  assert.ok(!analyzeTeam({ coach: kerr, tacticalSystem: "five_out", starters: FIVE }).conflicts.some((x) => x.code === "off_system"));
});

test("manual role override changes the conflict analysis", () => {
  const c = coach("kerr-2016-gsw");
  const base = analyzeTeam({ coach: c, tacticalSystem: "pnr_spam", starters: FIVE });
  const bad = analyzeTeam({ coach: c, tacticalSystem: "pnr_spam", starters: FIVE, playerRoles: { [FIVE[4].id]: "spacer" } });
  assert.equal(bad.playerRoleFits[FIVE[4].id].overridden, true);
  assert.ok(bad.conflicts.some((x) => x.code === "role_mismatch" && x.data.id === FIVE[4].id));
  assert.ok(!base.conflicts.some((x) => x.code === "role_mismatch" && x.data.id === FIVE[4].id));
});

const ROSTER = ["jordami01", "doncilu01", "curryst01", "duncati01", "millspa01", "thompkl01", "mutomdi01", "dragigo01", "hardati02", "goberru01"].map((b) => pick(b, 2016));
const CUR = ROSTER.filter((p) => ["jordami01", "duncati01", "doncilu01", "millspa01", "curryst01"].includes(p.bref)).map((p) => p.id);
const rec = (c, t, currentIds = CUR) => recommendLineups({ coach: coach(c), tacticalSystem: t, roster: ROSTER, currentIds });

test("recommendation never inherits a manual role override, and is preview-only", () => {
  const snapshot = JSON.stringify(ROSTER);
  const a = rec("kerr-2016-gsw", "five_out");
  // the API has no override input at all; analysis with an override must not change the recommendation
  analyzeTeam({ coach: coach("kerr-2016-gsw"), tacticalSystem: "five_out", starters: ROSTER.slice(0, 5), playerRoles: { [ROSTER[0].id]: "rimProtector" } });
  assert.deepEqual(rec("kerr-2016-gsw", "five_out"), a);
  assert.equal(JSON.stringify(ROSTER), snapshot);
  assert.equal(recommendLineups({ coach: coach("kerr-2016-gsw"), tacticalSystem: "five_out", roster: ROSTER.slice(0, 4) }), null);
});

test("coach/system change the recommendation, and a swap names its gains and costs", () => {
  const spaced = rec("kerr-2016-gsw", "five_out");
  const rim = rec("phil-1996-chi", "grind");
  assert.notEqual(spaced.verdict + spaced.best.ids.join(), rim.verdict + rim.best.ids.join());
  for (const r of [spaced, rim]) if (r.verdict === "swap") {
    assert.ok(r.tradeoffs, "swap has a trade-off block");
    assert.ok(r.tradeoffs.gains.length + r.tradeoffs.losses.length + r.tradeoffs.benchedStars.length > 0, "gains/costs are spelled out");
    assert.ok(r.best.U - r.current.U >= SWAP_MARGIN);
  }
});

test("elite players are not benched for a marginal gain; a clear margin is required", () => {
  for (const [c, t] of [["kerr-2016-gsw", "five_out"], ["kerr-2016-gsw", "pnr_spam"], ["phil-1996-chi", "grind"], ["phil-1996-chi", "triangle"], ["rookie-hc-2024", "balanced"]]) {
    const r = rec(c, t);
    if (r.verdict !== "swap") continue;
    assert.ok(r.best.U - r.current.U >= SWAP_MARGIN, `${c}/${t}`);
    for (const s of r.tradeoffs.benchedStars) assert.ok(r.tradeoffs.gains.length > 0 || r.tradeoffs.losses.length === 0, `${s.name} benched without a stated reason`);
  }
});

test("a lower-OVR specialist can win when the numbers justify it (no hard OVR protection)", () => {
  const stars = ["jordami01", "doncilu01", "curryst01", "duncati01", "millspa01"].map((b) => pick(b, 2016));
  const bench = [pick("mutomdi01", 1998), pick("goberru01", 2019)];
  const weak = { ...stars[0], id: "weak-star", name: "Weak Star", ovr: 99, archetype: "iso_creator", pos: "SG", handle: 20, pass: 20, scoring: 20, three: 20, catchShoot: 20, offDribble: 20, iq: 20, defense: 20, perimDef: 20, interiorDef: 20, rebound: 20, block: 20, steal: 20, speed: 20, stamina: 20, strength: 20, paint: 20, mid: 20 };
  const r = recommendLineups({ coach: coach("phil-1996-chi"), tacticalSystem: "grind", roster: [...stars.slice(1), weak, ...bench], currentIds: [weak.id, ...stars.slice(1, 5).map((p) => p.id)] });
  assert.ok(r.verdict === "swap" && r.swaps.out.includes("weak-star"), "an OVR-99 label with empty attributes does not get protected");
});

test("Jordan assigned to rim protection raises a position mismatch (and nothing claims engine effect)", () => {
  const jordan = pick("jordami01", 1996);
  const five = [jordan, FIVE[0], FIVE[2], FIVE[3], FIVE[4]];
  const r = analyzeTeam({ coach: coach("kerr-2016-gsw"), tacticalSystem: "grind", starters: five, playerRoles: { [jordan.id]: "rimProtector" } });
  const c = r.conflicts.find((x) => x.code === "role_mismatch" && x.data.id === jordan.id);
  assert.ok(c, "mismatch flagged");
  assert.equal(c.data.kind, "position");
  assert.equal(c.simBacked, false);
});

test("effect labels: only effects GameSim consumes are marked as gameplay-active", () => {
  const off = analyzeTeam({ coach: coach("phil-1996-chi"), tacticalSystem: "five_out", starters: FIVE });
  assert.equal(off.conflicts.find((x) => x.code === "off_system").simBacked, false);
  assert.equal(off.coachSystemFit.simBacked, true); // lineupFit really is read by GameSim
  for (const f of Object.values(off.playerRoleFits)) assert.equal(f.simBacked, false);
  const small = analyzeTeam({ coach: coach("kerr-2016-gsw"), tacticalSystem: "smallball", starters: [FIVE[3], FIVE[4], pick("duncati01", 2003), FIVE[0], FIVE[1]] });
  assert.equal(small.conflicts.find((x) => x.code === "bigs_in_small")?.simBacked ?? true, true);
});

test("starter coach: granted once, stable, never touches an account that has a coach", () => {
  const saves = [];
  const a = { id: "acct-1", coachIds: [], coachId: null };
  const first = ensureStarterCoach(a, (x) => saves.push(x.coachId));
  assert.ok(first.granted && isStarterCoach(coach(first.granted)));
  assert.deepEqual(a.coachIds, [first.granted]);
  assert.equal(ensureStarterCoach(a, () => saves.push("again")).granted, null);
  assert.equal(saves.length, 1);
  const b = { id: "acct-1", coachIds: [], coachId: null };
  assert.equal(ensureStarterCoach(b).granted, first.granted, "same account id -> same coach (no reroll)");
  const owner = { id: "x", coachIds: ["kerr-2016-gsw"], coachId: "kerr-2016-gsw" };
  assert.equal(ensureStarterCoach(owner).granted, null);
  assert.equal(owner.coachId, "kerr-2016-gsw");
});

test("every role template is a legal five-job plan", () => {
  for (const id of Object.keys(TACTICS)) {
    const r = assignRoles(FIVE, id);
    assert.equal(Object.keys(r).length, 5, id);
  }
});
