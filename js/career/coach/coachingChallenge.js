/**
 * Coach tactical comeback challenge — the playable slice (workstream B,
 * Career 2.0). Sim-driven controller, no DOM, no randomness of its own.
 *
 * Scenario (reuses the M2b machinery): 2016 GSW (you, home) vs CLE, Q4,
 * 12:00, down 10 (85–95), CLE ball. `autoOffense` / `autoDefense` stay off
 * (their defaults), so the sim never overrides a player tactic choice.
 *
 * Moments are triggered by real game state, never at random:
 *  - opening: Q4 start, down 10 — pick the defensive system.
 *  - opponent_run: the opponent outscores you by 8+ since the last decision,
 *    or their star has 8+ in the quarter.
 *  - late: clock ≤ 150 and the deficit is 1–6 — the clutch window.
 *
 * Every choice is data ({ action: { type, ... } }) applied through the
 * existing sim interfaces (setTactic / setFocusPlay / setTempo /
 * setDefenseScheme / callTimeout / shout / talk / substitute /
 * submitDecision). Nothing here adds a bonus or rolls dice; the fixed-seed
 * measurement (scripts/measure/coach-tactics-ab.mjs) shows the same seed
 * diverging only because a different choice was made.
 *
 * Decision interface (the seam workstream G's Video Analyst feeds):
 *  - A moment is { id, kind, title, analysis, choices, state, recommendation? }.
 *  - A choice is { id, label, preview, downside, action, promise? } — plain
 *    data, no functions, so any producer (UI, analyst, test) can build one.
 *  - `createCoachingChallenge({ recommend })` accepts an optional
 *    `recommend(moment, ctx) => ({ choiceId, reason, source } | null)`.
 *    When a moment is built, the hook is called and its result is attached
 *    as `moment.recommendation` — rendered as a suggestion, never
 *    auto-applied. The controller never imports the analyst; the hook is the
 *    whole contract. Without a hook there is no recommendation.
 */

import {
  buildClutchTeams,
  startClutchSim,
  createClutchController,
  explainClutchOutcome,
} from "../../engine/clutchController.js";
import { createTacticalTakeover } from "../../engine/tacticalTakeover.js";
import {
  createTacticalState,
  recordSystemRun,
  familiarityOf,
  buyInOf,
  opponentReadinessOf,
  recordPromise,
  settlePromises,
  promiseCounts,
  challengeCareerEffect,
  tradeoffFor,
  executionRisk,
  tacticName,
} from "./tacticalLearning.js";

export const COACH_COMEBACK_SCENARIO = Object.freeze({
  homeTeam: "GSW",
  awayTeam: "CLE",
  season: 2016,
  youSide: "home",
  quarter: 4,
  clock: 720,
  score: Object.freeze({ home: 85, away: 95 }),
  possession: "away",
});

export const OPPONENT_KEY = "CLE:2016";
export const RUN_SWING_TRIGGER = 8;
export const STAR_Q4_TRIGGER = 8;
export const LATE_CLOCK = 150;
export const LATE_DEFICIT_MAX = 6;

const COACH = Object.freeze({
  id: "you-coach",
  name: "你",
  style: "临场教练",
  specialTactics: ["balanced", "smallball", "switch_all", "zone_drop", "pack_paint", "motion", "pace_space", "grind"],
  preferred: [],
  buffs: { offense: 8, defense: 8, morale: 8, stamina: 2 },
});

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const t = (zh, en) => ({ zh, en });
const pickLang = (pair, lang) => (lang === "en" ? pair.en || pair.zh : pair.zh);

function margin(score) {
  return (score?.away ?? 0) - (score?.home ?? 0);
}

export function createCoachingChallenge({ pool, seed, rng, recommend = null } = {}) {
  if (!Array.isArray(pool)) throw fail("coach/no-pool", "coaching challenge needs a card pool");
  let sim = null;
  let takeover = null;
  let clutch = null;
  let state = "idle"; // idle | moment | playing | clutch_pending | ended
  let tactical = createTacticalState();
  let moment = null;
  let momentSeq = 0;
  let decisions = [];
  let events = [];
  let runFired = false;
  let lateFired = false;
  let clutchOutcome = null;
  let lastDecisionMargin = null;
  let starAtQ4 = null; // { id, name, pts }
  let possessionsByTactic = {};
  let promisesWindow = null; // { startPossession, starId, starFga }
  let possessionCount = 0;

  const you = () => sim?.you?.() || sim?.home;
  const live = () => ({
    fit: you()?.fit ?? 50,
    morale: you()?.morale ?? 50,
    chem: you()?.chem ?? 50,
    tactic: you()?.tactic?.id || null,
    timeouts: sim?.timeouts?.home ?? 0,
    score: sim ? { ...sim.score } : { home: 0, away: 0 },
    clock: sim?.clock ?? 0,
    quarter: sim?.quarter ?? 4,
  });

  const readouts = () => {
    const l = live();
    const counts = promiseCounts(tactical);
    const buyIn = buyInOf({ morale: l.morale, fit: l.fit, promisesKept: counts.kept, promisesBroken: counts.broken });
    return { ...l, buyIn, promises: counts };
  };

  const starOf = (team) =>
    [...(team?.onCourt || [])].sort((a, b) => (b.scoring || 0) - (a.scoring || 0))[0] || null;

  const bestThree = (team) =>
    [...(team?.onCourt || [])].sort((a, b) => (b.three || 0) - (a.three || 0))[0] || null;

  const onEvent = (ev) => {
    if (events.length > 400) events.shift();
    events.push(ev);
  };

  function recordDecision(momentId, choice, applied) {
    const l = live();
    decisions.push({
      seq: decisions.length + 1,
      momentId,
      choiceId: choice.id,
      clock: l.clock,
      score: { ...l.score },
      margin: margin(l.score),
      fitBefore: choice._fitBefore,
      fitAfter: l.fit,
      moraleBefore: choice._moraleBefore,
      moraleAfter: l.morale,
      tacticBefore: choice._tacticBefore,
      tacticAfter: l.tactic,
      timeoutsAfter: l.timeouts,
      applied,
      eventsFrom: events.length,
    });
    lastDecisionMargin = margin(l.score);
  }

  function settleOpenPromises() {
    if (!promisesWindow) return [];
    const star = sim?.you?.()?.onCourt?.find((p) => p.id === promisesWindow.starId);
    const evidence = {
      starAttempts: star ? (star.stats?.fga ?? 0) - promisesWindow.starFga : 0,
      opponentPoints: (sim?.score?.away ?? 0) - promisesWindow.awayScore,
      deficitChange: margin(sim?.score) - promisesWindow.margin,
    };
    const { state: next, settled } = settlePromises(tactical, evidence);
    tactical = next;
    if (settled.length) promisesWindow = null;
    return settled;
  }

  function attachRecommendation(m) {
    if (typeof recommend !== "function") return m;
    try {
      const rec = recommend(m, { readouts: readouts(), tactical });
      if (rec && typeof rec.choiceId === "string" && m.choices.some((c) => c.id === rec.choiceId)) {
        return { ...m, recommendation: { choiceId: rec.choiceId, reason: rec.reason || "", source: rec.source || "video-analyst" } };
      }
    } catch {
      /* a broken analyst hook must never break the challenge */
    }
    return m;
  }

  function buildMoment(kind) {
    const l = live();
    const r = readouts();
    const opp = sim?.away;
    const star = starOf(opp);
    const myStar = starOf(you());
    momentSeq += 1;
    let m = null;

    if (kind === "opening") {
      const fam = (id) => familiarityOf(tactical, id);
      const risk = (id) => executionRisk({ familiarity: fam(id), fit: l.fit, buyIn: r.buyIn });
      const choice = (id, promise) => ({
        id,
        label: t(tacticName(id), tacticName(id, "en")),
        preview: t(tradeoffFor(id).effect, tradeoffFor(id).effect),
        downside: t(tradeoffFor(id).downside, tradeoffFor(id).downside),
        risk: risk(id),
        familiarity: fam(id),
        action: { type: "tactic", tacticId: id },
        ...(promise ? { promise } : {}),
      });
      m = {
        id: `moment-${momentSeq}`,
        kind,
        title: t("第四节开局：落后 10 分，对手正在起势", "Q4 opens: down 10, the opponent is rolling"),
        analysis: t(
          `对方刚刚打出一波进攻，${star?.name || "对方核心"}手感正热。你的防守体系决定了接下来能不能止血：换防看阵容适配，沉退会拖慢追分节奏，收缩篮下会放空外线。没有永远正确的答案——选一个你能执行的。`,
          `The opponent just went on a run and ${star?.name || "their star"} is hot. Your defensive system decides whether you can stop the bleeding: switching depends on roster fit, dropping slows the comeback, packing the paint leaves threes open. There is no always-right answer — pick one you can execute.`,
        ),
        choices: [
          choice("switch_all", { kind: "defense-holds", threshold: 8, duePossessions: 6, text: "换防后 6 个回合，对手得分不超过 8 分" }),
          choice("zone_drop", { kind: "comeback", threshold: 3, duePossessions: 6, text: "沉退后 6 个回合，分差缩小至少 3 分" }),
          choice("pack_paint", { kind: "defense-holds", threshold: 8, duePossessions: 6, text: "收缩后 6 个回合，对手得分不超过 8 分" }),
        ],
        state: { clock: l.clock, score: l.score, fit: l.fit, morale: l.morale, buyIn: r.buyIn },
      };
    } else if (kind === "opponent_run") {
      const starQ4 = star ? (star.stats?.pts ?? 0) - (starAtQ4?.pts ?? 0) : 0;
      const canTimeout = l.timeouts > 0;
      m = {
        id: `moment-${momentSeq}`,
        kind,
        title: t("对手打出一波流：暂停还是变招？", "Opponent run: timeout or adjust?"),
        analysis: t(
          `自上次决策以来对手净胜 ${Math.max(0, margin(l.score) - (lastDecisionMargin ?? margin(l.score)))} 分，${star?.name || "对方核心"}本节已得 ${starQ4} 分。暂停能打断势头但要用掉一次宝贵暂停；夹击能限制核心，但分球后的空位是真实代价；改打进攻重点则赌自己的手感。`,
          `Since your last decision the opponent is +${Math.max(0, margin(l.score) - (lastDecisionMargin ?? margin(l.score)))} and ${star?.name || "their star"} has ${starQ4} this quarter. A timeout breaks the run but costs one of your few left; doubling limits the star but the kick-out is a real cost; changing the offensive focus bets on your own shooting.`,
        ),
        choices: [
          {
            id: "timeout_talk",
            label: t("暂停 + 场边沟通", "Timeout + sideline talk"),
            preview: t(tradeoffFor("timeout_talk").effect, tradeoffFor("timeout_talk").effect),
            downside: t(tradeoffFor("timeout_talk").downside, tradeoffFor("timeout_talk").downside),
            action: { type: "timeout_talk" },
            disabled: !canTimeout,
            disabledReason: canTimeout ? null : t("没有暂停了", "No timeouts left"),
          },
          {
            id: "double_hot_hand",
            label: t(`夹击${star?.name || "对方核心"}`, `Double ${star?.name || "their star"}`),
            preview: t(tradeoffFor("double_hot_hand").effect, tradeoffFor("double_hot_hand").effect),
            downside: t(tradeoffFor("double_hot_hand").downside, tradeoffFor("double_hot_hand").downside),
            action: { type: "double", targetId: star?.id || null },
            disabled: !star,
            disabledReason: !star ? t("场上没有明确的对方核心", "No clear opposing star on the floor") : null,
          },
          {
            id: "attack_focus",
            label: t(`改打进攻：球给${myStar?.name || "核心"}`, `Attack: ball to ${myStar?.name || "your star"}`),
            preview: t(tradeoffFor("iso_star").effect, tradeoffFor("iso_star").effect),
            downside: t(tradeoffFor("iso_star").downside, tradeoffFor("iso_star").downside),
            action: { type: "focus", focusId: "iso_star" },
            promise: { kind: "star-touches", targetId: myStar?.id || null, threshold: 3, duePossessions: 6, text: `${myStar?.name || "核心"}接下来 6 个回合至少出手 3 次` },
          },
        ],
        state: { clock: l.clock, score: l.score, fit: l.fit, morale: l.morale, buyIn: r.buyIn },
      };
    } else if (kind === "late") {
      const deficit = margin(l.score);
      const needThree = deficit === 3 || (deficit >= 4 && deficit <= 6 && l.clock <= 48);
      const shooter = needThree ? bestThree(you()) || starOf(you()) : starOf(you());
      m = {
        id: `moment-${momentSeq}`,
        kind,
        title: t(`最后 ${Math.ceil(l.clock / 60)} 分钟：还差 ${deficit} 分`, `Final ${Math.ceil(l.clock / 60)} minutes: down ${deficit}`),
        analysis: t(
          `分差回到一两个回合内，比赛进入关键时刻。把球交给${shooter?.name || "核心"}是 M2b 的绝杀决策——球能不能到他手里、他能不能出手，都由引擎说了算；磨节奏能提高每次出手质量，但回合变少；提速能抢更多回合，但出手更仓促、失误更多。`,
          `The game is within a possession or two. Giving the ball to ${shooter?.name || "your star"} is the M2b clutch call — whether he gets it and gets a shot off is the engine's call; grinding raises shot quality but shrinks the possession count; pushing buys more possessions but rushed shots and more turnovers.`,
        ),
        choices: [
          {
            id: "clutch_call",
            label: t(`绝杀决策：球给${shooter?.name || "核心"}`, `Clutch call: ball to ${shooter?.name || "your star"}`),
            preview: t("M2b 绝杀合同：submitDecision 锁定下一次进攻回合，出手结果由引擎结算", "M2b clutch contract: submitDecision arms your next offensive possession; the engine settles the shot"),
            downside: t("球可能传不到他手里（被夹击、失误、没拿到球），也可能根本没能出手", "The ball may never reach him (doubled, turnover, no handoff) — or no shot may come at all"),
            action: { type: "clutch", shooterId: shooter?.id || null, actionHint: needThree ? "three" : "attack" },
            disabled: !shooter,
            disabledReason: !shooter ? t("场上没有可执行的接球人", "No shooter available on the floor") : null,
          },
          {
            id: "grind",
            label: t("磨节奏：拖慢 + 慢打", "Grind it out: slow pace"),
            preview: t(tradeoffFor("grind").effect, tradeoffFor("grind").effect),
            downside: t(tradeoffFor("grind").downside, tradeoffFor("grind").downside),
            action: { type: "tempo_focus", tempoId: "grind", focusId: "slow_pace" },
          },
          {
            id: "push",
            label: t("提速抢回合：提速 + 三分", "Push the pace: run and gun"),
            preview: t(tradeoffFor("push").effect, tradeoffFor("push").effect),
            downside: t(tradeoffFor("push").downside, tradeoffFor("push").downside),
            action: { type: "tempo_focus", tempoId: "push", focusId: "pace_three" },
          },
        ],
        state: { clock: l.clock, score: l.score, fit: l.fit, morale: l.morale, buyIn: r.buyIn },
      };
    }
    return attachRecommendation(m);
  }

  function applyAction(choice) {
    const a = choice.action;
    const before = live();
    choice._fitBefore = before.fit;
    choice._moraleBefore = before.morale;
    choice._tacticBefore = before.tactic;
    if (a.type === "tactic") {
      sim.setTactic(a.tacticId);
      return { ok: true, applied: { tactic: a.tacticId } };
    }
    if (a.type === "timeout_talk") {
      if (!sim.callTimeout("home", { pause: false })) return { ok: false, reason: "no_timeout" };
      sim.talk();
      return { ok: true, applied: { timeout: true, talk: true } };
    }
    if (a.type === "double") {
      if (!a.targetId) return { ok: false, reason: "no_target" };
      sim.setDefenseScheme("double", a.targetId);
      return { ok: true, applied: { defenseScheme: "double", targetId: a.targetId } };
    }
    if (a.type === "focus") {
      const res = takeover.setFocus(a.focusId);
      return res.ok ? { ok: true, applied: { focus: a.focusId } } : { ok: false, reason: res.reason };
    }
    if (a.type === "tempo_focus") {
      const tempo = takeover.setTempo(a.tempoId);
      if (!tempo.ok) return { ok: false, reason: tempo.reason };
      const focus = takeover.setFocus(a.focusId);
      if (!focus.ok) return { ok: false, reason: focus.reason };
      return { ok: true, applied: { tempo: a.tempoId, focus: a.focusId } };
    }
    if (a.type === "clutch") {
      if (!a.shooterId) return { ok: false, reason: "no_shooter" };
      clutch = createClutchController({ sim });
      const opened = clutch.openDecision();
      if (!opened.ok) return { ok: false, reason: opened.reason };
      const picked = clutch.select(a.shooterId, a.actionHint);
      if (!picked.ok) return { ok: false, reason: picked.reason };
      const submitted = clutch.submit();
      if (!submitted.ok) return { ok: false, reason: submitted.reason };
      state = "clutch_pending";
      return { ok: true, applied: { clutch: { shooterId: a.shooterId, actionHint: a.actionHint, attemptId: submitted.attemptId } } };
    }
    return { ok: false, reason: "unknown_action" };
  }

  function checkTriggers() {
    if (!sim?.running || sim.ended) return null;
    const l = live();
    const deficit = margin(l.score);
    if (!lateFired && l.clock <= LATE_CLOCK && deficit >= 1 && deficit <= LATE_DEFICIT_MAX) {
      lateFired = true;
      return "late";
    }
    if (!runFired) {
      const swing = margin(l.score) - (lastDecisionMargin ?? margin(l.score));
      const star = starOf(sim.away);
      const starQ4 = star ? (star.stats?.pts ?? 0) - (starAtQ4?.pts ?? 0) : 0;
      if (swing >= RUN_SWING_TRIGGER || starQ4 >= STAR_Q4_TRIGGER) {
        runFired = true;
        return "opponent_run";
      }
    }
    return null;
  }

  function resumeBreak() {
    if (!sim?.paused) return;
    // Synchronous driver: a timeout / quarter break pauses the sim so the
    // app's UI can resume it. There is no UI loop here, so consume the
    // break by clearing the flags directly — never setPaused(false), which
    // re-arms the async _loop. The break's real effects (timeout count,
    // fatigue recovery, run break) already happened inside callTimeout.
    // Found the hard way: the opponent AI calls a timeout mid-Q4 and an
    // uncleared pause makes every later step() a no-op (the possession
    // aborts at sim.js `_resolvePossession`'s `if (this.paused) return`).
    sim.paused = false;
    sim.breakReason = null;
    if (sim._pendingQuarterStart) sim._pendingQuarterStart = false;
  }

  function stepOnce() {
    resumeBreak();
    const clockBefore = sim?.clock ?? 0;
    const tacticBefore = live().tactic;
    sim.step();
    resumeBreak();
    // A step that hit a timeout break resolves no possession (the engine
    // aborts before the ball is played) — only count real possessions.
    if ((sim?.clock ?? 0) >= clockBefore) return;
    possessionCount += 1;
    if (tacticBefore) possessionsByTactic[tacticBefore] = (possessionsByTactic[tacticBefore] || 0) + 1;
    if (promisesWindow && possessionCount - promisesWindow.startPossession >= (promisesWindow.duePossessions || 6)) {
      settleOpenPromises();
    }
    if (sim.clutchLog?.length && clutch && clutchOutcome === null) {
      clutchOutcome = explainClutchOutcome(sim.clutchLog[0], {});
      if (state === "clutch_pending") state = "playing";
    }
  }

  function buildReport() {
    const final = sim ? { ...sim.score } : { home: 0, away: 0 };
    const won = final.home > final.away;
    const rows = decisions.map((d, i) => {
      const next = decisions[i + 1];
      const endScore = next ? next.score : final;
      return {
        ...d,
        scoreAfter: { ...endScore },
        swing: (endScore.home - endScore.away) - (d.score.home - d.score.away),
        oppPointsAfter: endScore.away - d.score.away,
        youPointsAfter: endScore.home - d.score.home,
      };
    });
    // Settle anything still open against the full game.
    if (promisesWindow) settleOpenPromises();
    const counts = promiseCounts(tactical);
    const usedSystems = Object.keys(possessionsByTactic);
    let nextTactical = tactical;
    for (const id of usedSystems) {
      nextTactical = recordSystemRun(nextTactical, id, { opponentKey: OPPONENT_KEY, possessions: possessionsByTactic[id], won });
    }
    tactical = nextTactical;
    const r = readouts();
    return {
      final,
      won,
      deficitStart: margin(COACH_COMEBACK_SCENARIO.score),
      deficitEnd: margin(final),
      decisions: rows,
      clutchOutcome,
      promises: counts,
      careerEffect: challengeCareerEffect({ won, goalAchieved: won }),
      tactical: {
        familiarity: Object.fromEntries(usedSystems.map((id) => [id, familiarityOf(tactical, id)])),
        buyIn: r.buyIn,
        opponentReadiness: Object.fromEntries(usedSystems.map((id) => [id, opponentReadinessOf(tactical, id, OPPONENT_KEY)])),
        possessionsByTactic: { ...possessionsByTactic },
      },
      events: events.slice(-120),
    };
  }

  return {
    get state() {
      return state;
    },
    get moment() {
      return moment;
    },
    get decisions() {
      return decisions.map((d) => ({ ...d }));
    },
    get tacticalState() {
      return tactical;
    },

    /** Build the Q4 scenario and present the opening moment. */
    start() {
      if (state !== "idle") return { ok: false, reason: "wrong_state", state };
      const { home, away } = buildClutchTeams(pool, COACH_COMEBACK_SCENARIO);
      home.coach = { ...COACH };
      const scenario = { ...COACH_COMEBACK_SCENARIO, home, away };
      sim = startClutchSim(scenario, { rng, onEvent, onTick: () => {}, onEnd: () => {} });
      takeover = createTacticalTakeover({ sim });
      const star = starOf(sim.away);
      starAtQ4 = star ? { id: star.id, name: star.name, pts: star.stats?.pts ?? 0 } : null;
      lastDecisionMargin = margin(sim.score);
      state = "moment";
      moment = buildMoment("opening");
      return { ok: true, moment };
    },

    /** Apply one choice of the current moment through the real sim APIs. */
    choose(choiceId) {
      if (state !== "moment" || !moment) return { ok: false, reason: "wrong_state", state };
      const choice = moment.choices.find((c) => c.id === choiceId);
      if (!choice) return { ok: false, reason: "invalid" };
      if (choice.disabled) return { ok: false, reason: "disabled" };
      const applied = applyAction(choice);
      if (!applied.ok) return { ok: false, reason: applied.reason };
      if (choice.promise) {
        tactical = recordPromise(tactical, {
          id: `promise-${decisions.length + 1}`,
          text: choice.promise.text,
          kind: choice.promise.kind,
          targetId: choice.promise.targetId || null,
          threshold: choice.promise.threshold,
          duePossessions: choice.promise.duePossessions,
        });
        const star = choice.promise.targetId ? sim?.you?.()?.onCourt?.find((p) => p.id === choice.promise.targetId) : null;
        promisesWindow = {
          startPossession: possessionCount,
          duePossessions: choice.promise.duePossessions,
          starId: choice.promise.targetId,
          starFga: star ? (star.stats?.fga ?? 0) : 0,
          awayScore: sim?.score?.away ?? 0,
          margin: margin(sim?.score),
        };
      }
      recordDecision(moment.id, choice, applied.applied);
      moment = null;
      if (state === "clutch_pending") return { ok: true, clutchPending: true };
      state = "playing";
      return { ok: true };
    },

    /**
     * Step the sim until the next moment fires, the game ends, or the chunk
     * runs out. Returns { status: "moment" | "ended" | "paused", ... }.
     */
    playChunk(maxPossessions = 8) {
      if (state !== "playing" && state !== "clutch_pending") return { ok: false, reason: "wrong_state", state };
      let stepped = 0;
      while (stepped < maxPossessions && sim?.running && !sim.ended) {
        stepOnce();
        stepped += 1;
        if (state === "clutch_pending" && clutchOutcome !== null) {
          // The armed clutch settled; keep playing — the next moment may fire.
        }
        const trigger = checkTriggers();
        if (trigger) {
          state = "moment";
          moment = buildMoment(trigger);
          return { ok: true, status: "moment", moment, stepped };
        }
        if (!sim.running || sim.ended) break;
      }
      if (!sim.running || sim.ended) {
        return this.finish();
      }
      return { ok: true, status: "paused", stepped, snapshot: live() };
    },

    /** Play the rest of the game out and build the decision-effect report. */
    finish() {
      if (state === "ended") return { ok: true, status: "ended", report: buildReport() };
      if (!sim) return { ok: false, reason: "not_started" };
      if (sim.running && !sim.ended) sim.runFast();
      state = "ended";
      return { ok: true, status: "ended", report: buildReport() };
    },

    /** Timeout any time (real callTimeout; 7 per side, run-break is the engine's). */
    callTimeout() {
      if (!sim || sim.ended) return { ok: false, reason: "game_over" };
      const ok = sim.callTimeout("home", { pause: false });
      return ok ? { ok: true, timeoutsLeft: sim.timeouts.home } : { ok: false, reason: "no_timeout" };
    },

    /** Live panel: focus / tempo / shout / talk / substitute, all logged. */
    setFocus(focusId) {
      if (!sim || sim.ended) return { ok: false, reason: "game_over" };
      return takeover.setFocus(focusId);
    },
    setTempo(tempoId) {
      if (!sim || sim.ended) return { ok: false, reason: "game_over" };
      return takeover.setTempo(tempoId);
    },
    shout() {
      if (!sim || sim.ended) return { ok: false, reason: "game_over" };
      sim.shout();
      return { ok: true };
    },
    talk() {
      if (!sim || sim.ended) return { ok: false, reason: "game_over" };
      sim.talk();
      return { ok: true };
    },
    substitute(outId, inId) {
      if (!sim || sim.ended) return { ok: false, reason: "game_over" };
      return sim.substitute(outId, inId) ? { ok: true } : { ok: false, reason: "invalid" };
    },

    /** Live scoreboard + meters, for the view. */
    snapshot() {
      return { ...live(), ...readouts(), state, events: events.slice(-8) };
    },

    /** Live panel state (rosters, focus, tempo, timeouts) for the view. */
    panel() {
      const y = you();
      const slim = (p) => ({ id: p.id, name: p.name, pos: p.playPos || p.pos, ovr: p.ovr || 0, fatigue: Math.round(p.fatigue || 0) });
      return {
        onCourt: (y?.onCourt || []).map(slim),
        bench: (y?.bench || []).filter((p) => !(p.injuredGames > 0)).map(slim),
        focus: sim?.focusPlay?.id || null,
        tempo: y?.gameplan?.tempo || "normal",
        timeouts: sim?.timeouts?.home ?? 0,
        tactic: y?.tactic?.id || null,
        fit: y?.fit ?? 50,
        morale: y?.morale ?? 50,
      };
    },

    /** The stable decision-interface shape, for the view and for workstream G. */
    momentShape() {
      return {
        moment: "id, kind, title {zh,en}, analysis {zh,en}, choices[], state {clock, score, fit, morale, buyIn}, recommendation? {choiceId, reason, source}",
        choice: "id, label {zh,en}, preview {zh,en}, downside {zh,en}, action {type, ...}, promise? {kind, targetId, threshold, duePossessions, text}, disabled?, disabledReason?",
        actions: "tactic {tacticId} | timeout_talk | double {targetId} | focus {focusId} | tempo_focus {tempoId, focusId} | clutch {shooterId, actionHint}",
      };
    },

    /** Test/measure hook: the live sim (read-only use in tests). */
    _sim() {
      return sim;
    },
  };
}

export { pickLang };
