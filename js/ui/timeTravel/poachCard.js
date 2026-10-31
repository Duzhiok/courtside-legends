/**
 * B6: the "another club wants you" card. Split out of screen.js (which was past the size limit) so
 * the card's render + its two actions live together; the controller only injects what it owns.
 */
import { PLAYERS, overall } from "../../data/players.js";
import { teamNameL } from "../../i18n.js";
import { ensureCoachProfile } from "../../career/coachProfile.js";
import {
  POACH_ACCEPT_REPUTATION_DELTA, POACH_DECLINE_TRUST_BONUS, POACH_SIGNING_SALARY, POACH_SIGNING_TRUST_BONUS,
} from "../../career/balance.js";
import { currentCoachSalary } from "../../career/finance.js";
import { acceptPoachOffer, declinePoachOffer, poachWindowOpen } from "../../modes/poaching.js";
import { confirmAction } from "../confirmModal.js";
import { $ } from "./dom.js";
import { esc, tr } from "./format.js";
import { icon } from "./icons.js";
import { poachCardHtml } from "./offers.js";
import { teamColorsFor, teamCore, teamNameFor } from "./viewModel.js";

export function createPoachCard({ state, lang, setStatus, commit, currentRootState, renderScreen }) {
  /** B6: a rival club's offer. Only shown while it can still be acted on (before the season's first game). */
  function renderPoach(root) {
    const card = $("#tt-poach");
    const open = poachWindowOpen(root);
    card.hidden = !open;
    if (!open) return;
    const l = lang();
    const offer = root.story.poachOffer;
    const offerTeam = teamNameL(offer.teamName, l);
    const year = root.leagueCareer.season.year;
    const mine = teamNameL(teamNameFor(year, root.story.employer), l);
    $("#tt-poach-title").textContent = tr(l, `${offerTeam} 想请你过去执教`, `${offerTeam} wants you as head coach`);
    $("#tt-poach-note").textContent = tr(
      l,
      `你在 ${mine} 的成绩被别的球队看在眼里。你的教练声望是 ${Math.round(ensureCoachProfile(root).reputation ?? 0)}。这份邀请只在本赛季第一场比赛之前有效——开赛后自动作废。`,
      `Other clubs have noticed your work at ${mine}. Your coaching reputation is ${Math.round(ensureCoachProfile(root).reputation ?? 0)}. The offer only stands until this season's first game — it lapses once play begins.`,
    );
    $("#tt-poach-card").innerHTML = poachCardHtml(offer, {
      colors: teamColorsFor(year, offer.teamId),
      core: teamCore({ players: PLAYERS, overall, year, teamId: offer.teamId }),
      lang: l,
    });
    const gain = (text) => `<li class="tt-stake tt-stake-good">${icon("check", { size: 14 })}<span>${esc(text)}</span></li>`;
    const cost = (text) => `<li class="tt-stake tt-stake-bad">${icon("flag", { size: 14 })}<span>${esc(text)}</span></li>`;
    $("#tt-poach-stakes").innerHTML = [
      cost(tr(l,
        `接受的代价：在 ${mine} 的这段执教就此归档，教练声望 ${POACH_ACCEPT_REPUTATION_DELTA}，今后 ${mine} 不会再聘用你；新赛季从零开始，压力和权限按新队的来。`,
        `Accept — the cost: your time at ${mine} is closed out, reputation ${POACH_ACCEPT_REPUTATION_DELTA}, and ${mine} won't hire you again. A fresh season starts, with the new club's pressure and authority.`)),
      gain(tr(l,
        `接受的回报：签约年薪 ¤${POACH_SIGNING_SALARY}（现在 ¤${currentCoachSalary(root)}），新管理层起始信任 +${POACH_SIGNING_TRUST_BONUS}；积蓄、住房和过往履历都带走。`,
        `Accept — the reward: a signing salary of ¤${POACH_SIGNING_SALARY} (now ¤${currentCoachSalary(root)}) and +${POACH_SIGNING_TRUST_BONUS} starting trust with the new front office. Savings, home and record come with you.`)),
      gain(tr(l,
        `婉拒：现任管理层信任 +${POACH_DECLINE_TRUST_BONUS}，你留在 ${mine} 继续这份合同。`,
        `Decline: front-office trust +${POACH_DECLINE_TRUST_BONUS}, and you stay at ${mine} on your current deal.`)),
    ].join("");
  }

  async function acceptPoach() {
    const l = lang();
    const offer = state.longCareerRoot?.story?.poachOffer;
    if (!offer) return;
    const offerTeam = teamNameL(offer.teamName, l);
    if (!(await confirmAction(
      tr(l, `接受 ${offerTeam} 的挖角？你会离开现在的球队，这一季从新球队重新开始。`, `Accept ${offerTeam}'s offer? You leave your current team and start this season fresh at the new club.`),
      { title: tr(l, "转投新东家？", "Move to a new club?"), acceptLabel: tr(l, "确认转投", "Move") },
    ))) return;
    try {
      const root = acceptPoachOffer(currentRootState());
      commit(root, tr(l, "存档写入失败，尚未转投", "Save failed — you haven't moved yet"));
      setStatus(tr(l, `你转投了 ${offerTeam}。新的执教阶段开始，声望、积蓄和过往战绩都带在身上。`, `You joined ${offerTeam}. A new chapter starts — your reputation, savings and record come with you.`));
      renderScreen();
      window.scrollTo?.({ top: 0, behavior: "smooth" });
    } catch (error) {
      setStatus(error?.message || tr(l, "无法接受挖角", "Couldn't accept the offer"), true);
      renderScreen();
    }
  }

  function declinePoach() {
    const l = lang();
    try {
      const root = declinePoachOffer(currentRootState());
      commit(root, tr(l, "存档写入失败，婉拒尚未生效", "Save failed — your refusal wasn't recorded"), { full: false });
      setStatus(tr(l, "你婉拒了邀请，管理层看在眼里。", "You turned the offer down — and the front office noticed."));
      renderScreen();
    } catch (error) {
      setStatus(error?.message || tr(l, "无法婉拒这份邀请", "Couldn't decline the offer"), true);
    }
  }

  function wire() {
    $("#btn-poach-accept")?.addEventListener("click", acceptPoach);
    $("#btn-poach-decline")?.addEventListener("click", declinePoach);
  }

  return { render: renderPoach, wire };
}
