/**
 * Player Agency PA3.1: "a teammate asks for the ball". Directions are pinned, magnitudes are not. The rule reads the REAL
 * engine ratings; the execution reads the REAL engine. Game results are never asserted (policy).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import * as A from "../js/reborn/agency.js";
import { TEAM_OPTIONS, recordTeammateEvidence, settleFeed, withoutTeamOptions } from "../js/reborn/teamplay.js";
import { CHOICE_IDS, buildSeason, playGame } from "../js/reborn/season.js";
import { DEFENSE_OPTIONS } from "../js/reborn/defense.js";
import { TAKEOVER_OPTIONS } from "../js/ui/reborn/takeover.js";
import { createRebornState } from "../js/reborn/identity.js";
import { agencyBubbleHtml, agencyDialogHtml, describeTeamplayFeedback } from "../js/ui/reborn/agencyView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const AGENCY = { coach: null, iq: 60, decisionId: "feed|1", autonomy: 0, trust: 60 };

function liveSim(seed = 101, home = ["LAL", 2001], away = ["SAS", 2001]) {
  const sim = new GameSim({ home: realTeam(...home), away: realTeam(...away), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true, clock: 600 });
  for (let i = 0; i < 40 && !(sim.possession === "home" && sim.clock > 30); i++) sim.step();
  return sim;
}
/** Everybody ordinary, their defenders ordinary: no one stands out. Then `lift(mate)` makes one teammate the standout. */
function flatFloor(sim) {
  for (const p of [...sim.home.onCourt, ...sim.away.onCourt]) Object.assign(p, { three: 50, paint: 50, speed: 50, strength: 50, defense: 60, block: 40 });
  return sim;
}
const bigAt = (sim) => sim.home.onCourt.find((p) => ["C", "PF"].includes(p.pos));
const guardAt = (sim) => sim.home.onCourt.find((p) => !["C", "PF"].includes(p.pos));
const standout = (sim, mate) => Object.assign(mate, { paint: 95, strength: 90 });

test("1. a teammate speaks only when he is the one man with a standout matchup (relative, not an absolute rating)", () => {
  const sim = flatFloor(liveSim());
  const me = guardAt(sim);
  assert.equal(A.buildDecisionContext(sim, me.id, AGENCY).feedOffer, null, "an ordinary floor: nobody asks");
  const mate = bigAt(sim);
  standout(sim, mate);
  const ctx = A.buildDecisionContext(sim, me.id, AGENCY);
  assert.equal(ctx.feedOffer?.teammateId, mate.id);
  assert.equal(ctx.feedOffer.focusId, "post_up");
  assert.ok(ctx.options.includes("feed"));
  // Everybody equally strong: all gaps are the same, so nobody is the standout, however high the numbers are.
  for (const p of sim.home.onCourt) Object.assign(p, { paint: 95, strength: 90, three: 95 });
  assert.equal(A.buildDecisionContext(sim, me.id, AGENCY).feedOffer, null);
  // He cannot ask himself for the ball.
  const star = flatFloor(liveSim());
  const big = standout(star, bigAt(star));
  assert.notEqual(A.buildDecisionContext(star, big.id, AGENCY).feedOffer?.teammateId, big.id);
});

test("1b. only a big asks: a wing with the same matchup says nothing, because the engine has no lever that sends HIM the ball", () => {
  const sim = flatFloor(liveSim());
  const me = bigAt(sim);
  const wing = sim.home.onCourt.find((p) => p !== me && !["C", "PF"].includes(p.pos));
  Object.assign(wing, { paint: 95, strength: 90, three: 95, speed: 95 });
  assert.equal(A.buildDecisionContext(sim, me.id, AGENCY).feedOffer, null);
});

test("2. he also has to be better placed than you: a standout matchup that is still a worse look than yours says nothing", () => {
  const sim = flatFloor(liveSim());
  const me = guardAt(sim);
  standout(sim, bigAt(sim));
  assert.ok(A.buildDecisionContext(sim, me.id, AGENCY).feedOffer);
  Object.assign(me, { three: 99, paint: 99, speed: 99, strength: 99 }); // you are the better look yourself
  assert.equal(A.buildDecisionContext(sim, me.id, AGENCY).feedOffer, null);
});

test("3. a teammate who always asks says nothing: real lineups hear him a minority of the time, from several different men", () => {
  let own = 0;
  let heard = 0;
  const speakers = new Set();
  for (const [home, away] of [[["CHI", 1996], ["SEA", 1996]], [["LAL", 2001], ["SAS", 2001]], [["BOS", 1986], ["HOU", 1986]]]) {
    for (let seed = 1; seed <= 3; seed++) {
      for (let slot = 0; slot < 5; slot++) {
        const sim = new GameSim({ home: realTeam(...home), away: realTeam(...away), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed * 53 + slot), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
        Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true });
        const me = sim.home.onCourt[slot];
        for (let k = 0; sim.running && k < 30;) {
          if (sim.possession === "home" && sim.clock > 30 && sim.home.onCourt.includes(me)) {
            const c = A.buildDecisionContext(sim, me.id, AGENCY);
            own++;
            k++;
            if (c.feedOffer) { heard++; speakers.add(c.feedOffer.teammateId); }
          }
          sim.step();
        }
      }
    }
  }
  assert.ok(heard > 0, "the rule does fire on real rosters");
  assert.ok(heard / own < 0.3, `a minority of possessions, not all of them (${heard}/${own})`);
  assert.ok(speakers.size >= 2, `it is not one man every time (${speakers.size} speakers)`);
});

test("4. it is a PA3 teammate option: the personal options and the PA1/PA2 baseline do not move", () => {
  assert.ok(TEAM_OPTIONS.includes("feed"));
  const sim2 = flatFloor(liveSim());
  standout(sim2, bigAt(sim2));
  const me = guardAt(sim2);
  const ctx = A.buildDecisionContext(sim2, me.id, AGENCY);
  assert.ok(ctx.values.feed != null);
  assert.ok(!("feed" in withoutTeamOptions(ctx.values)), "kept out of the old baseline");
  const plain = A.optionValues(sim2, me.id, null, null, null, null);
  for (const k of ["pullup", "drive", "pass"]) assert.equal(ctx.values[k], plain[k], `${k} unchanged`);
});

test("5. one man, one button: when your own call-up would hand the ball to the same man, only his voice is offered", () => {
  const sim = flatFloor(liveSim());
  const mate = standout(sim, bigAt(sim));
  const me = guardAt(sim);
  const free = A.buildDecisionContext(sim, me.id, { ...AGENCY, autonomy: 100 });
  assert.equal(free.audible, null);
  assert.ok(free.options.includes("feed") && !free.options.includes("setup"));
  // A teammate may speak at low autonomy too (a suggestion is not a command)
  assert.ok(A.buildDecisionContext(sim, me.id, { ...AGENCY, autonomy: 0 }).options.includes("feed"));
  // ... and the engine play is exactly the one the audible would have used
  assert.equal(free.feedOffer.targetId, mate.id);
  assert.ok(["post_up", "iso_star", "pace_three"].includes(free.feedOffer.focusId));
});

test("6. it really sends him the ball: on real rosters, the engine's own play raises his shot share (direction; not a promise to score)", () => {
  const share = (fed) => {
    let n = 0;
    let shots = 0;
    for (const [home, away] of [[["CHI", 1996], ["SEA", 1996]], [["LAL", 2001], ["SAS", 2001]], [["BOS", 1986], ["HOU", 1986]]]) {
      for (let seed = 1; seed <= 12; seed++) {
        for (let slot = 0; slot < 5; slot++) {
          const sim = new GameSim({ home: realTeam(...home), away: realTeam(...away), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed * 53 + slot), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
          Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true });
          const me = sim.home.onCourt[slot];
          for (let k = 0; sim.running && k < 40;) {
            if (sim.possession === "home" && sim.clock > 30 && sim.home.onCourt.includes(me)) {
              k++;
              const o = A.buildDecisionContext(sim, me.id, AGENCY).feedOffer;
              if (o) {
                const mate = sim.home.onCourt.find((p) => p.id === o.targetId);
                const before = mate.stats?.fga || 0;
                if (fed) { sim.autoOffense = false; sim.setFocusPlay(o.focusId); sim.setOffenseFocus(o.targetId); }
                sim.step();
                if (fed) sim.autoOffense = true;
                n++;
                if ((mate.stats?.fga || 0) > before) shots++;
                continue;
              }
            }
            sim.step();
          }
        }
      }
    }
    return { n, rate: shots / n };
  };
  const control = share(false);
  const fed = share(true);
  assert.ok(control.n > 150 && fed.n > 150, `enough asked possessions to compare (${control.n}, ${fed.n})`);
  assert.ok(fed.rate > control.rate + 0.05, `he shoots more when fed: ${fed.rate.toFixed(3)} vs ${control.rate.toFixed(3)}`);
});

test("7. what it was worth: only his real score moves chemistry; a miss or no touch costs nothing; one settlement per game", () => {
  const offer = { personId: "p-mate", teammateId: "m1", name: "Mate", nameEn: "Mate", pos: "C" };
  const scored = settleFeed({ decisionId: "g1|1", offer, run: { shot: true, made: true, points: 2 } });
  const clutch = settleFeed({ decisionId: "g1|2", offer, run: { shot: true, made: true, points: 3 }, critical: true });
  const missed = settleFeed({ decisionId: "g1|3", offer, run: { shot: true, made: false, points: 0 } });
  const none = settleFeed({ decisionId: "g1|4", offer, run: { shot: false, made: false, points: 0 } });
  assert.ok(scored.delta > 0 && clutch.delta > scored.delta, "a clutch score is worth more");
  assert.equal(missed.delta, 0);
  assert.equal(none.delta, 0);
  assert.deepEqual([scored.reason, missed.reason, none.reason], ["scored", "missed", "none"]);
  assert.equal(scored.id, "g1|1|feed|p-mate", "a stable evidence id");
  const once = recordTeammateEvidence({}, "g1", [scored]);
  const twice = recordTeammateEvidence({ teamplay: once.teamplay }, "g1", [scored]);
  assert.deepEqual(twice.teamplay, once.teamplay, "the same game never settles twice");
});

test("8. in a real Reborn game it is asked, run and reported; saying no costs nothing; the same game replays identically", async () => {
  const take = ({ context }) => (context ? { choiceId: context.options.includes("feed") ? "feed" : "pass" } : null);
  const decline = ({ context }) => (context ? { choiceId: "pass" } : null);
  const full = { getMode: () => "full" };
  let found = null;
  for (let s = 1; s <= 10 && !found; s++) {
    let reborn = createRebornState(`pa3-feed-${s}`, ROWS);
    const season = buildSeason(reborn, ROWS);
    for (let i = 0; i < 5 && !found; i++) {
      const index = season.index;
      const out = await playGame(reborn, season, ROWS, { onTakeover: take, participation: full });
      if (out.report.teamplay?.items?.some((x) => x.kind === "feed")) found = { before: reborn, index, season, out };
      reborn = out.reborn;
    }
  }
  assert.ok(found, "a teammate asked for the ball within 10 careers x 5 games on full control");
  const item = found.out.report.teamplay.items.find((x) => x.kind === "feed");
  assert.ok(["scored", "missed", "none"].includes(item.reason));
  // Spy on the engine's two levers while the same game replays: taking his offer must really pull both.
  const calls = { focus: [], primary: [] };
  const { setFocusPlay, setOffenseFocus } = GameSim.prototype;
  GameSim.prototype.setFocusPlay = function spyFocus(id, ...rest) { calls.focus.push(id); return setFocusPlay.call(this, id, ...rest); };
  GameSim.prototype.setOffenseFocus = function spyPrimary(id, ...rest) { calls.primary.push(id); return setOffenseFocus.call(this, id, ...rest); };
  let again;
  try {
    found.season.index = found.index;
    again = await playGame(found.before, found.season, ROWS, { onTakeover: take, participation: full });
  } finally {
    Object.assign(GameSim.prototype, { setFocusPlay, setOffenseFocus });
  }
  assert.deepEqual(again.report.teamplay, found.out.report.teamplay, "deterministic");
  assert.ok(calls.focus.includes("post_up"), "the post play was really set");
  assert.ok(calls.primary.includes(item.teammateId), "the offense really ran through the man who asked");
  // Turning him down: the same game, nothing about him is settled, and no strength moves.
  found.season.index = found.index;
  const refused = await playGame(found.before, found.season, ROWS, { onTakeover: decline, participation: full });
  assert.ok(!(refused.report.teamplay?.items || []).some((x) => x.kind === "feed"), "declining is not reported as a feed");
  assert.equal(refused.reborn.teamplay?.mates?.[item.personId]?.strength ?? null, found.before.teamplay?.mates?.[item.personId]?.strength ?? null, "no chemistry changes for a refusal");
});

test("9. what the player reads: the teammate's own words, the real why, no promise; names are escaped", () => {
  const sim = flatFloor(liveSim());
  standout(sim, bigAt(sim));
  const me = guardAt(sim);
  const base = A.buildDecisionContext(sim, me.id, AGENCY);
  const evil = { ...base, feedOffer: { ...base.feedOffer, name: "<img src=x onerror=alert(1)>", nameEn: "<b>Bad</b>", against: { name: "<script>1</script>", nameEn: "<i>D</i>" } } };
  const zh = agencyDialogHtml({ sim, context: evil, lang: "zh", mode: "full" });
  const en = agencyDialogHtml({ sim, context: evil, lang: "en", mode: "full" });
  const compact = agencyDialogHtml({ sim, context: { ...evil, tier: "L2" }, lang: "zh", mode: "full", compact: true });
  const bubble = agencyBubbleHtml({ context: evil, lang: "en" });
  for (const html of [zh, en, compact, bubble]) {
    assert.ok(!/<img src=x|<script>|<b>Bad|<i>D<\/i>/.test(html), "a name never becomes markup");
    assert.ok(!/wide open|空位|没人防|球权/.test(html), "no claim the engine cannot back");
  }
  assert.match(zh, /data-testid="feed-offer"/);
  assert.match(zh, /把球给我/);
  assert.match(zh, /不保证进/);
  assert.match(compact, /data-testid="feed-offer"/, "the compact panel keeps the teammate's voice");
  assert.match(en, /give me the ball/i);
  assert.match(bubble, /give me the ball/i, "the bubble says what the teammate said");
  assert.match(bubble, /Feed him/);
  const line = (reason, lang) => describeTeamplayFeedback({ items: [{ kind: "feed", reason, name: "Mate", nameEn: "Mate", points: 2 }], moved: [] }, lang)[0];
  assert.match(line("scored", "zh"), /打成了/);
  assert.match(line("missed", "zh"), /判断本身没有问题/);
  assert.match(line("none", "zh"), /没有拿到出手机会/);
  assert.match(line("scored", "en"), /finished/);
  assert.match(line("missed", "en"), /fair read/);
});

test("11. everything the game OFFERS can be ANSWERED: each option id of a real context is a personal move or a played choice", () => {
  const offered = new Set(DEFENSE_OPTIONS);
  for (const [autonomy, withBig] of [[0, true], [100, true], [100, false]]) {
    const sim = flatFloor(liveSim());
    if (withBig) standout(sim, bigAt(sim));
    for (const p of sim.home.onCourt) for (const id of A.buildDecisionContext(sim, p.id, { ...AGENCY, autonomy, coach: A.teamCoach("LAL", 2001) }).options) offered.add(id);
  }
  assert.ok(offered.has("feed") && offered.has("setup") && offered.has("spot"), "the sample covers the PA3 options");
  for (const id of offered) assert.ok(TAKEOVER_OPTIONS.some((o) => o.id === id) || CHOICE_IDS.includes(id), `${id} is offered but cannot be answered`);
});
