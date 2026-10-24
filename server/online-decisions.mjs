/**
 * T6 P0 decision validation + application (server side, authoritative).
 *
 * The client never touches sim state: it sends a decision, the server
 * validates it against the live sim (the caller's own side only) and either
 * applies it or replies decision_rejected. Validation and application are
 * deliberately separate so tests can check rejection without mutating a sim.
 *
 * P0 decision set: sub / tactic / focus / playpos / timeout / resume.
 * Explicitly NOT in P0: defensive schemes (sim defensePlan is you-side-only
 * in the engine) and autopilot switches (also you-side managed). Both are
 * P1 engine work, not protocol work.
 */
import { TACTICS } from "../js/data/coaches.js";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

function teamOf(sim, side) {
  return side === "away" ? sim.away : sim.home;
}

export function validateDecision(sim, side, d) {
  if (!d || typeof d !== "object" || typeof d.kind !== "string") {
    return { ok: false, reason: "指令格式错误" };
  }
  if (side !== "home" && side !== "away") {
    return { ok: false, reason: "未知一方" };
  }
  const team = teamOf(sim, side);
  switch (d.kind) {
    case "sub": {
      const out = team.onCourt.find((p) => p.id === d.outId);
      const inn = team.bench.find((p) => p.id === d.inId);
      if (!out || !inn) return { ok: false, reason: "换人球员不在场上/板凳" };
      if ((inn.injuredGames || 0) > 0) {
        return { ok: false, reason: `${inn.name} 伤停，不能上场` };
      }
      return { ok: true, apply: () => sim.substitute(d.outId, d.inId, side) };
    }
    case "tactic": {
      if (!TACTICS[d.tacticId]) return { ok: false, reason: "战术不存在" };
      return { ok: true, apply: () => sim.setTactic(d.tacticId, side) };
    }
    case "focus": {
      if (
        d.playerId != null &&
        !team.onCourt.some((p) => p.id === d.playerId)
      ) {
        return { ok: false, reason: "持球人必须是场上球员" };
      }
      return {
        ok: true,
        // setOffenseFocus's clear branch returns false by legacy UI
        // convention even though it succeeded; validation already passed,
        // so normalize to true here.
        apply: () => {
          sim.setOffenseFocus(d.playerId ?? null, { sideKey: side });
          return true;
        },
      };
    }
    case "playpos": {
      const p = team.roster.find((x) => x.id === d.playerId);
      if (!p) return { ok: false, reason: "找不到该球员" };
      const pos = String(d.pos || "").toUpperCase();
      if (!POSITIONS.includes(pos)) return { ok: false, reason: "位置无效" };
      return { ok: true, apply: () => sim.setPlayPos(d.playerId, pos, side) };
    }
    case "timeout": {
      if ((sim.timeouts[side] || 0) <= 0) {
        return { ok: false, reason: "没有暂停了" };
      }
      return { ok: true, apply: () => sim.callTimeout(side) };
    }
    case "resume": {
      if (!sim.paused) return { ok: false, reason: "比赛没有暂停" };
      return { ok: true, apply: () => sim.setPaused(false) };
    }
    default:
      return { ok: false, reason: "未知指令" };
  }
}

/**
 * Human-readable line for a decision, composed BEFORE it is applied
 * (sub names come from the pre-swap onCourt/bench). Broadcast to both
 * clients so the feed always names the acting side — the sim's own coach
 * events don't carry a side.
 */
export function describeDecision(sim, side, d) {
  const team = teamOf(sim, side);
  const name = team.name;
  switch (d.kind) {
    case "sub": {
      const out = team.onCourt.find((p) => p.id === d.outId);
      const inn = team.bench.find((p) => p.id === d.inId);
      return `${name}换人：${out?.name || d.outId} ↓ ${inn?.name || d.inId} ↑`;
    }
    case "tactic":
      return `${name}战术切换为「${TACTICS[d.tacticId]?.name || d.tacticId}」`;
    case "focus": {
      if (d.playerId == null) return `${name}取消指定持球人`;
      const p = team.onCourt.find((x) => x.id === d.playerId);
      return `${name}指定持球人：${p?.name || d.playerId}`;
    }
    case "playpos": {
      const p = team.roster.find((x) => x.id === d.playerId);
      const prev = p ? p.playPos || p.pos : "?";
      return `${name}站位调整：${p?.name || d.playerId} ${prev} → ${String(d.pos || "").toUpperCase()}`;
    }
    case "timeout":
      return `${name}叫暂停`;
    case "resume":
      return `${name}恢复比赛`;
    default:
      return `${name}操作`;
  }
}
