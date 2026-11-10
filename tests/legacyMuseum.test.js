/**
 * Legacy Museum (篮球人生博物馆): the career legacy detail view behind the
 * My World honours wall (user decision 2026-11-10, after 375b75d).
 *
 * Pins: the museum model derives only from real completed-career records
 * and the legacy record — no team, no win-loss record, no wealth, because
 * no real record carries them; a missing field stays missing in the view,
 * never filled in; title names come from ARCHITECT_TITLES through the
 * model, never hardcoded in the view; guests and not-yet-unlocked accounts
 * get no museum; the honours wall's earned titles are the clickable entry.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ARCHITECT_TITLES, architectTitlesFor } from "../js/career/careerAchievements.js";
import { legacyMuseumFor } from "../js/career/legacyMuseum.js";
import { legacyMuseumHtml, museumCareerLine } from "../js/ui/legacyMuseumView.js";
import { architectTitlesHtml } from "../js/ui/myWorldView.js";

function completion({ careerId, role, prestige = false, year = 2001, seasons = 3, championships = 0, tier = "solid", reason = "voluntary", at = 1700000000000 } = {}) {
  return { careerId, role, prestige, year, seasons, championships, tier, reason, at };
}

const account = (completions = [], extra = {}) => ({ playerIds: [], careerCompletions: completions, ...extra });

const unlockedAccount = () => account([
  completion({ careerId: "c1", role: "COACH", at: 1700000000000 }),
  completion({ careerId: "c2", role: "GM", at: 1700001000000 }),
]);

// ---------------------------------------------------------------- model

test("legacyMuseumFor: unlocked account shows both qualifying careers with their real fields", () => {
  const model = legacyMuseumFor(unlockedAccount());
  assert.equal(model.unlocked, true);
  assert.equal(model.qualifications.coach.careerId, "c1");
  assert.equal(model.qualifications.coach.role, "COACH");
  assert.equal(model.qualifications.coach.year, 2001);
  assert.equal(model.qualifications.coach.seasons, 3);
  assert.equal(model.qualifications.coach.championships, 0);
  assert.equal(model.qualifications.coach.tier, "solid");
  assert.equal(model.qualifications.coach.reason, "voluntary");
  assert.equal(model.qualifications.gm.careerId, "c2");
  assert.deepEqual(model.architectCareers, []);
});

test("legacyMuseumFor: unlock date is the earliest date both qualifications were held", () => {
  const model = legacyMuseumFor(account([
    completion({ careerId: "c1", role: "COACH", at: 1700000000000 }),
    completion({ careerId: "c1b", role: "COACH", at: 1700000500000 }),
    completion({ careerId: "c2", role: "GM", at: 1700000200000 }),
  ]));
  // Earliest coach (…0000000) + earliest GM (…200000) -> the later of the two.
  assert.equal(model.unlockedAt, 1700000200000);
  const laterCoach = legacyMuseumFor(account([
    completion({ careerId: "c1", role: "COACH", at: 1700000900000 }),
    completion({ careerId: "c2", role: "GM", at: 1700000200000 }),
  ]));
  assert.equal(laterCoach.unlockedAt, 1700000900000);
});

test("legacyMuseumFor: unlock date is unknown when a completion timestamp is missing", () => {
  const coachNoDate = completion({ careerId: "c1", role: "COACH" });
  delete coachNoDate.at; // the record genuinely carries no timestamp
  const model = legacyMuseumFor(account([
    coachNoDate,
    completion({ careerId: "c2", role: "GM", at: 1700001000000 }),
  ]));
  assert.equal(model.unlockedAt, null);
});

test("legacyMuseumFor: one completion is progress, not a museum; guest and empty accounts get nothing", () => {
  assert.equal(legacyMuseumFor(account([completion({ careerId: "c1", role: "COACH" })])), null);
  assert.equal(legacyMuseumFor(account()), null);
  assert.equal(legacyMuseumFor(null), null);
  assert.equal(legacyMuseumFor(undefined), null);
});

test("legacyMuseumFor: prestige careers feed the dynasty titles and are listed as Architect careers", () => {
  const model = legacyMuseumFor(account([
    completion({ careerId: "c1", role: "COACH" }),
    completion({ careerId: "c2", role: "GM" }),
    completion({ careerId: "c3", role: "GM_COACH", prestige: true, championships: 1, year: 2005, tier: "great" }),
  ]));
  assert.deepEqual(model.titles.map((t) => t.id), ["architect", "dynasty-master", "basketball-immortal"]);
  assert.equal(model.architectCareers.length, 1);
  assert.equal(model.architectCareers[0].careerId, "c3");
  assert.equal(model.architectCareers[0].championships, 1);
});

test("legacyMuseumFor: titles come from ARCHITECT_TITLES, the single source", () => {
  const acc = unlockedAccount();
  assert.deepEqual(legacyMuseumFor(acc).titles, architectTitlesFor(acc));
  assert.equal(legacyMuseumFor(acc).titles[0].zh, ARCHITECT_TITLES.architect.zh);
});

test("legacyMuseumFor: legacy counts come from the account's legacy record", () => {
  const acc = unlockedAccount();
  acc.careerRelationships = {
    people: [{ id: "p1" }],
    relationships: [{ kind: "rivalry", state: "active" }],
    promises: [{ status: "fulfilled" }, { status: "open" }],
    legacy: [
      { type: "transition", season: 1997, year: 1997, summary: "转投新球队", summaryEn: "Moved to a new team" },
      { type: "trade", season: 1998, year: 1998, summary: "完成一笔交易", summaryEn: "Completed a trade" },
    ],
  };
  const model = legacyMuseumFor(acc);
  assert.equal(model.legacy.transitions.length, 1);
  assert.equal(model.legacy.trades.length, 1);
  assert.equal(model.legacy.rivalries, 1);
  assert.deepEqual(model.legacy.promises, { open: 1, fulfilled: 1, broken: 0 });
  assert.equal(model.legacy.headlines.length, 2);
});

// ---------------------------------------------------------------- view

test("legacyMuseumHtml: no museum for null or title-less models", () => {
  assert.equal(legacyMuseumHtml(null, "zh"), "");
  assert.equal(legacyMuseumHtml({ titles: [] }, "en"), "");
});

test("legacyMuseumHtml: unlocked account renders titles, unlock date, both careers and the legacy record", () => {
  const acc = unlockedAccount();
  acc.careerRelationships = {
    people: [],
    relationships: [{ kind: "rivalry", state: "active" }],
    promises: [{ status: "fulfilled" }],
    legacy: [{ type: "transition", season: 1997, year: 1997, summary: "转投新球队", summaryEn: "Moved to a new team" }],
  };
  const zh = legacyMuseumHtml(legacyMuseumFor(acc), "zh");
  assert.match(zh, /篮球人生博物馆/);
  assert.match(zh, /王朝缔造者/);
  assert.match(zh, /解锁于/);
  assert.match(zh, /教练生涯/);
  assert.match(zh, /经理生涯/);
  assert.match(zh, /结束于 2001 赛季/);
  assert.match(zh, /3 个赛季/);
  assert.match(zh, /稳健的主教练/);
  assert.match(zh, /主动退役/);
  assert.match(zh, /转投新球队/);
  assert.match(zh, /承诺 0 待处理 \/ 1 兑现 \/ 0 落空/);
  assert.doesNotMatch(zh, /The Architect/);
  const en = legacyMuseumHtml(legacyMuseumFor(acc), "en");
  assert.match(en, /Legacy Museum/);
  assert.match(en, /The Architect/);
  assert.match(en, /Coach career/);
  assert.match(en, /A Solid Head Coach/);
  assert.match(en, /Moved to a new team/);
  assert.doesNotMatch(en, /王朝缔造者/);
});

test("legacyMuseumHtml: the tapped title's section is marked; other sections are not", () => {
  const html = legacyMuseumHtml(legacyMuseumFor(unlockedAccount()), "zh", "architect");
  assert.match(html, /data-lm-title="architect" class="is-selected"/);
  assert.doesNotMatch(html, /data-lm-title="dynasty-master" class="is-selected"/);
});

test("museumCareerLine: missing fields render without invented values", () => {
  const line = museumCareerLine({ careerId: "c9", role: "COACH", prestige: false, year: null, seasons: 2, championships: null, tier: null, reason: null, at: null }, "zh");
  assert.match(line, /教练生涯/);
  assert.match(line, /2 个赛季/);
  assert.doesNotMatch(line, /undefined|NaN|null/);
  assert.doesNotMatch(line, /总冠军/); // no championship count on the record: none shown
  assert.doesNotMatch(line, /球队|战绩|财富|身家/); // no team, no record, no wealth anywhere
  const empty = museumCareerLine({ careerId: "c9", role: "GM", prestige: false, year: null, seasons: null, championships: null, tier: null, reason: null, at: null }, "en");
  assert.match(empty, /Incomplete record/);
});

test("legacyMuseumHtml: an unknown unlock date says so instead of guessing one", () => {
  const coachNoDate = completion({ careerId: "c1", role: "COACH" });
  delete coachNoDate.at; // the record genuinely carries no timestamp
  const model = legacyMuseumFor(account([
    coachNoDate,
    completion({ careerId: "c2", role: "GM", at: 1700001000000 }),
  ]));
  assert.match(legacyMuseumHtml(model, "zh"), /解锁日期未知/);
  assert.match(legacyMuseumHtml(model, "en"), /Unlock date unknown/);
});

test("legacyMuseumHtml: title names come from the model, not hardcoded strings", () => {
  const model = {
    unlocked: true,
    titles: [{ id: "custom", zh: "测试称号", en: "Test Title" }],
    unlockedAt: null,
    qualifications: { coach: null, gm: null },
    architectCareers: [],
    legacy: { transitions: [], trades: [], drafts: [], divergences: [], rivalries: 0, promises: { open: 0, fulfilled: 0, broken: 0 }, headlines: [] },
  };
  assert.match(legacyMuseumHtml(model, "zh"), /测试称号/);
  assert.match(legacyMuseumHtml(model, "en"), /Test Title/);
  assert.doesNotMatch(legacyMuseumHtml(model, "zh"), /王朝缔造者|传奇掌舵者|篮坛不朽传奇/);
});

// ---------------------------------------------------------------- honours-wall entry

test("architectTitlesHtml: earned titles are clickable into the museum; locked progress is not", () => {
  const earned = architectTitlesHtml(
    { earned: [{ id: "architect", zh: "王朝缔造者", en: "The Architect" }], progress: { coach: true, gm: true, completed: 2 } },
    "zh",
  );
  assert.match(earned, /data-mw-action="open-legacy-museum"/);
  assert.match(earned, /data-title="architect"/);
  assert.match(earned, /王朝缔造者/);
  const locked = architectTitlesHtml({ earned: [], progress: { coach: true, gm: false, completed: 1 } }, "zh");
  assert.doesNotMatch(locked, /open-legacy-museum/);
});
