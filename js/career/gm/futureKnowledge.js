/**
 * Future Knowledge — the GM's memory of the original timeline (workstream F, user-approved
 * 2026-11-10). Future Knowledge ≠ Guaranteed Future: every clue is original-timeline intel,
 * and its reliability decays ONLY for causally related predictions when the player changes
 * history. There is deliberately no single global accuracy percentage: reliability is a
 * product of per-clue CAUSAL LINKS (a draft pick, a trade, a broken-up dynasty) recorded
 * in the ledger. The global `story.timelineDivergence` number is recorded as a consequence
 * of decisions elsewhere; it is never used here as an accuracy.
 *
 * Reuses the existing systems instead of building a second prophecy:
 * - `root.story.futureKnowledge` (a number) is the SPENDABLE budget of future-knowledge
 *   uses — revealing a clue costs 1 point, exactly like the opening choices in
 *   timeTravelCareer.js spend it.
 * - `root.story.prophecy` (the draft sleeper, settleProphecy) is exposed as a draft-intel
 *   clue through prophecyAsClue() — same sleeper, no second system.
 * - Injury risk reads the real `intangibles.injuryRisk` already attached to cards
 *   (stamina / GP / glass-body evidence), never an invented injury table.
 * - Draft sleepers reuse sleeperCandidates() from draftProphecy.js.
 * Never overwrites roster.json. Pure functions over the knowledge state.
 */
import { sleeperCandidates } from "../draftProphecy.js";

export const CLUE_TYPES = ["potential", "injury", "draft", "trend"];

/** Reliability lost per matched causal link. 0.85 -> 0.60 -> 0.42 across three linked changes. */
export const LINK_DECAY = 0.7;
/** Cost in future-knowledge points to reveal one clue. */
export const CLUE_COST = 1;

export function createKnowledgeState({ knowledge = 0, clues = [], ledger = [], medicalLevel = 0 } = {}) {
  return {
    knowledge,
    clues: clues.map((c) => ({ ...c, revealed: !!c.revealed })),
    ledger: ledger.map((e) => ({ ...e })),
    medicalLevel,
    trendFocus: null,
  };
}

/** Seed the knowledge budget from a real career root (story.futureKnowledge). */
export function knowledgeFromRoot(root) {
  return Math.max(0, Math.floor(root?.story?.futureKnowledge ?? 0));
}

export function createClue({
  id,
  type,
  subjectBref = null,
  subjectTeam = null,
  season,
  summary,
  summaryEn,
  baseReliability = 0.85,
  links = [],
  baseRisk = undefined,
  candidates = undefined,
} = {}) {
  if (!id || !CLUE_TYPES.includes(type) || !Number.isInteger(season)) {
    throw new TypeError("clue needs an id, a valid type and a season");
  }
  return {
    id,
    type,
    subjectBref,
    subjectTeam,
    season,
    summary,
    summaryEn: summaryEn || summary,
    baseReliability,
    links: links.map((l) => ({ kind: l.kind, subject: l.subject })),
    ...(baseRisk !== undefined ? { baseRisk } : {}),
    ...(candidates !== undefined ? { candidates } : {}),
    revealed: false,
  };
}

/** Reveal a clue: spends one future-knowledge point. Unrevealed clues show nothing. */
export function revealClue(state, clueId) {
  const clue = state.clues.find((c) => c.id === clueId);
  if (!clue) throw new RangeError(`unknown clue: ${clueId}`);
  if (clue.revealed) return state;
  if (state.knowledge < CLUE_COST) throw new Error("not enough future knowledge to reveal this clue");
  return {
    ...state,
    knowledge: state.knowledge - CLUE_COST,
    clues: state.clues.map((c) => (c.id === clueId ? { ...c, revealed: true } : c)),
  };
}

/**
 * Record a history-changing decision. `event`: { id, kind, subject, season, label }.
 * kind is one of: draft | trade | signing | dynasty | injury | relocation.
 * subject is a bref (for a player) or a team id. Duplicate ids are ignored.
 */
export function recordCausalEvent(state, event) {
  if (!event?.id || !event?.kind || event?.subject === undefined || !Number.isInteger(event.season)) {
    throw new TypeError("causal event needs id, kind, subject and season");
  }
  if (state.ledger.some((e) => e.id === event.id)) return state;
  return { ...state, ledger: [...state.ledger, { ...event }] };
}

/** A link matches when a ledger event has the same kind AND the same subject. */
export function linkMatched(link, ledger) {
  return (ledger || []).some((e) => e.kind === link.kind && e.subject === link.subject);
}

/**
 * Per-clue reliability: base reliability, multiplied by LINK_DECAY once per MATCHED causal
 * link. Unrelated changes never touch this clue — drafting a guard in the East does not
 * blur a clue about a Western centre's knees.
 */
export function clueReliability(clue, ledger) {
  const matched = (clue.links || []).filter((link) => linkMatched(link, ledger || [])).length;
  return Math.round(clue.baseReliability * Math.pow(LINK_DECAY, matched) * 100) / 100;
}

export function reliabilityBand(reliability) {
  if (reliability >= 0.8) return { id: "clear", zh: "记忆清晰", en: "Clear memory" };
  if (reliability >= 0.55) return { id: "fading", zh: "记忆开始模糊", en: "Memory fading" };
  return { id: "unreliable", zh: "记忆已不可靠", en: "Memory unreliable" };
}

/** The clue as the player sees it: hidden until revealed, reliability as a band, never a percent. */
export function clueView(clue, ledger) {
  if (!clue.revealed) return { id: clue.id, type: clue.type, revealed: false };
  const reliability = clueReliability(clue, ledger);
  return {
    id: clue.id,
    type: clue.type,
    subjectBref: clue.subjectBref,
    subjectTeam: clue.subjectTeam,
    season: clue.season,
    summary: clue.summary,
    summaryEn: clue.summaryEn,
    reliability,
    band: reliabilityBand(reliability),
    revealed: true,
  };
}

/**
 * The existing draft-sleeper prophecy, exposed as a draft-intel clue. Same sleeper, same
 * blurred range the prophecy already shows — this only reframes it for the GM's desk.
 */
export function prophecyAsClue(root) {
  const p = root?.story?.prophecy;
  if (!p) return null;
  return createClue({
    id: `prophecy-${p.bref}`,
    type: "draft",
    subjectBref: p.bref,
    season: p.rookieSeason,
    summary: `你记得 ${p.name} 在原始历史里是个被低估的新秀（记忆中的巅峰区间 ${p.low}–${p.high}），但新的球队环境可能改变他的命运。`,
    summaryEn: `You remember ${p.name} as an underrated rookie in the original timeline (remembered peak ${p.low}–${p.high}); a new team environment may change his fate.`,
    baseReliability: 0.85,
    links: [{ kind: "draft", subject: p.bref }],
  });
}

/**
 * A draft-intel clue for the next draft classes, built on the SAME sleeper board the prophecy
 * uses (sleeperCandidates). It deliberately names ALL THREE candidates with their blurred
 * peak ranges — the board hides which one is the sleeper, and this clue must not leak the
 * answer, or the prophecy pledge would become trivial. The player's decision is the pledge
 * itself (existing flow): pick one name and let his real cards judge it in three seasons.
 * The clue's reliability decays when ANY candidate is drafted or traded, because each of
 * those decisions changes the board.
 */
export function draftBoardClue({ year, seed, players }) {
  const board = sleeperCandidates({ year, seed, players });
  if (!board.length) return null;
  const names = board.map((c) => `${c.name}（${c.rookieSeason} 届，${c.pos}，记忆巅峰 ${c.low}–${c.high}）`).join("、");
  return createClue({
    id: `draft-board-${year}`,
    type: "draft",
    subjectBref: null,
    season: year + 1,
    summary: `你的未来记忆在接下来的选秀里只留下三个模糊的名字：${names}。其中一个会在三年内打出来，另外两个不会——记忆没告诉你是哪个。`,
    summaryEn: `Your future memory leaves only three blurry names in the coming drafts: ${board.map((c) => `${c.name} (${c.rookieSeason}, ${c.pos}, remembered peak ${c.low}–${c.high})`).join(", ")}. One will break out within three seasons; the other two will not — memory does not say which.`,
    baseReliability: 0.85,
    links: board.flatMap((c) => [
      { kind: "draft", subject: c.bref },
      { kind: "trade", subject: c.bref },
    ]),
    candidates: board.map((c) => ({ bref: c.bref, name: c.name, rookieSeason: c.rookieSeason, pos: c.pos, low: c.low, high: c.high })),
  });
}

/**
 * Injury-risk clue from REAL card evidence: the card's intangibles.injuryRisk (0–99,
 * stamina / GP / glass-body evidence) plus the player's real career span. A short real
 * career after a strong start is the original timeline telling you his body gave out.
 * baseRisk is 0–1.
 */
export function injuryClueFor(player, { season, careerSpan = null } = {}) {
  if (!player) return null;
  const risk01 = (player.intangibles?.injuryRisk ?? 50) / 100;
  const shortCareer = careerSpan !== null && careerSpan <= 6;
  return createClue({
    id: `injury-${player.bref}`,
    type: "injury",
    subjectBref: player.bref,
    season,
    summary: `你的未来记忆警告：${player.name} 在原始历史里${shortCareer ? "职业生涯很短" : "有过严重的伤病困扰"}。提前投资医疗团队、控制出场时间可以降低风险，但永远不能保证避免。`,
    summaryEn: `Your future memory warns: ${player.name} ${shortCareer ? "had a short career" : "struggled with serious injuries"} in the original timeline. Investing in medical staff and managing load can reduce the risk, but never guarantee avoiding it.`,
    baseReliability: 0.8,
    links: [
      { kind: "injury", subject: player.bref },
      { kind: "trade", subject: player.bref },
    ],
    baseRisk: Math.round(risk01 * 100) / 100,
  });
}

/**
 * Season injury risk 0–1 for a player: historical base risk, raised by load (minutes burden)
 * and lowered by medical investment (level 0–3). Medical level 3 cuts risk by 36% — it
 * never reaches zero, and a high load can still push a fragile player over the edge.
 */
export function injuryRisk({ baseRisk = 0.3, load = 0.5, medicalLevel = 0 } = {}) {
  const loadFactor = 0.7 + 0.6 * Math.max(0, Math.min(1, load));
  const medicalFactor = 1 - 0.12 * Math.max(0, Math.min(3, medicalLevel));
  return Math.round(Math.max(0.02, Math.min(0.9, baseRisk * loadFactor * medicalFactor)) * 100) / 100;
}

/** Medical staff levels: cost is franchise operating budget ($M per season). */
export const MEDICAL_LEVELS = {
  0: { cost: 0, label: "基础队医", labelEn: "Basic medical staff" },
  1: { cost: 1.5, label: "专职理疗师", labelEn: "Full-time physio" },
  2: { cost: 3.5, label: "运动医学中心", labelEn: "Sports medicine centre" },
  3: { cost: 6, label: "顶级医疗团队", labelEn: "Elite medical team" },
};

export function setMedicalLevel(state, level) {
  if (!Object.prototype.hasOwnProperty.call(MEDICAL_LEVELS, level)) {
    throw new RangeError(`unknown medical level: ${level}`);
  }
  return { ...state, medicalLevel: level };
}

/** League trends a time traveller can invest in early. Each is a focus, not a guarantee. */
export const TRENDS = {
  "three-point-revolution": {
    id: "three-point-revolution",
    zh: "三分革命",
    en: "Three-point revolution",
    note: "外线投射将越来越值钱，现在投资射手培养与三分球探，未来会先人一步。",
    noteEn: "Outside shooting will only get more valuable — invest in shooter development and three-point scouting now to get ahead.",
  },
  "load-management": {
    id: "load-management",
    zh: "负荷管理",
    en: "Load management",
    note: "球星的健康将成为争冠的第一变量，轮换深度与医疗投入会越来越重要。",
    noteEn: "Star health will become the first variable of contention — rotation depth and medical investment will matter more and more.",
  },
  "positionless-basketball": {
    id: "positionless-basketball",
    zh: "位置模糊化",
    en: "Positionless basketball",
    note: "能换防多个位置的球员会越来越吃香，传统位置分工正在被打破。",
    noteEn: "Players who can guard multiple positions will be prized; traditional positional roles are breaking down.",
  },
};

/** Back a trend early: records the focus (and a causal event other clues can link to). */
export function investInTrend(state, trendId, season) {
  if (!TRENDS[trendId]) throw new RangeError(`unknown trend: ${trendId}`);
  const withFocus = { ...state, trendFocus: trendId };
  return recordCausalEvent(withFocus, {
    id: `trend-${trendId}-${season}`,
    kind: "trend",
    subject: trendId,
    season,
    label: `invested in ${trendId}`,
  });
}
