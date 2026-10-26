/**
 * 挂牌出售倾向 -- what the user wants BACK when they list a player.
 *
 * Listing (tradeProposals.listPlayerForTrade) used to shape every offer the same way. A
 * preference now decides two explainable things for a listed player's proposal:
 *   1. which CPU team comes calling (rankTeams), and
 *   2. what that team sends back (shapeOffer: main player, prospect sweetener, pick count).
 * Proposals stay suggestions -- nothing here executes a trade.
 *
 * Pure functions over the season state; the DOM lives in app.js.
 */
import { overall } from "../data/players.js";
import { playerSalary, teamPayroll } from "./seasonMarket.js";

export const DEFAULT_LISTING_PREF = "any";
/** Upper bound on picks bundled into one proposal (shared with tradeProposals). */
export const MAX_PROPOSAL_PICKS = 3;

const avgOvr = (team) => {
  const players = team?.players || [];
  return players.length ? players.reduce((s, p) => s + overall(p), 0) / players.length : 0;
};
/** Higher = younger and further from its ceiling: the asset a rebuilding package leads with. */
export const prospectScore = (p) => (100 - overall(p)) + (Number(p.age) < 24 ? 18 : 0);
const closestOvr = (players, target) =>
  [...players].sort((a, b) => Math.abs(overall(a) - overall(target)) - Math.abs(overall(b) - overall(target)))[0];

/**
 * Each preference: labels, a one-line why, how to rank calling teams (higher = first), and how
 * to pick the return. `shape` returns { offer, prospect, pickDelta } or null when the team has
 * nothing that fits (the caller then skips the team instead of faking an offer).
 */
export const LISTING_PREFERENCES = {
  any: {
    label: "不限",
    labelEn: "No preference",
    why: "按身价对等找人",
    whyEn: "like-for-like value",
    rankTeam: () => 0,
    shape: null, // keep the generator's original like-for-like logic
  },
  picks: {
    label: "选秀权优先",
    labelEn: "Draft picks first",
    why: "重建队拿便宜球员填薪资，多给选秀权",
    whyEn: "a rebuilding team sends a cheap salary filler plus extra picks",
    rankTeam: (team) => -avgOvr(team),
    shape: (team) => ({
      offer: [...team.players].sort((a, b) => playerSalary(a) - playerSalary(b))[0],
      prospect: null,
      pickDelta: 2,
    }),
  },
  winNow: {
    label: "即战力优先",
    labelEn: "Win-now talent first",
    why: "换回对方能给出的最强现役球员，不搭新秀和选秀权",
    whyEn: "the best current player they will part with, no prospects or picks",
    rankTeam: (team) => avgOvr(team),
    shape: (team, player) => {
      const fair = team.players.filter((p) => overall(p) <= overall(player) + 3);
      const offer = [...fair].sort((a, b) => overall(b) - overall(a))[0];
      return offer ? { offer, prospect: null, pickDelta: -MAX_PROPOSAL_PICKS } : null; // no picks at all
    },
  },
  salary: {
    label: "配平工资 / 腾空间",
    labelEn: "Salary relief",
    why: "薪资空间最大的队接盘，回来的工资比送出的少",
    whyEn: "the team with the most cap room takes the contract; less salary comes back",
    rankTeam: (team) => -teamPayroll(team),
    shape: (team, player) => {
      const cheaper = team.players.filter((p) => playerSalary(p) < playerSalary(player));
      const offer = closestOvr(cheaper, player);
      return offer ? { offer, prospect: null, pickDelta: 0 } : null;
    },
  },
  youth: {
    label: "年轻潜力优先",
    labelEn: "Young upside first",
    why: "换回对方最好的年轻潜力股",
    whyEn: "their best young high-upside player comes back",
    rankTeam: (team) => Math.max(0, ...team.players.filter((p) => Number(p.age) < 25).map(prospectScore)),
    shape: (team) => {
      const young = team.players.filter((p) => Number(p.age) < 25);
      const offer = [...young].sort((a, b) => prospectScore(b) - prospectScore(a))[0];
      return offer ? { offer, prospect: null, pickDelta: 0 } : null;
    },
  },
};

export const isListingPref = (pref) => Object.hasOwn(LISTING_PREFERENCES, pref);

export function listingPref(st, playerId) {
  const pref = st?.listingPrefs?.[playerId];
  return isListingPref(pref) ? pref : DEFAULT_LISTING_PREF;
}

export function setListingPref(st, playerId, pref) {
  if (!isListingPref(pref)) return { ok: false, reason: "未知的出售倾向" };
  st.listingPrefs = { ...(st.listingPrefs || {}) };
  if (pref === DEFAULT_LISTING_PREF) delete st.listingPrefs[playerId];
  else st.listingPrefs[playerId] = pref;
  return { ok: true };
}

export function clearListingPref(st, playerId) {
  if (st?.listingPrefs) delete st.listingPrefs[playerId];
}

/** CPU [id, team] entries ordered by how well they fit the preference (stable for ties). */
export function rankTeams(cpuTeams, pref) {
  const rank = LISTING_PREFERENCES[pref]?.rankTeam || (() => 0);
  return cpuTeams
    .map((entry, index) => ({ entry, index, score: rank(entry[1]) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry }) => entry);
}

/** The return package for a listed player under `pref`, or null to use the default logic. */
export function shapeOffer(pref, team, player) {
  const shape = LISTING_PREFERENCES[pref]?.shape;
  return shape ? shape(team, player) : null;
}

export function listingPrefText(pref, lang = "zh") {
  const def = LISTING_PREFERENCES[pref] || LISTING_PREFERENCES[DEFAULT_LISTING_PREF];
  return lang === "en" ? { label: def.labelEn, why: def.whyEn } : { label: def.label, why: def.why };
}
