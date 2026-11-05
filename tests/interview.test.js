import test from "node:test";
import assert from "node:assert/strict";
import { YEAR } from "./helpers/careerFixtures.js";
import { conductInterview, INTERVIEW_QUESTIONS, interviewQuestions, openOffers, scoreInterview } from "../js/career/interview.js";
import { INTERVIEW_PRESSURE_PER_POINT, INTERVIEW_TRUST_PER_POINT } from "../js/career/balance.js";
import { acceptInterviewOffer, createTimeTravelPrologue } from "../js/modes/timeTravelCareer.js";

const prologue = () => createTimeTravelPrologue({ year: YEAR, philosophy: "analytics", seed: 7 });
const byArchetype = (p, archetype) => p.offers.find((offer) => offer.archetype === archetype);

/** The answer to every question whose fit for `archetype` is `fit` (the same fit across the board). */
function answersWithFit(archetype, fits) {
  return Object.fromEntries(INTERVIEW_QUESTIONS.map((question, index) => [
    question.id,
    question.answers.find((answer) => answer.fit[archetype] === fits[index]).id,
  ]));
}

test("every club asks the same three questions, answers in its own fixed order", () => {
  const p = prologue();
  const orders = p.offers.map((offer) => interviewQuestions(offer).map((q) => q.answers.map((a) => a.id).join(",")).join("|"));
  for (const offer of p.offers) {
    const asked = interviewQuestions(offer);
    assert.deepEqual(asked.map((q) => q.id), INTERVIEW_QUESTIONS.map((q) => q.id));
    asked.forEach((q, i) => assert.deepEqual([...q.answers.map((a) => a.id)].sort(), INTERVIEW_QUESTIONS[i].answers.map((a) => a.id).sort()));
    assert.deepEqual(interviewQuestions(offer), asked, "a reload shows the same card");
  }
  assert.ok(new Set(orders).size > 1, "different clubs do not share one answer order (no 'always pick B')");
});

test("each question has exactly one answer each archetype loves, one it shrugs at, one it hates", () => {
  for (const question of INTERVIEW_QUESTIONS) {
    for (const archetype of ["rebuild", "middle", "contender"]) {
      const fits = question.answers.map((answer) => answer.fit[archetype]).sort();
      assert.deepEqual(fits, [-1, 0, 1], `${question.id}/${archetype}: one of each, so no club is a free pass`);
    }
  }
});

test("scoring reads the club's situation: the same answers please a rebuild and sink a contender", () => {
  const p = prologue();
  const youthFirst = { roster: "tear-down", timeline: "foundation", resources: "scouting" };
  assert.equal(scoreInterview(byArchetype(p, "rebuild"), youthFirst).score, 3);
  assert.equal(scoreInterview(byArchetype(p, "contender"), youthFirst).score, -3);
  assert.throws(() => scoreInterview(byArchetype(p, "rebuild"), { roster: "tear-down" }), /no valid answer/);
  assert.throws(() => scoreInterview(byArchetype(p, "rebuild"), { ...youthFirst, resources: "a yacht" }), /no valid answer/);
});

test("a good interview starts you with more trust and less pressure, and the career logs it", () => {
  const p = prologue();
  const offer = byArchetype(p, "middle");
  const result = conductInterview(p, offer.id, answersWithFit("middle", [1, 1, 0]));
  assert.equal(result.verdict, "hired");
  assert.equal(result.score, 2);
  const hired = result.prologue.offers.find((o) => o.id === offer.id);
  assert.equal(hired.trust, offer.trust + 2 * INTERVIEW_TRUST_PER_POINT);
  assert.equal(hired.pressure, offer.pressure - 2 * INTERVIEW_PRESSURE_PER_POINT);
  assert.equal(p.offers.find((o) => o.id === offer.id).trust, offer.trust, "the input prologue is untouched");
  assert.throws(() => conductInterview(result.prologue, offer.id, answersWithFit("middle", [1, 1, 1])), /already passed/, "no second sitting: the effects would count twice");

  const root = acceptInterviewOffer(result.prologue, offer.id);
  assert.equal(root.story.frontOfficeTrust, hired.trust);
  assert.equal(root.story.mediaPressure, hired.pressure);
  const logged = root.story.eventLog.find((entry) => entry.type === "interview");
  assert.equal(logged.score, 2);
  assert.equal(logged.teamId, offer.teamId);
  assert.equal(logged.answers.length, 3);
});

test("a bad fit gets you turned down -- the offer is crossed off, the others stay open", () => {
  const p = prologue();
  const offer = byArchetype(p, "contender");
  const result = conductInterview(p, offer.id, answersWithFit("contender", [-1, -1, 0]));
  assert.equal(result.verdict, "rejected");
  assert.deepEqual(result.prologue.rejectedOfferIds, [offer.id]);
  assert.deepEqual(result.prologue.offers, p.offers, "nobody's terms changed");
  assert.equal(openOffers(result.prologue).length, 2);
  assert.throws(() => conductInterview(result.prologue, offer.id, answersWithFit("contender", [1, 1, 1])), /not open/);
});

test("one point above the cut-off is still a job (the boundary)", () => {
  const p = prologue();
  const offer = byArchetype(p, "rebuild");
  assert.equal(conductInterview(p, offer.id, answersWithFit("rebuild", [-1, 0, 0])).verdict, "hired");
});

test("the last offer standing can't turn you down -- you never end up with no job", () => {
  let p = prologue();
  const [first, second, last] = p.offers;
  p = conductInterview(p, first.id, answersWithFit(first.archetype, [-1, -1, -1])).prologue;
  p = conductInterview(p, second.id, answersWithFit(second.archetype, [-1, -1, -1])).prologue;
  const final = conductInterview(p, last.id, answersWithFit(last.archetype, [-1, -1, -1]));
  assert.equal(final.verdict, "hired");
  assert.equal(final.prologue.offers.find((o) => o.id === last.id).trust, last.trust - 3 * INTERVIEW_TRUST_PER_POINT);
});

test("old path: accepting without an interview still works and logs no interview", () => {
  const p = prologue();
  const root = acceptInterviewOffer(p, p.offers[1].id);
  assert.equal(root.story.frontOfficeTrust, p.offers[1].trust);
  assert.ok(!root.story.eventLog.some((entry) => entry.type === "interview"));
  assert.throws(() => conductInterview({ ...p, selectedOfferId: p.offers[1].id }, p.offers[0].id, {}), /already accepted/);
});
