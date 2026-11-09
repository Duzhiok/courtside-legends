/**
 * "Share a draft sleeper" made real (D of docs/CAREER_LIFE_ROADMAP.md). The opening choice used to be
 * three numbers; now you put a name on it. The board shows three real prospects from the next three
 * rookie classes -- one real sleeper (arrived weak, broke out within three seasons) and two who
 * never did -- each with only a blurred memory of where he peaked. You pick one; after his third
 * season his REAL cards decide whether the prophecy came true.
 *
 * The roster has no draft positions, so "sleeper" is defined by the real career curve, not by where
 * he was picked. Everything is deterministic from (year, career seed): a reload shows the same board.
 */
import { PLAYERS, overall } from "../data/players.js";
import { clamp, hashSeed, seededStream, shuffle } from "../core/seededRandom.js";
import { ensureCoachProfile, withCoachProfile } from "./coachProfile.js";
import {
  PROPHECY_DECOY_BEST_MAX,
  PROPHECY_HIT,
  PROPHECY_HIT_OVR,
  PROPHECY_MEMORY_SHIFT,
  PROPHECY_MEMORY_WIDTH,
  PROPHECY_MISS,
  PROPHECY_SLEEPER_BEST_MIN,
  PROPHECY_SLEEPER_ROOKIE_MAX,
} from "./balance.js";

/** Seasons counted for the verdict: the rookie year and the two after it. */
const SEASONS_JUDGED = 3;
/** How many rookie classes ahead you can see: the next three drafts. */
const CLASSES_AHEAD = 3;

const careerCache = new WeakMap();
/** bref -> that player's cards, oldest first. Cached per players array (and its length: it loads async). */
function careersOf(players) {
  const hit = careerCache.get(players);
  if (hit && hit.size === players.length) return hit.careers;
  const careers = new Map();
  for (const card of players) {
    if (!card?.bref || !Number.isInteger(card.season)) continue;
    if (!careers.has(card.bref)) careers.set(card.bref, []);
    careers.get(card.bref).push(card);
  }
  for (const cards of careers.values()) cards.sort((a, b) => a.season - b.season);
  careerCache.set(players, { size: players.length, careers });
  return careers;
}

/** Best OVR over his first three seasons, or null when we hold no card for him. */
function bestEarlyOvr(cards, rookieSeason) {
  const early = cards.filter((card) => card.season <= rookieSeason + SEASONS_JUDGED - 1);
  return early.length ? Math.max(...early.map(overall)) : null;
}

/** The career seed every prophecy roll uses: same story, same board. */
export const prophecySeed = (story) => hashSeed(story?.storyId || "");

/**
 * Three candidates (order shuffled), or [] when the data can't give an honest board (no sleeper in
 * those classes, too few decoys, or classes so late that the third season is past the roster).
 * Never returns the answer: no best-OVR field leaves this module.
 */
export function sleeperCandidates({ year, seed, players = PLAYERS }) {
  const careers = careersOf(players);
  let lastSeason = 0;
  for (const cards of careers.values()) lastSeason = Math.max(lastSeason, cards.at(-1).season);
  const rows = [];
  for (const [bref, cards] of careers) {
    const rookie = cards[0];
    if (rookie.season < year + 1 || rookie.season > year + CLASSES_AHEAD) continue;
    if (rookie.season + SEASONS_JUDGED - 1 > lastSeason) continue;
    rows.push({ bref, rookie, rookieOvr: overall(rookie), best: bestEarlyOvr(cards, rookie.season) });
  }
  const byBref = (a, b) => a.bref.localeCompare(b.bref);
  const sleepers = rows
    .filter((row) => row.rookieOvr <= PROPHECY_SLEEPER_ROOKIE_MAX && row.best >= PROPHECY_SLEEPER_BEST_MIN)
    .sort((a, b) => b.best - b.rookieOvr - (a.best - a.rookieOvr) || byBref(a, b));
  if (!sleepers.length) return [];
  const rng = seededStream((seed >>> 0) ^ hashSeed(`prophecy:${year}`));
  const sleeper = sleepers[Math.floor(rng() * Math.min(3, sleepers.length))];
  const lookalikes = rows
    .filter((row) => row.best <= PROPHECY_DECOY_BEST_MAX)
    .sort((a, b) => Math.abs(a.rookieOvr - sleeper.rookieOvr) - Math.abs(b.rookieOvr - sleeper.rookieOvr) || byBref(a, b))
    .slice(0, 6);
  if (lookalikes.length < 2) return [];
  const decoys = shuffle(lookalikes, rng).slice(0, 2);
  return shuffle([sleeper, ...decoys], rng).map((row) => {
    const center = row.best + Math.round((rng() * 2 - 1) * PROPHECY_MEMORY_SHIFT);
    const half = PROPHECY_MEMORY_WIDTH / 2;
    const raw = row.rookie.raw || {};
    return {
      bref: row.bref,
      name: row.rookie.name,
      cardId: row.rookie.id,
      pos: row.rookie.pos,
      team: row.rookie.team,
      rookieSeason: row.rookie.season,
      rookieOvr: row.rookieOvr,
      line: { ppg: raw.ppg ?? null, rpg: raw.rpg ?? null, apg: raw.apg ?? null },
      low: clamp(Math.round(center - half), 40, 99),
      high: clamp(Math.round(center + half), 40, 99),
    };
  });
}

/** The board for this career as it stands (the year you arrived in). */
export function prophecyBoard(root, players = PLAYERS) {
  return sleeperCandidates({ year: root.leagueCareer.season.year, seed: prophecySeed(root.story), players });
}

/** Put your name on one of them. Must come straight after choosing "share a draft sleeper". */
export function pledgeProphecy(root, bref, players = PLAYERS) {
  const story = root?.story;
  if (!story) throw new TypeError("root with a story is required");
  if (story.prophecy) throw new Error("a prophecy was already made");
  const last = [...(story.eventLog || [])].reverse().find((entry) => entry.type === "future-knowledge-intro");
  if (last?.choiceId !== "share-draft-sleeper") throw new Error("only after choosing to share a draft sleeper");
  const pick = prophecyBoard(root, players).find((candidate) => candidate.bref === bref);
  if (!pick) throw new RangeError("that prospect is not on the board");
  const year = root.leagueCareer.season.year;
  const prophecy = {
    bref: pick.bref,
    name: pick.name,
    rookieSeason: pick.rookieSeason,
    judgeYear: pick.rookieSeason + SEASONS_JUDGED - 1,
    low: pick.low,
    high: pick.high,
    madeYear: year,
    status: "pending",
  };
  return {
    ...root,
    story: {
      ...story,
      prophecy,
      eventLog: [...story.eventLog, { type: "prophecy-made", year, bref: pick.bref, name: pick.name, rookieSeason: pick.rookieSeason }],
    },
  };
}

/**
 * Between seasons: once his third season is over (`year` is the NEW season), read his real cards and
 * pay out. No-op until then, after it is settled, or if we hold no card for him (never guess a miss).
 */
export function settleProphecy(root, { year, players = PLAYERS } = {}) {
  const prophecy = root?.story?.prophecy;
  if (!prophecy || prophecy.status !== "pending" || !Number.isInteger(year) || year <= prophecy.judgeYear) return root;
  const cards = careersOf(players).get(prophecy.bref);
  const best = cards ? bestEarlyOvr(cards, prophecy.rookieSeason) : null;
  if (best === null) return root;
  const hit = best >= PROPHECY_HIT_OVR;
  const effects = hit ? PROPHECY_HIT : PROPHECY_MISS;
  const coach = ensureCoachProfile(root);
  const reputation = clamp(Math.round((coach.reputation ?? 0) + effects.reputation), 0, 100);
  return {
    ...withCoachProfile(root, { ...coach, reputation }),
    story: {
      ...root.story,
      frontOfficeTrust: root.story.frontOfficeTrust + effects.trust,
      prophecy: { ...prophecy, status: hit ? "hit" : "miss", best },
      eventLog: [
        ...root.story.eventLog,
        { type: "prophecy-result", year: prophecy.judgeYear, bref: prophecy.bref, name: prophecy.name, hit, best, trust: effects.trust, reputation: effects.reputation },
      ],
    },
  };
}
