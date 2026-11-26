/**
 * Player Agency PA3 slice 3a: the defensive gamble. Directions are pinned, magnitudes are not (starting numbers); execution
 * and asking rules read the REAL engine. Game results are never asserted (policy).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import * as D from "../js/reborn/defense.js";
import { gradeTakeover, teamCoach } from "../js/reborn/agency.js";
import { MODE_PACING } from "../js/reborn/participation.js";
import { buildSeason, driveGame, playGame } from "../js/reborn/season.js";
import { createRebornState } from "../js/reborn/identity.js";
import { agencyDialogHtml, describeAgencyFeedback, describeDefenseFeedback } from "../js/ui/reborn/agencyView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function liveSim(seed = 101, extra = {}) {
  const sim = new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  return Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true, clock: 600, ...extra });
}
const toTheirBall = (sim) => {
  for (let i = 0; i < 40 && !(sim.possession === "away" && sim.clock > 30); i++) sim.step();
  return sim;
};
const facts = (o = {}) => ({ fouls: 0, fatigue: 0, stealRating: 50, margin: 0, late: false, state: "even", ...o });
const val = (o) => D.defenseValues(facts(o)).gamble;

test("1. the value: stay is the baseline; an average player at an even score gains nothing by gambling", () => {
  const v = D.defenseValues(facts());
  assert.equal(v.stay, 0);
  assert.equal(v.gamble, 0);
  assert.equal(D.defenseValues(null), null);
});

test("2. the value follows basketball sense: thief up, foul trouble down, tired down, chasing up, protecting down", () => {
  assert.ok(val({ stealRating: 85 }) > val({ stealRating: 50 }) && val({ stealRating: 50 }) > val({ stealRating: 30 }), "a better thief gains more");
  assert.ok(val({ fouls: 2 }) > val({ fouls: 3 }) && val({ fouls: 3 }) > val({ fouls: 4 }) && val({ fouls: 4 }) > val({ fouls: 5 }), "every foul beyond two costs more");
  assert.ok(val({ fatigue: 80 }) < val({ fatigue: 20 }), "a tired man should not gamble");
  assert.ok(val({ state: "chasing" }) > val({ state: "even" }) && val({ state: "even" }) > val({ state: "protecting" }));
  assert.ok(val({ stealRating: 90, state: "chasing" }) > 0.075, "a strong thief trailing late is a clearly good gamble");
  assert.ok(val({ fouls: 5 }) < -0.075, "a man on his fifth foul gambling is a clearly poor one");
});

test("3. the facts are real fields: fouls, stamina, steal rating, score and the late/trailing state", () => {
  const sim = toTheirBall(liveSim());
  const me = sim.home.onCourt[1];
  me.stats = { ...(me.stats || {}), pf: 4 };
  me.fatigue = 75;
  me.steal = 82;
  const f = D.defenseFacts(sim, me.id);
  assert.equal(f.fouls, 4);
  assert.equal(f.fatigue, 75);
  assert.equal(f.stealRating, 82);
  assert.equal(f.margin, sim.score.home - sim.score.away);
  Object.assign(sim, { quarter: 4, clock: 120 });
  sim.score.home = 90;
  sim.score.away = 95;
  assert.equal(D.defenseFacts(sim, me.id).state, "chasing");
  sim.score.home = 105;
  sim.score.away = 90;
  assert.equal(D.defenseFacts(sim, me.id).state, "protecting");
  sim.clock = 5;
  assert.equal(D.defenseFacts(sim, me.id), null, "no time");
  assert.equal(D.defenseFacts(sim, "nobody"), null);
});

test("4. GameSim honours the gamble: far more steals and more fouls than staying home, and his orders come back untouched", () => {
  const eras = [["CHI", 1996, "SEA", 1996], ["LAL", 2001, "SAS", 2001], ["BOS", 1986, "HOU", 1986]];
  const rates = (gamble) => {
    let n = 0;
    let steals = 0;
    let fouls = 0;
    for (const [h, hy, a, ay] of eras) {
      for (let seed = 1; seed <= 10; seed++) {
        for (const slot of [1, 3]) {
          const sim = new GameSim({ home: realTeam(h, hy), away: realTeam(a, ay), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed * 61 + slot), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
          Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true });
          const me = sim.home.onCourt[slot];
          for (let k = 0; sim.running && k < 30;) {
            if (sim.possession === "away" && sim.clock > 30 && sim.home.onCourt.includes(me)) {
              const ordersBefore = JSON.stringify(me.orders);
              const stl = me.stats?.stl || 0;
              const pf = me.stats?.pf || 0;
              if (gamble) {
                D.playGamblePossession(sim, { playerId: me.id });
                assert.equal(JSON.stringify(me.orders), ordersBefore, "orders restored");
              } else sim.step();
              steals += (me.stats?.stl || 0) - stl;
              fouls += (me.stats?.pf || 0) - pf;
              n++;
              k++;
            } else sim.step();
          }
        }
      }
    }
    return { steals: steals / n, fouls: fouls / n };
  };
  const stay = rates(false);
  const gamble = rates(true);
  assert.ok(gamble.steals > stay.steals * 1.8, `steals ${stay.steals.toFixed(3)} -> ${gamble.steals.toFixed(3)}`);
  assert.ok(gamble.fouls > stay.fouls * 1.15, `fouls ${stay.fouls.toFixed(3)} -> ${gamble.fouls.toFixed(3)}`);
});

test("5. execution: a steal is the point, a foul is the price, a fifth foul is a lot", () => {
  const run = (o) => ({ steal: false, foul: false, fouls: 1, forcedTurnover: false, ...o });
  assert.equal(D.defenseExecution(run({ steal: true })), 1);
  assert.ok(D.defenseExecution(run({ steal: true, foul: true })) < 1 && D.defenseExecution(run({ steal: true, foul: true })) > 0, "a steal that cost a foul is half a win");
  assert.ok(D.defenseExecution(run({ foul: true })) < 0);
  assert.ok(D.defenseExecution(run({ foul: true, fouls: 5 })) < D.defenseExecution(run({ foul: true, fouls: 2 })));
  assert.ok(D.defenseExecution(run({ forcedTurnover: true })) > 0);
  assert.equal(D.defenseExecution(run({})), 0, "nothing happened");
});

test("6. grading: staying home is never graded; a bad gamble is POOR (not neutral); a good read that steals earns trust", () => {
  const sim = toTheirBall(liveSim());
  const me = sim.home.onCourt[1];
  const ctxWith = (patch) => {
    Object.assign(me, patch.me || {});
    me.stats = { ...(me.stats || {}), ...(patch.stats || {}) };
    Object.assign(sim, patch.sim || {});
    return D.buildDefenseContext(sim, me.id, { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "g|d1", autonomy: 20 });
  };
  const stay = ctxWith({});
  assert.equal(gradeTakeover({ context: stay, choiceId: "stay", accepted: true }), null, "the normal thing is not a decision");
  const bad = ctxWith({ stats: { pf: 5 }, me: { steal: 40 } });
  assert.ok(bad.values.gamble < -0.075);
  const badFoul = gradeTakeover({ context: bad, choiceId: "gamble", accepted: true, execution: D.defenseExecution({ steal: false, foul: true, fouls: 6, forcedTurnover: false }) });
  assert.equal(badFoul.side, "defense");
  assert.ok(badFoul.quality < -0.3, `poor, not neutral: ${badFoul.quality}`);
  assert.ok(badFoul.trustDelta < 0 && badFoul.autonomyDelta <= 0, "a reckless gamble that costs a foul is held against him");
  ctxWith({ stats: { pf: 0 }, me: { steal: 90 }, sim: { quarter: 4, clock: 120 } }); // sets the floor up; the context is rebuilt below with the score
  sim.score.home = 90;
  sim.score.away = 95;
  const goodCtx = D.buildDefenseContext(sim, me.id, { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "g|d2", autonomy: 20 });
  assert.ok(goodCtx.values.gamble > 0.075);
  const won = gradeTakeover({ context: goodCtx, choiceId: "gamble", accepted: true, execution: 1 });
  assert.ok(won.quality > 0.3 && won.trustDelta > 0, `${won.verdict}: trust ${won.trustDelta}`);
});

test("7. asking: only a REAL choice is asked (|gamble| >= the stakes), key mode never asks the defense, and the mode's cap still holds", async () => {
  const agency = { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "def-ask", autonomy: 0, trust: 40, role: "rotation", mateStrength: {} };
  const play = async (mode, seed) => {
    const sim = liveSim(seed, { clock: 720 });
    const seen = [];
    const out = await driveGame(sim, sim.home.onCourt[1].id, {
      onTakeover: ({ context }) => { if (context?.side === "defense") seen.push(context); return { choiceId: context?.options?.includes("gamble") ? "stay" : "pass" }; },
      agency,
      participation: { getMode: () => mode },
    });
    return { seen, out };
  };
  const full = await play("full", 5);
  assert.ok(full.seen.length > 0, "full control asks the defense sometimes");
  assert.ok(full.seen.every((c) => Math.abs(c.values.gamble) >= D.MIN_DEFENSE_STAKES), "never a question with nothing at stake");
  assert.ok(full.seen.every((c) => c.options.join() === "gamble,stay" && c.values.stay === 0 && c.baseline === 0));
  assert.ok(full.out.extras.length <= MODE_PACING.full.max);
  // No nagging: measured before the cooldown, a man in foul trouble was asked at every opposing possession (up to 26 a game).
  const spread = [];
  for (const seed of [3, 5, 8, 13, 21]) spread.push((await play("full", seed)).seen.length);
  assert.ok(Math.max(...spread) <= 10, `defensive questions per Full-control game: ${spread.join(",")}`);
  assert.equal((await play("key", 5)).seen.length, 0, "key possessions never stops the defense for a style choice");
  assert.equal((await play("auto", 5)).seen.length, 0);
  const high = await play("high", 5);
  assert.ok(high.out.extras.length <= MODE_PACING.high.max);
});

test("8. in a real Reborn game a gamble is asked, run and reported; the same game replays identically", async () => {
  const hook = ({ context }) => (context ? { choiceId: context.options.includes("gamble") ? "gamble" : "pass" } : null);
  let reborn = createRebornState("pa3-def-1", ROWS);
  const season = buildSeason(reborn, ROWS);
  let found = null;
  for (let i = 0; i < 12 && !found; i++) {
    const index = season.index;
    const out = await playGame(reborn, season, ROWS, { onTakeover: hook, participation: { getMode: () => "full" } });
    if (out.report.defense?.length) found = { before: reborn, index, out };
    reborn = out.reborn;
  }
  assert.ok(found, "a gamble came up within 12 games on full control");
  for (const d of found.out.report.defense) assert.ok(typeof d.steal === "boolean" && typeof d.foul === "boolean");
  assert.equal(found.out.report.agency.side === "defense" || found.out.report.agency.side === "offense", true);
  season.index = found.index;
  const again = await playGame(found.before, season, ROWS, { onTakeover: hook, participation: { getMode: () => "full" } });
  assert.deepEqual(again.report.defense, found.out.report.defense, "deterministic");
});

test("9. the panel and the lines: real facts, an honest warning, a plain line for every outcome", () => {
  const sim = toTheirBall(liveSim());
  const me = sim.home.onCourt[1];
  me.stats = { ...(me.stats || {}), pf: 3 };
  me.steal = 80;
  const ctx = D.buildDefenseContext(sim, me.id, { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "g|d1" });
  const zh = agencyDialogHtml({ sim, context: ctx, lang: "zh", mode: "full" });
  assert.match(zh, /data-option="gamble"/);
  assert.match(zh, /data-option="stay"/);
  assert.match(zh, /你已犯规 3 次/);
  assert.match(zh, /抢断能力出色/);
  assert.match(zh, /不会让对手少得分/, "the warning says what a gamble is not");
  assert.ok(!/教练指令|Coach's call/.test(zh), "no coach card on a defensive question");
  assert.match(agencyDialogHtml({ sim, context: ctx, lang: "en" }), /does not stop the other team scoring/);
  const line = (d) => describeDefenseFeedback([{ steal: false, foul: false, fouls: 3, forcedTurnover: false, ...d }], "zh")[0];
  assert.match(line({ steal: true }), /断下了球/);
  assert.match(line({ steal: true, foul: true }), /也犯了一次规/);
  assert.match(line({ foul: true, fouls: 4 }), /累计 4 次/);
  assert.match(line({ forcedTurnover: true }), /逼出了对手的失误/);
  assert.match(line({}), /没有结果/);
  assert.deepEqual(describeDefenseFeedback(null), []);
  assert.match(describeAgencyFeedback({ side: "defense", verdict: "free_poor_missed", trustDelta: -1, autonomyBefore: 0, autonomyAfter: 0 }, "zh"), /不该赌的时候赌了/);
  assert.match(describeAgencyFeedback({ side: "offense", verdict: "free_poor_missed", trustDelta: -1, autonomyBefore: 0, autonomyAfter: 0 }, "zh"), /选了一个不好的机会/, "offense keeps its own words");
});
