import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { YEAR } from "./helpers/careerFixtures.js";
import { conductInterview, INTERVIEW_QUESTIONS } from "../js/career/interview.js";
import { acceptInterviewOffer, createTimeTravelPrologue, resolveFutureKnowledgeChoice } from "../js/modes/timeTravelCareer.js";
import { pledgeProphecy, prophecyBoard } from "../js/career/draftProphecy.js";
import { seasonToCard } from "../js/data/players.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const REAL = ROWS.map(seasonToCard);

const prologue = () => createTimeTravelPrologue({ year: YEAR, philosophy: "analytics", seed: 7 });
const byArchetype = (p, archetype) => p.offers.find((offer) => offer.archetype === archetype);

/** The answer to every question whose fit for `archetype` is `fit` (the same fit across the board). */
function answersWithFit(archetype, fits) {
  return Object.fromEntries(INTERVIEW_QUESTIONS.map((question, index) => [
    question.id,
    question.answers.find((answer) => answer.fit[archetype] === fits[index]).id,
  ]));
}

// Q2 (user, 2026-11-09): the interview is the default, but "跳过面试，直接接受" must always be
// there. Skipping hires on the offer's own terms: no interview bonus, no interview penalty, and
// nothing about the opening decision that follows changes.

test("skip: neutral terms -- the offer's own trust/pressure, no interview in the log", () => {
  const p = prologue();
  const offer = byArchetype(p, "contender");
  const root = acceptInterviewOffer(p, offer.id);
  assert.equal(root.story.frontOfficeTrust, offer.trust);
  assert.equal(root.story.mediaPressure, offer.pressure);
  assert.ok(!root.story.eventLog.some((entry) => entry.type === "interview"));
  assert.equal(root.story.pendingDecision, "future-knowledge-intro");
});

test("skip: no rejection is possible -- an offer its interview would turn down still hires", () => {
  const p = prologue();
  const offer = byArchetype(p, "contender");
  const bad = answersWithFit("contender", [-1, -1, -1]);
  assert.equal(conductInterview(p, offer.id, bad).verdict, "rejected", "the interview itself would turn this down");
  const root = acceptInterviewOffer(p, offer.id);
  assert.equal(root.story.frontOfficeTrust, offer.trust, "skipping hires on the offer's own terms");
});

test("skip: the Future Knowledge / Prophecy sequence still follows", () => {
  const p = prologue();
  const root = acceptInterviewOffer(p, p.offers[1].id);
  const shared = resolveFutureKnowledgeChoice(root, "share-draft-sleeper");
  const board = prophecyBoard(shared, REAL);
  assert.equal(board.length, 3);
  const pledged = pledgeProphecy(shared, board[0].bref, REAL);
  assert.equal(pledged.story.prophecy.status, "pending");
  assert.equal(pledged.story.prophecy.bref, board[0].bref);
});
