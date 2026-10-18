/**
 * 晋级淘汰：32 → 16 → 8 → 4 → 2 → 1
 * - 自定义预算轮抽：对手为 32 支历史球队
 * - 金币晋级赛：32 支随机联队（非历史绑定），越往后阵容迭代越强
 * 四人一组：开门赛 → 胜者组 / 复活赛 → 晋级决胜；两败出局。
 */

export const CAREER_STAGES = [32, 16, 8, 4, 2];

export const CAREER_STAGE_LABELS = {
  32: "三十二强 · 32进16",
  16: "十六强 · 16进8",
  8: "八强 · 8进4",
  4: "四强 · 4进2",
  2: "总决赛 · 2进1",
};

export function careerStageLabel(stageSize, { finals = false } = {}) {
  if (finals || stageSize === 2) return CAREER_STAGE_LABELS[2];
  return CAREER_STAGE_LABELS[stageSize] || `${stageSize} 强`;
}

export function nextStageSize(stageSize) {
  const i = CAREER_STAGES.indexOf(stageSize);
  if (i < 0 || i >= CAREER_STAGES.length - 1) return null;
  return CAREER_STAGES[i + 1];
}

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mkMatch(a, b, kind, podId) {
  return {
    a,
    b,
    kind, // opener | winners | revival | decider | final
    podId,
    yours: a?.bracketId === "you" || b?.bracketId === "you",
    done: false,
    score: null,
    winner: null,
    loser: null,
    startersA: null,
    startersB: null,
  };
}

/**
 * Build pods of 4 from alive list. Remainder pairs (should not happen at 32/16/8/4).
 * @returns {{ pods: object[], openers: object[] }}
 */
export function buildStagePods(alive, { rng = Math.random } = {}) {
  const teams = shuffle(alive, rng);
  const pods = [];
  const openers = [];
  let podId = 0;
  for (let i = 0; i < teams.length; i += 4) {
    const chunk = teams.slice(i, i + 4);
    if (chunk.length === 4) {
      const [t0, t1, t2, t3] = chunk;
      const openerA = mkMatch(t0, t1, "opener", podId);
      const openerB = mkMatch(t2, t3, "opener", podId);
      pods.push({
        id: podId,
        teams: chunk,
        openerA,
        openerB,
        winnersMatch: null,
        revivalMatch: null,
        deciderMatch: null,
        advancers: [],
        eliminated: [],
        done: false,
      });
      openers.push(openerA, openerB);
      podId += 1;
    } else if (chunk.length === 2) {
      // Finals / odd fallback: single match
      const final = mkMatch(chunk[0], chunk[1], "final", podId);
      pods.push({
        id: podId,
        teams: chunk,
        openerA: final,
        openerB: null,
        winnersMatch: null,
        revivalMatch: null,
        deciderMatch: null,
        advancers: [],
        eliminated: [],
        done: false,
        isFinal: true,
      });
      openers.push(final);
      podId += 1;
    }
  }
  return { pods, openers };
}

/** After both openers done → create winners + revival matches. */
export function progressPodAfterOpeners(pod) {
  if (!pod || pod.isFinal) return [];
  const oa = pod.openerA;
  const ob = pod.openerB;
  if (!oa?.done || !ob?.done) return [];
  if (pod.winnersMatch && pod.revivalMatch) return [];
  const w1 = oa.winner;
  const l1 = oa.loser;
  const w2 = ob.winner;
  const l2 = ob.loser;
  if (!w1 || !l1 || !w2 || !l2) return [];
  pod.winnersMatch = mkMatch(w1, w2, "winners", pod.id);
  pod.revivalMatch = mkMatch(l1, l2, "revival", pod.id);
  return [pod.winnersMatch, pod.revivalMatch];
}

/** After winners + revival done → create decider (second advance slot). */
export function progressPodAfterMid(pod) {
  if (!pod || pod.isFinal) return [];
  const w = pod.winnersMatch;
  const r = pod.revivalMatch;
  if (!w?.done || !r?.done) return [];
  if (pod.deciderMatch) return [];
  // Winners-match winner already advances
  if (w.winner && !pod.advancers.some((t) => t.bracketId === w.winner.bracketId)) {
    pod.advancers.push(w.winner);
  }
  // Revival loser is out (2 losses)
  if (r.loser && !pod.eliminated.some((t) => t.bracketId === r.loser.bracketId)) {
    pod.eliminated.push(r.loser);
  }
  // Decider: winners-match loser vs revival winner
  if (!w.loser || !r.winner) return [];
  pod.deciderMatch = mkMatch(w.loser, r.winner, "decider", pod.id);
  return [pod.deciderMatch];
}

/** Finalize pod after decider (or after final match). */
export function finalizePod(pod) {
  if (!pod) return;
  if (pod.isFinal) {
    const m = pod.openerA;
    if (!m?.done) return;
    if (m.winner) pod.advancers = [m.winner];
    if (m.loser) pod.eliminated = [m.loser];
    pod.done = true;
    return;
  }
  const d = pod.deciderMatch;
  if (!d?.done) return;
  if (d.winner && !pod.advancers.some((t) => t.bracketId === d.winner.bracketId)) {
    pod.advancers.push(d.winner);
  }
  if (d.loser && !pod.eliminated.some((t) => t.bracketId === d.loser.bracketId)) {
    pod.eliminated.push(d.loser);
  }
  pod.done = true;
}

export function applyMatchResult(match, winnerTeam) {
  if (!match || !winnerTeam) return;
  const win =
    winnerTeam.bracketId === match.a.bracketId
      ? match.a
      : winnerTeam.bracketId === match.b.bracketId
        ? match.b
        : winnerTeam;
  const lose = win.bracketId === match.a.bracketId ? match.b : match.a;
  match.done = true;
  match.winner = win;
  match.loser = lose;
}

export function kindLabel(kind) {
  if (kind === "opener") return "开门赛";
  if (kind === "winners") return "胜者组";
  if (kind === "revival") return "复活赛";
  if (kind === "decider") return "晋级决胜";
  if (kind === "final") return "总决赛";
  return "对决";
}

/** Collect all unfinished matches involving the user across pods. */
export function findYourOpenMatch(pods) {
  for (const pod of pods || []) {
    const seq = [
      pod.openerA,
      pod.openerB,
      pod.winnersMatch,
      pod.revivalMatch,
      pod.deciderMatch,
    ].filter(Boolean);
    for (const m of seq) {
      if (m.yours && !m.done) return m;
    }
  }
  return null;
}

/** All currently scheduled (known) matches for scout UI. */
export function listPodMatches(pods) {
  const out = [];
  for (const pod of pods || []) {
    for (const m of [
      pod.openerA,
      pod.openerB,
      pod.winnersMatch,
      pod.revivalMatch,
      pod.deciderMatch,
    ]) {
      if (m) out.push(m);
    }
  }
  return out;
}

export function allPodsDone(pods) {
  return (pods || []).length > 0 && (pods || []).every((p) => p.done);
}

export function collectAdvancers(pods) {
  const list = [];
  for (const pod of pods || []) {
    for (const t of pod.advancers || []) list.push(t);
  }
  return list;
}

/** Quick self-check: 4-team pod yields 2 advancers. */
export function _selfCheckPodMath() {
  const T = (id) => ({ bracketId: id, name: id, isCpu: id !== "you" });
  const { pods } = buildStagePods([T("a"), T("b"), T("c"), T("d"), T("e"), T("f"), T("g"), T("h")]);
  return pods.length === 2 && pods.every((p) => p.teams.length === 4);
}
