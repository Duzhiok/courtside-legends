import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AURA_HOLDERS,
  SEASON_SIGNATURE_SKILLS,
  SIGNATURE_SKILLS,
  SKILL_PACKS,
  applySkillAttributeBoosts,
  assignSkillPacks,
  canRetainSkill,
  isBlueCollarRebounder,
  isLearnableSkill,
  listAwardSkillCatalog,
  signatureFeedFlavor,
  skillBlockResist,
  skillDefCaptainOpenPenalty,
  skillFatigueMult,
  skillKickMult,
  skillKickOpenBonus,
  skillMakeBonus,
  skillReboundMult,
  trySignatureOffense,
} from "../js/data/skills.js";

function athlete(bref, name, extra = {}) {
  return {
    id: `${bref}-test`,
    bref,
    name,
    season: 2000,
    age: 26,
    speed: 80,
    strength: 78,
    stamina: 85,
    block: 70,
    steal: 70,
    rebound: 80,
    intangibles: { motor: 80 },
    ...extra,
  };
}

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

const EXPECTED_KITS = [
  ["gilgesh01", "Shai Gilgeous-Alexander", ["lean_in_jumper"]],
  ["olajuha01", "Hakeem Olajuwon", ["dream_shake"]],
  ["farieke01", "Kenneth Faried", ["manimal"]],
  ["jokicni01", "Nikola Jokić", ["blind_pass", "one_leg_fade"]],
  ["iversal01", "Allen Iverson", ["lone_wolf", "the_answer"]],
  ["bryanko01", "Kobe Bryant", ["lone_wolf", "mamba_spirit"]],
  ["anthoca01", "Carmelo Anthony", ["offense_kaleidoscope", "lone_wolf"]],
  ["garneke01", "Kevin Garnett", ["wolf_king"], { team: "MIN" }],
  ["antetgi01", "Giannis Antetokounmpo", ["giant_stride", "rim_wrecker", "coast_to_coast"]],
  ["piercpa01", "Paul Pierce", ["the_truth"]],
  ["rodmade01", "Dennis Rodman", ["rebound_maniac", "stamina_monster"]],
  ["jordami01", "Michael Jordan", ["god_mode"]],
];

for (const [bref, name, expected, extra = {}] of EXPECTED_KITS) {
  test(`${name} gets ${expected.join(" + ")}`, () => {
    const player = assignSkillPacks(athlete(bref, name, extra));
    for (const id of expected) assert.ok(player.skills.includes(id), `${name} missing ${id}: ${player.skills}`);
    assert.ok(player.skills.length <= 7, `${name} exceeds 7 skill slots`);
  });

  test(`${name} gets the same kit by name when bref is missing`, () => {
    const byName = assignSkillPacks({ ...athlete("", name, extra), bref: undefined });
    for (const id of expected) assert.ok(byName.skills.includes(id), `${name} name fallback missing ${id}`);
  });
}

test("Hakeem's signature is 梦幻脚步, never 梦幻舞步", () => {
  assert.equal(SKILL_PACKS.dream_shake.name, "梦幻脚步");
  for (let i = 0; i < 20; i += 1) {
    assert.doesNotMatch(signatureFeedFlavor("dream_shake"), /舞步/);
  }
});

test("Manimal boosts athletic attributes by 10%, capped at 99, only once", () => {
  const faried = { skills: ["manimal"], speed: 80, strength: 70, stamina: 95, mid: 40 };
  applySkillAttributeBoosts(faried);
  assert.deepEqual([faried.speed, faried.strength, faried.stamina, faried.mid], [88, 77, 99, 40]);
  applySkillAttributeBoosts(faried);
  assert.equal(faried.speed, 88);
  const plain = { skills: [], speed: 80 };
  applySkillAttributeBoosts(plain);
  assert.equal(plain.speed, 80);
});

test("脑后长眼 passes out more and creates more open looks, most of all when doubled", () => {
  const jokic = { skills: ["blind_pass"] };
  assert.ok(skillKickMult(jokic, { doubled: true }) > skillKickMult(jokic, { doubled: false }));
  assert.ok(skillKickMult(jokic) > 1);
  const doubled = skillKickOpenBonus(jokic, { doubled: true });
  const normal = skillKickOpenBonus(jokic, { doubled: false });
  assert.ok(doubled.bonus > normal.bonus && normal.bonus > 0);
  assert.equal(skillKickOpenBonus({ skills: [] }).bonus, 0);
});

test("单脚抛射 and 答案 are harder to block; regular players are not", () => {
  assert.ok(skillBlockResist({ skills: ["one_leg_fade"] }) < 0.6);
  assert.ok(skillBlockResist({ skills: ["the_answer"] }) < 1);
  assert.equal(skillBlockResist({ skills: [] }), 1);
});

test("单脚抛射 makes contested deep threes and paint shots better", () => {
  const jokic = { skills: ["one_leg_fade"] };
  assert.ok(skillMakeBonus(jokic, { zone: "three" }, { open: 0.3 }) > 0);
  assert.ok(skillMakeBonus(jokic, { zone: "paint" }, { open: 0.5 }) > 0);
});

test("上帝附体 is a mid-range shot flagged as a guaranteed make", () => {
  const jordan = { skills: ["god_mode"] };
  const move = withRandom(0, () => trySignatureOffense(jordan, null, { quarter: 4, scoreDiff: 0 }));
  assert.equal(move.id, "god_mode");
  assert.equal(move.shot.zone, "mid");
  assert.equal(move.guaranteed, true);
  const miss = withRandom(0.99, () => trySignatureOffense(jordan, null, {}));
  assert.equal(miss, null);
});

test("曼巴精神 shoots better late and when trailing; also saves stamina", () => {
  const kobe = { skills: ["mamba_spirit"] };
  const early = skillMakeBonus(kobe, { zone: "mid" }, { quarter: 1, scoreDiff: 10, open: 0.5 });
  const lateTrailing = skillMakeBonus(kobe, { zone: "mid" }, { quarter: 4, scoreDiff: -5, open: 0.5 });
  assert.ok(lateTrailing > early);
  assert.ok(skillFatigueMult(kobe) < 1);
});

test("答案, 真理, 进攻万花筒 each add a scoring edge in their situation", () => {
  assert.ok(skillMakeBonus({ skills: ["the_answer"] }, { zone: "paint" }, { open: 0.3 }) > 0);
  assert.ok(skillMakeBonus({ skills: ["the_truth"] }, { zone: "mid" }, { open: 0.3 }) > 0);
  for (const zone of ["three", "mid", "paint"]) {
    assert.ok(skillMakeBonus({ skills: ["offense_kaleidoscope"] }, { zone }, { open: 0.5 }) > 0);
  }
});

test("狼王 lifts the whole defense like 防守统领", () => {
  assert.ok(skillDefCaptainOpenPenalty([{ id: "kg", skills: ["wolf_king"] }]) < 0);
  assert.equal(skillDefCaptainOpenPenalty([{ id: "x", skills: [] }]), 0);
});

test("篮板痴汉 out-rebounds 篮板狂魔 and 体能怪物 tires slower than 永动机", () => {
  const maniac = withRandom(0, () => skillReboundMult({ skills: ["rebound_maniac"] }));
  const boardMan = withRandom(0, () => skillReboundMult({ skills: ["board_man"] }));
  assert.ok(maniac > boardMan);
  assert.ok(skillFatigueMult({ skills: ["stamina_monster"] }) < skillFatigueMult({ skills: ["motor_engine"] }));
});

test("nickname skills stay exclusive to their owners", () => {
  for (const id of ["god_mode", "mamba_spirit", "the_answer", "the_truth", "wolf_king", "high_tower", "manimal"]) {
    assert.equal(isLearnableSkill(id), false, `${id} should not be buyable`);
  }
});

test("every skill table bref exists in the roster (catches typos like rodmak01 / cartere01)", () => {
  const roster = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"));
  const rows = Array.isArray(roster) ? roster : Object.values(roster).find(Array.isArray);
  const known = new Set(rows.map((r) => r.bref));
  // Deliberate legacy aliases kept for old saves
  const aliases = new Set(["leonard01", "stephcu01", "hardeti01"]);
  const keys = [
    ...Object.keys(SIGNATURE_SKILLS),
    ...Object.keys(SEASON_SIGNATURE_SKILLS).map((key) => key.split(":")[0]),
    ...Object.keys(AURA_HOLDERS),
  ];
  const missing = [...new Set(keys)].filter((bref) => !known.has(bref) && !aliases.has(bref));
  assert.deepEqual(missing, []);
});

test("curated skills survive at prime age even with low stat-derived speed", () => {
  const hakeem = { bref: "olajuha01", season: 1994, age: 31, speed: 43, block: 98, stamina: 98 };
  assert.equal(canRetainSkill(hakeem, "rim_protector"), true);
  const faried = { bref: "farieke01", season: 2014, age: 25, speed: 52, block: 51 };
  for (const id of ["poster_slam", "lob_finisher", "spring_board", "rim_protector"]) {
    assert.equal(canRetainSkill(faried, id), true, `Faried 2014 should keep ${id}`);
  }
});

test("aging still removes curated skills via age rules", () => {
  assert.equal(canRetainSkill({ bref: "farieke01", age: 33, speed: 52 }, "spring_board"), false);
  assert.equal(canRetainSkill({ bref: "onealsh01", age: 37, strength: 95 }, "mountain_slam"), false);
  assert.equal(canRetainSkill({ bref: "farieke01", age: 33 }, "manimal"), false);
});

test("uncurated skills still respect athletic thresholds", () => {
  const slowRolePlayer = { bref: "nobodyxx01", age: 25, speed: 50 };
  assert.equal(canRetainSkill(slowRolePlayer, "spring_board"), false);
});

test("大虫 is Rodman's nickname, not a skill", () => {
  assert.equal(SKILL_PACKS.the_worm, undefined);
  const rodman = assignSkillPacks(athlete("rodmade01", "Dennis Rodman"));
  assert.deepEqual(rodman.skills.sort(), ["lockdown", "rebound_maniac", "stamina_monster"]);
});

test("篮板痴汉 triggers far more often in a blue-collar second-chance role", () => {
  const trials = 4000;
  const rate = (player) => {
    let hits = 0;
    for (let i = 0; i < trials; i += 1) if (skillReboundMult(player, { offensive: true }) > 1) hits += 1;
    return hits / trials;
  };
  const hustle = { skills: ["rebound_maniac"], orders: { usage: "hustle" } };
  const roleGuy = { skills: ["rebound_maniac"], roleExpectation: "role", raw: { ppg: 6 } };
  const scorer = { skills: ["rebound_maniac"], roleExpectation: "alpha", raw: { ppg: 27 }, orders: { usage: "score" } };
  assert.ok(isBlueCollarRebounder(hustle) && isBlueCollarRebounder(roleGuy) && !isBlueCollarRebounder(scorer));
  assert.ok(rate(hustle) > 0.6);
  assert.ok(rate(roleGuy) > 0.6);
  assert.ok(rate(scorer) < 0.25);
  const boostBlue = withRandom(0, () => skillReboundMult(hustle, { offensive: true }));
  const boostDefense = withRandom(0, () => skillReboundMult(hustle, { offensive: false }));
  assert.ok(boostBlue > boostDefense);
});

test("狼王 only exists on Timberwolves season cards", () => {
  const mn = assignSkillPacks(athlete("garneke01", "Kevin Garnett", { team: "MIN" }));
  const bos = assignSkillPacks(athlete("garneke01", "Kevin Garnett", { team: "BOS", season: 2008 }));
  assert.ok(mn.skills.includes("wolf_king"));
  assert.ok(!bos.skills.includes("wolf_king"));
});

test("Garnett has neither 传球魔术 nor 篮下暴君; Yao has no 篮下暴君; Jaylen Brown has no skills", () => {
  const kg = assignSkillPacks(athlete("garneke01", "Kevin Garnett", { team: "MIN" }));
  assert.ok(!kg.skills.includes("dime_dropper") && !kg.skills.includes("paint_bully"));
  const yao = assignSkillPacks(athlete("mingya01", "Yao Ming", { heightCm: 229 }));
  assert.ok(!yao.skills.includes("paint_bully"));
  const brown = assignSkillPacks(athlete("brownja02", "Jaylen Brown", { hiddenTier: "allstar" }));
  assert.deepEqual(brown.skills, []);
  const byName = assignSkillPacks({ ...athlete("", "Jaylen Brown", { hiddenTier: "allstar" }), bref: "brownja02" });
  assert.deepEqual(byName.skills, []);
});

test("高塔 needs a body taller than Shaq (216cm), even if bought", () => {
  const yao = { bref: "mingya01", age: 27, heightCm: 229, skills: ["high_tower"] };
  assert.equal(canRetainSkill(yao, "high_tower"), true);
  const shaq = { bref: "onealsh01", age: 27, heightCm: 216 };
  assert.equal(canRetainSkill(shaq, "high_tower"), false);
  const shortBuyer = { bref: "nobody01", age: 25, heightCm: 200, purchasedSkills: ["high_tower"] };
  assert.equal(canRetainSkill(shortBuyer, "high_tower"), false);
  assert.equal(isLearnableSkill("high_tower"), false);
});

test("Giannis skills are generic, learnable, and make paint finishes better", () => {
  for (const id of ["giant_stride", "rim_wrecker"]) {
    assert.equal(isLearnableSkill(id), true, `${id} should be learnable`);
  }
  assert.ok(skillBlockResist({ skills: ["rim_wrecker"] }) < 1);
  const stride = withRandom(0, () => trySignatureOffense({ skills: ["giant_stride"] }, null, {}));
  assert.equal(stride.shot.zone, "paint");
  for (const id of ["giant_stride", "rim_wrecker"]) assert.ok(signatureFeedFlavor(id));
  assert.equal(SKILL_PACKS.giant_stride.name, "大步流星");
  assert.equal(SKILL_PACKS.rim_wrecker.name, "篮筐肆虐者");
});

test("exclusive skills never show up in the award picker", () => {
  const ids = listAwardSkillCatalog([]).all.map((s) => s.id);
  for (const id of ["god_mode", "mamba_spirit", "the_answer", "wolf_king", "high_tower", "manimal"]) {
    assert.ok(!ids.includes(id), `${id} should not be claimable`);
  }
  assert.ok(ids.includes("rim_wrecker") && ids.includes("rebound_maniac"));
});

test("Jokić is a rhythm big: 高抛大师 instead of 中投大师, no 篮下暴君", () => {
  const jokic = assignSkillPacks(athlete("jokicni01", "Nikola Jokić"));
  for (const id of ["high_floater", "one_leg_fade", "blind_pass"]) assert.ok(jokic.skills.includes(id), id);
  for (const id of ["paint_bully", "mid_maestro"]) assert.ok(!jokic.skills.includes(id), `no ${id}`);
  assert.equal(SKILL_PACKS.high_floater.name, "高抛大师");
  assert.ok(skillBlockResist({ skills: ["high_floater"] }) < 1, "high arc is hard to block");
  assert.equal(isLearnableSkill("high_floater"), true);
});

test("篮下暴君 is curated bully-ball only: finesse bigs lose it, Barkley / Malone get it", () => {
  for (const [bref, name] of [["olajuha01", "Hakeem Olajuwon"], ["abdulka01", "Kareem Abdul-Jabbar"], ["johnsma02", "Magic Johnson"]]) {
    assert.ok(!assignSkillPacks(athlete(bref, name)).skills.includes("paint_bully"), name);
  }
  for (const [bref, name] of [["barklch01", "Charles Barkley"], ["malonka01", "Karl Malone"], ["onealsh01", "Shaquille O'Neal"]]) {
    assert.ok(assignSkillPacks(athlete(bref, name)).skills.includes("paint_bully"), name);
  }
  // stat heuristics and gold can't hand it out
  const bigBody = { bref: "nobody01", age: 26, paint: 99, strength: 99, purchasedSkills: ["paint_bully"] };
  assert.equal(canRetainSkill(bigBody, "paint_bully"), false);
  assert.equal(isLearnableSkill("paint_bully"), false);
});

test("only curated players hold 篮下暴君 anywhere in the real roster", () => {
  const roster = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"));
  const rows = Array.isArray(roster) ? roster : Object.values(roster).find(Array.isArray);
  const curated = new Set(
    [...Object.entries(SIGNATURE_SKILLS), ...Object.entries(SEASON_SIGNATURE_SKILLS)]
      .filter(([, ids]) => ids.includes("paint_bully"))
      .map(([key]) => key.split(":")[0])
  );
  const holders = new Set(
    rows
      .map((row) => assignSkillPacks({ ...row, skills: [], age: 26 }))
      .filter((p) => p.skills.includes("paint_bully"))
      .map((p) => p.bref)
  );
  assert.deepEqual([...holders].filter((bref) => !curated.has(bref)), []);
});
