import { COACHES } from "../data/coaches.js";
import { HIDDEN_TIERS, PLAYERS, clonePlayer, overall } from "../data/players.js";

/** Weighted pack — hidden tiers affect odds, never revealed in UI. */
export function drawPack(size = 5, { includeCoach = false, excludeIds = new Set() } = {}) {
  const pool = PLAYERS.filter((p) => !excludeIds.has(p.id));
  const cards = [];
  const used = new Set(excludeIds);

  const count = includeCoach ? size - 1 : size;
  for (let i = 0; i < count; i++) {
    const p = weightedPick(
      pool.filter((x) => !used.has(x.id)),
      (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 10
    );
    if (!p) break;
    used.add(p.id);
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

  // shuffle display order so rarity isn't positional
  return shuffle(cards);
}

export function autoFillTeam(name, nPlayers = 8) {
  const pack = [];
  const used = new Set();
  while (pack.length < nPlayers) {
    const batch = drawPack(5, { excludeIds: used });
    for (const c of batch) {
      if (c.kind === "player" && pack.length < nPlayers) {
        pack.push(c.data);
        used.add(c.data.id);
      }
    }
  }
  const coach = weightedPick(COACHES, (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 10);
  return {
    name,
    players: pack,
    coach: structuredClone(coach),
  };
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
