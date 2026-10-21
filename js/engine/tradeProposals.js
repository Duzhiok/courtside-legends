import { overall } from "../data/players.js";
import { executeTrade, playerSalary } from "./seasonMarket.js";

function perGame(row, key) {
  const gp = Number(row?.stats?.gp) || 0;
  return gp ? (Number(row.stats[key]) || 0) / gp : 0;
}

function isAttractive(row, player) {
  return overall(player) >= 78 || perGame(row, "pts") >= 14 || perGame(row, "plusMinus") >= 1.5;
}

function prospectScore(player) {
  return (100 - overall(player)) + (Number(player.age) < 24 ? 18 : 0);
}

function makePickAsset(st, index) {
  return {
    id: `${st.year}-${st.userTeamId}-incoming-${index + 1}`,
    year: Number(st.year) + 1 + (index % 2),
    round: index % 2 === 0 ? 1 : 2,
    source: "trade",
    protection: index % 2 === 0 ? "lottery-protected" : "unprotected",
  };
}

export function generateTradeProposals(st, limit = 3) {
  if (!st?.teams?.[st.userTeamId]) return [];
  const user = st.teams[st.userTeamId];
  const attractive = (user.players || [])
    .map((player) => ({ player, row: st.playerSeason?.[`${st.userTeamId}:${player.id}`] }))
    .filter(({ player, row }) => isAttractive(row, player))
    .sort((a, b) => overall(b.player) - overall(a.player));
  const proposals = [];
  const cpuTeams = Object.entries(st.teams).filter(([id, team]) => id !== st.userTeamId && team?.players?.length);
  for (let i = 0; i < Math.min(limit, attractive.length, cpuTeams.length); i++) {
    const { player, row } = attractive[i];
    const [fromTeamId, fromTeam] = cpuTeams[(i + (st.dayIndex || 0)) % cpuTeams.length];
    const candidate = [...fromTeam.players]
      .sort((a, b) => Math.abs(overall(a) - overall(player)) - Math.abs(overall(b) - overall(player)))[0];
    if (!candidate) continue;
    const salaryDelta = playerSalary(candidate) - playerSalary(player);
    const offerPlayer = salaryDelta <= 0 || salaryDelta < 60 ? candidate : [...fromTeam.players].sort((a, b) => playerSalary(a) - playerSalary(b))[0];
    const pickCount = overall(offerPlayer) + 5 < overall(player) ? 2 : 1;
    const picks = Array.from({ length: pickCount }, (_, pickIndex) => makePickAsset(st, i + pickIndex));
    const prospect = [...fromTeam.players]
      .filter((item) => item.id !== offerPlayer.id && prospectScore(item) > prospectScore(offerPlayer))
      .sort((a, b) => prospectScore(b) - prospectScore(a))[0] || null;
    proposals.push({
      id: `${st.year}:${st.dayIndex || 0}:${fromTeamId}:${player.id}`,
      fromTeamId,
      fromTeamName: fromTeam.name || fromTeamId,
      giveIds: [player.id],
      wantIds: [offerPlayer.id, ...(prospect ? [prospect.id] : [])],
      targetName: player.name,
      receivePlayers: [offerPlayer, ...(prospect ? [prospect] : [])],
      offerPicks: picks,
      reason: `${player.name} 最近表现突出（${perGame(row, "pts").toFixed(1)} 分 / ${perGame(row, "plusMinus").toFixed(1)} +/-），${fromTeam.name || fromTeamId} 主动来谈。`,
      createdYear: st.year,
      createdDay: st.dayIndex || 0,
    });
  }
  return proposals;
}

export function ensureTradeProposals(st) {
  if (!Array.isArray(st.tradeProposals)) st.tradeProposals = generateTradeProposals(st);
  return st.tradeProposals;
}

export function refreshTradeProposals(st) {
  st.tradeProposals = generateTradeProposals(st);
  return st.tradeProposals;
}

export function declineTradeProposal(st, proposalId) {
  const proposals = ensureTradeProposals(st);
  const index = proposals.findIndex((proposal) => proposal.id === proposalId);
  if (index < 0) return { ok: false, reason: "报价已不存在" };
  const [proposal] = proposals.splice(index, 1);
  st.tradeLog = Array.isArray(st.tradeLog) ? st.tradeLog : [];
  st.tradeLog.push({ type: "trade_declined", year: st.year, day: st.dayIndex || 0, proposalId: proposal.id, from: proposal.fromTeamId, target: proposal.targetName });
  return { ok: true, proposal };
}

export function acceptTradeProposal(st, proposalId) {
  const proposals = ensureTradeProposals(st);
  const proposal = proposals.find((item) => item.id === proposalId);
  if (!proposal) return { ok: false, reason: "报价已不存在" };
  const result = executeTrade(st, {
    giveIds: proposal.giveIds,
    wantIds: proposal.wantIds,
    cpuTeamId: proposal.fromTeamId,
    acceptedProposal: true,
  });
  if (!result.ok) return result;
  st.draftAssets = Array.isArray(st.draftAssets) ? st.draftAssets : [];
  st.draftAssets.push(...proposal.offerPicks);
  result.message = `${result.message}；另获 ${proposal.offerPicks.length} 个未来选秀权`;
  st.tradeLog.at(-1).proposalId = proposal.id;
  proposals.splice(proposals.indexOf(proposal), 1);
  return { ...result, proposal };
}
