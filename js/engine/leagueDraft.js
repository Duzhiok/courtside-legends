import { PLAYERS } from "../data/players.js";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const ATTRIBUTES = [
  "scoring",
  "three",
  "mid",
  "paint",
  "defense",
  "rebound",
  "pass",
  "speed",
  "strength",
  "stamina",
  "iq",
  "clutch",
  "steal",
  "block",
];
const FIRST_NAMES = [
  "Adrian", "Cameron", "Darius", "Elijah", "Isaiah", "Jalen", "Jordan", "Malik",
  "Micah", "Noah", "Terrence", "Xavier",
];
const LAST_NAMES = [
  "Banks", "Brooks", "Carter", "Daniels", "Ellis", "Foster", "Hayes", "Lewis",
  "Mitchell", "Reed", "Turner", "Walker",
];

function requireYear(year, label = "year") {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new TypeError(`${label} must be an integer between 1900 and 9999`);
  }
  return year;
}

function requireSeed(seed) {
  const validNumber = typeof seed === "number" && Number.isFinite(seed);
  const validString = typeof seed === "string" && seed.length > 0;
  if (!validNumber && !validString) {
    throw new TypeError("seed must be a finite number or non-empty string");
  }
  return seed;
}

function hash32(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = hash32(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, minimum, maximum) {
  return minimum + Math.floor(rng() * (maximum - minimum + 1));
}

function clone(value) {
  return structuredClone(value);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cardRating(player) {
  const values = ATTRIBUTES.map((key) => Number(player?.[key])).filter(Number.isFinite);
  if (!values.length) return 60;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function scoutingFor(player, key) {
  const current = cardRating(player);
  const potential = clamp(current + 8 + (hash32(`${key}|potential`) % 16), 50, 99);
  const uncertainty = 4 + (hash32(`${key}|uncertainty`) % 5);
  return {
    potential,
    scoutingRange: {
      min: clamp(potential - uncertainty, 40, 98),
      max: clamp(potential + uncertainty, 51, 99),
    },
  };
}

function historicalProspect(year, player, seed) {
  const copied = clone(player);
  const bref = String(copied.bref);
  const scouting = scoutingFor(copied, `${seed}|${year}|${bref}`);
  return {
    prospectId: `historical-${year}-${bref}`,
    bref,
    name: copied.name || copied.nameEn || bref,
    pos: copied.pos || copied.playPos || "SF",
    source: "historical-debut",
    player: copied,
    ...scouting,
  };
}

function generatedProspect(year, index, seed) {
  const prospectId = `generated-${year}-${index}`;
  const rng = seededRandom(`${seed}|${prospectId}`);
  const pos = POSITIONS[randomInt(rng, 0, POSITIONS.length - 1)];
  const name = `${FIRST_NAMES[randomInt(rng, 0, FIRST_NAMES.length - 1)]} ${
    LAST_NAMES[randomInt(rng, 0, LAST_NAMES.length - 1)]
  }`;
  const player = {
    id: prospectId,
    bref: prospectId,
    name,
    nameEn: name,
    season: year + 1,
    team: null,
    pos,
    age: randomInt(rng, 19, 22),
  };

  const positionBias = {
    PG: { pass: 10, speed: 7, block: -12, strength: -5 },
    SG: { scoring: 7, three: 7, rebound: -4 },
    SF: { scoring: 4, defense: 4, strength: 2 },
    PF: { paint: 8, rebound: 8, strength: 7, speed: -4, pass: -4 },
    C: { paint: 10, defense: 7, rebound: 11, block: 13, strength: 9, three: -10, speed: -7 },
  }[pos];
  for (const attribute of ATTRIBUTES) {
    const base = randomInt(rng, 48, 78);
    player[attribute] = clamp(base + (positionBias[attribute] || 0), 35, 95);
  }

  player.heightCm = {
    PG: randomInt(rng, 180, 195),
    SG: randomInt(rng, 190, 203),
    SF: randomInt(rng, 198, 210),
    PF: randomInt(rng, 203, 216),
    C: randomInt(rng, 208, 226),
  }[pos];
  player.weightKg = {
    PG: randomInt(rng, 78, 94),
    SG: randomInt(rng, 84, 101),
    SF: randomInt(rng, 91, 108),
    PF: randomInt(rng, 100, 120),
    C: randomInt(rng, 108, 137),
  }[pos];

  const scouting = scoutingFor(player, `${seed}|${prospectId}`);
  return {
    prospectId,
    bref: prospectId,
    name,
    pos,
    source: "generated",
    player,
    ...scouting,
  };
}

/**
 * Build the debut class entering the season after the supplied draft year.
 */
export function rookieClassForYear(
  year,
  { seed, minimumSize, players = PLAYERS } = {},
) {
  requireYear(year);
  requireSeed(seed);
  if (!Number.isInteger(minimumSize) || minimumSize < 0) {
    throw new TypeError("minimumSize must be a non-negative integer");
  }
  if (!Array.isArray(players)) {
    throw new TypeError("players must be an array");
  }

  const earliestByBref = new Map();
  for (const player of players) {
    if (!player || typeof player !== "object") continue;
    const bref = typeof player.bref === "string" ? player.bref.trim() : "";
    const season = Number(player.season);
    if (!bref || !Number.isInteger(season)) continue;
    const previous = earliestByBref.get(bref);
    if (
      !previous ||
      season < Number(previous.season) ||
      (season === Number(previous.season) &&
        String(player.id || "") < String(previous.id || ""))
    ) {
      earliestByBref.set(bref, player);
    }
  }

  const historical = [...earliestByBref.values()]
    .filter((player) => Number(player.season) === year + 1)
    .sort((left, right) => {
      const leftHash = hash32(`${seed}|${year}|${left.bref}`);
      const rightHash = hash32(`${seed}|${year}|${right.bref}`);
      return leftHash - rightHash || String(left.bref).localeCompare(String(right.bref));
    })
    .map((player) => historicalProspect(year, player, seed));

  const generated = [];
  for (let index = 0; historical.length + generated.length < minimumSize; index++) {
    generated.push(generatedProspect(year, index, seed));
  }
  return [...historical, ...generated];
}

function seasonTeamIds(season) {
  if (!season || typeof season !== "object" || Array.isArray(season)) {
    throw new TypeError("season must be a non-null object");
  }
  requireYear(season.year, "season.year");
  const ids =
    Array.isArray(season.league?.teamIds) && season.league.teamIds.length
      ? [...season.league.teamIds]
      : Object.keys(season.teams || {});
  if (!ids.length || ids.some((id) => typeof id !== "string" || !id.trim())) {
    throw new TypeError("season team list must contain non-empty team ids");
  }
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("season team ids must be unique; duplicate id found");
  }
  if (!season.teams || typeof season.teams !== "object" || Array.isArray(season.teams)) {
    throw new TypeError("season teams must be an object");
  }
  if (!season.standings || typeof season.standings !== "object" || Array.isArray(season.standings)) {
    throw new TypeError("season standings must be an object");
  }
  for (const id of ids) {
    if (!season.teams[id] || typeof season.teams[id] !== "object") {
      throw new TypeError(`season team "${id}" is missing`);
    }
    const record = season.standings[id];
    if (
      !record ||
      !Number.isFinite(record.w) ||
      !Number.isFinite(record.l) ||
      record.w < 0 ||
      record.l < 0
    ) {
      throw new TypeError(`season standings for "${id}" must contain non-negative wins and losses`);
    }
  }
  return ids;
}

function recordValue(season, id) {
  const record = season.standings[id];
  const games = record.w + record.l;
  return {
    pct: games ? record.w / games : 0,
    wins: record.w,
    diff: (Number(record.pf) || 0) - (Number(record.pa) || 0),
  };
}

function worseFirst(season, seed) {
  return (left, right) => {
    const a = recordValue(season, left);
    const b = recordValue(season, right);
    return (
      a.pct - b.pct ||
      a.wins - b.wins ||
      a.diff - b.diff ||
      hash32(`${seed}|tie|${left}`) - hash32(`${seed}|tie|${right}`) ||
      left.localeCompare(right)
    );
  };
}

/**
 * Seeded weighted lottery for the bottom half, followed by inverse standings.
 */
export function generateDraftOrder(season, { seed } = {}) {
  requireSeed(seed);
  const ids = seasonTeamIds(season);
  const ranked = [...ids].sort(worseFirst(season, seed));
  const lotterySize = Math.min(14, Math.ceil(ranked.length / 2));
  const lotteryPool = ranked.slice(0, lotterySize).map((id, rank) => ({
    id,
    weight: lotterySize - rank,
  }));
  const rng = seededRandom(`${seed}|${season.year}|draft-order`);
  const order = [];

  while (lotteryPool.length) {
    const total = lotteryPool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * total;
    let selectedIndex = lotteryPool.length - 1;
    for (let index = 0; index < lotteryPool.length; index++) {
      roll -= lotteryPool[index].weight;
      if (roll < 0) {
        selectedIndex = index;
        break;
      }
    }
    order.push(lotteryPool[selectedIndex].id);
    lotteryPool.splice(selectedIndex, 1);
  }
  return [...order, ...ranked.slice(lotterySize)];
}

export function createDraftState({ season, seed } = {}) {
  requireSeed(seed);
  const order = generateDraftOrder(season, { seed });
  const year = requireYear(season.year, "season.year") + 1;
  const prospects = rookieClassForYear(year, {
    seed,
    minimumSize: order.length,
  });
  return {
    year,
    seed,
    order,
    prospects,
    currentPick: 0,
    selections: [],
    status: "in_progress",
  };
}
