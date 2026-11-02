// The HQ's "N points to spend" badge: the coach perks card sits far down the page, so a player with
// unspent points has to be told at the top. Shown only while the points can actually be spent.
import test from "node:test";
import assert from "node:assert/strict";
import { createCoachProfile, withCoachProfile } from "../js/career/coachProfile.js";
import { retireCoach } from "../js/modes/retirement.js";
import { buildCareerReport } from "../js/story/eventEngine.js";
import { careerHeaderHtml } from "../js/ui/timeTravel/hq.js";
import { hqModel } from "../js/ui/timeTravel/viewModel.js";
import { poachReadyRoot, hiredRoot } from "./helpers/careerFixtures.js";

const CJK = /[\u4e00-\u9fff]/;
const header = (root, lang = "zh") => careerHeaderHtml(hqModel(root, buildCareerReport(root), lang), lang);
const withPoints = (n) => withCoachProfile(hiredRoot(50), createCoachProfile({ perkPoints: n }));

test("no unspent points, no badge", () => {
  assert.doesNotMatch(header(withPoints(0)), /tt-perk-badge/);
});

test("points in hand: a gold badge under the level, with the count", () => {
  const html = header(withPoints(2));
  assert.match(html, /<dd>Lv\.1<span class="tt-pill tt-pill-gold tt-perk-badge"[^>]*><span class="tt-perk-full">2 点可用<\/span><span class="tt-perk-short" aria-hidden="true">2 点<\/span><\/span><\/dd>/);
  assert.match(html, /aria-label="2 点可用 — /, "the full wording reaches screen readers even where the short one shows");
});

test("the view-model carries the points straight off the profile", () => {
  assert.equal(hqModel(withPoints(3), buildCareerReport(withPoints(3))).coach.perkPoints, 3);
  assert.equal(hqModel(hiredRoot(50), buildCareerReport(hiredRoot(50))).coach.perkPoints, 0);
});

test("English reads right, singular and plural, and has no Chinese", () => {
  const one = header(withPoints(1), "en");
  assert.match(one, /1 point to spend/);
  assert.match(one, /tt-perk-short" aria-hidden="true">1 pt</);
  assert.match(header(withPoints(4), "en"), /4 points to spend/);
  assert.match(header(withPoints(4), "en"), />4 pts</);
  assert.doesNotMatch(one, CJK);
});

test("a finished career shows no badge (the perks card is hidden then too)", () => {
  const retired = retireCoach({ ...poachReadyRoot(), coach: { ...poachReadyRoot().coach, perkPoints: 2 } });
  assert.doesNotMatch(header(retired), /tt-perk-badge/);
});
