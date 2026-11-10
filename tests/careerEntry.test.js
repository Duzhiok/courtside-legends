/**
 * Unified Career entry (3+1, user decision 2026-11-09): three standard
 * identities + one hidden prestige identity (The Architect), time travel
 * as a shared era setting — not a fifth profession.
 *
 * Pins: the permission contract (pure, no consumers yet), the identity
 * cards and their honest statuses, the era availability per identity, the
 * prestige era briefing, the static index.html structure (the two catalog
 * modes still have their cards, now as the GM / GM + Coach identities;
 * the three portraits come from assets/career/*), and that the old
 * two-card presentation (穿越生涯 / 联盟经理） is gone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  CAREER_ROLES,
  CAREER_CAPABILITIES,
  identityOf,
  permissionsFor,
} from "../js/career/careerIdentity.js";
import {
  CAREER_IDENTITIES,
  careerIdentityById,
  erasFor,
  eraPanelHtml,
} from "../js/ui/careerEntry.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** Crude slice of one home-category panel (same technique as homeTabs.test.js). */
function careerPanelHtml() {
  const marker = '<div class="home-category-panel" data-category="career">';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, "index.html is missing the career panel");
  const rest = html.slice(start + marker.length);
  const nextPanel = rest.indexOf('<div class="home-category-panel"');
  return rest.slice(0, nextPanel >= 0 ? nextPanel : undefined);
}

// ---------------------------------------------------------------- contract

test("identityOf: a save without an identity is the Classic GM + Coach (ADR-006 Q1)", () => {
  assert.equal(identityOf(null), "GM_COACH");
  assert.equal(identityOf(undefined), "GM_COACH");
  assert.equal(identityOf({}), "GM_COACH");
  assert.equal(identityOf({ identity: {} }), "GM_COACH");
  assert.equal(identityOf({ identity: { currentRole: "COACH" } }), "COACH");
  assert.equal(identityOf({ identity: { currentRole: "PLAYER" } }), "PLAYER");
  assert.equal(identityOf({ identity: { currentRole: "GM" } }), "GM");
  assert.equal(identityOf({ identity: { currentRole: "GM_COACH" } }), "GM_COACH");
  assert.equal(identityOf({ identity: { currentRole: "SUPERUSER" } }), "GM_COACH");
  assert.equal(identityOf({ identity: { initialRole: "COACH" } }), "GM_COACH");
});

test("permissionsFor: the ADR-006 matrix, exactly — no role gets a power it should not have", () => {
  assert.deepEqual(
    [...permissionsFor("PLAYER")].sort(),
    ["personalTraining", "signOwnContract", "takeover", "watchGame"].sort(),
  );
  assert.deepEqual(
    [...permissionsFor("COACH")].sort(),
    [
      "commandGame",
      "setRotation",
      "setTrainingFocus",
      "signOwnContract",
      "suggestDraft",
      "suggestTrade",
      "teamTraining",
      "watchGame",
    ].sort(),
  );
  assert.deepEqual(
    [...permissionsFor("GM")].sort(),
    [
      "allocateDevelopment",
      "draft",
      "release",
      "signFreeAgent",
      "signOwnContract",
      "trade",
      "watchGame",
    ].sort(),
  );
  const dual = permissionsFor("GM_COACH");
  assert.equal(dual.size, CAREER_CAPABILITIES.length);
  for (const capability of CAREER_CAPABILITIES) assert.ok(dual.has(capability));
  // A Coach may only suggest a deal or a pick — never execute one.
  assert.ok(!permissionsFor("COACH").has("trade"));
  assert.ok(!permissionsFor("COACH").has("draft"));
  assert.ok(!permissionsFor("COACH").has("signFreeAgent"));
  // A GM never gets live coaching powers.
  assert.ok(!permissionsFor("GM").has("commandGame"));
  assert.ok(!permissionsFor("GM").has("setRotation"));
  // Unknown roles fail closed; callers resolve through identityOf() first.
  assert.equal(permissionsFor("SUPERUSER").size, 0);
  assert.equal(permissionsFor(undefined).size, 0);
});

test("permissionsFor: GM + Coach is the union of the other three roles", () => {
  const dual = permissionsFor("GM_COACH");
  for (const role of ["PLAYER", "COACH", "GM"]) {
    for (const capability of permissionsFor(role)) {
      assert.ok(dual.has(capability), `GM_COACH must hold ${capability} from ${role}`);
    }
  }
  assert.deepEqual([...CAREER_ROLES].sort(), ["COACH", "GM", "GM_COACH", "PLAYER"].sort());
});

// ---------------------------------------------------------------- entry data

test("3+1 identities, in order, with distinct statuses and routes", () => {
  assert.deepEqual(
    CAREER_IDENTITIES.map((entry) => entry.id),
    ["player", "coach", "gm", "gm_coach"],
  );
  assert.deepEqual(
    CAREER_IDENTITIES.map((entry) => entry.role),
    ["PLAYER", "COACH", "GM", "GM_COACH"],
  );
  assert.deepEqual(
    CAREER_IDENTITIES.map((entry) => entry.status),
    ["playable", "playable", "awaiting", "prestige"],
  );
  assert.deepEqual(
    CAREER_IDENTITIES.map((entry) => entry.route),
    ["reborn", "timeTravel", "franchise", "timeTravel"],
  );
  assert.ok(careerIdentityById("gm_coach")?.prestige, "GM + Coach is the prestige identity");
  assert.equal(careerIdentityById("nope"), null);
});

test("erasFor: only supported role/era combinations are offered as playable", () => {
  assert.deepEqual(erasFor("gm_coach"), [
    { id: "historical", available: true },
    { id: "modern", available: false },
  ]);
  // GM picks its era on the League Manager setup screen (Modern / Historical toggle).
  assert.equal(erasFor("gm"), "setup");
  // Player has a creation flow (historical start 1995 / 1996, Modern not yet).
  assert.deepEqual(erasFor("player"), [
    { id: "historical", available: true },
    { id: "modern", available: false },
  ]);
  // Coach starts in the Time Travel creation screen, which offers the
  // historical year selector (1976–2025); Modern is not open yet.
  // Clicking the card pre-sets the prologue role to COACH
  // (setPrologueRole) before opening that screen.
  assert.deepEqual(erasFor("coach"), [
    { id: "historical", available: true },
    { id: "modern", available: false },
  ]);
});

test("eraPanelHtml: Historical is playable, Modern is shown disabled — never as playable", () => {
  const zh = eraPanelHtml("zh");
  assert.match(zh, /历史穿越（1976–2025）/);
  assert.match(zh, /data-career-era="historical"/);
  assert.match(zh, /data-career-era="modern" disabled/);
  assert.match(zh, /即将推出/);
  const en = eraPanelHtml("en");
  assert.match(en, /Historical Time Travel \(1976–2025\)/);
  assert.match(en, /Coming soon/);
});

test("eraPanelHtml: the prestige variant adds the Architect briefing, not a second flow", () => {
  const zh = eraPanelHtml("zh", { prestige: true });
  assert.match(zh, /The Architect/);
  assert.match(zh, /隐藏职业 · 经理兼教练/);
  assert.match(zh, /双重目标/);
  assert.match(zh, /董事会要求本赛季进入季后赛/);
  assert.match(zh, /决策连锁/);
  assert.match(zh, /你作为经理交易来的球员，作为教练必须自己使用/);
  assert.match(zh, /传奇称号/);
  assert.match(zh, /The Architect · Dynasty Master · Basketball Immortal/);
  // Same era choices as the classic step — prestige changes the
  // presentation, not the engine.
  assert.match(zh, /data-career-era="historical"/);
  assert.match(zh, /data-career-era="modern" disabled/);
  const classic = eraPanelHtml("zh");
  assert.ok(!classic.includes("双重目标"), "the classic step has no prestige briefing");
  assert.ok(!classic.includes("The Architect"), "the classic step is not branded Architect");
});

// ---------------------------------------------------------------- static HTML

test("index.html: the career panel holds four identity cards, in order", () => {
  const panel = careerPanelHtml();
  const ids = [...panel.matchAll(/data-career-identity="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["player", "coach", "gm", "gm_coach"]);
});

test("index.html: the two catalog modes keep their cards — as the GM and GM + Coach identities", () => {
  const panel = careerPanelHtml();
  const routes = [...panel.matchAll(/data-mode="([^"]+)" data-career-identity="([^"]+)"/g)].map(
    ([, mode, identity]) => [mode, identity],
  );
  assert.deepEqual(routes, [
    ["franchise", "gm"],
    ["timeTravel", "gm_coach"],
  ]);
});

test("index.html: the old two-card presentation is gone; the 3+1 copy matches the concept mock", () => {
  const panel = careerPanelHtml();
  assert.ok(!panel.includes("穿越生涯"), "the old Time Travel card title must be gone");
  assert.ok(!panel.includes("联盟经理"), "the old League Manager card title must be gone");
  assert.ok(!panel.includes("同一个篮球世界，四条不同的传奇道路。"), "the old four-card subtitle is gone");
  assert.ok(panel.includes("COURTSIDE LEGENDS · REBORN"));
  assert.ok(panel.includes("每一种身份，都是一条通往传奇的道路。"));
  assert.ok(panel.includes("球员"));
  assert.ok(panel.includes("从无名新人到传奇巨星"));
  assert.ok(panel.includes("教练"));
  assert.ok(panel.includes("从战术大师到冠军教头"));
  assert.ok(panel.includes("经理"));
  assert.ok(panel.includes("从球队经营到王朝缔造"));
  assert.ok(panel.includes("THE ARCHITECT"));
  assert.ok(panel.includes("隐藏职业 · 经理兼教练"));
  assert.ok(panel.includes("掌握战术与经营的双重权力，亲手打造属于自己的篮球王朝。"));
  // No status pills anymore — the mock has none; honesty lives in the
  // click behaviour (Coach note, locked Architect note), not in pills.
  assert.ok(!panel.includes("开发中"), "no dev pill on the mock's photo cards");
  assert.ok(!panel.includes("待独立身份实现"), "no awaiting pill");
  assert.ok(!panel.includes("经典玩法可玩"), "no playable pill");
  assert.ok(panel.includes('id="career-entry-note"'), "note mount exists");
  assert.ok(panel.includes('id="career-era-panel"'), "era-step mount exists");
});

test("index.html: the three portraits are the mock crops in assets/career/*", () => {
  const panel = careerPanelHtml();
  const srcs = [...panel.matchAll(/<img class="career-photo" src="([^"]+)" alt="">/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(srcs, ["assets/career/player.jpg", "assets/career/coach.jpg", "assets/career/gm.jpg"]);
  for (const src of srcs) {
    assert.ok(
      existsSync(new URL(`../${src}`, import.meta.url)),
      `${src} must exist in the repo`,
    );
  }
});

test("index.html: the Architect card carries the lock, the progress pills, and the catalog route", () => {
  const panel = careerPanelHtml();
  const card = panel.match(
    /<button[^>]*data-career-identity="gm_coach"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(card, "the Architect card must exist");
  assert.match(card, /data-mode="timeTravel"/, "the Architect still routes to the Time Travel mode");
  assert.match(card, /data-architect-lock="closed"/);
  assert.match(card, /data-architect-lock="open"/);
  assert.match(card, /data-architect-pill="coach"/);
  assert.match(card, /data-architect-pill="gm"/);
  assert.match(card, /data-architect-progress/);
  assert.match(card, /教练生涯/);
  assert.match(card, /经理生涯/);
});
