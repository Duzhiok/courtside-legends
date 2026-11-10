# Coach Tactical Depth — design + audit (workstream B, Career 2.0)

Status: slice implemented on `feature/coach-tactical-depth`. No sim.js changes,
no new dice, no decorative bonuses. GameSim stays the sole authority on results.

## 1. Audit first: do the three indicators already have engine consumers?

**Tactical Familiarity — YES, an equivalent consumer exists.**
`GameSim.setTactic()` (js/engine/sim.js:2310) sets `t.tactic` and computes
`t.fit = lineupFit(onCourt, coach, tactic, ballOpts)`; `lineupFit`
(js/engine/chemistry.js:87) scores how well the roster executes a system from
player archetypes vs the tactic's `needs`, spacing/paint balance and IQ.
`systemFitScore` (js/data/intangibles.js, via sim.js:2267) scores each player by
personality (ego/fiery), `intangibles.systemAdapt` and `ballNeed`. `shout()`
(sim.js:2246) yanks drifters back onto the called tactic (`t.temp.tacticHold`).
The engine already computes execution quality from the roster — so familiarity
is stored only as *history* (games/possessions each system was actually run),
and the slice reads the engine's live `fit` as the execution signal. No new
engine field.

**Player Buy-in — YES, equivalent consumers exist.**
`team.morale` (0–100) is read by the engine: low morale triggers events
(sim.js:1826) and performance dips (sim.js:1186/1258); `shout()` backfires when
the on-court ego average is > 75 — "球星不买账，士气反而下滑" (sim.js:2253) —
literally a buy-in check. `p.mood` and `team.chem` are the same family
(`talk()`, sim.js:2301). Buy-in is therefore a *derived readout* from live
morale + fit + the promise record, never a stored bonus.

**Opponent Readiness — NO equivalent consumer.**
The opponent AI (`cpuAutoAdjust` / `managedOffensePlan`, sim.js:1982–2130, and
`autoDefense`) reacts to score, clock and roster, but keeps no memory of which
system you run. So readiness is a genuinely new field — stored in the
*career record* (slice state), never in sim.js. It is consumed three ways:
(a) it drives which Coaching Moment the slice presents and what the assistant
says; (b) it shapes the decision preview (a system the opponent has seen 3×
in a row is flagged "read", with the opponent's *measured* scoring since you
last ran it, from the real event stream); (c) the counter is delivered by
switching systems through `setTactic`, which the engine consumes. No fake
bonus is ever added to the engine.

## 2. The three indicators (js/career/coach/tacticalLearning.js, pure)

- `familiarityOf(state, tacticId)` — 0–100 from games the system was run:
  `100 * (1 - 0.85^games)`, minus 4 per game since it was last run (stale
  systems decay), clamped 0–100. ~6 games to feel familiar.
- `buyInOf({ morale, fit, promisesKept, promisesBroken })` — derived readout:
  `round(0.55*morale + 0.45*fit) - 8*broken + 3*kept`, clamped 0–100.
  Morale and fit are live engine numbers; promises are settled against real
  game data (see below).
- `opponentReadinessOf(state, tacticId, opponentKey)` — `min(100, exposures*25)`
  per opponent + system. 4 exposures = fully read.
- `executionRisk({ familiarity, fit, buyIn })` — solid / shaky / risky, with
  named reasons, for the decision preview.
- `TACTIC_TRADEOFFS` — code-verified table of the real engine effects of each
  choice (multipliers + the sim.js lines that consume them). Previews quote
  these, never the TACTICS-table marketing copy: e.g. `switch_all`'s desc says
  "换防本身没有单独逻辑" and `zone_drop`'s desc admits the corner weakness
  "目前没有对应实现" — the preview says what the engine actually does.
- Promises (`recordPromise` / `settlePromises`) — kinds `star-touches`
  (star's shot attempts in the window ≥ threshold), `defense-holds` (opponent
  points in the window ≤ threshold), `comeback` (deficit cut by ≥ threshold).
  Checked against the real event log; a kept promise lifts buy-in, a broken
  one drops it.
- `challengeCareerEffect({ won, goalAchieved })` — the reputation consequence
  through the existing reputation system's goal component
  (REPUTATION_GOAL_HIT / GOAL_MISS from js/career/balance.js, the same
  constants `seasonReputationDelta` uses). The season win-rate component is
  deliberately NOT applied to a single game.

## 3. The playable slice: "Coach: tactical comeback challenge"

js/career/coach/coachingChallenge.js (sim-driven controller, no DOM) +
js/ui/coachingMomentView.js (DOM view) + dev entry `?coach-tactics=1`.

Scenario (reuses the M2b machinery: `buildClutchTeams` + `startClutchSim`):
2016 GSW (you, home) vs CLE, Q4, 12:00, down 10 (85–95), CLE ball. The
player's team carries a coach object so `coachTactics()` offers the slice's
systems. `autoOffense`/`autoDefense` stay off (their defaults), so the sim
never overrides a player tactic choice.

Moments (triggered by real game state, never random):
1. **Opening** — Q4 start, down 10. Three defensive-system choices, each one
   real `setTactic()` call with a real downside:
   - `switch_all` 无限换防 — defense ×1.10, offense ×0.99; fit-gated (needs
     switch-capable archetypes; a roster without them executes it poorly).
   - `zone_drop` 沉退联防 — defense ×1.08, pace ×0.95; fewer possessions
     while chasing 10 points.
   - `pack_paint` 收缩篮下 — block ×1.25, paint base −0.07, but kick-out
     open +0.08 (opponent threes get easier).
2. **Opponent run** — opponent outscores you by 8+ since the last decision
   (or their star has 8+ in the quarter). Timeout+talk (real `callTimeout` +
   `talk()`, costs one of 7 timeouts, morale +4 / chem +3 and breaks the run);
   double the hot hand (real `setDefenseScheme("double", starId)` — the
   engine's kick-out logic is the real risk); or change the focus
   (`setFocusPlay("pace_three"|"iso_star")`, ~6 possessions, defense unchanged).
3. **Late** — clock ≤ 150 and deficit ≤ 6. A clutch call through the existing
   M2b contract (`createClutchController`, driven manually — `resolve()` is
   NOT used because it plays the rest of the game out); grind it out
   (`setTempo("grind")` + `setFocusPlay("slow_pace")`); or push the pace
   (`setTempo("push")` + `setFocusPlay("pace_three")`, rushed shots and more
   turnovers per the real tempo table).

Between moments the player steps the sim in small chunks, and can always call
a timeout, shout/talk, change focus/tempo, or substitute — all through the
existing sim APIs (`createTacticalTakeover` + `sim.*`). Every decision is
logged with clock, score, fit and morale before/after.

**Decision-effect report** (after the game): final score and W/L from the sim,
one row per decision with the score swing from decision time to the next
decision (or the end), fit/morale before → after, the engine events inside
the window, promises settled, and the reputation delta. Nothing is fabricated:
swings come from the sim's own snapshots, events from its own `onEvent` log.

## 4. Measurement

scripts/measure/coach-tactics-ab.mjs — fixed seeds, same Q4, four arms:
baseline (no player decisions) vs switch_all vs zone_drop vs pack_paint at the
opening moment. Reports final score, win rate and average swing per arm. The
RNG stream is identical per seed; the only difference is the decision, so any
gap is the engine's own consumption of the choice.

## 5. Limitations (honest)

- The slice is a standalone challenge, not a career season: familiarity and
  readiness start from the challenge's own history (one game), so the
  indicators are thin on a first play — they deepen across a career once the
  state is persisted on the career record (integration's job).
- Opponent readiness has no engine-side memory; its effect is informational
  (moment generation + preview + measured attribution), not a sim modifier.
- The late clutch option needs your side to have the ball and a shooter on
  court; if the window never opens (deficit stays > 6), the moment never fires.
- No playoff round / multi-game arc in the slice; the comeback is one Q4.
- Browser QA owed (Mac): scripts/qa/coach-tactical.mjs.
- **Synchronous-driving note (found in testing):** the opponent AI calls
  timeouts that pause the sim, and an uncleared pause makes every later
  `step()` a no-op (`_resolvePossession` aborts at `if (this.paused) return`).
  Any synchronous driver of GameSim must consume timeout/quarter breaks by
  clearing the flags directly — never `setPaused(false)`, which re-arms the
  async `_loop`. The controller does this in `resumeBreak()`; `runFast()` is
  immune (quiet mode never pauses).
