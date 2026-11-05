// Shared QA helpers for D's interview: answer it with chosen fits, straight off the engine's own table
// (so a QA never hard-codes which button scores what -- the answer order is shuffled per offer).
import { INTERVIEW_QUESTIONS } from "../../../js/career/interview.js";

/** answer ids that give `archetype` exactly these fits, e.g. [1, 1, 0] -> score +2 */
export function answersFor(archetype, fits) {
  return INTERVIEW_QUESTIONS.map((question, i) => ({
    q: question.id,
    a: question.answers.find((answer) => answer.fit[archetype] === fits[i]).id,
  }));
}

/** Click the answers into the open interview panel and submit it. */
export async function sitInterview(page, archetype, fits) {
  await page.waitForSelector("#tt-interview:not([hidden]) .tt-answer", { timeout: 10000 });
  for (const { q, a } of answersFor(archetype, fits)) {
    await page.click(`#tt-interview .tt-answer[data-q="${q}"][data-a="${a}"]`);
  }
  await page.click("#tt-interview [data-act=submit]");
}

/** Pick an offer card by archetype and press "go to the interview". */
export async function openInterview(page, archetype) {
  await page.click(`#time-travel-offers .tt-offer[data-archetype="${archetype}"]`);
  await page.click("#tt-offers-zone .tt-confirm [data-act=confirm]");
}
