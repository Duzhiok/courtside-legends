/**
 * Opponent scouting (Team Intelligence v4). Pure and deterministic: reads the opponent's real cards + coach,
 * invents nothing. Every threat names the attributes it was read from (`from`) so the UI can show its source.
 * Limits, stated honestly: card attributes describe a player's tendencies, not what he will do tonight, and the
 * opponent's on-court rotation is not exposed before the game -- so "starters" are his saved five or his top five by overall.
 */
import { coachTactics } from "../data/coaches.js";
import { ovr } from "./playerRoleFit.js";

const a = (p, k, d = 50) => (Number.isFinite(p?.[k]) ? p[k] : d);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const clamp = (x) => Math.max(0, Math.min(99, Math.round(x)));

/** 0-99 scores for what ONE player is dangerous at. */
export function playerThreat(p) {
  const big = ["C", "PF"].includes(p.playPos || p.pos);
  const interior = clamp(0.55 * a(p, "paint") + 0.25 * a(p, "strength") + 0.2 * a(p, "scoring") + (big ? 0 : -8));
  const perimeter = clamp(0.4 * Math.max(a(p, "three"), a(p, "mid")) + 0.25 * a(p, "handle") + 0.2 * a(p, "scoring") + 0.15 * a(p, "offDribble", a(p, "handle")));
  const boards = clamp(a(p, "rebound"));
  return { interior, perimeter, boards, offense: Math.max(interior, perimeter) };
}

export const threatTier = (s) => (s >= 88 ? "extreme" : s >= 78 ? "high" : s >= 65 ? "medium" : "low");

/**
 * @param {{players: object[], starterIds?: string[], coach?: object, name?: string}} team
 * @returns {null|{name, starters, threats, profile, weakDefenders, bench, identity}}
 */
export function scoutOpponent(team) {
  const all = (team?.players || []).filter((p) => p && !(p.injuredGames > 0));
  if (all.length < 5) return null;
  const byOvr = [...all].sort((x, y) => ovr(y) - ovr(x));
  const saved = (team.starterIds || []).map((id) => all.find((p) => p.id === id)).filter(Boolean);
  const starters = saved.length >= 5 ? saved.slice(0, 5) : byOvr.slice(0, 5);
  const bench = byOvr.filter((p) => !starters.includes(p));
  const core = byOvr.slice(0, 8); // the people who really play

  const threats = core
    .map((p) => ({ p, t: playerThreat(p) }))
    .sort((x, y) => 0.5 * ovr(y.p) + 0.5 * y.t.offense - (0.5 * ovr(x.p) + 0.5 * x.t.offense))
    .slice(0, 2)
    .map(({ p, t }) => {
      const kind = t.interior >= t.perimeter ? "interior" : "perimeter";
      return {
        id: p.id, name: p.name, pos: p.playPos || p.pos, ovr: ovr(p), kind, level: threatTier(t[kind]), scores: t,
        athleticism: clamp((a(p, "speed") + a(p, "stamina")) / 2), perimDef: a(p, "perimDef", a(p, "defense")),
        from: kind === "interior" ? `paint ${a(p, "paint")} · strength ${a(p, "strength")} · scoring ${a(p, "scoring")}` : `three ${a(p, "three")} · handle ${a(p, "handle")} · scoring ${a(p, "scoring")}`,
      };
    });

  const top = (f, n = 1) => mean([...core.map(f)].sort((x, y) => y - x).slice(0, n));
  const profile = {
    interiorThreat: clamp(top((p) => playerThreat(p).interior)),
    perimeterThreat: clamp(top((p) => playerThreat(p).perimeter)),
    reboundThreat: clamp(top((p) => a(p, "rebound"), 2)),
    rimProtection: clamp(top((p) => a(p, "interiorDef", a(p, "defense")))),
    perimeterDefense: clamp(mean(starters.map((p) => a(p, "perimDef", a(p, "defense"))))),
    shooters: starters.filter((p) => a(p, "catchShoot", a(p, "three")) >= 68).length,
    stamina: clamp(mean(starters.map((p) => a(p, "stamina")))),
  };
  const weakDefenders = [...starters]
    .map((p) => ({ id: p.id, name: p.name, pos: p.playPos || p.pos, perimDef: a(p, "perimDef", a(p, "defense")), interiorDef: a(p, "interiorDef", a(p, "defense")) }))
    .sort((x, y) => x.perimDef - y.perimDef).slice(0, 2).filter((d) => d.perimDef < 65);
  const tac = team.coach ? coachTactics(team.coach)[0] : null;
  return {
    name: team.name || "?",
    starters: starters.map((p) => p.id),
    threats,
    profile,
    weakDefenders,
    bench: { depth: clamp(mean(bench.slice(0, 4).map(ovr))), leaderId: [...bench].sort((x, y) => playerThreat(y).offense - playerThreat(x).offense)[0]?.id || null },
    identity: { tacticId: tac?.id || "balanced", fiveOut: profile.shooters >= 4 },
    limits: "card tendencies, not tonight's rotation",
  };
}
