/**
 * Legend Duel 1v1 sim — standalone, pure, deterministic.
 *
 * A small half-court DuelSim for Legend Duel (D1: My Team card vs a legend).
 * It is deliberately NOT the 5v5 GameSim: 1v1 has no teammates, no picks, no
 * team rebounds, so it gets its own lightweight possession rules. It reuses
 * the game's existing scales instead of inventing new ones:
 * - player ratings are the 2K 0-100 attributes from js/data/players.js
 *   (shooting/finishing/handles/defense/strength/speed/stamina; see
 *   cardToDuelist in duelStore.js for the card -> duelist mapping),
 * - skills are the real skill ids from js/data/skills.js,
 * - randomness is js/core/seededRandom.js (hashSeed + seededStream), so the
 *   same seed + the same choices replay identically.
 *
 * Rules (approved 2026-11-09):
 * - half-court 1v1, first to 11, win by 2; a 15-point cap ends runaway ties
 *   (at 15 the leader wins; a 15-15 tie plays on, next score wins).
 * - inside the arc = 1 point (Drive / Midrange / Post), outside = 2 (Outside Shot).
 * - every shot ends the possession: a made basket switches the ball, and a
 *   miss does too (the defender takes it) — possessions strictly alternate.
 * - per possession the player picks 1 of 4 offense choices on their ball, or
 *   1 of 3 defense choices on the legend's ball; the legend (CPU) picks by a
 *   simple difficulty-dependent policy.
 * - attributes + skills + stamina affect outcomes. There are NO guaranteed
 *   shots and NO artificial accuracy bonuses: the make probability is always
 *   clamped to [0.08, 0.92].
 * - difficulty changes ONLY the legend: a rating multiplier, a small make
 *   offset on the legend's own shots, and how sharply the CPU counters the
 *   player. The challenger's dice are never touched.
 * - stamina: the shooter spends stamina per shot and the defender recovers
 *   a little while defending; the drain is slower for high-stamina players
 *   (8 - staminaAttr/25 per shot, recovery 2 + staminaAttr/50). Low current
 *   stamina scales the shooter's make probability down (x0.82 at 0, x1.00
 *   at 100).
 */
import { hashSeed, seededStream, clamp } from "../core/seededRandom.js";

export const DUEL_TARGET = 11;
export const DUEL_CAP = 15;
export const DUEL_WIN_BY = 2;

export const OFFENSE_CHOICES = Object.freeze(["drive", "midrange", "outside", "post"]);
export const DEFENSE_CHOICES = Object.freeze(["balanced", "perimeter", "paint"]);
export const DUEL_DIFFICULTIES = Object.freeze(["rookie", "pro", "legend"]);

/**
 * Difficulty. `legendRating` multiplies the legend's ratings, `legendMake` is
 * added to the legend's own make probability, `counterRate` is how often the
 * CPU defends with the best counter to the player's last offense, and
 * `bestRate` is how often it attacks with its best-rated choice. Rookie
 * plays loose on both ends; Legend plays near-optimal. None of this touches
 * the challenger's dice.
 */
export const DIFFICULTY = Object.freeze({
  rookie: { legendRating: 0.9, legendMake: -0.05, counterRate: 0.0, bestRate: 0.25 },
  pro: { legendRating: 1.0, legendMake: 0, counterRate: 0.5, bestRate: 0.5 },
  legend: { legendRating: 1.08, legendMake: 0.04, counterRate: 0.8, bestRate: 0.8 },
});

/** Per-offense-choice make model. `rating` is computed from the shooter's normalized attrs. */
export const OFFENSE = Object.freeze({
  drive: {
    points: 1,
    base: 0.52,
    rating: (d) => (d.finishing * 0.5 + d.handles * 0.3 + d.speed * 0.2),
    skills: ["ankle_breaker", "spring_board", "lone_wolf"],
  },
  midrange: {
    points: 1,
    base: 0.5,
    rating: (d) => (d.shooting * 0.7 + d.handles * 0.3),
    skills: ["mid_maestro", "lean_in_jumper", "freeze_iso"],
  },
  outside: {
    points: 2,
    base: 0.42,
    rating: (d) => (d.shooting * 0.8 + d.handles * 0.2),
    skills: ["rainmaker", "corner_camp", "gravity_well"],
  },
  post: {
    points: 1,
    base: 0.52,
    rating: (d) => (d.strength * 0.4 + d.finishing * 0.4 + d.shooting * 0.2),
    skills: ["paint_bully", "manimal", "iron_body"],
  },
});

/** Defense skills that help the defender contest a shot. */
export const DEFENSE_SKILLS = Object.freeze([
  "lockdown", "death_wrap", "sticky_wrap", "rim_protector", "thief", "charge_taker",
]);

/**
 * How each defense choice shifts the shooter's make probability. Balanced is
 * solid with no hole (-0.03 everywhere); Perimeter locks the arc (-0.10
 * outside) but concedes drives (+0.05); Paint walls the lane (-0.10
 * drive/post) but concedes the arc (+0.05).
 */
export const MATCHUP = Object.freeze({
  balanced: { drive: -0.03, midrange: -0.03, outside: -0.03, post: -0.03 },
  perimeter: { drive: 0.05, midrange: -0.04, outside: -0.1, post: 0.02 },
  paint: { drive: -0.1, midrange: -0.02, outside: 0.05, post: -0.1 },
});

/** The defense choice that best defends a given offense (min MATCHUP value). */
export function counterDefenseFor(offense) {
  let best = "balanced";
  let bestValue = Infinity;
  for (const defense of DEFENSE_CHOICES) {
    const value = MATCHUP[defense][offense];
    if (value < bestValue) {
      bestValue = value;
      best = defense;
    }
  }
  return best;
}

/** Defender's contest rating: strength matters inside (drive/post), pure defense outside. */
function contestRating(defender, offense) {
  if (offense === "drive" || offense === "post") {
    return (defender.defense + defender.strength) / 2;
  }
  return defender.defense;
}

/** D3.1 — bound on the total spatial contribution to one shot's probability. */
export const SPACING_TOTAL_MAX = 0.06;

/**
 * Make probability for one shot. Pure. `shooterIsLegend` applies the
 * difficulty's legendMake offset (legend shots only); the challenger's dice
 * are never adjusted by difficulty. `stamina` is the shooter's CURRENT
 * stamina (0-100, drains as the duel goes on) — not the stamina attribute;
 * pass it explicitly, it defaults to 100 (fresh legs).
 *
 * D3.1 — `spacing` is an OPTIONAL additive term from the takeover court
 * (see spacingForShot in duelTakeover.js): defender openness, rim
 * proximity, a beaten defender. Each spatial term is bounded (|term| ≤
 * 0.03) and the total is bounded (±0.06); the caller clamps it. It sits
 * INSIDE the stamina scaling on purpose: a tired shooter gets less out of
 * good positioning (at stamina 0 the spacing contributes ×0.82, at 100
 * ×1.00). With no spacing passed the result is EXACTLY the pre-D3.1 value
 * — positioning only ever enters through this explicit argument, never
 * implicitly.
 */
export function makeProb(shooter, defender, offense, defense, { difficulty = "pro", shooterIsLegend = false, stamina = 100, spacing = 0 } = {}) {
  const spec = OFFENSE[offense];
  if (!spec) throw new Error(`duelSim: unknown offense "${offense}"`);
  if (!MATCHUP[defense]) throw new Error(`duelSim: unknown defense "${defense}"`);
  const offRating = spec.rating(shooter);
  const defRating = contestRating(defender, offense);
  const diff = clamp((offRating - defRating) * 0.004, -0.12, 0.12);
  const matchup = MATCHUP[defense][offense];
  const staminaFactor = 0.82 + 0.18 * clamp(stamina, 0, 100) / 100;
  const skillBonus = Math.min(
    0.06,
    (shooter.skills || []).filter((s) => spec.skills.includes(s)).length * 0.03,
  );
  const defenseSkillBonus = Math.min(
    0.03,
    (defender.skills || []).filter((s) => DEFENSE_SKILLS.includes(s)).length * 0.015,
  );
  const legendMake = shooterIsLegend ? DIFFICULTY[difficulty].legendMake : 0;
  const spacingTerm = clamp(spacing, -SPACING_TOTAL_MAX, SPACING_TOTAL_MAX);
  const prob = (spec.base + diff + matchup + skillBonus - defenseSkillBonus + legendMake + spacingTerm) * staminaFactor;
  return clamp(prob, 0.08, 0.92);
}

/** CPU offense: with prob bestRate take the best-rated choice, else uniform random. */
export function cpuOffenseChoice(cpu, defender, difficulty, rng) {
  const tune = DIFFICULTY[difficulty];
  if (rng() < tune.bestRate) {
    let best = OFFENSE_CHOICES[0];
    let bestRating = -Infinity;
    for (const choice of OFFENSE_CHOICES) {
      const rating = OFFENSE[choice].rating(cpu);
      if (rating > bestRating) {
        bestRating = rating;
        best = choice;
      }
    }
    return best;
  }
  return OFFENSE_CHOICES[Math.floor(rng() * OFFENSE_CHOICES.length)];
}

/** CPU defense: with prob counterRate take the best counter to the player's last offense, else random. */
export function cpuDefenseChoice(lastPlayerOffense, difficulty, rng) {
  const tune = DIFFICULTY[difficulty];
  if (lastPlayerOffense && rng() < tune.counterRate) return counterDefenseFor(lastPlayerOffense);
  return DEFENSE_CHOICES[Math.floor(rng() * DEFENSE_CHOICES.length)];
}

/** Apply the difficulty's rating multiplier to a legend copy (never the source card). */
function applyDifficulty(duelist, difficulty) {
  const mult = DIFFICULTY[difficulty].legendRating;
  const out = { ...duelist, skills: [...(duelist.skills || [])] };
  for (const key of ["shooting", "finishing", "handles", "defense", "strength", "speed", "stamina"]) {
    out[key] = clamp(Math.round((out[key] ?? 50) * mult), 1, 99);
  }
  return out;
}

/** Stamina cost of one shot: 6 at a 50 stamina attribute, 4 at 100, 7 at 25. */
export function staminaDrain(duelist) {
  return 8 - clamp(duelist.stamina ?? 50, 1, 99) / 25;
}

/** Stamina recovered while defending one possession: 3 at a 50 attribute. */
export function staminaRecovery(duelist) {
  return 2 + clamp(duelist.stamina ?? 50, 1, 99) / 50;
}

function sideState(duelist) {
  return { duelist, score: 0, stamina: 100, shots: 0, makes: 0 };
}

/**
 * Create a duel. `seed` defaults to the duel id, so a recorded duel replays
 * from its id. The RNG stream is created once here and carried on the state
 * (not serialised); a fresh createDuel with the same seed + the same choices
 * replays identically.
 */
export function createDuel({ challenger, legend, difficulty = "pro", seed = null, id = null } = {}) {
  if (!challenger || !legend) throw new Error("duelSim: challenger and legend are required");
  if (!DUEL_DIFFICULTIES.includes(difficulty)) throw new Error(`duelSim: unknown difficulty "${difficulty}"`);
  const duelId = id || `duel_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return {
    id: duelId,
    difficulty,
    seed: seed ?? duelId,
    rng: seededStream(hashSeed(seed ?? duelId)),
    possession: "a",
    turn: 0,
    over: false,
    winner: null,
    a: sideState({ ...challenger, skills: [...(challenger.skills || [])] }),
    b: sideState(applyDifficulty(legend, difficulty)),
    lastPlayerOffense: null,
    log: [],
  };
}

function checkWinner(state) {
  const { a, b } = state;
  if (a.score >= DUEL_TARGET && a.score - b.score >= DUEL_WIN_BY) return "a";
  if (b.score >= DUEL_TARGET && b.score - a.score >= DUEL_WIN_BY) return "b";
  // 15-point cap: the leader wins; a 15-15 tie plays on, next score wins.
  if (a.score >= DUEL_CAP && a.score > b.score) return "a";
  if (b.score >= DUEL_CAP && b.score > a.score) return "b";
  return null;
}

/**
 * Resolve one possession. `choice` is { offense } when the challenger has the
 * ball, { defense } when the legend has it. The other side's pick comes from
 * the CPU policy. `opts.spacing` is an OPTIONAL per-offense map
 * ({ drive, midrange, outside, post } -> total modifier, see
 * spacingByOffense in duelTakeover.js) from the takeover court state at the
 * moment of the shot; only the resolved offense's term applies, and with no
 * map the possession resolves EXACTLY as before D3.1. Returns the
 * possession event; the state is mutated in place (it carries the RNG
 * stream) and also returned.
 */
export function playPossession(state, choice = {}, opts = {}) {
  if (state.over) throw new Error("duelSim: duel is already over");
  const rng = state.rng;
  const shooterSide = state.possession;
  const defenderSide = shooterSide === "a" ? "b" : "a";
  const shooter = state[shooterSide];
  const defender = state[defenderSide];
  const shooterIsLegend = shooterSide === "b";
  let offense;
  let defense;
  if (shooterSide === "a") {
    offense = choice.offense;
    if (!OFFENSE_CHOICES.includes(offense)) throw new Error(`duelSim: choose an offense (${OFFENSE_CHOICES.join(", ")})`);
    defense = cpuDefenseChoice(state.lastPlayerOffense, state.difficulty, rng);
    state.lastPlayerOffense = offense;
  } else {
    defense = choice.defense;
    if (!DEFENSE_CHOICES.includes(defense)) throw new Error(`duelSim: choose a defense (${DEFENSE_CHOICES.join(", ")})`);
    offense = cpuOffenseChoice(defender.duelist, shooter.duelist, state.difficulty, rng);
  }
  const spacing = opts.spacing ? (opts.spacing[offense] || 0) : 0;
  const prob = makeProb(shooter.duelist, defender.duelist, offense, defense, {
    difficulty: state.difficulty,
    shooterIsLegend,
    stamina: shooter.stamina,
    spacing,
  });
  const made = rng() < prob;
  const points = made ? OFFENSE[offense].points : 0;
  shooter.shots += 1;
  if (made) {
    shooter.makes += 1;
    shooter.score += points;
  }
  // Stamina: the shooter spends per shot (slower for high-stamina players);
  // the defender recovers a little while defending. The duelist's stamina
  // ATTRIBUTE never changes — only the side's current stamina moves.
  shooter.stamina = clamp(shooter.stamina - staminaDrain(shooter.duelist), 0, 100);
  defender.stamina = clamp(defender.stamina + staminaRecovery(defender.duelist), 0, 100);
  const event = {
    turn: state.turn + 1,
    shooter: shooterSide,
    offense,
    defense,
    prob: Math.round(prob * 1000) / 1000,
    spacing: Math.round(spacing * 1000) / 1000,
    made,
    points,
    staminaAfter: Math.round(shooter.stamina),
    scoreA: state.a.score,
    scoreB: state.b.score,
  };
  state.log.push(event);
  state.turn += 1;
  state.possession = defenderSide;
  const winner = checkWinner(state);
  if (winner) {
    state.over = true;
    state.winner = winner;
  }
  return event;
}

/** Play a whole duel with a fixed player policy (tests + QA): { offense, defense } per possession. */
export function playDuel(state, policy) {
  while (!state.over && state.turn < 200) {
    const choice = typeof policy === "function" ? policy(state) : policy;
    playPossession(state, choice);
  }
  return state;
}
