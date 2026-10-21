import { ASSISTANTS, COACHES } from "../data/coaches.js";
import { playerPrice } from "../data/intangibles.js";
import { HIDDEN_TIERS, PLAYERS, clonePlayer, overall } from "../data/players.js";

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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
