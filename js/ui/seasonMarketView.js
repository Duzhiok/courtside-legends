// The season market tab's markup (salary cap card, coaching staff, my roster, free agents, trade offers, the trade form), as a pure
// function of the season. app.js (renderSeasonMarket) keeps everything that touches the season or the page: it prepares the
// season, deals the trade offers, refreshes the staff market, then writes this onto #season-market and wires the buttons.
//
// Moved out of app.js unchanged (B61 step 9): the markup and every string are byte-for-byte what it inlined (i18n-phrases.js depends on them).
import { esc } from "../core/html.js";
import { coachRecordLabel } from "../data/account.js";
import { marketMeta, systemFitNote } from "../data/intangibles.js";
import { overall } from "../data/players.js";
import { historicalUpsideHint } from "../engine/develop.js";
import { estimateDraftPickValue } from "../engine/draftPickValue.js";
import { picksOwnedBy } from "../engine/leagueDraft.js";
import { SEASON_APRON, SEASON_MAX_ROSTER, SEASON_MIN_ROSTER, SEASON_SALARY_CAP, formatSalary, playerSalary, salaryLine, seasonTradeCount, staffMarketLabel, staffSalary, teamDraftAssets, tradeDeadlineDay } from "../engine/seasonMarket.js";
import { LISTING_PREFERENCES, listingPref } from "../engine/tradeListing.js";
import { listedPlayerIds } from "../engine/tradeProposals.js";
import { L, getLang } from "../i18n.js";
import { learnedBadgeHtml, learnedLineHtml } from "../ui/learnedBadge.js";
import { valueBadge, valueBadgeHtml } from "../ui/valueBadge.js";

/** A listed player whose sale preference no team could meet gets a note, not silence. */
function unmetListingHintHtml(st, proposals) {
  const en = getLang() === "en";
  const answered = new Set(proposals.flatMap((proposal) => proposal.giveIds));
  const roster = st.teams[st.userTeamId]?.players || [];
  return listedPlayerIds(st)
    .filter((id) => listingPref(st, id) !== "any" && !answered.has(id))
    .map((id) => {
      const def = LISTING_PREFERENCES[listingPref(st, id)];
      const name = roster.find((p) => p.id === id)?.name || id;
      return `<p class="tiny unmet-listing">${esc(en
        ? `No team can make a "${def.labelEn}" offer for ${name} right now (cap room or roster). Try another preference or refresh later.`
        : `暂时没有球队能按「${def.label}」给 ${name} 出价（薪资空间或阵容不允许）。换个倾向或稍后刷新。`)}</p>`;
    })
    .join("");
}

/** 挂牌球员的出售倾向下拉：决定谁来谈、回报长什么样（见 engine/tradeListing.js）。 */
function listingPrefSelectHtml(st, playerId) {
  const en = getLang() === "en";
  const current = listingPref(st, playerId);
  const options = Object.entries(LISTING_PREFERENCES)
    .map(([id, def]) => `<option value="${id}" title="${esc(en ? def.whyEn : def.why)}"${id === current ? " selected" : ""}>${esc(en ? def.labelEn : def.label)}</option>`)
    .join("");
  const label = en ? "What do you want back?" : "出售倾向";
  return `<select class="sm-list-pref" data-list-pref="${playerId}" aria-label="${label}" title="${label}">${options}</select>`;
}

/**
 * `you` = the user's team, `pay` = its payrollSummary, `proposals` = the trade offers dealt for this render.
 * `managed` = the league career is a managed one (it unlocks pick swaps); `learnedOf(player)` = the skills the player picked up
 * from season epiphanies (both read the live career, which stays in app.js).
 * The season must already be prepared, the offers dealt and the staff market refreshed (all mutations, done by the caller).
 */
export function marketHtml(st, { you, pay, proposals, managed, learnedOf }) {
  const listedSet = new Set(listedPlayerIds(st));
  const rosterRows = [...(you.players || [])]
    .sort((a, b) => overall(b) - overall(a))
    .map((p) => {
      const isListed = listedSet.has(p.id);
      const fit = systemFitNote(p, you.coach, null, getLang());
      const upside = historicalUpsideHint(p, getLang());
      const badge = valueBadgeHtml(valueBadge(p, { owned: true, lang: getLang() }));
      const learned = learnedOf(p);
      return `<div class="sm-row">
        <div>
          <strong>${p.playPos || p.pos} ${p.name}</strong> ${badge}${learnedBadgeHtml(learned, getLang())}${isListed ? ` <span class="chip tiny">${getLang() === "en" ? "Listed" : "已挂牌"}</span>` : ""}
          <div class="tiny">OVR ${overall(p)} · ${p.season} · ${salaryLine(p, getLang())}</div>
          ${fit ? `<div class="tiny">${esc(fit)}</div>` : ""}
          ${upside ? `<div class="tiny season-pick-upside">${esc(upside)}</div>` : ""}
          ${learnedLineHtml(learned, getLang())}
        </div>
        <span class="btn-row">${isListed ? listingPrefSelectHtml(st, p.id) : ""}<button type="button" class="btn small ghost sm-list-trade" data-list-trade="${p.id}">${isListed ? (getLang() === "en" ? "Unlist" : "取消挂牌") : (getLang() === "en" ? "List for trade" : "挂牌")}</button>
        <button type="button" class="btn small ghost sm-cut" data-cut="${p.id}">${L("裁掉", "Cut")}</button></span>
      </div>`;
    })
    .join("");

  const fa = [...(st.freeAgents || [])].sort((a, b) => overall(b) - overall(a));
  const faRows = fa
    .slice(0, 48)
    .map((p) => {
      const sal = playerSalary(p);
      const can =
        you.players.length < SEASON_MAX_ROSTER &&
        pay.payroll + sal <= SEASON_APRON &&
        !(pay.payroll >= SEASON_SALARY_CAP && sal > 90);
      const upside = historicalUpsideHint(p, getLang());
      const learned = learnedOf(p);
      return `<div class="sm-row">
        <div>
          <strong>${p.pos} ${p.name}</strong>${learnedBadgeHtml(learned, getLang())}
          <div class="tiny">OVR ${overall(p)} · ${p.season} · ${L(`要价 ${formatSalary(sal)}`, `Asking ${formatSalary(sal)}`)}</div>
          <div class="tiny">${marketMeta(p, getLang())}</div>
          ${upside ? `<div class="tiny season-pick-upside">${upside}</div>` : ""}
          ${learnedLineHtml(learned, getLang())}
        </div>
        <button type="button" class="btn small primary sm-sign" data-sign="${p.id}" ${
        can ? "" : "disabled"
      }>${L("签约", "Sign")}</button>
      </div>`;
    })
    .join("");

  const cpuOpts = Object.keys(st.teams)
    .filter((id) => id !== st.userTeamId)
    .map((id) => ({ id, name: st.teams[id].name || id }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"))
    .map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`)
    .join("");

  const hc = you.coach;
  const asst = you.assistant;
  const staffCoaches = st.staffMarket?.coaches || [];
  const staffAssts = st.staffMarket?.assistants || [];
  const staffNow = `
    <div class="sm-row">
      <div>
        <strong>${L("主教练", "Head coach")} · ${hc ? esc(hc.name) : L("空缺", "Vacant")}</strong>
        <div class="tiny">${
          hc
            ? `${esc(coachRecordLabel(hc, getLang()))} · ${esc(staffMarketLabel(hc, getLang()))} · ${L(`年薪 ${formatSalary(staffSalary(hc))}`, `Salary ${formatSalary(staffSalary(hc))}`)}`
            : L("可从下方应聘名单签约", "Sign from the applicant pool below")
        }</div>
      </div>
      ${hc ? `<button type="button" class="btn small ghost" id="btn-sm-fire-coach">${L("解聘", "Fire")}</button>` : ""}
    </div>
    <div class="sm-row">
      <div>
        <strong>${L("助教", "Assistant")} · ${asst ? esc(asst.name) : L("空缺", "Vacant")}</strong>
        <div class="tiny">${
          asst
            ? `${esc(staffMarketLabel(asst, getLang()))} · ${L(`年薪 ${formatSalary(staffSalary(asst))}`, `Salary ${formatSalary(staffSalary(asst))}`)}`
            : L("可从下方应聘名单签约", "Sign from the applicant pool below")
        }</div>
      </div>
      ${asst ? `<button type="button" class="btn small ghost" id="btn-sm-fire-asst">${L("解聘", "Fire")}</button>` : ""}
    </div>`;
  const coachFaRows = staffCoaches
    .map((c) => {
      const sal = staffSalary(c);
      const delta = sal - staffSalary(hc);
      const can = pay.payroll + delta <= SEASON_APRON;
      return `<div class="sm-row">
        <div>
          <strong>${esc(c.name)}</strong>
          <span class="chip tiny">${esc(c.style || L("主帅", "Head coach"))}</span>
          <div class="tiny">${c.season || ""} · ${esc(coachRecordLabel(c, getLang()))} · ${L(`要价 ${formatSalary(sal)}`, `Asking ${formatSalary(sal)}`)}</div>
          <div class="tiny">${esc(staffMarketLabel(c, getLang()))}</div>
          <div class="tiny">${esc(c.note || "")}</div>
        </div>
        <button type="button" class="btn small primary sm-hire-coach" data-hire-coach="${c.id}" ${
        can ? "" : "disabled"
      }>${hc ? L("换帅", "Replace") : L("聘用", "Hire")}${can ? "" : L("·超帽", " · over cap")}</button>
      </div>`;
    })
    .join("");
  const asstFaRows = staffAssts
    .map((a) => {
      const sal = staffSalary(a);
      const delta = sal - staffSalary(asst);
      const can = pay.payroll + delta <= SEASON_APRON;
      return `<div class="sm-row">
        <div>
          <strong>${esc(a.name)}</strong>
          <span class="chip tiny">${esc(a.role || L("助教", "Assistant"))}</span>
          <div class="tiny">${a.season || ""} · ${L(`要价 ${formatSalary(sal)}`, `Asking ${formatSalary(sal)}`)}</div>
          <div class="tiny">${esc(staffMarketLabel(a, getLang()))}</div>
          <div class="tiny">${esc(a.note || "")}</div>
        </div>
        <button type="button" class="btn small primary sm-hire-asst" data-hire-asst="${a.id}" ${
        can ? "" : "disabled"
      }>${asst ? L("更换", "Replace") : L("聘用", "Hire")}${can ? "" : L("·超帽", " · over cap")}</button>
      </div>`;
    })
    .join("");

  return `
    <div class="sm-cap-card">
      <h4>${L("工资帽", "Salary cap")}</h4>
      <p>${L(`名单 <strong>${pay.n}</strong>/${SEASON_MAX_ROSTER}（最少 ${SEASON_MIN_ROSTER}）`, `Roster <strong>${pay.n}</strong>/${SEASON_MAX_ROSTER} (min ${SEASON_MIN_ROSTER})`)} ·
        ${L(`薪资 <strong>${formatSalary(pay.payroll)}</strong>`, `Payroll <strong>${formatSalary(pay.payroll)}</strong>`)} /
        ${L(`软帽 ${SEASON_SALARY_CAP}`, `soft cap ${SEASON_SALARY_CAP}`)} /
        ${L(`硬帽 ${SEASON_APRON}`, `hard cap ${SEASON_APRON}`)}</p>
      <p class="tiny">${L(`球员 ${formatSalary(pay.playersPay || 0)}`, `Players ${formatSalary(pay.playersPay || 0)}`)} · ${L(`主帅 ${formatSalary(pay.coachPay || 0)}`, `Head coach ${formatSalary(pay.coachPay || 0)}`)} · ${L(`助教 ${formatSalary(
        pay.asstPay || 0
      )}`, `Assistant ${formatSalary(pay.asstPay || 0)}`)} · ${L(`剩余空间 ${formatSalary(pay.space)}`, `Room left ${formatSalary(pay.space)}`)} · ${L(`硬帽余量 ${formatSalary(pay.apronRoom)}`, `Hard-cap room ${formatSalary(pay.apronRoom)}`)}${pay.overCap ? L(" · 已超软帽：只能签迷你合同或先腾空间", " · Over soft cap: only minimum deals, or clear room first") : ""
      }</p>
    </div>
    <section class="sm-staff">
      <header class="sm-fa-head">
        <h4>${L("教练组 · 应聘 / 自由市场", "Coaching staff · Applicants / market")}</h4>
        <button type="button" class="btn small" id="btn-sm-refresh-staff">${L("刷新教练市场", "Refresh coach market")}</button>
      </header>
      <p class="tiny">${L("主教练与助教年薪计入工资帽。解聘后对方回到应聘池；换帅/换助教会顶替现任。主教练或助教空缺时出战会自动随机 roll 补齐教练组。", "Head-coach and assistant salaries count against the cap. A fired coach returns to the applicant pool; replacing one bumps the incumbent. If a seat is empty at tip-off, the staff is auto-filled with a random roll.")}</p>
      <div class="sm-list">${staffNow}</div>
      <div class="sm-cols" style="margin-top:10px">
        <section>
          <h4 class="tiny">${L("主帅应聘", "Head-coach applicants")}</h4>
          <div class="sm-list sm-fa-list">${coachFaRows || `<p class='tiny'>${L("暂无", "None yet")}</p>`}</div>
        </section>
        <section>
          <h4 class="tiny">${L("助教应聘", "Assistant applicants")}</h4>
          <div class="sm-list sm-fa-list">${asstFaRows || `<p class='tiny'>${L("暂无", "None yet")}</p>`}</div>
        </section>
      </div>
    </section>
    <div class="sm-cols">
      <section>
        <h4>${L("我的阵容 · 裁人", "My roster · Cuts")}</h4>
        <div class="sm-list">${rosterRows || `<p class='tiny'>${L("空", "Empty")}</p>`}</div>
      </section>
      <section>
        <header class="sm-fa-head">
          <h4>${L("球员自由市场 · 签约", "Player market · Signings")}</h4>
          <button type="button" class="btn small" id="btn-sm-refresh-fa">${L("刷新自由市场", "Refresh market")}</button>
        </header>
        <p class="tiny">${L("受薪资空间与硬帽限制。可一边打常规赛赛程一边补强。", "Limited by cap room and the hard cap. You can keep strengthening while the regular season runs.")}</p>
        <div class="sm-list sm-fa-list">${faRows || `<p class='tiny'>${L("暂无", "None yet")}</p>`}</div>
      </section>
    </div>
    <section class="sm-proposals">
      <header class="sm-fa-head"><h4>${L("收到的交易请求", "Trade offers received")}</h4><div class="btn-row"><span class="tiny">${proposals.length ? L(`${proposals.length} 份待处理`, `${proposals.length} pending`) : L("暂无新报价", "No new offers")}</span><button type="button" class="btn small" id="btn-refresh-proposals">${L("刷新报价", "Refresh offers")}</button></div></header>
      ${unmetListingHintHtml(st, proposals)}
      ${proposals.map((proposal) => `<article class="trade-proposal-card" data-proposal-id="${proposal.id}">
        <strong>${L(`${esc(proposal.fromTeamName)} 想得到 ${esc(proposal.targetName)}`, `${esc(proposal.fromTeamName)} wants ${esc(proposal.targetName)}`)}</strong> <span class="chip tiny">${(proposal.round || 1) === 2 ? L("第二轮", "Round 2") : L("第一轮", "Round 1")}</span>
        <p class="tiny">${esc(proposal.reason)}</p>
        <div class="tiny">${L("对方球员：", "Their players: ")}${proposal.receivePlayers.length ? proposal.receivePlayers.map((player) => `${esc(player.name)} · OVR ${overall(player)} · ${formatSalary(playerSalary(player))}`).join("；") : L("仅选秀权，不搭球员", "Picks only, no players attached")}</div>
        <div class="tiny">${L("附带选秀权：", "Picks included: ")}${proposal.offerPicks.map((pick) => {
          const value = estimateDraftPickValue(pick, { currentYear: st.year, lang: getLang() });
          return `<span title="${esc(value.explanation)}">${esc(value.label)}${L(`（≈ +${value.ovrEquivalent} OVR）`, ` (≈ +${value.ovrEquivalent} OVR)`)}</span>`;
        }).join("、") || L("无", "None")}</div>
        ${(proposal.giveIds?.length || 1) > 1 ? `<div class="tiny">${L("对方还要求我方球员：", "They also want your players: ")}${proposal.giveIds.slice(1).map((id) => {
          const p = you.players.find((x) => x.id === id);
          return p ? `${esc(p.name)} · OVR ${overall(p)} · ${formatSalary(playerSalary(p))}` : esc(id);
        }).join("；")}</div>` : ""}
        ${(proposal.askPickIds?.length ? `<div class="tiny">${L("对方还要求我方选秀权：", "They also want your picks: ")}${proposal.askPickIds.map((id) => {
          const pick = teamDraftAssets(st, st.userTeamId).find((pk) => pk.id === id);
          if (!pick) return esc(id);
          const value = estimateDraftPickValue(pick, { currentYear: st.year, lang: getLang() });
          return `<span title="${esc(value.explanation)}">${esc(value.label)}${L(`（≈ +${value.ovrEquivalent} OVR）`, ` (≈ +${value.ovrEquivalent} OVR)`)}</span>`;
        }).join("、")}</div>` : "")}
        <div class="btn-row" style="margin-top:8px"><button type="button" class="btn small primary" data-trade-proposal-action="accept" data-proposal-id="${proposal.id}">${L("接受报价", "Accept")}</button>${(proposal.round || 1) === 2 ? "" : `<button type="button" class="btn small" data-trade-proposal-action="counter" data-proposal-id="${proposal.id}">${L("再谈谈", "Counter")}</button>`}<button type="button" class="btn small ghost" data-trade-proposal-action="decline" data-proposal-id="${proposal.id}">${L("拒绝", "Decline")}</button></div>
      </article>`).join("") || `<p class="tiny">${L("最近没有球队主动报价。球员打出连续好表现后，新的报价会在下一次刷新市场时出现。", "No team has offered lately. Once your players string good games together, new offers show up on the next market refresh.")}</p>`}
    </section>
    <section class="sm-trade">
      <h4>${L("交易（多对多 · 可含选秀权 · 可选三方）", "Trades (multi-for-multi · picks allowed · three-team optional)")}</h4>
      <p class="tiny">${L("勾选我方/对方要换的球员或未来选秀权，多选多。薪资/身价大致配平即可。选好想要的对方球员后点「推荐方案」自动配平。选了第三方就走三方循环：我方勾选 → 对手球队，对手勾选 → 第三方，第三方勾选 → 我方（三方暂不带选秀权）。", "Tick players or future picks on either side, many for many — salary and value just need to roughly balance. After picking the opponent players you want, hit Recommend to auto-balance. With a third team it becomes a cycle: your picks → opponent, opponent's picks → third team, third team's picks → you (no picks in three-team deals yet).")}</p>
      <p class="tiny">${L("交易窗口：", "Trade window: ")}${(() => { const d = tradeDeadlineDay(st); return d == null ? L("本赛季无截止日", "No deadline this season") : L(`常规赛第 ${d} 天后关闭（当前第 ${st.dayIndex || 0} 天）`, `Closes after regular-season day ${d} (now day ${st.dayIndex || 0})`); })()} · ${L(`本赛季已交易 ${seasonTradeCount(st)} 次（换签不计）。`, `${seasonTradeCount(st)} trades this season (pick swaps excluded).`)}</p>
      <div class="form-row">
        <label>${L("对手球队", "Opponent")}
          <select id="sm-trade-cpu">${cpuOpts}</select>
        </label>
        <label>${L("第三方球队（可选）", "Third team (optional)")}
          <select id="sm-trade-cpu3"><option value="">${L("不选（普通双边）", "None (two-team)")}</option>${cpuOpts}</select>
        </label>
      </div>
      <div class="sm-cols" id="sm-trade-cols"></div>
      <div class="btn-row" style="margin-top:8px">
        <button type="button" class="btn small" id="btn-sm-trade-recommend">${L("推荐方案", "Recommend")}</button>
        <button type="button" class="btn primary" id="btn-sm-trade">${L("提出交易", "Propose trade")}</button>
      </div>
      <p class="tiny" id="sm-trade-summary"></p>
      <p class="tiny" id="sm-trade-hint"></p>
    </section>
    ${managed ? `<section class="sm-picks">
      <h4>${L("选秀权交易（上下换签）", "Pick swaps (move up/down)")}</h4>
      <p class="tiny">${L(`用我方 ${st.year} 年首轮自然签，换对方同年首轮签：战绩越差的签越值钱，对方按战绩估值，差太多会拒绝。换来的签在赛季末选秀的顺位里生效；一枚签一季只能换一次。`, `Swap your ${st.year} natural first-rounder for theirs: the worse the record, the more the pick is worth, and they value it by record — too lopsided and they refuse. A swapped pick takes effect in the end-of-season draft order; one pick can only be swapped once a season.`)}</p>
      <p class="tiny">${L(`我方持有 ${st.year} 年首轮签：`, `Your ${st.year} first-round picks: `)}${picksOwnedBy(st, st.year, st.userTeamId).map((srcId) => srcId === st.userTeamId ? L("自然签", "Own pick") : L(`${st.teams[srcId]?.name || srcId} 的签`, `${st.teams[srcId]?.name || srcId}'s pick`)).join("、") || L("无", "None")}</p>
      <div class="form-row">
        <label>${L("对方球队", "Opponent")}
          <select id="sm-pick-cpu">${cpuOpts}</select>
        </label>
        <button type="button" class="btn primary" id="btn-sm-pick-swap">${L("提出换签", "Propose swap")}</button>
      </div>
      <p class="tiny" id="sm-pick-hint"></p>
    </section>` : ""}
  `;
}
