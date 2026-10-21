import { overall } from "../data/players.js";
import { SEASON_SALARY_CAP, playerSalary, teamPayroll } from "./seasonMarket.js";

function fmtDelta(n) {
  const v = Math.round(n);
  return v > 0 ? `+${v}` : `${v}`;
}

/**
 * Compare keeping a roster player vs an existing inbound trade proposal
 * that targets them vs cutting them to sign the best-fit free agent.
 * Pure read-only: never mutates roster, free agents, or proposals.
 */
export function buildTradeComparison(st, playerId, { salaryOf = playerSalary, overallOf = overall } = {}) {
  const team = st?.teams?.[st.userTeamId];
  const player = team?.players?.find((p) => p.id === playerId);
  if (!player) return null;
  const playerSalaryValue = salaryOf(player) || 0;
  const playerOvr = overallOf(player) || 0;
  const payroll = teamPayroll(team);

  const keep = {
    label: "保留现状",
    salaryDelta: 0,
    ovrDelta: 0,
    rosterDelta: 0,
    note: `继续占用 ¤${playerSalaryValue} 合同与一个轮换位置，阵容不变。`,
  };

  const proposal = (st.tradeProposals || []).find((item) => item.giveIds?.includes(playerId));
  let trade = null;
  if (proposal) {
    const incomingOvr = proposal.receivePlayers.reduce((sum, p) => sum + (overallOf(p) || 0), 0) / proposal.receivePlayers.length;
    const incomingSalary = proposal.receivePlayers.reduce((sum, p) => sum + (salaryOf(p) || 0), 0);
    trade = {
      label: `交易给 ${proposal.fromTeamName}`,
      salaryDelta: incomingSalary - playerSalaryValue,
      ovrDelta: incomingOvr - playerOvr,
      rosterDelta: proposal.receivePlayers.length - 1,
      partnerTeamName: proposal.fromTeamName,
      receiveNames: proposal.receivePlayers.map((p) => p.name),
      pickCount: proposal.offerPicks.length,
      note: `换回 ${proposal.receivePlayers.map((p) => p.name).join("、")}${proposal.offerPicks.length ? ` + ${proposal.offerPicks.length} 个选秀权` : ""}。`,
    };
  }

  const space = SEASON_SALARY_CAP - payroll + playerSalaryValue;
  const bestFa = [...(st.freeAgents || [])]
    .filter((fa) => (salaryOf(fa) || 0) <= space)
    .sort((a, b) => (overallOf(b) || 0) - (overallOf(a) || 0))[0] || null;
  const cutSign = bestFa
    ? {
        label: `裁掉后签 ${bestFa.name}`,
        salaryDelta: (salaryOf(bestFa) || 0) - playerSalaryValue,
        ovrDelta: (overallOf(bestFa) || 0) - playerOvr,
        rosterDelta: 0,
        freeAgentName: bestFa.name,
        note: `释放 ¤${playerSalaryValue}，签下 OVR ${overallOf(bestFa)} 的 ${bestFa.name}（¤${salaryOf(bestFa)}）。`,
      }
    : {
        label: "裁掉后签自由球员",
        salaryDelta: -playerSalaryValue,
        ovrDelta: -playerOvr,
        rosterDelta: -1,
        note: "当前工资空间下，自由市场没有比他更合适的替代人选。",
      };

  return {
    playerId,
    playerName: player.name,
    playerOvr,
    playerSalary: playerSalaryValue,
    keep,
    trade,
    cutSign,
  };
}

export function renderTradeComparisonHtml(comparison) {
  if (!comparison) return "<p class=\"tiny\">暂无可比较数据。</p>";
  const col = (opt) =>
    opt
      ? `<div class="trade-compare-col">
          <h5>${opt.label}</h5>
          <div class="tiny">工资变化：${fmtDelta(opt.salaryDelta)}</div>
          <div class="tiny">能力变化：${fmtDelta(opt.ovrDelta)} OVR</div>
          <div class="tiny">阵容人数变化：${fmtDelta(opt.rosterDelta)}</div>
          <p class="tiny">${opt.note}</p>
        </div>`
      : `<div class="trade-compare-col"><h5>暂无交易报价</h5><p class="tiny">这名球员目前没有收到主动交易请求，可在自由市场手动议价。</p></div>`;
  return `<div class="trade-compare-grid">
    ${col(comparison.keep)}
    ${col(comparison.trade)}
    ${col(comparison.cutSign)}
  </div>`;
}
