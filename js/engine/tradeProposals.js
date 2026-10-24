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

function tradeSignature(fromTeamId, playerId, offerPlayerId) {
  return `${fromTeamId}:${playerId}:${offerPlayerId}`;
}

/** Players the user listed for trade (挂牌询价): proposals target them first. */
export function listedPlayerIds(st) {
  return Array.isArray(st?.listedPlayerIds) ? [...st.listedPlayerIds] : [];
}

export function listPlayerForTrade(st, playerId) {
  const user = st?.teams?.[st.userTeamId];
  if (!user?.players?.some((p) => p.id === playerId)) return { ok: false, reason: "球员不在我方阵容" };
  st.listedPlayerIds = listedPlayerIds(st);
  if (!st.listedPlayerIds.includes(playerId)) st.listedPlayerIds.push(playerId);
  return { ok: true };
}

export function unlistPlayerForTrade(st, playerId) {
  st.listedPlayerIds = listedPlayerIds(st).filter((id) => id !== playerId);
  return { ok: true };
}

/** Rebuilding teams value future picks most; contenders value win-now talent. */
export function teamSituation(team) {
  const players = team?.players || [];
  if (!players.length) return "mid";
  const avg = players.reduce((s, p) => s + overall(p), 0) / players.length;
  if (avg < 78) return "rebuilding";
  if (avg > 84) return "contender";
  return "mid";
}

export function generateTradeProposals(st, limit = 3) {
  if (!st?.teams?.[st.userTeamId]) return [];
  const user = st.teams[st.userTeamId];
  const declined = new Set(st.declinedTradeSignatures || []);
  const listedIds = new Set(listedPlayerIds(st));
  const listed = listedIds.size
    ? user.players.filter((p) => listedIds.has(p.id)).map((player) => ({ player, row: st.playerSeason?.[`${st.userTeamId}:${player.id}`], listed: true }))
    : [];
  const attractive = (user.players || [])
    .map((player) => ({ player, row: st.playerSeason?.[`${st.userTeamId}:${player.id}`] }))
    .filter(({ player, row }) => !listedIds.has(player.id) && isAttractive(row, player))
    .sort((a, b) => overall(b.player) - overall(a.player));
  const targets = [...listed, ...attractive];
  const proposals = [];
  const cpuTeams = Object.entries(st.teams).filter(([id, team]) => id !== st.userTeamId && team?.players?.length);
  for (let i = 0; i < Math.min(limit, targets.length, cpuTeams.length); i++) {
    const { player, row, listed: isListed } = targets[i];
    const [fromTeamId, fromTeam] = cpuTeams[(i + (st.dayIndex || 0)) % cpuTeams.length];
    const candidate = [...fromTeam.players]
      .sort((a, b) => Math.abs(overall(a) - overall(player)) - Math.abs(overall(b) - overall(player)))[0];
    if (!candidate) continue;
    const salaryDelta = playerSalary(candidate) - playerSalary(player);
    const offerPlayer = salaryDelta <= 0 || salaryDelta < 60 ? candidate : [...fromTeam.players].sort((a, b) => playerSalary(a) - playerSalary(b))[0];
    // generateTradeProposals is a pure function of (year, dayIndex, roster) with no randomness --
    // calling it again with nothing meaningfully changed would otherwise hand back the EXACT same
    // offer the user just declined (user report #14: "我都拒绝报价了，怎么刷新报价后又出现相同的报价？").
    // declineTradeProposal() remembers this exact team+player+offer shape, so it's permanently
    // skipped here -- a genuinely different offer only resurfaces once the roster actually
    // changes (a different candidate/offerPlayer naturally produces a different signature).
    if (declined.has(tradeSignature(fromTeamId, player.id, offerPlayer.id))) continue;
    let pickCount = overall(offerPlayer) + 5 < overall(player) ? 2 : 1;
    // 选秀权倾向：重建队更愿意为即战力多搭选秀权（上限 3 个）
    if (teamSituation(fromTeam) === "rebuilding") pickCount = Math.min(3, pickCount + 1);
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
      reason: isListed
        ? `${player.name} 已挂牌询价，${fromTeam.name || fromTeamId} 前来问价。`
        : `${player.name} 最近表现突出（${perGame(row, "pts").toFixed(1)} 分 / ${perGame(row, "plusMinus").toFixed(1)} +/-），${fromTeam.name || fromTeamId} 主动来谈。`,
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
  st.declinedTradeSignatures = Array.isArray(st.declinedTradeSignatures) ? st.declinedTradeSignatures : [];
  const signature = tradeSignature(proposal.fromTeamId, proposal.giveIds[0], proposal.wantIds[0]);
  if (!st.declinedTradeSignatures.includes(signature)) st.declinedTradeSignatures.push(signature);
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
