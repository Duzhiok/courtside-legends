/**
 * The interview panel (D of docs/CAREER_LIFE_ROADMAP.md): three questions under the offer board.
 * Rendering and clicks only -- the scoring, the verdict and the new terms all come from
 * career/interview.js, so what the panel says happened is exactly what the save records.
 */
import { conductInterview, interviewQuestions } from "../../career/interview.js";
import { teamNameL } from "../../i18n.js";
import { esc, tr } from "./format.js";
import { archetypeLabel } from "./offers.js";

const KEYS = "ABC";

/** What the room sounds like when you walk in: tells you, in-story, what this club wants. */
const OPENERS = {
  rebuild: ["总经理把一沓选秀报告推到你面前：「我们不着急，但要看到方向。」", "The GM slides a stack of draft reports across: \"We're not in a hurry, but we need a direction.\""],
  middle: ["老板开门见山：「我们卡在中间太久了。你打算怎么把我们往上推？」", "The owner gets straight to it: \"We've been stuck in the middle too long. How do you push us up?\""],
  contender: ["三位高管站在去年的季后赛海报下：「窗口就这两年。」", "Three executives stand under last year's playoff poster: \"The window is these two years.\""],
};

function panelHtml(offer, answers, lang) {
  const questions = interviewQuestions(offer).map((question, qi) => {
    const prompt = tr(lang, ...question.prompt);
    const buttons = question.answers.map((answer, ai) => {
      const on = answers[question.id] === answer.id;
      return `<button type="button" class="tt-choice tt-answer${on ? " is-selected" : ""}" role="radio" aria-checked="${on}" data-q="${esc(question.id)}" data-a="${esc(answer.id)}">
        <span class="tt-choice-key" aria-hidden="true">${KEYS[ai]}</span>
        <span class="tt-choice-body"><strong>${esc(tr(lang, ...answer.label))}</strong></span>
      </button>`;
    }).join("");
    return `<li class="tt-question">
      <p class="tt-q-prompt" id="tt-q-${esc(question.id)}"><b aria-hidden="true">${qi + 1}</b><span>${esc(prompt)}</span></p>
      <div class="tt-answers" role="radiogroup" aria-labelledby="tt-q-${esc(question.id)}">${buttons}</div>
    </li>`;
  }).join("");
  const left = interviewQuestions(offer).filter((question) => !answers[question.id]).length;
  const team = teamNameL(offer.teamName, lang);
  return `<div class="tt-interview-head">
      <p class="tt-kicker">${esc(tr(lang, "面试", "Interview"))} · ${esc(archetypeLabel(offer.archetype, lang))}</p>
      <h3>${esc(team)}</h3>
      <p class="tt-prose">${esc(tr(lang, ...(OPENERS[offer.archetype] || OPENERS.middle)))}</p>
      <p class="tt-faint">${esc(tr(lang, "答得契合球队的处境，开局信任更高、压力更小；答得很差可能被婉拒（最后一家不会拒你）。", "Answers that fit the club's situation start you with more trust and less pressure; a poor fit can get you turned down (the last club standing never will)."))}</p>
    </div>
    <ol class="tt-questions">${questions}</ol>
    <div class="tt-interview-actions">
      <button type="button" class="tt-btn tt-btn-ghost" data-act="back">${esc(tr(lang, "换一家", "Try another club"))}</button>
      <button type="button" class="tt-btn tt-btn-ghost" data-act="skip">${esc(tr(lang, "跳过面试，直接接受", "Skip the interview and accept"))}</button>
      <button type="button" class="tt-btn tt-btn-primary" data-act="submit"${left ? " disabled" : ""}>${esc(left
        ? tr(lang, `还差 ${left} 题`, `${left} to go`)
        : tr(lang, "提交面试", "Finish the interview"))}</button>
    </div>`;
}

/**
 * @param {{ lang, panel: Element, getPrologue, setPrologue, onHired(offerId, result), onRejected(offerId, result), onClose(), onSkip(offerId) }} deps
 */
export function createInterviewCard({ lang, panel, getPrologue, setPrologue, onHired, onRejected, onClose, onSkip }) {
  let offerId = null;
  let answers = {};

  const offer = () => getPrologue()?.offers.find((candidate) => candidate.id === offerId);

  function paint() {
    const current = offer();
    if (!current) return close();
    panel.hidden = false;
    panel.innerHTML = panelHtml(current, answers, lang());
  }

  function open(id) {
    offerId = id;
    answers = {};
    paint();
    panel.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }

  function close() {
    offerId = null;
    answers = {};
    panel.hidden = true;
    panel.innerHTML = "";
  }

  panel.onclick = (event) => {
    const answer = event.target.closest(".tt-answer");
    if (answer && panel.contains(answer)) {
      answers = { ...answers, [answer.dataset.q]: answer.dataset.a };
      paint();
      panel.querySelector(`.tt-answer[data-q="${answer.dataset.q}"][data-a="${answer.dataset.a}"]`)?.focus();
      return;
    }
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (act === "back") {
      close();
      onClose?.();
    } else if (act === "skip") {
      // Q2: skip the interview, accept on the offer's own terms -- no scoring, no rejection.
      const id = offerId;
      close();
      onSkip?.(id);
    } else if (act === "submit") {
      const id = offerId;
      const result = conductInterview(getPrologue(), id, answers);
      setPrologue(result.prologue);
      close();
      (result.verdict === "hired" ? onHired : onRejected)(id, result);
    }
  };

  return { open, close, repaint: () => offerId && paint(), isOpen: () => offerId !== null };
}
