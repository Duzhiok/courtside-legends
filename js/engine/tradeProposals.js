import { overall } from "../data/players.js";
import { BUZZ_EXTRA_PICK } from "../career/balance.js";
import { buzzBonus, buzzKey, buzzOf, isHot } from "../career/buzz.js";
import { SEASON_APRON, SEASON_MAX_ROSTER, SEASON_MIN_ROSTER, cpuCapBlocksTrade, executeTrade, pickValueOf, playerSalary, teamDraftAssets, teamPayroll } from "./seasonMarket.js";
import { parsePickId } from "./pickLedger.js";
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

/** A player teams call about. Hot (C4) is enough on its own: a bench man's 30-point night draws calls too. */
function isAttractive(row, player, buzz) {
  return overall(player) >= 78 || perGame(row, "pts") >= 14 || perGame(row, "plusMinus") >= 1.5 || isHot(buzz);
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
    .filter(({ player, row }) => !listedIds.has(player.id) && isAttractive(row, player, buzzOf(st, player.id)))
    // The market ranks by what it would pay, so a hot player moves up the call list.
    .sort((a, b) => overall(b.player) + buzzBonus(buzzOf(st, b.player.id)) - overall(a.player) - buzzBonus(buzzOf(st, a.player.id)));
  const targets = [...listed, ...attractive];
  const proposals = [];
  const usedPickIds = new Set();
  const cpuTeams = Object.entries(st.teams).filter(([id, team]) => id !== st.userTeamId && team?.players?.length);
  // A target nobody can make a valid offer for (a huge contract against the hard cap) must not use up one
  // of the `limit` slots: keep going down the list until enough real offers are out.
  for (let i = 0; i < Math.min(targets.length, cpuTeams.length) && proposals.length < limit; i++) {
    const target = targets[i];
    const pref = target.listed ? listingPref(st, target.player.id) : DEFAULT_LISTING_PREF;
    const rotate = i + (st.dayIndex || 0);
    const hot = pref === DEFAULT_LISTING_PREF && buzzBonus(buzzOf(st, target.player.id)) > 0;
    // No preference: the original single rotating caller -- unless he is hot (C4): every club is asked,
    // in rotation order, until one can afford him (a hard cap rules most clubs out for a big contract).
    // With a preference: try the three best-fitting teams (rotated so refreshes vary) until one fits.
    const callers = pref === DEFAULT_LISTING_PREF
      ? (hot ? cpuTeams.map((_, k) => cpuTeams[(rotate + k) % cpuTeams.length]) : [cpuTeams[rotate % cpuTeams.length]])
      : rankTeams(cpuTeams, pref).slice(0, 3).map((_, k, top) => top[(k + rotate) % top.length]);
    for (const [fromTeamId, fromTeam] of callers) {
      const args = { ...target, pref, index: i, fromTeamId, fromTeam, declined, usedPickIds };
      // A hot player's price-up can fail the salary check (a better player costs more); then he still
      // gets the ordinary offer rather than none at all.
      const proposal = buildProposal(st, { ...args, boost: true })
        || (hot ? buildProposal(st, { ...args, boost: false }) : null);
      if (proposal) {
        proposals.push(proposal);
        break;
      }
    }
  }
  return proposals;
}

/** Deterministic counter tilt: the same proposal id always counters the same way. */
function tiltOf(id) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return ((h % 3) + 3) % 3; // 0 sweeten, 1 swap lead player, 2 harden (ask more)
}

/** Post-trade roster sizes for both clubs; both must stay within 8–15. */
export function tradeRosterOk(userCount, cpuCount, giveCount, wantCount) {
  const userAfter = userCount - giveCount + wantCount;
  const cpuAfter = cpuCount - wantCount + giveCount;
  return (
    userAfter >= SEASON_MIN_ROSTER && userAfter <= SEASON_MAX_ROSTER &&
    cpuAfter >= SEASON_MIN_ROSTER && cpuAfter <= SEASON_MAX_ROSTER
  );
}

/**
 * What the CPU asks on top of the target: the user's nearest 2nd-rounder first
 * (a cheap sweetener), else the lowest-OVR bench player (never a starter, never
 * the target). "auto" asks only when the CPU package clearly overpays (+12 OVR);
 * "force" asks regardless (round-2 hardening); "drop" never asks.
 */
function computeAsk(st, user, target, pkgOvr, mode) {
  const none = { playerObjs: [], pickObjs: [] };
  if (mode === "drop") return none;
  if (mode !== "force" && pkgOvr < overall(target) + 12) return none;
  const second = teamDraftAssets(st, st.userTeamId)
    .map((pick) => ({ pick, slot: parsePickId(pick.id) }))
    .filter(({ slot }) => slot?.round === 2)
    .sort((a, b) => (a.slot.year || 0) - (b.slot.year || 0))[0];
  if (second) return { playerObjs: [], pickObjs: [second.pick] };
  const starters = new Set(user.starterIds || []);
  const bench = (user.players || [])
    .filter((p) => p.id !== target.id && !starters.has(p.id))
    .sort((a, b) => overall(a) - overall(b))[0];
  return bench ? { playerObjs: [bench], pickObjs: [] } : none;
}

/** One CPU team's offer for one of the user's players, or null if it can't make a valid one. */
function buildProposal(st, { player, row, listed: isListed, pref, fromTeamId, fromTeam, declined, usedPickIds, boost = false, excludeOfferIds = [], pickCountForce = null, askMode = "auto", keepAsk = null }) {
  const shaped = shapeOffer(pref, fromTeam, player);
  if (pref !== DEFAULT_LISTING_PREF && !shaped) return null;
  // C4: a hot player is priced up -- but only on the house-picked offer. A listing preference is the
  // user's explicit ask (picks / salary relief / ...), and buzz doesn't override it.
  const buzz = boost && !shaped ? buzzOf(st, player.id) : 0;
  const bonus = buzzBonus(buzz);
  const worth = overall(player) + bonus;
  let offerPlayer = shaped?.offer;
  if (!offerPlayer) {
    const pool = [...fromTeam.players].filter((p) => !excludeOfferIds.includes(p.id));
    const candidate = pool
      .sort((a, b) => Math.abs(overall(a) - worth) - Math.abs(overall(b) - worth))[0];
    if (!candidate) return null;
    const salaryDelta = playerSalary(candidate) - playerSalary(player);
    offerPlayer = salaryDelta <= 0 || salaryDelta < 60 ? candidate : [...pool].sort((a, b) => playerSalary(a) - playerSalary(b))[0];
    if (!offerPlayer) return null;
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
  if (buzz >= BUZZ_EXTRA_PICK) pickCount += 1;
  pickCount = Math.max(0, Math.min(MAX_PROPOSAL_PICKS, pickCount + (shaped?.pickDelta || 0)));
  if (pickCountForce != null) pickCount = Math.max(0, Math.min(MAX_PROPOSAL_PICKS, pickCountForce));
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
  // The CPU's ask, on top of the target: "keep" reuses round 1's ask verbatim
  // (round-2 swap) when it is still held / on the roster, else falls back to auto.
  let askPlayerObjs = [];
  let askPickObjs = [];
  if (askMode === "keep" && keepAsk) {
    askPickObjs = (keepAsk.pickIds || [])
      .map((id) => teamDraftAssets(st, st.userTeamId).find((p) => p.id === id))
      .filter(Boolean);
    askPlayerObjs = (keepAsk.playerIds || [])
      .map((id) => user.players.find((p) => p.id === id))
      .filter((p) => p && p.id !== player.id);
    if (!askPickObjs.length && !askPlayerObjs.length && (keepAsk.pickIds?.length || keepAsk.playerIds?.length)) askMode = "auto";
  }
  if (askMode !== "keep" && askMode !== "drop") {
    const pkgOvrBase = sendBackIds.reduce((sum, id) => sum + overall(fromTeam.players.find((p) => p.id === id)), 0)
      + picks.reduce((sum, pick) => sum + pickValueOf(st, pick), 0);
    const ask = computeAsk(st, user, player, pkgOvrBase, askMode);
    askPlayerObjs = ask.playerObjs;
    askPickObjs = ask.pickObjs;
  }
  // R89: an offer that can't be accepted is worse than no offer. Dangled offers
  // bypass executeTrade()'s value check on accept (acceptedProposal), so check()
  // below is a user-fairness filter over TOTALS (target + ask vs package incl.
  // picks), not executeTrade's CPU-perspective math. Roster size
  // is checked the same way: a dangled offer must leave both clubs within 8–15,
  // or it would bounce on accept exactly like the old cap-only gap did.
  // Patch-ups, in violation order: too many coming back (or too few left for the
  // CPU) drops the prospect; too few left for the user (or too many for the CPU)
  // drops the ask player; an unfair/cap-breaking package drops the whole ask.
  // The throw-in is never dropped: the cap fix above depends on it.
  let prospectId = prospect?.id || null;
  const check = () => {
    const giveCount = 1 + askPlayerObjs.length;
    const wantCount = sendBackIds.length;
    const userAfter = user.players.length - giveCount + wantCount;
    const cpuAfter = fromTeam.players.length - wantCount + giveCount;
    const rosterOk = tradeRosterOk(user.players.length, fromTeam.players.length, giveCount, wantCount);
    const givenSalary = playerSalary(player) + askPlayerObjs.reduce((sum, p) => sum + playerSalary(p), 0);
    const pkgSalary = sendBackIds.reduce((sum, id) => sum + playerSalary(fromTeam.players.find((p) => p.id === id)), 0);
    const givenOvr = overall(player) + askPlayerObjs.reduce((sum, p) => sum + overall(p), 0)
      + askPickObjs.reduce((sum, pick) => sum + pickValueOf(st, pick), 0);
    const pkgOvr = sendBackIds.reduce((sum, id) => sum + overall(fromTeam.players.find((p) => p.id === id)), 0)
      + picks.reduce((sum, pick) => sum + pickValueOf(st, pick), 0);
    const capOk = teamPayroll(user) - givenSalary + pkgSalary <= SEASON_APRON
      && !cpuCapBlocksTrade(teamPayroll(fromTeam), givenSalary, pkgSalary);
    const salaryOk = pkgSalary <= givenSalary * 1.25 + 40 || givenSalary <= pkgSalary * 1.25 + 40;
    // User-fairness filter for dangled offers (NOT executeTrade's math): a dangled
    // offer bypasses executeTrade's value check on accept (acceptedProposal), so
    // this guarantees the user is not ripped off instead — package within 90% of
    // what the user gives. It deliberately differs in perspective from
    // executeTrade's CPU acceptance; do not "fix" it to match.
    const valueOk = pkgOvr + 4 >= givenOvr * 0.9 || givenSalary >= pkgSalary + 80;
    return { ok: rosterOk && capOk && salaryOk && valueOk, userAfter, cpuAfter, capOk, fairOk: salaryOk && valueOk };
  };
  for (let guard = 0; guard < 4; guard++) {
    const v = check();
    if (v.ok) break;
    if ((v.userAfter > SEASON_MAX_ROSTER || v.cpuAfter < SEASON_MIN_ROSTER) && prospectId && sendBackIds.includes(prospectId)) {
      sendBackIds = sendBackIds.filter((id) => id !== prospectId);
      prospectId = null;
      continue;
    }
    if ((v.userAfter < SEASON_MIN_ROSTER || v.cpuAfter > SEASON_MAX_ROSTER) && askPlayerObjs.length) {
      askPlayerObjs = [];
      continue;
    }
    if ((!v.capOk || !v.fairOk) && (askPlayerObjs.length || askPickObjs.length)) {
      askPlayerObjs = [];
      askPickObjs = [];
      continue;
    }
    return null;
  }
  if (!check().ok) return null;
  for (const pick of picks) usedPickIds.add(pick.id);
  const teamName = fromTeam.name || fromTeamId;
  const prefText = listingPrefText(pref);
  const baseReason = bonus > 0
    ? `${player.name} 刚打出高光，正在风口上（热度 ${buzz.toFixed(1)}）——${teamName} 愿意加价，报价约上浮 +${bonus} OVR。热度几场后会回落，要谈趁早。`
    : !isListed
    ? `${player.name} 最近表现突出（${perGame(row, "pts").toFixed(1)} 分 / ${perGame(row, "plusMinus").toFixed(1)} +/-），${teamName} 主动来谈。`
    : pref === DEFAULT_LISTING_PREF
      ? `${player.name} 已挂牌询价，${teamName} 前来问价。`
      : `${player.name} 按「${prefText.label}」挂牌：${prefText.why}——${teamName} 前来问价。`;
  const askNote = askPlayerObjs.length || askPickObjs.length
    ? `对方还要求：${[...askPlayerObjs.map((p) => p.name), ...(askPickObjs.length ? [`${askPickObjs.length} 个未来选秀权`] : [])].join(" + ")}。`
    : "";
  return {
    id: `${st.year}:${st.dayIndex || 0}:${fromTeamId}:${player.id}`,
    fromTeamId,
    fromTeamName: teamName,
    giveIds: [player.id, ...askPlayerObjs.map((p) => p.id)],
    wantIds: sendBackIds,
    targetName: player.name,
    receivePlayers: sendBackIds.map((id) => fromTeam.players.find((p) => p.id === id)),
    offerPicks: picks,
    askPickIds: askPickObjs.map((p) => p.id),
    round: 1,
    listingPref: pref,
    // Set only when buzz really raised the ask, so the card never claims a price-up it didn't make.
    buzz: bonus > 0 ? { value: buzz, bonus } : null,
    reason: askNote ? `${baseReason} ${askNote}` : baseReason,
    createdYear: st.year,
    createdDay: st.dayIndex || 0,
  };
}

/** Every pick attached to an offer is one the proposing club still holds (not traded on, not expired). */
function picksStillHeld(st, proposal) {
  const held = new Set(teamDraftAssets(st, proposal.fromTeamId).map((pick) => pick.id));
  if (!(proposal.offerPicks || []).every((pick) => held.has(pick.id))) return false;
  // A pick the CPU asks FROM the user must still be the user's, or the deal is stale.
  const userHeld = new Set(teamDraftAssets(st, st.userTeamId).map((pick) => pick.id));
  return (proposal.askPickIds || []).every((id) => userHeld.has(id));
}

/** Regenerate and remember what the market looked like (who was hot) when these offers were made. */
function storeProposals(st) {
  st.tradeProposals = generateTradeProposals(st);
  st.tradeProposalsBuzz = buzzKey(st);
  return st.tradeProposals;
}

export function ensureTradeProposals(st) {
  // Saved offers can go stale: the club traded a pick on, a season rolled over, or the offer came
  // from a version that attached invented picks. Refresh instead of letting an accept fail later.
  // Buzz is the other way they go stale: after a big night the offers must rise, and once he cools
  // the generous ones must go -- or "hot for three games" would really mean "hot until you refresh".
  const stale = !Array.isArray(st.tradeProposals)
    || !st.tradeProposals.every((p) => picksStillHeld(st, p))
    || (st.tradeProposalsBuzz ?? "") !== buzzKey(st);
  return stale ? storeProposals(st) : st.tradeProposals;
}

export function refreshTradeProposals(st) {
  return storeProposals(st);
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
  // A pick the CPU asked FROM the user travels the same way, in the other direction.
  const result = executeTrade(st, {
    giveIds: proposal.giveIds,
    wantIds: proposal.wantIds,
    givePickIds: proposal.askPickIds || [],
    wantPickIds: proposal.offerPicks.map((pick) => pick.id),
    cpuTeamId: proposal.fromTeamId,
    acceptedProposal: true,
  });
  if (!result.ok) return result;
  if (proposal.offerPicks.length) result.message = `${result.message}；另获 ${proposal.offerPicks.length} 个未来选秀权`;
  if ((proposal.askPickIds || []).length) result.message = `${result.message}；另送出 ${proposal.askPickIds.length} 个未来选秀权`;
  st.tradeLog.at(-1).proposalId = proposal.id;
  proposals.splice(proposals.indexOf(proposal), 1);
  return { ...result, proposal };
}

/**
 * Round 2: the user pushes back on a round-1 offer and the same club revises it.
 * The revision REPLACES round 1 (user decision: 二轮替换一轮) — same list slot,
 * same id, round: 2 — and there is no round 3. The tilt is deterministic from
 * the proposal id: sweeten (one more pick, ask dropped), swap the lead player
 * (round 1's ask kept verbatim when still available), or harden (ask more).
 * A revision that would be identical to round 1 falls through to the next tilt;
 * if no tilt produces a different valid package, round 1 stands and the counter
 * honestly reports that the club won't budge. The superseded round-1 shape is
 * remembered as declined so a market refresh cannot resurrect it.
 */
export function counterTradeProposal(st, proposalId) {
  const proposals = ensureTradeProposals(st);
  const index = proposals.findIndex((proposal) => proposal.id === proposalId);
  if (index < 0) return { ok: false, reason: "报价已不存在" };
  const current = proposals[index];
  if ((current.round || 1) >= 2) return { ok: false, reason: "已经是第二轮，没有第三轮" };
  const user = st.teams[st.userTeamId];
  const fromTeam = st.teams[current.fromTeamId];
  const target = user?.players?.find((p) => p.id === current.giveIds[0]);
  if (!user || !fromTeam || !target) return { ok: false, reason: "报价已不存在" };
  const declined = new Set(st.declinedTradeSignatures || []);
  declined.delete(tradeSignature(current.fromTeamId, target.id, current.wantIds[0]));
  const row = st.playerSeason?.[`${st.userTeamId}:${target.id}`];
  const listed = (st.listedPlayerIds || []).includes(target.id);
  // Picks already dangled in OTHER live offers are off-limits for the revision,
  // or accepting two offers could promise the same pick twice.
  const reservedPickIds = new Set(
    proposals.flatMap((p) => (p.id === current.id ? [] : (p.offerPicks || []).map((pick) => pick.id)))
  );
  const samePackage = (a, b) =>
    a.giveIds.join(",") === b.giveIds.join(",") &&
    a.wantIds.join(",") === b.wantIds.join(",") &&
    a.offerPicks.map((p) => p.id).join(",") === b.offerPicks.map((p) => p.id).join(",") &&
    (a.askPickIds || []).join(",") === (b.askPickIds || []).join(",");
  const tilt = tiltOf(current.id);
  for (const t of [tilt, (tilt + 1) % 3, (tilt + 2) % 3]) {
    const args = {
      player: target, row, listed,
      pref: current.listingPref || DEFAULT_LISTING_PREF,
      fromTeamId: current.fromTeamId, fromTeam, declined, usedPickIds: reservedPickIds,
    };
    let revision = null;
    if (t === 0) {
      revision = buildProposal(st, { ...args, pickCountForce: Math.min(MAX_PROPOSAL_PICKS, current.offerPicks.length + 1), askMode: "drop" });
    } else if (t === 1) {
      revision = buildProposal(st, {
        ...args,
        excludeOfferIds: [current.wantIds[0]],
        pickCountForce: current.offerPicks.length,
        askMode: "keep",
        keepAsk: { playerIds: current.giveIds.slice(1), pickIds: current.askPickIds || [] },
      });
    } else {
      revision = buildProposal(st, { ...args, pickCountForce: current.offerPicks.length, askMode: "force" });
    }
    if (!revision || samePackage(revision, current)) continue;
    const note = t === 0 ? "对方在第二轮加了价" : t === 1 ? "对方在第二轮换了主筹码" : "对方在第二轮咬得更紧，还多要了东西";
    revision = { ...revision, id: current.id, round: 2, reason: `${current.reason} 第二轮谈判：${note}。` };
    st.declinedTradeSignatures = Array.isArray(st.declinedTradeSignatures) ? st.declinedTradeSignatures : [];
    const sig = tradeSignature(current.fromTeamId, target.id, current.wantIds[0]);
    if (!st.declinedTradeSignatures.includes(sig)) st.declinedTradeSignatures.push(sig);
    proposals[index] = revision;
    st.tradeLog = Array.isArray(st.tradeLog) ? st.tradeLog : [];
    st.tradeLog.push({ type: "trade_countered", year: st.year, day: st.dayIndex || 0, proposalId: current.id, from: current.fromTeamId, target: target.name, round: 2 });
    return { ok: true, proposal: revision };
  }
  return { ok: false, reason: "对方不肯再谈，这份报价保持不变" };
}
