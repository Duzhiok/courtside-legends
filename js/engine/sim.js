import { TACTICS, coachTactics } from "../data/coaches.js";
import { overall } from "../data/players.js";
import { lineupFit, personalityOnPlay, teamChemistry } from "./chemistry.js";

const QUARTER_SEC = 12 * 60;
const SHOT_CLOCK = 24;

/**
 * Possession-based NBA sim with realistic make rates.
 * Open look ≠ automatic make. Coach actions apply temporary modifiers.
 */
export class GameSim {
  constructor({ home, away, youSide = "home", onEvent, onTick, onEnd }) {
    this.home = wrapTeam(home, "home");
    this.away = wrapTeam(away, "away");
    this.youSide = youSide;
    this.onEvent = onEvent || (() => {});
    this.onTick = onTick || (() => {});
    this.onEnd = onEnd || (() => {});

    this.quarter = 1;
    this.clock = QUARTER_SEC;
    this.score = { home: 0, away: 0 };
    this.possession = Math.random() < 0.5 ? "home" : "away";
    this.running = false;
    this.paused = false;
    this.speed = 1;
    this._timer = null;
    this.shotClock = SHOT_CLOCK;
    this.timeouts = { home: 7, away: 7 };
  }

  you() {
    return this.youSide === "home" ? this.home : this.away;
  }

  start() {
    this.running = true;
    this.paused = false;
    this._loop();
  }

  setPaused(v) {
    this.paused = v;
    if (!v && this.running) this._loop();
  }

  setSpeed(n) {
    this.speed = n;
  }

  stop() {
    this.running = false;
    clearTimeout(this._timer);
  }

  _loop() {
    clearTimeout(this._timer);
    if (!this.running || this.paused) return;
    this.step();
    const delay = Math.max(80, 420 / this.speed);
    this._timer = setTimeout(() => this._loop(), delay);
  }

  step() {
    if (this.quarter > 4 && this.score.home !== this.score.away) {
      this.finish();
      return;
    }
    if (this.clock <= 0) {
      this.nextQuarter();
      return;
    }

    this.decayMods();
    this.refreshMeters();
    this.resolvePossession();
    this.onTick(this.snapshot());
  }

  nextQuarter() {
    if (this.quarter >= 4 && this.score.home !== this.score.away) {
      this.finish();
      return;
    }
    this.quarter += 1;
    this.clock = this.quarter > 4 ? 5 * 60 : QUARTER_SEC;
    this.possession = this.quarter % 2 === 1 ? "home" : "away";
    // Stamina recovery on the bench between quarters
    for (const side of [this.home, this.away]) {
      for (const p of side.roster) {
        if (!side.onCourt.includes(p)) p.fatigue = Math.max(0, p.fatigue - 12);
        else p.fatigue = Math.max(0, p.fatigue - 4);
      }
      // Thibs-style coaches keep stars on floor / more fatigue
      if (side.coach?.style?.includes("防守") || side.coach?.id?.includes("thibs")) {
        for (const p of side.onCourt) p.fatigue += 3;
      }
    }
    this.emit("coach", `第 ${this.quarter > 4 ? "加时" : this.quarter} 节开始`);
  }

  resolvePossession() {
    const off = this.possession === "home" ? this.home : this.away;
    const def = this.possession === "home" ? this.away : this.home;
    const baller = pickBallHandler(off);
    const defender = pickDefender(def, baller);

    const pace = off.tactic.pace * (1 + (off.temp.pace || 0));
    const used = clamp(rand(8, 20) / pace, 6, 24);
    this.clock = Math.max(0, this.clock - used);
    this.shotClock = SHOT_CLOCK;

    // Turnover
    const tovChance =
      0.1 +
      (100 - baller.pass) * 0.0012 +
      baller.fatigue * 0.0015 -
      off.chem * 0.0004 +
      (def.tactic.defense - 1) * 0.04;
    if (Math.random() < tovChance) {
      this.emit("miss", `${baller.name} 失误，被 ${defender.name} 切断`);
      baller.stats.to += 1;
      this.possession = flip(this.possession);
      return;
    }

    const shot = chooseShot(baller, off);
    const open = calcOpenness(baller, defender, off, def);
    const makeP = calcMakeProb(baller, shot, open, off, def);
    const made = Math.random() < makeP;

    const label = shotLabel(shot, open);
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
      // assist
      if (Math.random() < 0.55 + off.chem * 0.002) {
        const ast = pickPasser(off, baller);
        if (ast) ast.stats.ast += 1;
      }
      this.emit("score", `${baller.name} ${label} 命中！（${pct(makeP)} 预期） ${this.score.home}-${this.score.away}`);
      // and-one rare
      if (shot.zone === "paint" && Math.random() < 0.12) {
        if (Math.random() < baller.ft) {
          this.score[off.side] += 1;
          baller.stats.pts += 1;
          this.emit("score", `${baller.name} 加罚命中`);
        } else {
          this.emit("miss", `${baller.name} 加罚不中`);
        }
      }
      this.possession = flip(this.possession);
    } else {
      baller.stats.fga += 1;
      if (shot.pts === 3) baller.stats.tpa += 1;
      this.emit("miss", `${baller.name} ${label} 不中（${pct(makeP)}）—— 空位也会打铁`);
      // rebound
      const offReb = 0.22 + avg(off.onCourt.map((p) => p.rebound)) * 0.0015 - avg(def.onCourt.map((p) => p.rebound)) * 0.001;
      if (Math.random() < offReb) {
        const reb = weighted(off.onCourt, (p) => p.rebound);
        reb.stats.reb += 1;
        this.emit("event", `${reb.name} 前场篮板，二次进攻`);
        // keep possession, burn a bit more
        this.clock = Math.max(0, this.clock - 3);
      } else {
        const reb = weighted(def.onCourt, (p) => p.rebound + p.defense * 0.3);
        reb.stats.reb += 1;
        this.possession = flip(this.possession);
      }
    }

    baller.fatigue = Math.min(100, baller.fatigue + 2.2 + (off.coach?.buffs?.stamina < 0 ? 1.2 : 0));
    defender.fatigue = Math.min(100, defender.fatigue + 1.4);
  }

  // —— Coach actions ——
  callTimeout() {
    const t = this.you();
    if (this.timeouts[t.side] <= 0) {
      this.emit("coach", "没有暂停了");
      return;
    }
    this.timeouts[t.side] -= 1;
    t.morale = clamp(t.morale + 8, 0, 100);
    for (const p of t.onCourt) p.fatigue = Math.max(0, p.fatigue - 8);
    t.temp.offense = (t.temp.offense || 0) + 0.04;
    t.temp.defense = (t.temp.defense || 0) + 0.04;
    t.temp.ttl = 8;
    this.emit("coach", `暂停！布置回合（剩余 ${this.timeouts[t.side]}）士气上升`);
    this.setPaused(true);
  }

  shout() {
    const t = this.you();
    const fiery = avg(t.onCourt.map((p) => p.personality.fiery));
    const delta = fiery > 60 ? 10 : 5;
    t.morale = clamp(t.morale + delta, 0, 100);
    t.temp.offense = (t.temp.offense || 0) + 0.05;
    t.temp.ttl = 5;
    // risk of ego backlash
    if (avg(t.onCourt.map((p) => p.personality.ego)) > 75 && Math.random() < 0.25) {
      t.morale = clamp(t.morale - 8, 0, 100);
      this.emit("coach", "大喊加压——球星不买账，士气反而下滑");
    } else {
      this.emit("coach", "教练大喊加油！进攻侵略性提升");
    }
  }

  talk() {
    const t = this.you();
    t.morale = clamp(t.morale + 4, 0, 100);
    t.chem = clamp(t.chem + 3, 0, 100);
    for (const p of t.onCourt) {
      if (p.personality.ego > 70) p.tempFocus = 3;
    }
    this.emit("coach", "场边沟通：强调传球与信任，化学反应小幅上升");
  }

  setTactic(tacticId) {
    const t = this.you();
    const tactic = TACTICS[tacticId] || TACTICS.balanced;
    t.tactic = tactic;
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic);
    // Doc Rivers morale tactic
    if (tactic.morale) t.morale = clamp(t.morale + tactic.morale, 0, 100);
    this.emit("coach", `战术切换为「${tactic.name}」适配度 ${t.fit}`);
    this.refreshMeters();
  }

  substitute(outId, inId) {
    const t = this.you();
    const outIdx = t.onCourt.findIndex((p) => p.id === outId);
    const inbound = t.bench.find((p) => p.id === inId);
    if (outIdx < 0 || !inbound) {
      this.emit("coach", "换人失败");
      return;
    }
    const out = t.onCourt[outIdx];
    t.onCourt[outIdx] = inbound;
    t.bench = t.bench.filter((p) => p.id !== inId).concat(out);
    out.fatigue = Math.max(0, out.fatigue - 6);
    t.chem = teamChemistry(t.onCourt);
    t.fit = lineupFit(t.onCourt, t.coach, t.tactic);
    this.emit("coach", `换人：${inbound.name} 换下 ${out.name}`);
    this.refreshMeters();
  }

  decayMods() {
    for (const side of [this.home, this.away]) {
      if (side.temp.ttl > 0) {
        side.temp.ttl -= 1;
        if (side.temp.ttl <= 0) side.temp = { ttl: 0 };
      }
    }
  }

  refreshMeters() {
    for (const side of [this.home, this.away]) {
      side.chem = teamChemistry(side.onCourt);
      side.fit = lineupFit(side.onCourt, side.coach, side.tactic);
    }
  }

  finish() {
    this.stop();
    this.emit("coach", "终场哨响！");
    this.onEnd(this.snapshot());
  }

  emit(type, text) {
    this.onEvent({ type, text, ...this.snapshot() });
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
    };
  }
}

function wrapTeam(team, side) {
  const roster = team.players.map((p) => ({
    ...structuredClone(p),
    fatigue: 0,
    tempFocus: 0,
    stats: { pts: 0, reb: 0, ast: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, to: 0 },
  }));
  // sort by overall, top 5 start
  roster.sort((a, b) => overall(b) - overall(a));
  const onCourt = roster.slice(0, 5);
  const bench = roster.slice(5);
  const coach = team.coach ? structuredClone(team.coach) : null;
  const tactics = coach ? coachTactics(coach) : [TACTICS.balanced];
  const tactic = tactics[0];
  const chem = teamChemistry(onCourt);
  const fit = lineupFit(onCourt, coach, tactic);
  let morale = 55 + (coach?.buffs?.morale || 0);
  return {
    side,
    name: team.name,
    roster,
    onCourt,
    bench,
    coach,
    tactic,
    chem,
    fit,
    morale: clamp(morale, 20, 90),
    temp: { ttl: 0 },
  };
}

function publicTeam(t) {
  return {
    name: t.name,
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

function slim(p) {
  return {
    id: p.id,
    name: p.name,
    season: p.season,
    pos: p.pos,
    team: p.team,
    fatigue: Math.round(p.fatigue),
    stats: { ...p.stats },
    overall: overall(p),
  };
}

function pickBallHandler(off) {
  return weighted(off.onCourt, (p) => {
    let w = p.scoring * 0.5 + p.pass * 0.35 + p.iq * 0.15 - p.fatigue * 0.4;
    if (p.tempFocus > 0) {
      w *= 1.1;
      p.tempFocus -= 1;
    }
    return Math.max(5, w);
  });
}

function pickDefender(def, baller) {
  return weighted(def.onCourt, (p) => {
    const posBonus = p.pos === baller.pos ? 20 : 0;
    return p.defense + posBonus - p.fatigue * 0.3;
  });
}

function pickPasser(off, scorer) {
  const others = off.onCourt.filter((p) => p.id !== scorer.id);
  if (!others.length) return null;
  return weighted(others, (p) => p.pass + p.iq * 0.3);
}

function chooseShot(p, off) {
  const threeBias = (p.three / 100) * off.tactic.threeRate;
  const paintBias = p.paint / 100;
  const midBias = p.mid / 100;
  const r = Math.random();
  const threeCut = 0.2 + threeBias * 0.35;
  const paintCut = threeCut + 0.25 + paintBias * 0.25;
  if (r < threeCut) return { zone: "three", pts: 3 };
  if (r < paintCut) return { zone: "paint", pts: 2 };
  return { zone: "mid", pts: 2 };
}

function calcOpenness(baller, defender, off, def) {
  // 0 contest .. 1 wide open
  let open =
    0.45 +
    (baller.speed - defender.speed) * 0.002 +
    (baller.iq - defender.iq) * 0.0015 +
    off.fit * 0.002 -
    defender.defense * 0.0025 -
    (def.tactic.defense - 1) * 0.15 +
    (off.chem - 50) * 0.001;
  open += (off.temp.offense || 0) - (def.temp.defense || 0);
  return clamp(open, 0.08, 0.92);
}

function calcMakeProb(baller, shot, open, off, def) {
  let base =
    shot.zone === "three" ? baller.threeFg : shot.zone === "paint" ? baller.paintFg : baller.midFg;

  // Openness moves probability but NEVER guarantees a make
  // Wide open: ~+12% absolute; heavily contested: ~-18%
  base += (open - 0.45) * 0.28;

  // Attribute skill soft factor (small)
  const skill =
    shot.zone === "three" ? baller.three : shot.zone === "paint" ? baller.paint : baller.mid;
  base += (skill - 75) * 0.0008;

  // Fatigue & clutch late
  base -= baller.fatigue * 0.0018;
  base *= personalityOnPlay(baller, off.chem);

  // Team context
  base *= 1 + (off.tactic.offense - 1) * 0.5;
  base *= 1 - (def.tactic.defense - 1) * 0.35;
  base *= 1 + (off.morale - 50) * 0.0015;
  base *= 1 + (off.fit - 50) * 0.0012;
  base *= 1 + (off.chem - 50) * 0.001;
  base *= 1 + (off.temp.offense || 0);
  base *= 1 - (def.temp.defense || 0) * 0.8;

  // Coach buffs
  if (off.coach) base += off.coach.buffs.offense * 0.001;
  if (def.coach) base -= def.coach.buffs.defense * 0.0012;

  // Strength helps paint finishes but misses still happen (Embiid empty)
  if (shot.zone === "paint") {
    base += (baller.strength - 70) * 0.0007;
    // Explicit "empty miss" floor: even great finishers brick sometimes
    base = Math.min(base, 0.78);
  }
  if (shot.zone === "three") {
    // Curry open three can miss — cap around career-ish open looks
    base = Math.min(base, 0.55);
  }

  return clamp(base, 0.12, 0.78);
}

function shotLabel(shot, open) {
  const space = open > 0.7 ? "空位" : open > 0.45 ? "半空位" : "强干扰";
  const z = shot.zone === "three" ? "三分" : shot.zone === "paint" ? "篮下" : "中距离";
  return `${space}${z}`;
}

function weighted(arr, weightFn) {
  const weights = arr.map(weightFn);
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
