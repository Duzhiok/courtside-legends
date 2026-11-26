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
- Execution: the existing PnR levers for exactly one possession (`orders.action = "pnr"`, `gameplan.pnr` with the named screener and `afterScreen`), restored afterwards, same pattern as `playChoicePossession`. No engine change is needed for slice 1.
- Evidence: the possession's points (and turnover) feed the existing `evaluateDecision`; the relationship delta comes from the PA3.4 table; evidence id = game id + decision id + teammate id.
- Randomness: any acceptance roll uses its own seeded stream, like PA2's gate; GameSim's RNG is untouched.
- Out of slice 1: PA3.5 (defense), alley-oop, "ignored a better teammate" (needs a counterfactual), free-form requests beyond screen / roll / pop.
