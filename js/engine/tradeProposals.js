import { overall } from "../data/players.js";
import { SEASON_APRON, cpuCapBlocksTrade, executeTrade, pickValueOf, playerSalary, teamDraftAssets, teamPayroll } from "./seasonMarket.js";
import {
  DEFAULT_LISTING_PREF,
  MAX_PROPOSAL_PICKS,
  clearListingPref,
  listingPref,
  listingPrefText,
  prospectScore,
  rankTeams,
  shapeOffer,
} from "./tradeListing.js";

function perGame(row, key) {
  const gp = Number(row?.stats?.gp) || 0;
  return gp ? (Number(row.stats[key]) || 0) / gp : 0;
}

function isAttractive(row, player) {
  return overall(player) >= 78 || perGame(row, "pts") >= 14 || perGame(row, "plusMinus") >= 1.5;
}

/** Young, cheap, high-upside roster filler -- worth suggesting as a trade sweetener. */
export function isProspectCandidate(player) {
  return overall(player) < 76 && Number(player.age) < 25;
}

export { prospectScore };

/**
 * Pick `count` sweeteners from the picks `fromTeamId` really holds. First and second rounders
 * alternate, nearest draft first, and nothing in `used` (already offered in this batch) repeats.
 * A club that has traded its picks away simply offers fewer.
 */
function chooseOfferPicks(st, fromTeamId, count, used) {
  const held = teamDraftAssets(st, fromTeamId).filter((pick) => !used.has(pick.id));
  const queues = [held.filter((p) => p.round === 1), held.filter((p) => p.round === 2)];
  const chosen = [];
  while (chosen.length < count && (queues[0].length || queues[1].length)) {
    const preferred = queues[chosen.length % 2];
    const pick = (preferred.length ? preferred : queues[0].length ? queues[0] : queues[1]).shift();
    chosen.push(pick);
    used.add(pick.id);
  }
  return chosen;
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
  clearListingPref(st, playerId);
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
  const usedPickIds = new Set();
  const cpuTeams = Object.entries(st.teams).filter(([id, team]) => id !== st.userTeamId && team?.players?.length);
  for (let i = 0; i < Math.min(limit, targets.length, cpuTeams.length); i++) {
    const target = targets[i];
    const pref = target.listed ? listingPref(st, target.player.id) : DEFAULT_LISTING_PREF;
    const rotate = i + (st.dayIndex || 0);
    // No preference: the original single rotating caller. With a preference: try the three
    // best-fitting teams (rotated so refreshes vary) until one has a package that fits.
    const callers = pref === DEFAULT_LISTING_PREF
      ? [cpuTeams[rotate % cpuTeams.length]]
      : rankTeams(cpuTeams, pref).slice(0, 3).map((_, k, top) => top[(k + rotate) % top.length]);
    for (const [fromTeamId, fromTeam] of callers) {
      const proposal = buildProposal(st, { ...target, pref, index: i, fromTeamId, fromTeam, declined, usedPickIds });
      if (proposal) {
        proposals.push(proposal);
        break;
      }
    }
  }
  return proposals;
}

/** One CPU team's offer for one of the user's players, or null if it can't make a valid one. */
function buildProposal(st, { player, row, listed: isListed, pref, fromTeamId, fromTeam, declined, usedPickIds }) {
  const shaped = shapeOffer(pref, fromTeam, player);
  if (pref !== DEFAULT_LISTING_PREF && !shaped) return null;
  let offerPlayer = shaped?.offer;
  if (!offerPlayer) {
    const candidate = [...fromTeam.players]
      .sort((a, b) => Math.abs(overall(a) - overall(player)) - Math.abs(overall(b) - overall(player)))[0];
    if (!candidate) return null;
    const salaryDelta = playerSalary(candidate) - playerSalary(player);
    offerPlayer = salaryDelta <= 0 || salaryDelta < 60 ? candidate : [...fromTeam.players].sort((a, b) => playerSalary(a) - playerSalary(b))[0];
  }
  // generateTradeProposals is a pure function of (year, dayIndex, roster) with no randomness --
  // calling it again with nothing meaningfully changed would otherwise hand back the EXACT same
  // offer the user just declined (user report #14: "我都拒绝报价了，怎么刷新报价后又出现相同的报价？").
  // declineTradeProposal() remembers this exact team+player+offer shape, so it's permanently
  // skipped here -- a genuinely different offer only resurfaces once the roster actually
  // changes (a different candidate/offerPlayer naturally produces a different signature).
  if (declined.has(tradeSignature(fromTeamId, player.id, offerPlayer.id))) return null;
  let pickCount = overall(offerPlayer) + 5 < overall(player) ? 2 : 1;
  // 选秀权倾向：重建队更愿意为即战力多搭选秀权
  if (teamSituation(fromTeam) === "rebuilding") pickCount += 1;
  pickCount = Math.max(0, Math.min(MAX_PROPOSAL_PICKS, pickCount + (shaped?.pickDelta || 0)));
  // Chosen on a copy of the batch's used set: they are only reserved (below) once this offer is
  // certain to go out, so an offer dropped on the cap check does not use up picks others could offer.
  const picks = chooseOfferPicks(st, fromTeamId, pickCount, new Set(usedPickIds));
  // A listing preference decides the package itself (salary relief / win-now want no add-ons).
  const prospect = shaped
    ? shaped.prospect
    : [...fromTeam.players]
        .filter((item) => item.id !== offerPlayer.id && prospectScore(item) > prospectScore(offerPlayer))
        .sort((a, b) => prospectScore(b) - prospectScore(a))[0] || null;

  // A proposal that can't be accepted is worse than no proposal: acceptTradeProposal() runs the real hard-cap
  // checks through executeTrade() for BOTH clubs, so the offer is checked against both here (user report:
  // "明明是对方发来的报价，接受却说对方硬帽放不下"). Either patch the offer with one extra salary throw-in
  // so it clears both caps, or don't dangle an offer that will bounce.
  const user = st.teams[st.userTeamId];
  let sendBackIds = [offerPlayer.id, ...(prospect ? [prospect.id] : [])];
  const capFits = (ids) => {
    const outgoing = ids.reduce((sum, id) => sum + playerSalary(fromTeam.players.find((p) => p.id === id)), 0);
    const incoming = playerSalary(player);
    // The CPU club must be allowed to take this on, and the player must be able to hold what they would get.
    return !cpuCapBlocksTrade(teamPayroll(fromTeam), incoming, outgoing) && teamPayroll(user) - incoming + outgoing <= SEASON_APRON;
  };
  if (!capFits(sendBackIds)) {
    // The largest contract that works for both sides: a huge one would rescue the CPU's books but could never
    // be absorbed by the player.
    const throwIn = [...fromTeam.players]
      .filter((item) => !sendBackIds.includes(item.id))
      .sort((a, b) => playerSalary(b) - playerSalary(a))
      .find((item) => capFits([...sendBackIds, item.id]));
    if (!throwIn) return null;
    sendBackIds = [...sendBackIds, throwIn.id];
  }
  // R89: an offer that can't be accepted is worse than no offer. executeTrade() runs
  // the same salary/value math on accept, so a dangled offer must already clear it —
  // same formulas, CPU perspective (salOut/ovrOut = what the CPU sends incl. picks).
  // Offers that fail here are never dangled instead of bouncing on accept.
  const pkgSalary = sendBackIds.reduce((sum, id) => sum + playerSalary(fromTeam.players.find((p) => p.id === id)), 0);
  const pkgOvr = sendBackIds.reduce((sum, id) => sum + overall(fromTeam.players.find((p) => p.id === id)), 0)
    + picks.reduce((sum, pick) => sum + pickValueOf(st, pick), 0);
  const mySalary = playerSalary(player);
  const myOvr = overall(player);
  const salaryOk = pkgSalary <= mySalary * 1.25 + 40 || mySalary <= pkgSalary * 1.25 + 40;
  const valueOk = pkgOvr + 4 >= myOvr * 0.9 || mySalary >= pkgSalary + 80;
  if (!salaryOk || !valueOk) return null;
  for (const pick of picks) usedPickIds.add(pick.id);
  const teamName = fromTeam.name || fromTeamId;
  const prefText = listingPrefText(pref);
  return {
    id: `${st.year}:${st.dayIndex || 0}:${fromTeamId}:${player.id}`,
    fromTeamId,
    fromTeamName: teamName,
    giveIds: [player.id],
    wantIds: sendBackIds,
    targetName: player.name,
    receivePlayers: sendBackIds.map((id) => fromTeam.players.find((p) => p.id === id)),
    offerPicks: picks,
    listingPref: pref,
    reason: !isListed
      ? `${player.name} 最近表现突出（${perGame(row, "pts").toFixed(1)} 分 / ${perGame(row, "plusMinus").toFixed(1)} +/-），${teamName} 主动来谈。`
      : pref === DEFAULT_LISTING_PREF
        ? `${player.name} 已挂牌询价，${teamName} 前来问价。`
        : `${player.name} 按「${prefText.label}」挂牌：${prefText.why}——${teamName} 前来问价。`,
    createdYear: st.year,
    createdDay: st.dayIndex || 0,
  };
}

/** Every pick attached to an offer is one the proposing club still holds (not traded on, not expired). */
function picksStillHeld(st, proposal) {
  const held = new Set(teamDraftAssets(st, proposal.fromTeamId).map((pick) => pick.id));
  return (proposal.offerPicks || []).every((pick) => held.has(pick.id));
}

export function ensureTradeProposals(st) {
  // Saved offers can go stale: the club traded a pick on, a season rolled over, or the offer came
  // from a version that attached invented picks. Refresh instead of letting an accept fail later.
  if (!Array.isArray(st.tradeProposals) || !st.tradeProposals.every((p) => picksStillHeld(st, p))) {
    st.tradeProposals = generateTradeProposals(st);
  }
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
  // The sweeteners are real picks, so they travel inside the trade itself (one all-or-nothing
  // validation, and the ledger records the new owner) instead of being added afterwards.
  const result = executeTrade(st, {
    giveIds: proposal.giveIds,
    wantIds: proposal.wantIds,
    wantPickIds: proposal.offerPicks.map((pick) => pick.id),
    cpuTeamId: proposal.fromTeamId,
    acceptedProposal: true,
  });
  if (!result.ok) return result;
  if (proposal.offerPicks.length) result.message = `${result.message}；另获 ${proposal.offerPicks.length} 个未来选秀权`;
  st.tradeLog.at(-1).proposalId = proposal.id;
  proposals.splice(proposals.indexOf(proposal), 1);
  return { ...result, proposal };
}
