# UI/UX Overhaul 3.0 — Phase 0 Source Audit (Gold Challenge)

Audited: `origin/main` @ `65b46f8` (fetched 2026-11-14), worktree `cls-ui3`, branch `ui3-audit`.
Method: every claim below was read in source or reproduced; line numbers are at `65b46f8`.
Nothing in production code was changed for this audit.

Evidence (outside the repo):
- BEFORE screenshots, desktop 1440×900 + mobile 390×844: `/tmp/ui3/before/` (market, setup, setup with
  advanced open, live, paused, result), plus `metrics.json`. Script: `/tmp/ui3/baseline.mjs`.
- Live-override leak probe (real GameSim): `/tmp/ui3/leak_probe.mjs`.

---

## 1. Coordination board and file ownership

`docs/AGENT_CHAT.md` has no active claim on the Gold setup / live-game UI. Open work that **overlaps** this
overhaul, found by inspecting every worktree against `origin/main`:

| Worktree / branch | State | Overlap with UI 3.0 |
|---|---|---|
| `cls-tend` `feat/player-tendencies` | **uncommitted**, 40 commits behind main; edits `index.html`, `js/app.js`, `js/engine/gameplan.js`, `js/engine/sim.js`, `js/data/playerPrefs.js`; new `tendencyEditor.js`, `playerTendencies.js`, `tendencyEdit.js`, `css/tendencies.css` | **Direct**: a second per-player tactical editor. Owner unknown on the board. |
| `cls-events` `feat/match-events` (Wibey) | 2 unmerged commits + uncommitted `app.js`, `savegame.js` | Live-game screen (event cards / decision panel). |
| `cls-coachint` `coach-intel` | uncommitted edits to `coachDrivenAnalysis.js`, `lineupRecommendations.js`, `opponentScouting.js`, `playerRoleFit.js`, `teamIntelligenceView.js` | The analysis modules this plan wants to reuse. |
| main, Lychee `65b46f8` | merged | `gameplan.js setupPlayerList` + `renderSetupOrders` (Gold setup orders list). |

`js/ui/matchEventCards.js` + `css/matchEvents.css` (Lychee) are on main but **imported by nothing except their
test**: they wait for Wibey's engine. Not obsolete, but they must get a slot in the new live layout.

## 2. Gold Challenge flow trace

| Step | Entry | Render / state | Notes |
|---|---|---|---|
| Mode entry | `.mode-card[data-mode="career"]` → `startMode("career")` (app.js:1735) → `startCareer()` (5035) | `bootCareerBracket({challengeTier:"gold"})` (4909) → `state.career` (`kind:"career"`) | 32-team pod bracket, `career.gold` economy. |
| Market | `#screen-market`, `#btn-market-done` (6176) | `ensureTeamStaff`, `yourCareerMatch(c)` | Then `openSetup(c.team, opp, "home")`: **the setup edits `career.team` itself (same reference).** |
| Pre-game setup | `openSetup()` (6220) | `state.pendingMatch`, `state.setup {you, selected}`; renders `renderSetupRoster` (7284), `renderSetupPacks` (6371), `renderSetupTempo` (6357), `renderSetupRoles` (6551), `renderSetupOrders` (6469), `renderSetupGameplan` (6710), `renderPhilTactics` (6839), `renderCareerSkillShop` (4550), `renderScoutBoard` (5240) | `resolveEffectiveGameplan` is called **only `if (state.season)`** (6263). |
| Tip-off | `#btn-setup-confirm` (7441) | reads every form field → `applyCoachPhilosophy` → `you.coach`; `you.starterIds`; `p.playPos`; `you.gameplan = {matchup, matchupAssignments, offenseFocusId, tempo}`; `p.orders` | Persist: season → `persistMatchupRotationFromTeam` / `persistSeasonRotationFromTeam`; ranked → `rememberPlayerPrefs`; **Gold → nothing explicit** (relies on the shared reference + `autosaveCareer`). |
| Live game | `beginGame()` (7520) → `new GameSim({home, away, ...})` | `onTick` → `paintScore/paintLineups/paintMeters/fillSubSelects/court.render/syncPauseUI` | One shared `#screen-game` for every mode. |
| Pause | `#btn-timeout` (8616) → `sim.callTimeout()`; `syncPauseUI` (8504), `syncCoachActionLocks` (8550) | Dead-ball controls are **disabled, not hidden**, while live. | |
| Substitution | `#sub-out-list` / `#sub-in-list` cards + `#btn-sub` (8784) → `sim.substitute` | `fillSubSelects` (8389) | |
| Result | `onEnd` → `syncInjuriesToTeams`, `syncFormToTeams`, `showResult` (9029), `autosaveCareer()` (738) | `renderResultExplain` (8997, `matchExplain.js`) | |

## 3. Every visible tactical control → GameSim input → persistence

"Sim reads" = verified read site in `js/engine/sim.js` (or a helper it calls). P = persists into the Gold save.

### Pre-game (`#screen-setup`)
| Control | Writes | Sim reads | When applied | P |
|---|---|---|---|---|
| Starter drag/drop, click | `state.setup.selected`, `p.playPos` (`setupDropOntoSlot` 7167) | `starterIds`, `playPos` everywhere (`wrapTeam`, shot/defense calcs) | playPos **immediately**; starters on confirm | yes |
| Per-starter "打" position select | `p.playPos` | yes | immediately | yes |
| Philosophy sliders `#phil-off/def/morale/stam` | `coach.buffs` via `applyCoachPhilosophy` | `coach.buffs` (6 sites), morale init | on confirm | yes |
| Tactic checkboxes `#phil-tactics` | `coach.specialTactics` (ordered default-first) | `coachTactics()` → `team.tactic` = **first only** at tip-off; the rest = in-game switch pool | on confirm | yes |
| Lineup packs `#setup-packs` | `you.lineupPacks`, `playPos` | `lineupPacks` (live switching) | immediately | yes |
| Tempo `#setup-tempo-select` | `you.gameplan.tempo` | `gameplan.tempo` (`setTempo` 1586) | **onchange immediately** | yes |
| Matchup board `#setup-matchup-board` | `gameplan.matchupAssignments` | `defensePlan.assignments` (sim.js:200-210) | render writes defaults; user edits on confirm | yes |
| Focus defender/target/scheme `#gp-*` | `gameplan.matchup.{defenderId,targetId,scheme}` | `defensePlan` | on confirm | yes |
| Role select `#setup-roles .role-select` | `p.roleExpectation`, resets `p.targetMinutes` | **no direct dice**: copied into snapshot; narrow effect via `isBlueCollarRebounder` (skills.js:3254); minutes are the real lever | immediately | yes |
| Minutes `.min-input` | `p.targetMinutes` | rotation (sim.js:1696-1752, 3683) | immediately | yes |
| Ball handler + ball action `#setup-offense-focus/ball-action` | `gameplan.offenseFocusId`, `p.orders.action/usage` | `offenseFocusId`, `orders.action/usage` | mixed (onchange + confirm) | yes |
| Player orders `#setup-orders` (usage / attack / action / hunt / aggression / def) | `p.orders.*` | `orders.usage/attack/action/hunt/defFocus`; `aggression` via `aggressionLevel()` | immediately | yes |
| Skill shop / inventory | `career.gold`, `p.skills` | skills | immediately | yes |

### Live (`#screen-game .coach-panel`)
| Control | GameSim API | Live-ball? | Notes |
|---|---|---|---|
| 叫暂停 / 大喊 | `callTimeout`, `shout` | live only | |
| 沟通 | `talk` + strategy panel | dead only | |
| Tactic select + 布置 | `setTactic` (2310) | dead only | one active tactic |
| Tempo select + 应用 | `setTempo` | dead only | **duplicate** of takeover tempo buttons |
| Focus-play select + 执行 | `setFocusPlay`; clearing writes `sim.focusPlay = null` directly | dead only | **duplicate** of takeover focus |
| 战术接管 focus + tempo (`tacticalTakeover.js`) | `setFocusPlay`, `setTempo` | **allowed live** | same op, opposite rule to the dead-ball panel |
| Live philosophy sliders + 应用 | `applyPhilosophy` (2321) | dead only | |
| Lineup packs | pack apply → `substitute`/`setPlayPos` | dead only | |
| Position list `#pos-live-list` | `setPlayPos` (2346) | dead only | also editable from sub cards |
| Ball handler + action | `setOffenseFocus` (328) | dead only | 3rd entry point to the same field |
| Player orders | `setPlayerOrders` (365) | dead only | |
| Live matchup board + focus/double/bump/clear | `setMatchupAssignment`, `setDefenseScheme`, `clearDefenseScheme` | dead only | |
| Substitution | `substitute` (2385) | dead only | |
| Speed, pause sim, 3× autopilot, quick sim | `setSpeed`, `setPaused`, `setAuto*`, fast run | any | |

## 4. Why the "previously discussed tactics UI" is not in Gold Challenge

It exists, it just is wired to other modes:
1. **Team Intelligence / coach tactical profile / coach-system fit** (`teamIntelligenceController.js`,
   `teamIntelligenceView.js`, `coachTacticalProfile.js`, `coachSystemFit.js`) are imported **only** by
   `myTeamClubhouseScreen.js`. The controller is account-bound (`resolveCoach(account)`, `setAccountTactic`).
2. **Matchup Intelligence v4** (`matchupController.js` → `matchupPlanView.js`) is mounted only on
   `#season-next-scout` and bound to `state.season` (app.js:9314).
3. **Default rotation board** (`rotationBoard.js` builders) renders in the season hub (`renderSeasonRotation` 9628),
   My Team lineup, gacha and roster evaluation, never in `openSetup`.
4. **Effective gameplan** (`resolveEffectiveGameplan`) runs only when `state.season` exists. Gold has no
   Team Default / Matchup Plan concept: one mutable `career.team.gameplan` + `career.team.coach`.
5. Gold's setup therefore shows its own older implementation: everything tactical sits in
   `<details id="setup-advanced">` at the bottom, below the skill shop, the starter cards and the bench.

## 5. Confirmed problems

**P0 — correctness (affects the Team Default / Live Override rule)**
1. **Live overrides leak into the Gold save.** `wrapTeam` (sim.js:2639) keeps `gameplan: team.gameplan`
   by reference. Gold passes `career.team` itself. Probe result (real GameSim): after a paused
   `setTempo("push")` + `setOffenseFocus(...)` the *source* team became
   `{"tempo":"push","offenseFocusId":"bealbr01-2020-was"}` (was `normal` / `null`). The autopilot also writes
   `you.gameplan.tempo = "grind"` when leading (sim.js:2058) and late-game scripts write
   `offenseFocusId` (sim.js:3138, 3202). Next game's setup pre-fills tempo and ball handler from these
   (`renderSetupTempo`, `renderSetupOrders`) and `autosaveCareer` persists them. Season is unaffected
   (`cloneLiveTeamSide` deep-clones). Players' `orders` do not leak (roster is `structuredClone`d).
2. **Previews already mutate the save.** In setup, roles, minutes, orders, positions, packs and tempo write
   to `career.team` on change, before tip-off; philosophy, tactics and matchup focus only on confirm.
   There is no Apply/Reset and no way to abandon edits.

**P1 — product / UX (measured on the BEFORE screenshots)**
3. Setup: the skill shop takes the top of the page; tactics are invisible unless the user opens the bottom
   `<details>`; the confirm button sits ~2,000 px down on desktop. Collapsed setup = 9 controls; opening
   "进阶设置" adds **116 controls (74 `<select>`, 38 inputs)**.
4. Every starter and bench player is a "full" card (20+ attribute cells, mostly red low-value styling);
   no compact or tactical level.
5. "对手一眼看" in Gold is the bracket log + name lists (`renderScoutBoard`, hard-coded Chinese). It never
   answers "what is the opponent's weakness"; the existing `opponentScouting.scoutOpponent` is unused here.
6. Live coach panel: **127 controls (43 `<select>`)** visible at all times; dead-ball ones are disabled, not
   collapsed. Mobile panel height **4,640 px**; at 390 px the live viewport shows locked substitution cards
   instead of the court.
7. Court is a minor element: desktop 574×300 px = **13 %** of the viewport. Name-tag collisions measured on
   real frames: desktop **2** overlapping pairs, mobile **5–6** of 10 tags. Tokens have no avoidance;
   "攻/防" text repeats what colour already says; court footer text overlaps the "主队篮筐" zone tag.
8. Duplicate controls on the same screen: tempo and focus play appear twice (takeover + dead-ball panel)
   with opposite live-ball rules; ball handler has three entry points; positions two.
9. The tactic picker is a multi-select of the whole catalogue before the game but a single select during
   it. GameSim has **one active tactic** — there is no simultaneous "offence system + defence system".

**P2 — engineering**
10. `js/app.js` is 12,832 lines; all setup and live UI logic lives in it. `style.css` 3,737 lines.
11. Clearing focus play bypasses the API (`state.sim.focusPlay = null`, also in `tacticalTakeover.setFocus`).
12. Hard-coded Chinese in setup HTML and `renderScoutBoard`/`scoutMatchHtml` (EN shows Chinese).

## 6. Obsolete or duplicated implementations

| Concept | Implementations today | Keep |
|---|---|---|
| Philosophy sliders | `#phil-*` (setup) + `#live-phil-*` (live) | one component, two contexts |
| Tactic choice | checkbox catalogue (setup) + `#tactic-select` (live) + autopilot picks | one system picker on `selectableSystems()` |
| Tempo / focus play | setup select + dead-ball selects + takeover buttons | takeover adapter only |
| Ball handler | setup select + live select + `setOffenseFocus` from orders | one |
| Matchup board | shared `renderMatchupBoard` + two wrappers + separate `#gp-*` / `#defend-*` focus controls | one board, scheme on the board |
| Minutes / roles | `renderSetupRoles` (Gold) vs `rotationBoard.js` (season, My Team) | `rotationBoard.js` |
| Opponent intel | `renderScoutBoard` (Gold) vs `opponentScouting`/`matchupPlanView` (season) | `opponentScouting` |
| Player cards | setup mini-card, sub-card, lineup row, `playerCard.js` v2 (gacha/collection) | `playerCard.js` + 2 new densities |
| 3D court | `court3d.js` used only for clutch replay | untouched (out of scope) |

## 7. Reuse plan (no new tactical effects)

| Need | Reuse | Adapter needed |
|---|---|---|
| System picker + honest "sim / advice" tags | `coachTacticalProfile.selectableSystems`, `systemProficiency`; tag style from `teamIntelligenceView.js` | Gold reads `career.team.coach`, not the account coach |
| Fit number | `coachSystemFit` (= `lineupFit`, which GameSim reads) | none |
| Recommended lineups / role fit | `lineupRecommendations.recommendLineups`, `playerRoleFit` | label as *advice* |
| Opponent weaknesses | `opponentScouting.scoutOpponent` | none (pure) |
| Board layout | `myTeamCourtView.js` + `courtSlots.js` | clickable slots |
| Rotation / minutes rows | `rotationBoard.js` builders | none |
| Card faces | `playerCard.js` | add compact + tactical density |
| Live adjustments | existing GameSim APIs (table §3) + `tacticalTakeover.js` | none |
| Layout shell | `screenShell.js`, `tokens.css` | — |
| Default/override resolution | `resolveEffectiveGameplan` for season (unchanged) | Gold: small "team default" read/write helper, no second store |

## 8. Proposed screen structure

**A. Pre-game "Game Plan" (replaces `#screen-setup` body for every mode that uses it)**
- Header strip: opponent, round, `Fit 63 (sim)`, Start button always visible (sticky).
- Left, primary: **Tactics board** — half court, five clickable slots with *tactical* cards (photo, pos,
  OVR, 3 role-relevant numbers, skill icons). Click slot → contextual drawer: position, role/minutes,
  ball-handler toggle, player orders, swap with bench.
- Right: **System card** (active system from `selectableSystems`, native/roster/open badge, proficiency) +
  **Opponent card** (2–3 threats from `scoutOpponent`, suggested counter tagged *advice*).
- Below: compact bench strip (drag to slot, unchanged rules); skill shop moves to a "Skills" tab/drawer.
- "Advanced" drawer: philosophy sliders, switch pool, packs, full matchup board, all orders.
- Footer: **Apply / Reset** for the draft plan; tip-off applies it. Every control labelled *Sim effect*
  or *Analysis only*.

**B. Live game**
- Court first (≥55 % of the viewport on desktop; full width on mobile), scoreboard above, compact
  on-court strips (name, pts, fouls, fatigue) beside/below.
- Running: only Timeout, Shout, Speed, Takeover chip (focus/tempo), autopilot toggles in a single row.
- Play-by-play + box score: secondary tabs.
- Name tags: surname/short label for offence only, defenders as rings; simple overlap avoidance in the
  DOM renderer (no GameSim, no 3D change).

**C. Pause — Coach Command Panel** (sheet over the court on mobile, right drawer on desktop)
Tabs: *Lineup* (subs, packs, positions) · *Tactics* (system, tempo, focus, philosophy) · *Defence*
(matchup board + schemes) · *Rotation* (minutes). Resume is the primary action.

## 9. Delivery slices and file ownership (proposed)

| Slice | Content | Files (owner) |
|---|---|---|
| 0 | P0 fix: live overrides stop leaking (`wrapTeam` clones `gameplan`), Gold setup edits go to a draft committed on Apply/tip-off; unit tests | `js/engine/sim.js` (1 line), new `js/ui/gameplan/setupDraft.js`, tests (Code Puppy) |
| 1 | Pre-game tactics board + system card + opponent card + advanced drawer | new `js/ui/gameplan/*.js`, `css/gameplan.css`, `#screen-setup` markup in `index.html`; app.js only wiring (Code Puppy) |
| 2 | Compact / tactical / full card densities | `js/ui/playerCard.js` extension (Lychee, after slice 1 API is fixed) |
| 3 | Live layout, court focus, label avoidance, Coach Command Panel | `#screen-game` markup, new `js/ui/live/*.js`, `css/liveGame.css`, `js/engine/court.js` token labels (Code Puppy); event-card slot coordinated with Wibey |
| QA | Browser, regression, old saves | Muse |

Moving setup/live render code out of `app.js` into `js/ui/gameplan/` and `js/ui/live/` is part of the work.

## 10. Questions that need a decision before implementation

1. **`cls-tend` uncommitted player-tendencies work**: it overlaps slice 1 and touches `sim.js`. Who owns
   it, and is it landing, parked or dropped? Building the new per-player drawer on top of it vs. without it
   is a real fork.
2. **Scope of the new setup**: the screen is shared by Quick, Sandbox, Season "亲自指挥", Ranked and
   Gold. Recommendation: build it once for all of them (season keeps `resolveEffectiveGameplan`), with
   Gold as the first acceptance target.
3. **Slice 0 first?** Recommendation: yes, it is small, it fixes a real save-state bug, and slice 1's
   Apply/Reset depends on it.
4. **"Offensive and defensive systems"**: GameSim has one active tactic. Proposed honest mapping:
   *System* = the one active tactic (any group); *Defence* = pressure slider + matchup schemes. No
   second simultaneous system unless the user wants an engine change (not recommended in this phase).

---

# Addendum A — reconciliation with the "Tactical Command Center v3.0" spec

The spec asks Phase 0 to confirm its assumptions against code. Everything below was read at `65b46f8`.

## A1. Spec assumption vs. what the code does

| Spec assumption | Reality (file:line) | Consequence for the build |
|---|---|---|
| Player owns several **coach cards** and switches between them | **No.** Gold's coach is `career.team.coach`. It is hired from the market's `coachShop` with *career gold* (`hireCoach` flow, app.js:4295-4326; cards app.js:5983). `ownedCoaches(acc)` / `resolveCoach(acc.coachId)` belong to the account coach page (app.js:2927-2979) and My Team, not Gold. | `CoachSelector` in Gold = the current coach as a card (system list, proficiency) + the existing market hire flow. **No free switching**, no pretending ownership. A coach bench for Gold would be a new feature and needs a decision. |
| An **offensive system** and a **defensive system**, both selectable | GameSim has **one active tactic**: first of `coach.specialTactics` at tip-off (`coachTactics()`), the rest are the in-game switch pool (`setTactic`, sim.js:2310). Defence is `defensePlan = {scheme: focus\|double\|bump, targetId, defenderId, assignments}` (`setDefenseScheme`, sim.js:1391; reads at sim.js:3782) plus `coach.buffs` (defence slider). There is no zone/man "defensive system". | Honest mapping that keeps the spec's draft shape: `offensiveSchemeId` = the active tactic; `defensiveSchemeId` = `defensePlan.scheme` (+ target/defender/assignments). Nothing else is labelled a system. |
| Precedence **Live Override > Opponent Plan > Team Default** | Gold has only one mutable team object. No Matchup Plan exists in Gold (`resolveEffectiveGameplan` only runs under `state.season`, app.js:6263). And Live Override **already overwrites Team Default** (P0 #1: `wrapTeam` shares `gameplan` by reference). | Slice 0 must land first: it is the precondition for the rule the spec states. |
| `scope: "team-default" \| "opponent"` | Opponent plans are season/account-bound (`matchupController`, `state.season`). | Gold slice 1 = **Team Default + "this match" draft**. Persisted per-opponent plans for Gold are deferred (new store = new feature). |
| Live overrides survive a mid-game reload | **Yes, inside the sim:** Gold's save carries `sim: state.sim.exportState()` (app.js:1320); `exportState` includes `defensePlan` incl. assignments, `focusPlay`, `offenseFocusId` (sim.js:226-251). But they are *also* leaked into `career.team` today (the bug). | After Slice 0 they live only in the sim snapshot, which matches spec §7.2 (no leak into the next game). |
| Apply must be atomic | Gold persists via `autosaveCareer()` → `saveProgress` → one whole-career write (app.js:738, 1269). Setup edits currently mutate `career.team` first. | Apply = validate on a clone → swap → one autosave; on save failure restore the previous team fields and report. |
| "Edit one supported player role" | `roleExpectation` has **no direct dice** (only `isBlueCollarRebounder`, skills.js:3254). Real levers: `offenseFocusId` (ball handler), `orders.action/usage/attack/hunt/defFocus`, `targetMinutes`. | Slice 1's role edit = **ball handler + ball action** (both read by GameSim). Minutes belong to the Rotation tab (later slice). |
| Show "Simulation Active" vs "Analysis Only" | Sim reads are listed per control in §3; `coachSystemFit` is `lineupFit`, which GameSim reads; `lineupRecommendations`, `playerRoleFit`, `scoutOpponent` are advice only. | Tag every row from that table; no win-probability numbers. |

## A2. Adjusted slice 0 / slice 1 (what is built first, and where)

Module names follow the spec (`js/ui/tactics/`), reusing instead of duplicating: `courtSlots.js` / `myTeamCourtView.js` (court slots),
`coachTacticalProfile.js` / `coachSystemFit.js` (systems, fit), `opponentScouting.js` (opponent card), `playerCard.js` (card face).

- **Slice 0 (pure, no UI):** `wrapTeam` clones `gameplan` (1 line in `sim.js`); `js/ui/tactics/tacticalDraft.js`
  (create / reduce / dirty / validate / `applyDraft` onto a clone) + `tests/tacticalDraft.test.js` incl. a real-GameSim
  leak regression.
- **Slice 1 (Gold only, behind the existing setup screen):** coach card (read-only) + system picker, court with five
  clickable slots, role drawer (ball handler + action), analysis rows tagged *Sim effect* / *Analysis only*, sticky
  Apply / Reset. Other modes keep the old setup untouched until the user approves widening it.
- Files touched in `app.js`: wiring only (mount, apply hook).

## A3. Decisions still open
1. `cls-tend` (uncommitted per-player tendencies): its diff touches `sim.js` (17 lines) and `gameplan.js` (16). Slice 0 changes
   one line of `wrapTeam`; expect a trivial rebase conflict if that work lands. The slice does not touch `p.orders` editing.
2. A Gold **coach bench** (switching between hired coaches) is not in the product today. Needed, or is "current coach + market" enough for the spec's CoachSelector?
3. Persisted **per-opponent plans in Gold**: deferred; confirm.
