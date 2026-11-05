/**
 * The opening decision -- how to use what you know about the future -- including D's draft prophecy:
 * "share a draft sleeper" only lands once you have put a real name on it. Split out of screen.js
 * the same way the poach / finance / retire cards are.
 */
import { pledgeProphecy, prophecyBoard } from "../../career/draftProphecy.js";
import { futureKnowledgeEffects, resolveFutureKnowledgeChoice } from "../../modes/timeTravelCareer.js";
import { queueStoryEvent } from "../../story/eventEngine.js";
import { $ } from "./dom.js";
import { choiceDeckHtml, confirmBarHtml, mountDeck } from "./choices.js";
import { INTRO_CHOICES } from "./copy.js";
import { tr } from "./format.js";
import { createProphecyPicker } from "./prophecyCard.js";

/** @param {{ state, lang, setStatus, commit, currentRootState, renderScreen, focusDecision }} deps */
export function createIntroCard({ state, lang, setStatus, commit, currentRootState, renderScreen, focusDecision }) {
  const SLEEPER = "share-draft-sleeper";
  const introDeck = () => $("#time-travel-decision-choices");
  const introConfirm = () => $("#time-travel-decision > .tt-confirm-slot");
  const prophecyPicker = createProphecyPicker({
    lang,
    scope: $("#tt-prophecy-pick"),
    onPledge: (bref) => resolveIntro(SLEEPER, bref),
    onBack: () => renderIntro(),
  });

  /** D: naming the sleeper -- the choice only lands once you have put a name on it. */
  function openProphecyPicker(board) {
    introDeck().hidden = true;
    introConfirm().hidden = true;
    prophecyPicker.open(board);
  }

  function renderIntro() {
    const l = lang();
    const card = $("#time-travel-decision");
    card.hidden = state.story?.pendingDecision !== "future-knowledge-intro";
    if (card.hidden) return prophecyPicker.close();
    const board = prophecyBoard(currentRootState());
    if (prophecyPicker.isOpen() && board.length) return openProphecyPicker(board); // e.g. a language switch
    prophecyPicker.close();
    introDeck().hidden = false;
    introConfirm().hidden = false;
    introDeck().innerHTML = choiceDeckHtml(INTRO_CHOICES.map((choice) => ({
      id: choice.id,
      label: tr(l, ...choice.label),
      description: tr(l, ...choice.description) + (choice.id === SLEEPER
        ? " " + (board.length
          ? tr(l, "（接下来要你说出一个名字。）", "(Next you'll have to name him.)")
          : tr(l, "（这几届里找不到拿得准的遗珠，只按上面的数值生效。）", "(No sleeper in these classes you could vouch for: only the numbers below apply.)"))
        : ""),
      effects: futureKnowledgeEffects(choice.id),
    })), { attr: "data-story-choice", lang: l });
    introConfirm().innerHTML = confirmBarHtml(l);
    mountDeck(card, {
      idOf: (el) => el.dataset.storyChoice,
      labelOf: (el) => el.querySelector("strong").textContent,
      confirmText: (label) => tr(l, `就这么定：「${label}」。这个决定无法撤回。`, `Lock in "${label}". This can't be undone.`),
      onConfirm: (choiceId) => (choiceId === SLEEPER && board.length ? openProphecyPicker(board) : resolveIntro(choiceId)),
    });
  }

  function resolveIntro(choiceId, prophecyBref = null) {
    if (state.story?.pendingDecision !== "future-knowledge-intro") return;
    try {
      const chosen = resolveFutureKnowledgeChoice(currentRootState(), choiceId);
      const resolved = prophecyBref ? pledgeProphecy(chosen, prophecyBref) : chosen;
      const root = queueStoryEvent(resolved, "first-year-owner-test", { year: resolved.leagueCareer?.season?.year });
      commit(root, tr(lang(), "存档写入失败，这次决定尚未生效", "Save failed — the decision did not take effect"));
      setStatus({ zh: "决定已保存。资源与时间线已更新。", en: "Decision saved. Your resources and the timeline have shifted." });
    } catch (error) {
      setStatus(error?.message || { zh: "无法处理这个决定", en: "Couldn't process that decision" }, true);
    }
    renderScreen();
    focusDecision();
  }

  return { render: renderIntro };
}
