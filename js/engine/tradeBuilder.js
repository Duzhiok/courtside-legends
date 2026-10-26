/**
 * Trade-builder helper for the season/time-travel career market: given a CPU player the user
 * wants, suggest a salary-balanced package FROM the user's own roster (and, if needed, one of
 * their future picks) so the user doesn't have to manually hunt for a combination by hand.
 *
 * Pick ownership/pooling and the N-for-M executeTrade() plumbing itself live in seasonMarket.js
 * (executeTrade needs them directly, and this module importing them back would be a cycle). This
 * module only adds the "what should I offer" recommendation on top, kept pure and deterministic
 * so it's unit-testable without touching the DOM -- matches draftPickValue.js's own "deliberately
 * simple and explainable, not a hidden oracle" style.
 */
import { overall } from "../data/players.js";
import { estimateDraftPickValue } from "./draftPickValue.js";
import { pickValueOf, playerSalary, teamDraftAssets } from "./seasonMarket.js";
import { isProspectCandidate, prospectScore } from "./tradeProposals.js";

export { teamDraftAssets, pickValueOf };

/** Mirrors executeTrade()'s own acceptance math so a "recommended" package is actually acceptable. */
function packageWorks(salOut, salIn, ovrOut, ovrIn) {
  const salaryOk = salIn <= salOut * 1.25 + 40 || salOut <= salIn * 1.25 + 40;
  const valueOk = ovrIn + 4 >= ovrOut * 0.9 || salOut >= salIn + 80;
  return salaryOk && valueOk;
}

/**
 * Suggest a salary-balanced package FROM the user's roster that a CPU team would plausibly accept
 * in exchange for one of their players. Deliberately simple (closest-salary-match, then a 2-piece
 * fallback, then a pick sweetener) rather than an exhaustive combinatorial search -- matches the
 * project's existing "explainable, not a hidden oracle" style (see draftPickValue.js).
 */
export function recommendTradePackage(st, { cpuTeamId, wantPlayerId } = {}) {
  const you = st?.teams?.[st.userTeamId];
  const cpu = st?.teams?.[cpuTeamId];
  const want = cpu?.players?.find((p) => p.id === wantPlayerId);
  if (!you || !cpu || !want) return { ok: false, reason: "目标无效" };

  const wantSalary = playerSalary(want);
  const wantOvr = overall(want);
  const mine = [...(you.players || [])].filter((p) => p.id !== wantPlayerId);
  if (!mine.length) return { ok: false, reason: "我方没有可交易的球员" };

  // 1) A single piece whose salary already lands in the acceptance band, closest match first.
  const singleCandidates = mine
    .map((p) => ({ p, salary: playerSalary(p) }))
    .sort((a, b) => Math.abs(a.salary - wantSalary) - Math.abs(b.salary - wantSalary));
  for (const { p, salary } of singleCandidates) {
    if (packageWorks(salary, wantSalary, overall(p), wantOvr)) {
      return {
        ok: true,
        giveIds: [p.id],
        givePickIds: [],
        note: `${p.name} 薪资接近，预计对方能接受`,
      };
    }
  }

  // 2) Two pieces: cheapest-first combo, preferring a young prospect as the second piece so the
  // package reads as "a piece + a flier" rather than just dumping two regulars.
  const prospects = mine.filter(isProspectCandidate).sort((a, b) => prospectScore(b) - prospectScore(a));
  const nonProspects = mine
    .filter((p) => !isProspectCandidate(p))
    .sort((a, b) => Math.abs(playerSalary(a) - wantSalary) - Math.abs(playerSalary(b) - wantSalary));
  for (const anchor of nonProspects.slice(0, 3)) {
    for (const flier of prospects.slice(0, 3)) {
      if (anchor.id === flier.id) continue;
      const salOut = playerSalary(anchor) + playerSalary(flier);
      const ovrOut = overall(anchor) + overall(flier);
      if (packageWorks(salOut, wantSalary, ovrOut, wantOvr)) {
        return {
          ok: true,
          giveIds: [anchor.id, flier.id],
          givePickIds: [],
          note: `${anchor.name} + 潜力新秀 ${flier.name} 搭配，补齐薪资和身价`,
        };
      }
    }
  }

  // 3) Still short on value (not salary -- picks don't move salary): sweeten the single closest
  // match with one of our own future picks and see if that's enough to clear the value bar.
  const picks = teamDraftAssets(st, st.userTeamId);
  for (const { p, salary } of singleCandidates.slice(0, 3)) {
    for (const pick of picks) {
      const ovrOut = overall(p) + pickValueOf(st, pick);
      if (packageWorks(salary, wantSalary, ovrOut, wantOvr)) {
        return {
          ok: true,
          giveIds: [p.id],
          givePickIds: [pick.id],
          note: `${p.name} 加送 ${estimateDraftPickValue(pick, { currentYear: st.year }).label}，弥补身价差`,
        };
      }
    }
  }

  return { ok: false, reason: `${want.name} 身价/薪资太高，凑不出对方会接受的配平方案` };
}

export { packageWorks };
