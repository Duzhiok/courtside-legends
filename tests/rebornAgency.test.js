/**
 * Player Agency PA1. Pure grading pinned per acceptance scenario; evidence and the end-to-end takeover read the real
 * engine. Game RESULTS are never asserted (policy): only that the grade follows the evidence and the recorded outcome.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import * as A from "../js/reborn/agency.js";
import { updateTrust } from "../js/reborn/trust.js";
import { buildSeason, driveGame, playGame } from "../js/reborn/season.js";
import { createRebornState } from "../js/reborn/identity.js";
import { agencyDialogHtml, describeAgencyFeedback } from "../js/ui/reborn/agencyView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function clutchSim({ clock = 60, home = 96, away = 98 } = {}) {
  const sim = new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(7), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  Object.assign(sim, { quarter: 4, clock, possession: "home" });
  sim.score.home = home;
  sim.score.away = away;
  return sim;
}
const byName = (sim, frag) => sim.home.onCourt.find((p) => p.name.includes(frag) || (p.nameEn || "").includes(frag));
const grade = (o) => A.evaluateDecision({ tolerance: 0.25, ...o });

test("1. following a reasonable call: small trust gain, no autonomy; a poor call is not the player's fault", () => {
  const ok = grade({ hadInstruction: true, followed: true, quality: 0.5, execution: 1 });
  assert.equal(ok.verdict, "followed");
  assert.ok(ok.trustDelta > 0 && ok.trustDelta <= 2);
  assert.equal(ok.autonomyDelta, 0);
  const bad = grade({ hadInstruction: true, followed: true, quality: -0.8, execution: -0.4 });
  assert.equal(bad.verdict, "followed_poor_call");
  assert.ok(bad.trustDelta > 0, "following a bad call never costs trust");
});

test("2. improvising well against a weakness and scoring earns trust AND autonomy (capped)", () => {
  const g = grade({ hadInstruction: true, followed: false, quality: 0.9, execution: 1 });
  assert.equal(g.verdict, "deviate_good_scored");
  assert.equal(g.trustDelta, A.MAX_TRUST_PER_GAME);
  assert.equal(g.autonomyDelta, A.MAX_AUTONOMY_PER_GAME);
});

test("3. a good decision that misses is not a bad decision: no autonomy lost, at most a nick of trust", () => {
  const g = grade({ hadInstruction: true, followed: false, quality: 0.9, execution: -0.4 });
  assert.equal(g.verdict, "deviate_good_missed");
  assert.equal(g.autonomyDelta, 0);
  assert.ok(g.trustDelta > -2 && g.trustDelta <= 0);
  const reckless = grade({ hadInstruction: true, followed: false, quality: -0.9, execution: -0.4 });
  assert.ok(g.trustDelta > reckless.trustDelta + 2, "same miss, very different verdict");
});

test("4. a poor decision that happens to go in earns no autonomy and almost no trust", () => {
  const g = grade({ hadInstruction: true, followed: false, quality: -0.9, execution: 1 });
  assert.equal(g.verdict, "deviate_poor_scored");
  assert.equal(g.autonomyDelta, 0);
  assert.ok(Math.abs(g.trustDelta) <= 0.8);
  assert.ok(g.trustDelta < grade({ hadInstruction: true, followed: false, quality: 0.9, execution: 1 }).trustDelta - 3);
});

test("5. a poor independent decision that fails loses trust and autonomy; a free-minded coach forgives more", () => {
  const strict = grade({ hadInstruction: true, followed: false, quality: -0.9, execution: -1, tolerance: 0.18 });
  assert.equal(strict.verdict, "deviate_poor_missed");
  assert.ok(strict.trustDelta <= -3);
  assert.equal(strict.autonomyDelta, -A.MAX_AUTONOMY_PER_GAME);
  const open = grade({ hadInstruction: true, followed: false, quality: -0.9, execution: -1, tolerance: 0.92 });
  assert.ok(open.trustDelta > strict.trustDelta, "coach personality changes the consequence");
  // The trust ladder takes the graded delta instead of the old made/missed rule.
  const t = updateTrust(50, { gameScore: 7, role: "rotation", takeover: { attempted: true, made: false }, agency: strict });
  assert.deepEqual(t.parts.map((p) => p.kind), ["performance", "agency"]);
  assert.equal(t.parts[1].delta, Math.round(strict.trustDelta));
});

test("6. no coach on record = no instruction (never an invented one); a free choice is not insubordination", () => {
  const sim = clutchSim();
  const me = byName(sim, "Kerr") || sim.home.onCourt[0];
  assert.equal(A.coachInstruction(sim, null, me.id), null);
  const ctx = A.buildDecisionContext(sim, me.id, { coach: null, iq: 70, decisionId: "g|1" });
  assert.equal(ctx.coachInstruction, null);
  // No coach, so no "follow"; the three personal options are unchanged. A teammate who can set a real screen / be asked to find him adds the PA3 options before "pass".
  assert.deepEqual(ctx.options.filter((o) => !["screen", "screenAlt", "spot"].includes(o)), ["drive", "pullup", "pass"]);
  assert.ok(!ctx.options.includes("follow"));
  const free = grade({ hadInstruction: false, followed: false, quality: -0.9, execution: -1 });
  const defied = grade({ hadInstruction: true, followed: false, quality: -0.9, execution: -1 });
  assert.ok(free.trustDelta > defied.trustDelta && free.autonomyDelta > defied.autonomyDelta);
  assert.match(agencyDialogHtml({ sim, context: ctx }), /教练没有新的指令/);
});

test("evidence comes from the people on the floor before the action, never from the result", () => {
  const sim = clutchSim();
  const phil = A.coachOf("CHI", 1996);
  assert.equal(phil?.nameEn, "Phil Jackson");
  const byThree = [...sim.home.onCourt].sort((a, b) => b.three - a.three);
  assert.ok(byThree[0].three > byThree.at(-1).three);
  assert.ok(A.optionValues(sim, byThree[0].id, null).pullup > A.optionValues(sim, byThree.at(-1).id, null).pullup, "the best shooter's pull-up is worth more");
  const me = (byName(sim, "Kerr") || byThree[0]).id;
  const ctx = A.buildDecisionContext(sim, me, { coach: phil, iq: 60, decisionId: "g|2" });
  assert.ok(ctx.coachInstruction && ctx.options[0] === "follow");
  assert.equal(A.buildDecisionContext(sim, me, { coach: phil, iq: 60, decisionId: "g|2" }).observation.pick, ctx.observation.pick, "the read is seeded, not re-rolled");
  // Down 3 late: a two no longer ties, the coach hunts a three and the drive loses value.
  const late = clutchSim({ clock: 10, home: 95, away: 98 });
  assert.equal(A.coachInstruction(late, phil, me).action, "find_shooter");
  assert.ok(A.optionValues(late, me, null).drive < A.optionValues(sim, me, null).drive);
  // Same context, made vs missed: quality identical, only execution moves.
  const made = A.gradeTakeover({ context: ctx, choiceId: "pullup", accepted: true }, { attempted: true, made: true, points: 3 });
  const missed = A.gradeTakeover({ context: ctx, choiceId: "pullup", accepted: true }, { attempted: true, made: false, points: 0 });
  assert.equal(made.quality, missed.quality);
  assert.ok(made.execution > missed.execution);
});

test("every team has a coach: the real one on record, else a fixed archetype; he calls a play only when it makes sense", () => {
  assert.equal(A.teamCoach("CHI", 1996).nameEn, "Phil Jackson");
  const gen = A.teamCoach("DAL", 1997);
  assert.ok(gen.archetype && gen.id === "archetype:DAL:1997");
  assert.deepEqual(A.teamCoach("DAL", 1997), gen, "same team + season, same coach");
  const kinds = new Set(["ATL", "BOS", "DAL", "DEN", "HOU", "MIA", "NYK", "SAC", "UTA", "PHX"].map((t) => A.teamCoach(t, 2003).archetype));
  assert.ok(kinds.size >= 3, "the league is not one coach");
  const phil = A.teamCoach("CHI", 1996);
  assert.equal(A.coachCallsPlay(clutchSim({ home: 100, away: 97 }), phil), false, "ahead: no timeout, you play");
  const ahead = clutchSim({ home: 100, away: 97 });
  assert.equal(A.buildDecisionContext(ahead, ahead.home.onCourt[0].id, { coach: phil, decisionId: "x" }).coachInstruction, null);
  const out = clutchSim();
  out.timeouts.home = 0;
  assert.equal(A.coachCallsPlay(out, phil), false, "no timeouts: no new call");
  assert.equal(A.coachCallsPlay(clutchSim(), phil), true);
  const stubborn = { ...A.COACH_ARCHETYPES.find((a) => a.archetype === "stubborn"), id: "s" };
  const late = clutchSim({ clock: 10, home: 95, away: 98 });
  const me = [...late.home.onCourt].sort((a, b) => a.scoring - b.scoring)[0].id;
  assert.equal(A.coachInstruction(late, stubborn, me)?.action, "star_iso", "a stubborn coach keeps his play down three");
  assert.equal(A.coachInstruction(late, phil, me)?.action, "find_shooter", "a flexible one hunts the tying three");
});

test("end to end: a real Reborn game asks with a context, plays the choice, grades it once and stores autonomy", async () => {
  const contexts = [];
  const hook = ({ context }) => {
    if (!context) return null;
    contexts.push(context);
    return { choiceId: context.options.includes("follow") ? "follow" : "pass" };
  };
  // Seed re-picked 2026-11-26 after the skill change: "agency-e2e-1" plays 14 games with no takeover window (0 asks) under the new skills.
  // Scanned agency-e2e-2..9: e2e-2 and e2e-4 get a window but without a coach instruction; e2e-3 gets one in game 11 with a coach instruction.
  let reborn = createRebornState("agency-e2e-3", ROWS);
  const season = buildSeason(reborn, ROWS);
  let report = null;
  for (let i = 0; i < 14 && !report?.agency; i++) {
    const out = await playGame(reborn, season, ROWS, { onTakeover: hook });
    reborn = out.reborn;
    report = out.report;
  }
  assert.ok(report?.agency, `a takeover window came up within 14 games (${contexts.length} asks)`);
  assert.ok(contexts.some((c) => c.coachInstruction), "the team's coach actually called a play at least once");
  const a = report.agency;
  assert.equal(a.decisionId, `${report.gameId}|takeover`);
  assert.ok(["follow", "pass"].includes(a.choiceId));
  assert.equal(a.followed, a.choiceId === "follow");
  assert.equal(reborn.player.autonomy, a.autonomyAfter);
  assert.ok(report.trustParts.some((p) => p.kind === "agency") && !report.trustParts.some((p) => p.kind === "takeover"));
  assert.match(describeAgencyFeedback(a, "zh"), /^教练点评：/);
  assert.match(describeAgencyFeedback(a, "en"), /^Coach: /);
});

test("running the coach's call borrows the autopilot for one possession only, and costs the timeout he called", async () => {
  const sim = clutchSim({ clock: 110, home: 96, away: 98 });
  sim.autoOffense = true;
  sim.timeouts.home = 1;
  let asked = null;
  let timeoutsAtCall = null;
  const star = [...sim.home.onCourt].sort((a, b) => b.scoring - a.scoring)[0];
  const out = await driveGame(sim, star.id, {
    onTakeover: ({ sim: live, context }) => { asked = context; timeoutsAtCall = live.timeouts.home; return { choiceId: "follow" }; },
    agency: { coach: A.teamCoach("CHI", 1996), iq: 60, decisionId: "drive|1" },
  });
  assert.ok(asked?.coachInstruction, "the window opened with a call");
  assert.equal(out.takeover.kind, "plan");
  assert.ok(Number.isFinite(out.takeover.points));
  assert.equal(sim.autoOffense, true, "autopilot back on");
  assert.equal(timeoutsAtCall, 1, "the timeout is still there while the player decides (B134 ①: only a made choice spends it)");
  assert.equal(sim.timeouts.home, 0, "running the call spent his last timeout");
});

test("dismissing the dialog costs no timeout: only a made choice spends one (B134 ①)", async () => {
  const sim = clutchSim({ clock: 110, home: 96, away: 98 });
  sim.timeouts.home = 1;
  let asked = 0;
  let firstInstruction = null;
  let timeoutsAtFirstAsk = null;
  const star = [...sim.home.onCourt].sort((a, b) => b.scoring - a.scoring)[0];
  const out = await driveGame(sim, star.id, {
    onTakeover: ({ sim: live, context }) => {
      asked += 1;
      if (timeoutsAtFirstAsk === null) { timeoutsAtFirstAsk = live.timeouts.home; firstInstruction = context?.coachInstruction; }
      return null; // Esc / backdrop / an unanswered L1 bubble: no choice
    },
    agency: { coach: A.teamCoach("CHI", 1996), iq: 60, decisionId: "dismiss|1" },
  });
  assert.ok(asked >= 1, "the dialog came up");
  assert.ok(firstInstruction, "the first ask carried a coach call (the charge path was live)");
  assert.equal(timeoutsAtFirstAsk, 1, "nothing is spent just for being asked");
  assert.equal(out.takeover, null, "no choice, no takeover");
  assert.equal(sim.timeouts.home, 1, "dismissals never spend the timeout");
});

test("a choice the context did not offer is refused, never graded", async () => {
  const sim = clutchSim({ home: 100, away: 97 });
  const star = [...sim.home.onCourt].sort((a, b) => b.scoring - a.scoring)[0];
  const out = await driveGame(sim, star.id, { onTakeover: () => ({ choiceId: "follow" }), agency: { coach: A.teamCoach("CHI", 1996), decisionId: "x" } });
  assert.ok(!out.takeover || out.takeover.choiceId !== "follow" || out.takeover.context.coachInstruction, "follow without a call never lands");
});

test("autonomy is earned: 'call your own play' unlocks at the trusted tier, and freedom softens the coach's reaction", async () => {
  const sim = clutchSim();
  const me = sim.home.onCourt[0].id;
  const phil = A.teamCoach("CHI", 1996);
  const low = A.buildDecisionContext(sim, me, { coach: phil, decisionId: "u|1", autonomy: A.AUDIBLE_AT - 1 });
  const high = A.buildDecisionContext(sim, me, { coach: phil, decisionId: "u|1", autonomy: A.AUDIBLE_AT });
  assert.ok(!low.options.includes("setup") && low.audible === null);
  assert.ok(high.options.includes("setup") && high.audible.targetId !== me && high.values.setup > 0);
  // The same deviation, missed, costs less trust once you have the coach's trust.
  // Pin the band, not just the sign: pullup/pass sit in the poor band here (quality
  // -0.40/-0.61), where both autonomies clamp at -MAX_TRUST_PER_GAME and the old
  // `>=` assertion passed with the softening removed (B142). drive is a good-band
  // deviation (quality 0.63, deviate_good_missed: -0.3 * (1 - tolerance) x leverage 2
  // x scale 2): autonomy 0 (tolerance 0.25) -> -0.90, autonomy 90 (tolerance 0.61)
  // -> -0.47, so a strict `>` isolates the softening.
  const g = (autonomy) => A.gradeTakeover({ context: { ...high, playerState: { autonomy } }, choiceId: "drive", accepted: true, points: 0 }, { attempted: true, made: false, points: 0 });
  assert.ok(g(90).trustDelta > g(0).trustDelta, "high autonomy softens the same missed deviation");
  assert.ok(Math.abs(g(0).trustDelta + 0.9) < 0.01 && Math.abs(g(90).trustDelta + 0.47) < 0.01, "softening magnitude pinned");
  // The neutral band pins the formula itself: trust = execution * 0.3 - 0.2 * (1 - tolerance);
  // missed at execution -0.4 -> tolerance 0.25 (autonomy 0) gives -1.08, tolerance 0.61
  // (autonomy 90 under Phil Jackson) gives -0.79.
  const neutral = (tolerance) => A.evaluateDecision({ hadInstruction: true, followed: false, quality: 0, execution: -0.4, tolerance });
  assert.ok(neutral(0.61).trustDelta > neutral(0.25).trustDelta, "higher tolerance softens a neutral missed deviation");
  assert.ok(Math.abs(neutral(0.25).trustDelta + 1.08) < 0.01 && Math.abs(neutral(0.61).trustDelta + 0.79) < 0.01, "neutral-band softening magnitude pinned");
  // Playing it: the teammate really gets the call for one possession and the autopilot comes back.
  sim.autoOffense = true;
  const star = [...sim.home.onCourt].sort((a, b) => b.scoring - a.scoring)[0];
  const out = await driveGame(sim, star.id, {
    onTakeover: ({ context }) => ({ choiceId: context.options.includes("setup") ? "setup" : "pass" }),
    agency: { coach: phil, iq: 60, decisionId: "u|2", autonomy: 60 },
  });
  assert.equal(out.takeover?.kind, "audible");
  assert.equal(sim.autoOffense, true);
  assert.ok(A.gradeTakeover(out.takeover, null).choiceId === "setup");
});

test("the coach's 'post' call goes to a natural big, not to a guard the lineup slotted at PF", () => {
  const sim = clutchSim();
  const guard = sim.home.onCourt.find((p) => !["C", "PF"].includes(p.pos));
  guard.playPos = "PF";
  guard.paint = 95;
  const coach = { archetype: "disciplinarian", playerAutonomy: 20, specialTactics: ["post_up"] };
  const me = sim.home.onCourt.find((p) => p !== guard).id;
  const call = A.coachInstruction(sim, coach, me);
  assert.notEqual(call?.action === "post_entry" ? call.targetId : null, guard.id);
});

test("old saves and legacy hooks are untouched: no autonomy field reads as the start, a legacy pick keeps the old rule", () => {
  assert.equal(A.autonomyTier(undefined).id, "executor");
  const t = updateTrust(50, { gameScore: 7, role: "rotation", takeover: { attempted: true, made: true } });
  assert.equal(t.parts.find((p) => p.kind === "takeover").delta, 4);
});
