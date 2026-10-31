/**
 * Controller for the time-travel career screen: decides WHAT is visible from the career state and
 * runs the player's actions (accept offer, resolve story, sign/decline contract, re-employment,
 * finance). HOW things look lives in paint.js and the view modules next to it.
 *
 * Extracted from app.js (which had grown this screen inline); app.js injects the few pieces of
 * global state/behaviour it owns, everything else is imported directly.
 */
import { getLang, L, teamNameL } from "../../i18n.js";
import { PLAYERS, overall } from "../../data/players.js";
import { listHistoricalYears } from "../../data/historicalSeasons.js";
import { readRootSave } from "../../data/saveRoot.js";
import { DEFAULT_COACH_ORIGIN, listCoachOrigins } from "../../career/coachOrigins.js";
import { ensureCoachProfile } from "../../career/coachProfile.js";
import { INVESTMENT_STAKE } from "../../career/balance.js";
import {
  availableAssetClasses, buyHouse, canAffordHouse, canAffordInvestment, currentCoachSalary,
  houseTiers, investmentForecast, placeInvestment, settleCoachFinances,
} from "../../career/finance.js";
import {
  acceptCareerContract, advanceSeasonGoal, declineCareerContracts, evaluateCareerEmployment,
} from "../../modes/careerContract.js";
import { settleSeasonReputation } from "../../career/reputation.js";
import { hasExistingCareerRoot } from "../../modes/leagueCareer.js";
import { expirePoachOffer, maybeCreatePoachOffer } from "../../modes/poaching.js";
import {
  acceptInterviewOffer, acceptReemploymentOffer, createTimeTravelPrologue, futureKnowledgeEffects,
  generateReemploymentOffers, resolveFutureKnowledgeChoice,
} from "../../modes/timeTravelCareer.js";
import {
  buildCareerReport, finalizeCareerEnding, getStoryEvent, localizeStoryEvent, queueNextStoryEvent,
  queueStoryEvent, resolveStoryEvent,
} from "../../story/eventEngine.js";
import { buildEndingShareCard, renderEndingShareCardHtml, shareCardText } from "../../story/endingShareCard.js";
import { confirmAction } from "../confirmModal.js";
import { $ } from "./dom.js";
import { choiceDeckHtml, confirmBarHtml, mountDeck } from "./choices.js";
import { ASSET_LABELS_EN, HOUSE_LABELS_EN, INTRO_CHOICES, paintStaticText } from "./copy.js";
import { tr } from "./format.js";
import { contractOfferCardHtml, interviewOfferCardHtml, jobBoardHtml } from "./offers.js";
import { createPoachCard } from "./poachCard.js";
import {
  hideHq, paintEpilogue, paintFinance, paintGoal, paintHq, paintKpis, paintReport, paintWizard,
} from "./paint.js";
import { hqModel, kpiModel, teamColorsFor, teamCore } from "./viewModel.js";

/** Employment states that end a stint: no season left to coach on this career until you re-hire. */
const CAREER_OVER_STATUSES = new Set(["fired", "departed"]);
export const careerIsOver = (story) => CAREER_OVER_STATUSES.has(story?.employment?.status);

/** What the player should read when they come back to a career in a given employment state. */
export function careerStateNotice(story, lang = getLang()) {
  const tier = story?.ending?.narrativeTier;
  const suffix = tier ? tr(lang, ` 成绩评级：${tier.label}。`, ` Verdict: ${tier.labelEn || tier.label}.`) : "";
  switch (story?.employment?.status) {
    case "fired":
      return tr(
        lang,
        "你被解雇了。这段执教结束，但经验、声望和积蓄都还在 — 去找下一份工作吧。",
        "You were fired. That stint is over, but your experience, reputation and savings come with you — go find the next job.",
      ) + suffix;
    case "departed":
      return tr(
        lang,
        "你带着成果离开了这支球队。经验、声望和积蓄都还在 — 去找下一份工作吧。",
        "You left the team with your results in hand. Experience, reputation and savings come with you — go find the next job.",
      ) + suffix;
    case "renewed":
      return tr(lang, "续约已签署，薪资和特权已写入生涯记录。", "Contract renewed. Your salary and privileges are in the career record.") + suffix;
    default:
      return tr(lang, "生涯已经建立，可以继续进入赛季中心。", "Career established. Continue to the season center.");
  }
}

export function createTimeTravelScreen({
  state, show, saveLongCareer, currentRootState, renderSeasonHub, showSeasonTab,
}) {
  let prologue = null;
  let wizardWired = false;
  const lang = () => getLang();
  const hasCareer = () => state.leagueCareer?.kind === "timeTravel" && !!state.story;

  function setStatus(message, isError = false) {
    const el = $("#time-travel-status");
    if (!el) return;
    el.textContent = message || "";
    if (isError) el.dataset.tone = "error";
    else delete el.dataset.tone;
  }

  /** Mirror a new root into the app's live state; roll back and throw if it can't be saved. */
  function commit(root, failureMessage, { full = true } = {}) {
    const previous = { mode: state.mode, leagueCareer: state.leagueCareer, story: state.story, season: state.season, longCareerRoot: state.longCareerRoot };
    if (full) {
      state.mode = root.activeMode;
      state.leagueCareer = root.leagueCareer;
      state.season = root.leagueCareer?.season || state.season;
    }
    state.story = root.story;
    state.longCareerRoot = root;
    if (!saveLongCareer()) {
      Object.assign(state, previous);
      throw new Error(failureMessage);
    }
  }

  /** On a phone the decision sits below the HQ + HUD: bring it into view after each state change. */
  function focusDecision() {
    if (window.innerWidth > 900) return;
    const target = ["#time-travel-decision", "#time-travel-event", "#time-travel-contract", "#tt-jobs"]
      .map($).find((el) => el && !el.hidden);
    target?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }

  // ---------------------------------------------------------------- wizard (no career yet)
  function ensureYears() {
    const select = $("#time-travel-year");
    if (!select || select.options.length) return;
    const years = listHistoricalYears().sort((a, b) => b - a);
    for (const year of years) select.add(new Option(String(year), String(year)));
    select.value = years.includes(1991) ? "1991" : String(years[0] || "");
  }

  /** Rebuilt on every open (not populate-once): labels are picked via L(), which applyStaticLang's
   * DOM walker will NOT retranslate on a language toggle. */
  function ensureOrigins() {
    const select = $("#time-travel-origin");
    if (!select) return;
    const previous = select.value;
    const origins = listCoachOrigins();
    select.innerHTML = "";
    for (const origin of origins) select.add(new Option(L(origin.label, origin.labelEn), origin.id));
    select.value = origins.some((origin) => origin.id === previous) ? previous : DEFAULT_COACH_ORIGIN;
  }

  function wireWizard() {
    if (wizardWired) return;
    wizardWired = true;
    const year = $("#time-travel-year");
    const philosophy = $("#time-travel-philosophy");
    const origin = $("#time-travel-origin");
    const repaint = () => paintWizard(lang());
    for (const select of [year, philosophy, origin]) select.addEventListener("change", repaint);
    const sortedYears = () => [...year.options].map((option) => option.value).sort((a, b) => a - b);
    $("#tt-year-range").addEventListener("input", (event) => {
      year.value = sortedYears()[Number(event.target.value)];
      repaint();
    });
    const delegate = (selector, attr, select) => $(selector).addEventListener("click", (event) => {
      const button = event.target.closest(`[${attr}]`);
      if (!button) return;
      select.value = button.getAttribute(attr);
      repaint();
    });
    delegate("#tt-decade-chips", "data-decade-year", year);
    delegate("#tt-philosophy-cards", "data-philosophy", philosophy);
    delegate("#tt-origin-chips", "data-origin", origin);
    $("#btn-time-travel-interview").addEventListener("click", () => {
      try {
        prologue = createTimeTravelPrologue({
          year: Number(year.value),
          philosophy: philosophy.value,
          origin: origin.value || DEFAULT_COACH_ORIGIN,
          seed: Date.now() >>> 0,
        });
        renderOffers();
        setStatus(tr(lang(), "收到三份面试邀请，请选择你的历史起点。", "Three interview offers are in — pick your starting point in history."));
        $("#tt-offers-zone").scrollIntoView?.({ block: "start", behavior: "smooth" });
      } catch (error) {
        setStatus(error?.message || tr(lang(), "无法生成面试邀请", "Couldn't generate interview offers"), true);
      }
    });
  }

  // ---------------------------------------------------------------- offers (interview + job board)
  function renderOffers() {
    const zone = $("#tt-offers-zone");
    const deck = $("#time-travel-offers");
    if (!prologue || hasCareer()) {
      zone.hidden = true;
      deck.innerHTML = "";
      return;
    }
    const l = lang();
    zone.hidden = false;
    deck.innerHTML = prologue.offers.slice(0, 3).map((offer) => interviewOfferCardHtml(offer, {
      colors: teamColorsFor(prologue.year, offer.teamId),
      core: teamCore({ players: PLAYERS, overall, year: prologue.year, teamId: offer.teamId }),
      lang: l,
    })).join("");
    zone.querySelector(".tt-confirm-slot").innerHTML = confirmBarHtml(l, { confirmLabel: tr(l, "接受邀请，开始执教", "Accept and start coaching") });
    mountDeck(zone, {
      itemSelector: ".tt-offer:not(.tt-offer-locked)",
      idOf: (el) => el.dataset.offerId,
      labelOf: (el) => el.dataset.team,
      confirmText: (team) => tr(l, `接受 ${team} 的邀请，开始执教？`, `Accept ${team}'s offer and start coaching?`),
      onConfirm: acceptOffer,
    });
  }

  async function acceptOffer(offerId) {
    if (hasCareer()) return;
    const existing = state.longCareerRoot || readRootSave();
    if (hasExistingCareerRoot(existing) && !(await confirmAction(
      tr(lang(), "接受新邀请将替换当前长期生涯存档，确定继续？", "Accepting will replace your current long-career save. Continue?"),
      { title: tr(lang(), "覆盖长期生涯？", "Overwrite your career?"), acceptLabel: tr(lang(), "覆盖并继续", "Overwrite and continue") },
    ))) return;
    try {
      const root = acceptInterviewOffer(prologue, offerId);
      commit(root, tr(lang(), "存档写入失败，尚未接受球队邀请", "Save failed — the offer was not accepted"));
      prologue.selectedOfferId = offerId;
      const offer = prologue.offers.find((candidate) => candidate.id === offerId);
      const l = lang();
      const team = teamNameL(offer.teamName, l);
      setStatus(tr(l, `已接受 ${team} 的邀请，先决定如何使用未来知识。`, `You accepted ${team}'s offer. First: how will you use your foresight?`));
      renderScreen();
      focusDecision();
    } catch (error) {
      setStatus(error?.message || tr(lang(), "无法接受球队邀请", "Couldn't accept the offer"), true);
    }
  }

  const poachCard = createPoachCard({ state, lang, setStatus, commit, currentRootState, renderScreen });

  /** B5: after a firing / walk-out the coach lands on a job board sized by reputation. */
  function renderJobs(root) {
    const l = lang();
    const year = root.leagueCareer.season.year;
    const offers = generateReemploymentOffers(root);
    const reputation = Math.round(ensureCoachProfile(root).reputation ?? 0);
    $("#tt-jobs-board").innerHTML = jobBoardHtml(offers, {
      reputation,
      colorsOf: (teamId) => teamColorsFor(year, teamId),
      coreOf: (offer) => teamCore({ players: PLAYERS, overall, year, teamId: offer.teamId }),
      lang: l,
    });
    $("#tt-jobs-note").textContent = tr(
      l,
      `你的教练声望是 ${reputation}。声望越高，愿意见你的球队越多、档次越好；前东家不会再约你。`,
      `Your coaching reputation is ${reputation}. The higher it is, the more — and better — teams will meet you; your last employer won't call.`,
    );
    $("#tt-jobs .tt-confirm-slot").innerHTML = confirmBarHtml(l, { confirmLabel: tr(l, "接受邀请，重新出发", "Accept and start over") });
    mountDeck($("#tt-jobs"), {
      itemSelector: ".tt-offer:not(.tt-offer-locked)",
      idOf: (el) => el.dataset.offerId,
      labelOf: (el) => el.dataset.team,
      confirmText: (team) => tr(l, `接受 ${team} 的邀请，开始新的执教生涯？`, `Accept ${team}'s offer and start a new chapter?`),
      onConfirm: (offerId, el) => acceptReemployment(offerId, el.dataset.team),
    });
  }

  function acceptReemployment(offerId, teamName) {
    try {
      const root = acceptReemploymentOffer(currentRootState(), offerId);
      commit(root, tr(lang(), "存档写入失败，尚未接受新工作", "Save failed — the new job was not accepted"));
      setStatus(tr(lang(), `已接受 ${teamName} 的邀请。新的执教生涯开始了，你的声望、积蓄和过往战绩都带在身上。`, `You joined ${teamName}. A new chapter begins — your reputation, savings and record come with you.`));
      renderScreen();
      window.scrollTo?.({ top: 0, behavior: "smooth" });
    } catch (error) {
      setStatus(error?.message || tr(lang(), "无法接受这份工作", "Couldn't accept that job"), true);
    }
  }

  // ---------------------------------------------------------------- decisions
  function renderIntro() {
    const l = lang();
    const card = $("#time-travel-decision");
    card.hidden = state.story?.pendingDecision !== "future-knowledge-intro";
    if (card.hidden) return;
    $("#time-travel-decision-choices").innerHTML = choiceDeckHtml(INTRO_CHOICES.map((choice) => ({
      id: choice.id,
      label: tr(l, ...choice.label),
      description: tr(l, ...choice.description),
      effects: futureKnowledgeEffects(choice.id),
    })), { attr: "data-story-choice", lang: l });
    card.querySelector(".tt-confirm-slot").innerHTML = confirmBarHtml(l);
    mountDeck(card, {
      idOf: (el) => el.dataset.storyChoice,
      labelOf: (el) => el.querySelector("strong").textContent,
      confirmText: (label) => tr(l, `就这么定：「${label}」。这个决定无法撤回。`, `Lock in "${label}". This can't be undone.`),
      onConfirm: resolveIntro,
    });
  }

  function resolveIntro(choiceId) {
    if (state.story?.pendingDecision !== "future-knowledge-intro") return;
    try {
      const resolved = resolveFutureKnowledgeChoice(currentRootState(), choiceId);
      const root = queueStoryEvent(resolved, "first-year-owner-test", { year: resolved.leagueCareer?.season?.year });
      commit(root, tr(lang(), "存档写入失败，这次决定尚未生效", "Save failed — the decision did not take effect"));
      setStatus(tr(lang(), "决定已保存。资源与时间线已更新。", "Decision saved. Your resources and the timeline have shifted."));
    } catch (error) {
      setStatus(error?.message || tr(lang(), "无法处理这个决定", "Couldn't process that decision"), true);
    }
    renderScreen();
    focusDecision();
  }

  function renderEvent() {
    const l = lang();
    const card = $("#time-travel-event");
    const pending = state.story?.pendingDecision;
    card.hidden = pending?.type !== "story-event";
    if (card.hidden) return;
    const event = localizeStoryEvent(getStoryEvent(pending.eventId), l);
    $("#time-travel-event-kicker").textContent = tr(l, "本季关键事件", "Key event this season");
    $("#time-travel-event-title").textContent = event.title;
    $("#time-travel-event-prompt").textContent = event.prompt;
    $("#time-travel-event-choices").innerHTML = choiceDeckHtml(event.choices, { attr: "data-event-choice", lang: l });
    card.querySelector(".tt-confirm-slot").innerHTML = confirmBarHtml(l);
    mountDeck(card, {
      idOf: (el) => el.dataset.eventChoice,
      labelOf: (el) => el.querySelector("strong").textContent,
      confirmText: (label) => tr(l, `就这么定：「${label}」。这个决定会写进历史。`, `Lock in "${label}". It goes into the record.`),
      onConfirm: resolveEvent,
    });
  }

  function resolveEvent(choiceId) {
    try {
      const resolved = resolveStoryEvent(currentRootState(), choiceId);
      const root = queueNextStoryEvent(resolved, { year: resolved.leagueCareer?.season?.year });
      commit(root, tr(lang(), "存档写入失败，这次事件尚未生效", "Save failed — the event did not take effect"));
      setStatus(tr(lang(), "事件已记录。你的选择会在赛季总结和后续时间线中留下痕迹。", "Event recorded. Your choice will leave a mark on the season recap and the timeline."));
      renderScreen();
      focusDecision();
    } catch (error) {
      setStatus(error?.message || tr(lang(), "无法处理这个事件", "Couldn't process that event"), true);
    }
  }

  function renderContract() {
    const l = lang();
    const card = $("#time-travel-contract");
    card.hidden = state.story?.pendingDecision?.type !== "contract-renewal";
    if (card.hidden) return;
    $("#time-travel-contract-title").textContent = tr(l, "球队愿意继续合作吗？", "Will the team keep you?");
    $("#time-travel-contract-prompt").textContent = tr(
      l,
      "你的冠军数、目标达成率和声望决定了桌上的合同。每份的年限、薪资、权限和特权都不同 — 选一份，或者离开。",
      "Your titles, goal record and reputation decided what is on the table. Years, salary, authority and perks all differ — pick one, or walk away.",
    );
    $("#time-travel-contract-options").innerHTML = (state.story.employment?.offers || []).map((offer) => contractOfferCardHtml(offer, l)).join("");
    card.querySelector(".tt-confirm-slot").innerHTML = confirmBarHtml(l, { confirmLabel: tr(l, "签署这份合同", "Sign this contract") });
    mountDeck(card, {
      itemSelector: ".tt-contract",
      idOf: (el) => el.dataset.offerId,
      labelOf: (el) => el.querySelector("strong").textContent,
      confirmText: (label) => tr(l, `签署「${label}」？`, `Sign "${label}"?`),
      onConfirm: signContract,
    });
  }

  function signContract(offerId) {
    try {
      const root = acceptCareerContract(currentRootState(), offerId);
      commit(root, tr(lang(), "续约保存失败", "Couldn't save the renewal"), { full: false });
      // B4: a signed contract keeps the career going (status back to "active"), so build the notice
      // straight from the offer just accepted rather than from a terminal-flavoured status.
      const offer = root.story.employment?.offer;
      setStatus(offer
        ? tr(lang(), `续约已签署：${offer.title} · ${offer.years} 年 · 薪资 ${offer.salary}，继续征战。`, `Contract signed: ${offer.title} · ${offer.years} years · salary ${offer.salary}. Back to work.`)
        : careerStateNotice(root.story));
      renderScreen();
    } catch (error) {
      setStatus(error?.message || tr(lang(), "无法完成续约", "Couldn't complete the renewal"), true);
    }
  }

  async function declineContract() {
    if (state.story?.pendingDecision?.type !== "contract-renewal") return;
    const l = lang();
    if (!(await confirmAction(
      tr(l, "拒绝续约后，你将离开这支球队。经验和声望会跟着你，但这份合同不会再回来。", "If you decline, you leave this team. Experience and reputation come with you, but this contract won't return."),
      { title: tr(l, "离开球队？", "Leave the team?"), acceptLabel: tr(l, "确认离开", "Leave") },
    ))) return;
    try {
      const root = declineCareerContracts(currentRootState());
      commit(root, tr(l, "离队决定保存失败", "Couldn't save your decision to leave"), { full: false });
      setStatus(careerStateNotice(root.story));
      renderScreen();
      focusDecision();
    } catch (error) {
      setStatus(error?.message || tr(l, "无法处理离队决定", "Couldn't process leaving"), true);
    }
  }

  // ---------------------------------------------------------------- side cards
  function financeModel(root, l) {
    const coach = ensureCoachProfile(root);
    const tiers = houseTiers();
    const divergence = root.story?.timelineDivergence ?? 0;
    const pending = new Map();
    for (const position of coach.pendingInvestments || []) {
      pending.set(position.assetId, (pending.get(position.assetId) || 0) + position.amount);
    }
    const houseName = (id) => (l === "en" ? HOUSE_LABELS_EN[id] : null) ?? tiers[id].label;
    return {
      cash: Math.round(coach.cash ?? 0),
      salary: currentCoachSalary(root),
      housingLabel: tiers[coach.housing] ? houseName(coach.housing) : "",
      houses: Object.entries(tiers).map(([id, tier]) => ({
        id, label: houseName(id), cost: tier.cost, moodBonus: tier.moodBonus,
        owned: coach.housing === id, affordable: canAffordHouse(coach, id),
      })),
      investments: availableAssetClasses(root.leagueCareer?.season?.year).map((asset) => ({
        id: asset.id,
        label: (l === "en" ? ASSET_LABELS_EN[asset.id] : null) ?? asset.label,
        forecast: investmentForecast(asset.id, divergence),
        stake: INVESTMENT_STAKE,
        pending: pending.get(asset.id) || 0,
        affordable: canAffordInvestment(coach, INVESTMENT_STAKE),
      })),
    };
  }

  function financeAction(build, failure) {
    try {
      const root = currentRootState();
      commit({ ...root, coach: build(ensureCoachProfile(root), root) }, failure, { full: false });
      paintFinance(financeModel(currentRootState(), lang()), lang());
      paintKpis(kpiModel(currentRootState()), lang());
    } catch (error) {
      alert(error?.message || failure);
    }
  }

  function renderReport(root, report) {
    const l = lang();
    const card = $("#time-travel-report");
    card.hidden = report.choices === 0;
    if (card.hidden) return;
    const latest = report.seasons.at(-1);
    const record = latest?.record ? tr(l, `${latest.record.w}胜${latest.record.l}负`, `${latest.record.w}-${latest.record.l}`) : tr(l, "赛季尚未结算", "season not settled yet");
    const tier = report.ending?.narrativeTier;
    const tierLabel = tier ? tr(l, tier.label, tier.labelEn || tier.label) : "";
    const endingLabel = report.ending ? tr(l, report.ending.label, report.ending.labelEn || report.ending.label) : "";
    const endingTail = tierLabel ? ` (${tierLabel})` : "";
    $("#time-travel-report-text").textContent = tr(
      l,
      `${report.currentYear} · ${record} · 已作出 ${report.choices} 个故事选择 · 时间线偏离 ${report.timelineDivergence} · 管理层信任 ${report.frontOfficeTrust}`,
      `${report.currentYear} · ${record} · ${report.choices} story choices · timeline drift ${report.timelineDivergence} · front-office trust ${report.frontOfficeTrust}`,
    );
    $("#time-travel-report-status").textContent = report.finished
      ? tr(
        l,
        `这一段执教已结束，共 ${report.seasonCount} 个赛季 · 冠军 ${report.championships} 次${endingLabel ? ` · 结局：${endingLabel}${endingTail}` : ""}`,
        `Stint over after ${report.seasonCount} seasons · ${report.championships} titles${endingLabel ? ` · Ending: ${endingLabel}${endingTail}` : ""}`,
      )
      : tr(
        l,
        `本份合同进度：第 ${report.seasonsIntoContract}/${report.maxSeasons} 年（这段执教共 ${report.seasonCount} 季）`,
        `Current contract: year ${report.seasonsIntoContract}/${report.maxSeasons} (${report.seasonCount} seasons this stint)`,
      );
    paintReport(report, l);
  }

  function renderShareCard(root) {
    const section = $("#time-travel-share");
    const holder = $("#time-travel-share-card");
    const card = buildEndingShareCard(root);
    section.hidden = !card;
    holder.innerHTML = renderEndingShareCardHtml(card, lang());
    const copy = $("#btn-time-travel-share-copy");
    const status = $("#time-travel-share-status");
    status.textContent = "";
    if (!card) return;
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareCardText(card, lang()));
        status.textContent = tr(lang(), "已复制，可以直接粘贴分享。", "Copied — paste it anywhere.");
      } catch {
        status.textContent = tr(lang(), "浏览器不允许复制，请直接截图上方卡片。", "The browser blocked copying — screenshot the card above instead.");
      }
    };
  }

  // ---------------------------------------------------------------- orchestration
  /** The single place that maps career state -> which sections exist. Everything else is a painter. */
  function renderScreen() {
    const l = lang();
    paintStaticText($("#screen-time-travel"), l);
    paintWizard(l);
    renderOffers();
    const career = hasCareer();
    $("#time-travel-create").hidden = career;
    const sections = ["#tt-poach", "#time-travel-decision", "#time-travel-event", "#time-travel-contract", "#tt-over", "#tt-jobs", "#tt-goal", "#time-travel-finance", "#time-travel-report", "#time-travel-share", "#btn-time-travel-continue"];
    if (!career) {
      hideHq();
      for (const selector of sections) $(selector).hidden = true;
      return;
    }
    const root = currentRootState();
    const report = buildCareerReport(root);
    const over = careerIsOver(root.story);
    paintHq(hqModel(root, report, l), l);
    paintKpis(kpiModel(root), l);
    renderIntro();
    renderEvent();
    renderContract();
    $("#tt-grid").dataset.over = over ? "1" : "";
    // The coaching record stays on screen after a re-hire or a poaching, not just in the epilogue:
    // a coach with past stints should always be able to see them.
    const hasPastStints = (root.coach?.stints || []).length > 0;
    $("#tt-over").hidden = !(over || hasPastStints);
    $("#tt-jobs").hidden = !over;
    if (over || hasPastStints) paintEpilogue(root, report, l, { over });
    poachCard.render(root);
    if (over) {
      renderJobs(root);
    }
    if (over) $("#tt-goal").hidden = true;
    else paintGoal(root, l);
    $("#time-travel-finance").hidden = over;
    if (!over) paintFinance(financeModel(root, l), l);
    renderReport(root, report);
    renderShareCard(root);
    $("#btn-time-travel-continue").hidden = !!root.story.pendingDecision || over;
  }

  /** Called by the season flow between seasons: settle goal + finances, then queue the next beat. */
  function queueNextTimeTravelEvent() {
    if (state.leagueCareer?.kind !== "timeTravel" || !state.story) return null;
    const root = state.longCareerRoot || currentRootState();
    // Resolve the just-finished season's board goal first (B1) so a trust swing from hitting or
    // missing it can affect which event the condition pool (A2) considers eligible this round.
    const goaled = advanceSeasonGoal(root);
    const lastGoal = goaled.story.eventLog.at(-1);
    const resolvedGoal = lastGoal?.type === "season-goal-result" ? lastGoal : null;
    // E3: pay this season's salary and settle any pending investment. Independent of the goal above
    // (finance never touches trust, the goal never touches cash).
    const financed = settleCoachFinances(goaled);
    const lastFinance = financed.story.eventLog.at(-1);
    const settledFinances = lastFinance?.type === "finances-settled" ? lastFinance : null;
    // B6: settle the season's reputation change BEFORE the employment check, so a renewal menu (which
    // is priced off reputation) sees the title / the bad year that was just earned.
    const reputed = settleSeasonReputation(financed);
    const lastRep = reputed.story.eventLog.at(-1);
    const settledReputation = lastRep?.type === "reputation-settled" ? lastRep : null;
    // An offer left over from a previous season can't be acted on any more: clear it first.
    const next = queueNextStoryEvent(expirePoachOffer(reputed), { year: state.season?.year });
    const employed = evaluateCareerEmployment(next);
    const finalized = employed === next ? finalizeCareerEnding(next) : employed;
    // Last, because it only fires for a coach who is still in a normal job with a clear desk: not
    // one who was just fired, nor one facing a renewal or a story decision.
    const result = maybeCreatePoachOffer(finalized);
    if (result === root) return null;
    state.story = result.story;
    state.longCareerRoot = result;
    saveLongCareer();
    return {
      resolvedGoal,
      settledFinances,
      settledReputation,
      poachOffer: result !== finalized ? result.story.poachOffer : null,
      nextGoal: result.story.seasonGoal || null,
    };
  }

  function open() {
    ensureYears();
    ensureOrigins();
    wireWizard();
    if (hasCareer()) {
      setStatus(state.story.pendingDecision
        ? tr(lang(), "有一项决定在等你。", "A decision is waiting for you.")
        : careerStateNotice(state.story));
    } else {
      prologue = null;
      setStatus("");
    }
    renderScreen();
    show("timeTravel");
  }

  /** Resuming a save lands straight on a pending decision. */
  function resume() {
    prologue = null;
    ensureYears();
    ensureOrigins();
    wireWizard();
    renderScreen();
  }

  /** Language toggle: JS-rendered copy isn't touched by applyStaticLang, so repaint it ourselves. */
  function repaint() {
    if (!$("#screen-time-travel")?.classList.contains("active")) return;
    ensureOrigins();
    renderScreen();
  }

  $("#btn-time-travel-back")?.addEventListener("click", () => show("home"));
  $("#btn-time-travel-decline-contract")?.addEventListener("click", declineContract);
  poachCard.wire();
  $("#btn-time-travel-continue")?.addEventListener("click", () => {
    if (!state.leagueCareer?.season) return;
    state.season = state.leagueCareer.season;
    renderSeasonHub();
    show("season");
    showSeasonTab("standings");
  });
  $("#time-travel-house-list")?.addEventListener("click", (event) => {
    const id = event.target.closest("[data-house]")?.dataset.house;
    if (id) financeAction((coach) => buyHouse(coach, id), tr(lang(), "无法买这套房子", "Couldn't buy that home"));
  });
  $("#time-travel-invest-list")?.addEventListener("click", (event) => {
    const id = event.target.closest("[data-asset]")?.dataset.asset;
    if (id) {
      financeAction(
        (coach, root) => placeInvestment(coach, id, INVESTMENT_STAKE, root.leagueCareer?.season?.year),
        tr(lang(), "无法完成这笔投资", "Couldn't place that investment"),
      );
    }
  });

  return { open, resume, repaint, queueNextTimeTravelEvent };
}
