// B7: the views a retirement draws -- the lifetime tiles, the "retire?" preview, the verdict banner,
// the stint strip and the whole-career share card. Real engine for the card, plain objects elsewhere.
import test from "node:test";
import assert from "node:assert/strict";
import { buildLegacy, LEGACY_TIERS } from "../js/career/legacy.js";
import { retireCoach } from "../js/modes/retirement.js";
import { buildCareerReport } from "../js/story/eventEngine.js";
import { buildEndingShareCard, renderEndingShareCardHtml, shareCardText } from "../js/story/endingShareCard.js";
import { stintCardHtml, verdictHtml } from "../js/ui/timeTravel/epilogue.js";
import { icon } from "../js/ui/timeTravel/icons.js";
import { legacyTierLabel, legacyTilesHtml, retirePreviewHtml } from "../js/ui/timeTravel/legacy.js";
import { careerHeaderHtml } from "../js/ui/timeTravel/hq.js";
import { hqModel } from "../js/ui/timeTravel/viewModel.js";
import { firedRoot, poachReadyRoot } from "./helpers/careerFixtures.js";

const CJK = /[\u4e00-\u9fff]/;
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const legacy = {
  seasons: 9, wins: 450, losses: 288, winPct: 450 / 738, titles: 2, stints: 3, teams: 2,
  firstYear: 1995, lastYear: 2003, age: 61, reputation: 80, score: 84, tier: "hall-of-fame", hallOfFame: true,
};

test("the lifetime tiles show the four numbers, the years, the age and the score", () => {
  const zh = textOf(legacyTilesHtml(legacy, "zh"));
  for (const part of ["9", "450-288", "61.0%", "2", "1995–2003", "61 岁", "生涯评分 84", "总冠军"]) assert.ok(zh.includes(part), `zh: ${part} in ${zh}`);
  const en = textOf(legacyTilesHtml(legacy, "en"));
  assert.ok(en.includes("age 61") && en.includes("legacy score 84") && en.includes("titles"));
  assert.doesNotMatch(en, CJK, "English must not contain Chinese");
});

test("unknown pieces are left out, never printed as null / NaN / undefined", () => {
  const html = legacyTilesHtml({ ...legacy, firstYear: null, lastYear: null, age: null }, "en");
  assert.doesNotMatch(html, /null|NaN|undefined/);
  assert.ok(textOf(html).includes("legacy score 84"));
});

test("the retire preview names the tier in both languages and carries the tone for styling", () => {
  const zh = retirePreviewHtml(legacy, "zh");
  assert.ok(zh.includes("名人堂级教头"));
  assert.ok(zh.includes('data-tone="success"'));
  const en = retirePreviewHtml(legacy, "en");
  assert.ok(en.includes("Hall of Fame Coach"));
  assert.doesNotMatch(en, CJK);
  assert.ok(retirePreviewHtml({ ...legacy, tier: "brief" }, "zh").includes('data-tone="neutral"'));
});

test("an unknown tier id falls back to a neutral label, never the raw id", () => {
  assert.equal(legacyTierLabel("nope", "zh"), "生涯总评");
  assert.equal(legacyTierLabel("nope", "en"), "Career verdict");
  for (const id of Object.keys(LEGACY_TIERS)) assert.notEqual(legacyTierLabel(id, "zh"), id);
});

test("the verdict banner for a retirement: 'Retired' kicker, the age note, a trophy only for a proud career", () => {
  const proud = verdictHtml({ status: "retired", tone: "success", tierLabel: "", endingLabel: "名人堂级教头", note: "61 岁，自己决定挂靴" }, "zh");
  assert.ok(proud.includes("已退休") && proud.includes("61 岁，自己决定挂靴") && proud.includes("名人堂级教头"));
  assert.ok(proud.includes(icon("trophy", { size: 26 })));
  const modest = verdictHtml({ status: "retired", tone: "neutral", tierLabel: "", endingLabel: "昙花一现", note: "x" }, "zh");
  assert.ok(!modest.includes(icon("trophy", { size: 26 })), "a brief career doesn't get a trophy");
  assert.ok(verdictHtml({ status: "retired", tone: "neutral", endingLabel: "A Brief Chapter" }, "en").includes("Retired"));
});

test("a retired stint in the strip is labelled and styled as retired, not fired", () => {
  const stint = { teamId: "LAL", startYear: 1995, seasons: 3, wins: 150, losses: 96, championships: 1, reason: "retired" };
  const html = stintCardHtml(stint, { teamName: "湖人", colors: { primary: "#552583", secondary: "#fdb927" } }, "zh");
  assert.ok(html.includes('data-reason="retired"'));
  assert.ok(html.includes("已退休"));
  assert.ok(!html.includes("被解雇"));
});

// ------------------------------------------------------------------ the whole-career share card
const earlierJob = { teamId: "BOS", startYear: 1988, endYear: 1993, seasons: 5, wins: 230, losses: 180, championships: 1, reason: "departed" };
const retiredWithTwoJobs = () => {
  const root = poachReadyRoot();
  return retireCoach({ ...root, coach: { ...root.coach, stints: [earlierJob] } });
};
const retiredOneJob = () => retireCoach(poachReadyRoot());

test("a not-yet-retired career has no legacy in its report (the old single-stint card is unchanged)", () => {
  assert.equal(buildCareerReport(poachReadyRoot()).legacy, null);
});

test("the retired card covers the WHOLE career: every job, lifetime record, clubs, rating", () => {
  const root = retiredWithTwoJobs();
  const card = buildEndingShareCard(root);
  const life = buildLegacy(root.coach);
  assert.equal(card.legacy.score, life.score);
  assert.equal(card.stints.length, 2, "one row per finished job");
  assert.deepEqual(card.record, { w: life.wins, l: life.losses, pct: life.winPct });
  assert.equal(card.championships, life.titles);
  assert.equal(card.seasonCount, life.seasons);
  assert.equal(card.yearSpan, `${life.firstYear}–${life.lastYear}`);
  assert.deepEqual(card.signatureTrades, [], "trades only know the last job, so they're left off");
  assert.equal(card.ending.id, "retired");
});

test("the retired card text lists each job and the retirement line, in Chinese and in English", () => {
  const card = buildEndingShareCard(retiredWithTwoJobs());
  const zh = shareCardText(card, "zh");
  assert.ok(zh.includes("生涯战绩") && zh.includes("退休：") && zh.includes("生涯评分"));
  for (const row of card.stints) assert.ok(zh.includes(row.span), `zh text lists ${row.span}`);
  assert.equal(zh.split("\n").length, 3 + card.stints.length + 1, "title, span, record, one line per job, retirement");
  const en = shareCardText(card, "en");
  assert.ok(en.includes("Career record") && en.includes("Retirement:") && en.includes("legacy score"));
  assert.doesNotMatch(en, CJK, `English share text leaked Chinese:\n${en}`);
});

test("the retired card HTML: per-job rows, clubs in the subtitle, no Chinese in English", () => {
  const card = buildEndingShareCard(retiredWithTwoJobs());
  const zh = renderEndingShareCardHtml(card, "zh");
  assert.ok(zh.includes("逐段履历") && zh.includes("2 支球队"));
  assert.equal((zh.match(/<li><span>/g) || []).length, 2);
  const en = renderEndingShareCardHtml(card, "en");
  assert.ok(en.includes("Career by job") && en.includes("2 clubs"));
  assert.doesNotMatch(textOf(en), CJK, `English card leaked Chinese: ${textOf(en)}`);
});

test("a single-job career names the club in the subtitle instead of '1 clubs'", () => {
  const card = buildEndingShareCard(retiredOneJob());
  assert.equal(card.stints.length, 1);
  assert.ok(card.teamName, "one club: it has a name");
  assert.doesNotMatch(renderEndingShareCardHtml(card, "en"), /1 clubs/);
  assert.doesNotMatch(textOf(renderEndingShareCardHtml(card, "en")), CJK);
});

test("forced and voluntary retirement read differently on the card", () => {
  const forced = retireCoach({ ...poachReadyRoot(), coach: { ...poachReadyRoot().coach, age: 70 } }, "forced");
  assert.ok(shareCardText(buildEndingShareCard(forced), "en").includes("the age limit"));
  assert.ok(shareCardText(buildEndingShareCard(retiredOneJob()), "en").includes("by choice"));
});

test("the HQ badge: a retirement is gold, a firing stays red (retiring is not a warning)", () => {
  const badge = (root, lang = "zh") => careerHeaderHtml(hqModel(root, buildCareerReport(root), lang), lang);
  const retired = badge(retireCoach(poachReadyRoot()));
  assert.match(retired, /tt-pill tt-pill-gold">已退休/);
  assert.doesNotMatch(retired, /tt-pill-alert/);
  const fired = badge(firedRoot(70));
  assert.match(fired, /tt-pill tt-pill-alert">已被解雇/);
  assert.match(badge(retireCoach(poachReadyRoot()), "en"), /tt-pill-gold">Retired/);
});

test("the retired card's job rows use their own wide layout (a year span must not wrap)", () => {
  const html = renderEndingShareCardHtml(buildEndingShareCard(retiredWithTwoJobs()), "zh");
  assert.match(html, /class="share-card-seasons share-card-jobs"/);
});
