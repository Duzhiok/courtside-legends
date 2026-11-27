/**
 * Player Reborn PR2 — season loop (ADR-005 §3, prep doc).
 *
 * Drives the 1996-97 season game by game: each game is a real GameSim
 * (autoOffense / autoDefense / autoRotation all on — the player does not
 * coach), built from the 1996-97 roster rows with the cloned player in his
 * team's lineup. After each game the player's line feeds the trust update
 * and the season log (aggregates only, never per-possession logs).
 *
 * Takeover seam (PR4): after every possession the driver checks whether the
 * game is in the takeover window (4th quarter / OT, last 2:00, margin <= 5,
 * your ball, you on court). If it is, it calls the `onTakeover` hook once
 * for that game; the hook returns the chosen decision
 * ({ shooterId, actionHint }) or null, and the driver submits it through
 * the M2b decision interface. The driver never invents a shot itself.
 *
 * The season is driven possession by possession (not runFast) so the
 * takeover hook can fire mid-game. One game costs a few hundred ms; the
 * view plays game by game with a button, it never bulk-sims silently.
 */
import { GameSim } from "../engine/sim.js";
import { gameScore } from "../engine/matchExplain.js";
import { overall } from "../data/players.js";
import { awakenedSkillIds } from "../career/player/signatureAwakening.js";
import { seededStream, hashSeed } from "../core/seededRandom.js";
import { isWeekBoundary, GAMES_PER_WEEK } from "../career/calendar.js";
import { roleForTrust, updateTrust, ROLE_MINUTES } from "./trust.js";
import { AUTONOMY_START, buildDecisionContext, clampAutonomy, combineGrades, gradeTakeover, teamCoach } from "./agency.js";
import { askTier, createDecisionGate, importanceOf, opportunityOf } from "./participation.js";
import { DEFENSE_COOLDOWN, MIN_DEFENSE_STAKES, buildDefenseContext, defenseExecution, playGamblePossession } from "./defense.js";
import { REL_START, acceptanceChance, playScreenPossession, playSpotPossession, recordTeammateEvidence, requestOpportunity, respondToRequest, roleInfluence, settleFeed, settleScreen, settleSpot, teamplayOf } from "./teamplay.js";
import { rosterCode } from "./franchises.js";
import { applyGameGrowth } from "./training.js";
import { activeSpecialty, earnFromGame, fragmentLedger, intensiveMultiplier } from "./fragments.js";
import { gameEvidenceId } from "./promiseEvidence.js";
import {
  DEFAULT_TAKEOVER_WINDOW,
  headToHead,
  recordRivalryMeetings,
  rivalryLedger,
  rivalryTimelineEvent,
  rivalsOnRoster,
  takeoverWindowFor,
} from "./rivalry.js";
import { jerseyState, offersForGame } from "../collectibles/jerseyExchange.js";
import { createEggWatcher } from "./enforcerEgg.js";
import { advanceLeague, leagueSchedule } from "./league.js";
import { bestFive, rosterCards } from "./rosters.js";
import {
  buildPlayerCard,
  applyIdentityToRoster,
  maybeReveal,
} from "./identity.js";

export const REBORN_GAMES_PER_WEEK = GAMES_PER_WEEK;

export { rosterCards };

/**
 * Build a season for a reborn run: the 82-game schedule filtered to the
 * player's team's games, in day order. `games` overrides the generated
 * schedule (test hook — a short schedule keeps tests fast).
 */
export function buildSeason(reborn, _players, { games = null } = {}) {
  // The season being played: rolloverSeason moves player.seasonYear on, and a new run starts at startYear + 1 (the same value). Reading
  // startYear alone replayed the first year forever: identical game ids (every gameId-idempotent settlement skipped them) and a resume
  // count that read the finished season's log as the new season's, so the second season opened already "complete".
  const year = reborn.player?.seasonYear ?? reborn.startYear + 1;
  const teamId = reborn.player.teamId;
  if (games) return { year, teamId, games: [...games], index: 0 };
  const schedule = leagueSchedule(reborn.seed, year).nights;      // the clubs that existed that season (an expansion team only from its first year)
  const myGames = [];
  schedule.forEach((night, day) => {
    for (const g of night) {
      if (g.homeId === teamId || g.awayId === teamId) myGames.push({ ...g, day: day + 1 });
    }
  });
  // league: this is the real schedule, so the rest of the league plays along (league.js); a test's short `games` override does not.
  return { year, teamId, games: myGames, index: 0, league: true };
}

/** Starters: best five by overall; a starter-role player is swapped in. */
function startersFor(cards, playerCard, isMyTeam, role) {
  const five = bestFive(cards);
  if (isMyTeam && role === "starter" && !five.includes(playerCard.id)) five[4] = playerCard.id;
  return five;
}

/**
 * Takeover window (PR4): 4th quarter or OT, last 2:00, margin <= 5, your
 * possession, you on court, no decision already armed. A rivalry game
 * widens the clock/margin (RIVALRY_TAKEOVER_WINDOW): more chances, same dice.
 */
export function takeoverEligible(sim, playerId, window = DEFAULT_TAKEOVER_WINDOW) {
  if (!sim || !sim.running) return false;
  if (sim.quarter < 4) return false;
  if (sim.clock > window.clock) return false;
  if (Math.abs(sim.score.home - sim.score.away) > window.margin) return false;
  if (sim.possession !== sim.youSide) return false;
  const you = sim.youSide === "home" ? sim.home : sim.away;
  if (!you.onCourt?.some((p) => p.id === playerId)) return false;
  if (sim.clutchDecision) return false;
  return true;
}

/** Which kind of possession each non-shot agency choice plays (anything else is "keep reading"). */
const CHOICE_KIND = { follow: "plan", setup: "audible", screen: "screen", screenAlt: "screen", spot: "spot", feed: "feed", gamble: "defense", stay: "defense" };
/** Every choice a decision can be answered with besides the two personal moves. The UI's answer check reads THIS list (one source). */
export const CHOICE_IDS = Object.freeze(["pass", ...Object.keys(CHOICE_KIND)]);
const PLAYED_KINDS = ["plan", "audible", "pass", "screen", "spot", "feed", "defense"];

/**
 * Ask the hook for a takeover decision and submit it through the M2b
 * interface. Returns the submitted decision or null (not eligible / skipped
 * / rejected). Purely the interface call — the choice itself comes from the
 * hook (PR4 builds the options, the player picks).
 */
export async function attemptTakeover(sim, playerId, onTakeover, window = DEFAULT_TAKEOVER_WINDOW, context = null, force = false) {
  // `force`: a participation-mode ask outside the clutch window (the gate already decided it is worth asking).
  if (force ? !sim.running || sim.clutchDecision : !takeoverEligible(sim, playerId, window)) return null;
  if (typeof onTakeover !== "function") return null;
  const decision = await onTakeover({ sim, playerId, context });
  // Player Agency: following the coach's call or reading the defense is a choice too, played through the normal offense.
  if (context && decision?.choiceId && !context.options.includes(decision.choiceId)) return null;
  if (context && decision?.choiceId && !decision.shooterId) {
    return { choiceId: decision.choiceId, kind: CHOICE_KIND[decision.choiceId] || "pass", accepted: true, context };
  }
  if (!decision || !decision.shooterId || !decision.actionHint) return null;
  // The hook may carry the attempt id it already issued (the takeover UI's
  // ClutchController); otherwise issue one here. Either way, exactly one
  // id is submitted for this possession.
  const attemptId = decision.attemptId || sim.issueAttemptId();
  const res = sim.submitDecision({
    attemptId,
    kind: "clutch_shooter",
    shooterId: decision.shooterId,
    actionHint: decision.actionHint,
  });
  const agency = context ? { context, choiceId: decision.choiceId || (decision.actionHint === "three" ? "pullup" : "drive") } : {};
  if (!res.accepted) return { ...decision, ...agency, attemptId, accepted: false, reason: res.reason };
  return { ...decision, ...agency, attemptId, accepted: true };
}

/**
 * Play the one possession a non-shot agency choice covers. "follow" runs the coach's call (his focus play + the ball
 * to his man) with the autopilot off for that possession only, so it cannot be overruled mid-call; keeping reading lets the
 * offense flow ("pass"). Either way GameSim decides what happens; the points of the possession are the evidence.
 */
function playChoicePossession(sim, takeover) {
  const youKey = sim.youSide;
  const before = sim.score[youKey];
  const call = { plan: takeover.context?.coachInstruction, audible: takeover.context?.audible, feed: takeover.context?.feedOffer }[takeover.kind] || null;
  const saved = { auto: sim.autoOffense, focusPlay: sim.focusPlay ? { ...sim.focusPlay } : null, offenseFocusId: sim.offenseFocusId };
  if (call) {
    sim.autoOffense = false;
    sim.setFocusPlay(call.focusId);
    sim.setOffenseFocus(call.targetId);
  }
  sim.step();
  if (call) {
    sim.autoOffense = saved.auto;
    sim.focusPlay = saved.focusPlay;
    sim.offenseFocusId = saved.offenseFocusId;
    const you = youKey === "home" ? sim.home : sim.away;
    if (you.gameplan) you.gameplan.offenseFocusId = saved.offenseFocusId;
  }
  return sim.score[youKey] - before;
}

/**
 * PA3: a teammate's screen. Taking his offer is simply yes; asking for the OTHER way to use him is a request, and he answers it
 * with one roll on his own stream (never the sim's). A "no" costs nothing and stops nothing: the possession just plays on.
 */
function playScreenChoice(sim, t, playerId, agency) {
  const { offer, decisionId, values, playerState } = t.context;
  const proposed = t.choiceId === "screenAlt";
  t.teammate = { offer, proposed, accepted: true, chance: null };
  if (proposed) {
    const chance = acceptanceChance({
      autonomy: playerState?.autonomy ?? 0,
      chemistry: agency?.mateStrength?.[offer.personId] ?? REL_START,
      opportunity: requestOpportunity(values, "screenAlt"),
      roleInfluence: roleInfluence(agency?.role),
      iq: offer.iq,
    });
    t.teammate = { offer, proposed, ...respondToRequest({ decisionId, chance }) };
    if (!t.teammate.accepted) {
      t.accepted = false; // not carried out: nothing to grade, nothing to settle
      return 0;
    }
  }
  const run = playScreenPossession(sim, { playerId, screenerId: offer.teammateId, afterScreen: proposed ? offer.alt : offer.afterScreen, finish: offer.finish });
  t.turnover = run.turnover;
  return run.points;
}

/** S2: "find me". Same rules as a request for the other screen: his answer is one roll on his own stream; a "no" stops nothing. */
function playSpotChoice(sim, t, playerId, agency) {
  const { spotOffer: offer, decisionId, values, playerState } = t.context;
  const chance = acceptanceChance({
    autonomy: playerState?.autonomy ?? 0,
    chemistry: agency?.mateStrength?.[offer.personId] ?? REL_START,
    opportunity: requestOpportunity(values, "spot"),
    roleInfluence: roleInfluence(agency?.role),
    iq: offer.iq,
  });
  t.teammate = { offer, proposed: true, ...respondToRequest({ decisionId, chance }) };
  if (!t.teammate.accepted) {
    t.accepted = false;
    return 0;
  }
  t.run = playSpotPossession(sim, { playerId });
  return t.run.points;
}

/**
 * PA3.1: a teammate asked for the ball and you gave it to him: the same engine play as your own call-up (`setFocusPlay` +
 * `setOffenseFocus`, restored), with his own shot read back from the sim as the evidence.
 */
function playFeedChoice(sim, t) {
  const offer = t.context.feedOffer;
  const you = sim.youSide === "home" ? sim.home : sim.away;
  const mate = you.roster.find((p) => p.id === offer.teammateId);
  const stat = (k) => mate?.stats?.[k] || 0;
  const before = { fga: stat("fga"), fgm: stat("fgm"), pts: stat("pts") };
  const points = playChoicePossession(sim, t);
  t.run = { shot: stat("fga") > before.fga, made: stat("fgm") > before.fgm, points: stat("pts") - before.pts };
  t.teammate = { offer, proposed: false };
  return points;
}

/**
 * S3a: the defensive gamble. "Stay home" runs nothing (the possession plays on the team's own defense at the next step);
 * "gamble" runs ONE opposing possession with his focus all-out, then restores it. The evidence is his own steal / foul.
 */
function playDefenseChoice(sim, t, playerId) {
  if (t.choiceId === "gamble") {
    t.run = playGamblePossession(sim, { playerId });
    t.execution = defenseExecution(t.run);
  }
  return 0;
}

/** Play the possession a non-shot agency choice covers and record its points on the choice (the evidence it is graded on). */
function playChoice(sim, t, playerId, agency) {
  if (!PLAYED_KINDS.includes(t?.kind)) return;
  t.points = t.kind === "screen" ? playScreenChoice(sim, t, playerId, agency) : t.kind === "spot" ? playSpotChoice(sim, t, playerId, agency) : t.kind === "defense" ? playDefenseChoice(sim, t, playerId) : t.kind === "feed" ? playFeedChoice(sim, t) : playChoicePossession(sim, t);
}

/**
 * Drive one live game possession by possession; the takeover hook fires at most once.
 * `egg` is the enforcer-egg context ({ rivalBrefs, rng }) or null: when present,
 * the watcher rolls once, the first time your enforcer shares the floor
 * with a rival, and fires at most once per game (see enforcerEgg.js). The egg rolls
 * on its own seeded stream, never the sim's, so the sim's dice are identical
 * with the egg on or off.
 */
export async function driveGame(sim, playerId, { onTakeover = null, window = DEFAULT_TAKEOVER_WINDOW, egg = null, agency = null, participation = null } = {}) {
  sim._quiet = true;
  sim.running = true;
  sim.paused = false;
  sim.breakReason = null;
  let takeover = null;
  const extras = [];
  // participation = { getMode } switches the participation modes on; without it the game is the classic once-per-game clutch ask.
  const gate = participation ? createDecisionGate(participation) : null;
  const youSide = () => (sim.youSide === "home" ? sim.home : sim.away);
  let eggIncident = null;
  let defenseCooldown = 0; // opposing possessions left before the defense may be asked again
  const watcher = egg ? createEggWatcher({ sim, rivalBrefs: egg.rivalBrefs, rng: egg.rng }) : null;
  let guard = 0;
  while (sim.running && guard++ < 8000) {
    sim.step();
    const mayAsk = !gate || gate.mode() !== "auto";
    if (mayAsk && !takeover && onTakeover && takeoverEligible(sim, playerId, window)) {
      const context = agency ? { ...buildDecisionContext(sim, playerId, agency), tier: askTier({ critical: true }) } : null;
      takeover = await attemptTakeover(sim, playerId, onTakeover, window, context);
      // B134 ①: the call costs the timeout he spent drawing it up — but only when the player actually makes a choice
      // and it is accepted. Dismissing the dialog (Esc / backdrop) or letting an L1 bubble time out unanswered costs
      // nothing: the play was never run.
      if (takeover?.accepted && context?.coachInstruction) sim.timeouts[sim.youSide] = Math.max(0, sim.timeouts[sim.youSide] - 1);
      playChoice(sim, takeover, playerId, agency);
    } else if (gate && onTakeover && sim.running && !sim.clutchDecision && sim.possession === sim.youSide) {
      const onCourt = youSide().onCourt?.some((p) => p.id === playerId);
      const importance = importanceOf(sim);
      const critical = takeoverEligible(sim, playerId, window);
      // Auto mode never builds a context; the other modes build one (cheap) to learn whether the coach disagrees.
      const built = onCourt && gate.mode() !== "auto" && agency
        ? buildDecisionContext(sim, playerId, { ...agency, decisionId: `${agency.decisionId}|r${extras.length + 1}`, routine: !critical, importance })
        : null;
      const opportunity = built ? opportunityOf(built.values) : 0;
      const context = built ? { ...built, importance, tier: askTier({ critical, conflict: !!built.coachInstruction, importance, opportunity }) } : null;
      if (context && gate.ask({ onCourt, importance, critical, conflict: !!context.coachInstruction, opportunity })) {
        const asked = await attemptTakeover(sim, playerId, onTakeover, window, context, true);
        if (asked) {
          // B134 ①, same rule as the classic ask above: a dismissed ask costs no timeout.
          if (critical && asked.accepted && context.coachInstruction) sim.timeouts[sim.youSide] = Math.max(0, sim.timeouts[sim.youSide] - 1);
          playChoice(sim, asked, playerId, agency);
          extras.push(asked);
        }
      } else if (onCourt) gate.skipped();
    } else if (gate && onTakeover && agency && sim.running && !sim.clutchDecision && sim.possession !== sim.youSide) {
      // S3a: THEIR possession. One shared gate with the offense, so a game's total questions still obey the mode's cap.
      const onCourt = youSide().onCourt?.some((p) => p.id === playerId);
      const importance = importanceOf(sim);
      if (defenseCooldown > 0 && onCourt) defenseCooldown -= 1;
      const built = onCourt && defenseCooldown === 0 && gate.mode() !== "auto" ? buildDefenseContext(sim, playerId, { ...agency, decisionId: `${agency.decisionId}|d${extras.length + 1}`, importance }) : null;
      const context = built ? { ...built, tier: askTier({ importance }) } : null; // a style choice is never a clutch moment: L2 when the game is close and late, else a bubble
      if (context && Math.abs(context.values.gamble) >= MIN_DEFENSE_STAKES && gate.ask({ onCourt, importance, opportunity: Math.abs(context.values.gamble) })) {
        defenseCooldown = DEFENSE_COOLDOWN;
        const asked = await attemptTakeover(sim, playerId, onTakeover, window, context, true);
        if (asked) {
          playChoice(sim, asked, playerId, agency);
          extras.push(asked);
        }
      } else if (onCourt) gate.skipped();
    }
    if (watcher && !eggIncident) eggIncident = watcher.maybeFire();
  }
  return { takeover, extras, egg: eggIncident };
}

/**
 * Play the next game of the season. Returns { reborn, report } or null when
 * the schedule is exhausted. `reborn` is returned as a new object; the
 * input is never mutated. `trainingDone` marks that this week's training
 * was completed (PR3 wires the real value).
 */
export async function playGame(
  reborn,
  season,
  players,
  { rng = null, onTakeover = null, trainingDone = false, game: gameOverride = null, participation = null } = {},
) {
  // gameOverride: a playoff game (playoffs.js decides who plays whom next, so it is not in the season's list). It may carry `po`:
  // { round, series, n, titleGame } and is logged as a playoff game; `titleGame` = this game wins the championship if the player wins it.
  const game = gameOverride || season.games[season.index];
  if (!game) return null;
  const year = season.year;
  const teamId = reborn.player.teamId;
  const isHome = game.homeId === teamId;
  const oppId = isHome ? game.awayId : game.homeId;

  const role = roleForTrust(reborn.player.coachTrust);
  const playerCard = buildPlayerCard(reborn.identity, players, {
    growth: reborn.player.growth,
    season: year,
    // Signature Awakening (workstream D): skills awakened through real game
    // performance ride on the card from the next game on.
    extraSkills: awakenedSkillIds(reborn.player.awakening),
  });
  playerCard.roleExpectation = role === "starter" ? "starter" : role === "rotation" ? "role" : "bench";
  playerCard.targetMinutes = ROLE_MINUTES[role];

  const teamOf = (code) => {
    let cards = rosterCards(players, code, year);
    if (code === teamId) {
      cards = applyIdentityToRoster(cards, reborn.identity, {
        players,
        growth: reborn.player.growth,
        clone: playerCard,
      });
    }
    return cards;
  };
  const homeCards = teamOf(game.homeId);
  const awayCards = teamOf(game.awayId);
  const myCards = isHome ? homeCards : awayCards;
  const myClone = myCards.find((p) => p.id === playerCard.id) || playerCard;
  const oppCards = isHome ? awayCards : homeCards;

  const homeStarters = startersFor(homeCards, myClone, isHome, role);
  const awayStarters = startersFor(awayCards, myClone, !isHome, role);
  // The tip-off lineup is the real fact behind a "start" promise.
  const started = (isHome ? homeStarters : awayStarters).includes(playerCard.id);

  const simRng = rng || seededStream(hashSeed(`${reborn.seed}|${year}|${season.index}`));
  const sim = new GameSim({
    home: { name: game.homeId, players: homeCards, starterIds: homeStarters },
    away: { name: game.awayId, players: awayCards, starterIds: awayStarters },
    youSide: isHome ? "home" : "away",
    injuries: false,
    speed: 3,
    rng: simRng,
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  sim.autoOffense = true;
  sim.autoDefense = true;
  sim.autoRotation = true;

  // Enforcer egg: only in a rivalry game (a rival on tonight's opponent
  // roster). The egg rolls on its own seeded stream so the sim's dice
  // are untouched by the egg's existence.
  const rivalsTonight = rivalsOnRoster(rivalryLedger(reborn), oppCards);
  const eggCtx = rivalsTonight.length
    ? {
        rivalBrefs: rivalsTonight.map((r) => r.bref),
        rng: seededStream(hashSeed(`${reborn.seed}|${year}|${season.index}|enforcer-egg`)),
      }
    : null;
  const gameId = gameEvidenceId(reborn.seed, year, season.index + 1);
  const autonomyBefore = reborn.player.autonomy ?? AUTONOMY_START;
  const agencyCtx = {
    coach: teamCoach(rosterCode(teamId, year), year),
    iq: Number(playerCard.iq) || 50,
    decisionId: `${gameId}|takeover`,
    trust: reborn.player.coachTrust,
    autonomy: autonomyBefore,
    // PA3: plain data (no functions) so a teammate's answer can read how close he is to you and how much you carry.
    role,
    mateStrength: Object.fromEntries(Object.entries(teamplayOf(reborn).mates).map(([id, m]) => [id, m.strength])),
  };
  const { takeover, extras, egg: eggIncident } = await driveGame(sim, playerCard.id, { onTakeover, window: takeoverWindowFor(rivalryLedger(reborn), oppCards), egg: eggCtx, agency: agencyCtx, participation });

  const youSide = sim.youSide === "home" ? sim.home : sim.away;
  const stats = youSide.roster.find((p) => p.id === playerCard.id)?.stats || {};
  const line = {
    id: playerCard.id,
    min: Math.round((stats.min || 0) * 10) / 10,
    pts: stats.pts || 0,
    reb: stats.reb || 0,
    ast: stats.ast || 0,
    stl: stats.stl || 0,
    blk: stats.blk || 0,
    tov: stats.tov || 0,
    fgm: stats.fgm || 0,
    fga: stats.fga || 0,
    tpm: stats.tpm || 0,
    tpa: stats.tpa || 0,
    ftm: stats.ftm || 0,
    fta: stats.fta || 0,
    pf: stats.pf || 0,
  };
  const gs = Math.round(gameScore(stats) * 10) / 10;
  const trustBefore = reborn.player.coachTrust;
  const outcomeOf = (t) => (t?.accepted ? sim.clutchLog.find((o) => o.attemptId === t.attemptId) || null : null);
  const takeoverOutcome = outcomeOf(takeover);
  const agency = combineGrades([gradeTakeover(takeover, takeoverOutcome), ...extras.map((t) => gradeTakeover(t, outcomeOf(t)))]);
  // Training pays trust once a week, on the week's last game — never once
  // per game, or a bench player could train his way to starter without
  // ever playing.
  const trainingThisWeek = trainingDone && isWeekBoundary(season.index + 1, REBORN_GAMES_PER_WEEK);
  const trustChange = updateTrust(trustBefore, {
    gameScore: gs,
    role,
    trainingDone: trainingThisWeek,
    minutes: line.min,
    takeover: takeoverOutcome ? { attempted: takeoverOutcome.attempted, made: takeoverOutcome.made } : null,
    agency,
  });
  const trustAfter = trustChange.trust;
  const roleAfter = roleForTrust(trustAfter);
  const won = isHome
    ? sim.score.home > sim.score.away
    : sim.score.away > sim.score.home;
  const gameWeek = Math.floor(season.index / REBORN_GAMES_PER_WEEK) + 1;
  // Real opponent box lines (the only evidence a rivalry is built from).
  const oppSide = sim.youSide === "home" ? sim.away : sim.home;
  const opponents = oppSide.roster
    .filter((p) => (p.stats?.min || 0) > 0)
    .map((p) => ({
      id: p.id,
      bref: p.bref,
      name: p.name,
      nameEn: p.nameEn || p.name,
      pos: p.pos,
      team: oppId,
      ovr: overall(p),
      min: Math.round((p.stats.min || 0) * 10) / 10,
      pts: p.stats.pts || 0,
      gs: Math.round(gameScore(p.stats) * 10) / 10,
    }));

  const next = structuredClone(reborn);
  next.player.coachTrust = trustAfter;
  const autonomyAfter = clampAutonomy(autonomyBefore + (agency?.autonomyDelta || 0));
  next.player.autonomy = autonomyAfter;
  next.player.rotationRole = roleAfter;
  // PA3: what the screens you called really did (GameSim's points / turnover), settled into the run once per game and
  // teammate. A teammate who said no is reported but moves nothing.
  const screens = [takeover, ...extras].filter((t) => (t?.kind === "screen" || t?.kind === "spot" || t?.kind === "feed") && t.teammate);
  const mateEvidence = screens
    .filter((t) => t.accepted)
    .map((t) => (t.kind === "feed"
      ? settleFeed({ decisionId: t.context.decisionId, offer: t.teammate.offer, run: t.run, critical: !t.context.routine })
      : t.kind === "spot"
      ? settleSpot({ decisionId: t.context.decisionId, offer: t.teammate.offer, run: t.run, critical: !t.context.routine })
      : settleScreen({ decisionId: t.context.decisionId, offer: t.teammate.offer, points: t.points || 0, turnover: !!t.turnover, critical: !t.context.routine, proposed: t.teammate.proposed })));
  const mates = recordTeammateEvidence(reborn, gameId, mateEvidence);
  next.teamplay = mates.teamplay;
  const gambles = [takeover, ...extras].filter((t) => t?.kind === "defense" && t.choiceId === "gamble" && t.run);
  const defense = gambles.length ? gambles.map((t) => ({ steal: t.run.steal, foul: t.run.foul, fouls: t.run.fouls, forcedTurnover: t.run.forcedTurnover })) : null;
  const teamplay = screens.length
    ? {
        items: [
          ...mateEvidence,
          ...screens.filter((t) => !t.accepted).map((t) => ({ kind: t.kind, rejected: true, proposed: true, name: t.teammate.offer.name, nameEn: t.teammate.offer.nameEn, chance: t.teammate.chance })),
        ],
        moved: mates.moved,
      }
    : null;
  next.identity = maybeReveal(next.identity, trustAfter);
  // The trust-40 reveal flips here (if it flips at all) — the report
  // carries it so the view can stage the reveal moment.
  const revealedNow = !reborn.identity.revealed && next.identity.revealed;
  next.player.seasonLog.push({
    year,
    game: season.index + 1,
    gameId,
    started,
    opp: oppId,
    home: isHome,
    min: line.min,
    pts: line.pts,
    reb: line.reb,
    ast: line.ast,
    takeovers: takeoverOutcome ? 1 : 0,
    role: roleAfter,
    won,
    ...(game.po ? { po: { round: game.po.round, series: game.po.series, n: game.po.n } } : {}),
    // The final score (league standings and tie-breaks read it); a log from before this was kept still counts W-L.
    ptsFor: isHome ? sim.score.home : sim.score.away,
    ptsAgainst: isHome ? sim.score.away : sim.score.home,
  });
  // PR3: the game's XP converts into attribute gains under the current
  // training focus (awardGrowth + ceilings; the ledger is the only store).
  const growthOut = applyGameGrowth(next, {
    year,
    cards: myCards,
    rows: players,
    lines: [{ id: playerCard.id, name: playerCard.name, min: line.min, score: gs, practice: trainingThisWeek }],
    xpMultiplier: intensiveMultiplier(reborn, gameWeek),
    week: gameWeek,
  });
  next.player.growth = growthOut.growth;
  season.index += 1;
  // The rest of the league plays this day's games (and, after the player's last game, whatever is left of the schedule).
  if (season.league) advanceLeague(next, players, { year, throughDay: season.index >= season.games.length ? Infinity : game.day });

  const reportCore = {
    gameId,
    year,
    game: season.index,
    won,
    margin: Math.abs(sim.score.home - sim.score.away),
    line: { ...line, score: gs },
    gameScore: gs,
    you: { pos: playerCard.pos, ovr: overall(myClone) },
    opponents,
    takeover: takeoverOutcome ? { attempted: takeoverOutcome.attempted, made: takeoverOutcome.made } : null,
    // The real evidence a championship keepsake needs: this game clinched the title (jerseyEligibility reads it, nothing else sets it).
    ...(game.po?.titleGame && won ? { isChampionship: true } : {}),
  };
  const rivalry = recordRivalryMeetings(rivalryLedger(reborn), reportCore);
  next.rivalries = rivalry.ledger;
  // Jersey exchange (J3): a rival who really played tonight and has earned enough respect may offer a jersey. Evidence is the
  // same report + rivalry ledger; deterministic ids make a replayed game add nothing. No gameplay effect.
  const jerseys = offersForGame(jerseyState(reborn), { report: reportCore, ledger: rivalry.ledger, rivalry });
  if (jerseys.state.offers.length || jerseys.state.collection.length) next.jerseys = jerseys.state;
  // Rivals on tonight's roster who did not make it a meeting, and why (never silent).
  const metBrefs = new Set(rivalry.met.map((m) => m.rival.bref));
  const missed = rivalsOnRoster(rivalryLedger(reborn), oppCards)
    .filter((r) => !metBrefs.has(r.bref))
    .map((r) => ({ bref: r.bref, name: r.name, nameEn: r.nameEn, why: line.min <= 0 ? "you-dnp" : "he-dnp" }));
  // Career fragments (decision 4): paid by this game's evidence only, once per gameId.
  const fragments = earnFromGame(fragmentLedger(reborn), { gameId, min: line.min, gameScore: gs, role, rivalryWon: won && rivalry.met.length > 0 });
  next.player.fragments = fragments.ledger;
  if (rivalry.formed.length) {
    next.timeline = { ...(next.timeline || {}), events: [...(next.timeline?.events || []), ...rivalry.formed.map(rivalryTimelineEvent)] };
  }

  return {
    reborn: next,
    report: {
      ...reportCore,
      day: game.day,
      ...(game.po ? { po: { ...game.po } } : {}),
      opp: oppId,
      home: isHome,
      score: { ...sim.score },
      trustBefore,
      trustAfter,
      trustDelta: trustChange.delta,
      trustParts: trustChange.parts,
      roleBefore: role,
      roleAfter,
      revealedNow,
      growth: growthOut.entries,
      intensive: intensiveMultiplier(reborn, gameWeek) > 1,
      specialty: activeSpecialty(reborn, gameWeek),
      fragments: { earned: fragments.earned, reasons: fragments.reasons, balance: fragments.ledger.balance },
      takeover: takeoverOutcome
        ? {
            option: takeover.actionHint,
            shooterId: takeoverOutcome.shooterId,
            attempted: takeoverOutcome.attempted,
            made: takeoverOutcome.made,
            points: takeoverOutcome.points,
            zone: takeoverOutcome.zone,
            reason: takeoverOutcome.reason,
          }
        : null,
      agency: agency ? { ...agency, trustApplied: Math.round(agency.trustDelta), autonomyBefore, autonomyAfter } : null,
      teamplay,
      defense,
      weekBoundary: isWeekBoundary(season.index, REBORN_GAMES_PER_WEEK),
      enforcerEgg: eggIncident || null,
      jersey: { offers: jerseys.created.map((o) => ({ id: o.id, fromBref: o.fromBref, fromName: o.fromName, fromNameEn: o.fromNameEn, reasons: o.reasons, respect: o.respect })) },
      rivalry: {
        formed: rivalry.formed.map((r) => ({ bref: r.bref, name: r.name, nameEn: r.nameEn, origin: r.origin, reason: r.reason })),
        met: rivalry.met.map(({ rival, meeting }) => ({ bref: rival.bref, name: rival.name, nameEn: rival.nameEn, ...meeting, ...headToHead(rival) })),
        missed,
      },
    },
  };
}

/** Play the rest of the season, one game at a time. Returns the final state + summary. */
export async function playSeason(reborn, season, players, opts = {}) {
  let current = reborn;
  const reports = [];
  while (season.index < season.games.length) {
    const out = await playGame(current, season, players, opts);
    if (!out) break;
    current = out.reborn;
    reports.push(out.report);
    opts.onGame?.(out.report);
  }
  const log = current.player.seasonLog;
  return {
    reborn: current,
    reports,
    summary: {
      year: season.year,
      games: reports.length,
      wins: reports.filter((r) => r.won).length,
      pts: log.reduce((n, e) => n + (e.pts || 0), 0),
      takeovers: log.reduce((n, e) => n + (e.takeovers || 0), 0),
      finalTrust: current.player.coachTrust,
      finalRole: current.player.rotationRole,
    },
  };
}
