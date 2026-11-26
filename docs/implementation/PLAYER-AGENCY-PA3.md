# Player Agency — PA3 Formal Product Specification

- **Status:** product scope APPROVED by the owner (2026-11-26). It was designed and approved in a ChatGPT discussion and never persisted into the repo; this file persists it. The sub-numbering PA3.1–PA3.5 is the owner's recommended formal split, not a pre-existing repo numbering.
- **Direction in one line:** PA1–PA2 taught the player to think alone (player ↔ coach). PA3 makes him play **with his teammates** (player ↔ the other nine on the floor, mainly the four on his team). Becoming a team leader is PA4.
- **Scope decisions (owner):**
  - Continue improving **Player Reborn only**. Do **not** extend Player Agency to GM or Coach modes in this phase (they get their own, different mechanics: Coach = tactics/rotation/timeouts, GM = trades/contracts/draft/payroll).
  - Do **not** implement ADR-006 or redesign the global authority/privileges system. ADR-006 is not a prerequisite.
  - Preserve PA1, PA1.5, PA2 (coach instructions, independent decisions, decision vs execution quality, trust & autonomy, four participation modes, independent RNG stream, the takeover UI). No recalibration without evidence of a real gameplay problem.

## Roadmap

| Phase | Core | Status |
|---|---|---|
| PA1 | Coach instruction, independent call, decision quality vs execution quality | done |
| PA1.5 | Trust, autonomy calibration, calling your own set | done |
| PA2 | Four participation modes | done |
| PA3.1 | Teammate-initiated communication / suggestions | slice 1 (see below) |
| PA3.2 | Player-initiated requests to a teammate | slice 1 (screen only) |
| PA3.3 | Teammate accepts or rejects | slice 1 |
| PA3.4 | Game behaviour <-> teammate relationship | slice 1 |
| PA3.5 | Defensive agency | after slice 1 |
| PA4 | Leadership, team voice, long relationship storylines | later |

## PA3.1 — Teammate Communication

Teammates speak from real game situations. **Ordinary communication must not interrupt the game with a blocking modal.** Everything said must be grounded in information GameSim actually has: if the engine does not record how open a player is, a teammate may not claim to be "wide open".

| Situation | A teammate might say |
|---|---|
| Pick-and-roll chance | "I'll set you a screen" |
| Open perimeter man | "I'm in the corner" |
| Mismatch inside | "Give me the ball, he can't guard me" |
| Fast break | "Run — nobody on the left" |
| Defender out of position | "Help me out" |
| Defending a pick-and-roll | "Switch!" |
| Shot clock short | "Shoot it, no time" |
| Player doubled | "Get it out to me" |

## PA3.2 — Player Requests

The player can ask for cooperation instead of only choosing from what the system offers: the ball (current ball-handler), a screen, "roll" (screener), "pop" (screener), a cut (off-ball man), spacing (relevant teammate), help (nearby man), a switch (relevant defender). **First version exposes only actions GameSim can execute. No button that is only text.** Low autonomy must not forbid independent requests.

## PA3.3 — Teammate Response

Teammates are not puppets. Acceptance depends on: autonomy, team role, the relationship, the teammate's basketball IQ, the current tactic and the real quality of the opportunity. Low-autonomy players can still ask for the ball, but teammates may not comply; a high-autonomy player making an obviously unreasonable request must not be accepted automatically. **A rejected request never blocks the game from progressing. No direct shooting bonus from autonomy.** (Owner's illustrative sketch: autonomy 30, chemistry 50, opportunity 70, role influence 40 -> ~56.5% — a demonstration of how the factors relate, not an algorithm or final balance.)

## PA3.4 — Relationship Evidence

Reuse the existing Career Relationships ledger. No new currency, no second relationship database, no double counting of assists or match rewards. Stable evidence ids, idempotent settlement, **at most ±3 per teammate per game**. Initial parameters (balancing values, not contracts):

| Behaviour | Relationship change |
|---|---|
| Create a high-quality shot opportunity | +0.3 |
| Successful pick-and-roll cooperation | +0.5 |
| Successful alley-oop, if supported | +0.8 |
| Meaningful defensive help | +0.3 |
| Successful high-leverage cooperation | +1.0 |
| Ignore a clearly better teammate opportunity | −0.5 |
| Unreasonable ball request | −0.3 |
| Poor instruction causing a turnover | −0.5 |
| Reasonable pass followed by a missed shot | 0 |

## PA3.5 — Defensive Agency

A defensive specialist must have a meaningful path to earning trust and autonomy; he cannot only earn it through offensive choices. Support, as the engine allows: pressure, give a step vs a drive, steal attempt, help, switch, rebounding position. **Reuse PA1's decision-quality / execution-quality evaluation; no new defensive scoring engine.**

## Implementation rules

- No new LLM dependency, no new currency, no independent simulation engine, no duplicate relationship system.
- One playable vertical slice first, then expand incrementally:
  1. A teammate offers a screen. 2. The player accepts or proposes another action. 3. GameSim executes the supported action. 4. The real result produces decision evidence. 5. Trust and relationship changes are settled exactly once. 6. The player gets understandable feedback.
- Validation: focused tests; one meaningful desktop + mobile browser smoke per major playable slice; demonstrate real gameplay, not only injected fixtures; full regression only at an integration boundary if shared GameSim behaviour changes (not for every UI/wording change).
- Report: player-visible behaviour, supported actions, limitations, evidence, commit SHA.

---

## Audit of the existing implementation (2026-11-26, read-only, before any PA3 code)

**How PA1/PA2 work today** (`js/reborn/season.js` `driveGame`, `agency.js`, `participation.js`): the driver steps GameSim one possession at a time; on the player's possession a `createDecisionGate` (PA2, its own seeded stream) decides whether to ask; `buildDecisionContext` lists options (`follow` / `drive` / `pullup` / `setup` / `pass`) with expected-points `values`; a non-shot choice runs through `playChoicePossession`: set the sim's levers (`setFocusPlay`, `setOffenseFocus`, `autoOffense = false`) for ONE possession, `sim.step()`, restore, and **the possession's points are the execution evidence**. `gradeTakeover` / `combineGrades` turn decision quality + execution into trust/autonomy (caps `MAX_TRUST_PER_GAME = 4`, `MAX_AUTONOMY_PER_GAME = 6`). Reborn games run with `sim._quiet = true`: **`emit()` returns early, so there is no event stream in a Reborn game** — evidence must come from engine state (stats deltas, the possession's points), not from `onEvent`.

**What GameSim can truthfully execute today (the support matrix for PA3.2/3.5):**

| Request / action | Engine support | Notes |
|---|---|---|
| Pick-and-roll | YES | `baller.orders.action = "pnr"` + `team.gameplan.pnr = { screenerId, afterScreen, offBall, finish }` (`engine/pnrPlan.js`); `resolvePnrPlay()` is pure and tells whether the screen is real or a ghost |
| Roll ("顺下") / pop ("外拆") / slip / ghost | YES | `afterScreen: "roll" \| "pop" \| "slip" \| "ghost"` |
| Cut ("空切") / spacing ("拉开空间") | YES | `offBall: { [id]: "cut" \| "spot" }` |
| Pull-up vs drive finish after the screen | YES | `finish: "mid" \| "drive" \| "fake_kick"` |
| "Give me the ball" | YES | `sim.setOffenseFocus(playerId)` |
| Alley-oop | NO as a request | a Lob City duo bonus exists, but there is no "throw a lob" action; PA3.4's +0.8 stays unused until there is |
| Defensive pressure / help / switch / deny | YES, per player | `p.orders.defFocus`: `onball`, `deny`, `allout`, `help`, `switch`, `smart` (`sim.js` defender weights); team-level `switch_all` / `zone_drop` coverage against a pick and roll (`engine/defenseCoverage.js`) |
| Steal attempt, rebound position | PARTIAL | `defFocus: "smart"` scales with steal rating; no explicit "go for the steal" / box-out order — check before promising in PA3.5 |

**What a teammate may truthfully say:** real data exists for personal fouls (`player.stats.pf`), ratings of the five on the floor, score/clock/quarter. There is **no recorded "how open is he"** outside a shot's own openness calculation, so "I'm wide open" lines are not allowed until the engine records it.

**Relationship ledger (`js/career/careerRelationships.js`) — gaps PA3.4 must handle, found by this audit:**
1. `RELATIONSHIP_KINDS` = rivalry / mentorship / coaching-trust / management / owner. **There is no teammate kind.** PA3.4 needs one additive kind (`"teammate"`) in the same ledger (consistent with "reuse the ledger, no second database").
2. `adjustRelationship()` is **not idempotent** (every call appends history). Existing code makes it idempotent at the caller (`recordRivalryGame` checks a `legacyEvent` id first). PA3.4 needs its own settled-evidence guard; writing one legacy event per possession would flood the legacy museum, so the evidence ids and the per-game ±3 budget belong on the relationship record (bounded), not in the legacy log.
3. The ledger lives on the **account** (`account.careerRelationships`), the Reborn run on the **root**; `rivalry.js` already bridges both, so the pattern exists.
4. The ledger's own rule: "every number has a consumer". PA3.3's acceptance probability is the consumer of teammate strength.

**Slice 1 design (decisions this audit makes, open to the owner's veto):**
- Trigger: inside the existing PA2 ask path; a screen offer is one more option in `buildDecisionContext` (field `offer`), not a new modal and not a new gate.
- Execution: the existing PnR levers for exactly one possession (`orders.action = "pnr"`, `gameplan.pnr` with the named screener and `afterScreen`), restored afterwards, same pattern as `playChoicePossession`. ~~No engine change is needed for slice 1.~~ **Corrected after building it: one small engine hook WAS needed, see "Slice 1 as built".**
- Evidence: the possession's points (and turnover) feed the existing `evaluateDecision`; the relationship delta comes from the PA3.4 table; evidence id = game id + decision id + teammate id.
- Randomness: any acceptance roll uses its own seeded stream, like PA2's gate; GameSim's RNG is untouched.
- Out of slice 1: PA3.5 (defense), alley-oop, "ignored a better teammate" (needs a counterfactual), free-form requests beyond screen / roll / pop.

## Slice 1 as built (2026-11-26) — what is real, and how we know

Code: `js/reborn/teamplay.js` (new), additive hooks in `agency.js` / `participation.js` / `season.js` / `rivalry.js` (one `export`), UI in `js/ui/reborn/{agencyView,takeover,rebornView}.js`, ledger kind `"teammate"`, **one hook in `js/engine/sim.js`**. Tests: `tests/rebornTeamplay.test.js` (13). Browser: `scripts/qa/reborn-teamplay.mjs` (desktop 1440 + mobile 390, zh + en).

### The GameSim change (shared engine) and its effect
`sim.requestedBallHandlerId` (default `null`). In `resolvePossession`, right after `pickBallHandler()` has drawn, a request made by the player's own side replaces the handler for that ONE possession and is cleared on the spot; put-backs are left alone.
- **Why it is needed:** `pickBallHandler` is a weighted random draw; `setOffenseFocus` only tilts the weights. Measured over 3 team-eras x 8 seeds with a non-star as the player: the named screen ran in **24.6%** of requested possessions without the hook, **37.2%** with it. Without it, roughly one asked-for screen in three would silently be a different play.
- **Why it is safe:** the draw happens first, so the dice are consumed exactly as before; unset (every other game) changes nothing. The full suite (4332 tests, incl. the engine determinism tests) passed with it. Not saved, never persisted.
- A second finding, no engine change: `setOffenseFocus(id, { action })` rebuilds the handler's `orders`, so orders set by hand BEFORE it are discarded and the engine never sees `"pnr"` (the first prototype was a silent no-op: 3.6% -> 6.4%). The action must go through `setOffenseFocus`, and the way back through the same public call (it also recomputes lineup chemistry). PA1's "ball to the coach's man" has the same tilt-not-force property; unchanged.

### Evidence per step (a button is not proof)
| Step | Real evidence |
|---|---|
| Offer | `screenOffer` = the engine's own `recommendPnrPlan` on the live floor (teammate on court, never you; none under 8 s). The foul line quotes `stats.pf` only (>= 3) |
| Accept / ask for the other way | `playScreenPossession` runs ONE possession through `setOffenseFocus(id, {action:"pnr"})` + `gameplan.pnr` + the hook; levers are restored (test 4 compares `orders`, gameplan identity, focus, autopilot) |
| It ran | the named screener is credited `"挡拆掩护"` by the engine in far more possessions than on the autopilot (test 3: pop and roll differ from each other and from the control); test 4b: with vs without the hook |
| Refusal | `acceptanceChance` (owner's sketch = 56.5%) + one roll on its own seeded stream `teamplay\|decisionId` (test 5: same id, same answer; GameSim results identical with and without the rolls). A "no" = not carried out, not graded, nothing settled, possession plays on |
| Settle | possession points / turnover from the sim: scored +0.5 (clutch +1.0), miss 0, turnover -0.5; per teammate per game capped at +-3, once per (game, teammate) (test 8) |
| Ledger | run is the truth (`reborn.teamplay`, fractional); account gets an idempotent INTEGER copy via `mirrorTeammatesToAccount` (the ledger rounds), same pattern as rivalries/jerseys/honours (test 9). Browser: records appear, one per teammate |
| Player feedback | post-game lines: what the screen did, who declined, chemistry +-n |

PA1/PA2 untouched: the two new options are graded but excluded from the baseline (median, blurred read, PA2's opportunity gap) — test 6, and the existing "autonomy softening magnitude" test would fail otherwise.

### Known limits / found, not fixed
- Slice 1 lives inside the PA2 ask: still ONE blocking dialog per decision. The owner's L1/L2/L3 split (below) is the next UI work; slice 1 does not solve fatigue in Full control.
- Slice 1 only helps a ball-handler; off-ball, defense, rebounds have no teammate presence yet (slices 2-3).
- Pre-existing PA2 oddity: the gate can still ask at `Q4 0:00` (the game is effectively over). Not caused by PA3; screen offers correctly do not appear then.
- Headless screenshots taken the instant the modal appears catch its fade-in (page shows through); 900 ms later the dialog is clean. Not a layout bug.

## Owner direction after slice 1 (2026-11-26)
Interaction levels: **L1** ordinary talk = non-blocking bubble / feed, no pause; **L2** a tactical moment = short action panel with keys, waits for the player; **L3** full decision panel only for real moments (buzzer, rival, coach conflict, Finals). Ordinary teammate talk must not all be big blocking modals; share ONE dispatch entry with Critical Moments so a possession never opens two dialogs.
Slice order: **S2** ask for the ball, create for teammates, off-ball screen / cut / spacing (teammate may accept, refuse or counter; only what the engine really supports) -> **S3** defense: help, switch, pressure, box-out (defensive players need their own growth path) -> **S4** L1/L2/L3 UI layering -> **S5** long-term chemistry changing teammate behaviour -> PA4. Teammates should have basketball judgement derived from attributes + context, not hard-coded per type. No LLM, currency, second relationship database or second engine.

## Slice 2 audit (2026-11-26, measured, no S2 code yet)

What the engine really reads for a player's own action (`orders.action`): `pnr`, `drive_kick`, `iso`, `post`, `spot`. **`cut` is not a standalone action** (it exists only as `offBall` inside a pick-and-roll plan; zero standalone reads), and there is no hand-off or off-ball-screen lever. So S2 must not ship a "cut" or "off-ball screen" button.

| Request | Engine lever | Verdict |
|---|---|---|
| Call for the ball (I run this one) | S1's `requestedBallHandlerId` + an action | real |
| Spot up / "find me" (off-ball) | `setPlayerOrders(id, {action:"spot"})`: receiver weight x1.45, three-point weight x1.35, handler weight x0.82 (do NOT use `setOffenseFocus`: it makes you the handler) | real, **modest** |
| Post up / feed the post | `action:"post"` (paint weight x1.3) + focus play `post_up` | partial |
| Cut, off-ball screen, hand-off | none standalone | not available |

Measured (3 team-eras x 10 seeds x 2 non-star slots = 1800 own possessions): spot-up request -> I get a shot **14.7% -> 19.6%**, I score **6.8% -> 9.2%**, team points per possession **1.057 -> 1.038** (unchanged). It moves touches to the player; it does not make the offense better, and ~80% of the time the player asked and did not get the ball. UI copy and feedback must say so ("you asked; the team did not find you"), never promise the ball.

Evidence that exists without an event stream: the player's own `fga/fgm/pts` deltas and each teammate's `ast` delta for the possession (the passer is the teammate whose `ast` rose). A refused or ignored request must cost nothing; an unreasonable ball request (-0.3 in the PA3.4 table) needs a definition from stats (e.g. a turnover or a clearly worse look than the passer's alternative) before it is allowed to bite.

## Slice 2a as built (2026-11-26): "find me" (off-ball request)
`teamplay.js`: `spotOffer` (the best passer on the floor, never you, none under 8 s), `playSpotPossession` (`setPlayerOrders(id, {action:"spot"})` for ONE possession, restored; **no GameSim change**), `settleSpot`. Same acceptance rule as any request (own seeded stream; a "no" is not carried out and costs nothing).
Evidence: the player's own `fga/fgm/pts` deltas and the teammate whose `ast` rose (the passer). Settle: only "I scored and someone assisted" moves chemistry, +0.5 (+1.0 clutch), with the man who really passed (not necessarily the one asked); not getting the ball, a miss, or a refusal = 0. The "unreasonable ball request" penalty stays OFF until it has a definition from stats.
UI copy never promises the ball ("不保证传给你 / the ball is not guaranteed"); outcomes: fed / got a shot / the team did not find you / he did not go along. Keys 1-8.
Tests 13-17 in `tests/rebornTeamplay.test.js`; extreme-value test proves PA3 options never move old grades or PA2's opening gap (the real floor alone could not catch a baseline leak). Mutations caught: no engine order, credit the wrong man, orders not restored, a PA3 option leaking into the baseline (screen or spot), punishing an ignored request.
Not built (engine has no lever): standalone cut, off-ball screen, hand-off; post-up / "feed the post" is only partial. Next: S3 (defense) needs a measurement first — there is no explicit box-out or go-for-the-steal order.

## Slice 3 audit (2026-11-26, measured, no S3 code yet)

Setup: the player's `defFocus` set for ONE defensive possession via `setPlayerOrders`, restored; 3 team-eras x 10 seeds x 2 non-star slots = 1800 opposing possessions per row. Per possession:

| defFocus | opp points | my steals | my fouls | opp turnover rate | my rebounds |
|---|---|---|---|---|---|
| auto | 0.986 | 0.010 | 0.032 | 0.130 | 0.060 |
| allout | 0.986 | **0.031** | **0.048** | 0.143 | 0.061 |
| onball | 0.989 | 0.019 | 0.045 | 0.135 | 0.056 |
| deny | 0.973 | 0.019 | 0.036 | 0.132 | 0.057 |
| smart | 0.970 | 0.019 | 0.035 | 0.134 | 0.058 |
| help | 0.966 | 0.011 | 0.033 | 0.127 | 0.061 |
| switch | 0.978 | 0.011 | 0.035 | 0.130 | 0.061 |

Reading it honestly:
- **Gambling for the steal is real and is a genuine trade**: `allout` triples steals (0.010 -> 0.031) and costs ~50% more fouls. Far outside noise. Evidence exists without events: the player's own `stl` / `pf` deltas.
- **Rebounds do not move at all** (0.056-0.061 across every focus): **there is no box-out lever**. A "box out" button would be a lie until the engine gets one (needs its own measured lever, not a label).
- **help / switch / deny do not show a scoring effect we can measure**: 0.966-0.989 opposing points per possession is inside the noise of 1800 possessions (SE ~0.03). Grading a "help defense" decision by opposing points would reward luck. Their effect on a pick and roll specifically goes through `defenseCoverage.js` (team level), not through the player's `defFocus`.

Consequences for S3 (proposal, not built):
1. Ship only what is real: a **steal gamble vs. stay-disciplined** decision with its real trade (steals vs fouls, graded on his own `stl`/`pf`/forced turnovers, never on opposing points).
2. **Do not expose box-out, help or switch as outcome-bearing decisions** until the engine has a measured lever for them.
3. "Defensive players need a meaningful growth path" therefore needs design before code: today the engine gives a defender two things to be good at that are measurable (steal pressure and not fouling) and nothing for rebounding position or help. A real growth path needs either an engine lever for rebounding position (an engine change with its own measurement and full regression) or a defensive grade built from stats the engine already records (stl, blk, pf, forced tov, opposing FG% as the primary matchup). Decision needed before S3 implementation.

## Slice 3a as built (2026-11-26): the defensive gamble (option 2: no engine change)
Owner/Code decision: do NOT add an engine lever for box-out yet; build the one defensive decision the engine really backs and grade it on stats the engine already records.
`js/reborn/defense.js`: two options on THEIR possession - **gamble for the steal** (`defFocus: "allout"` for ONE possession via `setPlayerOrders`, restored; **no GameSim change**) or **stay home** (nothing runs; the team's own defense). Value of the gamble (points per possession, starting numbers, tests pin directions only): `(steal rating - 50) x 0.002` - `0.07 x (fouls beyond 2)` - `0.04 if fatigue >= 70` + `0.08 if trailing by <= 10 late` - `0.06 if leading by >= 10 late`; stay = 0 by construction. For an average player at an even score the gamble is worth exactly nothing, matching the measured flat opposing points.
Grading: `decisionQuality(values, choice, baseline)` got an optional fixed baseline (defense passes 0; a median of two options would call a bad gamble "neutral"). Staying home is never graded. Execution from his own stats: steal +1 (+0.4 if it cost a foul), foul -0.6 (-1 on a 5th+), a forced turnover +0.4. Existing trust/autonomy rules unchanged. No relationship consumer for defense (nothing honest to attach to yet).
Asking: shares the offense's gate (a game's total questions still obey `MODE_PACING`), only when the choice is real (`|gamble| >= 0.05`) and with a **4-opposing-possession cooldown** after each question. Measured over 54 starter-level full games: no cooldown = avg 6.8 questions/game, max 26 (a man in foul trouble was asked every possession); cooldown 4 = avg 2.1, max 7, none above 8. Key possessions never asks the defense (value gap is far below its threshold); Automatic never asks.
UI: compact panel (facts that are real fields: fouls, stamina %, steal skill; two options; an honest line "a gamble does not stop them scoring: it buys steals and costs fouls"), post-game line per gamble (steal / steal+foul / foul / forced turnover / nothing), defense-specific verdict words. Keys 1-2.
Tests `tests/rebornDefense.test.js` (9; 8 mutations caught: no engine order, orders not restored, median baseline, staying home graded, no stakes threshold, key mode asked, steal not rewarded, no cooldown). Browser `scripts/qa/reborn-defense.mjs` desktop 1440 + mobile 390, zh + en.
**Findings to keep in view:**
- A bench rookie almost never meets a defensive choice: two rookie seeds got ONE question in a whole 82-game Full-control season (he does not play, so there is nothing to decide). High involvement averages ~0.2 questions/game for starters (it needs a close, late game AND a real gap), so the "frequent say in defense" line of High involvement is not met; Full control is where defense shows up. Tuning that is a product call (lower `MIN_DEFENSE_STAKES`, or let High ask on the same threshold as Full) - not done without a target frequency.
- Still no lever for box-out / help / switch. A defensive growth path beyond steal pressure and fouling needs either an engine lever (measured, full regression) or a defensive grade from stl / blk / pf / forced turnovers / opposing FG% as the primary matchup.

## Interaction levels L1 / L2 / L3 as built (2026-11-26)
One pure rule, stamped on the context at all three ask sites (classic clutch ask, offense gate, defense gate): `askTier({critical, conflict, importance, opportunity})` in `participation.js`.
- **L3 full dialog**: a clutch possession, or the coach disagrees with you (a coach call is always L3). Unchanged.
- **L2 compact panel**: important (`importance >= 0.55`) or a clear opening (`opportunity >= 0.3`). Keeps options, the teammate card and the involvement switch; drops the coach card and the autonomy lecture; docks to the bottom.
- **L1 bubble**: everything else. `js/ui/reborn/bubble.js`: a small floating line + a chip per option; NOT a Shell screen (the Shell overlay is an opaque full-viewport cover that traps focus). Never takes focus; keys 1-8 answer; an unanswered bubble times out to null after 3.2 s (he plays it on his own read, nothing graded). **WCAG 2.2.1**: hover/focus pauses the countdown. **Anti-fatigue**: after two unanswered in a row the next window is 1.2 s. **Click guard**: a click in the first 250 ms is ignored (the bubble can pop up under the pointer that just clicked "play next game"; keys are not guarded).
- A defensive question is never L3 (a style choice is not a clutch moment).
- Measured in a real browser (MutationObserver lifetimes, desktop 1440 + mobile 390, zh + en): ignored bubbles live ~3.2 s, then ~1.2 s after two ignored; a hovered one stays; a key removes it at once; the bubble is not a modal, never takes focus, chips >= 44 px; the L2 panel docks to the bottom without a coach card; a real moment still shows the coach card.
- **Dispatch for later moments**: `driveGame` runs ONE ask branch per loop, so only one panel per possession already holds. The buzzer-beater proposal (`docs/implementation/buzzer-beater-in-game-design.md`, still PROPOSED/unapproved) plugs in as a new first branch with `askTier({critical: true})` semantics; it must not stack with a PA3 ask in the same possession (its own once-per-game rule keeps it out of the gate's pacing). Not built: it is unapproved.
- Tests `tests/rebornAskTier.test.js` (10; 9 mutations caught). Browser `scripts/qa/reborn-tiers.mjs`. A first mobile run hung because the SCRIPT left the mouse parked on the play button, so the bubble popped up under it and hover paused it forever; that is what prompted the click guard.
- Still open: bench players meet few asks; High involvement rarely asks defense (product call); Full control still waits up to 3.2 s per unanswered bubble.
