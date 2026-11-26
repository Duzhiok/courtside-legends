/**
 * Player Agency PA3 slice 1: a teammate offers a screen. Pure rules are pinned per rule; execution, evidence and the
 * relationship settle read the REAL engine. Game results are never asserted (policy): only that GameSim really ran the
 * named play, that levers come back, that dice stay separate, and that the ledger is settled once and bounded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import * as T from "../js/reborn/teamplay.js";
import { buildDecisionContext, decisionQuality, teamCoach } from "../js/reborn/agency.js";
import { opportunityOf } from "../js/reborn/participation.js";
import { buildSeason, driveGame, playGame } from "../js/reborn/season.js";
import { createRebornState } from "../js/reborn/identity.js";
import { relationshipsOf, RELATIONSHIP_KINDS } from "../js/career/careerRelationships.js";
import { agencyDialogHtml, describeTeamplayFeedback } from "../js/ui/reborn/agencyView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function liveSim(seed = 101, { clock = 600 } = {}) {
  const sim = new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true, clock });
  return sim;
}
const mine = (sim) => sim.home.onCourt[0];

/** Step to a possession of ours with time on the clock. */
function toOurPossession(sim) {
  for (let i = 0; i < 40 && !(sim.possession === "home" && sim.clock > 30); i++) sim.step();
  return sim;
}

test("1. acceptance: the owner's sketch (autonomy 30, chemistry 50, opportunity 70, role 40) is 56.5%, and it is never 0% or 100%", () => {
  assert.equal(T.acceptanceChance({ autonomy: 30, chemistry: 50, opportunity: 70, roleInfluence: 40 }), 0.565);
  assert.equal(T.acceptanceChance({ autonomy: 0, chemistry: 0, opportunity: 0, roleInfluence: 0, iq: 0 }), 0.05, "floor");
  assert.equal(T.acceptanceChance({ autonomy: 100, chemistry: 100, opportunity: 100, roleInfluence: 100, iq: 100 }), 0.95, "ceiling");
  const low = T.acceptanceChance({ autonomy: 0 });
  const high = T.acceptanceChance({ autonomy: 100 });
  assert.ok(high > low, "more autonomy, more yes");
  assert.ok(T.acceptanceChance({ chemistry: 90 }) > T.acceptanceChance({ chemistry: 10 }), "better chemistry, more yes");
});

test("2. the offer is the engine's own planner pick on a real floor; he only quotes a foul count the engine really holds", () => {
  const sim = toOurPossession(liveSim());
  const me = mine(sim);
  const offer = T.screenOffer(sim, me.id);
  assert.ok(offer, "a teammate can set a screen");
  const mate = sim.home.onCourt.find((p) => p.id === offer.teammateId);
  assert.ok(mate && mate.id !== me.id, "an on-court teammate, never you");
  assert.deepEqual([offer.afterScreen, offer.alt].sort(), ["pop", "roll"], "the two ways to use him are the two the engine runs");
  // The foul line is real or absent.
  const bigs = sim.away.onCourt.filter((p) => ["C", "PF"].includes(p.pos));
  for (const b of sim.away.onCourt) b.stats = { ...(b.stats || {}), pf: 0 };
  assert.equal(T.screenOffer(sim, me.id).fact, null, "no fouls, no foul line");
  if (bigs.length) {
    bigs[0].stats.pf = 4;
    assert.equal(T.screenOffer(sim, me.id).fact?.pf, 4);
    assert.equal(T.screenOffer(sim, me.id).fact?.name, bigs[0].name);
    bigs[0].stats.pf = 2;
    assert.equal(T.screenOffer(sim, me.id).fact, null, "two fouls is not worth a comment");
  }
  assert.equal(T.screenOffer({ ...sim, clock: 5, youSide: sim.youSide, home: sim.home, away: sim.away }, me.id), null, "no time to run it");
  assert.equal(T.screenOffer(sim, "nobody"), null);
});

test("3. GameSim really runs it: the named screener is credited for the screen far more than on the autopilot, and the two ways differ", () => {
  const run = (afterScreen) => {
    let ours = 0;
    let credited = 0;
    const lines = [];
    for (let seed = 1; seed <= 6; seed++) {
      const sim = liveSim(seed * 101);
      const me = mine(sim);
      for (let n = 0; sim.running && n < 40;) {
        if (sim.possession === "home" && sim.clock > 30 && sim.home.onCourt.includes(me)) {
          const offer = T.screenOffer(sim, me.id);
          const screener = sim.home.onCourt.find((p) => p.id === offer?.teammateId);
          if (screener) screener.gradeLast = null;
          if (afterScreen && offer) lines.push(T.playScreenPossession(sim, { playerId: me.id, screenerId: offer.teammateId, afterScreen: afterScreen === "planner" ? offer.afterScreen : afterScreen, finish: offer.finish }).points);
          else sim.step();
          if (screener?.gradeLast === "挡拆掩护") credited++;
          ours++;
          n++;
        } else sim.step();
      }
    }
    return { rate: credited / ours, lines };
  };
  const control = run(null);
  const pop = run("pop");
  const roll = run("roll");
  assert.ok(pop.rate > control.rate * 3 && roll.rate > control.rate * 3, `the play ran: ${control.rate.toFixed(3)} on the autopilot vs ${pop.rate.toFixed(3)} / ${roll.rate.toFixed(3)} when asked for`);
  assert.notDeepEqual(pop.lines, roll.lines, "pop and roll are different plays, not the same possession twice");
});

test("4. every lever comes back exactly as it was, and the one-possession request cannot leak into the next", () => {
  const sim = toOurPossession(liveSim(7));
  const me = mine(sim);
  const offer = T.screenOffer(sim, me.id);
  const before = { auto: sim.autoOffense, focus: sim.focusPlay, focusId: sim.offenseFocusId, orders: JSON.stringify(me.orders), gameplan: sim.home.gameplan, plan: JSON.stringify(sim.home.gameplan) };
  T.playScreenPossession(sim, { playerId: me.id, screenerId: offer.teammateId, afterScreen: offer.afterScreen, finish: offer.finish });
  assert.equal(sim.autoOffense, before.auto);
  assert.equal(sim.focusPlay, before.focus);
  assert.equal(sim.offenseFocusId, before.focusId);
  assert.equal(JSON.stringify(me.orders), before.orders, "his own orders are back (the screen set 'pnr' on him for one possession)");
  assert.equal(sim.home.gameplan, before.gameplan, "the very same gameplan object");
  assert.equal(JSON.stringify(sim.home.gameplan), before.plan, "no PnR plan left in it");
  assert.equal(sim.requestedBallHandlerId, null);
  // The engine consumes a request on the possession it was made for, even when it is not one of ours.
  const other = liveSim(9);
  other.requestedBallHandlerId = mine(other).id;
  while (other.possession !== "home") other.step();
  other.step();
  assert.equal(other.requestedBallHandlerId, null, "consumed by the next home possession");
});

test("4b. the engine honours 'the ball is mine': the same request, with and without it, runs the named screen clearly more often", () => {
  const eras = [["CHI", 1996, "SEA", 1996], ["LAL", 2001, "SAS", 2001], ["BOS", 1986, "HOU", 1986]];
  const rate = (requestBall) => {
    let ours = 0;
    let credited = 0;
    for (const [h, hy, a, ay] of eras) {
      for (let seed = 1; seed <= 8; seed++) {
        const sim = new GameSim({ home: realTeam(h, hy), away: realTeam(a, ay), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed * 77), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
        Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true });
        const me = sim.home.onCourt[1]; // not the star: the weighted draw does not already favour him
        for (let n = 0; sim.running && n < 40;) {
          if (sim.possession === "home" && sim.clock > 30 && sim.home.onCourt.includes(me)) {
            const offer = T.screenOffer(sim, me.id);
            const screener = sim.home.onCourt.find((p) => p.id === offer?.teammateId);
            if (screener) screener.gradeLast = null;
            if (offer) {
              sim.autoOffense = false;
              sim.home.gameplan = { ...(sim.home.gameplan || {}), pnr: { screenerId: offer.teammateId, afterScreen: offer.afterScreen, offBall: {} } };
              sim.setOffenseFocus(me.id, { action: "pnr" });
              if (requestBall) sim.requestedBallHandlerId = me.id;
              sim.step();
              sim.requestedBallHandlerId = null;
              sim.autoOffense = true;
            } else sim.step();
            if (screener?.gradeLast === "挡拆掩护") credited++;
            ours++;
            n++;
          } else sim.step();
        }
      }
    }
    return credited / ours;
  };
  const withBall = rate(true);
  const without = rate(false);
  assert.ok(withBall > without + 0.05, `asked-for screens run ${withBall.toFixed(3)} with the ball fixed vs ${without.toFixed(3)} when the draw decides`);
});

test("5. the acceptance roll has its own dice: same decision, same answer, and GameSim's results are untouched by it", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `g${i}|r${i % 5}`);
  const first = ids.map((decisionId) => T.respondToRequest({ decisionId, chance: 0.5 }).accepted);
  assert.deepEqual(ids.map((decisionId) => T.respondToRequest({ decisionId, chance: 0.5 }).accepted), first, "the same decision always gets the same answer");
  assert.ok(first.includes(true) && first.includes(false), "and different decisions are different rolls");
  assert.equal(T.respondToRequest({ decisionId: "x", chance: 0.999 }).accepted, true);
  assert.equal(T.respondToRequest({ decisionId: "x", chance: 0 }).accepted, false);
  const run = (rolls) => {
    const sim = liveSim(33);
    for (let i = 0; i < 60; i++) {
      if (rolls) T.respondToRequest({ decisionId: `d${i}`, chance: 0.5 });
      sim.step();
    }
    return JSON.stringify([sim.score, sim.home.onCourt.map((p) => p.stats?.pts || 0)]);
  };
  assert.equal(run(true), run(false));
});

test("6. the new options are graded but never move the baseline of the old ones (PA1/PA2 untouched)", () => {
  const sim = toOurPossession(liveSim(5));
  const me = mine(sim);
  const ctx = buildDecisionContext(sim, me.id, { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "g|1" });
  assert.ok(ctx.offer && ctx.options.includes("screen") && ctx.options.includes("screenAlt"));
  assert.ok(Number.isFinite(ctx.values.screen) && Number.isFinite(ctx.values.screenAlt));
  const { screen, screenAlt, ...base } = ctx.values;
  for (const id of Object.keys(base)) assert.equal(decisionQuality(ctx.values, id), decisionQuality(base, id), `${id} is graded against the same baseline`);
  assert.equal(opportunityOf(ctx.values), opportunityOf(base), "PA2's pacing sees no difference");
  assert.ok(Number.isFinite(decisionQuality(ctx.values, "screen")) && Number.isFinite(decisionQuality(ctx.values, "screenAlt")));
  assert.ok(screen !== undefined && screenAlt !== undefined);
});

test("7. the settle table: what the real possession did decides, a miss after a good screen is not punished", () => {
  const offer = { teammateId: "t1", personId: "t1", name: "甲", nameEn: "A", pos: "C", afterScreen: "roll", alt: "pop" };
  const s = (o) => T.settleScreen({ decisionId: "g|r1", offer, ...o });
  assert.equal(s({ points: 2 }).delta, 0.5);
  assert.equal(s({ points: 3, critical: true }).delta, 1.0, "high leverage");
  assert.equal(s({ points: 0 }).delta, 0);
  assert.equal(s({ points: 0, turnover: true }).delta, -0.5);
  assert.equal(s({ points: 2 }).id, "g|r1|screen|t1", "a stable evidence id");
  assert.equal(s({ points: 2, proposed: true }).afterScreen, "pop", "what he was actually asked to do");
});

test("8. the run's ledger: at most ±3 per teammate per game, once per game, bounded 0..100, zero changes nothing", () => {
  const item = (delta, personId = "t1") => ({ id: `i${Math.random()}`, personId, name: "甲", nameEn: "A", pos: "C", delta });
  let run = { teamplay: { mates: {} } };
  const first = T.recordTeammateEvidence(run, "game-1", Array.from({ length: 10 }, () => item(1)));
  assert.equal(first.teamplay.mates.t1.strength, 53, "ten +1s are capped at +3 in one game");
  assert.equal(first.moved[0].delta, 3);
  run = { teamplay: first.teamplay };
  const again = T.recordTeammateEvidence(run, "game-1", [item(1)]);
  assert.deepEqual(again.teamplay, run.teamplay, "the same game never settles twice");
  assert.equal(again.moved.length, 0);
  const next = T.recordTeammateEvidence(run, "game-2", [item(-0.5), item(-0.5), item(0)]);
  assert.equal(next.teamplay.mates.t1.strength, 52);
  assert.equal(T.teammateStrength({ teamplay: next.teamplay }, "t1"), 52);
  assert.equal(T.teammateStrength({}, "nobody"), T.REL_START);
  assert.equal(T.recordTeammateEvidence({}, "g", [item(0)]).moved.length, 0, "a zero is not evidence");
  const lows = T.recordTeammateEvidence({ teamplay: { mates: { t1: { name: "甲", strength: 1, lastGame: "x" } } } }, "g", [item(-3)]);
  assert.equal(lows.teamplay.mates.t1.strength, 0, "never below 0");
});

test("9. the account's relationship ledger gets one idempotent integer copy of the run (kind 'teammate'), nothing else touched", () => {
  assert.ok(RELATIONSHIP_KINDS.includes("teammate"));
  const reborn = { seed: "s1", identity: {}, teamplay: { mates: { duncan: { name: "邓肯", nameEn: "Duncan", pos: "C", strength: 51.5, lastGame: "g1" } } } };
  const account = { id: "acc", name: "T" };
  T.mirrorTeammatesToAccount(account, reborn);
  const snapshot = JSON.stringify(account);
  T.mirrorTeammatesToAccount(account, reborn);
  T.mirrorTeammatesToAccount(account, reborn);
  assert.equal(JSON.stringify(account), snapshot, "calling it again changes nothing");
  const rels = relationshipsOf(account).filter((r) => r.kind === "teammate");
  assert.equal(rels.length, 1);
  assert.ok(Number.isInteger(rels[0].strength) && rels[0].strength === 52, "the ledger's own integer scale");
  reborn.teamplay.mates.duncan = { ...reborn.teamplay.mates.duncan, strength: 53, lastGame: "g2" };
  T.mirrorTeammatesToAccount(account, reborn);
  assert.equal(relationshipsOf(account).filter((r) => r.kind === "teammate")[0].strength, 53, "a later game moves the same record");
  assert.equal(relationshipsOf(account).filter((r) => r.kind === "teammate").length, 1);
});

test("10. in a real Reborn game a screen is played, graded once, settled into the run once, and replaying the settle changes nothing", async () => {
  const hook = ({ context }) => (context ? { choiceId: context.options.includes("screen") ? "screen" : "pass" } : null);
  let reborn = createRebornState("pa3-e2e-1", ROWS);
  const season = buildSeason(reborn, ROWS);
  let found = null;
  for (let i = 0; i < 10 && !found; i++) {
    const index = season.index; // playGame advances the season in place
    const out = await playGame(reborn, season, ROWS, { onTakeover: hook, participation: { getMode: () => "full" } });
    if (out.report.teamplay?.items?.length) found = { before: reborn, index, out };
    reborn = out.reborn;
  }
  assert.ok(found, "a screen came up within 10 games on full participation");
  const { report } = found.out;
  const executed = report.teamplay.items.filter((i) => !i.rejected);
  assert.ok(executed.length > 0 && executed.every((i) => [-0.5, 0, 0.5, 1].includes(i.delta)), "deltas come from the table");
  assert.ok(report.teamplay.moved.every((m) => Math.abs(m.delta) <= T.MAX_REL_PER_GAME));
  assert.ok(Object.keys(found.out.reborn.teamplay.mates).length >= (executed.some((i) => i.delta) ? 1 : 0));
  const replay = T.recordTeammateEvidence(found.out.reborn, report.gameId, executed);
  assert.deepEqual(replay.teamplay, found.out.reborn.teamplay, "the same game's evidence never counts twice");
  // The pure replay: same run, same seed -> same report.
  season.index = found.index;
  const again = await playGame(found.before, season, ROWS, { onTakeover: hook, participation: { getMode: () => "full" } });
  assert.deepEqual(again.report.teamplay, report.teamplay, "deterministic");
});

test("11. asking for the other way: a 'no' costs nothing and stops nothing; a 'yes' is played and settled", async () => {
  const sim = (extra) => Object.assign(liveSim(41, { clock: 110 }), { quarter: 4, possession: "home", ...extra });
  const star = (s) => [...s.home.onCourt].sort((a, b) => b.scoring - a.scoring)[0];
  const outcomes = { yes: null, no: null };
  for (let k = 0; k < 200 && !(outcomes.yes && outcomes.no); k++) {
    const s = sim();
    s.score.home = 96;
    s.score.away = 98;
    s.autoOffense = true;
    const me = star(s);
    const out = await driveGame(s, me.id, { onTakeover: ({ context }) => ({ choiceId: context.options.includes("screenAlt") ? "screenAlt" : "pass" }), agency: { coach: teamCoach("CHI", 1996), iq: 60, decisionId: `ask${k}`, autonomy: 0, role: "bench", mateStrength: {} } });
    const t = out.takeover;
    if (t?.kind !== "screen") continue;
    (t.teammate.accepted ? (outcomes.yes ||= { s, t }) : (outcomes.no ||= { s, t }));
  }
  assert.ok(outcomes.no, "a low-autonomy request is sometimes refused");
  assert.ok(outcomes.yes, "and sometimes granted");
  assert.equal(outcomes.no.t.accepted, false, "a refusal is not a played decision");
  assert.equal(outcomes.no.t.points, 0);
  assert.equal(outcomes.no.t.turnover, undefined, "nothing was run");
  assert.ok(!outcomes.no.s.running || outcomes.no.s.clock < 110, "the game carried on");
  assert.equal(outcomes.yes.t.accepted, true);
  assert.ok(Number.isFinite(outcomes.yes.t.points));
});

test("12. the dialog: the teammate speaks with a real line, both ways are offered honestly, and a refusal is reported without a penalty", () => {
  const sim = toOurPossession(liveSim(5));
  const ctx = buildDecisionContext(sim, mine(sim).id, { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "g|1" });
  const zh = agencyDialogHtml({ sim, context: ctx, lang: "zh" });
  assert.match(zh, /data-testid="teammate-offer"/);
  assert.match(zh, /data-option="screen"/);
  assert.match(zh, /data-option="screenAlt"/);
  assert.match(zh, /他可能不答应/, "the request is honest about being a request");
  assert.match(agencyDialogHtml({ sim, context: ctx, lang: "en" }), /he may say no/);
  const evil = { ...ctx, offer: { ...ctx.offer, name: "<img src=x onerror=alert(1)>", nameEn: "<img src=x onerror=alert(1)>", fact: { name: "<b>x</b>", nameEn: "<b>x</b>", pf: 4 } } };
  assert.ok(!agencyDialogHtml({ sim, context: evil }).includes("<img src=x"), "names are escaped");
  assert.ok(!agencyDialogHtml({ sim, context: evil }).includes("<b>x</b>"));
  const lines = describeTeamplayFeedback({ items: [{ rejected: true, name: "甲", nameEn: "A" }, { reason: "screenScored", points: 2, name: "乙", nameEn: "B", delta: 0.5 }], moved: [{ name: "乙", nameEn: "B", delta: 0.5 }] }, "zh");
  assert.match(lines[0], /甲 没有接你的要求/);
  assert.match(lines[1], /乙 的挡拆打成了（2 分）/);
  assert.match(lines[2], /默契 \+0\.5/);
  assert.deepEqual(describeTeamplayFeedback(null), []);
});
