// U-P1-4 / U-P1-5 / U-P1-8 — English mode must not leak Chinese residue where
// the English copy already exists; the views only had to wire it up.
//
// Pins: (1) networkBoardHtml picks labelEn/titleEn/standing labelEn in en
// mode and the Zh originals in zh mode; (2) gradeFilmAnswer /
// filmRecommendation already return explanationEn/suggestionEn, and the
// film-result line in networkViews.js renders the per-language pair (the
// result line itself is DOM-only, so the wiring is pinned by a source
// assertion); (3) a revealed GM clue renders summaryEn with half-width
// parens in en mode and the Zh summary with full-width parens in zh mode;
// (4) the inbox team picker localizes through teamNameL — the picker is
// inner-function + DOM-only, so the wiring is pinned by source assertions
// plus a behavioural check that every 1996-97 historical team name
// localizes to non-Chinese English (including the CHI fallback).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEMO_JOB_BOARD,
  networkBoardHtml,
} from "../js/ui/networkViews.js";
import {
  emptyNetworkProfile,
  generateOpportunities,
} from "../js/career/network/careerOpportunities.js";
import {
  filmRecommendation,
  gradeFilmAnswer,
} from "../js/career/network/videoAnalyst.js";
import { gmBusinessHtml } from "../js/ui/gmBusinessView.js";
import { createExecutiveScenario } from "../js/career/gm/businessScenario.js";
import { revealClue } from "../js/career/gm/futureKnowledge.js";
import { historicalSeason } from "../js/data/historicalSeasons.js";
import { teamNameL } from "../js/i18n.js";

const NETWORK_SRC = readFileSync(new URL("../js/ui/networkViews.js", import.meta.url), "utf8");
const INBOX_SRC = readFileSync(new URL("../js/ui/careerInboxView.js", import.meta.url), "utf8");

const CJK = /[\u4e00-\u9fff]/;

function boardHtml(lang) {
  const profile = emptyNetworkProfile({ role: "scout", team: "LAL" });
  const { offers } = generateOpportunities(profile, DEMO_JOB_BOARD, { seed: 5 });
  return networkBoardHtml({ profile, offers, unemployedNote: null, lang });
}

test("U-P1-4: network board shows English role, standing and offer titles in en mode", () => {
  const en = boardHtml("en");
  assert.ok(en.includes("Scout"), "current role uses labelEn");
  assert.ok(en.includes("Known"), "reputation 40 standing uses labelEn");
  assert.ok(!en.includes("球探"), "no Chinese role label in en mode");
  assert.ok(!en.includes("小有名气"), "no Chinese standing label in en mode");
  assert.ok(en.includes("Video Analyst"), "offer title uses titleEn");
  assert.ok(!en.includes("录像分析师"), "no Chinese offer title in en mode");
});

test("U-P1-4: network board keeps the Chinese labels in zh mode", () => {
  const zh = boardHtml("zh");
  assert.ok(zh.includes("球探"), "current role uses labelZh");
  assert.ok(zh.includes("小有名气"), "reputation 40 standing uses labelZh");
  assert.ok(!zh.includes(">Scout<") && !zh.includes("· Scout"), "no English role label in zh mode");
});

test("U-P1-4: film grade and recommendation carry English copy, and the view wires it", () => {
  const challenge = {
    id: "film-1",
    correctOptionId: "opt-0",
    correctKind: "cold-shooter",
    options: [
      { id: "opt-0", kind: "cold-shooter", titleZh: "冷手射手", titleEn: "Cold shooter", summaryZh: "对手射手手感冰凉", summaryEn: "The opposing shooter has gone cold" },
      { id: "opt-1", kind: "turnover-prone", titleZh: "失误大户", titleEn: "Turnover-prone", summaryZh: "对手失误频频", summaryEn: "The opponent keeps turning it over" },
    ],
  };
  const grade = gradeFilmAnswer(challenge, "opt-0");
  assert.ok(grade.explanationEn.startsWith("Correct:"), "correct-answer explanation has an En version");
  assert.ok(!CJK.test(grade.explanationEn), "En explanation has no Chinese characters");
  const rec = filmRecommendation(challenge, "opt-0");
  assert.ok(rec.suggestionEn.startsWith("Recommend exploiting:"), "recommendation has an En version");
  assert.ok(!CJK.test(rec.suggestionEn), "En suggestion has no Chinese characters");
  assert.ok(NETWORK_SRC.includes("grade.explanationEn || grade.explanationZh"), "film result renders explanationEn in en mode");
  assert.ok(NETWORK_SRC.includes("rec.suggestionEn || rec.suggestionZh"), "film result renders suggestionEn in en mode");
  assert.ok(NETWORK_SRC.includes('filmParens'), "film result uses per-language parens");
});

const card = (bref, season, rating, ppg = 10, name = "Test Player") => ({
  bref, name, season, team: "VAN", pos: "SG",
  three: rating, mid: rating, paint: rating, scoring: rating, pass: rating,
  iq: rating, defense: rating, steal: rating, block: rating, rebound: rating,
  speed: rating, strength: rating, stamina: rating, clutch: rating,
  raw: { ppg },
});
const draftPlayers = [
  card("sleep01", 1997, 55, 8, "Sleeper One"), card("sleep01", 1998, 85, 22, "Sleeper One"), card("sleep01", 1999, 88, 26, "Sleeper One"),
  card("dec01", 1997, 55, 9, "Decoy One"), card("dec01", 1998, 60, 12, "Decoy One"), card("dec01", 1999, 60, 11, "Decoy One"),
  card("dec02", 1998, 55, 7, "Decoy Two"), card("dec02", 1999, 58, 10, "Decoy Two"), card("dec02", 2000, 60, 9, "Decoy Two"),
];

function revealedClueState() {
  const s = createExecutiveScenario({ players: draftPlayers });
  assert.ok(s.knowledge.clues.length > 0, "scenario ships a board clue");
  const knowledge = revealClue(s.knowledge, s.knowledge.clues[0].id);
  return { ...s, knowledge };
}

test("U-P1-5: revealed GM clue renders summaryEn with half-width parens in en mode", () => {
  const state = revealedClueState();
  const en = gmBusinessHtml(state, { lang: "en" });
  assert.ok(en.includes("Your future memory leaves only three blurry names"), "clue body uses summaryEn");
  assert.ok(en.includes("(Clear memory)"), "reliability band uses half-width parens in en mode");
  assert.ok(!en.includes("你的未来记忆"), "no Chinese clue body in en mode");
  assert.ok(!en.includes("记忆清晰"), "no Chinese band label in en mode");
});

test("U-P1-5: revealed GM clue keeps the Zh summary with full-width parens in zh mode", () => {
  const state = revealedClueState();
  const zh = gmBusinessHtml(state, { lang: "zh" });
  assert.ok(zh.includes("你的未来记忆在接下来的选秀里只留下三个模糊的名字"), "clue body uses summary in zh mode");
  assert.ok(zh.includes("（记忆清晰）"), "reliability band uses full-width parens in zh mode");
});

test("U-P1-8: inbox team picker localizes through teamNameL", () => {
  assert.ok(INBOX_SRC.includes("teamOptions(l)"), "picker passes the current language");
  assert.ok(INBOX_SRC.includes("teamNameL(team.name, lang)"), "team names go through teamNameL");
  assert.ok(INBOX_SRC.includes('teamNameL("公牛", lang)'), "CHI fallback goes through teamNameL");
  assert.equal(teamNameL("公牛", "en"), "Bulls", "fallback team localizes");
  const season = historicalSeason(1997);
  assert.ok((season?.teams || []).length > 0, "1996-97 season has teams");
  for (const team of season.teams) {
    const en = teamNameL(team.name, "en");
    assert.ok(!CJK.test(en), `${team.id} localizes to ${en}`);
  }
});
