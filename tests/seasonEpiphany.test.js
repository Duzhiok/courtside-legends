import assert from "node:assert/strict";
import test from "node:test";
import { foldBatch, settleGame } from "../js/career/gameRewards.js";
import { validEpiphany } from "../js/career/growthShape.js";
import { awardEpiphany, retractLearned, rolloverEpiphany, settleEpiphany } from "../js/career/seasonEpiphany.js";
import { clonePlayer } from "../js/data/players.js";
import {
  MAX_SKILL_SLOTS, SKILL_PACKS, canRetainSkill, grantSkillToPlayer, isLearnableSkill, skillSlotsFull,
} from "../js/data/skills.js";
import { advancePlayerOneYear } from "../js/engine/develop.js";
import { EPIPHANY_RULES, MAX_EPIPHANY, MIN_MINUTES, STREAK, heatHint } from "../js/engine/epiphany.js";
import { installRealCards, realCards, realGame, realTeam } from "./helpers/realGame.js";

const ALWAYS = () => 0; // the roll always succeeds, and always picks the first option
const NEVER = () => 0.99; // the roll always fails
const PLAYMAKER = EPIPHANY_RULES.find((r) => r.id === "playmaker");

/** A real point guard with a clean slate, so every playmaker skill is still on the table. */
const guard = (over = {}) => {
  const base = realCards("kiddja01")[5];
  assert.ok(base, "a real Jason Kidd card exists");
  return { ...clonePlayer(base), skills: [], ...over };
};
/** One box-score line for settleEpiphany (what gameRewards.settleGame().lines carries). */
const line = (player, over = {}) => ({
  id: player.id, name: player.name, min: 30, pts: 12, reb: 4, ast: 11, stl: 1, blk: 0, tov: 2, fgm: 5, tpm: 1, ...over,
});
const play = (ledger, player, over = {}, rng = NEVER) => settleEpiphany({ ledger, players: [player], lines: [line(player, over)], rng });
const playGames = (player, n, over = {}, rng = NEVER, ledger = {}) => {
  let state = { ledger, learned: [], heat: [] };
  for (let i = 0; i < n; i += 1) state = play(state.ledger, player, over, rng);
  return state;
};

test("three straight playmaker games and a successful roll: he learns a playmaker skill", () => {
  const p = guard();
  const out = playGames(p, STREAK, {}, ALWAYS);
  assert.equal(out.learned.length, 1);
  const [got] = out.learned;
  assert.equal(got.id, p.id);
  assert.equal(got.rule.id, "playmaker");
  assert.equal(got.games, STREAK);
  assert.ok(PLAYMAKER.skills.includes(got.skillId), "from the matching family only");
  assert.equal(got.skill, SKILL_PACKS[got.skillId].name);
  assert.deepEqual(out.ledger[p.bref], { form: [], learned: [got.skillId] }, "the streak is spent, the skill is remembered");
  assert.deepEqual(out.heat, [], "nobody is 'heating up' right after learning");
});

test("the card's rule carries just what the UI needs", () => {
  const out = playGames(guard(), STREAK, {}, ALWAYS);
  assert.deepEqual(Object.keys(out.learned[0].rule).sort(), ["id", "min", "stat"]);
});

test("a failed roll learns nothing and keeps the streak, so the next qualifying game rolls again", () => {
  const p = guard();
  const out = playGames(p, STREAK + 1, {}, NEVER);
  assert.deepEqual(out.learned, []);
  assert.equal(out.ledger[p.bref].learned.length, 0);
  assert.equal(out.ledger[p.bref].form.length, STREAK + 1, "the window just keeps filling");
  const again = play(out.ledger, p, {}, ALWAYS);
  assert.equal(again.learned.length, 1, "a longer streak simply gets more rolls");
});

test("a short game breaks the streak: it takes MIN_MINUTES in every one of the three", () => {
  const p = guard();
  let state = play({}, p);
  state = play(state.ledger, p, { min: MIN_MINUTES - 1 });
  state = play(state.ledger, p, {}, ALWAYS);
  assert.deepEqual(state.learned, []);
  assert.deepEqual(state.heat, [], "and a broken streak does not tease");
});

test("a game below the stat bar breaks the streak too", () => {
  const p = guard();
  const out = playGames(p, STREAK, { ast: PLAYMAKER.min - 1, pts: 10, reb: 3 }, ALWAYS);
  assert.deepEqual(out.learned, []);
});

test("sitting out a game breaks the streak, because a streak is consecutive games", () => {
  const p = guard();
  let state = playGames(p, 2);
  state = settleEpiphany({ ledger: state.ledger, players: [p], lines: [], rng: ALWAYS }); // DNP
  state = play(state.ledger, p, {}, ALWAYS);
  assert.deepEqual(state.learned, []);
});

test("someone who never played gets no ledger entry at all", () => {
  const sub = guard({ id: "bench", bref: "bench01" });
  const out = settleEpiphany({ ledger: {}, players: [sub], lines: [], rng: ALWAYS });
  assert.deepEqual(out.ledger, {});
});

test("heating up: one qualifying game short, only when a roll could really end in a skill", () => {
  const p = guard();
  assert.deepEqual(playGames(p, 1).heat, [], "one good night is just a good night");
  const [hint] = playGames(p, STREAK - 1).heat;
  assert.deepEqual({ id: hint.id, name: hint.name, games: hint.games, of: hint.of, rule: hint.rule.id }, { id: p.id, name: p.name, games: STREAK - 1, of: STREAK, rule: "playmaker" });
  // Everything this family could teach him is already his: promising a skill would be a lie.
  const maxed = guard({ skills: PLAYMAKER.skills.filter((id) => SKILL_PACKS[id]) });
  assert.deepEqual(playGames(maxed, STREAK - 1).heat, []);
});

test("heatHint stays hot while the streak runs on, then goes quiet at the per-person cap", () => {
  const p = guard();
  const hot = playGames(p, STREAK + 1, {}, NEVER);
  assert.equal(hot.heat[0].games, STREAK + 1);
  const capped = { form: hot.ledger[p.bref].form, epiphany: ["a", "b"], skills: [] };
  assert.equal(MAX_EPIPHANY, 2);
  assert.equal(heatHint(capped, p), null);
});

test("the per-person cap holds across games: two epiphanies and no more", () => {
  const p = guard();
  let state = { ledger: {}, learned: [], heat: [] };
  const learned = [];
  for (let i = 0; i < 40; i += 1) {
    state = play(state.ledger, p, {}, ALWAYS);
    for (const got of state.learned) { learned.push(got.skillId); grantSkillToPlayer(p, got.skillId); }
  }
  assert.equal(learned.length, MAX_EPIPHANY);
  assert.equal(new Set(learned).size, MAX_EPIPHANY, "two different skills");
  assert.equal(state.ledger[p.bref].learned.length, MAX_EPIPHANY);
});

test("a full card (7 skills) is left alone: nothing to learn, nothing promised, ledger untouched", () => {
  const ids = Object.keys(SKILL_PACKS).filter((id) => isLearnableSkill(id) && !PLAYMAKER.skills.includes(id)).slice(0, MAX_SKILL_SLOTS);
  const p = guard({ skills: ids });
  assert.equal(skillSlotsFull(p), true);
  const out = playGames(p, STREAK, {}, ALWAYS);
  assert.deepEqual(out, { ledger: {}, learned: [], heat: [] });
});

test("a player who left keeps only what he learned; a streak means nothing off the roster", () => {
  const gone = { form: [{ min: 30, pts: 1, reb: 1, ast: 12, stl: 0, blk: 0, tpm: 0, twoPm: 0 }], learned: [] };
  const sage = { form: [{ min: 30, pts: 1, reb: 1, ast: 12, stl: 0, blk: 0, tpm: 0, twoPm: 0 }], learned: ["thief"] };
  const p = guard();
  const out = play({ gone01: gone, sage01: sage }, p);
  assert.equal(out.ledger.gone01, undefined);
  assert.deepEqual(out.ledger.sage01, { form: [], learned: ["thief"] });
});

test("settleEpiphany never mutates what it is given", () => {
  const p = guard();
  const ledger = playGames(p, 2).ledger;
  const lines = [line(p)];
  const before = JSON.stringify({ ledger, p, lines });
  const frozen = structuredClone({ ledger, p, lines });
  const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };
  deepFreeze(frozen);
  assert.doesNotThrow(() => settleEpiphany({ ledger: frozen.ledger, players: [frozen.p], lines: frozen.lines, rng: ALWAYS }));
  assert.equal(JSON.stringify({ ledger, p, lines }), before);
});

test("the window is a rolling five games, never a game log", () => {
  const p = guard();
  const out = playGames(p, 30, { ast: 2 }); // nothing qualifies
  assert.equal(out.ledger[p.bref].form.length, 5);
});

test("rolloverEpiphany keeps what was learned and forgets every streak", () => {
  const next = rolloverEpiphany({
    a01: { form: [{ min: 30, pts: 1, reb: 1, ast: 12, stl: 0, blk: 0, tpm: 0, twoPm: 0 }], learned: ["thief"] },
    b02: { form: [{ min: 30, pts: 1, reb: 1, ast: 12, stl: 0, blk: 0, tpm: 0, twoPm: 0 }], learned: [] },
  });
  assert.deepEqual(next, { a01: { form: [], learned: ["thief"] } });
  assert.deepEqual(rolloverEpiphany(undefined), {});
});

test("validEpiphany: absent is fine (older saves), empty is fine, malformed is not", () => {
  const goodLine = { min: 30, pts: 1, reb: 1, ast: 12, stl: 0, blk: 0, tpm: 0, twoPm: 0 };
  assert.equal(validEpiphany(undefined), true);
  assert.equal(validEpiphany({}), true);
  assert.equal(validEpiphany({ a01: { form: [goodLine], learned: ["thief"] } }), true);
  for (const bad of [
    null, [], "x", 3,
    { "": { form: [], learned: [] } },
    { a01: null },
    { a01: { form: "no", learned: [] } },
    { a01: { form: [], learned: "thief" } },
    { a01: { form: [{ ...goodLine, ast: -1 }], learned: [] } },
    { a01: { form: [{ ...goodLine, ast: "12" }], learned: [] } },
    { a01: { form: [null], learned: [] } },
    { a01: { form: [], learned: [""] } },
    { a01: { form: [], learned: [4] } },
    { a01: { form: [], learned: ["thief", "thief"] } },
  ]) assert.equal(validEpiphany(bad), false, JSON.stringify(bad));
});

// ---------------------------------------------------------------- the card's data, folded over a stretch
const gameReport = (rewards) => ({ ...settleGame({ score: { home: 100, away: 90 }, home: { name: "A", roster: [{ id: "x", name: "X", stats: { min: 30, pts: 10 } }] }, away: { name: "B", roster: [] } }, "home"), rewards });

test("foldBatch keeps every epiphany of the stretch but only the LAST game's heat", () => {
  const got = (id) => ({ id, name: id, skillId: "thief", skill: "x", rule: { id: "thief", stat: "stl", min: 3 }, games: 3 });
  const hot = (id, games) => ({ id, name: id, rule: { id: "playmaker", stat: "ast", min: 9 }, games, of: 3 });
  const batch = foldBatch([
    gameReport({ playerXp: [], epiphanies: [got("a")], heat: [hot("a", 2)] }),
    gameReport({ playerXp: [], epiphanies: [got("b")], heat: [hot("c", 2)] }),
    gameReport({ playerXp: [], epiphanies: [], heat: [hot("d", 2)] }),
  ]);
  assert.deepEqual(batch.epiphanies.map((e) => e.id), ["a", "b"]);
  assert.deepEqual(batch.heat.map((e) => e.id), ["d"], "who is brewing NOW, not who was three weeks ago");
});

test("settleGame lines carry the threes and field goals the streak rules count", () => {
  const snap = { score: { home: 100, away: 90 }, home: { name: "A", roster: [{ id: "x", name: "X", stats: { min: 30, pts: 10, fgm: 6, tpm: 2 } }] }, away: { name: "B", roster: [] } };
  const [only] = settleGame(snap, "home").lines;
  assert.deepEqual({ fgm: only.fgm, tpm: only.tpm }, { fgm: 6, tpm: 2 });
});

// ---------------------------------------------------------------- the rollover keeps a 7th skill
test("REAL card: the rollover keeps all seven skills (it used to cut to six, losing the one learned last)", () => {
  installRealCards("jamesle01"); // else the ladder is empty and the card never takes the real-career branch
  const [, , , base, next] = realCards("jamesle01");
  const fillers = Object.keys(SKILL_PACKS).filter((id) => isLearnableSkill(id) && canRetainSkill(next, id) && !(next.skills || []).includes(id));
  const player = { ...clonePlayer(base), skills: [...(next.skills || []), ...fillers].slice(0, MAX_SKILL_SLOTS) };
  assert.equal(player.skills.length, MAX_SKILL_SLOTS, "set up a full card");
  const evolved = advancePlayerOneYear(player);
  assert.match(evolved._developNote, /^史实/, `followed the real career curve, not the no-history fallback: ${evolved._developNote}`);
  assert.equal(evolved.skills.length, MAX_SKILL_SLOTS, `kept ${evolved.skills.join(", ")}`);
});

// ---------------------------------------------------------------- real engine, real games
test("REAL engine: a season of real games keeps the ledger honest, capped and tiny", () => {
  const rival = realTeam("BOS", 2023);
  const mine = realTeam("DEN", 2023);
  assert.ok(mine.players.length >= 8 && rival.players.length >= 8, "real rosters loaded");
  const roster = structuredClone(mine.players);
  const startSkills = new Map(roster.map((p) => [p.id, [...(p.skills || [])]]));
  let ledger = {};
  const heatSeen = new Set();
  const learned = [];
  for (let g = 0; g < 82; g += 1) {
    const report = settleGame(realGame({ name: mine.name, players: roster }, rival, "home"), "home");
    const out = settleEpiphany({ ledger, players: roster, lines: report.lines });
    ledger = out.ledger;
    for (const got of out.learned) {
      assert.equal(grantSkillToPlayer(roster.find((p) => p.id === got.id), got.skillId), true, "a brand-new skill, not a duplicate");
      learned.push(got);
    }
    for (const hint of out.heat) heatSeen.add(hint.id);
    assert.equal(validEpiphany(ledger), true, `game ${g + 1}: the ledger is always saveable`);
  }
  assert.ok(learned.length + heatSeen.size > 0, "82 real games produced a streak or a skill (otherwise this test proves nothing)");
  for (const player of roster) {
    const gained = player.skills.filter((id) => !startSkills.get(player.id).includes(id));
    assert.equal(gained.length, (ledger[player.bref]?.learned || []).length, `${player.name}: every new skill is in the ledger, and nothing else is`);
    assert.ok(gained.length <= MAX_EPIPHANY, `${player.name} learned ${gained.length}`);
    for (const id of gained) assert.ok(canRetainSkill(player, id), `${player.name} can really keep ${id}`);
    assert.ok(player.skills.filter((id) => !SKILL_PACKS[id]?.duo).length <= Math.max(MAX_SKILL_SLOTS, startSkills.get(player.id).length));
  }
  assert.ok(Object.values(ledger).every((e) => e.form.length <= 5));
  assert.ok(JSON.stringify(ledger).length < 4000, `the whole ledger stays tiny (${JSON.stringify(ledger).length} bytes)`);
});

// ---------------------------------------------------------------- awardEpiphany: the skill really lands, or it never happened
const award = (ledger, player, over = {}, rng = ALWAYS, grant) => awardEpiphany({ ledger, players: [player], lines: [line(player, over)], rng, grant });
const awardGames = (player, n, rng, grant, ledger = {}) => {
  let state = { ledger, learned: [], heat: [] };
  const seen = [];
  for (let i = 0; i < n; i += 1) { state = award(state.ledger, player, {}, rng, grant); seen.push(...state.learned); }
  return { ...state, seen };
};

test("awardEpiphany: what is announced is really on the live card, and the ledger agrees", () => {
  const p = guard();
  const out = awardGames(p, STREAK, ALWAYS);
  assert.equal(out.seen.length, 1);
  assert.deepEqual(p.skills, [out.seen[0].skillId], "hung on the live player");
  assert.deepEqual(out.ledger[p.bref], { form: [], learned: [out.seen[0].skillId] });
});

test("awardEpiphany: a skill that cannot be hung is not announced and not remembered", () => {
  const p = guard();
  const out = awardGames(p, STREAK, ALWAYS, () => false);
  assert.deepEqual(out.seen, [], "nothing to announce");
  assert.deepEqual(p.skills, []);
  assert.deepEqual(out.ledger[p.bref].learned, [], "and the ledger does not claim it");
});

test("awardEpiphany: a grant that always fails can never put a duplicate in the ledger (it would brick the save)", () => {
  const p = guard();
  const out = awardGames(p, 40, ALWAYS, () => false);
  assert.equal(validEpiphany(out.ledger), true);
  assert.equal(new Set(out.ledger[p.bref].learned).size, out.ledger[p.bref].learned.length);
});

test("awardEpiphany: the real grant path never lets the same skill be learned twice either", () => {
  const p = guard();
  const out = awardGames(p, 60, ALWAYS);
  assert.equal(validEpiphany(out.ledger), true);
  assert.equal(new Set(p.skills).size, p.skills.length);
  assert.ok(out.ledger[p.bref].learned.length <= MAX_EPIPHANY);
});

test("retractLearned takes exactly one skill out and leaves everything else alone", () => {
  const ledger = { a: { form: [], learned: ["thief", "glove"] }, b: { form: [], learned: ["thief"] } };
  const out = retractLearned(ledger, "a", "thief");
  assert.deepEqual(out.a.learned, ["glove"]);
  assert.deepEqual(out.b, ledger.b);
  assert.deepEqual(ledger.a.learned, ["thief", "glove"], "input untouched");
  assert.equal(retractLearned(ledger, "a", "block_artist"), ledger, "nothing to retract");
  assert.equal(retractLearned(ledger, "nobody", "thief"), ledger);
  assert.equal(retractLearned(undefined, "a", "thief"), undefined);
});
