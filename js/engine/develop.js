/**
 * Offseason development: players age +1 and morph toward their next
 * historical season card (real career arc). Young PG 2012 → 2013 peak climb.
 */
import { careerPhase, estimateAge, PHASE_LABEL } from "../data/careerArc.js";
import { clonePlayer, overall, PLAYERS } from "../data/players.js";
import { playerPrice } from "../data/intangibles.js";
import { pruneAgedSkills } from "../data/skills.js";
import { developmentModifier } from "../modes/playerDevelopment.js";

const ATTR_KEYS = [
  "scoring",
  "three",
  "mid",
  "paint",
  "pass",
  "defense",
  "rebound",
  "steal",
  "block",
  "speed",
  "strength",
  "stamina",
  "iq",
  "clutch",
];

/** bref → season cards sorted ascending (built lazily; rebuilds when PLAYERS loads). */
let LADDER = null;
let LADDER_N = -1;

export function invalidateDevelopLadder() {
  LADDER = null;
  LADDER_N = -1;
}

function ensureLadder() {
  const n = PLAYERS?.length || 0;
  if (LADDER && LADDER_N === n && n > 0) return LADDER;
  const map = new Map();
  for (const p of PLAYERS || []) {
    const bref = p?.bref;
    if (!bref) continue;
    if (!map.has(bref)) map.set(bref, []);
    map.get(bref).push(p);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => Number(a.season) - Number(b.season) || overall(b) - overall(a));
  }
  LADDER = map;
  LADDER_N = n;
  return map;
}

export function historicalLadder(bref) {
  if (!bref) return [];
  return ensureLadder().get(bref) || [];
}

/**
 * Upside vs this card's place on the real career curve.
 * @returns {{ peak:number, peakSeason:number, delta:number, nextSeason:number|null, nextOvr:number|null }|null}
 */
export function historicalUpside(player) {
  if (!player?.bref) return null;
  const ladder = historicalLadder(player.bref);
  if (ladder.length < 2) return null;
  const curSeason = Number(player.season) || 0;
  const curOvr = overall(player);
  let peak = curOvr;
  let peakSeason = curSeason;
  for (const c of ladder) {
    if (Number(c.season) < curSeason) continue;
    const o = overall(c);
    if (o > peak) {
      peak = o;
      peakSeason = Number(c.season);
    }
  }
  const next = ladder.find((c) => Number(c.season) > curSeason);
  const delta = peak - curOvr;
  return {
    peak,
    peakSeason,
    delta,
    nextSeason: next ? Number(next.season) : null,
    nextOvr: next ? overall(next) : null,
  };
}

export function historicalUpsideHint(player) {
  const u = historicalUpside(player);
  if (!u || u.delta < 4) return "";
  const nextBit =
    u.nextSeason && u.nextOvr != null
      ? ` · 下季史实约 OVR ${u.nextOvr}（${u.nextSeason}）`
      : "";
  return `潜力峰值 OVR ${u.peak}（${u.peakSeason}，约 +${u.delta}）${nextBit}`;
}

function priorSalary(p) {
  if (p?._seasonFree) return 0;
  if (p?.salary != null && Number.isFinite(+p.salary)) return Math.max(0, Math.round(+p.salary));
  return playerPrice(p);
}

function seasonProduction(stats) {
  if (!stats?.gp || stats.gp < 8) return 0;
  const gp = stats.gp;
  return stats.pts / gp + (stats.reb || 0) / gp * 0.7 + (stats.ast || 0) / gp * 0.95;
}

/**
 * 休赛期续约报价：打出来 / 能力涨了就会更贵；表现差可略降。
 * @returns {{ salary:number, mult:number, reason:string, paidFromFree:boolean }}
 */
export function computeRenewalSalary(player, { beforeOvr, beforeSalary = 0, stats = null } = {}) {
  const afterOvr = overall(player);
  const base = playerPrice(player);
  const ovrGain = afterOvr - (beforeOvr ?? afterOvr);
  const prod = seasonProduction(stats);
  let mult = 1;
  const bits = [];

  if (ovrGain >= 15) {
    mult += 0.38;
    bits.push("暴涨");
  } else if (ovrGain >= 8) {
    mult += 0.24;
    bits.push("明显成长");
  } else if (ovrGain >= 3) {
    mult += 0.12;
    bits.push("成长");
  } else if (ovrGain > 0) {
    mult += 0.05;
  } else if (ovrGain <= -8) {
    mult -= 0.12;
    bits.push("下滑");
  } else if (ovrGain < 0) {
    mult -= 0.05;
  }

  if (prod >= 36) {
    mult += 0.3;
    bits.push("巨星级产出");
  } else if (prod >= 28) {
    mult += 0.2;
    bits.push("全明星产出");
  } else if (prod >= 20) {
    mult += 0.12;
    bits.push("首发级产出");
  } else if (prod >= 14) {
    mult += 0.06;
    bits.push("轮换打出");
  } else if (stats?.gp >= 40 && prod < 8) {
    mult -= 0.04;
  }

  let salary = Math.round(base * Math.max(0.7, mult));
  const paidFromFree = !!(player._seasonFree && (ovrGain >= 3 || prod >= 14));
  // 曾免费入队但打出来了：转正合同，至少中产起跳
  if (paidFromFree) {
    salary = Math.max(salary, Math.round(55 + afterOvr * 1.1));
    bits.push("免费转正");
  }
  // 续约不低于「旧薪 × 涨幅」，避免打出来了合同反而更便宜
  if (beforeSalary > 0 && (ovrGain > 0 || prod >= 14)) {
    const floorMult = 1 + Math.min(0.45, 0.06 + Math.max(0, ovrGain) * 0.018 + (prod >= 20 ? 0.08 : 0));
    salary = Math.max(salary, Math.round(beforeSalary * floorMult));
  }
  salary = Math.max(paidFromFree || !player._seasonFree ? 28 : 0, Math.min(520, salary));
  if (player._seasonFree && !paidFromFree) salary = 0;

  return {
    salary,
    mult: +mult.toFixed(2),
    reason: bits.length ? bits.join("·") : "平薪续约",
    paidFromFree,
  };
}

function applyRenewal(evolved, prev, stats) {
  const beforeOvr = overall(prev);
  const beforeSal = priorSalary(prev);
  const deal = computeRenewalSalary(evolved, {
    beforeOvr,
    beforeSalary: beforeSal,
    stats,
  });
  if (deal.paidFromFree) {
    evolved._seasonFree = false;
    evolved._seasonSkip = false;
  }
  if (evolved._seasonFree) {
    evolved.salary = 0;
  } else {
    evolved.salary = deal.salary;
  }
  evolved._renewal = {
    before: beforeSal,
    after: evolved.salary,
    mult: deal.mult,
    reason: deal.reason,
  };
  const salBit =
    evolved.salary !== beforeSal
      ? ` · 续约 ¤${beforeSal}→¤${evolved.salary}（${deal.reason}）`
      : ` · 续约 ¤${evolved.salary}`;
  evolved._developNote = `${evolved._developNote || ""}${salBit}`;
  return evolved;
}

function preserveSeasonFlags(target, source) {
  for (const key of ["_seasonFree", "_seasonSkip", "_seasonAuto"]) {
    if (source[key] === undefined) delete target[key];
    else target[key] = source[key];
  }
}

function declineWithoutHistory(player, rng) {
  const p = clonePlayer(player);
  const age0 = Number(p.age) || estimateAge(p) || 28;
  const age = age0 + 1;
  p.age = age;
  p.season = (Number(p.season) || 0) + 1;
  p.careerPhase = careerPhase(age);
  p.careerPhaseLabel = PHASE_LABEL[p.careerPhase] || p.careerPhase;
  const phase = p.careerPhase;
  for (const k of ATTR_KEYS) {
    if (p[k] == null) continue;
    let d = 0;
    if (phase === "prospect" || phase === "ascending") {
      if (["scoring", "three", "mid", "paint", "defense", "iq", "pass"].includes(k)) d = 1 + rng() * 2;
      if (k === "speed" || k === "stamina") d = 0.5;
    } else if (phase === "prime") {
      d = (rng() - 0.45) * 1.5;
    } else if (phase === "veteran") {
      if (["speed", "stamina", "steal"].includes(k)) d = -2 - rng() * 2;
      if (["iq", "pass", "clutch", "mid"].includes(k)) d = 0.5 + rng();
    } else {
      if (["speed", "stamina", "steal", "paint", "scoring"].includes(k)) d = -3 - rng() * 2;
      if (["iq", "clutch"].includes(k)) d = 0.5;
    }
    p[k] = Math.max(10, Math.min(99, Math.round(Number(p[k]) + d)));
  }
  p._developedFrom = player.season;
  p._developNote = "无后续史实赛季 · 按年龄曲线调整";
  preserveSeasonFlags(p, player);
  pruneAgedSkills(p);
  if (p.skillsLost?.length) {
    p._developNote += ` · 失去技能 ${p.skillsLost.slice(-3).join("/")}`;
  }
  return p;
}

/**
 * Advance one roster player by one year along historical career when possible.
 * Keeps free-agent / skip flags; merges award skills with next card's skills.
 */
export function advancePlayerOneYear(player, { rng = Math.random } = {}) {
  if (!player) return player;
  const ladder = historicalLadder(player.bref);
  const curSeason = Number(player.season) || 0;
  const nextCard = ladder.find((c) => Number(c.season) > curSeason);
  if (!nextCard) return declineWithoutHistory(player, rng);

  const evolved = clonePlayer(nextCard);
  const beforeOvr = overall(player);
  preserveSeasonFlags(evolved, player);
  if (player.contract && typeof player.contract === "object") {
    evolved.contract = structuredClone(player.contract);
    evolved.salary = evolved.contract.salary;
  }
  // 只保留下一年卡自带技能 + 上一年仍达标的非运动技能，避免老年卡被巅峰技能“粘回去”
  const merged = new Set([...(evolved.skills || [])]);
  for (const id of player.skills || []) {
    if (!merged.has(id)) merged.add(id);
  }
  evolved.skills = [...merged].slice(0, 6);
  pruneAgedSkills(evolved);
  evolved._developedFrom = player.season;
  evolved._developBeforeOvr = beforeOvr;
  evolved._developAfterOvr = overall(evolved);
  const lostBit =
    evolved.skillsLost?.length &&
    !(player.skills || []).every((s) => (evolved.skills || []).includes(s))
      ? ` · 衰老掉技 ${evolved.skillsLost.filter((s) => (player.skills || []).includes(s)).slice(0, 3).join("/")}`
      : "";
  evolved._developNote =
    (evolved._developAfterOvr >= beforeOvr
      ? `史实成长 ${player.season}→${evolved.season} · OVR ${beforeOvr}→${evolved._developAfterOvr}`
      : `史实曲线 ${player.season}→${evolved.season} · OVR ${beforeOvr}→${evolved._developAfterOvr}`) +
    lostBit;
  return evolved;
}

/**
 * Develop every roster in the league; renews salaries (stars who played well cost more).
 * Returns change log for user team.
 */
export function developLeagueRosters(
  st,
  { rng = Math.random, developmentPlans = {} } = {},
) {
  if (
    !developmentPlans ||
    typeof developmentPlans !== "object" ||
    Array.isArray(developmentPlans)
  ) {
    throw new TypeError("developmentPlans must be an object");
  }
  const userRoster = st?.teams?.[st.userTeamId]?.players || [];
  const rosterByBref = new Map(userRoster.map((player) => [player.bref, player]));
  const rosterBrefs = [...rosterByBref.keys()];
  for (const [bref, plan] of Object.entries(developmentPlans)) {
    if (typeof bref !== "string" || bref.trim() === "") {
      throw new TypeError("development plan bref must be a non-empty string");
    }
    developmentModifier(rosterByBref.get(bref) || {}, plan, {});
  }

  const log = [];
  const teams = st?.teams || {};
  for (const tid of Object.keys(teams)) {
    const team = teams[tid];
    if (!team?.players?.length) continue;
    const nextPlayers = [];
    for (const p of team.players) {
      if (Number(p.season) > Number(st.year)) {
        nextPlayers.push(p);
        continue;
      }
      const before = overall(p);
      const beforeSal = priorSalary(p);
      const statsKey = `${tid}:${p.id}`;
      const stats = st.playerSeason?.[statsKey]?.stats || null;
      let evolved = advancePlayerOneYear(p, { rng });
      if (Number(p._draftYear) < Number(st.year)) {
        delete evolved._rookie;
      }
      if (p.contract && typeof p.contract === "object") {
        evolved.contract = structuredClone(p.contract);
        const signedThisOffseason =
          Number.isInteger(evolved.contract.signedYear) &&
          evolved.contract.signedYear === Number(st.year);
        if (
          !signedThisOffseason &&
          Number.isFinite(evolved.contract.yearsRemaining) &&
          evolved.contract.yearsRemaining > 0
        ) {
          evolved.contract.yearsRemaining = Math.max(
            0,
            evolved.contract.yearsRemaining - 1,
          );
        }
        if (
          Number.isFinite(evolved.contract.yearsRemaining) &&
          evolved.contract.yearsRemaining === 0
        ) {
          evolved = applyRenewal(evolved, p, stats);
          evolved.contract.salary = evolved.salary;
        } else if (Number.isFinite(evolved.contract.salary)) {
          evolved.salary = evolved.contract.salary;
        }
      } else {
        evolved = applyRenewal(evolved, p, stats);
      }
      delete evolved._developmentPlan;
      delete evolved._developmentEffects;
      let appliedPlan = null;
      let developmentEffects = null;
      if (tid === st.userTeamId && developmentPlans[p.bref]) {
        appliedPlan = structuredClone(developmentPlans[p.bref]);
        const mentor = appliedPlan.mentorBref
          ? rosterByBref.get(appliedPlan.mentorBref) || null
          : null;
        developmentEffects = developmentModifier(evolved, appliedPlan, {
          averageMinutes:
            stats?.gp > 0 && Number.isFinite(Number(stats.min))
              ? Number(stats.min) / Number(stats.gp)
              : 0,
          morale:
            p.morale !== null &&
            p.morale !== "" &&
            Number.isFinite(Number(p.morale))
              ? Number(p.morale)
              : 50,
          injured: Number(p.injuredGames) > 0 || Boolean(p.injuryStatus),
          roleStable:
            p._developmentPlan?.role === appliedPlan.role ||
            p.roleExpectation === appliedPlan.role,
          mentor,
          rosterBrefs,
        });
        for (const [attribute, delta] of Object.entries(
          developmentEffects.attributeDeltas,
        )) {
          evolved[attribute] = Math.max(
            10,
            Math.min(99, Number(evolved[attribute] ?? 10) + Number(delta)),
          );
        }
        evolved._developmentPlan = appliedPlan;
        evolved._developmentEffects = structuredClone(developmentEffects);
        if (appliedPlan.source === "manual" || !p._roleManual) {
          evolved.roleExpectation = appliedPlan.role;
        }
        const morale =
          p.morale !== null &&
          p.morale !== "" &&
          Number.isFinite(Number(p.morale))
            ? Number(p.morale)
            : 50;
        evolved.morale = Math.max(
          0,
          Math.min(100, morale + developmentEffects.moraleDelta),
        );
        evolved.intangibles = { ...(evolved.intangibles || {}) };
        const injuryRisk = Number(evolved.intangibles.injuryRisk);
        evolved.intangibles.injuryRisk = Math.max(
          0,
          Math.min(
            100,
            (Number.isFinite(injuryRisk) ? injuryRisk : 40)
              + developmentEffects.injuryRiskDelta,
          ),
        );
        evolved._developNote = `${evolved._developNote || ""} · 训练 +${developmentEffects.totalPoints}`;
      }
      const after = overall(evolved);
      if (evolved._developAfterOvr !== undefined) {
        evolved._developAfterOvr = after;
        evolved._developNote = String(evolved._developNote || "").replace(
          /OVR (\d+)→(\d+)/,
          `OVR $1→${after}`,
        );
      }
      const hasFutureCard = historicalLadder(p.bref).some(
        (card) => Number(card.season) > Number(p.season),
      );
      const retired =
        !hasFutureCard &&
        (
          Number(evolved.age) >= 40 ||
          (Number(evolved.age) >= 36 && overall(evolved) < 45)
        );
      if (!retired) nextPlayers.push(evolved);
      if (tid === st.userTeamId) {
        log.push({
          id: evolved.id,
          name: evolved.name,
          bref: evolved.bref,
          fromSeason: p.season,
          toSeason: evolved.season,
          before,
          after,
          delta: after - before,
          salaryBefore: beforeSal,
          salaryAfter: evolved.salary ?? 0,
          renewal: evolved._renewal?.reason || "",
          note: evolved._developNote || "",
          plan: appliedPlan,
          effects: developmentEffects,
          retired,
        });
      }
    }
    team.players = nextPlayers;
  }
  log.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.salaryAfter - a.salaryAfter);
  return log;
}
