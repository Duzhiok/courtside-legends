import { TACTICS, coachTactics, composeStaff, isQualityPasser } from "../data/coaches.js";
import { overall } from "../data/players.js";
import { lineupFit, personalityOnPlay, teamChemistry } from "./chemistry.js";
import { applyLineupPositionEffects, inGameInjuryChance, systemFitScore } from "../data/intangibles.js";
import {
  activeDuoIds,
  isJokerJamalTwoMan,
  skillBlockBonus,
  skillChargeChance,
  skillDefCaptainOpenPenalty,
  skillDefenderTovBonus,
  hasEliteStaminaSkill,
  skillFatigueMult,
  skillFoulRisk,
  skillKickMult,
  skillMakeBonus,
  skillOnBallWrapPressure,
  skillOpennessDelta,
  skillPassWeight,
  skillStealBonus,
  skillStealFeedLabel,
  skillReboundMult,
  skillTechChance,
  skillPassCareTov,
  skillTunnelVisionTov,
  skillDuoKickTargetMult,
  skillBlockResist,
  skillKickOpenBonus,
  applySkillAttributeBoosts,
  trySignatureBlock,
  trySignatureOffense,
  trySignatureSteal,
  signatureFeedFlavor,
  paintFinishFeedLabel,
} from "../data/skills.js";
import {
  aggressionLevel,
  ensurePlayerOrders,
  ensureRoles,
  fitMinuteBudget,
  FOCUS_PLAYS,
  getTempoDef,
  inferPlayerRole,
  isAllOutDefense,
  isHustleOffense,
  normalizeTempo,
  ORDER_ACTION,
  roleMinutesMoraleDelta,
  shotOpenThreshold,
  usageForBallAction,
} from "./gameplan.js";
import {
  confidenceLabel,
  formConfidence,
  formKickPassMult,
  formKickTargetMult,
  formMakeBonus,
  formShotBoldMult,
  formSpacingBonus,
  formTactical,
  formUsageMult,
  tacticalLabel,
} from "./form.js";
import {
  ensureGrade,
  gradeAssist,
  gradeBlock,
  gradeDreb,
  gradeFoul,
  gradeFtMake,
  gradeFtMiss,
  gradeGoodContest,
  gradeHockeyAssist,
  gradeLetter,
  gradeMake,
  gradeMiss,
  gradeOreb,
  gradeScreen,
  gradeScoredOn,
  gradeSteal,
  gradeTov,
  gradeTone,
  pickScreener,
} from "./grade.js";

const QUARTER_SEC = 12 * 60;

/**
 * Possession-based NBA sim with full box-score stats.
 * Open look ≠ automatic make. Coach actions apply temporary modifiers.
 */
export class GameSim {
  constructor({
    home,
    away,
    youSide = "home",
    onEvent,
    onTick,
    onEnd,
    injuries = false,
    speed = 1,
  }) {
    this.home = wrapTeam(home, "home");
    this.away = wrapTeam(away, "away");
    assignFeedDisplayNames(this.home, this.away);
    this.youSide = youSide;
    this.onEvent = onEvent || (() => {});
    this.onTick = onTick || (() => {});
    this.onEnd = onEnd || (() => {});
    /** Enable in-game injury events (晋级 / 淘汰赛). */
    this.injuriesEnabled = !!injuries;

    this.quarter = 1;
    this.clock = QUARTER_SEC;
    /** Cumulative game seconds elapsed (all quarters) — drives bench fatigue recovery. */
    this.elapsedSec = 0;
    this.score = { home: 0, away: 0 };
    this.possession = Math.random() < 0.5 ? "home" : "away";
    this.running = false;
    this.paused = false;
    /** null | 'timeout' | 'quarter' | 'half' | 'manual' — why the clock is stopped */
    this.breakReason = null;
    this._pendingQuarterStart = false;
    this.speed = clamp(Number(speed) || 1, 1, 3);
    this._timer = null;
    this._lastPossessionSec = 14;
    this.timeouts = { home: 7, away: 7 };
    /** Your defensive focus: { scheme: 'focus'|'double'|'bump'|null, targetId, defenderId? } */
    this.defensePlan = { scheme: null, targetId: null, defenderId: null };
    /** Scoring run momentum: { side, points, possessions } */
    this.momentum = { side: null, points: 0, streak: 0 };
    /** Timeout possession focus: { id, ttl, label } */
    this.focusPlay = null;
    /** Primary offensive option player id (persists until cleared). */
    this.offenseFocusId = null;
    /** FIFA-style smart manager: auto sub / timeout / basic tactics for your side. */
    this.managed = false;
    this._manageCd = 0;
    this._manageLastTo = -999;
    // Apply your side's pre-game matchup gameplan only
    const youSrc = youSide === "home" ? home : away;
    if (youSrc.gameplan?.matchup) {
      this.defensePlan = {
        scheme: youSrc.gameplan.matchup.scheme || "focus",
        targetId: youSrc.gameplan.matchup.targetId || null,
        defenderId: youSrc.gameplan.matchup.defenderId || null,
        assignments: { ...(youSrc.gameplan.matchup.assignments || {}) },
      };
    }
    if (youSrc.gameplan?.matchupAssignments && !this.defensePlan.assignments) {
      this.defensePlan.assignments = { ...youSrc.gameplan.matchupAssignments };
    } else if (youSrc.gameplan?.matchupAssignments) {
      this.defensePlan.assignments = {
        ...youSrc.gameplan.matchupAssignments,
        ...(this.defensePlan.assignments || {}),
      };
    }
    if (youSrc.gameplan?.offenseFocusId) this.offenseFocusId = youSrc.gameplan.offenseFocusId;
  }

  /**
   * Snapshot mutable sim state for localStorage (no timers / callbacks).
   * Restore via GameSim.fromSave(...).
   */
  exportState() {
    const clone = (x) => JSON.parse(JSON.stringify(x));
    return {
      home: clone(this.home),
      away: clone(this.away),
      youSide: this.youSide,
      injuriesEnabled: !!this.injuriesEnabled,
      quarter: this.quarter,
      clock: this.clock,
      elapsedSec: this.elapsedSec || 0,
      score: { ...this.score },
      possession: this.possession,
      paused: true,
      breakReason: this.breakReason || "manual",
      _pendingQuarterStart: !!this._pendingQuarterStart,
      speed: this.speed,
      timeouts: { ...this.timeouts },
      defensePlan: this.defensePlan
        ? {
            ...this.defensePlan,
            assignments: { ...(this.defensePlan.assignments || {}) },
          }
        : { scheme: null, targetId: null, defenderId: null, assignments: {} },
      momentum: this.momentum ? { ...this.momentum } : { side: null, points: 0, streak: 0 },
      focusPlay: this.focusPlay ? { ...this.focusPlay } : null,
      offenseFocusId: this.offenseFocusId || null,
      managed: !!this.managed,
      _manageCd: this._manageCd || 0,
      _manageLastTo: this._manageLastTo ?? -999,
    };
  }

  /** Rebuild a GameSim from exportState() output. */
  static fromSave(data, { onEvent, onTick, onEnd } = {}) {
    if (!data?.home || !data?.away) throw new Error("invalid sim save");
    const stub = {
      name: data.home.name || "主队",
      players: (data.home.roster || []).map((p) => ({ ...p, stats: undefined })),
      coach: data.home.coach,
      assistant: data.home.assistant,
    };
    const stubAway = {
      name: data.away.name || "客队",
      players: (data.away.roster || []).map((p) => ({ ...p, stats: undefined })),
      coach: data.away.coach,
      assistant: data.away.assistant,
    };
    const sim = new GameSim({
      home: stub,
      away: stubAway,
      youSide: data.youSide || "home",
      injuries: !!data.injuriesEnabled,
      speed: data.speed || 1,
      onEvent,
      onTick,
      onEnd,
    });
    // Overwrite wrapped teams with the exact mid-game state
    sim.home = data.home;
    sim.away = data.away;
    assignFeedDisplayNames(sim.home, sim.away);
    sim.quarter = data.quarter || 1;
    sim.clock = data.clock ?? QUARTER_SEC;
    sim.elapsedSec = data.elapsedSec || 0;
    sim.score = data.score || { home: 0, away: 0 };
    sim.possession = data.possession || "home";
    sim.running = false;
    sim.paused = true;
    sim.breakReason = data.breakReason || "manual";
    sim._pendingQuarterStart = !!data._pendingQuarterStart;
    sim.speed = clamp(Number(data.speed) || 1, 1, 3);
    sim.timeouts = data.timeouts || { home: 7, away: 7 };
    sim.defensePlan = data.defensePlan || { scheme: null, targetId: null };
    sim.momentum = data.momentum || { side: null, points: 0, streak: 0 };
    sim.focusPlay = data.focusPlay || null;
    sim.offenseFocusId = data.offenseFocusId || null;
    sim.managed = !!data.managed;
    sim._manageCd = data._manageCd || 0;
    sim._manageLastTo = data._manageLastTo ?? -999;
    sim.injuriesEnabled = !!data.injuriesEnabled;
    sim._timer = null;
    sim._quiet = false;
    return sim;
  }

  /**
   * 指定持球发起人 + 可选持球打法（死球）。必须在场上。
   * @param {string|null} playerId
   * @param {{ action?: string }} [opts]
   */
  setOffenseFocus(playerId, opts = {}) {
    const t = this.you();
    if (!playerId) {
      this.offenseFocusId = null;
      if (t.gameplan) t.gameplan.offenseFocusId = null;
      this.emit("coach", "取消指定持球人——球权按本能分配");
      t.chem = teamChemistry(t.onCourt, { primaryId: null });
      t.fit = lineupFit(t.onCourt, t.coach, t.tactic, { primaryId: null });
      return false;
    }
    const p = t.onCourt.find((x) => x.id === playerId);
    if (!p) {
      this.emit("coach", "持球人必须是当前场上球员");
      return false;
    }
    this.offenseFocusId = p.id;
    if (!t.gameplan) t.gameplan = {};
    t.gameplan.offenseFocusId = p.id;
    ensurePlayerOrders([p]);
    const action = opts.action || null;
    if (action && action !== "auto") {
      p.orders.action = action;
      const u = usageForBallAction(action);
      if (u && (p.orders.usage === "auto" || opts.forceUsage)) p.orders.usage = u;
    }
    const styleName = ORDER_ACTION.find((a) => a.id === (p.orders?.action || ""))?.name;
    this.emit("coach", `持球发起：${p.name}${styleName ? ` · ${styleName}` : ""}`);
    t.chem = teamChemistry(t.onCourt, { primaryId: p.id });
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic, { primaryId: p.id });
    return true;
  }

  /** Update one player's coach orders (usage / attack / action / hunt / def). */
  setPlayerOrders(playerId, patch = {}) {
    const t = this.you();
    const p = t.roster.find((x) => x.id === playerId);
    if (!p) return false;
    ensurePlayerOrders([p]);
    p.orders = { ...p.orders, ...patch };
    const ballOpts = this.ballOpts(t);
    t.chem = teamChemistry(t.onCourt, ballOpts);
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic, ballOpts);
    const bits = Object.entries(patch)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    this.emit("coach", `指令 ${p.name}：${bits || "已更新"}`);
    this.refreshMeters();
    return true;
  }

  /** 指定持球人 id（仅我方；对手暂无教练指定）. */
  ballOpts(t) {
    const id = t === this.you() ? this.offenseFocusId || t.gameplan?.offenseFocusId : null;
    return { primaryId: id || null };
  }

  you() {
    return this.youSide === "home" ? this.home : this.away;
  }

  opp() {
    return this.youSide === "home" ? this.away : this.home;
  }

  sideByKey(side) {
    return side === "away" ? this.away : this.home;
  }

  start() {
    this.running = true;
    this.paused = false;
    this._loop();
  }

  setPaused(v, reason = null) {
    const wasPaused = this.paused;
    this.paused = !!v;
    if (!this.paused) {
      if (wasPaused && this._pendingQuarterStart) {
        this._pendingQuarterStart = false;
        this.emit(
          "coach",
          `第 ${this.quarter > 4 ? "加时" : this.quarter} 节开始`
        );
      }
      this.breakReason = null;
      // Always re-arm the loop on resume — even if a prior step threw
      // or start() never completed after a UI error.
      this.running = true;
      this._loop();
    } else {
      if (reason) this.breakReason = reason;
      clearTimeout(this._timer);
      this._timer = null;
      // 托管只自动处理节间/中场；玩家或对方叫的暂停必须停住，否则关不了托管也喊不停
      const autoBreak =
        this.managed && !this._quiet && (reason === "quarter" || reason === "half");
      if (autoBreak) {
        try {
          this.runManagedBreak(reason);
        } catch (err) {
          console.error("[managed] break", err);
        }
        this.paused = false;
        this.breakReason = null;
        if (this._pendingQuarterStart) {
          this._pendingQuarterStart = false;
          this.emit(
            "coach",
            `第 ${this.quarter > 4 ? "加时" : this.quarter} 节开始`
          );
        }
        this.running = true;
        if (!this._quiet) {
          try {
            this.onTick(this.snapshot());
          } catch (_) {
            /* ignore */
          }
        }
        this._loop();
        return;
      }
      // Let UI lock/unlock coach actions immediately
      if (!this._quiet) {
        try {
          this.onTick(this.snapshot());
        } catch (_) {
          /* ignore */
        }
      }
    }
  }

  /** Toggle FIFA-style autopilot for your sideline. */
  setManaged(on) {
    const next = !!on;
    this.managed = next;
    this._manageCd = 0;
    this.emit(
      "coach",
      next
        ? "智能托管已开启——累了自动换人；节间/中场自动处理。你仍可随时叫暂停接手。"
        : "智能托管已关闭——你重新接管指挥"
    );
    // 开启且正停在节间/中场 → 助手代劳后继续；玩家暂停不自动跳过
    if (
      next &&
      this.paused &&
      (this.breakReason === "quarter" || this.breakReason === "half")
    ) {
      try {
        this.runManagedBreak(this.breakReason);
      } catch (_) {
        /* ignore */
      }
      this.setPaused(false);
    }
    if (!this._quiet) {
      try {
        this.onTick(this.snapshot());
      } catch (_) {
        /* ignore */
      }
    }
    return this.managed;
  }

  setSpeed(n) {
    this.speed = clamp(Number(n) || 1, 1, 3);
  }

  /** 1x ≈ watchable real pace; 3x ≈ legacy fastest. */
  possessionDelay() {
    const used = this._lastPossessionSec || 14;
    if (this.speed >= 3) return 85; // previous max fast
    if (this.speed === 2) return 300;
    // Real-ish: wall time tracks game-clock burn (~0.12–0.16s wall per game-sec)
    return clamp(Math.round(used * 150), 1100, 3600);
  }

  stop() {
    this.running = false;
    this.paused = false;
    clearTimeout(this._timer);
    this._timer = null;
  }

  _loop() {
    clearTimeout(this._timer);
    this._timer = null;
    if (!this.running || this.paused) return;
    try {
      this.step();
    } catch (err) {
      console.error("[sim] step failed", err);
      try {
        this.emit("coach", "回合结算异常，已跳过并继续");
      } catch (_) {
        /* ignore */
      }
      // Advance clock slightly so a hard-fail possession cannot soft-lock tip-off
      this.clock = Math.max(0, this.clock - 8);
    }
    if (!this.running || this.paused) return;
    const delay = this.possessionDelay();
    this._timer = setTimeout(() => this._loop(), delay);
  }

  step() {
    if (this.quarter > 4 && this.score.home !== this.score.away) {
      this.finish();
      return;
    }
    if (this.clock <= 0) {
      this.nextQuarter();
      if (!this._quiet) this.onTick(this.snapshot());
      return;
    }

    this.decayMods();
    this.refreshMeters();
    this.resolvePossession();
    if (!this._quiet) this.onTick(this.snapshot());
  }

  nextQuarter() {
    if (this.quarter >= 4 && this.score.home !== this.score.away) {
      this.finish();
      return;
    }
    const leaving = this.quarter;
    this.quarter += 1;
    this.clock = this.quarter > 4 ? 5 * 60 : QUARTER_SEC;
    this.possession = this.quarter % 2 === 1 ? "home" : "away";
    const isHalf = leaving === 2; // Q2 → Q3 中场休息
    for (const side of [this.home, this.away]) {
      recoverFatigue(side, isHalf ? "half" : "quarter");
      this.forceOutInjured(side);
      if (side.coach?.style?.includes("防守") || side.coach?.id?.includes("thibs")) {
        for (const p of side.onCourt) p.fatigue = Math.min(100, p.fatigue + 2);
      }
      // CPU / instant-sim: rotate both sides between periods
      if (this._quiet || side !== this.you()) {
        this.cpuAutoSub(side, { aggressive: isHalf });
        if (this._quiet) this.autoRotateByMinutes(side, isHalf);
      }
    }
    if (this._quiet) {
      if (isHalf) this.emit("coach", "中场休息——恢复 50 点疲劳");
      this.emit("coach", `第 ${this.quarter > 4 ? "加时" : this.quarter} 节开始`);
      return;
    }
    // Real game: stop the clock so both sides can adjust (like NBA intermission)
    this._pendingQuarterStart = true;
    // Role / minutes morale check
    this.applyRoleMorale(leaving);
    // Auto rotation by target minutes (both sides)
    for (const side of [this.home, this.away]) this.autoRotateByMinutes(side, isHalf);

    if (isHalf) {
      this.emit("coach", "中场休息——恢复 50 点疲劳。可调整战术、沟通、换人与站位");
      this.setPaused(true, "half");
    } else {
      this.emit(
        "coach",
        `第${leaving}节结束，节间休息——恢复 25 点疲劳。可调整战术、沟通、换人与站位`
      );
      this.setPaused(true, "quarter");
    }
  }

  resolvePossession() {
    // Injured bodies cannot stay on the floor if a healthy bench exists
    this.forceOutInjured(this.home);
    this.forceOutInjured(this.away);
    // Opponent coach AI (timeouts pause the game so you can also adjust)
    this.maybeCpuManage();
    // Your smart manager (FIFA-style) — may sub / timeout / tweak schemes
    this.maybeManagedCoach();
    // Instant-sim: enforce minute budgets every few possessions (not only at quarter breaks)
    if (this._quiet) {
      this._rotCd = (this._rotCd || 0) - 1;
      if (this._rotCd <= 0) {
        const late = this.quarter >= 4;
        this.autoRotateByMinutes(this.home, late);
        this.autoRotateByMinutes(this.away, late);
        this._rotCd = late ? 2 : 4;
      }
    }
    if (this.paused) return;

    const off = this.possession === "home" ? this.home : this.away;
    const def = this.possession === "home" ? this.away : this.home;
    if (!off.onCourt?.length || !def.onCourt?.length) {
      this.emit("coach", "场上人数不足，跳过回合");
      this.clock = Math.max(0, this.clock - 10);
      this.possession = flip(this.possession);
      return;
    }
    // 终场：落后方抢攻 / 需要三分；领先方持球时落后方战术犯规抢时间
    if (applyLateGameScripts(this, off, def)) return;

    const chase = off.temp?.lateChase || null;
    let focus = off === this.you() ? this.focusPlay : null;
    let offenseFocusId = off === this.you() ? this.offenseFocusId : null;
    if (chase?.shooterId) {
      offenseFocusId = chase.shooterId;
      if (chase.needThree) {
        focus = { id: "pace_three", label: "终场抢攻三分", ttl: 99 };
      }
    }
    const plan = this.you() === def ? this.defensePlan : null;
    // 冲板二次：进攻篮板后优先给抢板人补篮
    let putbackId = null;
    if (off.temp?.crashPutbackId && (off.temp.crashPutbackTtl || 0) > 0) {
      const crashMan = off.onCourt.find((p) => p.id === off.temp.crashPutbackId);
      if (crashMan) {
        putbackId = crashMan.id;
        off.temp.crashPutbackTtl = 0;
        off.temp.crashPutbackId = null;
      }
    }
    let baller = putbackId
      ? off.onCourt.find((p) => p.id === putbackId) || pickBallHandler(off, focus, offenseFocusId)
      : pickBallHandler(off, focus, offenseFocusId);
    let kickedOut = false;
    let organizerId = null;
    // 终场需要三分：高概率直接把球给最稳射手
    if (!putbackId && chase?.needThree && chase.shooterId) {
      const sh = off.onCourt.find((p) => p.id === chase.shooterId);
      if (sh && Math.random() < 0.78) {
        if (baller && baller.id !== sh.id && (baller.pass || 50) >= 55) {
          organizerId = baller.id;
          kickedOut = true;
        }
        baller = sh;
      }
    }
    const initAction = baller?.orders?.action || "auto";
    const ballAgg = aggressionLevel(baller);
    const doubled =
      !!baller && plan?.scheme === "double" && plan?.targetId === baller.id;
    // 挡拆 / 突破分球 / 组织：常分给弱侧射手或顺下点
    // 低攻击欲 / 专注防守：即使不是组织者也会优先先传导
    // 冲板二次补篮：不先分球
    let schemeKick =
      !putbackId &&
      !(chase?.needThree && baller?.id === chase.shooterId) &&
      baller &&
      (baller.orders?.usage === "organize" ||
        initAction === "drive_kick" ||
        initAction === "pnr" ||
        ballAgg <= 0.35 ||
        (chase?.needThree && baller.id !== chase.shooterId));
    let kickChance = clamp(0.3 + (baller?.pass || 50) * 0.004, 0.28, 0.65);
    if (chase?.needThree && baller && baller.id !== chase.shooterId) {
      kickChance = clamp(kickChance + 0.35, 0.55, 0.92);
    }
    if (initAction === "drive_kick") kickChance = clamp(kickChance + 0.14, 0.35, 0.78);
    if (initAction === "pnr") kickChance = clamp(kickChance + 0.1, 0.32, 0.72);
    if (ballAgg <= 0.35) kickChance = clamp(kickChance + 0.22 + (0.35 - ballAgg) * 0.9, 0.48, 0.94);
    else if (ballAgg >= 0.85) kickChance = clamp(kickChance * 0.55, 0.12, 0.45);
    // 独狼：少传球；被包夹时几乎不看队友
    kickChance *= skillKickMult(baller, { doubled });
    // Passers in form + hot scorers on floor → more willing to feed
    if (baller) {
      kickChance *= formKickPassMult(baller);
      const hotScorer = (off.onCourt || []).some(
        (p) => p.id !== baller.id && formConfidence(p) >= 64 && formTactical(p) >= 60
      );
      if (hotScorer) kickChance = clamp(kickChance + 0.08, 0.28, 0.82);
      // 弹跳型内线 + 好传球手：更常分球打空间（空接/短滚/弱侧）
      const springyMate = (off.onCourt || []).find(
        (p) => p.id !== baller.id && isSpringySpacer(p)
      );
      if (springyMate && isQualityPasser(baller)) {
        kickChance = clamp(kickChance + 0.1 + springAthleteScore(springyMate) * 0.0012, 0.32, 0.86);
        schemeKick = true;
      }
    }
    if (schemeKick && Math.random() < kickChance) {
      const organizer = baller;
      const kicked = kickToTeammate(off, baller, offenseFocusId, initAction);
      if (kicked) {
        organizerId = organizer.id;
        if (ballAgg <= 0.35) {
          this.emit("coach", `${organizer.name} 攻击欲低，先传导给 ${kicked.name}`);
        }
        baller = kicked;
        kickedOut = true;
      }
    } else if (doubled && baller && (baller.skills || []).includes("lone_wolf") && Math.random() < 0.35) {
      this.emit("coach", `${baller.name}「独狼」硬解包夹，没分给空位队友`);
    }
    // Strong side = ball side; weak side = help/kick-out side (2K spacing)
    const weakSide = kickedOut ? Math.random() < 0.72 : Math.random() < 0.28;
    const scheme =
      initAction === "pnr" || initAction === "drive_kick"
        ? initAction
        : kickedOut && baller?.orders?.usage === "organize"
          ? "drive_kick"
          : null;
    const sideCtx = {
      weakSide,
      kickedOut,
      scheme,
      organizerId,
      putback: !!putbackId,
      lateChase: !!chase,
      lateChaseNeedThree: !!chase?.needThree,
    };
    // Shout focus: burn one possession of "execute the tactic" attention
    for (const p of off.onCourt) {
      if ((p.tempTacticFocus || 0) > 0) p.tempTacticFocus -= 1;
    }
    let defender = pickDefender(def, baller, plan);
    if (!baller || !defender) {
      this.clock = Math.max(0, this.clock - 8);
      this.possession = flip(this.possession);
      return;
    }
    if (putbackId) {
      this.emit("coach", `${baller.name} 二次进攻补篮机会`);
    }

    let pace = off.tactic.pace * (1 + (off.temp.pace || 0));
    // 你方持久节奏拨档（领先降速 / 落后提速）
    const tempo = off === this.you() ? getTempoDef(off.gameplan?.tempo) : null;
    if (tempo?.paceMult && tempo.paceMult !== 1) pace *= tempo.paceMult;
    // 回合重点：提速三分 / 拖慢节奏
    if (focus?.id === "pace_three") pace *= 1.22;
    else if (focus?.id === "slow_pace") pace *= 0.68;
    // 终场落后：强制抢攻（短回合）
    if (chase?.paceBoost) pace *= 1.38;
    let usedHi = chase?.paceBoost ? 11 : focus?.id === "slow_pace" ? 28 : 24;
    let usedLo = chase?.paceBoost ? 4 : focus?.id === "slow_pace" ? 12 : 6;
    if (!chase?.paceBoost && tempo && focus?.id !== "slow_pace" && focus?.id !== "pace_three") {
      usedLo = tempo.usedLo ?? usedLo;
      usedHi = tempo.usedHi ?? usedHi;
    } else if (!chase?.paceBoost && tempo) {
      // 与回合重点并存时略拉一把上下限
      usedLo = Math.round((usedLo + (tempo.usedLo ?? usedLo)) / 2);
      usedHi = Math.round((usedHi + (tempo.usedHi ?? usedHi)) / 2);
    }
    const used = clamp(rand(8, 20) / Math.max(0.45, pace), usedLo, usedHi);
    this._lastPossessionSec = used;
    this.clock = Math.max(0, this.clock - used);
    this.elapsedSec = (this.elapsedSec || 0) + used;
    addMinutes(off, def, used);
    // Bench rests in real time while the clock runs — not when you spam subs
    tickBenchRecovery(this.home, used);
    tickBenchRecovery(this.away, used);
    if (this.injuriesEnabled) this.maybeInGameInjury(off, baller);

    const hunt = offenseHuntLevel(off.coach, baller);
    const defPress = defensePressLevel(def.coach);
    const offShare = lineupOffenseShare(off.onCourt);
    const fatOpts = (extra = {}) => ({
      hunt,
      defPress,
      offShare,
      organizerId: sideCtx.organizerId || null,
      scheme: sideCtx.scheme || null,
      // 降速时无球/纯传球几乎不耗；提速时折返略累一点
      tempoId: off === this.you() ? off.gameplan?.tempo || "normal" : "normal",
      slowFocus: focus?.id === "slow_pace",
      pushFocus: focus?.id === "pace_three",
      ...extra,
    });

    // Hothead tech — can fire before the play develops (Cousins / Metta)
    if (maybeTechnicalFoul(this, off, def, baller, defender)) return;

    // 对位缠绕：开打即榨持球人体能（死亡缠绕最狠）；偶发战报让防守技可见
    const wrapPress = skillOnBallWrapPressure(baller, defender);
    if (wrapPress.label) {
      this.emit(
        "coach",
        `${defender.name}「${wrapPress.label}」贴死 ${baller.name}——体能被大量消耗`
      );
    }

    // Charge / offensive foul drawn by Battier-type
    const chargeP = skillChargeChance(defender) * (1 + defPress * 0.4);
    if (chargeP > 0 && Math.random() < chargeP) {
      baller.stats.tov += 1;
      baller.stats.pf += 1;
      gradeTov(baller);
      gradeFoul(baller);
      gradeGoodContest(defender, { open: 0.2 });
      this.emit("miss", `${defender.name} 造进攻犯规！${baller.name} 撞人`);
      applyPossessionFatigue(off, def, baller, defender, fatOpts({ wasted: true }));
      this.possession = flip(this.possession);
      return;
    }

    // Steal / turnover package — high D press forces more turnovers; high hunt by weak handlers also TOVs
    const defOrder = defender.orders?.defFocus;
    const sigStl = trySignatureSteal(defender);
    if (sigStl) this.emit("coach", `${defender.name} 「${sigStl.name}」！`);
    const ballerGas = 1 - fatiguePerfMult(baller);
    const defGas = 1 - fatiguePerfMult(defender);
    const stlChance =
      0.04 +
      (defender.steal || 50) * 0.00055 +
      (100 - baller.pass) * 0.0005 +
      ballerGas * 0.05 -
      defGas * 0.028 -
      off.chem * 0.00025 +
      (def.tactic.defense - 1) * 0.03 +
      defPress * 0.028 +
      (defOrder === "deny" || defOrder === "onball" || defOrder === "smart" ? 0.018 : 0) +
      (defOrder === "allout" || isAllOutDefense(defender) ? 0.028 : 0) +
      skillStealBonus(defender, def.onCourt) +
      (sigStl?.stealBoost || 0);
    if (Math.random() < stlChance) {
      baller.stats.tov += 1;
      defender.stats.stl += 1;
      gradeTov(baller);
      gradeSteal(defender);
      const stlSkill = sigStl?.name || skillStealFeedLabel(defender);
      this.emit(
        "miss",
        stlSkill
          ? `${defender.name}「${stlSkill}」抢断 ${baller.name}！`
          : `${defender.name} 抢断 ${baller.name}！`
      );
      applyPossessionFatigue(off, def, baller, defender, fatOpts({ wasted: true }));
      this.possession = flip(this.possession);
      return;
    }

    // 低攻击欲不会「被迫乱砍」——宁可传球也不会被球队抓机会拖下水
    const forcedHunt =
      hunt >= 0.5 && playerOffenseSkill(baller) < 74 && aggressionLevel(baller) >= 0.45;
    const stillDoubled = plan?.scheme === "double" && plan?.targetId === baller.id;
    const wrapTov = skillDefenderTovBonus(defender);
    const tempoTov = off === this.you() ? getTempoDef(off.gameplan?.tempo)?.tovMult ?? 1 : 1;
    const tovChance = Math.max(
      0.012,
      (0.06 +
        (100 - baller.pass) * 0.0009 +
        (1 - fatiguePerfMult(baller)) * 0.06 -
        off.chem * 0.0003 -
        ((baller.intangibles?.composure || 50) - 50) * 0.00035 +
        (forcedHunt ? hunt * 0.035 : 0) +
        skillTunnelVisionTov(baller, { doubled: stillDoubled, open: 0.4 }) +
        skillPassCareTov(baller) +
        wrapTov) *
        tempoTov
    );
    if (Math.random() < tovChance) {
      baller.stats.tov += 1;
      gradeTov(baller);
      // loose-ball foul chance
      if (Math.random() < 0.12) {
        defender.stats.pf += 1;
        gradeFoul(defender);
        this.emit("miss", `${baller.name} 失误，${defender.name} 防守犯规`);
        applyPossessionFatigue(off, def, baller, defender, fatOpts({ wasted: forcedHunt }));
        shootFts(baller, off, this, 2);
        return;
      }
      const wrapForced =
        wrapTov >= 0.05 && Math.random() < 0.55
          ? `——被 ${defender.name}「死亡缠绕」逼出`
          : wrapTov > 0 && wrapPress.label && Math.random() < 0.4
            ? `——被 ${defender.name}「${wrapPress.label}」压出`
            : "";
      this.emit(
        "miss",
        forcedHunt
          ? `${baller.name} 强行抓机会失误${wrapForced}`
          : `${baller.name} 失误${wrapForced}`
      );
      applyPossessionFatigue(off, def, baller, defender, fatOpts({ wasted: forcedHunt }));
      this.possession = flip(this.possession);
      return;
    }

    // Shot + optional signature move (random proc — not every touch)
    let shot = chooseShot(baller, off, focus, sideCtx);
    let open = calcOpenness(baller, defender, off, def, plan, sideCtx);
    const tempoDef = off === this.you() ? getTempoDef(off.gameplan?.tempo) : null;
    if (tempoDef?.openBonus) open = clamp(open + tempoDef.openBonus, 0.08, 0.92);

    // 低攻击欲：机会不够好就再传导一次，而不是自主强投
    const aggNow = aggressionLevel(baller);
    const openNeed = shotOpenThreshold(baller);
    if (aggNow <= 0.4 && open < openNeed) {
      const passer = baller;
      const kicked2 = kickToTeammate(off, baller, offenseFocusId, sideCtx.scheme || initAction);
      if (kicked2 && kicked2.id !== baller.id) {
        if (!sideCtx.organizerId) sideCtx.organizerId = passer.id;
        sideCtx.kickedOut = true;
        if (!sideCtx.scheme) sideCtx.scheme = "drive_kick";
        this.emit(
          "coach",
          `${passer.name}${aggNow <= 0.12 ? " 专注防守" : " 欲望低"}，机会一般先传给 ${kicked2.name}`
        );
        baller = kicked2;
        defender = pickDefender(def, baller, plan);
        if (!defender) {
          this.possession = flip(this.possession);
          return;
        }
        shot = chooseShot(baller, off, focus, sideCtx);
        open = calcOpenness(baller, defender, off, def, plan, sideCtx);
        if (tempoDef?.openBonus) open = clamp(open + tempoDef.openBonus, 0.08, 0.92);
      }
    }

    let sigOff = null;
    baller._sigMakeBoost = 0;
    baller._sigLabel = null;
    // 脑后长眼：组织者分球后，接球人更空（被包夹时传背后队友更空）
    if (sideCtx.kickedOut && sideCtx.organizerId && sideCtx.organizerId !== baller.id) {
      const organizer = (off.onCourt || []).find((p) => p.id === sideCtx.organizerId);
      const kick = skillKickOpenBonus(organizer, { doubled });
      if (kick.bonus) {
        open = clamp(open + kick.bonus, 0.08, 0.95);
        if (Math.random() < 0.35) this.emit("coach", `${organizer.name} ${kick.label}，${baller.name} 空位接球`);
      }
    }
    // 低欲望几乎不主动发动招牌绝技；空接窗（被传球手喂到）例外
    const lobWindow =
      sideCtx?.kickedOut &&
      ((baller.skills || []).includes("lob_finisher") ||
        (baller.skills || []).includes("spring_board"));
    const fromPasser = !!(
      sideCtx?.organizerId &&
      (off.onCourt || []).some((x) => x.id === sideCtx.organizerId && isQualityPasser(x))
    );
    const sigOk =
      aggressionLevel(baller) >= 0.35 ||
      open >= shotOpenThreshold(baller) ||
      (lobWindow && fromPasser);
    sigOff = sigOk
      ? trySignatureOffense(baller, defender, {
          quarter: this.quarter,
          scoreDiff: this.score[off.side] - this.score[def.side],
          kickedOut: !!sideCtx?.kickedOut,
          scheme: sideCtx?.scheme || null,
          fromPasser,
        })
      : null;
    if (sigOff) {
      shot = sigOff.shot;
      open = clamp(open + (sigOff.openBoost || 0), 0.08, 0.95);
      baller._sigMakeBoost = sigOff.makeBoost || 0;
      const flav = signatureFeedFlavor(sigOff.id);
      baller._sigLabel = flav || sigOff.label;
      this.emit(
        "coach",
        flav
          ? `${baller.name} 发动「${sigOff.name}」——${flav}！`
          : `${baller.name} 发动「${sigOff.name}」！`
      );
    }

    // Block attempt — size/position matter (PG almost never rejects Howard at the rim)
    const sigBlk = trySignatureBlock(defender, shot);
    if (sigBlk) {
      this.emit("coach", `${defender.name} 「${sigBlk.name}」！`);
    }
    // 上帝附体必进：不会被盖；单脚抛射 / 答案等出手更难被盖
    const blkChance = sigOff?.guaranteed
      ? 0
      : calcBlockChance(baller, defender, shot, open, {
          defPress,
          skillBonus: skillBlockBonus(defender, shot, def.onCourt),
          sigBoost: sigBlk?.blockBoost || 0,
        }) * skillBlockResist(baller);
    if (Math.random() < blkChance) {
      baller.stats.fga += 1;
      if (shot.pts === 3) baller.stats.tpa += 1;
      defender.stats.blk += 1;
      gradeBlock(defender);
      gradeMiss(baller, { pts: shot.pts, open });
      this.emit(
        "miss",
        sigBlk
          ? `${defender.name} 「${sigBlk.name}」盖帽 ${baller.name}！`
          : `${defender.name} 盖帽 ${baller.name}！`
      );
      sparkTeamFromHighlight(def, "block", defender, (t, msg) => this.emit(t, msg));
      // 被帽方略受挫
      off.morale = clamp((off.morale || 50) - 1.5, 0, 100);
      if (baller) baller.mood = clamp((baller.mood ?? 50) - 3, 15, 95);
      applyPossessionFatigue(off, def, baller, defender, fatOpts({ wasted: forcedHunt }));
      // often stays live → rebound
      resolveRebound(off, def, this, true);
      return;
    }

    baller._bumpCold = false;
    let makeP = calcMakeProb(baller, shot, open, off, def, defender, plan, this.momentum, {
      quarter: this.quarter,
      scoreDiff: this.score[off.side] - this.score[def.side],
      sigMakeBoost: baller._sigMakeBoost || 0,
      scheme: sideCtx.scheme,
      kickedOut: sideCtx.kickedOut,
      onCourt: off.onCourt,
      tempoMakeBonus: tempoDef?.makeBonus || 0,
      primaryId: off === this.you() ? this.offenseFocusId : off.gameplan?.offenseFocusId || null,
    });
    // 低欲望被迫出手（传不出去 / 仍不够空）时准心打折——不鼓励硬投
    if (aggressionLevel(baller) <= 0.35 && open < shotOpenThreshold(baller)) {
      makeP *= 0.82;
    }
    // 上帝附体：无论防守如何，那一球必进
    if (sigOff?.guaranteed) makeP = 1;
    const made = Math.random() < makeP;
    let label = baller._sigLabel || null;
    if (!label && shot.zone === "paint") {
      label = paintFinishFeedLabel(baller, {
        open,
        kickedOut: !!sideCtx?.kickedOut,
        scheme: sideCtx?.scheme || null,
      });
    }
    if (!label) label = shotLabel(shot, open);
    if (baller._bumpCold) {
      label = `下盘顶飞·${label}`;
      this.emit("coach", `${defender.name} 用下盘顶开 ${baller.name}，投篮准心大乱！`);
      baller._bumpCold = false;
    }
    // 在清掉招牌标记前判定是否灌篮高光（全队士气）
    const dunkHighlight = isDunkFinish(label, baller);
    baller._sigMakeBoost = 0;
    baller._sigLabel = null;

    // Shooting foul (non-and-one path when miss, and-one when make)
    const foulHunt = baller.orders?.attack === "foul_hunt" || baller.orders?.action === "pnr";
    const foulChance =
      0.08 +
      (shot.zone === "paint" ? 0.06 : 0) -
      open * 0.04 +
      (foulHunt ? 0.07 : 0) +
      (baller.orders?.attack === "foul_hunt" ? 0.05 : 0) +
      skillFoulRisk(defender);
    const fouled = Math.random() < foulChance;

    if (made) {
      const pts = shot.pts;
      this.score[off.side] += pts;
      baller.stats.pts += pts;
      baller.stats.fgm += 1;
      baller.stats.fga += 1;
      if (shot.pts === 3) {
        baller.stats.tpm += 1;
        baller.stats.tpa += 1;
      }
      registerShotFeel(baller, true);
      applyPlusMinus(off, def, pts);
      gradeMake(baller, { pts, open });
      gradeScoredOn(defender, { open, pts });
      if (dunkHighlight) {
        sparkTeamFromHighlight(off, "dunk", baller, (t, msg) => this.emit(t, msg));
        def.morale = clamp((def.morale || 50) - 1.2, 0, 100);
        if (defender) defender.mood = clamp((defender.mood ?? 50) - 2, 15, 95);
        this.emit("dunk", `${baller.name} · ${label || "暴扣"}`, {
          player: {
            id: baller.id,
            name: baller.name,
            bref: baller.bref,
            nbaId: baller.nbaId,
            photo: baller.photo,
            photoCareerDefault: baller.photoCareerDefault,
            season: baller.season,
            team: baller.team,
            skills: baller.skills || [],
            scoring: baller.scoring,
            paint: baller.paint,
            hiddenTier: baller.hiddenTier,
          },
          label: label || "暴扣",
        });
      }
      let primaryAst = null;
      if (Math.random() < 0.55 + off.chem * 0.002) {
        primaryAst = pickPasser(off, baller);
        if (primaryAst) {
          primaryAst.stats.ast += 1;
          gradeAssist(primaryAst);
        }
      }
      // 间接助攻：挡拆/分球发起人不是最后一传也不是得分人
      if (sideCtx.kickedOut && sideCtx.organizerId) {
        const org = off.onCourt.find((x) => x.id === sideCtx.organizerId);
        if (org && org.id !== baller.id && (!primaryAst || org.id !== primaryAst.id)) {
          gradeHockeyAssist(org);
        }
      }
      // 挡拆掩护加分
      if (sideCtx.scheme === "pnr") {
        const handler = sideCtx.organizerId
          ? off.onCourt.find((x) => x.id === sideCtx.organizerId)
          : baller;
        const screener = pickScreener(off.onCourt, handler, baller);
        if (screener) gradeScreen(screener);
      }
      this.noteMomentum(off.side, pts);
      if (this.focusPlay && off === this.you()) {
        this.focusPlay.ttl -= 1;
        if (this.focusPlay.ttl <= 0) {
          this.emit("coach", `回合重点「${this.focusPlay.label}」结束`);
          this.focusPlay = null;
        }
      }
      const huntTag = forcedHunt ? " · 弱侧抓机会" : offShare >= 0.6 && hunt >= 0.55 ? " · 群狼抓机会" : "";
      const astTag = primaryAst ? ` · ${primaryAst.name} 助攻` : "";
      const duoIds = activeDuoIds(off.onCourt);
      let duoTag = "";
      if (duoIds.includes("lob_city") && shot.zone === "paint") duoTag = " · 空接之城";
      else if (duoIds.includes("splash_bros") && shot.zone === "three") duoTag = " · 水花连携";
      else if (duoIds.includes("pick_roll_twins")) duoTag = " · 挡拆默契";
      else if (isJokerJamalTwoMan(baller, primaryAst, off.onCourt)) duoTag = " · 二人转";
      if (baller._duoProc) baller._duoProc = null;
      const story = matchupFeedStory(baller, defender, shot, open, label, { made: true });
      this.emit(
        "score",
        `${story}！（${pct(makeP)} · ${hotLabel(baller.hot)}${huntTag}）${astTag}${duoTag} ${this.score.home}-${this.score.away}`
      );
      if (fouled) {
        defender.stats.pf += 1;
        gradeFoul(defender);
        this.emit("coach", `${defender.name} 打手犯规，加罚`);
        applyPossessionFatigue(
          off,
          def,
          baller,
          defender,
          fatOpts({ wasted: false, assisterId: primaryAst?.id || null })
        );
        shootFts(baller, off, this, 1);
        return;
      }
      applyPossessionFatigue(
        off,
        def,
        baller,
        defender,
        fatOpts({ wasted: false, assisterId: primaryAst?.id || null })
      );
      this.possession = flip(this.possession);
    } else {
      baller.stats.fga += 1;
      if (shot.pts === 3) baller.stats.tpa += 1;
      registerShotFeel(baller, false);
      gradeMiss(baller, { pts: shot.pts, open });
      gradeGoodContest(defender, { open });
      if (fouled) {
        defender.stats.pf += 1;
        gradeFoul(defender);
        const foulStory = matchupFeedStory(baller, defender, shot, open, label, { made: false, fouled: true });
        this.emit("miss", `${foulStory}（${pct(makeP)}）`);
        applyPossessionFatigue(off, def, baller, defender, fatOpts({ wasted: forcedHunt }));
        shootFts(baller, off, this, shot.pts === 3 ? 3 : 2);
        return;
      }
      const missStory = matchupFeedStory(baller, defender, shot, open, label, { made: false });
      this.emit(
        "miss",
        forcedHunt
          ? `${missStory}（${pct(makeP)}）—— 抓机会过猛`
          : `${missStory}（${pct(makeP)} · ${hotLabel(baller.hot)}）—— 空位也会打铁`
      );
      applyPossessionFatigue(off, def, baller, defender, fatOpts({ wasted: forcedHunt }));
      resolveRebound(off, def, this, false);
    }
  }

  /** Coach defensive scheme vs a specific opponent on the floor. */
  setDefenseScheme(scheme, targetId, defenderId = null) {
    const you = this.you();
    const opp = you.side === "home" ? this.away : this.home;
    const target = opp.onCourt.find((p) => p.id === targetId);
    const prevAssign = { ...(this.defensePlan?.assignments || {}) };
    if (!scheme || !target) {
      this.defensePlan = { scheme: null, targetId: null, defenderId: null, assignments: prevAssign };
      this.emit("coach", "取消重点策略（个人对位表仍保留）");
      return;
    }
    const names = { focus: "重点盯防", double: "包夹", bump: "下盘顶防" };
    let defId = defenderId || null;
    if (defId && !you.onCourt.some((p) => p.id === defId)) defId = null;
    if (scheme === "bump") {
      const bumper =
        (defId && you.onCourt.find((p) => p.id === defId)) ||
        you.onCourt.find(isSturdy) ||
        you.onCourt[0];
      if (!isLanky(target) && (target.strength || 50) >= 65) {
        this.emit("coach", `${target.name} 下盘不弱，顶防收益有限——仍布置「下盘顶防」`);
      } else if (!bumper || !isSturdy(bumper)) {
        this.emit("coach", `场上缺少壮硕内线，顶防奇效较弱`);
      }
      if (!defId && bumper) defId = bumper.id;
    }
    if (defId) prevAssign[target.id] = defId;
    this.defensePlan = {
      scheme,
      targetId: target.id,
      defenderId: defId,
      assignments: prevAssign,
    };
    const defName = defId ? you.onCourt.find((p) => p.id === defId)?.name : null;
    this.emit(
      "coach",
      defName
        ? `防守策略：${defName} 对 ${target.name}「${names[scheme] || scheme}」`
        : `防守策略：对 ${target.name}「${names[scheme] || scheme}」`
    );
  }

  /** 指定「谁防谁」（可多人各自对位；不影响重点盯防策略本身） */
  setMatchupAssignment(targetId, defenderId) {
    const you = this.you();
    const opp = you.side === "home" ? this.away : this.home;
    const target = opp.onCourt.find((p) => p.id === targetId) || opp.roster?.find((p) => p.id === targetId);
    if (!target) return false;
    const assignments = { ...(this.defensePlan?.assignments || {}) };
    if (!defenderId) {
      delete assignments[targetId];
      this.defensePlan = { ...(this.defensePlan || {}), assignments };
      this.emit("coach", `取消对 ${target.name} 的指定对位`);
      return true;
    }
    const defender = you.onCourt.find((p) => p.id === defenderId);
    if (!defender) return false;
    assignments[targetId] = defenderId;
    this.defensePlan = { ...(this.defensePlan || {}), assignments };
    if (this.defensePlan.targetId === targetId) this.defensePlan.defenderId = defenderId;
    this.emit("coach", `对位：${defender.name} 防 ${target.name}`);
    return true;
  }

  clearDefenseScheme() {
    this.setDefenseScheme(null, null);
  }

  /**
   * @param {string} [sideKey] home|away — defaults to player side
   * @param {{ pause?: boolean }} [opts] default: always pause so both sides can adjust
   */
  callTimeout(sideKey, opts = {}) {
    const t = sideKey ? this.sideByKey(sideKey) : this.you();
    const isYou = t === this.you();
    // Real NBA: either side's timeout is a dead ball — both coaches can adjust
    const pause = opts.pause != null ? opts.pause : !this._quiet;
    if (this.timeouts[t.side] <= 0) {
      if (isYou) this.emit("coach", "没有暂停了");
      return false;
    }
    this.timeouts[t.side] -= 1;
    t.morale = clamp(t.morale + 8, 0, 100);
    recoverFatigue(t, "timeout");
    // Dead ball: opposite side also rests (and may adjust)
    const other = t === this.home ? this.away : this.home;
    recoverFatigue(other, "timeout");
    other.morale = clamp(other.morale + 3, 0, 100);
    t.temp.offense = (t.temp.offense || 0) + 0.04;
    t.temp.defense = (t.temp.defense || 0) + 0.04;
    t.temp.ttl = 8;
    const who = isYou ? "我方" : t.name;
    // Break opponent scoring run (2K-style timeout momentum kill)
    const broken = this.breakMomentum(t.side);
    this.emit(
      "coach",
      isYou
        ? `我方叫暂停！可调整战术、沟通与换人（剩 ${this.timeouts[t.side]}）；体力仅略回一点${
            broken ? " · 打断对方高潮" : ""
          }`
        : `${who}叫暂停！你也可以趁机调整（对方剩 ${this.timeouts[t.side]}）；体力仅略回一点${
            broken ? " · 势头被掐断" : ""
          }`
    );
    if (pause) this.setPaused(true, "timeout");
    return true;
  }

  /** Record made basket into momentum streak. */
  noteMomentum(side, pts) {
    if (this.momentum.side === side) {
      this.momentum.points += pts;
      this.momentum.streak += 1;
    } else {
      this.momentum = { side, points: pts, streak: 1 };
    }
  }

  /** Calling timeout by `callerSide` cools the other team's run. */
  breakMomentum(callerSide) {
    const m = this.momentum;
    if (!m.side || m.side === callerSide || m.points < 6) return false;
    const hotSide = this.sideByKey(m.side);
    for (const p of hotSide.onCourt) {
      p.hot = Math.max(-2, (p.hot || 0) - 2);
      p.mood = clamp((p.mood ?? 50) - 4, 15, 95);
    }
    hotSide.temp.offense = (hotSide.temp.offense || 0) - 0.05;
    hotSide.temp.ttl = Math.max(hotSide.temp.ttl || 0, 5);
    this.momentum = { side: null, points: 0, streak: 0 };
    return true;
  }

  /** Set short-term offensive focus (dead-ball only, enforced by UI). */
  setFocusPlay(focusId) {
    const def = FOCUS_PLAYS.find((f) => f.id === focusId);
    if (!def) {
      this.focusPlay = null;
      this.emit("coach", "已取消回合重点");
      return false;
    }
    this.focusPlay = { id: def.id, label: def.name, ttl: 6 };
    this.emit("coach", `回合重点：${def.name}（约 ${this.focusPlay.ttl} 个进攻回合）`);
    return true;
  }

  /** 持久比赛节奏：降速成功率 / 正常 / 提速抢回合（暂停/节间改）。 */
  setTempo(tempoId) {
    const t = this.you();
    if (!t.gameplan) t.gameplan = {};
    const id = normalizeTempo(tempoId);
    t.gameplan.tempo = id;
    const def = getTempoDef(id);
    this.emit("coach", `比赛节奏：${def.name}——${def.desc}`);
    return true;
  }

  youTempo() {
    return getTempoDef(this.you()?.gameplan?.tempo);
  }

  /** Apply a saved 5-man lineup pack by player ids. */
  applyLineupPack(ids) {
    const t = this.you();
    if (!ids?.length) return false;
    const want = ids.slice(0, 5).map((id) => t.roster.find((p) => p.id === id)).filter(Boolean);
    if (want.length < 5) {
      this.emit("coach", "阵容包人数不足或不在名单");
      return false;
    }
    const onIds = new Set(want.map((p) => p.id));
    t.onCourt = want;
    t.bench = t.roster.filter((p) => !onIds.has(p.id));
    t.chem = teamChemistry(t.onCourt, this.ballOpts(t));
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic, this.ballOpts(t));
    this.emit("coach", `切换阵容包：${want.map((p) => p.name).join(" / ")} · 适配 ${t.fit}`);
    this.refreshMeters();
    return true;
  }

  applyRoleMorale(quarterJustEnded) {
    for (const side of [this.home, this.away]) {
      const reports = roleMinutesMoraleDelta(side.onCourt, side.bench, quarterJustEnded);
      let teamDelta = 0;
      for (const r of reports) {
        r.player.mood = clamp((r.player.mood ?? 50) + r.delta, 15, 95);
        teamDelta += r.delta * 0.35;
        if (!this._quiet && Math.abs(r.delta) >= 4 && side === this.you()) {
          this.emit("coach", r.reason);
        }
      }
      side.morale = clamp(side.morale + teamDelta * 0.15, 0, 100);
    }
  }

  /** Sub players who blew past target minutes when fresher bench exists. */
  autoRotateByMinutes(team, aggressive = false) {
    if (!team?.onCourt?.length) return;
    // Progress through regulation (0→1). Stars may run slightly ahead of pace early.
    const qProg =
      (Math.min(4, this.quarter) - 1) / 4 +
      (1 - Math.min(1, this.clock / (this.quarter > 4 ? 300 : 720))) / 4;
    const qFrac = Math.min(1, Math.max(0.15, qProg));
    const ot = this.quarter > 4;
    for (let guard = 0; guard < 3; guard++) {
      const tired = [...team.onCourt].sort((a, b) => {
        const ta = a.targetMinutes ?? 28;
        const tb = b.targetMinutes ?? 28;
        return b.stats.min / Math.max(8, ta) - a.stats.min / Math.max(8, tb);
      })[0];
      if (!tired) break;
      const target = tired.targetMinutes ?? 28;
      // Hard stop so iron lungs don't play 48; soft pace spreads minutes
      const hardCap = ot ? target + 10 : target + (aggressive ? 2 : 3);
      const paced = target * Math.min(1.05, qFrac + 0.14);
      const overPace = tired.stats.min - paced;
      const overHard = tired.stats.min - hardCap;
      const need = aggressive ? 2.5 : 4;
      const mustSit = overHard >= 0;
      if (!mustSit && overPace < need && (tired.fatigue || 0) < (aggressive ? 58 : 72)) break;
      const fresh = [...team.bench]
        .filter((p) => !(p.injuredGames > 0))
        .filter((p) => (p.stats.min || 0) < (p.targetMinutes ?? 22) + 1)
        .sort((a, b) => {
          // Prefer whoever still has the most minutes left on their budget
          const leftA = (a.targetMinutes ?? 22) - (a.stats.min || 0);
          const leftB = (b.targetMinutes ?? 22) - (b.stats.min || 0);
          return leftB - leftA || overall(b) - overall(a);
        })[0];
      if (!fresh) break;
      if (
        !mustSit &&
        (fresh.targetMinutes ?? 22) - (fresh.stats.min || 0) < 4 &&
        overall(fresh) < overall(tired) - 6
      ) {
        break;
      }
      this.substitute(tired.id, fresh.id, team.side);
    }
    // Late game: put alphas back if they still have budget and a low-budget body is on the floor
    if (this.quarter >= 3 || aggressive) {
      const needy = [...team.bench]
        .filter((p) => !(p.injuredGames > 0))
        .filter((p) => (p.stats.min || 0) + 3 < (p.targetMinutes ?? 22))
        .sort(
          (a, b) =>
            (b.targetMinutes ?? 22) - (b.stats.min || 0) - ((a.targetMinutes ?? 22) - (a.stats.min || 0)) ||
            overall(b) - overall(a)
        )[0];
      if (needy) {
        const expendable = [...team.onCourt]
          .filter((p) => (p.stats.min || 0) >= (p.targetMinutes ?? 22) - 1 || (p.targetMinutes ?? 22) <= 18)
          .sort(
            (a, b) =>
              (a.targetMinutes ?? 22) - (a.stats.min || 0) - ((b.targetMinutes ?? 22) - (b.stats.min || 0)) ||
              overall(a) - overall(b)
          )[0];
        if (
          expendable &&
          expendable.id !== needy.id &&
          ((needy.targetMinutes ?? 22) - (needy.stats.min || 0) >
            (expendable.targetMinutes ?? 22) - (expendable.stats.min || 0) + 4)
        ) {
          this.substitute(expendable.id, needy.id, team.side);
        }
      }
    }
  }

  /** CPU fatigue management + clutch timeouts. */
  maybeCpuManage() {
    if (this.paused) return;
    const cpu = this.opp();
    if (!cpu?.onCourt?.length) return;
    // throttle: ~1 check / few possessions
    if (Math.random() > 0.22) return;

    const you = this.you();
    const deficit = this.score[you.side] - this.score[cpu.side];
    const avgFat = avg(cpu.onCourt.map((p) => p.fatigue || 0));
    const late = this.quarter >= 4 || (this.quarter === 3 && this.clock < 180);
    const clutch = this.quarter >= 4 && this.clock < 120 && Math.abs(deficit) <= 6;

    if (this.timeouts[cpu.side] > 0) {
      let wantTo = false;
      const runAgainst =
        this.momentum.side === you.side && this.momentum.points >= 8;
      if (runAgainst) wantTo = Math.random() < 0.65;
      else if (deficit >= 10 && avgFat >= 48) wantTo = Math.random() < 0.55;
      else if (deficit >= 6 && avgFat >= 55) wantTo = Math.random() < 0.4;
      else if (clutch && deficit > 0) wantTo = Math.random() < 0.35;
      else if (late && avgFat >= 62) wantTo = Math.random() < 0.25;
      if (wantTo && this.callTimeout(cpu.side)) {
        this.cpuAutoSub(cpu, { aggressive: true });
        return;
      }
    }
    // Live ball: CPU may still rotate without stopping play
    this.cpuAutoSub(cpu, { aggressive: deficit >= 8 || avgFat >= 60 });
    // Instant full-game / unmanaged quiet: light auto-coach your side
    if (this._quiet && !this.managed) {
      const youSide = this.you();
      if (youSide?.onCourt?.length) {
        const youFat = avg(youSide.onCourt.map((p) => p.fatigue || 0));
        this.cpuAutoSub(youSide, {
          aggressive: youFat >= 58 || this.quarter >= 3 || deficit <= -8,
        });
      }
    }
  }

  /**
   * FIFA-style smart manager for your sideline.
   * Live: fatigue subs, timeout when cold/blown, basic D/O tweaks.
   * Quiet (快速模拟): same logic without pause spam.
   */
  maybeManagedCoach() {
    if (!this.managed || this.paused) return;
    const you = this.you();
    if (!you?.onCourt?.length) return;

    this._manageCd = (this._manageCd || 0) - 1;
    if (this._manageCd <= 0) {
      const avgFat = avg(you.onCourt.map((p) => p.fatigue || 0));
      const opp = this.opp();
      const deficit = this.score[opp.side] - this.score[you.side];
      const protecting = deficit <= -4; // 领先：别乱换主力
      const chasing = deficit >= 6;
      // 以前 Q3 起一律 aggressive（疲劳≈48就换人）——领先时把球星换下去最容易崩盘
      this.managedAutoSubs({
        aggressive: !protecting && (avgFat >= 62 || chasing || (this.quarter >= 4 && deficit >= 2)),
        protectLead: protecting,
      });
      this._manageCd = this._quiet ? 1 : 2;
    }

    if (Math.random() < (this._quiet ? 0.35 : 0.2)) this.managedDefense();
    if (Math.random() < 0.12) this.managedOffensePlan({ light: true });

    // Occasional shout when flat
    if (!this._quiet && (you.morale || 50) < 42 && Math.random() < 0.12) {
      this.shout();
    }

    if (this.timeouts[you.side] <= 0) return;
    const opp = this.opp();
    const deficit = this.score[opp.side] - this.score[you.side];
    const avgFat = avg(you.onCourt.map((p) => p.fatigue || 0));
    const runAgainst = this.momentum.side === opp.side && this.momentum.points >= 8;
    const cold = avg(you.onCourt.map((p) => p.hot || 0)) <= -1.1;
    const late = this.quarter >= 4 || (this.quarter === 3 && this.clock < 200);
    const elapsed = this.elapsedSec || 0;
    if (elapsed - (this._manageLastTo || -999) < 85) return;

    let why = "";
    let wantTo = false;
    if (runAgainst) {
      wantTo = Math.random() < 0.72;
      why = "打断对方高潮";
    } else if (deficit >= 12 && this.quarter >= 2) {
      wantTo = Math.random() < 0.48;
      why = "分差拉开，重整阵脚";
    } else if (cold && deficit >= 3) {
      wantTo = Math.random() < 0.42;
      why = "手感冰凉，叫停调整";
    } else if (avgFat >= 72 && this.timeouts[you.side] >= 2) {
      wantTo = Math.random() < 0.3;
      why = "全员过劳，喘口气";
    } else if (late && deficit >= 4 && deficit <= 14) {
      wantTo = Math.random() < 0.4;
      why = "关键分追分布置";
    }
    if (!wantTo) return;
    if (!this.callTimeout(you.side, { pause: false })) return;
    this._manageLastTo = elapsed;
    this.emit("coach", `托管助手叫暂停：${why}`);
    this.runManagedBreak("timeout");
  }

  /** Dead-ball / instant package: rotate + basic O/D. */
  runManagedBreak(reason = "timeout") {
    const you = this.you();
    const opp = this.opp();
    const deficit = this.score[opp.side] - this.score[you.side];
    const protecting = deficit <= -4;
    const aggressive = !protecting && (reason === "half" || reason === "timeout" || deficit >= 6);
    this.managedAutoSubs({ aggressive, protectLead: protecting });
    // 领先时节间别按分钟硬轮转把核换下去；追分/中场再轮
    if (aggressive && !protecting) this.autoRotateByMinutes(you, true);
    this.managedDefense();
    this.managedOffensePlan({ light: false });
    if ((you.morale || 50) < 55 && reason !== "quarter") {
      // Soft huddle buff without full talk UI
      you.morale = clamp((you.morale || 50) + 4, 0, 100);
      for (const p of you.onCourt) p.mood = clamp((p.mood ?? 50) + 2, 15, 95);
    }
    this.emit("coach", `托管助手已调整：轮换 / 盯防 / 基本战术（${reason === "half" ? "中场" : reason === "quarter" ? "节间" : "暂停"}）`);
    this.refreshMeters();
  }

  /** Sub gassed / ice-cold players for fresher same-position bench. */
  managedAutoSubs({ aggressive = false, protectLead = false } = {}) {
    const you = this.you();
    if (!you?.onCourt?.length || !you.bench?.length) return;
    // Up to 2 swaps per pulse
    for (let i = 0; i < 2; i++) {
      const before = you.onCourt.map((p) => p.id).join("|");
      this.cpuAutoSub(you, { aggressive, protectLead });
      // 只有追分才因「手感冰」换人；领先时冰一手的球星仍比板凳强
      const opp = this.opp();
      const deficit = this.score[opp.side] - this.score[you.side];
      if (!protectLead && (deficit >= 4 || aggressive)) this.managedSubCold(you);
      if (you.onCourt.map((p) => p.id).join("|") === before) break;
    }
  }

  managedSubCold(team) {
    const bench = team.bench.filter((p) => !(p.injuredGames > 0));
    if (!bench.length) return;
    const cold = [...team.onCourt]
      .filter((p) => (p.hot || 0) <= -2 && fatiguePerfMult(p) < 0.97)
      .sort((a, b) => (a.hot || 0) - (b.hot || 0) || overall(a) - overall(b))[0];
    if (!cold) return;
    const fresh = [...bench]
      .filter((p) => (p.fatigue || 0) < (cold.fatigue || 0) - 8 || (p.hot || 0) > (cold.hot || 0))
      .sort(
        (a, b) =>
          (a.fatigue || 0) - (b.fatigue || 0) ||
          (b.hot || 0) - (a.hot || 0) ||
          overall(b) - overall(a)
      )[0];
    if (!fresh || overall(fresh) < overall(cold) - 12) return;
    const samePos =
      bench
        .filter(
          (p) =>
            (p.pos === cold.pos || p.playPos === cold.playPos || p.playPos === cold.pos) &&
            (p.fatigue || 0) <= (fresh.fatigue || 0) + 5
        )
        .sort((a, b) => overall(b) - overall(a))[0] || fresh;
    if ((samePos.hot || 0) <= (cold.hot || 0) && overall(samePos) <= overall(cold)) return;
    this.substitute(cold.id, samePos.id, team.side);
  }

  /** Put a body on the opponent's hottest threat. */
  managedDefense() {
    const opp = this.opp();
    const you = this.you();
    if (!opp?.onCourt?.length) return;
    const deficit = this.score[opp.side] - this.score[you.side];
    const protecting = deficit <= -6;
    const threat = [...opp.onCourt].sort((a, b) => {
      const sa =
        (a.stats?.pts || 0) * 1.2 + (a.hot || 0) * 7 + (a.scoring || 50) * 0.18 + (a.fgPct || 40) * 0.15;
      const sb =
        (b.stats?.pts || 0) * 1.2 + (b.hot || 0) * 7 + (b.scoring || 50) * 0.18 + (b.fgPct || 40) * 0.15;
      return sb - sa;
    })[0];
    if (!threat) return;
    let scheme = "focus";
    // 领先时少包夹——避免放空弱侧三分被追分
    if (!protecting && ((threat.hot || 0) >= 2 || (threat.stats?.pts || 0) >= 22)) scheme = "double";
    else if (isLanky(threat) && (threat.scoring || 0) >= 78 && Math.random() < 0.4) scheme = "bump";
    if (this.defensePlan?.targetId === threat.id && this.defensePlan?.scheme === scheme) return;
    this.setDefenseScheme(scheme, threat.id);
  }

  /**
   * Basic playbook pick from coach's unlocked tactics + short focus.
   * light=true: only nudge when score situation demands.
   */
  managedOffensePlan({ light = false } = {}) {
    const you = this.you();
    const opp = this.opp();
    if (!you?.onCourt?.length) return;
    const deficit = this.score[opp.side] - this.score[you.side];
    const late = this.quarter >= 4 || (this.quarter === 3 && this.clock < 200);
    if (light && Math.abs(deficit) < 6 && !late) return;

    const avail = coachTactics(you.coach || { specialTactics: ["balanced"] });
    const ids = new Set(avail.map((t) => t.id));
    const pick = (...cands) => cands.find((id) => id === "balanced" || ids.has(id)) || "balanced";

    const shooters = you.onCourt.filter((p) => (p.three || 50) >= 72).length;
    const bigs = you.onCourt.filter((p) => ["C", "PF"].includes(p.playPos || p.pos)).length;

    let want = "balanced";
    let focus = null;
    let off = 8;
    let def = 8;
    let morale = 8;
    let stam = 2;

    // 终场落后分差不大：一定要抢攻；需要三分时布置 pace_three 并把球给最稳射手
    const clutchChase =
      late &&
      deficit >= 1 &&
      deficit <= 9 &&
      (this.clock <= 150 || (deficit <= 6 && this.clock <= 200));
    const needThree =
      clutchChase &&
      ((deficit === 3 && this.clock <= 90) ||
        (deficit >= 4 && deficit <= 6 && this.clock <= 48) ||
        (deficit >= 1 && deficit <= 3 && this.clock <= 18));

    if (clutchChase) {
      want = pick("pace_space", "smallball", "five_out", "motion", "pnr_spam", "iso_heavy", "balanced");
      focus = needThree || shooters >= 1 ? "pace_three" : "iso_star";
      off = 14;
      def = 6;
      stam = -2;
      morale = 12;
    } else if (deficit >= 10 && late) {
      want = pick("pace_space", "smallball", "iso_heavy", "five_out", "pnr_spam", "balanced");
      focus = "iso_star";
      off = 14;
      def = 6;
      stam = -2;
      morale = 10;
    } else if (deficit >= 6) {
      want = pick("iso_heavy", "motion", "pnr_spam", "smallball", "pace_space", "balanced");
      focus = shooters >= 2 ? "pace_three" : "hunt_mismatch";
      off = 12;
      def = 7;
      stam = 0;
    } else if (deficit <= -8) {
      // 领先保胜：降速磨时间，别把进攻倾向砍太狠（否则只防不进被追）
      want = pick("grind", "princeton", "triangle", "balanced");
      focus = late || deficit <= -10 ? "slow_pace" : null;
      off = 7;
      def = 13;
      stam = 4;
      if (you.gameplan && (!you.gameplan.tempo || you.gameplan.tempo === "normal")) {
        you.gameplan.tempo = "grind";
      }
    } else if (deficit <= -4) {
      want = pick("grind", "triangle", "princeton", "motion", "balanced");
      focus = null;
      off = 8;
      def = 11;
      stam = 3;
    } else if (shooters >= 3) {
      want = pick("smallball", "pace_space", "five_out", "motion", "balanced");
    } else if (bigs >= 2) {
      want = pick("triangle", "grind", "horns", "princeton", "balanced");
      if (!light && Math.random() < 0.35) focus = "post_up";
    } else {
      want = pick("motion", "pnr_spam", "balanced", "horns");
    }

    if (you.tactic?.id !== want) this.setTactic(want);
    if (focus && (!this.focusPlay || this.focusPlay.id !== focus)) this.setFocusPlay(focus);

    const threeAce = needThree || clutchChase ? bestThreeShooter(you.onCourt) : null;
    const star = [...you.onCourt].sort(
      (a, b) =>
        formTactical(b) * 0.5 +
        formConfidence(b) * 0.35 +
        (b.scoring || 0) * 0.4 +
        (b.hot || 0) * 4 -
        (formTactical(a) * 0.5 + formConfidence(a) * 0.35 + (a.scoring || 0) * 0.4 + (a.hot || 0) * 4)
    )[0];
    const focusMan = threeAce || star;
    // 领先时保留持球发起人（别清空核），只在追分/关键时强行指定
    if (focusMan && (needThree || clutchChase || deficit >= 4 || formConfidence(focusMan) >= 68)) {
      if (this.offenseFocusId !== focusMan.id) this.setOffenseFocus(focusMan.id);
    }

    if (!light) {
      const b = you.coach?.buffs || {};
      const changed =
        Number(b.offense) !== off ||
        Number(b.defense) !== def ||
        Number(b.morale) !== morale ||
        Number(b.stamina) !== stam;
      if (changed) {
        this.applyPhilosophy({
          styleName: "托管助手",
          offense: off,
          defense: def,
          morale,
          stamina: stam,
        });
      }
    }
  }

  /** Swap gassed starters for fresher / better bench pieces. */
  cpuAutoSub(team, { aggressive = false, protectLead = false } = {}) {
    if (!team?.onCourt?.length || !team.bench?.length) return;
    const bench = team.bench.filter((p) => !(p.injuredGames > 0));
    if (!bench.length) return;
    const tired = [...team.onCourt].sort(
      (a, b) =>
        fatiguePerfMult(a) - fatiguePerfMult(b) || (b.fatigue || 0) - (a.fatigue || 0)
    )[0];
    if (!tired) return;
    // 领先保核：疲劳阈值抬高，避免半场就换下球星
    const thresh = protectLead ? 78 : aggressive ? 52 : 62;
    const perfFloor = protectLead ? 0.86 : aggressive ? 0.94 : 0.9;
    const gassed =
      (tired.fatigue || 0) >= thresh || fatiguePerfMult(tired) <= perfFloor;
    if (!gassed) return;
    const fresh = [...bench].sort(
      (a, b) => (a.fatigue || 0) - (b.fatigue || 0) || overall(b) - overall(a)
    )[0];
    if (!fresh) return;
    const ovrGap = protectLead ? 6 : 10;
    const fatNeed = protectLead ? 18 : 12;
    if ((fresh.fatigue || 0) > (tired.fatigue || 0) - fatNeed && overall(fresh) < overall(tired) - ovrGap) {
      return;
    }
    // Prefer same-ish position
    const samePos =
      bench
        .filter((p) => p.pos === tired.pos || p.playPos === tired.pos || p.playPos === tired.playPos)
        .sort((a, b) => (a.fatigue || 0) - (b.fatigue || 0) || overall(b) - overall(a))[0] || fresh;
    // 领先时：替补明显更弱就别换
    if (protectLead && overall(samePos) < overall(tired) - 5) return;
    this.substitute(tired.id, samePos.id, team.side);
  }

  /**
   * Pull any injured players off the floor onto the bench when a healthy body exists.
   * Returns how many were forced out.
   */
  forceOutInjured(team) {
    if (!team?.onCourt?.length) return 0;
    let n = 0;
    // Loop: multiple injured could be stuck on court
    for (let guard = 0; guard < 5; guard++) {
      const hurt = team.onCourt.find((p) => p.injuredGames > 0);
      if (!hurt) break;
      const sub = team.bench.find((b) => !(b.injuredGames > 0));
      if (!sub) {
        // Throttle nag — once per player until a healthy body appears
        const key = `_injStuck_${team.side}_${hurt.id}`;
        if (team === this.you() && !this[key]) {
          this[key] = true;
          this.emit(
            "coach",
            `${hurt.name} ${hurt.injuryStatus || "伤停"}仍在场上——板凳没有健康球员可换，只能硬顶`
          );
        }
        break;
      }
      this[`_injStuck_${team.side}_${hurt.id}`] = false;
      if (this.substitute(hurt.id, sub.id, team.side)) {
        n += 1;
        this.emit(
          "coach",
          `${hurt.name} ${hurt.injuryStatus || "伤停"}不能继续比赛，${sub.name}强制顶上`
        );
      } else break;
    }
    return n;
  }

  /**
   * In-game injury for glass players (晋级制). Syncs injuredGames onto source card via id.
   * Checked once per offensive possession (~100x/game per team), so the per-check chance
   * must stay small or it compounds into near-certain injuries over a full game.
   * Below risk 60 the chance is 0 — only genuinely fragile players ("玻璃人") are at risk here.
   */
  maybeInGameInjury(team, focus) {
    if (!this.injuriesEnabled || !team.onCourt.length) return;
    const candidates = focus ? [focus, ...team.onCourt.filter((p) => p.id !== focus.id)] : team.onCourt;
    for (const p of candidates.slice(0, 3)) {
      const risk = p.intangibles?.injuryRisk ?? 40;
      const ironBody = (p.skills || []).includes("iron_body");
      const chance = inGameInjuryChance(risk, { fatigue: p.fatigue || 0, ironBody });
      if (Math.random() > chance) continue;
      const effectiveRisk = ironBody ? Math.max(12, risk - 24) : risk;
      const gamesOut = effectiveRisk >= 80 ? 2 : 1;
      p.injuredGames = gamesOut;
      p.injuryStatus = effectiveRisk >= 80 ? "严重伤病" : "伤停";
      const src = team.roster.find((r) => r.id === p.id);
      if (src) {
        src.injuredGames = gamesOut;
        src.injuryStatus = p.injuryStatus;
      }
      const sub = team.bench.find((b) => !(b.injuredGames > 0));
      if (sub && this.substitute(p.id, sub.id, team.side)) {
        this.emit(
          "coach",
          `受伤！${p.name} ${p.injuryStatus}下场（伤病风险 ${effectiveRisk}），${sub.name}顶上。预计缺席后续 ${gamesOut} 场`
        );
      } else {
        this.emit(
          "coach",
          `受伤！${p.name} ${p.injuryStatus}——板凳暂无健康球员，暂停后请尽快换下（预计缺席 ${gamesOut} 场）`
        );
        // Dead-ball pause so coach can react when it's the user side
        if (team === this.you() && !this._quiet) {
          this.setPaused(true, "injury");
        }
      }
      break;
    }
  }

  shout() {
    const t = this.you();
    const fiery = avg(t.onCourt.map((p) => p.personality?.fiery || 50));
    const delta = fiery > 60 ? 10 : 5;
    t.morale = clamp(t.morale + delta, 0, 100);
    t.temp.offense = (t.temp.offense || 0) + 0.04;
    t.temp.ttl = Math.max(t.temp.ttl || 0, 6);
    const egoAvg = avg(t.onCourt.map((p) => p.personality?.ego || 50));
    if (egoAvg > 75 && Math.random() < 0.25) {
      t.morale = clamp(t.morale - 8, 0, 100);
      for (const p of t.onCourt) p.mood = clamp((p.mood ?? 50) - 6, 15, 95);
      this.emit("coach", "大喊加压——球星不买账，士气反而下滑");
      return;
    }
    // Core effect: yank freelancers back onto the called tactic for a few possessions
    t.temp.tacticHold = Math.max(t.temp.tacticHold || 0, 0.78);
    let drifted = 0;
    for (const p of t.onCourt) {
      p.mood = clamp((p.mood ?? 50) + 5, 15, 95);
      const fit = systemFitScore(p, t.coach, t.tactic);
      const ego = p.personality?.ego || 50;
      const adapt = p.intangibles?.systemAdapt ?? 50;
      const ballNeed = p.intangibles?.ballNeed ?? 50;
      const drift =
        Math.max(0, 64 - fit) +
        Math.max(0, ego - 60) * 0.4 +
        Math.max(0, 52 - adapt) * 0.3 +
        Math.max(0, ballNeed - 70) * 0.15;
      if (drift >= 10) {
        p.tempTacticFocus = Math.max(
          p.tempTacticFocus || 0,
          5 + Math.min(3, Math.floor(drift / 18))
        );
        drifted++;
      } else {
        p.tempTacticFocus = Math.max(p.tempTacticFocus || 0, 3);
      }
    }
    const tName = t.tactic?.name || "当前战术";
    this.emit(
      "coach",
      drifted
        ? `大喊！${drifted}人有点脱离体系——勒令集中执行「${tName}」`
        : `大喊！全员集中注意力，严格执行「${tName}」`
    );
  }

  talk() {
    const t = this.you();
    t.morale = clamp(t.morale + 4, 0, 100);
    t.chem = clamp(t.chem + 3, 0, 100);
    for (const p of t.onCourt) {
      p.mood = clamp((p.mood ?? 50) + 3, 15, 95);
      if ((p.personality?.ego || 0) > 70) p.tempFocus = 3;
    }
    this.emit("coach", "场边沟通：士气与化学反应小幅上升——请为每人布置进攻与防守指令");
  }

  setTactic(tacticId) {
    const t = this.you();
    const tactic = TACTICS[tacticId] || TACTICS.balanced;
    t.tactic = tactic;
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic, this.ballOpts(t));
    if (tactic.morale) t.morale = clamp(t.morale + tactic.morale, 0, 100);
    this.emit("coach", `战术切换为「${tactic.name}」适配度 ${t.fit}`);
    this.refreshMeters();
  }

  /** Live-adjust coaching buffs (philosophy is not locked at tip-off). */
  applyPhilosophy(philosophy = {}) {
    const t = this.you();
    const base = t.coach || {};
    const off = clamp(Number(philosophy.offense ?? base.buffs?.offense ?? 5), 0, 18);
    const def = clamp(Number(philosophy.defense ?? base.buffs?.defense ?? 5), 0, 18);
    const morale = clamp(Number(philosophy.morale ?? base.buffs?.morale ?? 5), 0, 18);
    const stamina = clamp(Number(philosophy.stamina ?? base.buffs?.stamina ?? 0), -10, 12);
    t.coach = {
      ...base,
      style: philosophy.styleName || base.style || "临场调整",
      buffs: { offense: off, defense: def, morale, stamina },
      philosophy: { offense: off, defense: def, morale, stamina },
    };
    // Soft morale nudge toward new management style
    t.morale = clamp(t.morale + (morale - 8) * 0.35, 0, 100);
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic, this.ballOpts(t));
    this.emit(
      "coach",
      `临场调整方针：抓机会${off} / 防守压迫${def} / 士气${morale} / 负荷${stamina} · 适配 ${t.fit}`
    );
    this.refreshMeters();
    return t.coach;
  }

  /** Reassign on-court (or roster) play position mid-game. Occupant swaps. */
  setPlayPos(playerId, pos) {
    const t = this.you();
    const p = t.roster.find((x) => x.id === playerId);
    if (!p) {
      this.emit("coach", "找不到该球员");
      return false;
    }
    const slot = String(pos || p.pos).toUpperCase();
    const ok = ["PG", "SG", "SF", "PF", "C"].includes(slot);
    if (!ok) return false;
    const prev = p.playPos || p.pos;
    if (prev === slot) return true;
    // 场上已有人占该位 → 互换，避免两人叠位
    const onCourt = t.onCourt || [];
    const onFloor = onCourt.some((x) => x.id === p.id);
    if (onFloor) {
      const occupant = onCourt.find(
        (x) => x.id !== p.id && String(x.playPos || x.pos).toUpperCase() === slot
      );
      if (occupant) occupant.playPos = prev;
    }
    p.playPos = slot;
    p.playPosManual = true;
    const boostNotes = applyLineupPositionEffects(t.onCourt);
    t.chem = teamChemistry(t.onCourt, this.ballOpts(t));
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic, this.ballOpts(t));
    const boostBit = boostNotes.find((n) => n.startsWith(p.name)) || boostNotes[0];
    this.emit(
      "coach",
      `站位调整：${p.name} ${prev} → ${slot}（适配 ${t.fit} · 化学反应 ${t.chem}${
        boostBit ? ` · ${boostBit}` : ""
      }）`
    );
    this.refreshMeters();
    return true;
  }

  substitute(outId, inId, sideKey) {
    const t = sideKey ? this.sideByKey(sideKey) : this.you();
    const outIdx = t.onCourt.findIndex((p) => p.id === outId);
    const inbound = t.bench.find((p) => p.id === inId);
    if (outIdx < 0 || !inbound) {
      if (t === this.you()) this.emit("coach", "换人失败");
      return false;
    }
    // Never check an injured player back onto the floor
    if (inbound.injuredGames > 0) {
      if (t === this.you()) {
        this.emit("coach", `${inbound.name} ${inbound.injuryStatus || "伤停"}，不能上场`);
      }
      return false;
    }
    const out = t.onCourt[outIdx];
    // Settle any pending bench rest for the inbound before they check in
    applyBenchRecoveryForPlayer(inbound, this);
    // 上场者继承下场者的场上位置，避免空位/叠位
    inbound.playPos = out.playPos || out.pos;
    t.onCourt[outIdx] = inbound;
    t.bench = t.bench.filter((p) => p.id !== inId).concat(out);
    // No instant fatigue dump on sub — rest only accrues with real bench time
    out.benchSinceElapsed = this.elapsedSec || 0;
    inbound.benchSinceElapsed = null;
    applyLineupPositionEffects(t.onCourt);
    t.chem = teamChemistry(t.onCourt, this.ballOpts(t));
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic, this.ballOpts(t));
    // Focus / matchup targets that left the floor are cleared
    if (t === this.you() && this.offenseFocusId === outId) {
      this.offenseFocusId = null;
      this.emit("coach", `${out.name} 下场——已清空持球人指定，请从新阵容重选`);
    }
    if (this.defensePlan) {
      const assignments = { ...(this.defensePlan.assignments || {}) };
      let defenderId = this.defensePlan.defenderId || null;
      let targetId = this.defensePlan.targetId || null;
      let changed = false;
      if (t === this.you()) {
        // 我方防守人下场 → 对位交给换上的人
        for (const [tid, did] of Object.entries(assignments)) {
          if (did === outId) {
            assignments[tid] = inbound.id;
            changed = true;
          }
        }
        if (defenderId === outId) {
          defenderId = inbound.id;
          changed = true;
        }
      } else {
        // 对方进攻人下场 → 把对位表迁到新人
        if (assignments[outId]) {
          assignments[inbound.id] = assignments[outId];
          delete assignments[outId];
          changed = true;
        }
        if (targetId === outId) {
          targetId = inbound.id;
          changed = true;
        }
      }
      if (changed) {
        this.defensePlan = { ...this.defensePlan, defenderId, targetId, assignments };
      }
    }
    const tag = t === this.you() ? "" : `【${t.name}】`;
    this.emit("coach", `${tag}换人：${inbound.name} 换下 ${out.name}`);
    this.refreshMeters();
    return true;
  }

  /**
   * Run the rest of the game synchronously (no UI ticks / feed spam).
   * Both sides auto-rotate on fatigue & minutes. Returns final snapshot.
   * Safe to call mid-game (clears pause / pending quarter break).
   */
  runFast() {
    clearTimeout(this._timer);
    this._timer = null;
    this._quiet = true;
    this.running = true;
    this.paused = false;
    this.breakReason = null;
    this._pendingQuarterStart = false;
    let guard = 0;
    while (this.running && guard++ < 8000) {
      this.step();
    }
    this._quiet = false;
    return this.snapshot();
  }

  decayMods() {
    for (const side of [this.home, this.away]) {
      if (side.temp.ttl > 0) {
        side.temp.ttl -= 1;
        if (side.temp.ttl <= 0) side.temp = { ttl: 0 };
      }
    }
    // Momentum naturally cools if no consecutive makes
    if (this.momentum.streak > 0 && Math.random() < 0.08) {
      this.momentum.points = Math.max(0, this.momentum.points - 2);
      if (this.momentum.points <= 0) this.momentum = { side: null, points: 0, streak: 0 };
    }
  }

  refreshMeters() {
    for (const side of [this.home, this.away]) {
      side.chem = teamChemistry(side.onCourt, this.ballOpts(side));
      side.fit = lineupFit(side.onCourt, side.coach, side.tactic, this.ballOpts(side));
    }
  }

  finish() {
    this.stop();
    // plus/minus already tracked live; finalize minutes rounding
    for (const side of [this.home, this.away]) {
      for (const p of side.roster) p.stats.min = Math.round(p.stats.min);
    }
    this.emit("coach", "终场哨响！");
    this.onEnd(this.snapshot());
  }

  emit(type, text, meta = null) {
    if (this._quiet) return;
    const payload = { type, text, ...this.snapshot() };
    if (meta) payload.meta = meta;
    this.onEvent(payload);
  }

  snapshot() {
    return {
      quarter: this.quarter,
      clock: this.clock,
      score: { ...this.score },
      possession: this.possession,
      home: publicTeam(this.home),
      away: publicTeam(this.away),
      youSide: this.youSide,
      timeouts: { ...this.timeouts },
      defensePlan: {
        ...this.defensePlan,
        assignments: { ...(this.defensePlan?.assignments || {}) },
      },
      paused: !!this.paused,
      breakReason: this.breakReason,
      momentum: { ...this.momentum },
      focusPlay: this.focusPlay ? { ...this.focusPlay } : null,
      offenseFocusId: this.offenseFocusId,
      managed: !!this.managed,
    };
  }
}

function emptyStats() {
  return {
    min: 0,
    pts: 0,
    reb: 0,
    oreb: 0,
    dreb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    pm: 0,
  };
}

/**
 * Soft auto-orders from carry-over form (won't override coach manual picks).
 * Hot scorers ask for the rock; good passers look for them.
 */
function applyFormAutoOrders(p) {
  if (!p?.orders) return;
  const conf = formConfidence(p);
  const tac = formTactical(p);
  const scoreForm = p.scoreForm ?? 50;
  const passForm = p.passForm ?? 50;
  const o = p.orders;
  if (o.usage === "auto") {
    if (scoreForm >= 68 && conf >= 62 && (p.scoring || 50) >= 72) o.usage = "score";
    else if (passForm >= 68 && (p.pass || 50) >= 70) o.usage = "organize";
    else if (tac >= 70 && (p.scoring || 50) >= 78) o.usage = "score";
  }
  if (o.hunt === "auto" && conf >= 68) o.hunt = "hunt";
  if (o.action === "auto") {
    if (o.usage === "organize" || passForm >= 65) o.action = "drive_kick";
    else if (scoreForm >= 70 && conf >= 65) o.action = p.offenseStyle === "post" ? "post" : "iso";
  }
}

function wrapTeam(team, side) {
  ensureRoles(team.players || []);
  const roster = team.players.map((p) => {
    const conf = formConfidence(p);
    const tac = formTactical(p);
    const baseMood = clamp(
      48 + (p.personality?.calm || 50) * 0.15 + (p.personality?.fiery || 50) * 0.08,
      35,
      70
    );
    // Carry last-game confidence into tip-off feel / role gravity
    let role = p.roleExpectation || inferPlayerRole(p);
    if (p._formRoleBoost === "alpha") role = "alpha";
    else if (p._formRoleBoost === "starter" && role !== "alpha") role = "starter";
    const baseMin = p.targetMinutes ?? undefined;
    const cardName = p.cardName || p.name;
    return {
      ...structuredClone(p),
      cardName,
      name: cardName,
      roleExpectation: role,
      targetMinutes: baseMin,
      orders: p.orders ? { ...p.orders } : undefined,
      skills: Array.isArray(p.skills) ? [...p.skills] : [],
      shotTend: p.shotTend,
      threeTend: p.threeTend,
      midTend: p.midTend,
      paintTend: p.paintTend,
      offenseStyle: p.offenseStyle,
      confidence: conf,
      tacticalStatus: tac,
      scoreForm: p.scoreForm ?? 50,
      passForm: p.passForm ?? 50,
      lastGame: p.lastGame || null,
      fatigue: 0,
      benchSinceElapsed: null, // game elapsedSec when sat; rest accrues with clock
      tempFocus: 0,
      tempTacticFocus: 0, // shout: possessions left of "execute our tactic"
      hot: conf >= 74 ? 1 : conf <= 34 ? -1 : 0, // -3..+3 手感 streak
      mood: clamp(baseMood + (conf - 50) * 0.28, 30, 88),
      stats: emptyStats(),
      gradeScore: 78,
      grade: "C+",
      gradeLast: null,
    };
  });
  ensureUniqueRosterIds(roster);
  ensureRoles(roster);
  ensurePlayerOrders(roster);
  // 技能带来的能力加成（半兽人等）：只作用于本场比赛副本
  for (const p of roster) applySkillAttributeBoosts(p);
  // Auto-mode: hot scorers lean score; feeders lean organize / kick
  for (const p of roster) {
    applyFormAutoOrders(p);
  }
  const active = roster.filter((p) => !(p.injuredGames > 0));
  const injured = roster.filter((p) => p.injuredGames > 0);
  let onCourt;
  let bench;
  const starterIds = team.starterIds || [];
  if (starterIds.length >= 5) {
    const pick = starterIds
      .map((id) => active.find((p) => p.id === id))
      .filter(Boolean)
      .slice(0, 5);
    // Fill remaining slots from healthy pool
    if (pick.length < 5) {
      const have = new Set(pick.map((p) => p.id));
      const fillers = [...active]
        .filter((p) => !have.has(p.id))
        .sort((a, b) => overall(b) - overall(a));
      while (pick.length < 5 && fillers.length) pick.push(fillers.shift());
    }
    if (pick.length >= 5) {
      onCourt = pick.slice(0, 5);
      const onIds = new Set(onCourt.map((p) => p.id));
      bench = active.filter((p) => !onIds.has(p.id)).concat(injured);
    }
  }
  if (!onCourt) {
    const sorted = [...active].sort((a, b) => overall(b) - overall(a));
    onCourt = sorted.slice(0, 5);
    bench = sorted.slice(5).concat(injured);
  }
  // 巨星队超额订分钟 → 按首发/OVR 排出真实轮换（只改本场副本）
  fitMinuteBudget(roster, { starterIds: onCourt.map((p) => p.id), rank: overall });
  const coach = composeStaff(team.coach, team.assistant);
  const tactics = coach ? coachTactics(coach) : [TACTICS.balanced];
  const tactic = tactics[0];
  return {
    side,
    name: team.name,
    roster,
    onCourt,
    bench,
    coach,
    tactic,
    lineupPacks: team.lineupPacks || null,
    gameplan: team.gameplan || null,
    chem: teamChemistry(onCourt, { primaryId: team.gameplan?.offenseFocusId || null }),
    fit: lineupFit(onCourt, coach, tactic, { primaryId: team.gameplan?.offenseFocusId || null }),
    morale: clamp(55 + (coach?.buffs?.morale || 0), 20, 90),
    temp: { ttl: 0 },
  };
}

function publicTeam(t) {
  return {
    name: t.name,
    side: t.side,
    chem: t.chem,
    fit: t.fit,
    morale: t.morale,
    tactic: t.tactic,
    coach: t.coach,
    onCourt: t.onCourt.map(slim),
    bench: t.bench.map(slim),
    roster: t.roster.map(slim),
  };
}

/** 同队重复卡（同 id）拆成唯一实例，否则换人/统计会串号 */
function ensureUniqueRosterIds(roster) {
  const seen = new Set();
  for (const p of roster || []) {
    if (!p?.id) continue;
    if (!seen.has(p.id)) {
      seen.add(p.id);
      continue;
    }
    let n = 2;
    let nid;
    do {
      nid = `${p.id}#${n++}`;
    } while (seen.has(nid));
    p.instanceDup = true;
    p.id = nid;
    seen.add(nid);
  }
}

function shortTeamTag(teamName, side, otherName) {
  const short = (n) => {
    const s = String(n || "").trim();
    if (!s) return side === "home" ? "主" : "客";
    if (/[\u4e00-\u9fff]/.test(s)) return s.length <= 2 ? s : s.slice(-2);
    return s.length <= 4 ? s : s.slice(0, 3);
  };
  const a = short(teamName);
  const b = short(otherName);
  if (a === b) return side === "home" ? "主" : "客";
  return a;
}

function seasonShort(p) {
  const s = p?.season;
  if (s == null || s === "") return "";
  const y = String(s);
  return y.length >= 2 ? `'${y.slice(-2)}` : y;
}

/**
 * 战报用显示名：两边同名 →「湖人·詹姆斯」；同队两张同名卡 →「詹姆斯('95)」或「詹姆斯#2」。
 * 只改本场 sim 副本的 name，名单卡面原名在 cardName。
 */
function assignFeedDisplayNames(home, away) {
  if (!home?.roster || !away?.roster) return;
  const entries = [
    ...home.roster.map((p) => ({ p, side: "home", team: home.name })),
    ...away.roster.map((p) => ({ p, side: "away", team: away.name })),
  ];
  for (const e of entries) {
    if (!e.p.cardName) e.p.cardName = e.p.name;
    e.p.name = e.p.cardName;
    e.base = String(e.p.cardName || "?").trim() || "?";
  }

  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.base)) groups.set(e.base, []);
    groups.get(e.base).push(e);
  }

  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    const onHome = group.some((g) => g.side === "home");
    const onAway = group.some((g) => g.side === "away");
    const crossTeam = onHome && onAway;

    for (const side of ["home", "away"]) {
      const sideGroup = group.filter((g) => g.side === side);
      if (!sideGroup.length) continue;
      const multi = sideGroup.length > 1;
      const seasons = sideGroup.map((g) => String(g.p.season ?? ""));
      const seasonOk =
        multi &&
        seasons.every((s) => s) &&
        new Set(seasons).size === sideGroup.length;

      sideGroup.forEach((e, i) => {
        let core = e.base;
        if (multi) {
          if (seasonOk) core = `${e.base}(${seasonShort(e.p)})`;
          else core = `${e.base}#${i + 1}`;
        }
        if (crossTeam) {
          const tag = shortTeamTag(
            e.team,
            e.side,
            e.side === "home" ? away.name : home.name
          );
          e.p.name = `${tag}·${core}`;
        } else {
          e.p.name = core;
        }
      });
    }
  }
}

function slim(p) {
  const s = p.stats || emptyStats();
  const fgPct = s.fga ? Math.round((s.fgm / s.fga) * 100) : null;
  ensureGrade(p);
  return {
    id: p.id,
    name: p.name,
    cardName: p.cardName || p.name,
    season: p.season,
    pos: p.pos,
    playPos: p.playPos || p.pos,
    team: p.team,
    franchiseId: p.franchiseId || null,
    photo: p.photo,
    nbaId: p.nbaId,
    scoring: p.scoring,
    defense: p.defense,
    pass: p.pass,
    rebound: p.rebound,
    steal: p.steal,
    block: p.block,
    speed: p.speed,
    strength: p.strength,
    roleExpectation: p.roleExpectation || null,
    targetMinutes: p.targetMinutes ?? null,
    orders: p.orders ? { ...p.orders } : null,
    skills: Array.isArray(p.skills) ? [...p.skills] : [],
    intangibles: p.intangibles,
    fatigue: Math.round(p.fatigue),
    fatigueNote: fatigueTierNote(p),
    stamina: p.stamina ?? null,
    ironLungs: hasEliteStaminaSkill(p) || fatigueResist(p) >= 92,
    hot: p.hot || 0,
    mood: Math.round(p.mood ?? 50),
    hotLabel: hotLabel(p.hot || 0),
    moodLabel: moodLabel(p.mood ?? 50),
    confidence: Math.round(formConfidence(p)),
    confidenceLabel: confidenceLabel(p.confidence),
    tacticalStatus: Math.round(formTactical(p)),
    tacticalLabel: tacticalLabel(p.tacticalStatus),
    lastGame: p.lastGame || null,
    grade: p.grade || gradeLetter(p.gradeScore),
    gradeScore: Math.round(p.gradeScore ?? 78),
    gradeTone: gradeTone(p.grade || gradeLetter(p.gradeScore)),
    gradeLast: p.gradeLast || null,
    fgPct,
    stats: { ...s, min: Math.round(s.min) },
    overall: overall(p),
    injuredGames: p.injuredGames || 0,
    injuryStatus: p.injuryStatus || null,
    valueArchetype: p.valueArchetype || null,
  };
}

function hotLabel(hot) {
  if (hot <= -3) return "冰冻";
  if (hot === -2) return "手感冰";
  if (hot === -1) return "偏冷";
  if (hot === 0) return "平稳";
  if (hot === 1) return "渐热";
  if (hot === 2) return "火热";
  return "爆表";
}

function moodLabel(mood) {
  if (mood < 35) return "低落";
  if (mood < 48) return "沉闷";
  if (mood < 58) return "平静";
  if (mood < 72) return "兴奋";
  return "高昂";
}

function registerShotFeel(baller, made) {
  if (made) {
    baller.hot = clamp((baller.hot || 0) + 1, -3, 3);
    baller.mood = clamp((baller.mood ?? 50) + 4 + Math.max(0, baller.hot), 15, 95);
  } else {
    baller.hot = clamp((baller.hot || 0) - 1, -3, 3);
    baller.mood = clamp((baller.mood ?? 50) - 3 - (baller.hot < 0 ? 1 : 0), 15, 95);
  }
}

/** 战报/招牌是否算灌篮（暴扣、砸筐等） */
function isDunkFinish(label, baller = null) {
  const text = `${label || ""} ${baller?._sigLabel || ""}`;
  if (/暴扣|灌篮|砸筐|劈扣|钉板|起飞|泰山压顶|暴力灌篮|空接暴扣|隔扣/.test(text)) return true;
  // 招牌灌篮技触发时 label 常为技能名
  const sk = baller?.skills || [];
  if (
    baller?._sigMakeBoost &&
    (sk.includes("poster_slam") || sk.includes("mountain_slam") || sk.includes("lob_finisher"))
  ) {
    return true;
  }
  return false;
}

/**
 * 灌篮 / 盖帽：点燃全队士气与信心（场上为主，板凳也吃一点）。
 * @param {"dunk"|"block"} kind
 */
function sparkTeamFromHighlight(team, kind, hero, emitFn = null) {
  if (!team) return;
  const dunk = kind === "dunk";
  const moraleBump = dunk ? 3.8 : 3.4;
  const moodOn = dunk ? 4.2 : 3.8;
  const moodBench = dunk ? 1.8 : 1.6;
  const confOn = dunk ? 2.8 : 2.5;
  const confBench = dunk ? 1.2 : 1.1;
  team.morale = clamp((team.morale || 50) + moraleBump, 0, 100);
  for (const p of team.onCourt || []) {
    const heroMul = hero && p.id === hero.id ? 1.55 : 1;
    p.mood = clamp((p.mood ?? 50) + moodOn * heroMul, 15, 95);
    p.confidence = clamp((Number(p.confidence) || 50) + confOn * heroMul, 25, 95);
    if (hero && p.id === hero.id) {
      p.hot = clamp((p.hot || 0) + 1, -3, 3);
    } else if (Math.random() < 0.35) {
      p.hot = clamp((p.hot || 0) + 1, -3, 3);
    }
  }
  for (const p of team.bench || []) {
    p.mood = clamp((p.mood ?? 50) + moodBench, 15, 95);
    p.confidence = clamp((Number(p.confidence) || 50) + confBench, 25, 95);
  }
  if (typeof emitFn === "function" && hero) {
    emitFn(
      "coach",
      dunk
        ? `${hero.name} 灌篮点燃全队——士气与信心一起上扬！`
        : `${hero.name} 盖帽振奋全队——防线士气与信心大涨！`
    );
  }
}

/** 壮硕下盘 vs 瘦高外线/锋线 */
function isSturdy(p) {
  return (p.strength || 50) >= 70 && (p.speed || 50) <= 78;
}
function isLanky(p) {
  return (p.strength || 50) <= 58 && ((p.block || 40) >= 55 || (p.speed || 50) >= 72 || ["SF", "PF", "C"].includes(p.playPos || p.pos));
}

function addMinutes(off, def, used) {
  const mins = used / 60;
  for (const p of off.onCourt) {
    p.stats.min += mins;
    p.stats.pm += 0; // updated on scores
  }
  for (const p of def.onCourt) p.stats.min += mins;
}

function applyPlusMinus(scoringSide, other, pts) {
  for (const p of scoringSide.onCourt) p.stats.pm += pts;
  for (const p of other.onCourt) p.stats.pm -= pts;
}

/** 场上三分最有把握的人：手感 + 出手信心 + 关键 + 热区 */
function bestThreeShooter(onCourt) {
  const list = onCourt || [];
  if (!list.length) return null;
  let best = null;
  let bestScore = -1;
  for (const p of list) {
    const three = p.three || 40;
    const tend = p.threeTend ?? clamp(Math.round(three * 0.55), 1, 80);
    if (three < 48 && tend < 28) continue; // 砖匠不进候选
    const clutch = p.clutch || p.intangibles?.clutch || 50;
    const hot = p.hot || 0;
    const conf = typeof formConfidence === "function" ? formConfidence(p) : 50;
    const score =
      three * 1.35 +
      tend * 0.55 +
      clutch * 0.4 +
      hot * 10 +
      conf * 0.28 +
      (p.offenseStyle === "stretch" || p.offenseStyle === "spot" ? 8 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  // 无人够格时退回场上 three 最高
  if (!best) {
    return [...list].sort((a, b) => (b.three || 0) - (a.three || 0))[0] || null;
  }
  return best;
}

/**
 * 终场局势：落后分差 / 是否抢攻 / 是否需要三分 / 是否该战术犯规。
 * side = 评估方（进攻或防守均可）。
 */
function lateGameInfo(sim, side) {
  const other = side.side === "home" ? sim.away : sim.home;
  const deficit = (sim.score[other.side] || 0) - (sim.score[side.side] || 0);
  const q = sim.quarter || 1;
  const clock = sim.clock || 0;
  const late = q >= 4 || (q === 3 && clock <= 90);
  // 分差不大：末节/加时落后 1–9，时间越紧窗口越大
  const chasing =
    late &&
    deficit >= 1 &&
    deficit <= 9 &&
    (clock <= 150 || (deficit <= 6 && clock <= 200) || (deficit <= 3 && clock <= 240));
  // 需要三分翻盘 / 扳平：落后 3；或 4–6 且时间极紧；或最后一投要三分
  const needThree =
    chasing &&
    ((deficit === 3 && clock <= 90) ||
      (deficit >= 4 && deficit <= 6 && clock <= 48) ||
      (deficit >= 1 && deficit <= 2 && clock <= 18) ||
      (deficit >= 1 && deficit <= 3 && clock <= 12));
  // 战术犯规：本方落后、对方持球，有机会犯规后抢攻三分翻盘
  const wantIntentionalFoul =
    late &&
    deficit >= 1 &&
    deficit <= 6 &&
    clock <= 36 &&
    clock > 2 &&
    (deficit <= 3 || clock <= 24);
  return { deficit, clock, late, chasing, needThree, wantIntentionalFoul };
}

/**
 * 落后方终场脚本：进攻抢攻 + 指定射手；防守侧战术犯规。
 * @returns {boolean} true = 本回合已被战术犯规吃掉，勿继续 resolvePossession
 */
function applyLateGameScripts(sim, off, def) {
  if (!off.temp) off.temp = {};
  if (!def.temp) def.temp = {};

  const offInfo = lateGameInfo(sim, off);
  if (offInfo.chasing) {
    const shooter = bestThreeShooter(off.onCourt);
    const needThree = !!offInfo.needThree;
    off.temp.lateChase = {
      needThree,
      shooterId: shooter?.id || null,
      paceBoost: true,
      deficit: offInfo.deficit,
    };
    // 同步到你方 UI：焦点战术 + 持球人
    if (off === sim.you() && shooter) {
      if (needThree) {
        sim.focusPlay = { id: "pace_three", label: "终场抢攻三分", ttl: 10 };
      }
      sim.offenseFocusId = shooter.id;
      if (!off.gameplan) off.gameplan = {};
      off.gameplan.offenseFocusId = shooter.id;
    }
    const key = `${off.side}:${Math.floor((sim.clock || 0) / 20)}:${needThree ? "3" : "c"}`;
    if (sim._lateChaseAnnounce !== key) {
      sim._lateChaseAnnounce = key;
      if (needThree && shooter) {
        sim.emit(
          "coach",
          `落后 ${offInfo.deficit} 分 · 终场抢攻三分：球给 ${shooter.name}`
        );
      } else if (shooter) {
        sim.emit("coach", `落后 ${offInfo.deficit} 分 · 终场抢攻提速`);
      } else {
        sim.emit("coach", `落后 ${offInfo.deficit} 分 · 终场抢攻`);
      }
    }
  } else if (off.temp.lateChase) {
    off.temp.lateChase = null;
  }

  // 防守方落后 → 对持球领先方战术犯规
  const defInfo = lateGameInfo(sim, def);
  if (defInfo.wantIntentionalFoul) {
    return tryIntentionalFoul(sim, off, def, defInfo);
  }
  return false;
}

/** 故意犯规停表：罚完球权归落后方，立刻进入抢攻三分窗口 */
function tryIntentionalFoul(sim, off, def, info) {
  const chance = info.clock <= 12 ? 0.92 : info.clock <= 24 ? 0.78 : 0.58;
  if (Math.random() > chance) return false;

  const victim =
    pickBallHandler(off, null, off === sim.you() ? sim.offenseFocusId : null) ||
    off.onCourt[0];
  if (!victim) return false;
  const fouler = pickDefender(def, victim, null) || def.onCourt[0];
  if (!fouler) return false;

  fouler.stats.pf += 1;
  gradeFoul(fouler);
  const used = rand(1, 3);
  sim.clock = Math.max(0, sim.clock - used);
  sim.elapsedSec = (sim.elapsedSec || 0) + used;
  addMinutes(off, def, used);

  sim.emit(
    "coach",
    `战术犯规！${fouler.name} 故意犯规 ${victim.name}（落后 ${info.deficit} 分抢时间）`
  );
  // 布置下一回合：落后方拿到球权后强制三分抢攻
  const shooter = bestThreeShooter(def.onCourt);
  if (!def.temp) def.temp = {};
  def.temp.lateChase = {
    needThree: true,
    shooterId: shooter?.id || null,
    paceBoost: true,
    deficit: info.deficit,
  };
  if (def === sim.you() && shooter) {
    sim.focusPlay = { id: "pace_three", label: "犯规后抢攻三分", ttl: 10 };
    sim.offenseFocusId = shooter.id;
    if (!def.gameplan) def.gameplan = {};
    def.gameplan.offenseFocusId = shooter.id;
  }
  if (shooter) {
    sim.emit("coach", `犯规后三分布置：球给 ${shooter.name}`);
  }

  shootFts(victim, off, sim, 2);
  return true;
}

function shootFts(baller, off, sim, n) {
  const def = off.side === "home" ? sim.away : sim.home;
  for (let i = 0; i < n; i++) {
    baller.stats.fta += 1;
    if (Math.random() < baller.ft) {
      baller.stats.ftm += 1;
      baller.stats.pts += 1;
      sim.score[off.side] += 1;
      applyPlusMinus(off, def, 1);
      gradeFtMake(baller);
      sim.emit("score", `${baller.name} 罚球命中 ${sim.score.home}-${sim.score.away}`);
    } else {
      gradeFtMiss(baller);
      sim.emit("miss", `${baller.name} 罚球不中`);
      if (i === n - 1) {
        resolveRebound(off, def, sim, false);
        return;
      }
    }
  }
  sim.possession = flip(off.side);
}

/**
 * Hothead / low-composure technical. Returns true if possession was consumed.
 * Tech → 对方罚 1 球，球权给对方（简化）。
 */
function maybeTechnicalFoul(sim, off, def, baller, defender) {
  const candidates = [];
  for (const p of [...(off.onCourt || []), ...(def.onCourt || [])]) {
    const c = skillTechChance(p);
    if (c > 0) candidates.push({ p, c, side: off.onCourt.includes(p) ? off : def });
  }
  if (!candidates.length) return false;
  // Weight toward engaged players (baller / defender) and hotheads
  for (const row of candidates) {
    let chance = row.c * 0.55;
    if (row.p === baller || row.p === defender) chance *= 1.6;
    if (Math.random() >= chance) continue;
    const offender = row.p;
    const offenderSide = row.side;
    const victimSide = offenderSide === off ? def : off;
    offender.stats.pf += 1;
    gradeFoul(offender);
    const shooter =
      [...victimSide.onCourt].sort((a, b) => (b.ft || 0.7) - (a.ft || 0.7))[0] || victimSide.onCourt[0];
    sim.emit(
      "coach",
      `${offender.name} 情绪失控吃到技术犯规！${
        (offender.skills || []).includes("hothead") ? "（火爆脾气）" : ""
      }`
    );
    if (shooter) shootFts(shooter, victimSide, sim, 1);
    else sim.possession = flip(offenderSide.side);
    return true;
  }
  return false;
}

/** Who cleans the glass — size matters, but not 25-rpg monopolies. */
function reboundContestWeight(p, { offensive = false } = {}) {
  const rating = Math.max(12, p.rebound || 40);
  // Milder curve: elite bigs win more boards without vacuuming every miss
  let w = Math.pow(rating / 50, 1.75) * 36;
  const pos = p.playPos || p.pos || "";
  if (pos === "C") w *= 1.38;
  else if (pos === "PF") w *= 1.22;
  else if (pos === "SF") w *= 1.0;
  else if (pos === "SG") w *= 0.7;
  else if (pos === "PG") w *= 0.55;
  if ((p.heightCm || 0) >= 208) w *= 1.08;
  if ((p.heightCm || 0) >= 213) w *= 1.08;
  if ((p.strength || 50) >= 78) w *= 1.06;
  if (p.offenseStyle === "post") w *= 1.08;
  // Motor / hustle helps OREB a bit; DREB leans on size already
  if (offensive) {
    w *= 0.85 + ((p.intangibles?.motor || 50) / 100) * 0.35;
    // 蓝领冲抢二次：显著提高进攻篮板权重
    if (isHustleOffense(p)) w *= 1.85;
  } else {
    w += (p.defense || 50) * 0.08;
    if (isAllOutDefense(p)) w *= 1.12;
  }
  // Soft diminishing returns so one big can't average 25 rpg
  const already = Number(p.stats?.reb) || 0;
  if (already >= 8) w /= 1 + (already - 7) * 0.12;
  w *= fatiguePerfMult(p);
  w *= skillReboundMult(p, { offensive });
  return Math.max(0.5, w);
}

function resolveRebound(off, def, sim, afterBlock) {
  // Team ORB rate: bigger frontcourts crash more; 冲板指令再抬一档
  const offSize = avg(off.onCourt.map((p) => p.rebound || 50));
  const defSize = avg(def.onCourt.map((p) => p.rebound || 50));
  const crashers = (off.onCourt || []).filter(isHustleOffense).length;
  const tacticOrb = Number(off.tactic?.orbBoost) || 0;
  const crashTactic =
    off.tactic?.id === "crash_boards" || off.tactic?.id === "second_chance" ? 0.025 : 0;
  const offReb =
    (afterBlock ? 0.16 : 0.2) +
    (offSize - defSize) * 0.0022 +
    avg(off.onCourt.map((p) => (["C", "PF"].includes(p.playPos || p.pos) ? 0.025 : 0))) +
    crashers * 0.032 +
    tacticOrb +
    crashTactic;
  if (Math.random() < clamp(offReb, 0.1, 0.42)) {
    const reb = weighted(off.onCourt, (p) => reboundContestWeight(p, { offensive: true }));
    reb.stats.reb += 1;
    reb.stats.oreb += 1;
    gradeOreb(reb);
    const crash = isHustleOffense(reb);
    if (crash) {
      off.temp = off.temp || {};
      off.temp.crashPutbackId = reb.id;
      off.temp.crashPutbackTtl = 1;
    }
    sim.emit("reb", crash ? `${reb.name} 冲到进攻篮板，准备二次进攻` : `${reb.name} 抢到进攻篮板`);
    sim.clock = Math.max(0, sim.clock - 3);
    // keep possession
  } else {
    const reb = weighted(def.onCourt, (p) => reboundContestWeight(p, { offensive: false }));
    reb.stats.reb += 1;
    reb.stats.dreb += 1;
    gradeDreb(reb);
    sim.emit("reb", `${reb.name} 抢到防守篮板`);
    sim.possession = flip(off.side);
  }
}

/** Coach offense slider 0–18 → hunt-opportunity intensity 0–1. */
function offenseHuntLevel(coach, baller = null) {
  let h = clamp((Number(coach?.buffs?.offense) || 8) / 18, 0, 1);
  const oh = baller?.orders?.hunt;
  if (oh === "hunt") h = clamp(h + 0.28, 0, 1);
  if (oh === "patient") h = clamp(h * 0.45, 0, 1);
  return h;
}

/** Coach defense slider 0–18 → defensive press intensity 0–1. */
function defensePressLevel(coach) {
  return clamp((Number(coach?.buffs?.defense) || 8) / 18, 0, 1);
}

function isOffenseOriented(p) {
  if (!p) return false;
  const arch = p.archetype || "";
  if (/iso_|scorer|creator|shooter|versatile_scorer|mamba|goat|engine/.test(arch)) return true;
  return (p.scoring || 50) >= 78;
}

function lineupOffenseShare(onCourt) {
  const list = onCourt || [];
  if (!list.length) return 0.4;
  return list.filter(isOffenseOriented).length / list.length;
}

function playerOffenseSkill(p) {
  const shoot = ((p.three || 50) + (p.mid || 50) + (p.paint || 50)) / 3;
  return (p.scoring || 50) * 0.55 + shoot * 0.25 + (p.iq || 50) * 0.1 + (p.clutch || 50) * 0.1;
}

/** Effective fatigue resistance — elite motors (Westbrook) shrug off press. */
function fatigueResist(p) {
  let r =
    (p.stamina || 70) * 0.5 +
    (p.intangibles?.motor || 50) * 0.35 +
    (p.intangibles?.toughness || 50) * 0.15 +
    // Usage engines / high-steal athletes keep running
    Math.min(12, ((p.raw?.spg || 0) + (p.raw?.apg || 0) * 0.15) * 3);
  const name = `${p.nameEn || ""} ${p.name || ""}`.toLowerCase();
  const bref = String(p.bref || "").toLowerCase();
  // Known iron lungs / perennial motors
  if (bref === "westbru01" || /westbrook|威少|威斯布鲁克/.test(name)) r = Math.max(r, 94);
  if (bref === "jordami01" || /michael jordan|乔丹/.test(name)) r = Math.max(r, 92);
  if (/kobe bryant|科比/.test(name) || bref === "bryanko01") r = Math.max(r, 90); // not bare "kobe": Bufkin and Brown are different people
  // 技能牌：铁肺 / 永动机才是真正的高体力档
  if ((p.skills || []).includes("iron_lungs")) r = Math.max(r, 97);
  if ((p.skills || []).includes("motor_engine")) r = Math.max(r, 91);
  return clamp(r, 28, 99);
}

/**
 * Performance multiplier from fatigue.
 * Typical athlete: ~60 soft hit, ~80 starts sliding, ~100 is awful.
 * Elite stamina (fatigueResist) pushes thresholds later and raises the floor —
 * iron lungs barely notice mid-game gas, soft legs need rotation.
 */
function fatiguePerfMult(p) {
  const fat = clamp(Number(p?.fatigue) || 0, 0, 100);
  const resist = fatigueResist(p);
  // Baseline athlete (~resist 60): soft @60, hard @80. Iron lungs push both later.
  const softStart = clamp(60 + (resist - 60) * 0.35, 52, 78);
  const hardStart = clamp(80 + (resist - 60) * 0.32, 72, 93);
  const softMax = clamp(0.07 - (resist - 60) * 0.0007, 0.03, 0.08);
  const floor = clamp(0.42 + (resist - 40) * 0.0065, 0.4, 0.82);
  if (fat < softStart) return 1;
  if (fat < hardStart) {
    const t = (fat - softStart) / Math.max(1e-6, hardStart - softStart);
    // At the soft threshold already a whisper of tax ("一点点折扣")
    return 1 - softMax * (0.12 + 0.88 * t * t);
  }
  const softEnd = 1 - softMax;
  const t = (fat - hardStart) / Math.max(1e-6, 100 - hardStart);
  return softEnd - (softEnd - floor) * Math.pow(t, 1.35);
}

/** UI / feed tag: 略损 → 下滑 → 透支 */
function fatigueTierNote(p) {
  const m = fatiguePerfMult(p);
  if (m >= 0.99) return "";
  if (m >= 0.95) return "略损";
  if (m >= 0.78) return "下滑";
  return "透支";
}

/**
 * 体质微调（无铁肺/永动机时只能轻微偏离 1.0）。
 * 标定：普通球员连场约 8 分钟疲劳到 ~60。
 */
function fatigueAccumFactor(p) {
  const resist = fatigueResist(p);
  // 有高体力技能时再吃一层体质优惠；普通人几乎按标定烧
  if (hasEliteStaminaSkill(p)) {
    return clamp(1.05 - (resist - 70) * 0.008, 0.55, 1.0);
  }
  return clamp(1.08 - (resist - 55) * 0.0025, 0.92, 1.18);
}

/**
 * Apply end-of-possession fatigue.
 * 重耗集中在「持球终结 / 主防」；无球站位与纯传球很轻。
 * 降速（grind / 拖慢节奏）时：没参与进攻或只传球的人几乎不耗体能。
 */
function applyPossessionFatigue(
  off,
  def,
  baller,
  defender,
  {
    hunt = 0.4,
    defPress = 0.4,
    offShare = 0.4,
    wasted = false,
    organizerId = null,
    assisterId = null,
    scheme = null,
    tempoId = "normal",
    slowFocus = false,
    pushFocus = false,
  } = {}
) {
  const load = off.coach?.buffs?.stamina < 0 ? 1.12 : off.coach?.buffs?.stamina > 4 ? 0.92 : 1;
  const tempo = getTempoDef(tempoId);
  const grinding = slowFocus || tempo?.id === "grind";
  const pushing = pushFocus || tempo?.id === "push";
  // 降速半场：走位多、冲刺少 → 无球/传球税大幅下调
  const jogScale = grinding ? 0.32 : pushing ? 1.15 : 1;
  const passScale = grinding ? 0.28 : pushing ? 1.1 : 1;
  const createScale = grinding ? 0.88 : pushing ? 1.12 : 1;
  const weakDefScale = grinding ? 0.4 : pushing ? 1.12 : 1;

  // 慢跑税（过半场折返 / 弱侧站桩）
  const JOG = 0.22 * jogScale;
  // 纯传球 / 发动点（不是终结者）——本来就不该累
  const PASS_ONLY = 0.38 * passScale;
  // 协防等次级对抗
  const SECONDARY = 0.85;
  // 主攻创造基线
  const CREATE = 2.2 * createScale;
  // 主防追防基线
  const PRIMARY_D = 2.15;
  const burnOf = (p) => skillFatigueMult(p) * fatigueAccumFactor(p) * load;

  const skill = playerOffenseSkill(baller);
  let huntCost = 0;
  if (hunt >= 0.35) {
    const weak = Math.max(0, (76 - skill) / 40);
    huntCost = hunt * (0.32 + weak * 1.9);
    if (wasted) huntCost *= 1.25;
    if (offShare >= 0.6) huntCost *= 0.45;
    else if (offShare >= 0.4) huntCost *= 0.75;
    if (grinding) huntCost *= 0.75; // 降速少仓促强打
  }

  const usage = baller?.orders?.usage || "auto";
  const action = baller?.orders?.action || "auto";
  const attack = baller?.orders?.attack || "auto";
  const pHunt = baller?.orders?.hunt || "auto";
  let styleMult = 1;
  if (usage === "score") styleMult += 0.22;
  else if (usage === "organize") styleMult -= 0.18;
  else if (usage === "balanced") styleMult -= 0.05;
  else if (usage === "defend") styleMult -= 0.15;
  else if (usage === "hustle") styleMult -= 0.06;
  if (action === "iso" || action === "post") styleMult += 0.12;
  if (action === "drive_kick" || action === "spot") styleMult -= 0.08;
  if (action === "crash") styleMult += 0.1;
  if (attack === "foul_hunt" || attack === "paint" || attack === "putback") styleMult += 0.1;
  if (pHunt === "hunt") styleMult += 0.14;
  if (pHunt === "patient") styleMult -= 0.1;
  if (hunt >= 0.5) styleMult += (hunt - 0.4) * 0.3;
  styleMult = clamp(styleMult, 0.7, 1.45);

  // —— 进攻方 ——
  for (const p of off.onCourt || []) {
    const m = burnOf(p);
    const isBaller = baller && p.id === baller.id;
    const isOrganizer = organizerId && p.id === organizerId && !isBaller;
    const isAssister = assisterId && p.id === assisterId && !isBaller;
    const pUsage = p.orders?.usage || "auto";
    const pAction = p.orders?.action || "auto";
    const pAttack = p.orders?.attack || "auto";
    const isHustle =
      pUsage === "hustle" ||
      pAction === "crash" ||
      pAttack === "putback" ||
      isHustleOffense(p);
    // 持球人若本回合只是组织传球、球已分出且自己不是终结者——按传球税
    // （baller 仍是终结者时走 CREATE）
    let tax;
    if (isBaller) {
      tax = (CREATE + huntCost) * styleMult * m;
    } else if (isOrganizer || isAssister) {
      // 只传球 / 发动：降速时近乎走路传球
      const pnrBump = scheme === "pnr" || scheme === "drive_kick" ? 1.08 : 1;
      tax = PASS_ONLY * pnrBump * m;
    } else if (isHustle) {
      tax = (JOG + 0.45 * (grinding ? 0.55 : 1)) * m;
    } else {
      // 没参与进攻：弱侧定点 / 折返慢跑
      tax = JOG * m;
      if (pAction === "spot" || pUsage === "defend") tax *= 0.75;
      if (grinding) tax *= 0.7; // 磨阵地时站桩几乎不耗
    }
    p.fatigue = Math.min(100, (p.fatigue || 0) + tax);
  }
  if (baller) {
    baller.mood = clamp((baller.mood ?? 50) - (baller.fatigue || 0) * 0.015, 15, 95);
  }

  // —— 防守方 ——
  for (const p of def.onCourt || []) {
    const m = burnOf(p);
    const isPrimary = defender && p.id === defender.id;
    const df = p.orders?.defFocus || "auto";
    const pUsage = p.orders?.usage || "auto";
    const helping =
      !isPrimary &&
      (df === "help" ||
        df === "allout" ||
        df === "onball" ||
        df === "deny" ||
        pUsage === "defend" ||
        pUsage === "hustle" ||
        isAllOutDefense(p));
    let tax;
    if (isPrimary) {
      tax = PRIMARY_D * (grinding ? 0.92 : 1) * m;
      tax += defPress * 0.6 * m;
      let chase = 0.4 + defPress * 0.45;
      if (df === "onball") chase += 0.35;
      if (df === "deny") chase += 0.3;
      if (df === "allout") chase += 0.45;
      if (df === "smart") chase += 0.12;
      if (df === "help") chase -= 0.08;
      if (pUsage === "defend") chase += 0.2;
      if (pUsage === "hustle") chase += 0.25;
      if (isAllOutDefense(p)) chase += 0.12;
      chase += Math.max(0, (baller?.speed || 50) - (p.speed || 50)) * 0.01;
      if (usage === "score" || pHunt === "hunt" || action === "iso") chase += 0.2;
      if (grinding) chase *= 0.85;
      tax += Math.max(0.25, chase) * m;
    } else if (helping) {
      tax = (SECONDARY * (grinding ? 0.7 : 1) + defPress * 0.28) * m;
      if (df === "allout" || isAllOutDefense(p)) tax += 0.35 * m;
    } else {
      // 弱侧跟防：降速半场时几乎站着看
      tax = JOG * weakDefScale * (1 + defPress * 0.12) * m;
    }
    p.fatigue = Math.min(100, (p.fatigue || 0) + tax);
  }
}

function pickBallHandler(off, focusPlay = null, offenseFocusId = null) {
  const autonomy = off.coach?.playerAutonomy ?? 40;
  const spark = off.coach?.sparkPotential ?? 40;
  const teamHunt = offenseHuntLevel(off.coach);
  const offShare = lineupOffenseShare(off.onCourt);
  const focus = focusPlay;
  const tacticHold = clamp(off.temp?.tacticHold || 0, 0, 1);
  return weighted(off.onCourt, (p) => {
    const hunt = offenseHuntLevel(off.coach, p);
    // High-autonomy / obscure staff: stars & high-growth get freer usage (奇效)
    const growth = p.intangibles?.growthPotential ?? p.growth ?? 50;
    // Soft star gravity — avoid 50+ FGA vacuums
    const starBias =
      Math.max(0, p.scoring - 80) * 0.7 + Math.max(0, (p.intangibles?.killerInstinct || 50) - 65) * 0.6;
    let freeFloor = (autonomy / 100) * (0.3 * growth + 0.35 * starBias + spark * 0.12);
    // Shout: suppress freelancing so ball finds the tactic / assigned roles
    const locked = (p.tempTacticFocus || 0) > 0;
    if (tacticHold > 0 || locked) {
      freeFloor *= 1 - tacticHold * 0.9;
      if (locked) freeFloor *= 0.35;
    }
    // Overpaid paper stars hog usage; bargains get quieter but efficient touches via impact
    const impact = p.intangibles?.winningImpact ?? 50;
    let hog = p.valueArchetype === "overpaid" ? 1.12 : p.valueArchetype === "bargain" ? 0.94 : 1;
    if (tacticHold > 0.4 && p.valueArchetype === "overpaid") hog *= 1 - tacticHold * 0.12;
    const ballNeed = p.intangibles?.ballNeed ?? 50;
    // Ball-hungry stars demand touches even when it hurts the fit — shout dampens this
    let demand = 0.85 + ballNeed * 0.004;
    if (tacticHold > 0) demand = 0.85 + ballNeed * 0.004 * (1 - tacticHold * 0.55);
    const usage = p.orders?.usage || "auto";
    const action = p.orders?.action || "auto";
    // Organize → pass weight; score → scoring weight; defend → stay off-ball
    const scoreW =
      usage === "organize"
        ? 0.28
        : usage === "score"
          ? 0.62
          : usage === "defend" || usage === "hustle"
            ? 0.2
            : 0.48;
    const passW =
      usage === "organize"
        ? 0.55
        : usage === "score"
          ? 0.22
          : usage === "defend" || usage === "hustle"
            ? 0.26
            : 0.38;
    const fatM = fatiguePerfMult(p);
    // Flatten scoring so 99 vs 80 isn't a 2× touch monopoly
    const scoreFlat = 42 + Math.sqrt(Math.max(0, p.scoring || 50)) * 5.2;
    let w =
      (scoreFlat * scoreW + (p.pass || 50) * passW + (p.iq || 50) * 0.15 + impact * 0.12 + freeFloor) *
      hog *
      demand *
      (0.55 + 0.45 * fatM); // gassed stars still get touches, but scheme leans fresher legs
    // Last-game confidence / tactical status — auto offense feeds the hot hand
    w *= Math.min(1.22, formUsageMult(p));
    if (usage === "auto" || usage === "score") w *= 0.92 + formConfidence(p) * 0.0012;
    if (usage === "defend") w *= 0.62; // lead-defender role: fewer touches
    if (usage === "hustle" || action === "crash") w *= 0.55; // 蓝领：少持球，靠冲板吃饭
    // Volume soft-cap: real stars top out ~25–30 FGA, not 50+
    const fga = Number(p.stats?.fga) || 0;
    if (fga >= 16) w *= Math.pow(0.9, fga - 15);
    if (fga >= 26) w *= 0.45;
    // Past minute budget → fewer touches (forces ball to rest of rotation)
    const tMin = p.targetMinutes ?? 28;
    if ((p.stats?.min || 0) > tMin + 1) w *= 0.35;
    // 攻击欲望：低欲望少要球；专注防守更少触球
    const agg = aggressionLevel(p);
    if (agg <= 0.25) w *= 0.55;
    else if (agg <= 0.4) w *= 0.72;
    else if (agg >= 0.9) w *= 1.1;
    if ((p.skills || []).includes("floor_commander")) w *= 1.14;
    // Drive-kick / PnR organizers still want the rock to start the play
    if (action === "drive_kick" || action === "pnr") w *= 1.18;
    if (action === "spot") w *= 0.82;
    if (action === "crash") w *= 0.72;
    if (action === "iso" || action === "post") w *= 1.12;
    // When shouted: prefer system-fit players and those with explicit orders
    if (tacticHold > 0.25) {
      const fit = systemFitScore(p, off.coach, off.tactic);
      w *= 1 + tacticHold * (fit - 50) * 0.01;
      if (usage !== "auto" || action !== "auto") w *= 1 + tacticHold * 0.12;
    }
    if (locked && (usage !== "auto" || action !== "auto" || offenseFocusId === p.id)) w *= 1.14;
    // 教练指定持球发起人：显著提高持球权重（仍会分球）
    if (offenseFocusId && p.id === offenseFocusId) w *= 2.05;
    else if (offenseFocusId && p.id !== offenseFocusId && (p.orders?.action || "auto") === "auto") w *= 0.88;
    // High hunt = green light: weak / defense-first players also attack when they see a window
    // Shout clamps rogue green-light freelancing back toward the scheme
    const huntScale = 1 - tacticHold * (locked ? 0.7 : 0.45);
    if (hunt > 0.35 && agg >= 0.4) {
      const skill = playerOffenseSkill(p);
      const weakHunger = Math.max(0, (80 - skill) / 55);
      w *= 1 + hunt * (0.12 + weakHunger * 0.95) * huntScale;
      // Offense-heavy lineup: real scorers feast on the same green light
      if (offShare >= 0.55 && skill >= 80) w *= 1 + hunt * 0.4 * offShare * huntScale;
    } else if (teamHunt < 0.35 && usage === "organize") {
      w *= 1.08; // patient offense still finds the organizer
    }
    if (focus?.id === "slow_pace") {
      // Half-court grind: organizers and patient scorers keep the rock longer
      const pHunt = p.orders?.hunt || "auto";
      if (usage === "organize" || usage === "balanced" || pHunt === "patient") w *= 1.16;
      if (usage === "score" && pHunt === "hunt") w *= 0.88;
    }
    if (p.tempFocus > 0) {
      w *= 1.1;
      p.tempFocus -= 1;
    }
    // Possession focus boosts
    if (focus?.id === "iso_star") {
      const best = Math.max(...off.onCourt.map((x) => x.scoring || 0));
      if ((p.scoring || 0) >= best - 2) w *= 1.55;
    }
    if (focus?.id === "post_up" && ["C", "PF"].includes(p.playPos || p.pos)) w *= 1.45;
    if (focus?.id === "hunt_mismatch" && (p.scoring || 0) >= 80) w *= 1.25;
    return Math.max(5, w);
  });
}

function pickDefender(def, baller, plan) {
  return weighted(def.onCourt, (p) => {
    const bp = baller.playPos || baller.pos;
    const dp = p.playPos || p.pos;
    const posBonus = dp === bp ? 20 : 0;
    // 专注防守的人更常被安排领防
    const aggDef = isAllOutDefense(p)
      ? 1.45
      : (p.orders?.usage || "auto") === "defend"
        ? 1.2
        : 1;
    let w = (p.defense + (p.steal || 50) * 0.25 + posBonus) * fatiguePerfMult(p) * aggDef;
    // Bigs should draw frontcourt defenders — not Dana Barros on Dwight
    if (["C", "PF"].includes(bp)) {
      if (dp === "C") w *= 2.1;
      else if (dp === "PF") w *= 1.7;
      else if (dp === "SF") w *= 0.85;
      else if (dp === "SG") w *= 0.45;
      else if (dp === "PG") w *= 0.22;
      w += (p.block || 40) * 0.35 + ((p.heightCm || 190) - 190) * 0.4 + (p.strength || 50) * 0.15;
    } else if (["PG", "SG"].includes(bp)) {
      if (["PG", "SG"].includes(dp)) w *= 1.35;
      if (dp === "C") w *= 0.7;
    }
    const df = p.orders?.defFocus || "auto";
    const usage = p.orders?.usage || "auto";
    if (df === "onball") w *= 1.75;
    if (df === "deny") w *= 1.35;
    if (df === "allout") w *= 1.95;
    if (df === "help") w *= dp === bp ? 0.85 : 1.4;
    if (df === "switch") w *= 1.15;
    if (df === "smart") w *= 1.1 + (p.steal || 50) * 0.002;
    if (usage === "defend") w *= 1.55; // 偏防守 → 优先领防持球人
    if (usage === "hustle") w *= 1.65;
    // 玩家指定对位表：谁防谁
    if (plan?.assignments?.[baller.id] === p.id) {
      w *= 4.2;
    }
    // Explicit focus matchup (defender + target)
    if (plan?.defenderId && plan.defenderId === p.id && plan.targetId === baller.id) {
      w *= 3.4;
    }
    if (plan?.targetId === baller.id) {
      if (plan.scheme === "focus") w *= 2.6;
      if (plan.scheme === "double") w *= 1.8;
      if (plan.scheme === "bump" && isSturdy(p)) w *= 3.2;
    }
    // Prefer sturdy on lanky when bump scheme is set for this baller
    if (plan?.scheme === "bump" && plan?.targetId === baller.id && isLanky(baller) && isSturdy(p)) {
      w *= 1.5;
    }
    return Math.max(1, w);
  });
}

/** Estimated height when physique missing. */
function estHeightCm(p) {
  if (p?.heightCm) return p.heightCm;
  const pos = p?.playPos || p?.pos || "SF";
  return { PG: 188, SG: 196, SF: 203, PF: 208, C: 213 }[pos] || 198;
}

/**
 * Block odds with severe size/position mismatch penalties.
 * A PG rejecting Howard at the rim should be extremely rare.
 */
function calcBlockChance(baller, defender, shot, open, { defPress = 0, skillBonus = 0, sigBoost = 0 } = {}) {
  const blk = defender.block || 40;
  let chance =
    shot.zone === "three"
      ? 0.003 + blk * 0.0001
      : shot.zone === "mid"
        ? 0.01 + blk * 0.0004 + (100 - open * 100) * 0.0002
        : 0.014 + blk * 0.0005 + (100 - open * 100) * 0.00022;
  chance += defPress * 0.008;
  chance += skillBonus;
  chance += sigBoost;

  const htGap = estHeightCm(baller) - estHeightCm(defender);
  const strGap = (baller.strength || 50) - (defender.strength || 50);
  const bPos = baller.playPos || baller.pos || "";
  const dPos = defender.playPos || defender.pos || "";
  const bigOnSmall =
    ["C", "PF"].includes(bPos) && ["PG", "SG"].includes(dPos);
  const guardOnBig = ["PG", "SG"].includes(dPos) && ["C", "PF"].includes(bPos);
  const switchGod = (defender.skills || []).includes("positionless");

  if (shot.zone === "paint") {
    // Vertical + strength mismatch
    if (htGap >= 20) chance *= switchGod ? 0.35 : 0.08;
    else if (htGap >= 12) chance *= switchGod ? 0.55 : 0.18;
    else if (htGap >= 6) chance *= switchGod ? 0.75 : 0.4;
    else if (htGap <= -8) chance *= 1.25; // taller rim protector
    if (strGap >= 25) chance *= switchGod ? 0.75 : 0.45;
    else if (strGap >= 15) chance *= switchGod ? 0.85 : 0.65;
    if (guardOnBig || bigOnSmall) chance *= switchGod ? 0.55 : 0.12;
    if (dPos === "PG" && bPos === "C") chance *= switchGod ? 0.85 : 0.45; // extra crush
    // Elite finishers / post bullies harder to reject
    if ((baller.paint || 0) >= 88) chance *= 0.72;
    if ((baller.strength || 0) >= 82 && (baller.paint || 0) >= 80) chance *= 0.8;
    // Signature bully / mountain already boosted make — also resist blocks
    if ((baller._sigLabel && /霸王步|泰山压顶|梦幻脚步/.test(baller._sigLabel)) || baller._sigMakeBoost > 0.2) {
      chance *= 0.55;
    }
  } else if (shot.zone === "mid") {
    if (htGap >= 15 && ["PG", "SG"].includes(dPos)) chance *= switchGod ? 0.7 : 0.35;
    if (guardOnBig) chance *= switchGod ? 0.85 : 0.5;
  } else {
    // threes: tiny block rate already; size matters less
    if (htGap >= 10) chance *= 0.6;
  }

  chance *= fatiguePerfMult(defender);
  const cap = shot.zone === "paint" ? (guardOnBig ? 0.04 : 0.2) : shot.zone === "mid" ? 0.1 : 0.04;
  return clamp(chance, 0, cap);
}

function pickPasser(off, scorer) {
  const others = off.onCourt.filter((p) => p.id !== scorer.id);
  if (!others.length) return null;
  return weighted(others, (p) => {
    let w = p.pass + p.iq * 0.3;
    if (p.orders?.usage === "organize" || p.orders?.action === "drive_kick") w *= 1.45;
    w *= skillPassWeight(p);
    return w;
  });
}

/** True catch-and-shoot / spacing threat. */
function isFloorShooter(p) {
  if (!p) return false;
  const threeTend = p.threeTend ?? 30;
  const three = p.three || 40;
  return (
    (threeTend >= 42 && three >= 65) ||
    p.offenseStyle === "spot" ||
    p.offenseStyle === "stretch" ||
    p.orders?.action === "spot" ||
    p.orders?.attack === "perimeter"
  );
}

/** Ball-handler who can punish with mid pull-ups. */
function isMidHandler(p) {
  if (!p) return false;
  return (p.mid || 0) >= 70 || (p.midTend || 0) >= 55 || p.offenseStyle === "midiso";
}

/** 弹跳/机动内线分：速度+马达+空接/弹跳技能 */
function springAthleteScore(p) {
  if (!p) return 0;
  let s =
    (p.speed || 50) * 0.42 +
    (p.intangibles?.motor || 50) * 0.28 +
    (p.block || 40) * 0.08 +
    (p.paint || 50) * 0.12;
  const sk = p.skills || [];
  if (sk.includes("spring_board")) s += 16;
  if (sk.includes("lob_finisher")) s += 14;
  if (sk.includes("poster_slam")) s += 8;
  if (sk.includes("paint_finisher") || sk.includes("motor_engine")) s += 5;
  return s;
}

/** 能用弹跳拉开空间的中锋/大前（Amare/Griffin/Jordan 型） */
function isSpringySpacer(p) {
  if (!p) return false;
  const pos = p.playPos || p.pos;
  if (!["C", "PF"].includes(pos)) return false;
  const score = springAthleteScore(p);
  if (score >= 78) return true;
  if ((p.speed || 50) >= 70 && (p.paint || 50) >= 74) return true;
  const sk = p.skills || [];
  return sk.includes("spring_board") || sk.includes("lob_finisher");
}

function onCourtHasPasser(onCourt, excludeId = null) {
  return (onCourt || []).some((p) => p && p.id !== excludeId && isQualityPasser(p));
}

function onCourtSpringyBig(onCourt, excludeId = null) {
  return (onCourt || []).find((p) => p && p.id !== excludeId && isSpringySpacer(p)) || null;
}

/** Haliburton-style: start with organizer, finish with a teammate. */
function kickToTeammate(off, organizer, offenseFocusId = null, scheme = null) {
  const others = (off.onCourt || []).filter((p) => p.id !== organizer.id);
  if (!others.length) return null;
  const pnrOrKick = scheme === "pnr" || scheme === "drive_kick";
  const organizerIsPasser = isQualityPasser(organizer);
  return weighted(others, (p) => {
    const threeTend = p.threeTend ?? 30;
    // Prefer real shooters for kick-outs — low-3PT-tend bigs almost never get the swing
    let w =
      (p.scoring || 50) * 0.3 +
      (p.three || 50) * 0.22 +
      threeTend * 0.48 +
      (p.mid || 50) * 0.08;
    if (threeTend < 18 || p.offenseStyle === "post") w *= 0.18;
    else if (threeTend < 30) w *= 0.45;
    if (p.orders?.action === "spot") w *= 1.45;
    if (p.orders?.usage === "score") w *= 1.3;
    if (p.orders?.attack === "perimeter") w *= 1.2;
    // 挡拆/突破分球：射手权重再抬一档；挡拆也可分给顺下内线
    if (pnrOrKick && isFloorShooter(p)) w *= 1.55;
    if (scheme === "pnr" && ["C", "PF"].includes(p.playPos || p.pos) && (p.paint || 0) >= 72) {
      w *= 1.25;
    }
    // 好传球手 → 弹跳内线：空接/短滚成高权重接球点（“打出空间”）
    if (organizerIsPasser && isSpringySpacer(p)) {
      const ath = springAthleteScore(p);
      w *= 1.55 + ath * 0.012;
      if (pnrOrKick) w *= 1.35;
      // 低三分倾向的弹跳大个子：不当射手，当顺下点
      if (threeTend < 28) w *= 2.4;
    }
    if (offenseFocusId && p.id === offenseFocusId) w *= 1.5;
    // 终场需要三分：分球几乎锁定最稳射手
    if (off.temp?.lateChase?.needThree && off.temp.lateChase.shooterId === p.id) {
      w *= 4.5;
    } else if (off.temp?.lateChase?.shooterId === p.id) {
      w *= 1.8;
    }
    // 詹韦连线等：双核互喂
    w *= skillDuoKickTargetMult(organizer, p, off.onCourt);
    // Feed last-game scorers (organizer kick rate already boosted outside)
    w *= formKickTargetMult(p);
    return Math.max(2, w);
  });
}

/**
 * 2K-style shot selection: tendency gates the attempt; rating gates the make.
 * sideCtx.weakSide → more spot-up threes for shooters, not for post bigs.
 */
function chooseShot(p, off, focusPlay = null, sideCtx = null) {
  const weakSide = !!sideCtx?.weakSide;
  let autonomy = (off.coach?.playerAutonomy ?? 40) / 100;
  const hold = clamp(off.temp?.tacticHold || 0, 0, 1);
  const locked = (p.tempTacticFocus || 0) > 0;
  const lock = clamp(hold + (locked ? 0.38 : 0), 0, 1);
  autonomy *= 1 - lock * 0.92;

  const threeTend = p.threeTend ?? clamp(Math.round((p.three || 40) * 0.55), 1, 80);
  const midTend = p.midTend ?? 45;
  const paintTend = p.paintTend ?? 50;
  const shotTend = p.shotTend ?? 55;
  const style = p.offenseStyle || "balanced";

  // Ability confidence: bad shooters don't "believe" the three even if coached to space
  const threeSkill = p.three || 40;
  const midSkill = p.mid || 50;
  const paintSkill = p.paint || 50;

  const bold = formShotBoldMult(p);
  let w3 = Math.pow(threeTend / 100, 1.55) * (0.25 + threeSkill / 180) * (0.55 + shotTend / 200);
  let wPaint = (paintTend / 100) * (0.45 + paintSkill / 160) * (0.6 + shotTend / 180);
  let wMid = (midTend / 100) * (0.4 + midSkill / 170) * (0.55 + shotTend / 200);
  // Confidence → more decisive creation (pull-ups / attacks), not chuck-threes-only
  wPaint *= 0.92 + bold * 0.12;
  wMid *= 0.9 + bold * 0.16;
  w3 *= 0.94 + bold * 0.08;
  if (formConfidence(p) >= 68) {
    wMid *= 1.08;
    wPaint *= 1.06;
  }

  // Offense style package (2K badges / playstyles)
  if (style === "post") {
    w3 *= 0.04;
    wPaint *= 1.65;
    wMid *= 0.75;
  } else if (style === "stretch") {
    w3 *= 1.55;
    wPaint *= 0.75;
  } else if (style === "spot") {
    w3 *= 1.4;
    wPaint *= 0.7;
    wMid *= 0.85;
  } else if (style === "slash") {
    wPaint *= 1.4;
    w3 *= 0.65;
  } else if (style === "playmake") {
    w3 *= 0.85;
    wMid *= 0.9;
  } else if (style === "midiso") {
    wMid *= 1.5;
    w3 *= 0.8;
  }

  // Hard gates — Dwight-type: almost never jack a three
  if (threeTend <= 12 || threeSkill < 40) w3 *= 0.05;
  else if (threeTend < 22 || threeSkill < 48) w3 *= 0.2;
  else if (threeTend < 35) w3 *= 0.55;

  // Strong side vs weak side
  if (weakSide) {
    // Weak side = help already committed; shooters fire, posts shouldn't chuck
    if (threeTend >= 45 && threeSkill >= 65) w3 *= 1.45;
    if (style === "post" || threeTend < 25) w3 *= 0.2;
    wPaint *= 0.8;
  } else {
    // Strong side = creation / post / drive
    wPaint *= 1.22;
    wMid *= 1.12;
    if (style === "post") wPaint *= 1.15;
  }

  // Coach orders + tactic
  const attack = p.orders?.attack || "auto";
  const action = p.orders?.action || "auto";
  const orderBoost = 1 + lock * 0.35;
  if (attack === "perimeter") w3 *= 1.55 * orderBoost;
  if (attack === "paint" || attack === "foul_hunt") wPaint *= 1.55 * orderBoost;
  if (attack === "putback" || action === "crash" || sideCtx?.putback) {
    wPaint *= (sideCtx?.putback ? 2.4 : 1.85) * orderBoost;
    w3 *= 0.22;
    wMid *= 0.5;
  }
  if (attack === "mid") wMid *= 1.6 * orderBoost;
  if (action === "post") wPaint *= 1.3 * orderBoost;
  // 挡拆：持球人可杀筐，也会大量拔中投；分球后由 sideCtx 抬射手
  if (action === "pnr") {
    wPaint *= 1.22 * orderBoost;
    wMid *= 1.4 * orderBoost;
    if (midSkill >= 72 || isMidHandler(p)) wMid *= 1.2;
  }
  if (action === "spot") w3 *= 1.35 * orderBoost;
  if (action === "drive_kick") {
    wPaint *= 1.08;
    // 自己偶发抛投；真正空间给分球射手（kickedOut 路径）
    w3 *= 0.9;
    wMid *= 1.05;
  }
  if (action === "iso") wMid *= 1.2;
  // Possession scheme from teammate's 挡拆/突破分球 kick-out
  if (sideCtx?.kickedOut && (sideCtx.scheme === "pnr" || sideCtx.scheme === "drive_kick")) {
    if (isFloorShooter(p)) {
      w3 *= 1.65;
      wMid *= 1.1;
    } else if (["C", "PF"].includes(p.playPos || p.pos)) {
      wPaint *= 1.35; // roll man
    }
  }
  // 弹跳内线 + 场上有传球手：偶发“打出空间”——短滚中投 / 顺下暴扣；有射程时轻弹外线
  if (isSpringySpacer(p) && onCourtHasPasser(off?.onCourt, p.id)) {
    const ath = springAthleteScore(p);
    const fromPasser =
      sideCtx?.kickedOut &&
      (() => {
        const org = (off.onCourt || []).find((x) => x.id === sideCtx.organizerId);
        return org && isQualityPasser(org);
      })();
    const spaceChance = clamp(0.22 + ath * 0.004 + (fromPasser ? 0.28 : 0.08), 0.2, 0.72);
    if (Math.random() < spaceChance) {
      wPaint *= 1.45; // dive / lob finish
      wMid *= 1.35 + (midSkill >= 62 ? 0.2 : 0); // short-roll pocket
      if (threeTend >= 32 && threeSkill >= 58) w3 *= 1.25; // rare pop
      else w3 *= 0.55;
    }
  }
  // PnR keep: mid-range pocket for skilled handlers
  if (sideCtx?.scheme === "pnr" && !sideCtx?.kickedOut && isMidHandler(p)) {
    wMid *= 1.35;
  }
  if (focusPlay?.id === "pace_three") w3 *= 1.5;
  if (focusPlay?.id === "post_up") wPaint *= 1.55;
  if (focusPlay?.id === "slow_pace") {
    // Grind it out: fewer rushed threes, more mid / half-court paint
    w3 *= 0.72;
    wMid *= 1.28;
    wPaint *= 1.12;
  }
  // 终场抢攻三分：把球给有把握的射手后强制拔三分（砖匠仍硬门）
  if (sideCtx?.lateChaseNeedThree) {
    if (threeSkill >= 72 || threeTend >= 48) {
      w3 *= 3.2;
      wPaint *= 0.45;
      wMid *= 0.4;
    } else if (threeSkill >= 62 || threeTend >= 38) {
      w3 *= 2.1;
      wPaint *= 0.65;
      wMid *= 0.55;
    } else {
      w3 *= 0.35;
      wPaint *= 1.25;
    }
  } else if (sideCtx?.lateChase) {
    w3 *= 1.15;
    wPaint *= 1.08;
    wMid *= 0.9;
  }

  const tacticPull = 1 - autonomy * 0.45;
  const tr = off.tactic?.threeRate ?? 1;
  w3 *= 0.75 + tr * 0.35 * tacticPull;
  // 内线进攻 / 二次进攻：抬油漆区权重
  const paintBias = Number(off.tactic?.paintBias) || 0;
  if (paintBias > 1) {
    wPaint *= paintBias;
    w3 *= Math.max(0.55, 1.15 - paintBias * 0.25);
  }
  if (off.tactic?.id === "crash_boards" || off.tactic?.id === "second_chance") {
    wPaint *= 1.12;
  }
  if (off.tactic?.id === "twin_towers") {
    wPaint *= 1.18;
    w3 *= 0.82;
  }
  if (lock > 0.4 && attack === "auto") {
    if (tr >= 1.15) w3 *= 1 + lock * 0.3;
    if (tr <= 0.9) {
      w3 *= 1 - lock * 0.3;
      wPaint *= 1 + lock * 0.25;
    }
  }

  // Hunt green light still can't invent threeTend for bricklayers
  const hunt = offenseHuntLevel(off.coach, p);
  if (hunt > 0.5 && threeTend < 25) w3 *= 0.35;

  const sum = w3 + wPaint + wMid;
  let r = Math.random() * Math.max(sum, 0.01);
  if (r < w3) return { zone: "three", pts: 3, weakSide };
  r -= w3;
  if (r < wPaint) return { zone: "paint", pts: 2, weakSide };
  return { zone: "mid", pts: 2, weakSide };
}

function calcOpenness(baller, defender, off, def, plan, sideCtx = null) {
  const defPress = defensePressLevel(def.coach);
  const hunt = offenseHuntLevel(off.coach, baller);
  let open =
    0.45 +
    (baller.speed - defender.speed) * 0.002 +
    (baller.iq - defender.iq) * 0.0015 +
    off.fit * 0.002 -
    defender.defense * 0.0025 -
    (def.tactic.defense - 1) * 0.15 +
    (off.chem - 50) * 0.001 +
    skillOpennessDelta(baller, defender, off) +
    skillDefCaptainOpenPenalty(def.onCourt);
  // Weak-side spot: help already gone — more open for real shooters
  if (sideCtx?.weakSide) {
    const threeTend = baller.threeTend ?? 30;
    if (threeTend >= 45) open += 0.06;
    else if (threeTend < 20) open -= 0.02; // post big on weak side still crowded / awkward
    else open += 0.03;
  }
  // Passer + confident scorer: teammates auto cut / clear space
  if (sideCtx?.kickedOut) {
    const organizer = (off.onCourt || []).find((x) => x.id === sideCtx.organizerId) || null;
    open += formSpacingBonus(baller, organizer);
    open += (formTactical(baller) - 50) * 0.00035;
  }
  // 挡拆 / 突破分球：压缩禁区 → 射手大空位；持球中投口袋也更干净
  if (sideCtx?.scheme === "drive_kick" || sideCtx?.scheme === "pnr") {
    if (sideCtx.kickedOut && isFloorShooter(baller)) {
      open += sideCtx.scheme === "drive_kick" ? 0.1 : 0.085;
    } else if (sideCtx.scheme === "pnr" && !sideCtx.kickedOut && isMidHandler(baller)) {
      open += 0.055; // pull-up / short mid after screen
    } else if (sideCtx.kickedOut && ["C", "PF"].includes(baller.playPos || baller.pos)) {
      open += 0.04; // roll dunk window
      if ((baller.skills || []).includes("lob_finisher")) open += 0.07;
      else if ((baller.skills || []).includes("spring_board")) open += 0.04;
    }
  }
  // 弹跳型中锋拉空间：自己吃空接窗；队友因协防被扯开
  {
    const springBig = isSpringySpacer(baller)
      ? baller
      : onCourtSpringyBig(off.onCourt, baller?.id);
    if (springBig) {
      const ath = springAthleteScore(springBig);
      const passer =
        sideCtx?.kickedOut && sideCtx.organizerId
          ? (off.onCourt || []).find((x) => x.id === sideCtx.organizerId)
          : (off.onCourt || []).find((x) => x.id !== springBig.id && isQualityPasser(x));
      if (passer && isQualityPasser(passer)) {
        if (baller.id === springBig.id) {
          // 顺下/短滚自己的空位
          open += 0.045 + ath * 0.00055;
          if (sideCtx?.kickedOut) open += 0.06;
        } else if (isFloorShooter(baller) || (baller.threeTend || 0) >= 42) {
          // 大个子切入扯防守 → 弱侧/外线空间
          open += 0.035 + ath * 0.0004;
          if (sideCtx?.kickedOut) open += 0.025;
        }
      }
    }
  }
  // Teammate gravity opens looks; defender switchability closes them
  const gravity = avg(off.onCourt.map((p) => p.intangibles?.gravity || 50));
  open += (gravity - 50) * 0.0012;
  open -= ((defender.intangibles?.switchability || 50) - 50) * 0.001;
  open += (off.temp.offense || 0) - (def.temp.defense || 0);
  if (baller.orders?.action === "drive_kick" || baller.orders?.usage === "organize") {
    open += 0.03 + (baller.pass || 50) * 0.00035;
  }
  if (baller.orders?.action === "pnr") {
    open += 0.025 + (baller.pass || 50) * 0.0002;
  }
  if (defender.orders?.defFocus === "onball") open -= 0.055;
  if (defender.orders?.defFocus === "deny") open -= 0.05;
  if (defender.orders?.defFocus === "allout") open -= 0.07;
  if (defender.orders?.defFocus === "help") open -= 0.025;
  if ((defender.orders?.usage || "auto") === "defend") open -= 0.025;
  if ((defender.orders?.usage || "auto") === "hustle") open -= 0.03;
  if (isAllOutDefense(defender)) open -= 0.02;
  // D press shrinks space; gassed defenders leak open (stamina delays the leak)
  open -= defPress * 0.07;
  const defFatM = fatiguePerfMult(defender);
  if (defPress > 0.35 && defFatM < 0.98) {
    open += defPress * (1 - defFatM) * 0.22;
  }
  // High hunt with offense-heavy cast finds cracks faster
  const share = lineupOffenseShare(off.onCourt);
  if (hunt >= 0.5 && share >= 0.55 && playerOffenseSkill(baller) >= 80) {
    open += hunt * share * 0.045;
  }
  if (plan?.targetId === baller.id) {
    if (plan.scheme === "focus") open -= 0.07;
    if (plan.scheme === "double") open -= 0.14;
    if (plan.scheme === "bump") open -= 0.04;
  }
  return clamp(open, 0.08, 0.92);
}

function calcMakeProb(baller, shot, open, off, def, defender, plan, momentum = null, gameCtx = {}) {
  // Start from zone FG% with a slight haircut — raw season % already assumes real contests
  let base =
    (shot.zone === "three" ? baller.threeFg : shot.zone === "paint" ? baller.paintFg : baller.midFg) *
    0.9;
  base += (open - 0.45) * 0.16;
  const skill =
    shot.zone === "three" ? baller.three : shot.zone === "paint" ? baller.paint : baller.mid;
  base += (skill - 75) * 0.00055;
  const tough = baller.intangibles?.toughness || 50;
  // Fatigue curve: ~60 slight, ~80 slide, ~100 brick festival — iron lungs resist
  const fatM = fatiguePerfMult(baller);
  base *= fatM;
  if (fatM < 1) base += (1 - fatM) * (tough / 100) * 0.045; // tough softens deep gas a bit
  const create = baller.intangibles?.shotCreation || 50;
  if (open < 0.4) base += (create - 50) * 0.0009;
  const kill = baller.intangibles?.killerInstinct || 50;
  base += (kill - 50) * 0.00025;
  base += formMakeBonus(baller);
  // 比赛节奏拨档：降速加命中、提速减命中
  if (gameCtx.tempoMakeBonus) base += gameCtx.tempoMakeBonus;
  // Confident scorers finish contested looks a bit more willingly/cleanly
  if (open < 0.42) base += (formConfidence(baller) - 50) * 0.00025;
  base += skillMakeBonus(baller, shot, {
    quarter: gameCtx.quarter ?? 1,
    scoreDiff: gameCtx.scoreDiff ?? 0,
    open,
    onCourt: off?.onCourt || gameCtx.onCourt || null,
  });
  // Signature proc: big bump, still not a guaranteed make
  if (gameCtx.sigMakeBoost) base += gameCtx.sigMakeBoost;
  // 挡拆/突破分球制造的优质出手
  const scheme = gameCtx.scheme;
  if (scheme === "pnr" || scheme === "drive_kick") {
    if (shot.zone === "three" && gameCtx.kickedOut && isFloorShooter(baller)) {
      base += scheme === "drive_kick" ? 0.055 : 0.045;
    }
    if (shot.zone === "mid" && isMidHandler(baller) && (scheme === "pnr" || !gameCtx.kickedOut)) {
      // 会中投的持球人：挡拆后中距离口袋球更好打
      base += 0.05 + Math.max(0, (baller.mid || 50) - 70) * 0.0012;
    }
    if (shot.zone === "paint" && gameCtx.kickedOut && ["C", "PF"].includes(baller.playPos || baller.pos)) {
      base += 0.03;
    }
  }
  base *= personalityOnPlay(baller, off.chem, off.onCourt, {
    coach: off.coach,
    tactic: off.tactic,
    primaryId: gameCtx.primaryId ?? off.gameplan?.offenseFocusId ?? null,
  });
  // Momentum: team on a run shoots better
  if (momentum?.side === off.side && momentum.points >= 6) {
    base += Math.min(0.06, momentum.points * 0.004);
  } else if (momentum?.side === def.side && momentum.points >= 8) {
    base -= 0.02;
  }
  base *= 1 + (off.tactic.offense - 1) * 0.28;
  base *= 1 - (def.tactic.defense - 1) * 0.4;
  base *= 1 + (off.morale - 50) * 0.0009;
  base *= 1 + (off.fit - 50) * 0.0008;
  base *= 1 + (off.chem - 50) * 0.0007;
  base *= 1 + (off.temp.offense || 0) * 0.7;
  base *= 1 - (def.temp.defense || 0) * 0.85;
  // Live feel / mood (keep present, don't balloon eFG%)
  base *= 1 + (baller.hot || 0) * 0.008;
  base *= 1 + ((baller.mood ?? 50) - 50) * 0.001;
  // Philosophy: hunt opportunities (not flat make buff)
  const hunt = offenseHuntLevel(off.coach, baller);
  const defPress = defensePressLevel(def.coach);
  const offSkill = playerOffenseSkill(baller);
  const share = lineupOffenseShare(off.onCourt);
  if (hunt >= 0.45 && offSkill < 74) {
    // Weak / defense-first players hunting bricks
    base -= (0.035 + ((76 - offSkill) / 100) * 0.14) * hunt;
  } else if (hunt >= 0.45 && offSkill >= 82 && share >= 0.5) {
    // Offense-heavy cast + high hunt = lethal opportunity taking
    base += 0.012 * hunt * share + (offSkill - 82) * 0.00015 * hunt;
  }
  // D press contests more shots (tired low-stamina defenders contest worse — open already leaks)
  base -= defPress * 0.03;
  // Obscure / high-autonomy staff: occasional spark for stars & prospects
  const spark = applyCoachSpark(baller, off);
  if (spark > 0) base += spark;
  // 错位下盘顶防：壮硕顶瘦高 → 一定几率让投篮失去准心
  if (
    plan?.scheme === "bump" &&
    plan?.targetId === baller.id &&
    defender &&
    isSturdy(defender) &&
    (isLanky(baller) || (baller.strength || 50) + 12 < (defender.strength || 50))
  ) {
    const bumpChance = clamp(
      0.28 + ((defender.strength || 50) - (baller.strength || 50)) * 0.008,
      0.22,
      0.55
    );
    if (Math.random() < bumpChance) {
      base -= rand(0.045, 0.11);
      baller._bumpCold = true;
    }
  }
  if (plan?.scheme === "double" && plan?.targetId === baller.id) {
    base -= 0.03;
    // 独狼硬解包夹：额外掉准，仍不愿传球
    if ((baller.skills || []).includes("lone_wolf")) base -= 0.04;
  }
  if (shot.zone === "paint") {
    base += (baller.strength - 70) * 0.0005;
    // Signature paint moves (霸王步/泰山压顶等) can climb higher — still not automatic
    base = Math.min(base, gameCtx.sigMakeBoost ? 0.8 : 0.68);
  }
  if (shot.zone === "mid") {
    base = Math.min(base, gameCtx.sigMakeBoost ? 0.72 : 0.52);
  }
  if (shot.zone === "three") {
    base = Math.min(base, gameCtx.sigMakeBoost ? 0.62 : 0.45);
  }
  // League-env ceiling: keep team PPP near modern NBA (~1.10–1.15)
  return clamp(base, 0.1, gameCtx.sigMakeBoost ? 0.82 : 0.68);
}

/** Rookie/obscure coaches aren't strictly worse — they can unlock stars & potential. */
function applyCoachSpark(baller, off) {
  const coach = off.coach;
  if (!coach) return 0;
  const autonomy = coach.playerAutonomy ?? 40;
  const sparkStat = coach.sparkPotential ?? 40;
  if (autonomy < 55 && sparkStat < 55) return 0;
  const growth = baller.intangibles?.growthPotential ?? baller.growth ?? 50;
  const star = Math.max(baller.scoring, baller.intangibles?.killerInstinct || 50);
  const eligible = growth >= 62 || star >= 82 || (baller.tags || []).some((t) => /潜力|新秀|成长/.test(t));
  if (!eligible) return 0;
  // Chance scales with autonomy+spark; payoff is a small make-prob bump (奇效)
  const chance = clamp((autonomy * 0.004 + sparkStat * 0.0035) * (growth / 100), 0.04, 0.28);
  if (Math.random() > chance) return 0;
  return rand(0.018, 0.045) * (0.7 + sparkStat / 100);
}

function shotLabel(shot, open) {
  const space = open > 0.7 ? "空位" : open > 0.45 ? "半空位" : "强干扰";
  const z = shot.zone === "three" ? "三分" : shot.zone === "paint" ? "篮下" : "中距离";
  const side = shot.weakSide ? "弱侧" : "";
  return `${side}${space}${z}`;
}

function pickLine(lines) {
  if (!lines?.length) return "";
  return lines[Math.floor(Math.random() * lines.length)];
}

/**
 * 文字播报：带上防守人 + 错位/强打/虚晃暴扣等情境。
 * 例：「霍华德强打米尔萨普得手，虚晃起来，暴扣」
 *     「约基奇错位打德里克·罗斯，低位翻身打进」
 */
function matchupFeedStory(baller, defender, shot, open, finishLabel, { made = true, fouled = false } = {}) {
  const bn = baller?.name || "进攻方";
  const finish = finishLabel || shotLabel(shot, open);
  if (!defender?.name) {
    if (fouled) return `${bn} ${finish} 出手被侵`;
    return made ? `${bn} ${finish} 命中` : `${bn} ${finish} 不中`;
  }
  const dn = defender.name;
  const bPos = baller.playPos || baller.pos || "";
  const dPos = defender.playPos || defender.pos || "";
  const htGap = estHeightCm(baller) - estHeightCm(defender);
  const strGap = (baller.strength || 50) - (defender.strength || 50);
  const spdGap = (baller.speed || 50) - (defender.speed || 50);
  const bigOnGuard = ["C", "PF"].includes(bPos) && ["PG", "SG"].includes(dPos);
  const guardOnBig = ["PG", "SG"].includes(bPos) && ["C", "PF"].includes(dPos);
  const paint = shot?.zone === "paint";
  const mid = shot?.zone === "mid";
  const three = shot?.zone === "three";

  let setup;
  if (bigOnGuard || (htGap >= 12 && ["C", "PF"].includes(bPos))) {
    setup = pickLine([
      `错位打${dn}`,
      `错位单打${dn}`,
      `低位错位收拾${dn}`,
      `大打小点名${dn}`,
    ]);
  } else if (guardOnBig && spdGap >= 8) {
    setup = pickLine([
      `小打大晃开${dn}`,
      `速度错位过掉${dn}`,
      `面对高大的${dn}变向`,
    ]);
  } else if (strGap >= 12 && paint) {
    setup = pickLine([
      `强打${dn}`,
      `吨位碾压${dn}`,
      `肉搏顶开${dn}`,
      `硬凿${dn}`,
    ]);
  } else if (htGap >= 8 && paint) {
    setup = pickLine([`身高优势打${dn}`, `高打低收拾${dn}`, `顶着${dn}起跳`]);
  } else if (spdGap >= 12) {
    setup = pickLine([`速度甩开${dn}`, `第一步过掉${dn}`, `加速甩开${dn}`]);
  } else if (open < 0.36) {
    setup = pickLine([`硬解${dn}`, `在${dn}头顶强投`, `贴身对抗${dn}`]);
  } else if (open >= 0.62) {
    setup = pickLine([`整开${dn}`, `摆脱${dn}`, `晃开${dn}`]);
  } else {
    setup = pickLine([`对位${dn}`, `盯防下打${dn}`, `顶着${dn}`]);
  }

  const dunkish = /暴扣|灌篮|砸筐|劈扣|钉板|起飞|泰山压顶/.test(finish);
  const layupish = /上篮|拉杆|挑篮|抛投|穿花|欧洲步/.test(finish);
  const postish = /强打|翻身|低位|霸王|梦幻|柔拨|指尖/.test(finish);

  let action = finish;
  if (made && dunkish) {
    action = pickLine([
      `虚晃起来，${finish}`,
      `假动作后${finish}`,
      `起跳${finish}`,
      `连着虚晃，${finish}`,
      finish,
    ]);
  } else if (made && layupish) {
    action = pickLine([`变向后${finish}`, `挤进去${finish}`, `探肩${finish}`, finish]);
  } else if (made && paint && (strGap >= 10 || postish)) {
    action = pickLine([`低位翻身打进`, `背身挤进`, `${finish}`, `虚晃后强打打进`]);
  }

  if (fouled) {
    return pickLine([
      `${bn}${setup}，${finish}出手被侵`,
      `${bn}打${dn} ${finish} 造犯规`,
      `${dn}防${bn}下手，${finish}被侵`,
    ]);
  }

  if (made) {
    if (paint && (dunkish || strGap >= 10 || bigOnGuard)) {
      return pickLine([
        `${bn}${setup}得手，${action}`,
        `${bn}${setup}，${action}得手`,
        `${bn}对位${dn}，${action}`,
      ]);
    }
    if (three) {
      return pickLine([
        `${bn}面对${dn} ${finish} 命中`,
        `${bn}在${dn}眼前 ${finish} 命中`,
        `${bn}${setup}，${finish}命中`,
      ]);
    }
    if (mid) {
      return pickLine([
        `${bn}${setup}，${finish}命中`,
        `${bn}对位${dn} ${finish} 打进`,
        `${bn}干拔甩开${dn}，${finish}命中`,
      ]);
    }
    return pickLine([`${bn}${setup}，${finish}命中`, `${bn}对位${dn} ${finish} 命中`]);
  }

  // miss
  if (paint && (dunkish || strGap >= 8)) {
    return pickLine([
      `${bn}${setup}未果，${finish}不中`,
      `${dn}干扰下 ${bn} ${finish} 砸偏`,
      `${bn}打${dn} ${finish} 打铁`,
    ]);
  }
  return pickLine([
    `${bn}${setup}未果，${finish}不中`,
    `${dn}干扰下 ${bn} ${finish} 不中`,
    `${bn}打${dn} ${finish} 打铁`,
  ]);
}

function weighted(arr, weightFn) {
  if (!arr?.length) return null;
  const weights = arr.map((x) => Math.max(0.01, Number(weightFn(x)) || 0.01));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function avg(a) {
  return a.reduce((x, y) => x + y, 0) / (a.length || 1);
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function flip(side) {
  return side === "home" ? "away" : "home";
}
function pct(p) {
  return `${Math.round(p * 100)}%`;
}

/**
 * Continuous bench recovery while game clock runs.
 * `usedSec` = seconds that just elapsed on this possession.
 */
function tickBenchRecovery(side, usedSec) {
  if (!side || !(usedSec > 0)) return;
  const restMin = usedSec / 60;
  for (const p of side.bench || []) {
    recoverPlayerByRestMinutes(p, restMin, 1.12);
    p.benchSinceElapsed = null; // synced continuously while sitting
  }
}

/** Settle accrued bench rest when a player checks back in. */
function applyBenchRecoveryForPlayer(p, sim) {
  if (!p || p.benchSinceElapsed == null || !sim) return;
  const sat = Math.max(0, (sim.elapsedSec || 0) - p.benchSinceElapsed);
  if (sat > 0) recoverPlayerByRestMinutes(p, sat / 60, 1.12);
  p.benchSinceElapsed = null;
}

function recoverPlayerByRestMinutes(p, restMin, benchMult = 1) {
  if (!(restMin > 0) || !p) return;
  const resist = fatigueResist(p);
  const fullMins = clamp(10.3 - (resist - 35) * 0.055, 6, 10.5);
  const rate = (100 / fullMins) * benchMult;
  p.fatigue = Math.max(0, (p.fatigue || 0) - restMin * rate);
}

/**
 * Fatigue recovery.
 * 中场固定回 50；节间（Q1→Q2 / Q3→Q4）固定回 25；
 * 暂停 / 死球仍只是小口喘息。
 */
function recoverFatigue(side, kind) {
  const moodAmt = kind === "timeout" ? 1 : kind === "half" ? 3 : kind === "quarter" ? 1 : 0;

  // 节间 / 中场：固定额度（不按体质放大）
  if (kind === "half" || kind === "quarter") {
    const flat = kind === "half" ? 50 : 25;
    for (const p of side.roster || []) {
      p.fatigue = Math.max(0, (p.fatigue || 0) - flat);
      if (moodAmt) p.mood = clamp((p.mood ?? 50) + moodAmt, 15, 95);
    }
    return;
  }

  const restMin = kind === "timeout" ? 0.7 : kind === "deadball" ? 0.25 : 1;
  const onIds = new Set((side.onCourt || []).map((p) => p.id));

  for (const p of side.roster || []) {
    const resist = fatigueResist(p);
    const fullMins = clamp(10.3 - (resist - 35) * 0.055, 6, 10.5);
    let rate = 100 / fullMins;
    const onCourt = onIds.has(p.id);
    if (onCourt && (kind === "timeout" || kind === "deadball")) rate *= 0.82;
    else if (!onCourt) rate *= 1.12;

    let amt = restMin * rate;
    if (kind === "timeout") amt = Math.min(amt, 2.2 + resist * 0.028);
    else if (kind === "deadball") amt = Math.min(amt, 1.0 + resist * 0.012);

    p.fatigue = Math.max(0, (p.fatigue || 0) - amt);
    if (moodAmt) p.mood = clamp((p.mood ?? 50) + moodAmt, 15, 95);
  }
}
