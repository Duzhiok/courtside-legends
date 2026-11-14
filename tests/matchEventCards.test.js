import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_EVENT_FAMILIES,
  matchEventFamilyLabel,
  validateMatchEvent,
  matchEventToastHtml,
  matchEventCardHtml,
  matchEventSheetHtml,
  matchEventHistoryHtml,
} from "../js/ui/matchEventCards.js";

const takeover = {
  id: "evt-takeover-1", family: "takeover", severity: "decision",
  title: { zh: "卢卡想接管进攻", en: "Luka wants the ball" },
  body: { zh: "他连续两回合要球，认为自己能打穿对位。", en: "He has asked for the ball two possessions in a row." },
  clock: "Q4 · 02:11",
  score: { home: 98, away: 101, homeName: "独行侠", awayName: "湖人" },
  player: { name: "Luka Dončić", pos: "PG" },
  choices: [
    { id: "give-ball", label: { zh: "把球给他", en: "Give him the ball" }, hint: { zh: "接下来三回合由他主攻", en: "He runs the next three possessions" }, recommended: true },
    { id: "stay", label: { zh: "按战术打", en: "Stick to the plan" }, hint: { zh: "保持现有体系", en: "Keep the current system" } },
    { id: "ignore", label: { zh: "忽略", en: "Ignore" }, hint: { zh: "不做改变", en: "No change" } },
  ],
  defaultChoiceId: "ignore",
};
const weakness = {
  id: "evt-weakness-1", family: "weakness", severity: "info",
  title: { zh: "对方换防出现空档", en: "Their switch leaves a gap" },
  body: { zh: "对方大个子换防到外线，底角暂时没人。", en: "Their big is switched out to the perimeter." },
  clock: "Q2 · 07:32", score: { home: 54, away: 50 },
};
const foul = {
  id: "evt-foul-1", family: "foulTrouble", severity: "decision",
  title: { zh: "穆托姆博 5 犯了", en: "Mutombo has 5 fouls" },
  body: { zh: "再犯一次就毕业，第三节还剩 6 分钟。", en: "One more and he fouls out, with 6 minutes left in the third." },
  clock: "Q3 · 06:00",
  player: { name: "Dikembe Mutombo", pos: "C", fouls: 5 },
  choices: [
    { id: "bench", label: { zh: "先换下他", en: "Sit him for now" }, hint: { zh: "留到末节", en: "Save him for the fourth" }, recommended: true },
    { id: "keep", label: { zh: "留在场上", en: "Keep him in" }, hint: { zh: "赌他不犯规", en: "Bet he stays clean" } },
    { id: "ignore", label: { zh: "忽略", en: "Ignore" } },
  ],
  defaultChoiceId: "ignore",
};

test("the three MVP families exist with bilingual labels", () => {
  assert.deepEqual(MATCH_EVENT_FAMILIES, ["takeover", "weakness", "foulTrouble"]);
  assert.equal(matchEventFamilyLabel("takeover", "zh"), "球星接管");
  assert.equal(matchEventFamilyLabel("weakness", "en"), "Opponent weakness");
  assert.equal(matchEventFamilyLabel("foulTrouble", "en"), "Foul trouble");
});

test("validation: decisions need an id, a known family and choices (including Ignore)", () => {
  assert.equal(validateMatchEvent(takeover).ok, true);
  assert.equal(validateMatchEvent(weakness).ok, true);
  assert.equal(validateMatchEvent({ ...takeover, id: "" }).ok, false);
  assert.equal(validateMatchEvent({ ...takeover, family: "injury" }).ok, false);
  assert.equal(validateMatchEvent({ ...takeover, choices: [] }).ok, false);
  assert.equal(validateMatchEvent({ ...weakness, severity: "decision" }).ok, false);
  assert.equal(validateMatchEvent(null).ok, false);
});

test("toast: small notification with family, title and dismiss — no choices, no court cover", () => {
  const html = matchEventToastHtml(weakness, "zh");
  assert.match(html, /mev-toast mev-fam-weakness/);
  assert.match(html, /对手弱点/);
  assert.match(html, /对方换防出现空档/);
  assert.match(html, /data-act="mev-dismiss"/);
  assert.doesNotMatch(html, /mev-choice/);
  assert.equal(matchEventToastHtml({ ...weakness, id: "" }), "", "invalid event renders nothing");
});

test("decision card: choices with recommended, default and disabled states, plus game context", () => {
  const html = matchEventCardHtml(takeover, "zh");
  assert.match(html, /mev-card mev-fam-takeover/);
  assert.match(html, /卢卡想接管进攻/);
  assert.match(html, /Q4 · 02:11/);
  assert.match(html, /独行侠 98–101 湖人/);
  assert.match(html, /Luka Dončić · PG/);
  assert.match(html, /data-choice="give-ball"/);
  assert.match(html, /★ 推荐/);
  assert.match(html, /\(默认\)/);
  assert.match(html, /data-choice="ignore"/, "Ignore is a real choice, not a UI invention");
  const foulHtml = matchEventCardHtml({
    ...foul,
    choices: [...foul.choices, { id: "hack", label: "砍他", disabled: true, disabledReason: { zh: "没有暂停了", en: "No timeouts left" } }],
  }, "zh");
  assert.match(foulHtml, /data-choice="hack" disabled/);
  assert.match(foulHtml, /没有暂停了/);
  assert.match(foulHtml, /Dikembe Mutombo · C · 5 犯/);
});

test("decision card in English carries no Chinese residue", () => {
  const html = matchEventCardHtml(takeover, "en");
  assert.match(html, /Star takeover/);
  assert.match(html, /\(default\)/);
  assert.match(html, /★ pick/);
  assert.doesNotMatch(html, /球星接管|推荐|默认|忽略/);
});

test("bottom sheet: score and clock stay in the header, same choices as the card", () => {
  const html = matchEventSheetHtml(takeover, "zh");
  assert.match(html, /mev-sheet mev-fam-takeover/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /mev-sheet-score/);
  assert.match(html, /独行侠 <b>98<\/b>/);
  assert.match(html, /<b>101<\/b> 湖人/);
  assert.match(html, /Q4 · 02:11/);
  assert.match(html, /data-choice="give-ball"/);
  assert.match(html, /data-choice="ignore"/);
  assert.match(html, /mev-sheet-handle/);
});

test("history: decisions and outcomes on one line each, ignored events marked, empty is honest", () => {
  const html = matchEventHistoryHtml([
    { ...takeover, choiceLabel: "把球给他", outcome: { zh: "连得 6 分", en: "Scored 6 straight" } },
    { ...weakness, choiceLabel: null },
  ], "zh");
  assert.match(html, /把球给他/);
  assert.match(html, /连得 6 分/);
  assert.match(html, /已忽略/);
  assert.match(matchEventHistoryHtml([], "zh"), /本场还没有触发事件/);
  assert.match(matchEventHistoryHtml([], "en"), /No events yet this game/);
});

test("user strings are escaped in every surface", () => {
  const evil = { ...weakness, title: "<script>alert(1)</script>", body: "<b>bold</b>" };
  for (const html of [matchEventToastHtml(evil), matchEventCardHtml({ ...evil, severity: "decision", choices: [{ id: "ignore", label: "x" }] }), matchEventSheetHtml({ ...evil, severity: "decision", choices: [{ id: "ignore", label: "x" }] })]) {
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  }
});
