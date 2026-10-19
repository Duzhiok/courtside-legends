/**
 * In-season free agency / cuts / trades under a salary cap.
 * Salary units reuse playerPrice (¤) so market numbers stay consistent.
 * Coaches & assistants also hire from a staff free-agent pool (count vs cap).
 */
import { ASSISTANTS, COACHES, coachDrawWeight, coachSpecialtyLabel, coachTactics } from "../data/coaches.js";
import { playerPrice, marketMeta } from "../data/intangibles.js";
import { PLAYERS, clonePlayer, overall } from "../data/players.js";

/** Prefer season roster keys so historical leagues aren't stuck on modern 32. */
function seasonTeamIds(st) {
  if (Array.isArray(st?.league?.teamIds) && st.league.teamIds.length) return st.league.teamIds;
  return Object.keys(st?.teams || {});
}

export const SEASON_SALARY_CAP = 2000;
/** Hard apron — cannot sign FA above this without cutting first. */
export const SEASON_APRON = 2300;
export const SEASON_MAX_ROSTER = 15;
export const SEASON_MIN_ROSTER = 8;
export const FA_POOL_SIZE = 40;
export const STAFF_COACH_POOL = 10;
export const STAFF_ASST_POOL = 8;

export function playerSalary(p) {
  // 开局「跳过」随机赠送：不占薪资帽
  if (p?._seasonFree) return 0;
  if (p?.salary != null && Number.isFinite(+p.salary)) return Math.max(25, Math.round(+p.salary));
  return playerPrice(p);
}

/** Coaching staff annual cost (¤), scaled by fame. */
export function staffSalary(staff) {
  if (!staff) return 0;
  if (staff.salary != null && Number.isFinite(+staff.salary)) return Math.max(0, Math.round(+staff.salary));
  const fame = Number(staff.fame) || 40;
  const asst = !!(staff.role || String(staff.id || "").startsWith("asst"));
  const base = asst ? 28 + fame * 0.85 : 55 + fame * 1.35;
  return Math.round(Math.max(asst ? 22 : 40, Math.min(asst ? 160 : 300, base)));
}

export function ensurePlayerSalary(p) {
  if (!p) return p;
  if (p.salary == null) p.salary = playerPrice(p);
  return p;
}

export function ensureStaffSalary(staff) {
  if (!staff) return staff;
  if (staff.salary == null) staff.salary = staffSalary(staff);
  return staff;
}

export function teamPayroll(team) {
  const players = (team?.players || []).reduce((s, p) => s + playerSalary(p), 0);
  return players + staffSalary(team?.coach) + staffSalary(team?.assistant);
}

export function salarySpace(team, cap = SEASON_SALARY_CAP) {
  return cap - teamPayroll(team);
}

export function rosterCount(team) {
  return team?.players?.length || 0;
}

export function payrollSummary(team) {
  const playersPay = (team?.players || []).reduce((s, p) => s + playerSalary(p), 0);
  const coachPay = staffSalary(team?.coach);
  const asstPay = staffSalary(team?.assistant);
  const payroll = playersPay + coachPay + asstPay;
  const n = rosterCount(team);
  return {
    payroll,
    playersPay,
    coachPay,
    asstPay,
    n,
    cap: SEASON_SALARY_CAP,
    apron: SEASON_APRON,
    space: SEASON_SALARY_CAP - payroll,
    apronRoom: SEASON_APRON - payroll,
    overCap: payroll > SEASON_SALARY_CAP,
    overApron: payroll > SEASON_APRON,
  };
}

/** Assign salaries on all rosters (idempotent). */
export function hydrateSeasonSalaries(st) {
  for (const id of seasonTeamIds(st)) {
    const t = st.teams[id];
    if (!t) continue;
    if (t.players) for (const p of t.players) ensurePlayerSalary(p);
    if (t.coach) ensureStaffSalary(t.coach);
    if (t.assistant) ensureStaffSalary(t.assistant);
  }
  if (Array.isArray(st.freeAgents)) {
    for (const p of st.freeAgents) ensurePlayerSalary(p);
  }
  if (st.staffMarket) {
    for (const c of st.staffMarket.coaches || []) ensureStaffSalary(c);
    for (const a of st.staffMarket.assistants || []) ensureStaffSalary(a);
  }
  return st;
}

function weightedPickStaff(pool, n, weightFn, rng = Math.random) {
  const bag = pool.map((x) => structuredClone(x));
  const out = [];
  while (out.length < n && bag.length) {
    const weights = bag.map((x) => Math.max(1, weightFn(x)));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < bag.length; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    idx = Math.min(idx, bag.length - 1);
    const [pick] = bag.splice(idx, 1);
    ensureStaffSalary(pick);
    out.push(pick);
  }
  return out;
}

/** Coaches / assistants available to hire (not currently on your staff). */
export function refreshStaffMarket(st, { force = false, rng = Math.random } = {}) {
  hydrateSeasonSalaries(st);
  if (
    !force &&
    Array.isArray(st.staffMarket?.coaches) &&
    st.staffMarket.coaches.length >= 4 &&
    Array.isArray(st.staffMarket?.assistants) &&
    st.staffMarket.assistants.length >= 3
  ) {
    return st.staffMarket;
  }
  const you = st.teams?.[st.userTeamId];
  const used = new Set();
  if (you?.coach?.id) used.add(you.coach.id);
  if (you?.assistant?.id) used.add(you.assistant.id);
  for (const c of st.staffMarket?.coaches || []) if (c?.id) used.add(c.id);
  // When force-refresh, ignore previous market ids so pool reshuffles
  const block = force
    ? new Set([you?.coach?.id, you?.assistant?.id].filter(Boolean))
    : used;

  const coachPool = COACHES.filter((c) => c?.id && !block.has(c.id));
  const asstPool = ASSISTANTS.filter((a) => a?.id && !block.has(a.id));
  const coaches = weightedPickStaff(
    coachPool,
    STAFF_COACH_POOL,
    (c) => coachDrawWeight(c),
    rng,
  );
  const assistants = weightedPickStaff(asstPool, STAFF_ASST_POOL, (a) => {
    const fame = a.fame ?? 40;
    if (fame >= 55) return 8;
    if (fame >= 35) return 20;
    return 40;
  }, rng);
  for (const c of coaches) c.staffKind = "coach";
  for (const a of assistants) a.staffKind = "assistant";
  st.staffMarket = { coaches, assistants, refreshedAt: st.dayIndex ?? 0 };
  return st.staffMarket;
}

/**
 * Build / refresh free-agent pool from unused season cards.
 * Prefers mid-tier OVRs so FA isn't all superstars.
 */
export function refreshFreeAgency(st, { force = false, rng = Math.random } = {}) {
  hydrateSeasonSalaries(st);
  if (!force && Array.isArray(st.freeAgents) && st.freeAgents.length >= 12) {
    return st.freeAgents;
  }
  const usedRosters = new Set();
  for (const id of seasonTeamIds(st)) {
    for (const p of st.teams[id]?.players || []) usedRosters.add(p.id);
  }

  const year = st.mode === "historical" ? Number(st.year) : null;
  const pool = PLAYERS.filter((p) => {
    if (usedRosters.has(p.id)) return false;
    if (year && Number(p.season) !== year) return false;
    return true;
  })
    .map((p) => clonePlayer(p))
    .map(ensurePlayerSalary)
    .sort((a, b) => {
      // Mid OVR first, then sprinkle stars
      const oa = overall(a);
      const ob = overall(b);
      const score = (o) => (o >= 88 ? o - 20 : o >= 78 ? o + 5 : o);
      return score(ob) - score(oa);
    });

  const picks = [];
  const seenBref = new Set();
  for (const p of pool) {
    if (picks.length >= FA_POOL_SIZE) break;
    if (seenBref.has(p.bref) && rng() < 0.7) continue;
    seenBref.add(p.bref);
    picks.push(p);
  }
  // Shuffle display
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  st.freeAgents = picks;
  st.faRefreshedAt = st.dayIndex ?? 0;
  return picks;
}

export function ensureSeasonMarket(st) {
  if (!st) return st;
  hydrateSeasonSalaries(st);
  if (!Array.isArray(st.freeAgents) || !st.freeAgents.length) {
    refreshFreeAgency(st, { force: true });
  }
  if (!st.staffMarket?.coaches?.length || !st.staffMarket?.assistants?.length) {
    refreshStaffMarket(st, { force: true });
  }
  if (!Array.isArray(st.tradeLog)) st.tradeLog = [];
  return st;
}

function canAffordStaffDelta(team, addSal, removeSal = 0) {
  const pay = teamPayroll(team) - removeSal + addSal;
  if (pay > SEASON_APRON) {
    return { ok: false, reason: `超过硬工资帽 ${SEASON_APRON}（含教练组）` };
  }
  return { ok: true, pay };
}

/** Hire HC from staff market (replaces current; old HC returns to market). */
export function hireCoach(st, coachId) {
  ensureSeasonMarket(st);
  if (st.phase !== "regular") return { ok: false, reason: "仅常规赛期间可更换教练组" };
  const team = st.teams[st.userTeamId];
  if (!team) return { ok: false, reason: "找不到球队" };
  const pool = st.staffMarket?.coaches || [];
  const idx = pool.findIndex((c) => c.id === coachId);
  if (idx < 0) return { ok: false, reason: "应聘名单中没有这位主帅" };
  const next = structuredClone(pool[idx]);
  ensureStaffSalary(next);
  const old = team.coach ? structuredClone(team.coach) : null;
  if (old) ensureStaffSalary(old);
  const gate = canAffordStaffDelta(team, staffSalary(next), staffSalary(old));
  if (!gate.ok) return gate;

  pool.splice(idx, 1);
  if (old?.id) {
    old.staffKind = "coach";
    pool.unshift(old);
  }
  team.coach = next;
  st.tradeLog.push({
    type: "hire_coach",
    year: st.year,
    day: st.dayIndex,
    coachId: next.id,
    name: next.name,
    salary: staffSalary(next),
    replaced: old?.name || null,
  });
  return { ok: true, coach: next, payroll: payrollSummary(team) };
}

/** Hire assistant from staff market. */
export function hireAssistant(st, assistantId) {
  ensureSeasonMarket(st);
  if (st.phase !== "regular") return { ok: false, reason: "仅常规赛期间可更换教练组" };
  const team = st.teams[st.userTeamId];
  if (!team) return { ok: false, reason: "找不到球队" };
  const pool = st.staffMarket?.assistants || [];
  const idx = pool.findIndex((a) => a.id === assistantId);
  if (idx < 0) return { ok: false, reason: "应聘名单中没有这位助教" };
  const next = structuredClone(pool[idx]);
  ensureStaffSalary(next);
  const old = team.assistant ? structuredClone(team.assistant) : null;
  if (old) ensureStaffSalary(old);
  const gate = canAffordStaffDelta(team, staffSalary(next), staffSalary(old));
  if (!gate.ok) return gate;

  pool.splice(idx, 1);
  if (old?.id) {
    old.staffKind = "assistant";
    pool.unshift(old);
  }
  team.assistant = next;
  st.tradeLog.push({
    type: "hire_assistant",
    year: st.year,
    day: st.dayIndex,
    assistantId: next.id,
    name: next.name,
    salary: staffSalary(next),
    replaced: old?.name || null,
  });
  return { ok: true, assistant: next, payroll: payrollSummary(team) };
}

/** Fire HC — returns to staff market; team may have no coach until hire. */
export function fireCoach(st) {
  ensureSeasonMarket(st);
  if (st.phase !== "regular") return { ok: false, reason: "仅常规赛期间可更换教练组" };
  const team = st.teams[st.userTeamId];
  if (!team?.coach) return { ok: false, reason: "当前没有主教练" };
  const old = structuredClone(team.coach);
  ensureStaffSalary(old);
  old.staffKind = "coach";
  team.coach = null;
  st.staffMarket = st.staffMarket || { coaches: [], assistants: [] };
  st.staffMarket.coaches = st.staffMarket.coaches || [];
  if (!st.staffMarket.coaches.some((c) => c.id === old.id)) st.staffMarket.coaches.unshift(old);
  st.tradeLog.push({
    type: "fire_coach",
    year: st.year,
    day: st.dayIndex,
    name: old.name,
    salary: staffSalary(old),
  });
  return { ok: true, coach: old, payroll: payrollSummary(team) };
}

export function fireAssistant(st) {
  ensureSeasonMarket(st);
  if (st.phase !== "regular") return { ok: false, reason: "仅常规赛期间可更换教练组" };
  const team = st.teams[st.userTeamId];
  if (!team?.assistant) return { ok: false, reason: "当前没有助教" };
  const old = structuredClone(team.assistant);
  ensureStaffSalary(old);
  old.staffKind = "assistant";
  team.assistant = null;
  st.staffMarket = st.staffMarket || { coaches: [], assistants: [] };
  st.staffMarket.assistants = st.staffMarket.assistants || [];
  if (!st.staffMarket.assistants.some((a) => a.id === old.id)) st.staffMarket.assistants.unshift(old);
  st.tradeLog.push({
    type: "fire_assistant",
    year: st.year,
    day: st.dayIndex,
    name: old.name,
    salary: staffSalary(old),
  });
  return { ok: true, assistant: old, payroll: payrollSummary(team) };
}

export function staffMarketLabel(staff) {
  if (!staff) return "";
  const kind = staff.staffKind || (staff.role ? "assistant" : "coach");
  if (kind === "assistant") {
    return `${staff.role || "助教"} · 攻${staff.buffs?.offense || 0} 防${staff.buffs?.defense || 0} 气${staff.buffs?.morale || 0}`;
  }
  const book = coachTactics(staff)
    .map((t) => t.name)
    .slice(0, 2)
    .join("·");
  return `${staff.style || "主帅"} · ${coachSpecialtyLabel(staff)}${book ? ` · ${book}` : ""}`;
}

/** Cut / waive — salary off books, player joins FA. */
export function cutPlayer(st, playerId) {
  ensureSeasonMarket(st);
  if (st.phase !== "regular") return { ok: false, reason: "仅常规赛期间可操作阵容" };
  const team = st.teams[st.userTeamId];
  if (!team) return { ok: false, reason: "找不到球队" };
  if (rosterCount(team) <= SEASON_MIN_ROSTER) {
    return { ok: false, reason: `至少保留 ${SEASON_MIN_ROSTER} 人` };
  }
  const idx = team.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, reason: "阵容中没有该球员" };
  const [cut] = team.players.splice(idx, 1);
  ensurePlayerSalary(cut);
  st.freeAgents = st.freeAgents || [];
  if (!st.freeAgents.some((p) => p.id === cut.id)) st.freeAgents.unshift(cut);
  st.tradeLog.push({
    type: "cut",
    year: st.year,
    day: st.dayIndex,
    playerId: cut.id,
    name: cut.name,
    salary: playerSalary(cut),
  });
  return { ok: true, player: cut, payroll: payrollSummary(team) };
}

/** Sign FA if under apron and roster room. Soft-cap OK if space covers salary; hard block over apron. */
export function signFreeAgent(st, playerId) {
  ensureSeasonMarket(st);
  if (st.phase !== "regular") return { ok: false, reason: "仅常规赛期间可签约" };
  const team = st.teams[st.userTeamId];
  const faIdx = (st.freeAgents || []).findIndex((p) => p.id === playerId);
  if (faIdx < 0) return { ok: false, reason: "自由球员名单中没有此人" };
  if (rosterCount(team) >= SEASON_MAX_ROSTER) {
    return { ok: false, reason: `名单已满（最多 ${SEASON_MAX_ROSTER} 人），请先裁人或交易` };
  }
  const player = st.freeAgents[faIdx];
  ensurePlayerSalary(player);
  const sal = playerSalary(player);
  const pay = teamPayroll(team);
  if (pay + sal > SEASON_APRON) {
    return {
      ok: false,
      reason: `超过硬工资帽上限 ${SEASON_APRON}（当前 ${pay} + 合同 ${sal}）`,
    };
  }
  // Soft cap: allow if already over soft cap only when signing min-ish deals
  if (pay >= SEASON_SALARY_CAP && sal > 90) {
    return {
      ok: false,
      reason: `已超软工资帽 ${SEASON_SALARY_CAP}，只能签迷你合同（¤90 以下）或先腾出空间`,
    };
  }
  st.freeAgents.splice(faIdx, 1);
  team.players.push(player);
  st.tradeLog.push({
    type: "sign",
    year: st.year,
    day: st.dayIndex,
    playerId: player.id,
    name: player.name,
    salary: sal,
  });
  return { ok: true, player, payroll: payrollSummary(team) };
}

function teamByPlayer(st, playerId) {
  for (const id of seasonTeamIds(st)) {
    const t = st.teams[id];
    if (t?.players?.some((p) => p.id === playerId)) return { teamId: id, team: t };
  }
  return null;
}

/**
 * 1-for-1 or N-for-M trade with a CPU club.
 * Salary match: outgoing within 25% + ¤40 of incoming (NBA-ish simplified).
 */
export function executeTrade(st, { giveIds = [], wantIds = [], cpuTeamId } = {}) {
  ensureSeasonMarket(st);
  if (st.phase !== "regular") return { ok: false, reason: "仅常规赛期间可交易" };
  const you = st.teams[st.userTeamId];
  const cpu = st.teams[cpuTeamId];
  if (!you || !cpu || cpuTeamId === st.userTeamId) return { ok: false, reason: "对手无效" };
  if (!giveIds.length || !wantIds.length) return { ok: false, reason: "双方都需出人" };

  const give = giveIds.map((id) => you.players.find((p) => p.id === id)).filter(Boolean);
  const want = wantIds.map((id) => cpu.players.find((p) => p.id === id)).filter(Boolean);
  if (give.length !== giveIds.length) return { ok: false, reason: "我方球员无效" };
  if (want.length !== wantIds.length) return { ok: false, reason: "对方球员无效" };

  const salOut = give.reduce((s, p) => s + playerSalary(p), 0);
  const salIn = want.reduce((s, p) => s + playerSalary(p), 0);
  const ovrOut = give.reduce((s, p) => s + overall(p), 0);
  const ovrIn = want.reduce((s, p) => s + overall(p), 0);

  // Roster size after
  const youAfter = rosterCount(you) - give.length + want.length;
  const cpuAfter = rosterCount(cpu) - want.length + give.length;
  if (youAfter > SEASON_MAX_ROSTER || youAfter < SEASON_MIN_ROSTER) {
    return { ok: false, reason: `交易后我方人数须在 ${SEASON_MIN_ROSTER}–${SEASON_MAX_ROSTER}` };
  }
  if (cpuAfter > SEASON_MAX_ROSTER || cpuAfter < SEASON_MIN_ROSTER) {
    return { ok: false, reason: "对方人数不合规，CPU 拒绝" };
  }

  // Your apron after trade
  const youPayAfter = teamPayroll(you) - salOut + salIn;
  if (youPayAfter > SEASON_APRON) {
    return { ok: false, reason: `交易后将超过硬帽 ${SEASON_APRON}` };
  }

  // CPU acceptance
  const salaryOk = salIn <= salOut * 1.25 + 40 || salOut <= salIn * 1.25 + 40;
  const valueOk = ovrIn + 4 >= ovrOut * 0.9 || salOut >= salIn + 80; // dumping salary helps
  const cpuNeedsSpace = teamPayroll(cpu) > SEASON_SALARY_CAP && salOut < salIn;
  if (!salaryOk && !cpuNeedsSpace) {
    return { ok: false, reason: "薪资差太大，对方拒绝（需大致匹配）" };
  }
  if (!valueOk && Math.random() > 0.25) {
    return { ok: false, reason: "对方认为吃亏，拒绝交易" };
  }
  // CPU apron
  if (teamPayroll(cpu) - salIn + salOut > SEASON_APRON + 50) {
    return { ok: false, reason: "对方硬帽放不下，拒绝" };
  }

  // Execute
  you.players = you.players.filter((p) => !giveIds.includes(p.id)).concat(want.map((p) => clonePlayer(p)));
  cpu.players = cpu.players.filter((p) => !wantIds.includes(p.id)).concat(give.map((p) => clonePlayer(p)));
  for (const p of you.players) ensurePlayerSalary(p);
  for (const p of cpu.players) ensurePlayerSalary(p);

  st.tradeLog.push({
    type: "trade",
    year: st.year,
    day: st.dayIndex,
    with: cpuTeamId,
    withName: cpu.name,
    give: give.map((p) => ({ id: p.id, name: p.name, salary: playerSalary(p) })),
    get: want.map((p) => ({ id: p.id, name: p.name, salary: playerSalary(p) })),
  });

  return {
    ok: true,
    message: `成交：送出 ${give.map((p) => p.name).join("、")}，得到 ${want.map((p) => p.name).join("、")}`,
    payroll: payrollSummary(you),
  };
}

/** Upcoming user games for schedule strip. */
export function upcomingUserGames(st, limit = 12) {
  const out = [];
  if (!st?.schedule) return out;
  for (let d = st.dayIndex || 0; d < st.schedule.length && out.length < limit; d++) {
    for (const g of st.schedule[d]) {
      if (g.played) continue;
      if (g.homeId !== st.userTeamId && g.awayId !== st.userTeamId) continue;
      out.push({
        day: d,
        homeId: g.homeId,
        awayId: g.awayId,
        home: st.teams[g.homeId]?.name || g.homeId,
        away: st.teams[g.awayId]?.name || g.awayId,
        homeGame: g.homeId === st.userTeamId,
      });
    }
  }
  return out;
}

export function formatSalary(n) {
  return `¤${Math.round(n)}`;
}

export function salaryLine(p) {
  const s = playerSalary(p);
  return `${formatSalary(s)} · ${marketMeta(p)}`;
}

export { teamByPlayer };
