/**
 * Custom 3v3 Half-Court (MVP) — a rules layer on top of the real GameSim, not a second engine.
 *
 * Every possession is played by GameSim itself (`sim.step()` with 3-man teams): ball handler, passes,
 * shot choice, openness, make probability, blocks, steals, turnovers, fouls, rebounds, skills,
 * chemistry and fatigue are all GameSim's. This module only:
 * - pins GameSim's period clock (quarter 1, full clock) so its 5v5 end-of-quarter / late-game
 *   scripts never fire — a half-court game has no quarters;
 * - re-scores each possession from the box-score deltas, the same "read it back from the stats"
 *   pattern GameSim's own clutch decision uses: a make inside the arc = 1, beyond the arc = 2;
 *   free throws follow the half-court allowance (1 for a foul inside the arc / and-one /
 *   technical / loose ball, 2 for a foul on an arc shot) — the extra free-throw dice GameSim rolls
 *   for its 2/3-shot trips are ignored, they add nothing to the score;
 * - bench (B64): a team may carry ONE optional 4th player (FIBA 3x3 rosters are four). Three start; between
 *   possessions each side's auto-coach spends GameSim's own `cpuAutoSub` (its fatigue thresholds, its
 *   `substitute`, its bench rest) — no new stamina system. A plain three-man team is untouched;
 * - ends the game at 21 with a 2-point lead (safety valve: after `maxPossessions` the leader wins);
 * - maps GameSim's 24-second possession time onto the 12-second shot clock (tempo still matters,
 *   a possession can never run past 12) — there is no separate violation roll, that would be a
 *   second probability model;
 * - clear-the-ball: after a defensive rebound, steal, turnover or made basket the new offense must
 *   take it back beyond the arc (logged + `clearSec` on the game clock, no fast break — GameSim has
 *   no transition play, so every change of possession already starts a half-court set); after an
 *   offensive rebound the offense plays on immediately (GameSim's putback logic) with a fresh clock.
 *
 * Deterministic: same teams + same seed -> the same game (GameSim's injected rng, Math.random is
 * never touched). No save, no account rewards, no shared state: the result is a plain object.
 */
import { GameSim } from "../engine/sim.js";
import { teamChemistry, lineupFit } from "../engine/chemistry.js";
import { hashSeed, seededStream } from "../core/seededRandom.js";
import { clonePlayer } from "../data/players.js";
import { buildSandboxTeam } from "./sandboxDuel.js";
import { TL } from "../i18n.js";

export const HALF_COURT_RULES = Object.freeze({
  teamSize: 3,
  target: 21,
  winBy: 2,
  insidePts: 1,
  arcPts: 2,
  shotClock: 12,
  /** Seconds the new offense spends taking the ball back beyond the arc. */
  clearSec: 2,
  /** Safety valve only (a normal game is ~50–90 possessions): past this the leader wins. */
  maxPossessions: 300,
  /** One timeout per team (FIBA 3x3); the auto-coach calls it once its three average this fatigue. */
  timeoutsPerTeam: 1,
  timeoutFatigue: 70,
  /** Optional 4th player (B64). Three play, the 4th waits on the bench; a three-man team is still legal. */
  benchMax: 1,
  /** Possessions a side must wait between two auto-substitutions (no flip-flopping). */
  subCooldown: 3,
});

/** GameSim's regulation quarter length — pinned before every possession (sim.js QUARTER_SEC). */
const PINNED_CLOCK = 12 * 60;
/** Both sides' picks may share a card (Jordan vs Jordan): their match copies need distinct ids. */
const HALF_COURT_SLOT_OFFSET = Object.freeze({ home: 0, away: 100 });

const STAT_KEYS = ["fga", "fgm", "tpa", "tpm", "reb", "oreb", "ast", "stl", "blk", "tov", "pf"];

/**
 * B65: 3v3 arc-tendency bias. Real 3x3 takes ~35–40% of its shots from beyond
 * the arc; the 5v5 chooseShot underneath sits near 25% on real rosters because
 * it prices the arc by 5v5 spacing. The bias lifts threeTend on the MATCH
 * copies only — selection, not make (`three` is untouched), so the same card
 * keeps its 5v5 behaviour everywhere else and its roster card is never
 * mutated. It is applied in exactly one place, playHalfCourtGame, so the
 * picker, the measurement script and the view all play the same biased game;
 * buildHalfCourtTeam stays a plain team builder. Calibrated with
 * scripts/measure/b65-3v3.mjs (see BACKLOG B65): flat +30 → pooled 30.3%,
 * +50 → 31.9%, +70 → 32.6% — the tendency-only curve saturates near ~33%
 * because chooseShot's threeSkill < 40 gate (×0.05) and the post style
 * (×0.04) cap the big-heavy matchup no matter the tendency. +50 takes
 * nearly all of that headroom while keeping cards distinct (a tend-30 card
 * lands at 80, not 100); reaching the ~35% pooled target would need a
 * design decision on those gates, not a bigger increment.
 */
export const HALF_COURT_ARC_TEND_BIAS = 50;

/** One match copy with the 3v3 arc bias applied (the input is untouched). */
export function withHalfCourtArcBias(player) {
  const copy = clonePlayer(player);
  // chooseShot's own fallback when threeTend is missing, so a hand-built card
  // without one gets the same bias as a real card with the same `three`.
  const base = Number.isFinite(copy.threeTend)
    ? copy.threeTend
    : Math.max(1, Math.min(80, Math.round((copy.three || 40) * 0.55)));
  copy.threeTend = Math.min(100, base + HALF_COURT_ARC_TEND_BIAS);
  return copy;
}

/** Match-ready 3-man team from picked cards (reuses the sandbox copy + era-parity path). */
export function buildHalfCourtTeam(name, cards, { side = "home", eraParity = false, pool = [], rules = HALF_COURT_RULES } = {}) {
  const size = rules.teamSize;
  return buildSandboxTeam(name, cards, {
    eraParity,
    pool,
    slotOffset: HALF_COURT_SLOT_OFFSET[side] ?? 0,
    min: size,
    max: size + (rules.benchMax || 0),
  });
}

/**
 * GameSim seats the best five of whoever it is given, so a 4-card team would put all four on court. Move the
 * players past the first `teamSize` (the picks' order is the starting order) to the bench, with the same chemistry /
 * fit refresh GameSim's own `substitute` does.
 */
function seatBench(sim, side, benchIds) {
  const t = sim[side];
  const sitting = t.onCourt.filter((p) => benchIds.includes(p.id));
  if (!sitting.length) return;
  t.onCourt = t.onCourt.filter((p) => !benchIds.includes(p.id));
  t.bench = [...t.bench, ...sitting];
  for (const p of sitting) p.benchSinceElapsed = sim.elapsedSec || 0;
  t.chem = teamChemistry(t.onCourt, sim.ballOpts(t));
  t.fit = lineupFit(t.onCourt, t.coach, t.tactic, sim.ballOpts(t));
}

/**
 * Between possessions (a dead ball): each side's auto-coach asks GameSim's `cpuAutoSub` whether to rest its most
 * tired player. Same call for both sides, so neither is favoured. Returns the swaps for the play log.
 */
function autoSubstitutions(sim, lastSubAt, possessionNo, rules) {
  const swaps = [];
  for (const side of [sim.possession, sim.possession === "home" ? "away" : "home"]) {
    const t = sim[side];
    if (!t.bench.length || possessionNo - (lastSubAt[side] ?? -Infinity) < rules.subCooldown) continue;
    const before = new Set(t.onCourt.map((p) => p.id));
    sim.cpuAutoSub(t, { aggressive: true });
    const out = [...before].find((id) => !t.onCourt.some((p) => p.id === id));
    const inn = t.onCourt.find((p) => !before.has(p.id));
    if (out && inn) {
      lastSubAt[side] = possessionNo;
      swaps.push({ side, outId: out, inId: inn.id });
    }
  }
  return swaps;
}

function statsOf(sim) {
  const out = new Map();
  for (const side of ["home", "away"]) {
    for (const p of sim[side].roster) {
      const row = { side };
      for (const k of STAT_KEYS) row[k] = Number(p.stats?.[k]) || 0;
      out.set(p.id, row);
    }
  }
  return out;
}

function emptyLine(p, side) {
  return {
    id: p.id,
    name: p.name,
    pos: p.playPos || p.pos || "",
    season: p.season ?? null,
    side,
    pts: 0,
    fgm1: 0, fga1: 0,
    fgm2: 0, fga2: 0,
    ftm: 0, fta: 0,
    reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fatigue: 0,
  };
}

/**
 * Free-throw trips in one possession's event list: consecutive `meta.ft` events by one shooter.
 * Half-court allowance: a 3-shot trip (foul on an arc shot) counts 2, anything else counts 1.
 */
export function countedFreeThrows(events) {
  const trips = [];
  let cur = null;
  for (const e of events) {
    const ft = e?.meta?.ft;
    if (!ft) {
      cur = null;
      continue;
    }
    if (!cur || cur.shooterId !== ft.shooterId) {
      cur = { shooterId: ft.shooterId, shots: [] };
      trips.push(cur);
    }
    cur.shots.push(!!ft.made);
  }
  return trips.map((t) => {
    const allowed = t.shots.length >= 3 ? 2 : 1;
    const counted = t.shots.slice(0, allowed);
    return { shooterId: t.shooterId, attempts: counted.length, made: counted.filter(Boolean).length, rolled: t.shots.length };
  });
}


/**
 * Deterministic auto-coach timeout (no dice): the first side whose three average
 * `timeoutFatigue` spends its one timeout through GameSim.callTimeout — GameSim's dead-ball
 * recovery for both sides + its momentum break, without pausing. Returns the side or null.
 */
function maybeTimeout(sim, left, rules) {
  for (const side of [sim.possession, sim.possession === "home" ? "away" : "home"]) {
    if (!(left[side] > 0)) continue;
    const court = sim[side].onCourt || [];
    const avgFat = court.reduce((n, p) => n + (Number(p.fatigue) || 0), 0) / Math.max(1, court.length);
    if (avgFat < rules.timeoutFatigue) continue;
    left[side] -= 1;
    sim.timeouts[side] = 1;
    try {
      sim.callTimeout(side, { pause: false });
    } finally {
      sim.timeouts[side] = 0;
    }
    return side;
  }
  return null;
}

/**
 * One possession's GameSim events -> short half-court play lines (own text: GameSim's carries 5v5 scores).
 * Exported for tests (like countedFreeThrows): the foul+turnover shapes only occur on rare dice.
 */
export function playLines(events, nameOf, lang) {
  const lines = [];
  for (const e of events) {
    const m = e?.meta;
    if (!m) continue;
    if (m.shot) {
      const arc = m.shot.pts === 3;
      const who = nameOf(m.shot.shooterId);
      lines.push(
        m.shot.made
          ? { kind: "make", playerId: m.shot.shooterId, zone: arc ? "arc" : "inside", text: arc ? TL(lang, `${who} 弧外命中 +2`, `${who} hits from beyond the arc +2`) : TL(lang, `${who} 弧内得手 +1`, `${who} scores inside +1`) }
          : { kind: "miss", playerId: m.shot.shooterId, zone: arc ? "arc" : "inside", text: arc ? TL(lang, `${who} 弧外不中`, `${who} misses from deep`) : TL(lang, `${who} 弧内不中`, `${who} misses inside`) }
      );
    } else if (m.block) {
      lines.push({ kind: "block", playerId: m.actorId, zone: "inside", text: TL(lang, `${nameOf(m.actorId)} 盖帽 ${m.block.blockedName}`, `${nameOf(m.actorId)} blocks ${m.block.blockedName}`) });
    } else if (m.turnover) {
      const t = m.turnover;
      const by = t.forcedById && (t.kind === "steal" || t.kind === "charge") ? nameOf(t.forcedById) : null;
      lines.push({
        kind: "turnover",
        playerId: t.actorId,
        text: t.kind === "steal" && by
          ? TL(lang, `${by} 抢断 ${nameOf(t.actorId)}`, `${by} steals it from ${nameOf(t.actorId)}`)
          : t.kind === "charge" && by
            ? TL(lang, `${by} 造进攻犯规`, `${by} draws the charge`)
            : TL(lang, `${nameOf(t.actorId)} 失误`, `${nameOf(t.actorId)} turnover`),
      });
    } else if (m.reb) {
      const who = nameOf(m.reb.rebounderId);
      lines.push(
        m.reb.offensive
          ? { kind: "oreb", playerId: m.reb.rebounderId, text: TL(lang, `${who} 进攻篮板，直接二次进攻`, `${who} offensive board — straight back up`) }
          : { kind: "dreb", playerId: m.reb.rebounderId, text: TL(lang, `${who} 防守篮板`, `${who} defensive board`) }
      );
    }
    // A foul can ride along with another outcome (charge: sim.js charge branch). A loose-ball
    // foul is a foul only. Either way the foul is its own line, never swallowed above.
    if (m.foul) {
      lines.push({ kind: "foul", playerId: m.foul.foulerId, text: TL(lang, `${nameOf(m.foul.foulerId)} 犯规`, `Foul on ${nameOf(m.foul.foulerId)}`) });
    }
  }
  return lines;
}

/**
 * Play one whole 3v3 half-court game. `home` / `away`: `{ name, players: [3 cards] }` (use
 * buildHalfCourtTeam). Returns a plain result object; nothing is stored anywhere.
 */
export function playHalfCourtGame({ home, away, seed = "3v3", lang = "zh", rules = HALF_COURT_RULES } = {}) {
  for (const [label, team] of [["home", home], ["away", away]]) {
    const n = team?.players?.length;
    if (!Array.isArray(team?.players) || n < rules.teamSize || n > rules.teamSize + (rules.benchMax || 0)) {
      throw new Error(`3v3: ${label} team needs ${rules.teamSize} players (plus up to ${rules.benchMax || 0} substitute)`);
    }
  }
  // B65: the arc bias lives here, on fresh match copies — the caller's teams
  // (the view's `teams`, replayed on Retry) are never mutated, and a second
  // game from the same picks gets the same single bias, not a doubled one.
  const matchHome = { ...home, players: home.players.map(withHalfCourtArcBias) };
  const matchAway = { ...away, players: away.players.map(withHalfCourtArcBias) };
  const rng = seededStream(hashSeed(`3v3|${seed}`));
  let events = [];
  const sim = new GameSim({
    home: matchHome,
    away: matchAway,
    youSide: "home",
    injuries: false,
    speed: 3,
    lang,
    rng,
    onEvent: (e) => events.push(e),
  });
  // GameSim's own CPU coach never gets a timeout (it would pause between possessions); the
  // half-court allowance is held here and spent through GameSim's callTimeout (its recovery).
  sim.timeouts = { home: 0, away: 0 };
  const benchIds = { home: matchHome.players.slice(rules.teamSize).map((p) => p.id), away: matchAway.players.slice(rules.teamSize).map((p) => p.id) };
  const hasBench = benchIds.home.length > 0 || benchIds.away.length > 0;
  for (const side of ["home", "away"]) seatBench(sim, side, benchIds[side]);
  // GameSim's own CPU rotation would sub only the away side (and draw from the shared rng); with a bench in play
  // the half-court auto-coach below handles BOTH sides alike. Three-man games keep the untouched engine path.
  if (hasBench) sim.maybeCpuManage = () => {};
  const lastSubAt = {};
  const timeoutsLeft = { home: rules.timeoutsPerTeam, away: rules.timeoutsPerTeam };

  const box = new Map();
  for (const side of ["home", "away"]) for (const p of sim[side].roster) box.set(p.id, emptyLine(p, side));
  const nameOf = (id) => box.get(id)?.name || "?";

  const score = { home: 0, away: 0 };
  const plays = [];
  let elapsedSec = 0;
  let possessions = 0;
  let winner = null;
  let capped = false;
  let aborted = false;

  while (!winner) {
    possessions += 1;
    const offense = sim.possession;
    // Half-court game: no quarters, no 5v5 late-game scripts; the score GameSim reads for context
    // (momentum, clutch feel) is the half-court score.
    sim.quarter = 1;
    sim.clock = PINNED_CLOCK;
    sim.score = { ...score };
    sim._lastPossessionSec = 0;
    const before = statsOf(sim);
    events = [];
    let timeoutBy = null;
    const swaps = hasBench ? autoSubstitutions(sim, lastSubAt, possessions, rules) : [];
    try {
      timeoutBy = maybeTimeout(sim, timeoutsLeft, rules);
    } catch (err) {
      // Same class as a failed sim.step() below: the engine state after a mid-possession
      // throw cannot be trusted, so the game ends here with the leader ahead — never an
      // exception reaching the view's click handler.
      console.error("[3v3] callTimeout failed, ending the game early", err);
      aborted = true;
      break;
    }
    // Who is on the floor for this possession (after any substitution; a sub takes the leaver's slot index).
    const onCourt = { home: sim.home.onCourt.map((p) => p.id), away: sim.away.onCourt.map((p) => p.id) };
    try {
      sim.step();
    } catch (err) {
      // 5v5's _loop swallows a failed step and plays on; a synchronous whole-game sim cannot
      // trust the engine state after a mid-possession throw, so the game ends here with the
      // leader ahead — a valid result, never an exception reaching the view's click handler.
      console.error("[3v3] sim.step failed, ending the game early", err);
      aborted = true;
      break;
    }
    const after = statsOf(sim);

    const gained = { home: 0, away: 0 };
    for (const [id, a] of after) {
      const b = before.get(id);
      const line = box.get(id);
      const d = {};
      for (const k of STAT_KEYS) d[k] = a[k] - b[k];
      const in2a = d.fga - d.tpa;
      const in2m = d.fgm - d.tpm;
      line.fga1 += in2a;
      line.fgm1 += in2m;
      line.fga2 += d.tpa;
      line.fgm2 += d.tpm;
      for (const k of ["reb", "oreb", "ast", "stl", "blk", "tov", "pf"]) line[k] += d[k];
      const pts = in2m * rules.insidePts + d.tpm * rules.arcPts;
      line.pts += pts;
      gained[a.side] += pts;
    }
    const fts = countedFreeThrows(events);
    for (const t of fts) {
      const line = box.get(t.shooterId);
      if (!line) continue;
      line.fta += t.attempts;
      line.ftm += t.made;
      line.pts += t.made;
      gained[line.side] += t.made;
    }
    score.home += gained.home;
    score.away += gained.away;

    const sec = Math.max(1, Math.min(rules.shotClock, Math.round((Number(sim._lastPossessionSec) || 0) / 2)));
    elapsedSec += sec;
    const changed = sim.possession !== offense;
    if (changed) elapsedSec += rules.clearSec;
    const lines = playLines(events, nameOf, lang);
    for (const s of swaps) {
      lines.unshift({ kind: "sub", side: s.side, playerId: s.inId, outId: s.outId, text: TL(lang, `${nameOf(s.inId)} 换下 ${nameOf(s.outId)}`, `${nameOf(s.inId)} subs in for ${nameOf(s.outId)}`) });
    }
    if (timeoutBy) {
      const teamName = timeoutBy === "home" ? home.name : away.name;
      lines.unshift({ kind: "timeout", side: timeoutBy, text: TL(lang, `${teamName} 叫暂停，喘口气`, `${teamName} call timeout to catch their breath`) });
    }
    for (const t of fts) {
      lines.push({ kind: "ft", playerId: t.shooterId, text: TL(lang, `${nameOf(t.shooterId)} 罚球 ${t.made}/${t.attempts}`, `${nameOf(t.shooterId)} free throws ${t.made}/${t.attempts}`) });
    }
    plays.push({
      n: possessions,
      offense,
      shotClockUsed: sec,
      onCourt,
      elapsedSec,
      lines,
      clear: changed,
      score: { ...score },
    });

    for (const side of ["home", "away"]) {
      const other = side === "home" ? "away" : "home";
      if (score[side] >= rules.target && score[side] - score[other] >= rules.winBy) winner = side;
    }
    if (!winner && possessions >= rules.maxPossessions && score.home !== score.away) {
      winner = score.home > score.away ? "home" : "away";
      capped = true;
    }
    if (!winner && possessions >= rules.maxPossessions * 2) {
      // Unreachable in practice (needs hundreds of scoreless-tied possessions); never loop forever.
      winner = sim.possession === "home" ? "away" : "home";
      capped = true;
    }
  }

  if (aborted && !winner) {
    // Ended early by an engine failure: the leader takes it; a level score falls back to the
    // same possession-based pick as the max-possessions safety valve.
    winner = score.home !== score.away
      ? (score.home > score.away ? "home" : "away")
      : (sim.possession === "home" ? "away" : "home");
  }

  for (const side of ["home", "away"]) {
    for (const p of sim[side].roster) box.get(p.id).fatigue = Math.round(Number(p.fatigue) || 0);
  }
  const lineup = (side) => sim[side].roster.map((p) => box.get(p.id));
  return {
    seed: String(seed),
    rules,
    names: { home: home.name, away: away.name },
    score,
    winner,
    capped,
    aborted,
    possessions,
    elapsedSec,
    plays,
    box: { home: lineup("home"), away: lineup("away") },
  };
}

/** Team totals for the result page. */
export function halfCourtTeamTotals(lines) {
  const t = { pts: 0, fgm1: 0, fga1: 0, fgm2: 0, fga2: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
  for (const l of lines) for (const k of Object.keys(t)) t[k] += l[k] || 0;
  return t;
}
