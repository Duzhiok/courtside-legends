import { ASSISTANTS, COACHES } from "../data/coaches.js";
import { CUSTOM_REFRESH_COST, customPriceOf, listPaidPeaks } from "../data/customPool.js";
import { playerPrice } from "../data/intangibles.js";
import { HIDDEN_TIERS, PLAYERS, clonePlayer, overall } from "../data/players.js";
import { shuffle } from "../core/seededRandom.js";

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

/** Weighted pack — hidden tiers affect odds, never revealed in UI. */
export function drawPack(
  size = 5,
  { includeCoach = false, includeAssistant = false, excludeIds = new Set() } = {}
) {
  const people = takenPeople(excludeIds);
  const pool = PLAYERS.filter((p) => !excludeIds.has(p.id) && !people.has(p.bref));
  const cards = [];
  const used = new Set(excludeIds);

  const staffSlots = (includeCoach ? 1 : 0) + (includeAssistant ? 1 : 0);
  const count = Math.max(1, size - staffSlots);
  for (let i = 0; i < count; i++) {
    const p = weightedPick(
      pool.filter((x) => !used.has(x.id) && !people.has(x.bref)),
      (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 10
    );
    if (!p) break;
    used.add(p.id);
    if (p.bref) people.add(p.bref);
    cards.push({ kind: "player", data: clonePlayer(p) });
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
  // Higher power → skew toward better hidden tiers / more players
  const n = clamp(nPlayers + Math.floor(power / 2), 8, 12);
  while (pack.length < n) {
    const batch = drawPack(5, { excludeIds: used });
    for (const c of batch) {
      if (c.kind === "player" && pack.length < n) {
        pack.push(c.data);
        used.add(c.data.id);
      }
    }
  }
  // Mild power bump: keep top-N by OVR after a few extra draws
  if (power > 0) {
    const extras = [];
    while (extras.length < power * 2) {
      const batch = drawPack(5, { excludeIds: used });
      for (const c of batch) {
        if (c.kind === "player") {
          extras.push(c.data);
          used.add(c.data.id);
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
    const pick = candidates[Math.floor(Math.random() * Math.min(8, candidates.length))];
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
  let r = Math.random() * sum;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
