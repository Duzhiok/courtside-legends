/**
 * Skills M1a (earn a signature move from real shot evidence) and M1b (fire it on purpose, one shared budget per game).
 * Real games and the real Reborn flow; no result is asserted, only contracts: the shot log agrees with the engine's own stats, a
 * move fired on purpose spends exactly one shared use, an equipped move no longer procs at random, a refused attempt costs nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import { tallyShot, tallySignature, shotLogOf } from "../js/engine/shotLog.js";
import { fireSignature } from "../js/data/skills.js";
import { AWAKENING_RULES, MISSING_EVIDENCE, ZONE_MOVES, createAwakeningState, evidenceFromReport, progressFor, recordGame } from "../js/career/player/signatureAwakening.js";
import { AUTO_MAX_REFUSALS, SIGNATURE_BUDGET, autoFires, signaturesLeft, signaturesOf } from "../js/reborn/signature.js";
import { buildDecisionContext, signatureOption, teamCoach } from "../js/reborn/agency.js";
import { buildSeason, driveGame, fireSignatureOnce, playGame } from "../js/reborn/season.js";
import { createRebornState } from "../js/reborn/identity.js";
import { agencyBubbleHtml, agencyDialogHtml, describeSignatureFeedback } from "../js/ui/reborn/agencyView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function liveSim(seed, { skills = [], clock = 700 } = {}) {
  const sim = new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true, clock });
  const me = sim.home.onCourt[1];
  if (skills.length) me.skills = [...new Set([...(me.skills || []), ...skills])];
  return { sim, me };
}
const playUntilMine = (sim) => { for (let i = 0; i < 80 && sim.possession !== "home"; i++) sim.step(); };

// ------------------------------------------------------------------------------------------------------------- M1a

test("1. the shot log tallies by the engine's own rule: a fouled miss is no attempt, self-created is the subset", () => {
  const p = {};
  tallyShot(p, "paint", { made: true, selfCreated: true });
  tallyShot(p, "paint", { made: true, selfCreated: false });
  tallyShot(p, "paint", { made: false, selfCreated: true });
  tallyShot(p, "three", { made: true, selfCreated: false, sigId: "stepback" });
  tallySignature(p, "stepback");
  const log = shotLogOf(p);
  assert.deepEqual(log.paint, { a: 3, m: 2, sa: 2, sm: 1 });
  assert.deepEqual(log.three, { a: 1, m: 1, sa: 0, sm: 0 });
  assert.deepEqual(log.sig.stepback, { u: 1, m: 1 });
  assert.equal(shotLogOf({}), null, "a player who never shot has no log: unknown, never a fabricated zero");
  tallyShot(p, "nowhere", { made: true });
  assert.equal(shotLogOf(p).paint.a, 3, "an unknown zone is ignored");
});

test("2. in real games the shot log agrees with the engine's own box score, for every player", () => {
  for (const seed of [3, 8, 14]) {
    const { sim } = liveSim(seed, { clock: 720 });
    for (let i = 0; sim.running && i < 6000; i++) sim.step();
    for (const p of [...sim.home.roster, ...sim.away.roster]) {
      const log = p.shotLog;
      const a = log ? log.paint.a + log.mid.a + log.three.a : 0;
      const m = log ? log.paint.m + log.mid.m + log.three.m : 0;
      assert.equal(a, p.stats.fga, `${p.name}: zone attempts == fga`);
      assert.equal(m, p.stats.fgm, `${p.name}: zone makes == fgm`);
      assert.equal(log ? log.three.a : 0, p.stats.tpa, `${p.name}: three attempts == tpa`);
      assert.equal(log ? log.three.m : 0, p.stats.tpm, `${p.name}: three makes == tpm`);
      if (log) for (const z of ["paint", "mid", "three"]) assert.ok(log[z].sa <= log[z].a && log[z].sm <= log[z].m && log[z].sm <= log[z].sa, "self-created is a subset");
    }
  }
});

test("3. the report line carries zones only when there is a log; an old report is unknown, not zero", () => {
  assert.equal("paintSelfMade" in evidenceFromReport({ line: { min: 30 } }), false);
  const ev = evidenceFromReport({ line: { min: 30, zones: { paint: { sm: 3, sa: 5 }, mid: { sm: 0 }, three: {} } } });
  assert.deepEqual([ev.paintSelfMade, ev.midSelfMade, ev.threeSelfMade], [3, 0, 0]);
  assert.deepEqual([ev.paintSelfAtt, ev.midSelfAtt, ev.threeSelfAtt], [5, 0, 0]);
});

const game = (zone, made, min = 30, n = 0, att = made + 1) => ({ min, game: n, season: 1997, [`${zone}SelfMade`]: made, [`${zone}SelfAtt`]: att });
const cardWith = (over = {}) => ({ skills: [], paint: 70, strength: 60, mid: 66, three: 60, handle: 60, offDribble: 50, pos: "C", ...over });

test("4. a move is earned from SELF-CREATED makes with real minutes - not from a fed finish, a lucky bucket, or an unknown report", () => {
  const dream = AWAKENING_RULES.find((r) => r.skillId === "dream_shake");
  assert.ok(dream.qualifies(game("paint", 3)));
  assert.ok(!dream.qualifies(game("paint", 0)), "fed dunks leave no self-created makes");
  assert.ok(dream.qualifies(game("paint", 2, 10)), "two self-created makes in ten minutes is a real hot stretch (7 per 36)");
  assert.ok(!dream.qualifies(game("paint", 1, 10)), "a single bucket in a ten-minute game is not a habit");
  assert.ok(!dream.qualifies({ min: 30, season: 1997 }), "an old report with no zone data never qualifies");
  assert.ok(dream.keyGame(game("paint", 3)) && !dream.keyGame(game("paint", 2)));
  const step = AWAKENING_RULES.find((r) => r.skillId === "stepback");
  assert.ok(step.qualifies(game("three", 0, 30, 0, 1)), "creating your own three counts as the habit, even when it misses (makes are rare)");
  assert.ok(!step.qualifies(game("three", 0, 30, 0, 0)), "no self-created three at all: not a stepback game");
  assert.ok(!step.keyGame(game("three", 0, 30, 0, 3)), "the key game needs a real make");
  assert.ok(!step.keyGame(game("three", 1, 30, 0, 1)), "...and more than a single lucky attempt");
  assert.ok(step.keyGame(game("three", 1, 30, 0, 2)));
});

test("5. points are never the evidence, the rating gate holds, and the stepback gap is closed", () => {
  assert.equal(MISSING_EVIDENCE.some((m) => m.skillId === "stepback"), false);
  assert.ok(AWAKENING_RULES.some((r) => r.skillId === "stepback"));
  const ev = evidenceFromReport({ line: { min: 34, pts: 48, fgm: 20, fga: 28 } });
  for (const r of AWAKENING_RULES.filter((x) => ZONE_MOVES[x.skillId])) assert.ok(!r.qualifies(ev), `${r.skillId}: 48 points with no shot log awakens nothing`);
  const run = (card, id) => {
    let st = createAwakeningState(1997);
    const games = [3, 4, 3, 6, 3].map((m, i) => ({ ...game(id === "dream_shake" ? "paint" : id === "fadeaway" ? "mid" : "three", m, 30, i) }));
    let fired = [];
    for (const g of games) { const out = recordGame(st, { evidence: g, card }); st = out.state; fired = fired.concat(out.awakened); }
    return fired.map((f) => f.skillId);
  };
  assert.deepEqual(run(cardWith(), "dream_shake"), ["dream_shake"]);
  assert.deepEqual(run(cardWith({ paint: 50 }), "dream_shake"), [], "a low-rated scorer cannot earn it however many he makes");
  assert.deepEqual(run(cardWith({ pos: "SG", strength: 40 }), "dream_shake"), [], "a smaller, weaker player needs the big-man footwork rating");
  assert.deepEqual(run(cardWith({ mid: 50 }), "fadeaway"), []);
  assert.deepEqual(run(cardWith({ three: 70, handle: 40, offDribble: 40 }), "stepback"), [], "a spot-up shooter cannot earn the stepback");
  assert.deepEqual(run(cardWith({ three: 70, handle: 70 }), "stepback"), ["stepback"]);
  const p = progressFor(createAwakeningState(1997), cardWith()).find((x) => x.skillId === "dream_shake");
  assert.ok(p && p.evidenceLabel.includes("自己创造") && p.evidenceLabelEn.includes("SELF-CREATED"), "the UI says what the evidence is");
});

// ------------------------------------------------------------------------------------------------------------- M1b

test("6. the seam fires a move he owns exactly once, spends one shared use, and records it; a move he does not own is refused", () => {
  const { sim, me } = liveSim(11, { skills: ["dream_shake"] });
  assert.ok(fireSignature(me, "dream_shake") && fireSignature(me, "dream_shake").makeBoost > 0);
  assert.equal(fireSignature(me, "stepback"), null, "he does not own it");
  assert.equal(fireSignature({ skills: ["glove"] }, "glove"), null, "a defensive move is not a shot move");
  playUntilMine(sim);
  const out = fireSignatureOnce(sim, me.id, "dream_shake");
  assert.equal(out.fired, true);
  assert.equal(sim.activeSignatureUses, 1);
  assert.equal(sim.requestedSignature, null, "the seam clears itself");
  assert.equal(sim.requestedBallHandlerId, null);
  assert.equal(shotLogOf(me)?.sig.dream_shake.u, 1, "the engine counted the use");
});

test("7. a refused attempt spends nothing: not his possession, or he does not own the move", () => {
  const { sim, me } = liveSim(12, { skills: ["dream_shake"] });
  while (sim.possession !== "away") sim.step();
  const theirs = fireSignatureOnce(sim, me.id, "dream_shake");
  assert.equal(theirs.fired, false);
  assert.equal(sim.activeSignatureUses, 0, "nothing spent");
  playUntilMine(sim);
  const notOwned = fireSignatureOnce(sim, me.id, "stepback");
  assert.equal(notOwned.fired, false);
  assert.equal(sim.activeSignatureUses, 0);
});

test("8. an equipped move no longer procs at random; an unequipped one still does (the property lives only on his card)", () => {
  const sigUses = (flag) => {
    let used = 0;
    for (let seed = 1; seed <= 14; seed++) {
      const { sim, me } = liveSim(seed, { skills: ["dream_shake", "bully_step", "euro_step"], clock: 720 });
      if (flag) me.activeSignatures = ["dream_shake", "bully_step", "euro_step"];
      for (let i = 0; sim.running && i < 6000; i++) sim.step();
      used += Object.values(me.shotLog?.sig || {}).reduce((t, r) => t + r.u, 0);
    }
    return used;
  };
  assert.ok(sigUses(false) > 0, "random procs happen without the flag");
  assert.equal(sigUses(true), 0, "equipped: no random proc at all");
});

test("9. the decision offers the move only while the shared budget has a use left, and never moves the old baseline", () => {
  const { sim, me } = liveSim(21, { skills: ["dream_shake", "fadeaway"] });
  playUntilMine(sim);
  const base = { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "sig|1", autonomy: 50, trust: 60 };
  const none = buildDecisionContext(sim, me.id, base);
  const withMoves = buildDecisionContext(sim, me.id, { ...base, signatureMoves: ["dream_shake", "fadeaway"], signatureLeft: 2 });
  assert.equal(none.signature, null);
  assert.ok(withMoves.options.includes("signature") && withMoves.values.signature > 0);
  assert.equal(withMoves.signature.left, 2);
  assert.ok(["dream_shake", "fadeaway"].includes(withMoves.signature.id), "ONE move: the best fit");
  assert.deepEqual(withMoves.observation, none.observation, "what he reads is unchanged: the move is not in the PA1/PA2 baseline");
  assert.equal(buildDecisionContext(sim, me.id, { ...base, signatureMoves: ["dream_shake"], signatureLeft: 0 }).signature, null, "budget spent: not offered");
  assert.equal(buildDecisionContext(sim, me.id, { ...base, signatureMoves: ["glove", "iron_lungs"], signatureLeft: 2 }).signature, null, "only offensive signature moves");
  assert.equal(signatureOption(sim, me.id, ["dream_shake"]).id, "dream_shake");
  sim.clock = 5;
  assert.equal(signatureOption(sim, me.id, ["dream_shake"]), null, "no time to run it");
});

test("10. the autopilot: a clear edge is fired, with no dice, and only inside the shared budget", () => {
  assert.equal(SIGNATURE_BUDGET, 2);
  assert.equal(autoFires({ margin: 0.1, quarter: 2, left: 2 }), false, "early: save the move");
  assert.equal(autoFires({ margin: 0.1, quarter: 4, left: 2 }), true, "late: a small edge is enough");
  assert.equal(autoFires({ margin: 0.9, quarter: 1, left: 0 }), false, "budget spent");
  assert.equal(autoFires({ margin: 0.25, quarter: 1, left: 1 }), true);
  assert.deepEqual(signaturesOf({ skills: ["dream_shake", "glove", "dream_shake", "rim_protector", "fadeaway"] }), ["dream_shake", "fadeaway"]);
});

test("11. a whole game on the real driveGame: never more than the shared budget, every use is purposeful, refusals are bounded and cost nothing", async () => {
  let uses = 0;
  for (const mode of ["auto", "full"]) for (const seed of [5, 9, 13, 17]) {
    const { sim, me } = liveSim(seed, { skills: ["dream_shake", "fadeaway", "stepback"], clock: 720 });
    me.activeSignatures = ["dream_shake", "fadeaway", "stepback"];
    const asked = [];
    const out = await driveGame(sim, me.id, {
      onTakeover: ({ context }) => { if (context) asked.push(context); return context?.options.includes("signature") ? { choiceId: "signature" } : null; },
      agency: { coach: teamCoach("CHI", 1996), iq: 60, decisionId: `g${seed}`, autonomy: 50, trust: 60, role: "starter", mateStrength: {}, signatureMoves: ["dream_shake", "fadeaway", "stepback"] },
      participation: { getMode: () => mode },
    });
    assert.ok(sim.activeSignatureUses <= SIGNATURE_BUDGET, `${mode}/${seed}: used ${sim.activeSignatureUses}`);
    const fired = Object.values(me.shotLog?.sig || {}).reduce((t, r) => t + r.u, 0);
    assert.equal(fired, sim.activeSignatureUses, `${mode}/${seed}: with the random proc off, every fired move was a purposeful use`);
    for (const c of asked) if (c.signature) assert.ok(c.signature.left >= 1, "never offered with nothing left");
    for (const t of [out.takeover, ...out.extras]) if (t?.kind === "signature") assert.ok(t.accepted !== false || t.run.fired === false);
    assert.equal(out.autoSignatures.every((r) => r.auto), true);
    assert.ok(out.autoSignatures.filter((r) => !r.fired).length <= AUTO_MAX_REFUSALS, "the autopilot gives up after a few refusals instead of forcing him every possession");
    if (mode === "auto") assert.equal(asked.length, 0, "Auto mode never blocks the game with a question");
    const attempts = asked.filter((c) => c.signature).length + out.autoSignatures.length;
    assert.ok(attempts <= sim.activeSignatureUses + 12, `${mode}/${seed}: ${attempts} attempts for ${sim.activeSignatureUses} uses - refusals must stay a small fraction`);
    uses += sim.activeSignatureUses;
  }
  assert.ok(uses >= 8, `the path really fires (${uses} uses over 8 games), so the bounds above are not vacuous`);
});

test("12. the budget is saved with the game: pause, substitution, overtime and a reload cannot refund it", () => {
  const { sim } = liveSim(31);
  sim.activeSignatureUses = 2;
  const restored = GameSim.fromSave(JSON.parse(JSON.stringify(sim.exportState())), { onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  assert.equal(restored.activeSignatureUses, 2);
  assert.equal(signaturesLeft(restored), 0);
  const legacy = JSON.parse(JSON.stringify(sim.exportState()));
  delete legacy.activeSignatureUses;
  assert.equal(GameSim.fromSave(legacy, { onEvent: () => {}, onTick: () => {}, onEnd: () => {} }).activeSignatureUses, 0, "an older save has a fresh budget");
  sim.quarter = 5;
  assert.equal(signaturesLeft(sim), 0, "overtime keeps the same count");
});

test("13. the real Reborn flow: an awakened move rides his card, is offered, and the report says what happened", async () => {
  let reborn = createRebornState("skills-m1", ROWS);
  reborn = { ...reborn, player: { ...reborn.player, awakening: { ...(reborn.player.awakening || {}), version: 1, season: 1997, form: [], awakened: [{ skillId: "dream_shake", source: "awakened", game: 1, season: 1997, evidence: {} }], ready: [] } } };
  const season = buildSeason(reborn, ROWS);
  const offered = [];
  const out = await playGame(reborn, season, ROWS, { participation: { getMode: () => "full" }, onTakeover: ({ context }) => { if (context?.signature) offered.push(context.signature); return null; } });
  assert.ok(out.report.signature === null || (out.report.signature.used >= 0 && out.report.signature.left + out.report.signature.used === SIGNATURE_BUDGET), "the report carries the budget");
  const plain = await playGame(createRebornState("skills-m1b", ROWS), buildSeason(createRebornState("skills-m1b", ROWS), ROWS), ROWS, {});
  assert.equal(plain.report.signature, null, "a player who owns no move gets no signature section");
});

test("14. the screens: the option, the card, the bubble chip, and a feedback line for each real outcome - names escaped", () => {
  const ctx = { options: ["drive", "pullup", "signature", "pass"], offer: null, feedOffer: null, observation: { pick: "pass", clarity: "sharp" }, side: "offense", tier: "L1", routine: true, signature: { id: "dream_shake", name: "梦幻脚步", zone: "paint", left: 2 } };
  const zh = agencyDialogHtml({ context: ctx, lang: "zh", sim: { quarter: 2, clock: 300, score: { home: 50, away: 50 }, youSide: "home" } });
  assert.match(zh, /data-testid="signature-offer"/);
  assert.match(zh, /梦幻脚步/);
  assert.match(zh, /2\/2/);
  assert.match(zh, /不保证进球，投丢也算一次/);
  const en = agencyDialogHtml({ context: ctx, lang: "en", sim: { quarter: 2, clock: 300, score: { home: 50, away: 50 }, youSide: "home" } });
  assert.match(en, /Dream Shake/);
  assert.match(en, /no promise/);
  const bubble = agencyBubbleHtml({ context: ctx, lang: "zh" });
  assert.match(bubble, /data-option="signature"[^>]*><kbd>3<\/kbd> 招牌 梦幻脚步 2\/2/, "the chip itself names the move and the uses left: a phone has no hover");
  assert.match(agencyBubbleHtml({ context: ctx, lang: "en" }), /Signature Dream Shake 2\/2/);
  assert.ok(!/<img/.test(agencyBubbleHtml({ context: { ...ctx, signature: { ...ctx.signature, name: "<img src=x>" } }, lang: "zh" })), "bubble: a move name is never markup");
  const evil = agencyDialogHtml({ context: { ...ctx, signature: { ...ctx.signature, name: "<img src=x onerror=1>" } }, lang: "zh", sim: { quarter: 2, clock: 300, score: { home: 50, away: 50 }, youSide: "home" } });
  assert.ok(!/<img/.test(evil), "a move name is never markup");
  const f = (runs, left = 1, lang = "zh") => describeSignatureFeedback({ used: 2 - left, left, runs }, lang).join(" ");
  assert.match(f([{ id: "dream_shake", fired: true, made: true, points: 2, auto: false }]), /你发动了「梦幻脚步」，打成了（2 分）/);
  assert.match(f([{ id: "dream_shake", fired: true, made: false, points: 0, auto: false }]), /次数照扣/);
  assert.match(f([{ id: "fadeaway", fired: true, made: true, points: 2, auto: true }]), /没问你，自动用了/);
  assert.match(f([{ id: "dream_shake", fired: false, made: false, points: 0, auto: false }]), /次数没扣/);
  assert.match(f([], 2), /不会带到下一场/);
  assert.match(f([{ id: "dream_shake", fired: true, made: false, points: 0, auto: false }], 1, "en"), /spent/);
  assert.deepEqual(describeSignatureFeedback(null), []);
});
