/**
 * 能力值体现不出的「暗属性」——不进 OVR，但强烈影响模拟。
 * 同一张赛季卡用 bref+season 稳定随机，保证可复现。
 */
export const INTANGIBLE_DEFS = {
  gravity: { name: "引力", desc: "吸引协防，给队友创造空位" },
  shotCreation: { name: "自主造投", desc: "强干扰下仍能挤出出手" },
  toughness: { name: "硬气", desc: "高疲劳时仍能维持效率" },
  leadership: { name: "领袖气场", desc: "在场抬升全队士气与专注" },
  motor: { name: "马达", desc: "二次争抢、回防更积极" },
  composure: { name: "抗压冷静", desc: "关键回合降低失误" },
  killerInstinct: { name: "杀手本能", desc: "分差胶着/末节命中加成" },
  switchability: { name: "换防弹性", desc: "防错位不至于崩盘" },
  chemistryMagnet: { name: "化学反应核", desc: "在场显著提升阵容化学反应" },
  clutchVision: { name: "决胜视野", desc: "关键球更容易找到最优选择" },
};

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rnd(seed, i) {
  let x = (seed + i * 9973) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/** Attach intangibles object (0–99) onto a player card. */
export function attachIntangibles(player) {
  const seed = hashSeed(`${player.bref || player.id}|${player.season}|${player.name}`);
  const base = (key, bias = 50) => clamp(Math.round(bias + (rnd(seed, key.length + bias) - 0.5) * 40), 15, 96);

  const intangibles = {
    gravity: base("gravity", 40 + (player.scoring || 50) * 0.25 + (player.three || 40) * 0.15),
    shotCreation: base("shot", 35 + (player.scoring || 50) * 0.35 + (player.mid || 50) * 0.1),
    toughness: base("tough", 45 + (player.strength || 50) * 0.2 + (player.stamina || 50) * 0.15),
    leadership: base("lead", 40 + (player.personality?.team || 50) * 0.25 + (player.iq || 50) * 0.15),
    motor: base("motor", 45 + (player.steal || 40) * 0.15 + (player.rebound || 50) * 0.15),
    composure: base("comp", 40 + (player.personality?.calm || 50) * 0.35 + (player.iq || 50) * 0.1),
    killerInstinct: base("kill", 40 + (player.clutch || 50) * 0.4),
    switchability: base("sw", 40 + (player.defense || 50) * 0.2 + (player.speed || 50) * 0.2),
    chemistryMagnet: base("chem", 40 + (player.pass || 50) * 0.2 + (player.personality?.team || 50) * 0.25),
    clutchVision: base("vision", 40 + (player.pass || 50) * 0.25 + (player.iq || 50) * 0.25),
  };

  // Archetype flavor bumps
  const arch = player.archetype || "";
  if (arch.includes("shooter") || arch.includes("spacing")) intangibles.gravity = clamp(intangibles.gravity + 8, 15, 99);
  if (arch.includes("iso") || arch.includes("mamba") || arch.includes("goat")) {
    intangibles.shotCreation = clamp(intangibles.shotCreation + 10, 15, 99);
    intangibles.killerInstinct = clamp(intangibles.killerInstinct + 8, 15, 99);
  }
  if (arch.includes("connector") || arch.includes("floor_general") || arch.includes("playmaking")) {
    intangibles.chemistryMagnet = clamp(intangibles.chemistryMagnet + 10, 15, 99);
    intangibles.clutchVision = clamp(intangibles.clutchVision + 8, 15, 99);
  }
  if (arch.includes("pest") || arch.includes("two_way")) {
    intangibles.motor = clamp(intangibles.motor + 8, 15, 99);
    intangibles.switchability = clamp(intangibles.switchability + 10, 15, 99);
  }

  player.intangibles = intangibles;
  return player;
}

export function topIntangibles(player, n = 3) {
  const entries = Object.entries(player.intangibles || {});
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, value: v, ...(INTANGIBLE_DEFS[k] || { name: k, desc: "" }) }));
}

/** Market price in gold. */
export function playerPrice(p) {
  const ovr = (p.scoring + p.defense + p.pass + p.rebound) / 4;
  const aura =
    ((p.intangibles?.leadership || 50) + (p.intangibles?.killerInstinct || 50) + (p.intangibles?.gravity || 50)) / 3;
  return Math.round(80 + ovr * 6 + aura * 1.2);
}
