/**
 * Unified Career entry (ADR-006): four identities in parallel, time travel
 * as a shared era setting — not a fifth profession.
 *
 * Pins: the permission contract (pure, no consumers yet), the four identity
 * cards and their honest statuses, the era availability per identity, the
 * static index.html structure (the two catalog modes still have their
 * cards, now as the GM / GM + Coach identities), and that the old
 * two-card presentation (穿越生涯 / 联盟经理） is gone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  careerDetailsHtml,
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

test("four identities, in order, with distinct statuses and routes", () => {
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
    ["dev", "dev", "awaiting", "playable"],
  );
  assert.deepEqual(
    CAREER_IDENTITIES.map((entry) => entry.route),
    [null, null, "franchise", "timeTravel"],
  );
  assert.ok(careerIdentityById("gm_coach")?.status === "playable");
  assert.equal(careerIdentityById("nope"), null);
});

test("erasFor: only supported role/era combinations are offered as playable", () => {
  assert.deepEqual(erasFor("gm_coach"), [
    { id: "historical", available: true },
    { id: "modern", available: false },
  ]);
  // GM picks its era on the League Manager setup screen (Modern / Historical toggle).
  assert.equal(erasFor("gm"), "setup");
  // Player / Coach have no creation flow at all.
  assert.deepEqual(erasFor("player"), []);
  assert.deepEqual(erasFor("coach"), []);
});

test("careerDetailsHtml: every card explains control, progression and challenge", () => {
  for (const identity of CAREER_IDENTITIES) {
    const zh = careerDetailsHtml(identity, "zh");
    assert.match(zh, /执掌/);
    assert.match(zh, /成长/);
    assert.match(zh, /挑战/);
    const en = careerDetailsHtml(identity, "en");
    assert.match(en, /Control/);
    assert.match(en, /Growth/);
    assert.match(en, /Challenge/);
  }
  // The GM card says plainly that it reuses the League Manager flow and
  // that coach permissions are not yet isolated.
  const gm = careerDetailsHtml(careerIdentityById("gm"), "zh");
  assert.match(gm, /提醒/);
  assert.match(gm, /教练权限尚未隔离/);
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

test("index.html: the old two-card presentation is gone; statuses are honest", () => {
  const panel = careerPanelHtml();
  assert.ok(!panel.includes("穿越生涯"), "the old Time Travel card title must be gone");
  assert.ok(!panel.includes("联盟经理"), "the old League Manager card title must be gone");
  assert.ok(panel.includes("球员生涯"));
  assert.ok(panel.includes("教练生涯"));
  assert.ok(panel.includes("经理生涯"));
  assert.ok(panel.includes("经理兼教练"));
  assert.equal((panel.match(/开发中/g) || []).length, 2, "Player + Coach are in development");
  assert.ok(panel.includes("待独立身份实现"), "GM awaits its independent identity");
  assert.ok(panel.includes("经典玩法可玩"), "GM + Coach is the classic playable flow");
  assert.ok(panel.includes('id="career-entry-note"'), "dev-note mount exists");
  assert.ok(panel.includes('id="career-era-panel"'), "era-step mount exists");
});

test("index.html: the photo legends on the identity cards are real roster rows", () => {
  const panel = careerPanelHtml();
  const tokens = [...panel.matchAll(/data-legend="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tokens, ["jordami01:1991", "curryst01:2016", "jamesle01:2013"]);
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"))
    .players;
  for (const token of tokens) {
    const [bref, season] = token.split(":");
    assert.ok(
      rows.some((row) => row.bref === bref && row.season === Number(season)),
      `${token} must be a real roster row`,
    );
  }
});
