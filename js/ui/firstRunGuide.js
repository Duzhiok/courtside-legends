/**
 * First-run game guide (B97 walkthrough follow-up, user-directed 2026-11-27):
 * one quick intro the first time the player lands on home — what the game is,
 * the core loop in four short steps, and where the modes live. One tap
 * dismisses it; it never traps a new player.
 *
 * Seen-state reuses the firstRunTip pattern (localStorage key, in-memory
 * session fallback when storage throws) with its own key — never the
 * play-now tip key. Content is rendered from JS with L(zh, en) at open time
 * (so the current language always applies); the dialog itself is an empty
 * shell in index.html, like the shop / player-voice dialogs.
 *
 * Mode names come from js/data/modeCatalog.js (Chinese titles, the single
 * source of truth); the English renderings are the established PHRASES
 * translations for those titles (Time-Travel Career, League GM, Custom
 * Battle, Gold Ladder, Time-Space Duel). No new mode names are invented.
 */
import { L } from "../i18n.js";
import { markTipSeen, shouldShowTip } from "./firstRunTip.js";
import { modeById } from "../data/modeCatalog.js";

export const FIRST_RUN_GUIDE_KEY = "cls_guide_first_run_v1";

/** The four core-loop steps, in play order. Evaluated at call time so L() picks the current language. */
export function guideSteps() {
  return [
    {
      title: L("抽卡", "Draw cards"),
      body: L(
        "抽 1950 年至今的历史球星卡，每名球员每个赛季一张。",
        "Draw historic star cards from 1950 to today — one card per player per season.",
      ),
    },
    {
      title: L("组队", "Build your team"),
      body: L(
        "用抽到的卡组建阵容，再选教练和战术。",
        "Build your lineup from your cards, then pick a coach and tactics.",
      ),
    },
    {
      title: L("比赛", "Play games"),
      body: L(
        "打一场比赛，或让比赛自己模拟；想看就看，想跳过就跳过。",
        "Play a game or let it simulate — watch it live or skip ahead.",
      ),
    },
    {
      title: L("临场指挥", "Coach live"),
      body: L(
        "比赛中叫暂停、换人、大喊，关键时刻由你决定。",
        "Call timeouts, make subs, and shout plays mid-game — you decide the big moments.",
      ),
    },
  ];
}

/** Where the modes live: catalog titles, home-tab names via L(). */
export function guideModesLine() {
  const title = (id) => modeById(id)?.title || id;
  return L(
    `玩法在哪：生涯（${title("timeTravel")}、${title("franchise")}）在「传奇生涯」；快速玩法（${title("custom")}、${title("career")}、${title("sandbox")}）在「自由球场」。`,
    `Where to play: career modes (${L("穿越生涯", "Time-Travel Career")}, ${L("联盟经理", "League GM")}) live on the Career tab; quick games (${L("自定义对战", "Custom Battle")}, ${L("金币晋级赛", "Gold Ladder")}, ${L("时空对决", "Time-Space Duel")}) live on the Playground tab.`,
  );
}

export function guideTitle() {
  return L("新手指南", "New Player Guide");
}

/** Same one-liner as the home hero (#home-intro), so the guide and the page agree. */
export function guideIntro() {
  return L(
    "篮球卡牌经理游戏：抽历史球星卡，组队打比赛，临场指挥争冠军。",
    "A basketball card-manager game: draft historic star cards, build your team, and coach live for the title.",
  );
}

export function guideStartLabel() {
  return L("开始游戏", "Start playing");
}

export function guideHowtoLabel() {
  return L("查看详细玩法说明", "Read the full how-to");
}

/** Full inner HTML for the guide dialog, rendered fresh on every open. */
export function guideHtml() {
  const steps = guideSteps()
    .map((s) => `<li><strong>${s.title}</strong><span>${s.body}</span></li>`)
    .join("");
  return `<div class="panel-head"><h2>${guideTitle()}</h2></div>
<p class="guide-intro">${guideIntro()}</p>
<ol class="guide-steps">${steps}</ol>
<p class="guide-modes">${guideModesLine()}</p>
<div class="guide-actions">
<button type="button" class="btn primary" id="btn-guide-start">${guideStartLabel()}</button>
<button type="button" class="btn ghost" id="btn-guide-howto">${guideHowtoLabel()}</button>
</div>`;
}

export function shouldShowGuide(storage) {
  return shouldShowTip(storage, FIRST_RUN_GUIDE_KEY);
}

export function markGuideSeen(storage) {
  markTipSeen(storage, FIRST_RUN_GUIDE_KEY);
}

/**
 * One-time dialog wiring (idempotent): closing the guide — button, Escape,
 * or backdrop click — marks it seen, so it never nags on the next entry.
 * The inner content is re-rendered on every open (see openFirstRunGuide).
 */
export function wireGuideDialog(dialog, storage) {
  if (!dialog || dialog.__guideWired) return;
  dialog.__guideWired = true;
  dialog.addEventListener("close", () => markGuideSeen(storage));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close?.();
  });
}

/**
 * Render the guide in the current language and open it. `opts.howtoDialog`
 * (the #howto-dialog element) is optional: when given, the "full how-to"
 * button closes the guide and opens the detailed manual instead.
 */
export function openFirstRunGuide(dialog, storage, opts = {}) {
  if (!dialog) return false;
  wireGuideDialog(dialog, storage);
  dialog.innerHTML = guideHtml();
  dialog.querySelector("#btn-guide-start")?.addEventListener("click", () => dialog.close?.());
  dialog.querySelector("#btn-guide-howto")?.addEventListener("click", () => {
    dialog.close?.();
    const howto = opts.howtoDialog;
    if (howto && typeof howto.showModal === "function") howto.showModal();
    else if (howto) howto.setAttribute("open", "");
  });
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return true;
}
