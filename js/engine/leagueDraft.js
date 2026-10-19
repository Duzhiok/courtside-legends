import { overall, PLAYERS } from "../data/players.js";

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

export function createDraftState({ season, seed, players = PLAYERS } = {}) {
  requireSeed(seed);
  const order = generateDraftOrder(season, { seed });
  const year = requireYear(season.year, "season.year");
  const prospects = rookieClassForYear(year, {
    seed,
    minimumSize: order.length,
    players,
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

export function rookieContractForPick(pickNumber, year) {
  if (!Number.isInteger(pickNumber) || pickNumber <= 0) {
    throw new TypeError("pickNumber must be a positive integer");
  }
  requireYear(year);
  return {
    kind: "rookie-scale",
    signedYear: year,
    pickNumber,
    salary: Math.max(45, 190 - (pickNumber - 1) * 5),
    yearsRemaining: 4,
    rookieScale: true,
  };
}

function activePick(draft, season) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new TypeError("draft must be an object");
  }
  if (draft.status !== "in_progress") {
    throw new Error("draft must be active and in progress");
  }
  if (!season || typeof season !== "object" || Array.isArray(season)) {
    throw new TypeError("season must be a non-null object");
  }
  if (!Array.isArray(draft.order) || !draft.order.length) {
    throw new Error("draft order must be a non-empty array");
  }
  if (!Array.isArray(draft.prospects) || !Array.isArray(draft.selections)) {
    throw new Error("draft prospects and selections must be arrays");
  }
  if (
    !Number.isInteger(draft.currentPick) ||
    draft.currentPick < 0 ||
    draft.currentPick >= draft.order?.length
  ) {
    throw new Error("draft current pick is invalid");
  }
  const teamId = draft.order[draft.currentPick];
  const team = season?.teams?.[teamId];
  if (!team || !Array.isArray(team.players)) {
    throw new Error(`draft team "${teamId}" must have a players roster`);
  }
  if (team.players.length > 15) {
    throw new Error(`draft team "${teamId}" roster exceeds 15 players`);
  }
  return { teamId, team };
}

function stablePlayerId(player) {
  return String(player?.bref || player?.id || "");
}

function waiverValue(player) {
  return overall(player) - Math.min(Number(player?.age) || 0, 40) * 0.25;
}

function waiverCandidate(players) {
  return players
    .filter((player) => player?._rookie !== true)
    .sort(
      (left, right) =>
        waiverValue(left) - waiverValue(right) ||
        stablePlayerId(left).localeCompare(stablePlayerId(right)),
    )[0];
}

/**
 * Returns an immutable draft wrapper while intentionally mutating the nested
 * season roster for compatibility with the existing season engines.
 */
export function selectDraftProspect(draft, season, prospectId) {
  const { teamId, team } = activePick(draft, season);
  if (typeof prospectId !== "string" || !prospectId) {
    throw new TypeError("prospectId must be a non-empty string");
  }
  const prospectIndexes = draft.prospects
    .map((prospect, index) => prospect?.prospectId === prospectId ? index : -1)
    .filter((index) => index >= 0);
  if (prospectIndexes.length === 0) {
    throw new Error(`prospect "${prospectId}" is not available`);
  }
  if (prospectIndexes.length > 1) {
    throw new Error(`prospect "${prospectId}" must be unique`);
  }
  const prospectIndex = prospectIndexes[0];
  if (
    draft.selections?.some(
      (selection) =>
        selection.prospectId === prospectId ||
        (selection.bref && selection.bref === draft.prospects[prospectIndex].bref),
    )
  ) {
    throw new Error(`prospect "${prospectId}" has already been selected`);
  }

  const prospect = draft.prospects[prospectIndex];
  if (!prospect.player || typeof prospect.player !== "object") {
    throw new Error(`prospect "${prospectId}" must contain a player`);
  }
  const waivedPlayer = team.players.length === 15
    ? waiverCandidate(team.players)
    : null;
  if (team.players.length === 15 && !waivedPlayer) {
    throw new Error("full all-rookie roster has no eligible player to waive");
  }
  if (
    waivedPlayer &&
    season.freeAgents != null &&
    !Array.isArray(season.freeAgents)
  ) {
    throw new TypeError("season.freeAgents must be an array");
  }

  const pickNumber = draft.currentPick + 1;
  const contract = rookieContractForPick(pickNumber, draft.year);
  const rookie = clone(prospect.player);
  if (prospect.source === "generated") {
    delete rookie.photo;
    delete rookie.nbaId;
  }
  Object.assign(rookie, {
    contract: clone(contract),
    salary: contract.salary,
    _rookie: true,
    _draftYear: draft.year,
    _draftPick: pickNumber,
    team: teamId,
  });

  let waived = null;
  if (waivedPlayer) {
    const waiverIndex = team.players.indexOf(waivedPlayer);
    team.players.splice(waiverIndex, 1);
    season.freeAgents ||= [];
    const waivedId = stablePlayerId(waivedPlayer);
    if (!season.freeAgents.some((player) => stablePlayerId(player) === waivedId)) {
      season.freeAgents.push(waivedPlayer);
    }
    waived = {
      id: waivedPlayer.id,
      bref: waivedPlayer.bref,
      name: waivedPlayer.name || waivedPlayer.nameEn || waivedId,
    };
  }
  team.players.push(rookie);

  const nextPick = draft.currentPick + 1;
  return {
    ...draft,
    prospects: draft.prospects.filter((_, index) => index !== prospectIndex),
    selections: [
      ...(draft.selections || []),
      {
        pickNumber,
        teamId,
        prospectId,
        bref: prospect.bref,
        name: prospect.name,
        source: prospect.source,
        contract: clone(contract),
        waived,
      },
    ],
    currentPick: nextPick,
    status: nextPick >= draft.order.length ? "complete" : "in_progress",
  };
}

function positionCount(team, position) {
  return team.players.filter(
    (player) => (player.pos || player.playPos) === position,
  ).length;
}

function cpuScore(draft, season, prospect) {
  const teamId = draft.order[draft.currentPick];
  const count = positionCount(season.teams[teamId], prospect.pos);
  const need = count < 2 ? 80 : count < 3 ? 35 : 0;
  return {
    score: overall(prospect.player) * 10 + prospect.potential * 2 + need,
    tie: hash32(`${draft.seed}|${teamId}|${draft.currentPick + 1}|${prospect.prospectId}`),
  };
}

export function advanceDraftToUserPick(draft, season) {
  let next = draft;
  while (
    next?.status === "in_progress" &&
    next.order[next.currentPick] !== season?.userTeamId
  ) {
    activePick(next, season);
    if (!Array.isArray(next.prospects) || next.prospects.length === 0) {
      throw new Error("active draft has no available prospects");
    }
    const selected = [...next.prospects].sort((left, right) => {
      const a = cpuScore(next, season, left);
      const b = cpuScore(next, season, right);
      return (
        b.score - a.score ||
        b.tie - a.tie ||
        left.prospectId.localeCompare(right.prospectId)
      );
    })[0];
    next = selectDraftProspect(next, season, selected.prospectId);
  }
  return next;
}
