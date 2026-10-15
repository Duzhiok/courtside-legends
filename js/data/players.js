import { avatarFallback, brefPhoto, nbaPhoto } from "./photo.js";

export const HIDDEN_TIERS = {
  undrafted_gleague: { weight: 22, label: "落选+短期合同+D联盟" },
  water_cooler: { weight: 18, label: "饮水机管理员" },
  bench: { weight: 20, label: "bench player" },
  starter: { weight: 16, label: "starters" },
  star: { weight: 10, label: "球星" },
  allstar: { weight: 7, label: "全明星" },
  hof: { weight: 4, label: "名人堂" },
  nba50: { weight: 2, label: "NBA 50 大巨星" },
  superstar: { weight: 1, label: "超级巨星" },
};

/** @type {any[]} */
export let PLAYERS = [];

let _loaded = false;
let _loading = null;

export function playersReady() {
  return _loaded;
}

/**
 * Convert raw per-game season row → game card with attributes + hidden tier.
 * Tier is inferred from production (never shown in UI).
 */
export function seasonToCard(r) {
  const ppg = +r.ppg || 0;
  const rpg = +r.rpg || 0;
  const apg = +r.apg || 0;
  const spg = +r.spg || 0;
  const bpg = +r.bpg || 0;
  const tpg = +r.tpg || 0;
  const mpg = +r.mpg || 15;
  const gp = +r.gp || 20;
  const fg = +r.fg || 0.42;
  const tp = +r.tp || 0;
  const ft = +r.ft || 0.75;
  const fga = +r.fga || 8;
  const tpa = +r.tpa || 0;

  const scoring = clamp(Math.round(ppg * 4.2 + fga * 0.8), 25, 99);
  const three = clamp(Math.round(tp * 120 + tpa * 6 + (tp > 0.35 ? 10 : 0)), 5, 99);
  const paint = clamp(Math.round((fg - 0.35) * 180 + (ppg - tpa * 0.9) * 1.5), 25, 99);
  const mid = clamp(Math.round(fg * 100 + (1 - Math.min(tpa / Math.max(fga, 1), 1)) * 15), 25, 96);
  const defense = clamp(Math.round(55 + spg * 12 + bpg * 14 + (mpg > 28 ? 5 : 0)), 25, 99);
  const rebound = clamp(Math.round(rpg * 7.5 + 20), 20, 99);
  const pass = clamp(Math.round(apg * 9 + 25 - tpg * 3), 20, 99);
  const speed = clamp(Math.round(50 + (["PG", "SG"].includes(r.pos) ? 18 : 0) + spg * 8 - (rpg > 10 ? 8 : 0)), 30, 96);
  const strength = clamp(Math.round(45 + (["C", "PF"].includes(r.pos) ? 25 : 0) + rpg * 2), 30, 99);
  const stamina = clamp(Math.round(40 + mpg * 1.4 + Math.min(gp, 70) * 0.25), 35, 98);
  const iq = clamp(Math.round(50 + apg * 4 + (fg > 0.48 ? 8 : 0) + (tpg < 2 ? 5 : -3)), 35, 98);
  const clutch = clamp(Math.round(45 + ppg * 1.2 + apg * 2), 30, 98);
  const steal = clamp(Math.round(30 + spg * 35), 15, 99);
  const block = clamp(Math.round(25 + bpg * 40), 10, 99);

  // Approximate zone FG% from overall / 3P tendencies (not exact shot-zone data)
  const threeFg = clamp(tp || 0.28, 0.05, 0.5);
  const paintFg = clamp(0.48 + (fg - 0.42) * 0.7 + (["C", "PF"].includes(r.pos) ? 0.04 : 0), 0.35, 0.72);
  const midFg = clamp(fg * 0.95, 0.28, 0.55);

  const prod = ppg * 1.0 + rpg * 0.7 + apg * 0.9 + spg * 1.5 + bpg * 1.4;
  let hiddenTier = "bench";
  if (prod < 8 || mpg < 12) hiddenTier = "water_cooler";
  if (prod < 5 && gp < 30) hiddenTier = "undrafted_gleague";
  if (prod >= 14 && mpg >= 22) hiddenTier = "starter";
  if (prod >= 22 && ppg >= 14) hiddenTier = "star";
  if (prod >= 28 && ppg >= 18) hiddenTier = "allstar";
  if (prod >= 34 && ppg >= 24) hiddenTier = "superstar";
  // Old legends production curve was different — bump era stars
  if (r.season <= 1979 && ppg >= 20) hiddenTier = "hof";
  if (r.season <= 1979 && ppg >= 27) hiddenTier = "nba50";

  const growth = clamp(Math.round(100 - (r.season - 1950) * 0.15 - ppg * 1.2 + (mpg < 20 ? 25 : 0)), 5, 95);
  const growthSpeed = clamp(growth - 5, 5, 95);

  const displayName = r.nameZh || r.name;
  const photo = r.nbaId ? nbaPhoto(r.nbaId) : r.bref ? brefPhoto(r.bref) : avatarFallback(displayName);

  return {
    id: r.id,
    name: displayName,
    nameEn: r.name,
    season: r.season,
    team: r.team,
    pos: r.pos || "SF",
    nbaId: r.nbaId || null,
    bref: r.bref || null,
    photo,
    scoring,
    three,
    mid,
    paint,
    defense,
    rebound,
    pass,
    speed,
    strength,
    stamina,
    iq,
    clutch,
    steal,
    block,
    paintFg,
    midFg,
    threeFg,
    ft: clamp(ft, 0.4, 0.95),
    personality: {
      ego: clamp(Math.round(30 + ppg * 1.5), 15, 95),
      team: clamp(Math.round(70 - ppg * 0.6 + apg * 3), 25, 95),
      fiery: clamp(Math.round(35 + spg * 10 + (ppg > 25 ? 15 : 0)), 15, 95),
      calm: clamp(Math.round(55 + (apg > 6 ? 15 : 0) - (ppg > 28 ? 10 : 0)), 20, 95),
    },
    growth,
    growthSpeed,
    archetype: inferArchetype(r, { three, pass, defense, paint, steal, block }),
    hiddenTier,
    tags: buildTags(r, hiddenTier),
    raw: { ppg, rpg, apg, spg, bpg, tpg, mpg, gp },
  };
}

function inferArchetype(r, a) {
  if ((r.apg || 0) >= 7 && (r.pos === "PG" || r.pos === "SG")) return "floor_general";
  if ((r.bpg || 0) >= 2.2) return "pest";
  if ((r.spg || 0) >= 2.0) return "pest";
  if (a.three >= 85) return "shooter";
  if ((r.rpg || 0) >= 11) return "rebounder";
  if (a.paint >= 88 && ["C", "PF"].includes(r.pos)) return "dominant_big";
  if ((r.apg || 0) >= 5 && ["C", "PF"].includes(r.pos)) return "playmaking_big";
  if (a.defense >= 88) return "two_way_wing";
  if ((r.ppg || 0) >= 22) return "iso_scorer";
  return "connector";
}

function buildTags(r, tier) {
  const tags = [];
  if (r.season <= 1969) tags.push("上古神兽");
  else if (r.season <= 1989) tags.push("古典时代");
  if ((r.ppg || 0) >= 30) tags.push("得分爆炸");
  if ((r.apg || 0) >= 10) tags.push("助攻核");
  if ((r.bpg || 0) >= 3) tags.push("盖帽威胁");
  if ((r.spg || 0) >= 2.5) tags.push("抢断威胁");
  if (tier === "water_cooler" || tier === "undrafted_gleague") tags.push("边缘人");
  return tags.slice(0, 3);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function overall(p) {
  const w =
    p.scoring * 0.16 +
    p.defense * 0.12 +
    p.pass * 0.09 +
    p.rebound * 0.09 +
    (p.steal || 50) * 0.05 +
    (p.block || 40) * 0.05 +
    p.speed * 0.07 +
    p.strength * 0.07 +
    p.iq * 0.1 +
    p.clutch * 0.08 +
    p.stamina * 0.05 +
    ((p.three + p.mid + p.paint) / 3) * 0.07;
  return Math.round(w);
}

export function clonePlayer(p) {
  return structuredClone(p);
}

/** Load full historical roster (async). Safe to call multiple times. */
export function loadPlayers() {
  if (_loaded) return Promise.resolve(PLAYERS);
  if (_loading) return _loading;
  _loading = fetch("./js/data/roster.json")
    .then((r) => {
      if (!r.ok) throw new Error(`roster.json HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      const list = (data.players || []).map(seasonToCard);
      PLAYERS = list;
      _loaded = true;
      console.info(`[roster] loaded ${PLAYERS.length} season cards`);
      return PLAYERS;
    })
    .catch((err) => {
      _loading = null;
      console.error(err);
      throw err;
    });
  return _loading;
}
