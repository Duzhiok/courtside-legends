/**
 * Franchise Business — the team-side economy of GM Career: From Employee to Empire
 * (workstream F, user-approved 2026-11-10).
 *
 * Money is in $M (millions of dollars) unless a field says otherwise. Every number below is a
 * SIMULATED business parameter, clearly separated from historical facts: the only historical
 * inputs are the team identity, the roster (real cards via `players`) and the season year.
 * Team money and personal money are SEPARATE objects — this module only ever touches the
 * franchise side; personal wealth lives in ownership.js and the two meet only through the
 * defined flows (salary, dividends, equity purchases).
 *
 * Pure functions only: every function takes a business state and returns a new one.
 * The season engine is NOT here — `settleSeason` consumes a season result produced by the
 * real league engine ({ wins, losses, playoffRound, champion, starBref }) and turns it into
 * money. Nothing in this module simulates games.
 */
import { overall } from "../../data/players.js";

/** Home games in a regular season. */
export const HOME_GAMES = 41;
/** 1996-era reference ticket price ($). The demand curve is centred here. */
export const BASE_TICKET_PRICE = 30;
/** Franchise value for an average-market team before any performance adjustment ($M). */
export const BASE_VALUATION = 150;
/** Default arena capacity when a team has no recorded arena (simulated parameter). */
export const DEFAULT_CAPACITY = 18000;

/** Market sizes. Small markets fill fewer seats and attract less sponsorship. */
export const MARKET_SIZE = { small: -0.05, mid: 0, large: 0.05 };
export const MARKET_MULT = { small: 0.9, mid: 1.0, large: 1.2 };

/**
 * Recorded 1996 arena capacities (historical facts, seats). Teams not listed use
 * DEFAULT_CAPACITY — a simulated parameter, not a historical claim.
 */
export const ARENA_CAPACITY_1996 = {
  VAN: 19193, // GM Place, Vancouver
  TOR: 18800, // SkyDome (Raptors' temporary home)
  CHI: 21711, // United Center
  LAL: 17505, // Great Western Forum
  NYK: 19763, // Madison Square Garden
};

/** Simulated payroll bands by OVR ($M per season, 1996 scale). */
function salaryEstimate(player) {
  const ovr = overall(player);
  if (ovr >= 90) return 8;
  if (ovr >= 85) return 5;
  if (ovr >= 80) return 3;
  if (ovr >= 75) return 1.8;
  if (ovr >= 70) return 1;
  return 0.5;
}

/** Star appeal 0–1 from a real card: OVR and scoring carry it. */
export function starMarketability(player) {
  if (!player) return 0;
  const ovr = overall(player);
  const ppg = player?.raw?.ppg ?? player?.ppg ?? 0;
  return Math.max(0, Math.min(1, (ovr - 70) / 25 + Math.max(0, ppg - 15) / 100));
}

export function teamStarAppeal(players, teamId) {
  const roster = (players || []).filter((p) => p.team === teamId);
  return roster.reduce((best, p) => Math.max(best, starMarketability(p)), 0);
}

export function teamPayroll(players, teamId) {
  const roster = (players || []).filter((p) => p.team === teamId).slice(0, 12);
  return roster.reduce((sum, p) => sum + salaryEstimate(p), 0);
}

/**
 * Demand for seats as a fraction of capacity: winning and stars fill the building, price
 * empties it. priceFactor is centred on BASE_TICKET_PRICE so $30 is neutral in 1996.
 */
export function demandFraction({ ticketPrice, winPct, starAppeal, market = "mid" }) {
  const priceFactor = (ticketPrice - BASE_TICKET_PRICE) / 150;
  const winFactor = (winPct - 0.5) * 0.6;
  const starFactor = starAppeal * 0.15;
  const marketFactor = MARKET_SIZE[market] ?? 0;
  return Math.max(0.12, Math.min(1, 0.45 + winFactor + starFactor + marketFactor - priceFactor));
}

export function attendanceFor(state, { winPct, starAppeal }) {
  const fraction = demandFraction({
    ticketPrice: state.ticketPrice,
    winPct,
    starAppeal,
    market: state.market,
  });
  return Math.round(state.arena.capacity * fraction);
}

export function ticketRevenue(state, { winPct, starAppeal }) {
  const attendance = attendanceFor(state, { winPct, starAppeal });
  return (state.ticketPrice * attendance * HOME_GAMES) / 1e6;
}

/** Sponsorship deal kinds. Value is $M per season; conditions are checked at settlement. */
export const SPONSORSHIP_KINDS = {
  jersey: { label: "球衣广告", labelEn: "Jersey patch", base: 1.2 },
  arena: { label: "球馆冠名", labelEn: "Arena naming", base: 2.5 },
  brand: { label: "品牌合作", labelEn: "Brand partner", base: 0.8 },
};

/**
 * Deterministic offers for (team, season): same team + season + seed always offers the same
 * deals, so a reload cannot re-roll a better sponsor. Values scale with market, winning and
 * star appeal; the arena deal carries a win condition (a weak team is offered less, and a
 * losing season claws part of it back).
 */
export function sponsorshipOffers({ teamId, season, seed = 1, winPct = 0.4, starAppeal = 0, market = "mid" }) {
  let s = (seed >>> 0) ^ (season * 2654435761) ^ [...teamId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const marketMult = MARKET_MULT[market] ?? 1;
  const perfMult = 0.7 + winPct * 0.6 + starAppeal * 0.4;
  return Object.entries(SPONSORSHIP_KINDS).map(([kind, def]) => {
    const value = Math.round(def.base * marketMult * perfMult * (0.85 + rnd() * 0.3) * 100) / 100;
    return {
      id: `${teamId}-${season}-${kind}`,
      kind,
      teamId,
      season,
      value,
      // Arena naming pays in full only if the team wins 40%+; below that the sponsor claws back.
      condition: kind === "arena" ? { minWinPct: 0.4, clawback: 0.35 } : null,
    };
  });
}

export function signSponsorship(state, offer) {
  if (!offer || state.sponsorships.some((s) => s.kind === offer.kind)) {
    throw new Error("sponsorship kind already signed or invalid offer");
  }
  return { ...state, sponsorships: [...state.sponsorships, { ...offer, signedSeason: state.season }] };
}

export function sponsorshipRevenue(state, { winPct }) {
  return state.sponsorships.reduce((sum, deal) => {
    if (deal.condition && winPct < deal.condition.minWinPct) {
      return sum + deal.value * (1 - deal.condition.clawback);
    }
    return sum + deal.value;
  }, 0);
}

export function merchRevenue(state, { starAppeal, winPct }) {
  const marketMult = MARKET_MULT[state.market] ?? 1;
  return Math.round((2 + starAppeal * 6 + winPct * 3 + state.brand * 4) * marketMult * 100) / 100;
}

export function brandRevenue(state) {
  return Math.round(state.brand * 3 * 100) / 100;
}

export function operatingCosts(state, { payroll }) {
  const arenaOps = Math.round((state.arena.capacity / 1000) * 0.18 * 100) / 100;
  const staff = 2.5;
  return { payroll, arenaOps, staff, total: Math.round((payroll + arenaOps + staff) * 100) / 100 };
}

/** Team value ($M): market base, lifted by winning, titles and brand, plus arena value. */
export function teamValuation(state, { championships = 0, winPct = 0.5 } = {}) {
  const marketMult = MARKET_MULT[state.market] ?? 1;
  const perf = 1 + 0.35 * (winPct - 0.5) + 0.15 * championships + state.brand * 0.1;
  const arenaValue = Math.round(state.arena.capacity * 0.0012 * 100) / 100;
  return Math.round((BASE_VALUATION * marketMult * perf + arenaValue) * 100) / 100;
}

/**
 * Create the franchise side of an executive career. `season` is the first season year.
 * operatingBudget is team money ($M) — never personal cash.
 */
export function createBusinessState({
  teamId,
  teamName,
  season,
  market = "mid",
  ticketPrice = BASE_TICKET_PRICE,
  operatingBudget = 25,
  capacity,
} = {}) {
  if (!teamId || !Number.isInteger(season)) throw new TypeError("teamId and season are required");
  return {
    teamId,
    teamName: teamName || teamId,
    season,
    market,
    ticketPrice,
    operatingBudget,
    arena: {
      capacity: capacity ?? ARENA_CAPACITY_1996[teamId] ?? DEFAULT_CAPACITY,
      level: 1, // 1 standard, 2 renovated, 3 expanded/new
      name: null,
    },
    sponsorships: [],
    brand: 0, // 0–1, grows with winning, stars and marketing
    fanLoyalty: 0.7, // 0–1; relocation/rebrand hurt it, winning restores it
    championships: 0,
    history: [], // settled seasons: { season, wins, losses, ticket, sponsorship, merch, brand, costs, profit, valuation }
    valuation: BASE_VALUATION * (MARKET_MULT[market] ?? 1),
  };
}

/** Set the average ticket price ($). Demand responds next settlement — no instant effect. */
export function setTicketPrice(state, price) {
  if (!Number.isFinite(price) || price < 5 || price > 300) {
    throw new RangeError("ticket price must be between $5 and $300");
  }
  return { ...state, ticketPrice: price };
}

/**
 * Settle one season of franchise business from a REAL season result produced by the league
 * engine. `seasonResult`: { wins, losses, playoffRound (null when missed), champion, starBref }.
 * Brand and fan loyalty move with results; profit lands in the operating budget.
 */
export function settleSeason(state, seasonResult, { players = [] } = {}) {
  const { wins = 0, losses = 0, playoffRound = null, champion = false } = seasonResult || {};
  const games = wins + losses;
  const winPct = games ? wins / games : 0.5;
  const starAppeal = teamStarAppeal(players, state.teamId);
  const payroll = teamPayroll(players, state.teamId);
  const ticket = Math.round(ticketRevenue(state, { winPct, starAppeal }) * 100) / 100;
  const sponsorship = Math.round(sponsorshipRevenue(state, { winPct }) * 100) / 100;
  const merch = merchRevenue(state, { starAppeal, winPct });
  const brandRev = brandRevenue(state);
  const costs = operatingCosts(state, { payroll });
  const profit = Math.round((ticket + sponsorship + merch + brandRev - costs.total) * 100) / 100;
  const championships = state.championships + (champion ? 1 : 0);
  const brand = Math.max(0, Math.min(1, state.brand + (winPct - 0.5) * 0.12 + (champion ? 0.15 : 0) + (playoffRound ? 0.04 : 0)));
  const fanLoyalty = Math.max(0.2, Math.min(1, state.fanLoyalty + (winPct - 0.5) * 0.08 - (state.relocationHangover ? 0.1 : 0)));
  const valuation = teamValuation({ ...state, championships, brand }, { championships, winPct });
  const record = {
    season: state.season,
    wins,
    losses,
    playoffRound,
    champion,
    ticket,
    sponsorship,
    merch,
    brand: brandRev,
    costs: costs.total,
    profit,
    valuation,
  };
  return {
    ...state,
    season: state.season + 1,
    operatingBudget: Math.round((state.operatingBudget + profit) * 100) / 100,
    championships,
    brand,
    fanLoyalty,
    valuation,
    relocationHangover: Math.max(0, (state.relocationHangover || 0) - 1),
    history: [...state.history, record],
  };
}

/** Renovate the arena: pay now, better experience (more demand, more sponsorship) from next season. */
export function renovateArena(state, { cost = 12 } = {}) {
  if (state.arena.level >= 2) throw new Error("arena is already renovated or better");
  if (state.operatingBudget < cost) throw new Error("operating budget cannot cover the renovation");
  return {
    ...state,
    operatingBudget: Math.round((state.operatingBudget - cost) * 100) / 100,
    arena: { ...state.arena, level: 2 },
    brand: Math.min(1, state.brand + 0.05),
  };
}

/** Expand the arena: pay now, +2,500 seats from next season. */
export function expandArena(state, { cost = 30, seats = 2500 } = {}) {
  if (state.arena.level >= 3) throw new Error("arena is already expanded or new");
  if (state.operatingBudget < cost) throw new Error("operating budget cannot cover the expansion");
  return {
    ...state,
    operatingBudget: Math.round((state.operatingBudget - cost) * 100) / 100,
    arena: { ...state.arena, level: 3, capacity: state.arena.capacity + seats },
    brand: Math.min(1, state.brand + 0.08),
  };
}

/**
 * Relocate the team: a new market, a big bill, and fans who do not forgive quickly.
 * Attendance demand drops for two seasons (relocationHangover) and fan loyalty takes a hit;
 * the new market's size decides the long-term upside.
 */
export function relocateTeam(state, { city, market, cost = 40 } = {}) {
  if (!city || !(market in MARKET_SIZE)) throw new TypeError("relocation needs a city and a valid market size");
  if (state.operatingBudget < cost) throw new Error("operating budget cannot cover the relocation");
  return {
    ...state,
    operatingBudget: Math.round((state.operatingBudget - cost) * 100) / 100,
    market,
    teamName: city,
    fanLoyalty: Math.max(0.2, state.fanLoyalty - 0.25),
    relocationHangover: 2,
    arena: { ...state.arena, level: 1 },
  };
}

/**
 * Rebrand: new name, jersey and logo. New-market upside (merch + brand) against a
 * traditional-fan backlash (loyalty down, demand soft for a season).
 */
export function rebrandTeam(state, { name }) {
  if (!name) throw new TypeError("rebrand needs a new team name");
  return {
    ...state,
    teamName: name,
    brand: Math.min(1, state.brand + 0.06),
    fanLoyalty: Math.max(0.2, state.fanLoyalty - 0.12),
    rebrandSeason: state.season,
  };
}
