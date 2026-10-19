import test from "node:test";
import assert from "node:assert/strict";
import {
  developmentModifier,
  pruneDevelopmentPlans,
  reconcileDevelopmentPlans,
  recommendDevelopmentPlans,
  setDevelopmentPlan,
} from "../js/modes/playerDevelopment.js";

function player(bref, overrides = {}) {
  return {
    id: `${bref}-2030`,
    bref,
    name: bref,
    season: 2030,
    age: 25,
    pos: "PG",
    overall: 70,
    scoring: 70,
    three: 70,
    mid: 70,
    paint: 70,
    pass: 70,
    defense: 70,
    rebound: 70,
    steal: 70,
    block: 70,
    speed: 70,
    strength: 70,
    stamina: 70,
    iq: 70,
    clutch: 70,
    ...overrides,
  };
}

function career(players = [player("alpha"), player("mentor", { age: 31, iq: 85 })]) {
  return {
    careerId: "development",
    kind: "franchise",
    phase: "regular",
    season: {
      phase: "regular",
      userTeamId: "USER",
      teams: { USER: { players } },
    },
    management: {
      draft: null,
      draftHistory: [],
      seasonHistory: [],
      developmentPlans: {},
    },
    manualOverrides: {},
    recommendations: {},
  };
}

function plan(overrides = {}) {
  return {
    focus: "shooting",
    role: "starter",
    mentorBref: null,
    load: "normal",
    source: "manual",
    ...overrides,
  };
}

test("manual plans are stored immutably in all three persistent maps", () => {
  const original = career();
  const selected = plan({ mentorBref: "mentor" });
  const next = setDevelopmentPlan(original, "alpha", selected);

  assert.notEqual(next, original);
  assert.notEqual(next.management, original.management);
  assert.notEqual(next.management.developmentPlans, original.management.developmentPlans);
  assert.notEqual(next.manualOverrides, original.manualOverrides);
  assert.notEqual(next.recommendations, original.recommendations);
  assert.deepEqual(next.management.developmentPlans.alpha, selected);
  assert.deepEqual(next.manualOverrides.training.alpha, selected);
  assert.deepEqual(next.recommendations.training.alpha, selected);
  assert.notEqual(
    next.management.developmentPlans.alpha,
    next.manualOverrides.training.alpha,
  );
  assert.notEqual(
    next.management.developmentPlans.alpha,
    next.recommendations.training.alpha,
  );
  assert.notEqual(
    next.manualOverrides.training.alpha,
    next.recommendations.training.alpha,
  );
  assert.deepEqual(original, career());
});

test("invalid plans and roster identities reject atomically", () => {
  const invalidCases = [
    plan({ focus: "jumping" }),
    plan({ role: "reserve" }),
    plan({ load: "extreme" }),
    plan({ source: "automatic" }),
    { ...plan(), mentorBref: undefined },
    { focus: "shooting", role: "starter", mentorBref: null, load: "normal" },
    null,
    [],
  ];
  for (const invalid of invalidCases) {
    const original = career();
    const before = structuredClone(original);
    assert.throws(() => setDevelopmentPlan(original, "alpha", invalid));
    assert.deepEqual(original, before);
  }

  for (const [bref, selected] of [
    ["", plan()],
    ["missing", plan()],
    ["alpha", plan({ mentorBref: "alpha" })],
    ["alpha", plan({ mentorBref: "missing" })],
  ]) {
    const original = career();
    const before = structuredClone(original);
    assert.throws(() => setDevelopmentPlan(original, bref, selected));
    assert.deepEqual(original, before);
  }

  const duplicate = career([player("same"), player("same")]);
  const before = structuredClone(duplicate);
  assert.throws(() => setDevelopmentPlan(duplicate, "same", plan()), /bref|duplicate|unique/i);
  assert.deepEqual(duplicate, before);
});

test("plan operations require a managed league career with a user team", () => {
  const missingManagement = career();
  delete missingManagement.management;
  assert.throws(
    () => setDevelopmentPlan(missingManagement, "alpha", plan()),
    /career|management/i,
  );
  assert.throws(
    () => setDevelopmentPlan({ kind: "franchise", season: {} }, "alpha", plan()),
    /career|team|roster/i,
  );
});

test("automatic recommendations follow rank, focus, load, and mentor rules", () => {
  const ratingKeys = [
    "scoring", "three", "mid", "paint", "pass", "defense", "rebound",
    "steal", "block", "speed", "strength", "stamina", "iq", "clutch",
  ];
  const rated = (entry, rating, overrides = {}) =>
    player(entry, {
      ...Object.fromEntries(ratingKeys.map((key) => [key, rating])),
      ...overrides,
    });
  const roster = [
    rated("top", 95, { age: 21, pos: "C", stamina: 80 }),
    rated("second", 90, { age: 25, pos: "PG", pass: 70 }),
    rated("third", 85, { age: 26, pos: "SG", three: 70 }),
    rated("fourth", 80, { age: 26, pos: "PF", defense: 70 }),
    rated("fifth", 75, { age: 26, pos: "PG", pass: 80 }),
    rated("sixth", 70, { age: 32, pos: "C", defense: 80 }),
    rated("seventh", 65, { age: 28, pos: "SF", three: 80 }),
    rated("eighth", 60, { age: 28, pos: "PG", pass: 80, injuredGames: 2 }),
    rated("ninth", 55, { age: 28, pos: "PG", pass: 80 }),
    rated("tenth", 40, { age: 30, pos: "PG", pass: 80, iq: 99 }),
  ];
  const next = recommendDevelopmentPlans(career(roster));
  const plans = next.management.developmentPlans;

  assert.equal(plans.top.role, "alpha");
  assert.deepEqual(
    roster.slice(1, 5).map((entry) => plans[entry.bref].role),
    ["starter", "starter", "starter", "starter"],
  );
  assert.equal(plans.sixth.role, "sixth");
  assert.deepEqual(
    roster.slice(6, 9).map((entry) => plans[entry.bref].role),
    ["role", "role", "role"],
  );
  assert.equal(plans.tenth.role, "bench");
  assert.equal(plans.top.focus, "conditioning");
  assert.equal(plans.second.focus, "playmaking");
  assert.equal(plans.third.focus, "shooting");
  assert.equal(plans.fourth.focus, "defense");
  assert.equal(plans.fifth.focus, "balanced");
  assert.equal(plans.top.load, "high");
  assert.equal(plans.sixth.load, "low");
  assert.equal(plans.eighth.load, "low");
  assert.equal(plans.fifth.load, "normal");
  assert.equal(plans.top.mentorBref, "tenth");
  assert.equal(plans.tenth.mentorBref, "sixth");
  assert.ok(Object.values(plans).every((entry) => entry.source === "automatic"));
  assert.deepEqual(next.recommendations.training, plans);
  assert.notEqual(plans.top, next.recommendations.training.top);
});

test("automatic recommendations preserve manual plans byte-for-byte", () => {
  const original = setDevelopmentPlan(
    career(),
    "alpha",
    plan({ focus: "defense", role: "bench", load: "low", mentorBref: "mentor" }),
  );
  const serialized = JSON.stringify(original.management.developmentPlans.alpha);
  const next = recommendDevelopmentPlans(original);

  assert.equal(JSON.stringify(next.management.developmentPlans.alpha), serialized);
  assert.equal(JSON.stringify(next.recommendations.training.alpha), serialized);
  assert.equal(JSON.stringify(next.manualOverrides.training.alpha), serialized);
});

test("valid manual overrides replace stale automatic executable plans", () => {
  const original = career();
  const manual = plan({
    focus: "defense",
    role: "bench",
    mentorBref: "mentor",
    load: "low",
  });
  original.manualOverrides = { training: { alpha: manual } };
  original.recommendations = { training: { alpha: structuredClone(manual) } };
  original.management.developmentPlans = {
    alpha: { ...plan(), source: "automatic" },
  };

  const next = recommendDevelopmentPlans(original);

  assert.deepEqual(next.management.developmentPlans.alpha, manual);
  assert.equal(
    JSON.stringify(next.management.developmentPlans.alpha),
    JSON.stringify(manual),
  );
  assert.notEqual(next.management.developmentPlans.alpha, manual);
  assert.notEqual(
    next.management.developmentPlans.alpha,
    next.manualOverrides.training.alpha,
  );
  assert.notEqual(
    next.management.developmentPlans.alpha,
    next.recommendations.training.alpha,
  );
});

test("legacy generic manual overrides block automatic executable plans", () => {
  const original = career();
  original.manualOverrides = { training: { alpha: "manual-value" } };
  original.recommendations = { training: { alpha: "manual-value" } };
  original.management.developmentPlans = {
    alpha: { ...plan(), source: "automatic" },
  };

  const next = recommendDevelopmentPlans(original);

  assert.equal(next.manualOverrides.training.alpha, "manual-value");
  assert.equal(next.recommendations.training.alpha, "manual-value");
  assert.equal(next.management.developmentPlans.alpha, undefined);
  assert.ok(next.management.developmentPlans.mentor);
});

test("missing ages use a finite estimate instead of age zero", () => {
  const original = career([
    player("unknown-age", {
      age: null,
      season: 2030,
      pos: "C",
      stamina: 90,
      defense: 80,
    }),
  ]);

  const next = recommendDevelopmentPlans(original);

  assert.equal(next.management.developmentPlans["unknown-age"].focus, "balanced");
  assert.equal(next.management.developmentPlans["unknown-age"].load, "normal");
});

test("development modifiers are deterministic, bounded, and skip capped attributes", () => {
  const athlete = player("alpha", { three: 99, mid: 97, scoring: 98 });
  const context = {
    roleStable: true,
    averageMinutes: 36,
    morale: 80,
    injured: false,
    mentor: player("mentor", { age: 30, iq: 90 }),
    rosterBrefs: ["alpha", "mentor"],
  };
  const selected = plan({ load: "high", role: "alpha", mentorBref: "mentor" });
  const first = developmentModifier(athlete, selected, context);
  const second = developmentModifier(athlete, selected, context);

  assert.deepEqual(first, second);
  assert.equal(first.totalPoints, 3);
  assert.deepEqual(first.attributeDeltas, { mid: 2, scoring: 1 });
  assert.equal(first.injuryRiskDelta, 8);
  assert.equal(first.moraleDelta, 3);
});

test("load, stability, low minutes, morale, mentor, and injury affect modifiers", () => {
  const athlete = player("alpha");
  const baseContext = {
    roleStable: false,
    averageMinutes: 30,
    morale: 60,
    injured: false,
    mentor: null,
    rosterBrefs: ["alpha"],
  };
  assert.equal(
    developmentModifier(athlete, plan({ load: "high" }), baseContext).totalPoints,
    2,
  );
  assert.equal(
    developmentModifier(athlete, plan({ load: "low" }), baseContext).injuryRiskDelta,
    -8,
  );
  assert.equal(
    developmentModifier(athlete, plan(), { ...baseContext, roleStable: true }).totalPoints,
    2,
  );
  assert.equal(
    developmentModifier(athlete, plan(), { ...baseContext, averageMinutes: 10 }).totalPoints,
    0,
  );
  assert.equal(
    developmentModifier(athlete, plan(), { ...baseContext, morale: 20 }).totalPoints,
    0,
  );
  assert.equal(
    developmentModifier(
      athlete,
      plan({ mentorBref: "mentor" }),
      {
        ...baseContext,
        mentor: player("mentor", { age: 27, iq: 72 }),
        rosterBrefs: ["alpha", "mentor"],
      },
    ).totalPoints,
    2,
  );
  const injured = developmentModifier(athlete, plan(), {
    ...baseContext,
    injured: true,
  });
  assert.equal(injured.totalPoints, 0);
  assert.equal(injured.injuryRiskDelta, 6);
  assert.equal(injured.moraleDelta, -2);
  assert.ok(injured.reasons.length > 0);
});

test("pruning removes departed brefs but survives card-id replacement", () => {
  const original = career([player("alpha"), player("departed")]);
  original.management.developmentPlans = {
    alpha: plan(),
    departed: plan({ focus: "defense" }),
  };
  const replaced = structuredClone(original);
  replaced.season.teams.USER.players = [player("alpha", { id: "alpha-2031", season: 2031 })];
  const next = pruneDevelopmentPlans(replaced);

  assert.deepEqual(next.management.developmentPlans, { alpha: plan() });
  assert.equal(original.management.developmentPlans.departed.focus, "defense");
});

test("reconciliation removes departed players and clears departed mentors consistently", () => {
  const original = career([player("alpha"), player("mentor")]);
  const selected = plan({ mentorBref: "mentor" });
  original.management.developmentPlans = {
    alpha: structuredClone(selected),
    departed: plan(),
  };
  original.manualOverrides = {
    training: {
      alpha: structuredClone(selected),
      departed: plan(),
    },
  };
  original.recommendations = {
    training: {
      alpha: structuredClone(selected),
      departed: plan({ source: "automatic" }),
    },
  };
  const changed = structuredClone(original);
  changed.season.teams.USER.players = [player("alpha")];

  const next = reconcileDevelopmentPlans(changed);

  assert.deepEqual(next.management.developmentPlans, {
    alpha: { ...selected, mentorBref: null },
  });
  assert.equal(next.manualOverrides.training.alpha.mentorBref, null);
  assert.equal(next.recommendations.training.alpha.mentorBref, null);
  assert.ok(Object.hasOwn(next.manualOverrides.training, "departed"));
  assert.equal(next.recommendations.training.departed, undefined);
  assert.deepEqual(original.management.developmentPlans.alpha, selected);
});

test("reconciliation restores valid manual authority and suppresses invalid legacy values", () => {
  const original = career();
  const selected = plan({ focus: "defense", mentorBref: "mentor" });
  original.manualOverrides = {
    training: {
      alpha: structuredClone(selected),
      mentor: "legacy-manual-value",
    },
  };
  original.management.developmentPlans = {
    alpha: plan({ source: "automatic" }),
    mentor: plan({ source: "automatic" }),
  };

  const next = reconcileDevelopmentPlans(original);

  assert.deepEqual(next.management.developmentPlans.alpha, selected);
  assert.equal(next.management.developmentPlans.mentor, undefined);
  assert.equal(next.manualOverrides.training.mentor, "legacy-manual-value");
});
