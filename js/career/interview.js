/**
 * The job interview (D of docs/CAREER_LIFE_ROADMAP.md). Before this, "interview" meant picking one of
 * three offers; now the club asks three questions, and how well your answers fit ITS situation
 * (rebuild / middle / contender) moves the trust and media pressure you start with -- or gets you
 * turned down.
 *
 * Pure: questions are data, scoring is arithmetic, conductInterview returns a new prologue.
 * Nobody is ever left with no job: the last offer still standing cannot reject you.
 */
import {
  INTERVIEW_PRESSURE_PER_POINT,
  INTERVIEW_REJECT_AT,
  INTERVIEW_TRUST_PER_POINT,
} from "./balance.js";
import { hashSeed } from "../core/seededRandom.js";

/** fit = how well the answer suits each archetype: -1 clashes, 0 neutral, +1 is what they want.
 * Every question gives every archetype exactly one of each, so no kind of club is a free pass. */
export const INTERVIEW_QUESTIONS = Object.freeze([
  {
    id: "roster",
    prompt: ["你怎么看我们现在的阵容？", "How do you read this roster?"],
    answers: [
      { id: "tear-down", label: ["该推倒重来：攒年轻人和选秀权", "Tear it down: stockpile youth and picks"], fit: { rebuild: 1, middle: -1, contender: -1 } },
      { id: "patch", label: ["核心不动，缺什么补什么", "Keep the core, fill the holes"], fit: { rebuild: 0, middle: 1, contender: 0 } },
      { id: "win-now", label: ["这套阵容今年就能冲", "This group can push for it this year"], fit: { rebuild: -1, middle: 0, contender: 1 } },
    ],
  },
  {
    id: "timeline",
    prompt: ["老板要的是今年的成绩，还是三年后的球队？", "Does the owner want results this year, or a team three years out?"],
    answers: [
      { id: "now", label: ["今年就交成绩单", "Results this season"], fit: { rebuild: -1, middle: 0, contender: 1 } },
      { id: "two-years", label: ["给我两年，先进季后赛", "Give me two years; playoffs first"], fit: { rebuild: 0, middle: 1, contender: 0 } },
      { id: "foundation", label: ["先打地基，三年后再看", "Lay the foundation; judge me in three"], fit: { rebuild: 1, middle: -1, contender: -1 } },
    ],
  },
  {
    id: "resources",
    prompt: ["你最需要管理层给你什么？", "What do you need most from the front office?"],
    answers: [
      { id: "scouting", label: ["球探和球员发展预算", "Scouting and player-development budget"], fit: { rebuild: 1, middle: -1, contender: -1 } },
      { id: "authority", label: ["信任：轮换和战术我说了算", "Trust: rotation and tactics are my call"], fit: { rebuild: 0, middle: 1, contender: 0 } },
      { id: "cap-room", label: ["薪资空间，截止日前能补强", "Cap room to add at the deadline"], fit: { rebuild: -1, middle: 0, contender: 1 } },
    ],
  },
]);

/**
 * The questions as this club asks them: same three questions, answers in an order fixed by the offer
 * id (so a reload shows the same card) but different between offers -- "always pick B" never works.
 */
export function interviewQuestions(offer) {
  return INTERVIEW_QUESTIONS.map((question) => {
    const shift = hashSeed(`${offer.id}|${question.id}`) % question.answers.length;
    return { ...question, answers: [...question.answers.slice(shift), ...question.answers.slice(0, shift)] };
  });
}

/** answers = { [questionId]: answerId }. Throws unless every question has a known answer. */
export function scoreInterview(offer, answers) {
  const perQuestion = INTERVIEW_QUESTIONS.map((question) => {
    const answer = question.answers.find((candidate) => candidate.id === answers?.[question.id]);
    if (!answer) throw new RangeError(`interview question "${question.id}" has no valid answer`);
    return { questionId: question.id, answerId: answer.id, fit: answer.fit[offer.archetype] ?? 0 };
  });
  return { score: perQuestion.reduce((sum, row) => sum + row.fit, 0), perQuestion };
}

/** What the answers would do to this offer: the numbers the UI shows are the numbers applied. */
export function interviewEffects(score) {
  return { trust: score * INTERVIEW_TRUST_PER_POINT, pressure: -score * INTERVIEW_PRESSURE_PER_POINT };
}

/** Offers on the board you could still interview for. */
export const openOffers = (prologue) =>
  (prologue.offers || []).slice(0, 3).filter((offer) => !(prologue.rejectedOfferIds || []).includes(offer.id));

/**
 * Sit the interview. Returns { prologue, verdict: "hired"|"rejected", score, perQuestion, effects }.
 * Hired: that offer now carries the adjusted trust / pressure and the interview record, ready for
 * acceptInterviewOffer(). Rejected: the offer is crossed off -- never the last one standing.
 */
export function conductInterview(prologue, offerId, answers) {
  if (prologue?.selectedOfferId) throw new Error("an offer was already accepted");
  const offer = openOffers(prologue).find((candidate) => candidate.id === offerId);
  if (!offer) throw new RangeError("that offer is not open for an interview");
  // Its terms already carry this interview's effects; a second sitting would count them twice.
  if (offer.interview) throw new Error("you already passed this interview");
  const { score, perQuestion } = scoreInterview(offer, answers);
  const effects = interviewEffects(score);
  const lastChance = openOffers(prologue).length <= 1;
  if (score <= INTERVIEW_REJECT_AT && !lastChance) {
    return {
      prologue: { ...prologue, rejectedOfferIds: [...(prologue.rejectedOfferIds || []), offerId] },
      verdict: "rejected",
      score,
      perQuestion,
      effects,
    };
  }
  const hired = {
    ...offer,
    trust: offer.trust + effects.trust,
    pressure: offer.pressure + effects.pressure,
    interview: { score, answers: perQuestion.map(({ questionId, answerId }) => ({ questionId, answerId })) },
  };
  return {
    prologue: { ...prologue, offers: prologue.offers.map((candidate) => (candidate.id === offerId ? hired : candidate)) },
    verdict: "hired",
    score,
    perQuestion,
    effects,
  };
}
