import { ASSISTANTS, COACHES } from "../data/coaches.js";
import { CUSTOM_REFRESH_COST, customPriceOf, dealRoleDiverse, listPaidPeaks } from "../data/customPool.js";
import { playerPrice } from "../data/intangibles.js";
import { HIDDEN_TIERS, PLAYERS, clonePlayer, overall } from "../data/players.js";
import { clamp, shuffle } from "../core/seededRandom.js";
import { rand } from "../core/rng.js";

/** Free refreshes per side before the pick-and-pack draft starts charging gold. */
export const DRAFT_FREE_REFRESHES = 3;
export const DRAFT_REFRESH_COST = 40;

/** id → bref, rebuilt only when the roster reloads. */
let brefIndex = null;
let brefIndexSize = -1;

function brefOf(id) {
  if (brefIndexSize !== PLAYERS.length) {
    brefIndex = new Map(PLAYERS.map((p) => [p.id, p.bref]));
    brefIndexSize = PLAYERS.length;
  }
  return brefIndex.get(id);
}

/** Real people already taken — one person (any season) per league in draft modes. */
export function takenPeople(ids) {
  const people = new Set();
  for (const id of ids || []) {
    const bref = brefOf(id);
    if (bref) people.add(bref);
  }
  return people;
}

const tierWeight = (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 10;

/**
 * The cards a draw can still pick, in PLAYERS order, with their tier weights. Built ONCE per draw sequence: the old code re-filtered the
 * whole player library (tens of thousands of cards) for every single pick, which made building one CPU team ~0.2 s and a whole gold
 * bracket 2.5 s (CPU profile, BACKLOG B77). Picking from it is arithmetically identical to the old filter + weightedPick (same order,
 * same integer weights, same `rand()` calls), so seeded results do not change: tests/draftPool.test.js checks that against the old code.
 *
 * A card that is taken is not spliced out (that is O(library) per pick again): its weight becomes 0 ("gone": real weights are >= 1), the
 * running total drops by it (integers, so exactly what re-summing would give), and the picker skips zeros.
 */
export function createDrawPool(excludeIds = new Set()) {
  const lib = drawLibrary();
  const pool = { arr: lib.arr, weights: lib.weights.slice(), sum: lib.sum, live: lib.arr.length, byId: lib.byId, byPerson: lib.byPerson };
  for (const id of excludeIds) {
    for (const i of lib.byId.get(id) || []) take(pool, i);
    const bref = brefOf(id); // a taken card also takes every other season of that person
    if (bref) for (const i of lib.byPerson.get(bref) || []) take(pool, i);
  }
  return pool;
}

/** Everything about the player library that does not depend on who is taken: cards, weights, and the id / person indexes. Built once per roster load. */
let library = null;
function drawLibrary() {
  const n = PLAYERS.length;
  if (library && library.n === n && library.first === PLAYERS[0] && library.last === PLAYERS[n - 1]) return library;
  const arr = PLAYERS.slice();
  const weights = [];
  const byId = new Map(); // id -> positions (ids are unique in practice; a list keeps the old "same id is taken" rule exact)
  const byPerson = new Map(); // bref -> positions: one real person once per league
  let sum = 0;
  arr.forEach((p, i) => {
    const w = tierWeight(p);
    weights.push(w);
    sum += w;
    (byId.get(p.id) || byId.set(p.id, []).get(p.id)).push(i);
    if (p.bref) (byPerson.get(p.bref) || byPerson.set(p.bref, []).get(p.bref)).push(i);
  });
  library = { n, first: PLAYERS[0], last: PLAYERS[n - 1], arr, weights, sum, byId, byPerson };
  return library;
}

/** A pool whose takings do not touch the original (cards and indexes are shared, read-only; only the weights are copied). */
const copyPool = (pool) => ({ ...pool, weights: pool.weights.slice() });

/** One card picked by tier weight (null when empty). Same arithmetic as weightedPick: r = rand() * total, subtract until <= 0. */
function pickFromPool(pool) {
  const { arr, weights } = pool;
  if (!pool.live) return null;
  let r = rand() * pool.sum;
  let last = -1;
  for (let i = 0; i < arr.length; i++) {
    const w = weights[i];
    if (w === 0) continue; // taken
    last = i;
    r -= w;
    if (r <= 0) return arr[i];
  }
  return arr[last]; // the old code fell back to the last candidate
}

function take(pool, i) {
  const w = pool.weights[i];
  if (w === 0) return;
  pool.weights[i] = 0;
  pool.sum -= w;
  pool.live -= 1;
}

/** Take `card` out of the pool, and every other season of the same real person (one person per league). */
function removeFromPool(pool, card) {
  for (const i of pool.byId.get(card.id) || []) take(pool, i);
  if (card.bref) for (const i of pool.byPerson.get(card.bref) || []) take(pool, i);
}

/** The cards still in the pool, in order (only the role-diverse deal wants a plain list). */
const liveCards = (pool) => pool.arr.filter((_, i) => pool.weights[i] !== 0);

/** Weighted pack — hidden tiers affect odds, never revealed in UI.
 * roleDiverse: deal the player cards one per role family (shooter /
 * rebounder / defender / playmaker / energy) instead of uniform weighted
 * random — same pool, same tier weights, different deal. Staff extras
 * (coach / assistant) are untouched. Default false: existing callers keep
 * the original behavior.
 * pool: a createDrawPool() the caller keeps across several packs (autoFillTeam); it is not changed here. */
export function drawPack(
  size = 5,
  { includeCoach = false, includeAssistant = false, excludeIds = new Set(), roleDiverse = false, pool: shared = null } = {}
) {
  const own = !shared;
  const base = shared || createDrawPool(excludeIds);
  const cards = [];
  const used = new Set(excludeIds);

  const staffSlots = (includeCoach ? 1 : 0) + (includeAssistant ? 1 : 0);
  const count = Math.max(1, size - staffSlots);
  if (roleDiverse) {
    const picked = dealRoleDiverse(liveCards(base), count, { weightFn: tierWeight, keyOf: (x) => x.bref });
    for (const p of picked) {
      used.add(p.id);
      cards.push({ kind: "player", data: clonePlayer(p) });
    }
  } else {
    const work = own ? base : copyPool(base); // picks leave the working pool; a pool the caller shares stays whole
    for (let i = 0; i < count; i++) {
      const p = pickFromPool(work);
      if (!p) break;
      removeFromPool(work, p);
      used.add(p.id);
      cards.push({ kind: "player", data: clonePlayer(p) });
    }
  }

  if (includeCoach) {
    const c = weightedPick(
      COACHES.filter((x) => !used.has(x.id)),
      (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 10
    );
    if (c) {
      used.add(c.id);
      cards.push({ kind: "coach", data: structuredClone(c) });
    }
  }

  if (includeAssistant) {
    const a = weightedPick(
      ASSISTANTS.filter((x) => !used.has(x.id)),
      (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 12
    );
    if (a) {
      used.add(a.id);
      cards.push({ kind: "assistant", data: structuredClone(a) });
    }
  }

  // shuffle display order so rarity isn't positional
  return shuffle(cards);
}

export function autoFillTeam(name, nPlayers = 8, { excludeIds = null, power = 0 } = {}) {
  const pack = [];
  const used = new Set(excludeIds || []);
  const pool = createDrawPool(used); // built once; a card drawn but not kept (the batch overshoots) simply stays in it
  // Higher power → skew toward better hidden tiers / more players
  const n = clamp(nPlayers + Math.floor(power / 2), 8, 12);
  while (pack.length < n) {
    const batch = drawPack(5, { excludeIds: used, pool });
    const before = pack.length;
    for (const c of batch) {
      if (c.kind === "player" && pack.length < n) {
        pack.push(c.data);
        used.add(c.data.id);
        removeFromPool(pool, c.data);
      }
    }
    // An exhausted pool (no players left to draw, e.g. a test building a
    // season without seeding PLAYERS) must return a short pack, not spin
    // forever — the power-bump loop below already guards the same way.
    if (pack.length === before) break;
  }
  // Mild power bump: keep top-N by OVR after a few extra draws
  if (power > 0) {
    const extras = [];
    while (extras.length < power * 2) {
      const batch = drawPack(5, { excludeIds: used, pool });
      for (const c of batch) {
        if (c.kind === "player") {
          extras.push(c.data);
          used.add(c.data.id);
          removeFromPool(pool, c.data);
        }
      }
      if (!batch.length) break;
    }
    const merged = [...pack, ...extras].sort((a, b) => overall(b) - overall(a));
    pack.length = 0;
    pack.push(...merged.slice(0, n));
  }
  const coach = weightedPick(COACHES, (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 10);
  const assistant = weightedPick(ASSISTANTS, (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 12);
  return {
    name,
    players: pack,
    coach: structuredClone(coach),
    assistant: structuredClone(assistant), // 主教练+助教都要有
    gold: 0,
    isCpu: true,
  };
}

/**
 * The two preset exhibition sides (Play Now and the quick-game card). One real person plays for one side
 * only: two independent draws put the same player on both teams in ~5% of games.
 *
 * B97 finding #6: both sides used to be named "主队传奇" / "客队传奇" -- sharing the same
 * "传奇" suffix made them read as the same team on a scoreboard that otherwise only
 * distinguishes home/away by color. Distinct suffixes fix that without touching the
 * draw logic, pool exclusion, or coach/assistant assignment above.
 */
export function exhibitionTeams(nPlayers = 10) {
  const home = autoFillTeam("主场群星", nPlayers);
  const away = autoFillTeam("客场挑战者", nPlayers, { excludeIds: (home?.players || []).map((p) => p.id) });
  return { home, away };
}

/**
 * Spend gold to replace weakest roster spots with better free agents.
 * Later tournament rounds call this so CPU lineups slowly upgrade.
 */
export function cpuUpgradeRoster(team, budget, globalUsed = new Set()) {
  if (!team?.players || budget <= 0) return { spent: 0, added: [], notes: [] };
  let gold = budget;
  const spentNotes = [];
  const added = [];
  const localUsed = new Set([...globalUsed, ...team.players.map((p) => p.id)]);
  const localPeople = takenPeople(localUsed);

  // Prefer filling empty slots first, then swap out weakest
  const maxRoster = 12;
  let guard = 0;
  while (gold >= 40 && guard++ < 6) {
    const candidates = PLAYERS.filter((p) => !localUsed.has(p.id) && !localPeople.has(p.bref))
      .map((p) => clonePlayer(p))
      .map((p) => ({ p, price: playerPrice(p), ovr: overall(p) }))
      .filter((x) => x.price <= gold)
      .sort((a, b) => b.ovr / Math.max(40, a.price) - a.ovr / Math.max(40, b.price) || b.ovr - a.ovr)
      .slice(0, 40);

    if (!candidates.length) break;
    // Bias pick among top value options
    const pick = candidates[Math.floor(rand() * Math.min(8, candidates.length))];
    if (!pick) break;

    if (team.players.length < maxRoster) {
      team.players.push(pick.p);
      gold -= pick.price;
      localUsed.add(pick.p.id);
      localPeople.add(pick.p.bref);
      globalUsed.add(pick.p.id);
      added.push(pick.p);
      spentNotes.push(`买入 ${pick.p.name}（¤${pick.price}）`);
      continue;
    }

    const weakest = [...team.players].sort((a, b) => overall(a) - overall(b))[0];
    if (!weakest || overall(pick.p) <= overall(weakest) + 1) break;
    team.players = team.players.filter((p) => p.id !== weakest.id);
    team.players.push(pick.p);
    gold -= pick.price;
    localUsed.add(pick.p.id);
    localPeople.add(pick.p.bref);
    globalUsed.add(pick.p.id);
    added.push(pick.p);
    spentNotes.push(`换下 ${weakest.name}，买入 ${pick.p.name}（¤${pick.price}）`);
  }

  return { spent: budget - gold, added, notes: spentNotes };
}

/** Both rosters full and both sides have a coach + an assistant -- the pack-and-pick draft is over. */
export function isDraftDone(d) {
  if (!d) return false;
  return (
    d.teams.A.players.length >= d.picksPerSide &&
    d.teams.B.players.length >= d.picksPerSide &&
    !!d.teams.A.coach &&
    !!d.teams.B.coach &&
    !!d.teams.A.assistant &&
    !!d.teams.B.assistant
  );
}

/** Gold/block cost of refreshing the current pack: cheap in custom budget mode, pricier otherwise. */
export function draftRefreshCost(d) {
  return d?.budgetMode ? CUSTOM_REFRESH_COST : DRAFT_REFRESH_COST;
}

/**
 * Whose turn is next, after a pick was just made.
 *
 * Custom budget mode already has its own back-and-forth (keeps spending while the other side is
 * tapped out, etc) -- untouched here.
 *
 * Everywhere else (选秀建队 vs CPU, and 双人对抗 duel), picks used to be a flat A,B,A,B,... toggle.
 * That's a real fairness bug, not just a vibe: every single turn deals a brand-new, independently
 * random 5-card pack (see dealPack/drawPack), so whoever is "d.turn" always gets first look at a
 * pack nobody else has seen yet. Flat alternation means A is ALWAYS the one opening a fresh pack
 * on odd turns and B on even ones -- fine turn-to-turn, but it never rotates who gets to anchor a
 * round. A proper snake/zigzag draft (A,B,B,A,A,B,B,A,...) is the standard fix: pick index to
 * picker is `floor((i+1)/2) % 2 === 0 ? "A" : "B"` for 0-based pick index i, which gives pairs of
 * back-to-back picks for whoever picked last, alternating which side anchors each round.
 *
 * d._pickIdx counts every non-budget-mode pick (player, coach, or assistant alike) so interleaved
 * staff picks don't throw off the player-pack sequence the user actually sees and cares about.
 */
export function advanceTurn(d) {
  if (!d) return d;
  if (d.budgetMode && d.customPhase === "spend") {
    const other = d.turn === "A" ? "B" : "A";
    if (customSideCanSpend(d, other)) {
      d.turn = other;
    } else if (customSideCanSpend(d, d.turn)) {
      // the other side is tapped out, current side keeps spending
    } else {
      d.customPhase = "filler";
      d.turn = other; // switch sides to start the 0-block filler phase
    }
  } else if (d.budgetMode && d.customPhase === "filler") {
    const other = d.turn === "A" ? "B" : "A";
    if (d.teams[other].players.length < d.picksPerSide) d.turn = other;
    // the other side is already full, current side keeps filling
  } else {
    d._pickIdx = (d._pickIdx || 0) + 1;
    d.turn = Math.floor((d._pickIdx + 1) / 2) % 2 === 0 ? "A" : "B";
  }
  d.round = Math.min(d.picksDone.A, d.picksDone.B) + 1;
  return d;
}

/** What a pick actually costs this draft: free unless buyPlayers is on, then custom-block or gold price. */
export function pickCost(d, player) {
  if (!d?.buyPlayers) return 0;
  if (d.budgetMode) return customPriceOf(player);
  return playerPrice(player);
}

/** Custom budget mode's "spend" phase: can this side still afford any priced (1-5 block) peak card? */
export function customSideCanSpend(d, side) {
  if (!d?.budgetMode) return false;
  const team = d.teams[side];
  if (!team || team.players.length >= d.picksPerSide) return false;
  const gold = team.gold ?? 0;
  if (gold <= 0) return false;
  return listPaidPeaks(d.used).some((c) => customPriceOf(c.data) <= gold);
}

/** Spend phase ends once neither side can afford another priced card -- time to move to 0-block fillers. */
export function customSpendPhaseDone(d) {
  if (!d?.budgetMode) return true;
  return !customSideCanSpend(d, "A") && !customSideCanSpend(d, "B");
}

export function teamPowerLabel(team) {
  const ovrs = team.players.map(overall);
  const avg = Math.round(ovrs.reduce((a, b) => a + b, 0) / (ovrs.length || 1));
  return avg;
}

function weightedPick(arr, weightFn) {
  if (!arr.length) return null;
  const weights = arr.map(weightFn);
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}
