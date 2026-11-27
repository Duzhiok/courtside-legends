/**
 * Critical Moments — the last-possession decision inside a normal live game (2026-11-26 product direction:
 * the standalone Clutch Challenge becomes a mechanism of every game, not a separate mode).
 *
 * Two families, plugged into the match-event engine (js/engine/matchEvents.js) so they share its state,
 * save field, single pending slot and auto-resolve rules:
 *   clutchOffense  — your ball, Q4 or overtime, <= 24 s left, score within 3
 *   clutchDefense  — their ball, same window
 *
 * The player picks an ACTION, never an outcome. Every choice maps to an existing GameSim call:
 *   three / attack -> submitDecision({kind:"clutch_shooter", actionHint})   (M2b-1 decision contract)
 *   hunt / slow    -> setFocusPlay("hunt_mismatch" | "slow_pace")
 *   deny / double  -> setDefenseScheme("focus" | "double", target)
 *   ignore         -> nothing (the default, so auto-resolve and fast sim never change a game)
 * Moves GameSim cannot play out as a single possession (a designed pick-and-roll, a deliberate foul when
 * leading) are deliberately not offered.
 *
 * Pure. `ctx.ratings` (id -> {three, paint, scoring}) comes from the live roster because the public
 * snapshot does not carry the three/paint ratings; without it the picks fall back to `scoring`.
 */
export const CRITICAL_TUNING = Object.freeze({
  /** One possession: the final shot clock of the game, not two-minute strategy (that is the takeover window). */
  clockMax: 24,
  margin: 3,
  /** Hard cap per game (each possession inside the window can ask once; a crazy back-and-forth ends here). */
  maxPerGame: 6,
});

export const CRITICAL_FAMILIES = Object.freeze(["clutchOffense", "clutchDefense"]);

const pair = (zh, en) => ({ zh, en });
const sideOf = (snap) => (snap?.youSide === "away" ? "away" : "home");
const otherSide = (side) => (side === "home" ? "away" : "home");
const healthy = (p) => !(p?.injuredGames > 0);

/** True inside the crunch window, whoever has the ball (regular events stay quiet here). */
export function inCrunchWindow(snap, tuning = CRITICAL_TUNING) {
  if (!snap) return false;
  const q = Number(snap.quarter) || 0;
  const clock = Number(snap.clock);
  if (q < 4 || !(clock > 0) || clock > tuning.clockMax) return false;
  const mine = snap.score?.[sideOf(snap)] ?? 0;
  const theirs = snap.score?.[otherSide(sideOf(snap))] ?? 0;
  return Math.abs(mine - theirs) <= tuning.margin;
}

/** 0 = tied, >0 = you lead by that much, <0 = you trail. */
export const margin = (snap) => (snap?.score?.[sideOf(snap)] ?? 0) - (snap?.score?.[otherSide(sideOf(snap))] ?? 0);

/**
 * At most one candidate: offense when the next possession is yours, defense otherwise. Managed (auto)
 * offense / defense means "the coach AI handles it": no question on that end.
 */
export function criticalCandidates(snap, { boundary = 0, tuning = CRITICAL_TUNING } = {}) {
  if (!inCrunchWindow(snap, tuning)) return [];
  const yours = sideOf(snap);
  const offense = snap.possession === yours;
  if (offense ? snap.autoOffense : snap.autoDefense) return [];
  const team = snap[offense ? yours : otherSide(yours)];
  const floor = (team?.onCourt || []).filter(healthy);
  if (!floor.length) return [];
  const family = offense ? "clutchOffense" : "clutchDefense";
  return [{ family, id: `${family}:b${boundary}`, critical: true, floor }];
}

const rate = (ctx, p, key) => Number(ctx?.ratings?.[p.id]?.[key] ?? (key === "scoring" ? p.scoring : NaN)) || 0;
const best = (players, score) => [...players].sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)));
const shooterScore = (ctx) => (p) => (ctx?.ratings?.[p.id] ? 0.7 * rate(ctx, p, "three") + 0.3 * rate(ctx, p, "scoring") : rate(ctx, p, "scoring"));
const driverScore = (ctx) => (p) => (ctx?.ratings?.[p.id] ? 0.6 * rate(ctx, p, "paint") + 0.4 * rate(ctx, p, "scoring") : rate(ctx, p, "scoring"));

function situationLine(snap) {
  const m = margin(snap);
  const sec = Math.ceil(Number(snap.clock) || 0);
  const when = pair(`还剩 ${sec} 秒`, `${sec}s left`);
  if (m === 0) return pair(`平局，${when.zh}`, `Tied, ${when.en}`);
  return m > 0 ? pair(`领先 ${m} 分，${when.zh}`, `Up ${m}, ${when.en}`) : pair(`落后 ${-m} 分，${when.zh}`, `Down ${-m}, ${when.en}`);
}

function buildOffense(c, snap, ctx) {
  const m = margin(snap);
  const shooters = best(c.floor, shooterScore(ctx));
  const driver = best(c.floor, driverScore(ctx))[0];
  const s1 = shooters[0];
  const s2 = shooters.find((p) => p.id !== s1.id);
  const sit = situationLine(snap);
  const threeHint = m === -3 ? pair("唯一能直接追平的出手", "The only shot that ties it")
    : m < 0 ? pair("命中直接反超", "A make wins it")
      : pair("把握大于风险时才投", "Only when the look is worth it");
  const driveHint = m === -3 ? pair("两分追不平，只能争取打成 2+1", "A two can't tie it — only an and-one")
    : m === -2 ? pair("命中追平，进入加时", "A make ties it and forces overtime")
      : m <= 0 ? pair("篮下命中率更高，也更可能造犯规", "Higher-percentage look, more fouls drawn")
        : pair("争取稳妥的两分，把领先拉到两个回合", "Go for a safe two and a two-possession lead");
  const choices = [
    { id: "three", label: pair(`三分 · 交给 ${s1.name}`, `Three · ${s1.name}`), hint: threeHint },
    ...(s2 ? [{ id: "three2", label: pair(`三分 · 交给 ${s2.name}`, `Three · ${s2.name}`), hint: pair("换一个出手人", "A different shooter") }] : []),
    { id: "attack", label: pair(`突破篮下 · 交给 ${driver.name}`, `Attack the rim · ${driver.name}`), hint: driveHint },
    m > 0
      ? { id: "slow", label: pair("消耗时间", "Run the clock"), hint: pair("咬死进攻时间，少给对手机会", "Burn the shot clock, leave them less time") }
      : { id: "hunt", label: pair("攻打最弱对位", "Hunt the weakest matchup"), hint: pair("拉开空间单打对方最弱的防守人", "Clear out and attack their weakest defender") },
    { id: "ignore", label: pair("交给球员自行处理", "Let them play"), hint: pair("按现有战术打", "Run the current system") },
  ];
  const shot = (p, actionHint) => [{ kind: "submitDecision", shooterId: p.id, actionHint }];
  return {
    title: pair("关键时刻 · 最后一攻", "Critical moment · last possession"),
    body: pair(`${sit.zh}，球权在你。选择打法，结果由比赛模拟决定。`, `${sit.en}, your ball. Pick the play — the game decides the result.`),
    player: s1,
    choices,
    effects: {
      three: shot(s1, "three"),
      ...(s2 ? { three2: shot(s2, "three") } : {}),
      attack: shot(driver, "attack"),
      slow: [{ kind: "setFocusPlay", focusId: "slow_pace" }],
      hunt: [{ kind: "setFocusPlay", focusId: "hunt_mismatch" }],
      ignore: [],
    },
  };
}

function buildDefense(c, snap, ctx) {
  const m = margin(snap);
  // Up 3, they need a three: guard the shooter. Otherwise: guard whoever is most likely to take the shot.
  const target = best(c.floor, m === 3 ? shooterScore(ctx) : (p) => rate(ctx, p, "scoring"))[0];
  const sit = situationLine(snap);
  return {
    title: pair("关键时刻 · 最后一防", "Critical moment · final defense"),
    body: pair(`${sit.zh}，对手持球。选择防守重点，结果由比赛模拟决定。`, `${sit.en}, their ball. Pick the defensive focus — the game decides the result.`),
    player: target,
    choices: [
      { id: "deny", label: pair(`钉死 ${target.name}`, `Shadow ${target.name}`), hint: m === 3 ? pair("不给他三分出手空间", "Take away his three") : pair("让最危险的人很难接球", "Make their best scorer work to touch it") },
      { id: "double", label: pair(`包夹 ${target.name}`, `Double ${target.name}`), hint: pair("逼他出球，但会放出空位", "Force the ball out — someone else gets open") },
      { id: "ignore", label: pair("正常防守", "Play straight up"), hint: pair("保持现有防守", "Keep the current defense") },
    ],
    effects: {
      deny: [{ kind: "setDefenseScheme", scheme: "focus", targetId: target.id }],
      double: [{ kind: "setDefenseScheme", scheme: "double", targetId: target.id }],
      ignore: [],
    },
  };
}

/** Build one family's decision body (title/body/choices/effects/player); matchEvents.js wraps it. */
export function buildCritical(candidate, snap, ctx = null) {
  return candidate.family === "clutchOffense" ? buildOffense(candidate, snap, ctx) : buildDefense(candidate, snap, ctx);
}

/** Ratings the snapshot leaves out, read from the live sim's on-court players (read only). */
export function ratingsFromSim(sim) {
  const out = {};
  for (const team of [sim?.home, sim?.away]) {
    for (const p of team?.onCourt || []) out[p.id] = { three: Number(p.three) || 0, paint: Number(p.paint) || 0, scoring: Number(p.scoring) || 0 };
  }
  return out;
}
