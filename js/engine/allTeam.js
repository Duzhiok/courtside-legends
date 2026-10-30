/**
 * 总决赛后最佳阵容（PG → C）：按位置各选一人。
 *
 * IMPORTANT: this module always keys off a player's stable `pos` (their real, established
 * position), never `playPos`. `playPos` is the volatile tactical slot a player happens to be
 * plugged into for one specific lineup/game (can legitimately be anything when a roster is
 * short-handed -- injuries, an odd CPU auto-fill, a small-ball experiment), and it changes game
 * to game. If this module ever prefers `playPos` over `pos` again, you get exactly the bug this
 * comment is guarding against: Barkley/Malone-type power forwards permanently "remembered" as a
 * PG/SF because of one weird lineup from three rounds ago, baked into the All-Team selection.
 */
import { overall } from "../data/players.js";

export const ALL_TEAM_POS = ["PG", "SG", "SF", "PF", "C"];

export function normAllTeamPos(pos) {
  const p = String(pos || "SF").toUpperCase();
  if (ALL_TEAM_POS.includes(p)) return p;
  if (p === "G" || p === "PG-SG") return "PG";
  if (p === "F" || p === "SF-PF") return "SF";
  if (p === "F-C" || p === "PF-C") return "PF";
  return "SF";
}

/** 把一场 box 累进评选板（按球员 id）。 */
export function accumulateGameToAllTeamBoard(board, snap, homeMeta, awayMeta) {
  if (!board || !snap) return board;
  for (const side of ["home", "away"]) {
    const meta = side === "home" ? homeMeta : awayMeta;
    const team = snap[side];
    const won =
      (side === "home" && snap.score.home > snap.score.away) ||
      (side === "away" && snap.score.away > snap.score.home);
    for (const p of team?.roster || []) {
      const s = p.stats || {};
      const id = p.id;
      if (!id) continue;
      if (!board[id]) {
        board[id] = {
          id,
          name: p.name,
          bref: p.bref,
          nbaId: p.nbaId,
          photo: p.photo,
          photoCareerDefault: p.photoCareerDefault,
          season: p.season,
          pos: normAllTeamPos(p.pos),
          teamName: meta?.name || team?.name || "",
          teamId: meta?.bracketId || meta?.id || "",
          ovr: overall(p),
          gp: 0,
          pts: 0,
          reb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
          min: 0,
          wins: 0,
          gradeSum: 0,
        };
      }
      const row = board[id];
      row.pos = normAllTeamPos(p.pos || row.pos);
      row.teamName = meta?.name || row.teamName;
      row.ovr = Math.max(row.ovr || 0, overall(p));
      row.gp += 1;
      row.pts += s.pts || 0;
      row.reb += s.reb || 0;
      row.ast += s.ast || 0;
      row.stl += s.stl || 0;
      row.blk += s.blk || 0;
      row.min += s.min || 0;
      if (won) row.wins += 1;
      if (typeof p.gradeScore === "number") row.gradeSum += p.gradeScore;
    }
  }
  return board;
}

function entryScore(row) {
  if (!row) return -1;
  const gp = Math.max(1, row.gp || 1);
  const ppg = (row.pts || 0) / gp;
  const rpg = (row.reb || 0) / gp;
  const apg = (row.ast || 0) / gp;
  const spg = (row.stl || 0) / gp;
  const bpg = (row.blk || 0) / gp;
  const mpg = (row.min || 0) / gp;
  const grade = (row.gradeSum || 0) / gp;
  const ovr = row.ovr || 70;
  // 有出场数据时以场均表现为主；无数据则退回 OVR
  if ((row.gp || 0) <= 0) return ovr * 1.1;
  return (
    ovr * 0.55 +
    ppg * 1.15 +
    rpg * 0.85 +
    apg * 1.2 +
    spg * 2.4 +
    bpg * 2.2 +
    Math.min(36, mpg) * 0.15 +
    (row.wins || 0) * 2.5 +
    grade * 0.08
  );
}

/**
 * 从评选板 / 候选列选出 PG→C 各一人。
 * @param {object[]|Record<string,object>} pool board values or candidate list
 * @returns {{ slot: string, player: object }[]}
 */
export function selectAllTeamByPos(pool) {
  const list = Array.isArray(pool) ? pool : Object.values(pool || {});
  const scored = list
    .map((row) => ({
      ...row,
      pos: normAllTeamPos(row.pos),
      _score: entryScore(row),
    }))
    .filter((r) => r.id && r.name)
    .sort((a, b) => b._score - a._score);

  const used = new Set();
  const bySlot = {};
  const posDist = (pos, slot) => Math.abs(ALL_TEAM_POS.indexOf(pos) - ALL_TEAM_POS.indexOf(slot));

  // Three separate passes across ALL slots, not one slot-at-a-time OR-chain: a slot with no
  // exact-fit candidates left must never "steal" a player who is a perfect fit for a slot that
  // just hasn't been processed yet. e.g. five classic bigs with zero real guards -- the lone SF
  // among them must land at SF, not get swept into PG just because PG happens to come first in
  // ALL_TEAM_POS and runs its fallback before SF's own turn.
  // Pass 1: exact position match, best score wins each slot.
  for (const slot of ALL_TEAM_POS) {
    const pick = scored.find((r) => !used.has(r.id) && r.pos === slot);
    if (pick) {
      bySlot[slot] = pick;
      used.add(pick.id);
    }
  }
  // Pass 2: adjacent position (PG<->SG, SG<->SF, SF<->PF, PF<->C), only for slots still open.
  for (const slot of ALL_TEAM_POS) {
    if (bySlot[slot]) continue;
    const pick = scored.find((r) => !used.has(r.id) && posDist(r.pos, slot) === 1);
    if (pick) {
      bySlot[slot] = pick;
      used.add(pick.id);
    }
  }
  // Pass 3: true last resort (e.g. a run with almost no real point guards). Prefer whoever's
  // natural position is physically closest to the slot over whoever merely scored highest
  // overall -- a center is a worse PG stand-in than a shooting guard is, gaudy box score or not.
  for (const slot of ALL_TEAM_POS) {
    if (bySlot[slot]) continue;
    const pick = [...scored]
      .filter((r) => !used.has(r.id))
      .sort((a, b) => posDist(a.pos, slot) - posDist(b.pos, slot) || b._score - a._score)[0];
    if (pick) {
      bySlot[slot] = pick;
      used.add(pick.id);
    }
  }

  const out = [];
  for (const slot of ALL_TEAM_POS) {
    const pick = bySlot[slot];
    if (!pick) continue;
    out.push({
      slot,
      id: pick.id,
      name: pick.name,
      pos: slot,
      naturalPos: pick.pos,
      teamName: pick.teamName || "",
      teamId: pick.teamId || "",
      ovr: pick.ovr,
      gp: pick.gp || 0,
      pts: pick.pts || 0,
      reb: pick.reb || 0,
      ast: pick.ast || 0,
      ppg: pick.gp ? +(pick.pts / pick.gp).toFixed(1) : 0,
      rpg: pick.gp ? +(pick.reb / pick.gp).toFixed(1) : 0,
      apg: pick.gp ? +(pick.ast / pick.gp).toFixed(1) : 0,
      score: +pick._score.toFixed(1),
      bref: pick.bref,
      nbaId: pick.nbaId,
      photo: pick.photo,
      photoCareerDefault: pick.photoCareerDefault,
      season: pick.season,
    });
  }
  return out;
}

/**
 * R89 Finals MVP: the champion team's best performer on the same series board
 * the All-Team selection uses (per-game stats + wins + OVR + grade). Entries that
 * already carry a score (e.g. finalsAllTeam picks) reuse it; raw board rows are
 * scored with entryScore. Returns null when the champion has no board entry.
 */
export function selectFinalsMvp(pool, championTeamId) {
  const list = (Array.isArray(pool) ? pool : Object.values(pool || {}))
    .filter((r) => r && r.id && r.name && (!championTeamId || r.teamId === championTeamId));
  if (!list.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const row of list) {
    const score = typeof row.score === "number" ? row.score : entryScore(row);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  if (!best) return null;
  return {
    id: best.id,
    name: best.name,
    pos: best.pos,
    teamName: best.teamName || "",
    teamId: best.teamId || "",
    ovr: best.ovr,
    gp: best.gp || 0,
    pts: best.pts || 0,
    reb: best.reb || 0,
    ast: best.ast || 0,
    ppg: best.gp ? +(best.pts / best.gp).toFixed(1) : 0,
    rpg: best.gp ? +(best.reb / best.gp).toFixed(1) : 0,
    apg: best.gp ? +(best.ast / best.gp).toFixed(1) : 0,
    score: +bestScore.toFixed(1),
    bref: best.bref,
    nbaId: best.nbaId,
    photo: best.photo,
    photoCareerDefault: best.photoCareerDefault,
    season: best.season,
  };
}

/** 用两支决赛球队阵容（无累计数据时）按 OVR 评一阵。 */
export function allTeamFromRosters(teams = []) {
  const board = {};
  for (const t of teams) {
    if (!t?.players?.length) continue;
    for (const p of t.players) {
      board[p.id] = {
        id: p.id,
        name: p.name,
        bref: p.bref,
        nbaId: p.nbaId,
        photo: p.photo,
        photoCareerDefault: p.photoCareerDefault,
        season: p.season,
        pos: normAllTeamPos(p.pos),
        teamName: t.name || "",
        teamId: t.bracketId || t.id || "",
        ovr: overall(p),
        gp: 0,
        pts: 0,
        reb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        min: 0,
        wins: 0,
        gradeSum: 0,
      };
    }
  }
  return selectAllTeamByPos(board);
}

/** 从赛季 playerSeason 行里，按决赛两队筛最佳阵容。 */
export function allTeamFromSeasonRows(rows, teamIds) {
  const idSet = new Set(teamIds || []);
  const pool = (rows || [])
    .filter((r) => !idSet.size || idSet.has(r.teamId))
    .map((r) => ({
      id: r.playerId,
      name: r.name,
      pos: normAllTeamPos(r.pos),
      teamName: r.teamName || "",
      teamId: r.teamId,
      ovr: r.ovr || 70,
      gp: r.stats?.gp || 0,
      pts: r.stats?.pts || 0,
      reb: r.stats?.reb || 0,
      ast: r.stats?.ast || 0,
      stl: r.stats?.stl || 0,
      blk: r.stats?.blk || 0,
      min: r.stats?.min || 0,
      wins: 0,
      gradeSum: 0,
      bref: r.bref,
      season: r.season,
    }));
  return selectAllTeamByPos(pool);
}
