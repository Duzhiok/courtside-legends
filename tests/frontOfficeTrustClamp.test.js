import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hiredRoot } from "./helpers/careerFixtures.js";
import {
  acceptCareerContract,
  advanceSeasonGoal,
  evaluateCareerEmployment,
} from "../js/modes/careerContract.js";
import { OFFER_TEMPLATES } from "../js/career/contractOffers.js";
import { SEASON_GOAL_TRUST_BONUS } from "../js/career/balance.js";
import { queueStoryEvent, resolveStoryEvent } from "../js/story/eventEngine.js";
import {
  acceptInterviewOffer,
  createTimeTravelPrologue,
  resolveFutureKnowledgeChoice,
  startNewStint,
} from "../js/modes/timeTravelCareer.js";
import { overall, seasonToCard } from "../js/data/players.js";
import {
  pledgeProphecy,
  prophecyBoard,
  settleProphecy,
} from "../js/career/draftProphecy.js";
import { PROPHECY_HIT, PROPHECY_HIT_OVR, PROPHECY_MISS } from "../js/career/balance.js";

// G-P2-10 (2026-11-13 global review): frontOfficeTrust used to be clamped
// inconsistently -- poaching.js already used clamp(..., 0, 100) while the
// other write paths either only floored at 0 or did not clamp at all, so
// trust could drift above 100 (or below 0 from a fresh offer) over many
// seasons. Every write path now clamps to 0..100; these tests pin each one
// at both ends.

// --- careerContract fixtures (same shape as tests/careerContract.test.js) ---
function player(ovr) {
  return { ovr2k: ovr, ratingSource: "anchor" };
}
function league(ovrByTeam) {
  return Object.fromEntries(
    Object.entries(ovrByTeam).map(([id, ovrs]) => [id, { players: ovrs.map(player) }]),
  );
}
const WEAK_LEAGUE = league({
  USER: Array(8).fill(45),
  STRONG: Array(8).fill(95),
  F1: Array(8).fill(55),
  F2: Array(8).fill(60),
  F3: Array(8).fill(65),
  F4: Array(8).fill(70),
  F5: Array(8).fill(75),
  F6: Array(8).fill(80),
  F7: Array(8).fill(85),
});
function summary(year, w, l, championId = "LAL", teamId = "CHI") {
  return { year, teamId, teamName: "Bulls", record: { w, l }, championId };
}
function rootWithHistory(history, seasonOverrides = {}) {
  return {
    leagueCareer: {
      season: { year: 1996, ...seasonOverrides },
      management: { seasonHistory: history },
    },
    story: {
      currentChapter: "year-five",
      frontOfficeTrust: 50,
      mediaPressure: 20,
      timelineDivergence: 5,
      eventLog: [],
      pendingDecision: null,
      employment: { status: "active" },
    },
  };
}
function renewalRoot() {
  const history = Array.from({ length: 5 }, (_, index) => summary(1991 + index, 50, 32));
  return evaluateCareerEmployment(rootWithHistory(history));
}

test("advanceSeasonGoal caps trust at 100 instead of banking the bonus above it", () => {
  const root = rootWithHistory(
    [summary(1995, 55, 27)],
    { year: 1996, teams: WEAK_LEAGUE, userTeamId: "USER" },
  );
  root.story.frontOfficeTrust = 98;
  root.story.seasonGoal = { year: 1995, tier: "rebuild", kind: "win-rate", target: 0.35, label: "x", labelEn: "x", status: "active" };
  const next = advanceSeasonGoal(root);
  assert.equal(next.story.frontOfficeTrust, 100, `98 + ${SEASON_GOAL_TRUST_BONUS} must stop at 100`);
});

test("acceptCareerContract caps trust at 100 on signing", () => {
  const renewal = renewalRoot();
  renewal.story.frontOfficeTrust = 98;
  const accepted = acceptCareerContract(renewal, "rebuild-extension");
  assert.equal(accepted.story.frontOfficeTrust, 100, "98 + 5 must stop at 100");
});

test("acceptCareerContract floors trust at 0 on a trial extension", () => {
  const renewal = renewalRoot();
  const trial = OFFER_TEMPLATES.find((offer) => offer.id === "trial-extension");
  renewal.story.employment.offers = [structuredClone(trial)];
  renewal.story.frontOfficeTrust = 1;
  const accepted = acceptCareerContract(renewal, "trial-extension");
  assert.equal(accepted.story.frontOfficeTrust, 0, "1 - 2 must stop at 0");
});

// --- story event fixtures (same shape as tests/storyEventEngine.test.js) ---
function storyRoot(overrides = {}) {
  return {
    activeMode: "timeTravel",
    leagueCareer: {
      season: { year: 1992 },
      management: { seasonHistory: [] },
    },
    story: {
      startYear: 1991,
      currentChapter: "prologue",
      futureKnowledge: 2,
      frontOfficeTrust: 50,
      mediaPressure: 20,
      timelineDivergence: 0,
      relationships: { owner: 0, gm: 0, coach: 0, players: 0, media: 0 },
      flags: {},
      eventLog: [],
      pendingDecision: null,
      ending: null,
    },
    ...overrides,
  };
}

test("resolveStoryEvent caps trust at 100 and floors it at 0", () => {
  const high = storyRoot();
  high.story.frontOfficeTrust = 98;
  const capped = resolveStoryEvent(
    queueStoryEvent(high, "first-year-owner-test", { year: 1992 }),
    "protect-the-plan",
  );
  assert.equal(capped.story.frontOfficeTrust, 100, "98 + 4 must stop at 100");

  const low = storyRoot();
  low.story.frontOfficeTrust = 1;
  const floored = resolveStoryEvent(
    queueStoryEvent(low, "first-year-owner-test", { year: 1992 }),
    "trade-for-respect",
  );
  assert.equal(floored.story.frontOfficeTrust, 0, "1 - 2 must stop at 0");
});

// --- draft prophecy fixtures (same shape as tests/draftProphecy.test.js) ---
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const REAL = ROWS.map(seasonToCard);
const cardsOf = (bref) => REAL.filter((c) => c.bref === bref).sort((a, b) => a.season - b.season);
const bestEarly = (bref) => {
  const cards = cardsOf(bref);
  return Math.max(...cards.filter((c) => c.season <= cards[0].season + 2).map(overall));
};
function pledgedOn(kind) {
  const root = resolveFutureKnowledgeChoice(hiredRoot(), "share-draft-sleeper");
  const pick = prophecyBoard(root, REAL).find(
    (c) => (bestEarly(c.bref) >= PROPHECY_HIT_OVR) === (kind === "sleeper"),
  );
  return { root: pledgeProphecy(root, pick.bref, REAL), pick };
}

test("settleProphecy caps trust at 100 on a hit and floors it at 0 on a miss", () => {
  const { root: hitRoot } = pledgedOn("sleeper");
  hitRoot.story.frontOfficeTrust = 98;
  const hit = settleProphecy(hitRoot, { year: hitRoot.story.prophecy.judgeYear + 1, players: REAL });
  assert.equal(hit.story.prophecy.status, "hit");
  assert.equal(hit.story.frontOfficeTrust, 100, `98 + ${PROPHECY_HIT.trust} must stop at 100`);

  const { root: missRoot } = pledgedOn("decoy");
  missRoot.story.frontOfficeTrust = 2;
  const miss = settleProphecy(missRoot, { year: missRoot.story.prophecy.judgeYear + 1, players: REAL });
  assert.equal(miss.story.prophecy.status, "miss");
  assert.equal(miss.story.frontOfficeTrust, 0, `2 ${PROPHECY_MISS.trust} must stop at 0`);
});

test("resolveFutureKnowledgeChoice caps trust at 100 and floors it at 0", () => {
  const high = hiredRoot();
  high.story.frontOfficeTrust = 98;
  assert.equal(
    resolveFutureKnowledgeChoice(high, "share-draft-sleeper").story.frontOfficeTrust,
    100,
    "98 + 8 must stop at 100",
  );

  const low = hiredRoot();
  low.story.frontOfficeTrust = 2;
  assert.equal(
    resolveFutureKnowledgeChoice(low, "keep-quiet").story.frontOfficeTrust,
    0,
    "2 - 2 must stop at 0",
  );
});

test("acceptInterviewOffer clamps a hand-built out-of-range offer instead of adopting it", () => {
  const prologue = createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
  const base = prologue.offers[0];
  const lowOffer = { ...base, id: "test-low", trust: -2 };
  const highOffer = { ...base, id: "test-high", trust: 150 };
  assert.equal(
    acceptInterviewOffer({ ...prologue, offers: [lowOffer] }, "test-low").story.frontOfficeTrust,
    0,
    "an offer with trust -2 must start at 0, not -2",
  );
  assert.equal(
    acceptInterviewOffer({ ...prologue, offers: [highOffer] }, "test-high").story.frontOfficeTrust,
    100,
    "an offer with trust 150 must start at 100, not 150",
  );
});

test("startNewStint clamps a hand-built out-of-range offer instead of adopting it", () => {
  const hired = hiredRoot();
  const offer = { teamId: hired.story.employer, teamName: "T", trust: -2, pressure: 0, privileges: [] };
  assert.equal(
    startNewStint(hired, offer).story.frontOfficeTrust,
    0,
    "a re-employment offer with trust -2 must start at 0, not -2",
  );
  assert.equal(
    startNewStint(hired, { ...offer, trust: 150 }).story.frontOfficeTrust,
    100,
    "a re-employment offer with trust 150 must start at 100, not 150",
  );
});

// --- repo-wide guard: no unclamped frontOfficeTrust write may creep back in ---
function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(path));
    else if (entry.name.endsWith(".js")) out.push(path);
  }
  return out;
}

test("every frontOfficeTrust write in js/ is clamped to 0..100", () => {
  const repoJs = new URL("../js/", import.meta.url).pathname;
  const offenders = [];
  for (const file of jsFiles(repoJs)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("frontOfficeTrust:")) return;
      // buildCareerReport's snapshot is a read, not a write to the story.
      if (line.includes("frontOfficeTrust: root.story.frontOfficeTrust || 0,")) return;
      if (!line.includes("clamp(")) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], "unclamped frontOfficeTrust writes");
});
