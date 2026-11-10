/**
 * GM scouting intel — the GM career's information layer (workstream C).
 *
 * Three information layers, in the order a GM actually sees them:
 *   1. Public info — age, position, size, archetype, current OVR, profile line.
 *   2. Scout estimate — a potential RANGE from one of three scouts. Scouts can
 *      be wrong and can disagree with each other; the player decides whom to
 *      trust. A range is shown, never a number.
 *   3. Deep investigation (tryout) — a narrower band plus work-ethic / injury /
 *      character clues. Limited: TRYOUT_BUDGET per scenario.
 *
 * Hidden potential is the alternate-timeline truth: the player's REAL career
 * peak is only the prior; a seeded draw around it decides this timeline's
 * ceiling, so drafting Kobe in 1996 does not guarantee he reaches his
 * historical achievements. Team environment, training, minutes, injuries
 * and randomness all matter (see projectThreeYears).
 *
 * STABLE EXPORTS: workstream G (Career Network — the scout career role)
 * consumes this module READ-ONLY. Do not rename exports or change return
 * shapes without coordinating with G. This module builds no scout-career
 * role, no scout progression, no recommend-to-GM flow — that is G's.
 *
 * No sim.js, no new dice: every random draw comes from a seeded stream, so
 * the same seed reproduces the same potentials, reports and projection.
 * GameSim stays the sole authority on game results — the three-year review
 * is a labelled season-level PROJECTION (see projectThreeYears), not a
 * claim about games played.
 */
import { overall, PLAYERS } from "../../data/players.js";
import { rookieClassForYear } from "../../engine/leagueDraft.js";
import { clamp, hashSeed, seededStream } from "../../core/seededRandom.js";

/** The scenario: Charlotte Hornets, 1996 draft, holding picks #8 and #13. */
export const DRAFT_YEAR = 1996;
export const GAMBLE_TEAM_ID = "CHH";
export const GAMBLE_TEAM_NAME = "Charlotte Hornets";
export const GAMBLE_TEAM_NAME_ZH = "夏洛特黄蜂";
export const USER_PICK_NUMBERS = [8, 13];
/** Slot order, pick 1 to 14. CHH holds #8 and #13 (the fiction: Charlotte
 * acquired New Jersey's #8 before the draft); every other slot belongs to
 * the team that held it in 1996. */
export const SLOT_ORDER = [
  "PHI", "TOR", "VAN", "MIL", "MIN", "BOS", "LAC",
  "CHH", "NJN", "DAL", "IND", "GSW", "CHH", "CLE",
];
/** The 14 prospects on the board: the real 1996 lottery class (top 13) plus
 * Steve Nash, the #15 pick every scout argued about. Brefs only — OVRs,
 * ages and peaks are read from the roster at build time, never hardcoded. */
export const FEATURED_BOARD = [
  "iversal01", "cambyma01", "abdursh01", "marbust01", "allenra02",
  "walkean02", "wrighlo02", "kittlke01", "walkesa01", "dampier01",
  "fulleto02", "potapvi01", "bryanko01", "nashst01",
];
export const TRYOUT_BUDGET = 3;
export const GAMBLE_SEED_DEFAULT = "draft-gamble-1996";

/** Potential bands — the only form in which potential is ever displayed.
 * A band label, never a number, is what a scout report shows. */
export const POTENTIAL_BANDS = [
  { id: "bust", min: 0, max: 59, zh: "水货风险", en: "Bust risk" },
  { id: "rotation", min: 60, max: 69, zh: "轮换级别", en: "Rotation level" },
  { id: "starter", min: 70, max: 79, zh: "首发级别", en: "Starter level" },
  { id: "star", min: 80, max: 89, zh: "全明星级别", en: "All-Star level" },
  { id: "franchise", min: 90, max: 99, zh: "基石级别", en: "Franchise level" },
];

export function potentialBandFor(ovr) {
  const value = clamp(Math.round(ovr), 0, 99);
  return POTENTIAL_BANDS.find((b) => value >= b.min && value <= b.max) || POTENTIAL_BANDS[0];
}

/**
 * The three scouts. `noise` is the standard deviation of the scout's error
 * (OVR points); `bias` is a deterministic function of the prospect — the
 * veteran trusts size and production and distrusts raw youth, the analyst
 * trusts production and distrusts small samples, the regional scout has no
 * bias but twice the variance, so he sometimes spots the gem and sometimes
 * misses badly. All three are seeded, so the same seed gives the same read.
 */
export const SCOUTS = [
  {
    id: "veteran",
    name: "老派球探",
    nameEn: "Veteran Scout",
    style: "eye",
    noise: 6,
    reportHalfWidth: 5,
    bias: (card) => {
      let b = 0;
      if (["C", "PF"].includes(card?.pos)) b += 4;
      if ((card?.raw?.ppg || 0) >= 15) b += 3;
      if ((card?.age ?? 99) <= 19) b -= 5;
      return b;
    },
  },
  {
    id: "analytics",
    name: "数据分析师",
    nameEn: "Analytics Scout",
    style: "data",
    noise: 5,
    reportHalfWidth: 5,
    bias: (card) => {
      let b = 0;
      if ((card?.age ?? 99) <= 19) b -= 6;
      if (overall(card) >= 70) b += 3;
      if (overall(card) < 55) b -= 3;
      return b;
    },
  },
  {
    id: "regional",
    name: "区域球探",
    nameEn: "Regional Scout",
    style: "gut",
    noise: 11,
    reportHalfWidth: 8,
    bias: () => 0,
  },
];

export function scoutById(id) {
  return SCOUTS.find((s) => s.id === id) || null;
}

/** Public info — everything a GM sees before any scout is hired. */
export function publicInfo(card) {
  if (!card) return null;
  const raw = card.raw || {};
  return {
    bref: card.bref,
    name: card.name || card.nameEn || card.bref,
    nameEn: card.nameEn || card.name || card.bref,
    pos: card.pos || "SF",
    age: Number.isFinite(card.age) ? card.age : null,
    heightCm: card.heightCm || null,
    weightKg: card.weightKg || null,
    archetype: card.archetype || "connector",
    ovr: overall(card),
    line: {
      ppg: raw.ppg ?? null,
      rpg: raw.rpg ?? null,
      apg: raw.apg ?? null,
      mpg: raw.mpg ?? null,
      gp: raw.gp ?? null,
    },
  };
}

/**
 * The real-career prior: the best OVR the player ever reached on a real
 * card, and the season he reached it. Historical performance is a prior,
 * never a fixed outcome — deriveHiddenPotential draws around it.
 */
export function careerPeak(card, players = PLAYERS) {
  if (!card?.bref) return null;
  const ladder = (players || []).filter((c) => c?.bref === card.bref);
  if (!ladder.length) return null;
  let peak = -1;
  let peakSeason = null;
  for (const c of ladder) {
    const ovr = overall(c);
    if (ovr > peak) {
      peak = ovr;
      peakSeason = Number(c.season) || null;
    }
  }
  return { peak, peakSeason, seasons: ladder.length };
}

/**
 * The alternate-timeline truth: this timeline's ceiling for the prospect.
 * Seeded uniform noise in [-8, +6] around the real peak — busts are more
 * likely than miracles, and a 17-year-old's timeline is genuinely open.
 * The returned number lives in scenario state only; reports and the UI
 * never render it (see scoutReports / runTryout, which return bands).
 */
export function deriveHiddenPotential(card, players = PLAYERS, seed = GAMBLE_SEED_DEFAULT) {
  const prior = careerPeak(card, players);
  const priorPeak = prior ? prior.peak : overall(card) + 10;
  const rng = seededStream(hashSeed(`${seed}|potential|${card?.bref || card?.id || "?"}`));
  const noise = Math.round(-8 + rng() * 14);
  const potential = clamp(priorPeak + noise, 45, 99);
  return { potential, priorPeak, noise, priorSeason: prior?.peakSeason ?? null };
}

/** A seeded near-normal draw: mean 0, sd ~ `sd`, from three uniforms. */
function normalDraw(rng, sd) {
  return ((rng() + rng() + rng()) / 3 - 0.5) * 2 * sd * 1.5;
}

function noteFor(scout, card, band) {
  const young = (card?.age ?? 99) <= 20;
  const productive = (card?.raw?.ppg || 0) >= 15;
  const big = ["C", "PF"].includes(card?.pos);
  const growth = Number(card?.growth) || 0;
  if (scout.id === "veteran") {
    if (young && band.id !== "bust") return { zh: "年轻，身体天赋肉眼可见，但没经过大学比赛检验。", en: "Young, the physical tools are obvious, but untested above high school." };
    if (big && productive) return { zh: "尺寸和产量都在，内线基本盘扎实。", en: "Size and production are both there; a solid frontcourt base." };
    if (productive) return { zh: "即战力没问题，得分手段已经成型。", en: "Ready to contribute now; the scoring package is already formed." };
    return { zh: "技术有亮点，但要看他能不能适应 NBA 的对抗。", en: "Flashes of skill, but the question is whether he holds up to NBA physicality." };
  }
  if (scout.id === "analytics") {
    if (young) return { zh: "样本太小，模型对高中生一直不准。", en: "Sample too small — the model has never been reliable on high-schoolers." };
    if (productive && band.id !== "bust") return { zh: "产量支撑得住效率，数据面没有硬伤。", en: "Production backs up the efficiency; nothing in the numbers objects." };
    if (growth >= 90) return { zh: "成长曲线陡峭，训练回报率很高。", en: "Steep growth curve; the training return looks high." };
    return { zh: "数据平淡，上限要靠训练和环境硬推。", en: "Flat numbers; the ceiling depends on training and environment." };
  }
  if (young && band.id !== "bust") return { zh: "我看过他一场高中比赛——那场之后我就忘不了他。", en: "I saw one high-school game of his — I haven't forgotten it since." };
  if (growth >= 90) return { zh: "训练馆里最后一个走的人，这种孩子别轻易放过。", en: "Last one out of the gym. Don't let a kid like that walk away." };
  return { zh: "直觉上他有东西，但我拿不出更多证据。", en: "My gut says there's something there, but I can't prove it yet." };
}

/**
 * One scout's read on one prospect. Returns a BAND ({min, max}, plus the
 * band label of the estimate) and a confidence — never the estimate itself.
 * `hidden` is the { potential } object from deriveHiddenPotential.
 */
export function scoutEstimate(scout, card, hidden, seed = GAMBLE_SEED_DEFAULT) {
  const rng = seededStream(hashSeed(`${seed}|scout|${scout.id}|${card?.bref || card?.id || "?"}`));
  const estimate = clamp(
    Math.round(hidden.potential + scout.bias(card) + normalDraw(rng, scout.noise)),
    40,
    99,
  );
  const half = scout.reportHalfWidth;
  const band = potentialBandFor(estimate);
  const confidence = half <= 5 ? "medium" : "low";
  return {
    scoutId: scout.id,
    bref: card?.bref,
    range: { min: clamp(estimate - half, 40, 99), max: clamp(estimate + half, 40, 99) },
    band: band.id,
    bandZh: band.zh,
    bandEn: band.en,
    confidence,
    note: noteFor(scout, card, band),
  };
}

/** All three scouts on every prospect. Pure; same seed → same reports. */
export function scoutReports(prospects, hiddenByBref, seed = GAMBLE_SEED_DEFAULT) {
  const reports = {};
  for (const prospect of prospects || []) {
    const card = prospect?.player || prospect;
    const hidden = hiddenByBref?.[card?.bref];
    if (!card || !hidden) continue;
    reports[card.bref] = SCOUTS.map((scout) => scoutEstimate(scout, card, hidden, seed));
  }
  return reports;
}

/**
 * Deep investigation: one tryout on one prospect. Narrows the band to ±2
 * and adds three clues — work ethic (from the card's growth), injury risk
 * (seeded; a flagged prospect carries real downside in the projection) and
 * character (from the card's personality). Consumes one tryout from the
 * scenario budget; the caller enforces TRYOUT_BUDGET.
 */
export function runTryout(card, hidden, seed = GAMBLE_SEED_DEFAULT) {
  const rng = seededStream(hashSeed(`${seed}|tryout|${card?.bref || card?.id || "?"}`));
  const half = 2;
  const estimate = clamp(Math.round(hidden.potential + normalDraw(rng, 3)), 40, 99);
  const growth = Number(card?.growth) || 0;
  const workEthic = growth >= 92
    ? { zh: "训练态度极佳，教练组一致好评。", en: "Outstanding work ethic; the coaches rave about him." }
    : growth >= 80
      ? { zh: "训练态度积极，不偷懒。", en: "Works hard in practice; no coasting." }
      : { zh: "训练态度一般，需要有人推着走。", en: "Average motor in practice; needs pushing." };
  const injuryRisk = rng() < 0.12;
  const injury = injuryRisk
    ? { zh: "体检发现一处旧伤隐患，未来可能缺席比赛。", en: "The medical flags an old knock; he may miss games down the line." }
    : { zh: "体检干净，没有已知的伤病隐患。", en: "Clean medical; no known injury concern." };
  const personality = card?.personality || {};
  const character = (personality.ego ?? 50) >= 80
    ? { zh: "自信心极强，更衣室里很有存在感。", en: "Supreme confidence; a big presence in the locker room." }
    : (personality.team ?? 50) >= 70
      ? { zh: "团队型球员，愿意为队友做脏活累活。", en: "Team-first player; happy to do the dirty work." }
      : { zh: "性格安静，场上话不多。", en: "Quiet character; says little on the court." };
  return {
    bref: card?.bref,
    range: { min: clamp(estimate - half, 40, 99), max: clamp(estimate + half, 40, 99) },
    band: potentialBandFor(estimate).id,
    clues: { workEthic, injury, character },
    injuryRisk,
  };
}

/**
 * Build the gamble scenario from the roster. Returns the featured prospects
 * in leagueDraft shape (so selectDraftProspect / frontOfficePick /
 * advanceDraftToUserPick work on them unchanged), the hidden potentials,
 * the scout reports, the fixed-slot draft state and a minimal season
 * fixture the draft engine functions need.
 *
 * The draft state is built by hand in createDraftState's shape with a FIXED
 * slot order (no lottery re-draw): the scenario owns picks #8 and #13.
 */
export function buildGamble({ players = PLAYERS, seed = GAMBLE_SEED_DEFAULT } = {}) {
  const pool = rookieClassForYear(DRAFT_YEAR, { seed, minimumSize: SLOT_ORDER.length, players });
  const byBref = new Map(pool.map((p) => [p.bref, p]));
  const prospects = FEATURED_BOARD.map((bref) => byBref.get(bref)).filter(Boolean);
  if (prospects.length !== FEATURED_BOARD.length) {
    const missing = FEATURED_BOARD.filter((bref) => !byBref.has(bref));
    throw new Error(`1996 featured board is missing prospects: ${missing.join(", ")}`);
  }
  // Consensus display order: current OVR desc, then bref for stability.
  prospects.sort((a, b) => overall(b.player) - overall(a.player) || String(a.bref).localeCompare(String(b.bref)));

  const hiddenByBref = {};
  for (const prospect of prospects) {
    hiddenByBref[prospect.bref] = deriveHiddenPotential(prospect.player, players, seed);
  }
  const reports = scoutReports(prospects, hiddenByBref, seed);

  // The scenario roster is the 12-man rotation (top 12 by OVR). The real
  // 1997 Hornets carried 14 cards; trimming the two deepest bench spots
  // leaves room for both draft picks without forcing a waiver decision in
  // the slice, and it cannot change team strength (the projection reads
  // the top 8 only).
  const roster = (players || [])
    .filter((c) => Number(c.season) === DRAFT_YEAR + 1 && c.team === GAMBLE_TEAM_ID)
    .sort((a, b) => overall(b) - overall(a))
    .slice(0, 12);

  const teamIds = [...new Set(SLOT_ORDER)];
  const teams = {};
  for (const id of teamIds) teams[id] = { players: id === GAMBLE_TEAM_ID ? roster.map((c) => ({ ...c })) : [] };
  const season = {
    year: DRAFT_YEAR,
    userTeamId: GAMBLE_TEAM_ID,
    league: { teamIds },
    teams,
    standings: Object.fromEntries(teamIds.map((id) => [id, { w: 0, l: 0, pf: 0, pa: 0 }])),
    freeAgents: [],
  };
  const draft = {
    year: DRAFT_YEAR,
    seed,
    rounds: 1,
    round: 1,
    order: [...SLOT_ORDER],
    picks: SLOT_ORDER.map((teamId) => ({ sourceTeamId: teamId, ownerTeamId: teamId })),
    prospects: [...prospects],
    currentPick: 0,
    selections: [],
    status: "in_progress",
  };
  return { prospects, hiddenByBref, reports, roster, draft, season };
}

// ---------------------------------------------------------------------------
// Three-year projection (labelled 推演 — not GameSim results)
// ---------------------------------------------------------------------------

/** League mean top-8 OVR in 1996-97 (measured from roster.json), the
 * anchor for the expected-wins formula. */
export const LEAGUE_MEAN_TOP8 = 61.8;
export const WINS_PER_OVR = 4;
export const PLAYOFF_WINS = 42;
export const PROJECTION_YEARS = [1997, 1998, 1999];

export function roleForOvr(ovr) {
  if (ovr >= 75) return "star";
  if (ovr >= 65) return "starter";
  if (ovr >= 55) return "rotation";
  return "bench";
}

export const ROLE_MINUTES = { bench: 8, rotation: 16, starter: 28, star: 34 };
export const ROLE_LABEL = {
  bench: { zh: "板凳末端", en: "Bench" },
  rotation: { zh: "轮换", en: "Rotation" },
  starter: { zh: "首发", en: "Starter" },
  star: { zh: "核心", en: "Star" },
};

function growthRateFor(role, age) {
  const byMinutes = { bench: 0.1, rotation: 0.16, starter: 0.22, star: 0.25 }[role] || 0.1;
  // Young players grow faster — the same shape as GROWTH_AGE_TABLE
  // (≤21 fastest, then tapering); the projection's own rate table, not XP.
  const ageFactor = age <= 21 ? 1.15 : age <= 24 ? 1.0 : 0.8;
  return byMinutes * ageFactor;
}

function projectPlayerSeasons({ card, potential, seed, years = PROJECTION_YEARS, injuryRisk = false }) {
  const rng = seededStream(hashSeed(`${seed}|project|${card?.bref || card?.id || "?"}`));
  let ovr = overall(card);
  const age0 = Number(card?.age) || 20;
  const seasons = [];
  for (let i = 0; i < years.length; i++) {
    const role = roleForOvr(ovr);
    const minutes = ROLE_MINUTES[role];
    // A tryout-flagged injury risk roughly doubles the per-season chance.
    const injuryChance = (minutes >= 30 ? 0.15 : 0.1) * (injuryRisk ? 2 : 1);
    const injured = rng() < injuryChance;
    const games = injured ? 55 : 78;
    const gap = potential - ovr;
    let gain = 0;
    if (gap > 0) {
      gain = clamp(
        Math.round(gap * growthRateFor(role, age0 + i) + (rng() - 0.5) * 3),
        0,
        8,
      );
      if (injured) gain = Math.floor(gain / 2);
    }
    const before = ovr;
    ovr = clamp(ovr + gain, 40, 99);
    seasons.push({
      year: years[i],
      ovr,
      role,
      minutes,
      games,
      injured,
      gain: ovr - before,
      breakout: ovr - before >= 6,
    });
  }
  return { bref: card?.bref, name: card?.name || card?.nameEn, seasons, finalOvr: ovr, rookieOvr: overall(card) };
}

function teamWinsFor(rosterCards) {
  const top8 = [...(rosterCards || [])].sort((a, b) => overall(b) - overall(a)).slice(0, 8);
  if (!top8.length) return 41;
  const strength = top8.reduce((sum, c) => sum + overall(c), 0) / top8.length;
  return clamp(Math.round(41 + (strength - LEAGUE_MEAN_TOP8) * WINS_PER_OVR), 10, 70);
}

/**
 * Simulate three years after the draft — a season-level PROJECTION, not
 * GameSim results (a full-league GameSim sim runs ~158ms/game on this VM;
 * three seasons is ~9 minutes). Inputs are real: rookie OVRs from the
 * cards, hidden potentials from this timeline, minutes from role, injuries
 * from a seeded draw. Outputs are labelled 推演 everywhere they are shown.
 *
 * `drafted` is [{ card, pickNumber }]; `passed` is the prospects the player
 * could have taken but didn't (their teams develop them at league-average
 * environment). `roster` is the GM's 1996-97 roster cards (drafted rookies
 * are added to it as they grow, replacing the weakest bench spots).
 * `injuryFlags` is { [bref]: true } from tryouts — a flagged prospect
 * carries a doubled per-season injury chance in the projection.
 */
export function projectThreeYears({ drafted = [], passed = [], roster = [], seed = GAMBLE_SEED_DEFAULT, injuryFlags = {}, players = PLAYERS } = {}) {
  const hidden = {};
  for (const d of [...drafted, ...passed]) {
    hidden[d.card.bref] = deriveHiddenPotential(d.card, players, seed);
  }
  const draftedProjections = drafted.map((d) => ({
    ...projectPlayerSeasons({ card: d.card, potential: hidden[d.card.bref].potential, seed, injuryRisk: !!injuryFlags[d.card.bref] }),
    pickNumber: d.pickNumber,
  }));
  const passedProjections = passed.map((p) => ({
    ...projectPlayerSeasons({ card: p.card, potential: hidden[p.card.bref].potential, seed, injuryRisk: !!injuryFlags[p.card.bref] }),
    pickNumber: p.pickNumber ?? null,
  }));

  // Team record: each year the drafted rookies sit in the rotation at their
  // current OVR; the top 8 decide the strength, hence the wins.
  const teamYears = [];
  const teamCards = (roster || []).map((c) => ({ ...c }));
  for (let i = 0; i < PROJECTION_YEARS.length; i++) {
    for (const proj of draftedProjections) {
      const season = proj.seasons[i];
      const existing = teamCards.find((c) => c.bref === proj.bref);
      if (existing) {
        // Grow the card's attributes proportionally to the OVR gain so the
        // top-8 strength reflects the rookie's development.
        const gain = season.ovr - overall(existing);
        if (gain > 0) {
          for (const attr of ["scoring", "three", "mid", "paint", "defense", "rebound", "pass", "speed", "strength", "stamina", "iq", "clutch", "steal", "block"]) {
            existing[attr] = clamp(Math.round((existing[attr] || 50) + gain), 35, 99);
          }
        }
      } else {
        teamCards.push({ ...drafted.find((d) => d.card.bref === proj.bref)?.card, _projectedOvr: season.ovr });
      }
    }
    const wins = teamWinsFor(teamCards);
    teamYears.push({ year: PROJECTION_YEARS[i], wins, losses: 82 - wins, playoffs: wins >= PLAYOFF_WINS });
  }

  const yourSum = draftedProjections.reduce((s, p) => s + p.finalOvr, 0);
  const missedSum = passedProjections.reduce((s, p) => s + p.finalOvr, 0);
  const diff = yourSum - missedSum;
  const starDrafted = draftedProjections.some((p) => p.finalOvr >= 85);
  const missedStar = passedProjections.some((p) => p.finalOvr >= 85);
  let grade = "B";
  if (starDrafted && diff >= 0) grade = "A";
  else if (missedStar && !starDrafted) grade = "C";
  else if (diff >= 5) grade = "A";
  else if (diff >= -2) grade = "B";
  else if (diff >= -8) grade = "C";
  else grade = "D";
  return {
    years: PROJECTION_YEARS,
    drafted: draftedProjections,
    passed: passedProjections,
    team: teamYears,
    verdict: { grade, diff, yourSum, missedSum, starDrafted, missedStar },
  };
}

/** Validate a saved gamble state (root.gmDraftGamble). Invalid → discard. */
export function validGambleState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  if (state.version !== 1) return false;
  if (typeof state.seed !== "string" || !state.seed) return false;
  if (!["scout", "draft", "review"].includes(state.phase)) return false;
  return true;
}
