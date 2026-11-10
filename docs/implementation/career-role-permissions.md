# Career Role Permissions (ADR-006 R4)

Workstream B of the integration sprint (P1). Builds on ADR-006 and the pure
permission contract in `js/career/careerIdentity.js` (`permissionsFor(role)` /
`identityOf(root)`): the four Career cards now actually play differently.
Coach controls tactics, rotations and training. GM controls trades, drafts,
contracts and roster construction. GM+Coach keeps existing full control.
Player Career keeps its player-specific progression (Reborn files untouched —
workstream A owns them).

## Guard architecture

One module owns the allow/deny decision: `js/career/careerGuards.js`.

- `careerRole(career, root)` — the stamped `career.role` wins when valid;
  otherwise `identityOf(root)`. A career with neither reads as `GM_COACH`,
  so old saves keep full control with **no migration and no save rewrite**.
- `canDo(career, capability, root)` — read-only, for UI gating only. Never
  a substitute for the operation check.
- `requireCapability(career, capability, root)` — throws
  `CareerPermissionError` (`code: "ROLE_NOT_PERMITTED"`, fields role /
  capability, zh message) at the operation entry point; returns the resolved
  role when allowed. Guards sit where the operation lives (mode-layer
  entry points), not on buttons — hiding a button is not permission control.
- `denyMessage(role, capability, lang)` — zh/en refusal strings for all 15
  capabilities, each naming what the role CAN do instead of just saying no.
- `OVERRIDE_CAPABILITIES` + `capabilityForOverrideCategory()` — maps the
  coaching-override categories to capabilities (rotation/lineup →
  `setRotation`, tactics/gameplan → `commandGame`, training →
  `setTrainingFocus`). Unmapped categories stay ungated; a new coaching
  category must add a mapping here.

Unknown role → empty capability set (fail closed). `permissionsFor()`
returns a fresh Set every call.

## Permission matrix (pinned by `tests/careerPermissions.test.js`)

| Capability | PLAYER | COACH | GM | GM_COACH |
|---|---|---|---|---|
| takeover (control personal key moments) | ✓ | – | – | ✓ |
| personalTraining | ✓ | – | – | – |
| commandGame (tactics / in-game command) | – | ✓ | – | ✓ |
| setRotation (lineup / rotation) | – | ✓ | – | ✓ |
| teamTraining | – | ✓ | – | ✓ |
| setTrainingFocus | – | ✓ | – | ✓ |
| suggestTrade | – | ✓ | – | ✓ |
| suggestDraft | – | ✓ | – | ✓ |
| trade | – | – | ✓ | ✓ |
| signFreeAgent | – | – | ✓ | ✓ |
| release | – | – | ✓ | ✓ |
| draft | – | – | ✓ | ✓ |
| allocateDevelopment | – | – | ✓ | ✓ |
| watchGame | ✓ | ✓ | ✓ | ✓ |
| signOwnContract (own employment contract) | ✓ | ✓ | ✓ | ✓ |

Notes on the user's target table: GM+Coach has no `personalTraining` /
`takeover` — those are the Player career's, not the manager's. The GM's
"manages resources" for player development is the `load` knob (below);
there is no separate GM budget-setting operation in code yet (see
Follow-ups). Contract negotiation splits by who the contract is for:
every role signs its own employment contract (`signOwnContract`, held by
all); team business (trades/signings/releases) is GM-only.

## Role → operation map

| Operation | Where the guard lives | Requires |
|---|---|---|
| `createLeagueCareer({ role })` | `js/modes/leagueCareer.js` | role validated, default `GM_COACH` |
| `makeCareerDraftPick` / `forfeitCareerDraftPick` | `js/modes/leagueCareer.js` | `draft` (checked before draft-state checks, so the refusal is the permission error, not a state error) |
| `beginCareerDraft` | `js/modes/leagueCareer.js` | `draft` OR `suggestDraft` — a coach can enter the draft to suggest |
| `suggestCareerDraftPick(career, prospectId?)` | `js/modes/leagueCareer.js` | `suggestDraft`; records `{prospectId, pick, year}` in the additive optional `management.draftSuggestions` list; the front office executes the slot via `frontOfficePick` (engine helper in `js/engine/leagueDraft.js`: the coach's suggestion when still on the board, else the same cpuScore-best the engine already uses for CPU slots — no new dice). `prospectId` null = "no suggestion, front office decides". The draft advances exactly as a manual pick would, so a coach can suggest every user slot and the offseason completes without the coach ever executing a pick. |
| `setManualOverride` / `clearManualOverride` / `applyRecommendation` | `js/modes/leagueCareer.js` | coaching categories refuse roles lacking the mapped capability |
| `setDevelopmentPlan` | `js/modes/playerDevelopment.js` | see Development field split below |
| Trade / FA sign / release buttons | `js/app.js` (`careerOperationAllowed` helper + `#btn-sm-trade`, `.sm-sign`, `.sm-cut`) | `trade` / `signFreeAgent` / `release`, only when `isManagedCareer(state.leagueCareer)` — plain seasons and My Team are never gated |
| Rotation save `#btn-rot-save` | `js/app.js` | `setRotation`, managed careers only |
| Command game `playSeasonUserGame` / `playUserPlayoffGame` | `js/app.js` | `commandGame`, managed careers only (the GM keeps the sim buttons) |
| Draft board `pickProspect` / `forfeitPick` | `js/app.js` (renderLeagueManagement handlers) | `draft` → direct pick; otherwise `suggestDraft` → `suggestCareerDraftPick` (a role with neither throws, surfaced by the existing try/catch + alert) |
| `acceptCareerContract` etc. | `js/modes/careerContract.js` | unguarded — it is the persona's own employment contract (`signOwnContract`) |

## Development field split

`setDevelopmentPlan()` in `js/modes/playerDevelopment.js`:

- Coach (has `setTrainingFocus`) sets the whole plan (focus / role / mentor /
  load).
- GM (has `allocateDevelopment`, lacks `setTrainingFocus`) may change ONLY
  the `load` on a plan that already exists — including an automatic
  recommended plan. Focus / role / mentor must match the existing plan,
  and creating a plan from scratch throws `CareerPermissionError`
  (`setTrainingFocus`).
- A role with neither capability cannot touch plans.

Rationale: `load` is the resource knob (it sizes the development budget
0/1/2 in `developmentModifier`), so the GM keeps real control over player
development without deciding how anyone trains.

## Entry points — how a career gets its role

- **The Architect (GM+Coach, workstream E)**: the Classic GM+Coach flow
  is the Architect's engine, reached only via the unlocked Architect
  card. Workstream E owns the `careerAchievements` unlock store and the
  Career entry layout (3 standard cards + locked "The Architect"
  prestige card) — this workstream builds no second unlock store and
  does not change the entry layout. The permission table's GM_COACH
  column applies to the Architect role once unlocked; the Time Travel
  engine underneath is unchanged, and the guards in this document apply
  to it exactly as before.
- **Time Travel (GM+Coach engine)**: the prologue carries
  `role` — explicit input > module-level pending role > `"GM_COACH"`.
  `setPrologueRole(role)` (exported from `js/modes/timeTravelCareer.js`,
  validated) is the seam workstream A calls before opening the creation
  screen; the screen itself never sees a role. The pending role is
  consumed on use and resets to `GM_COACH`, so a later unrelated prologue
  never inherits it. `acceptInterviewOffer` stamps the role into the root
  with `setIdentity(createRootState({...}), role)` and into the career;
  `startNewStint` carries `root.leagueCareer?.role ?? identityOf(root)`
  into the new career, and `resumeLongCareer` preserves it (the career
  object is spread through `upgradeLeagueCareerManagement`).
- **League Manager (GM path)**: the franchise setup stamps
  `createLeagueCareer({ kind: "franchise", season, role: "GM" })`
  (`js/app.js`, `#btn-season-start` handler). `career.role` is authoritative
  for managed careers, so the GM needs no separate identity stamp.
- **Coach dev entry**: `?career=coach` calls `setPrologueRole("COACH")`
  and opens Time Travel (next to the `?reborn=1` hook in `js/app.js`).
  The full interactive Coach card wiring is workstream A's follow-up via
  the same `setPrologueRole` seam. No `?career=gm` hook — the GM card
  already routes to the franchise setup.

## Old-save compatibility

No save format change and no migration. `validateRoot` /
`validateManagement` accept unknown fields; `compactRootForStorage` spreads
the root; `createRootState` spreads overrides — `root.identity`,
`career.role` and `management.draftSuggestions` all survive persistence.
A career saved before roles existed has no `role` and its root has no
`identity`, so it resolves to `GM_COACH` and plays exactly as before.

## GM+Coach is not a super-version

Broader control, but the existing pressure / trust / authority machinery
already differentiates stints (offer authority, media pressure, front-office
trust). A dedicated GM+Coach workload-pressure system was NOT built in this
slice — it is a follow-up, not a guard.

## Playable flows

- **Coach**: `?career=coach` → Time Travel creation (1995) → interview
  (or skip) → accept → season hub. Market trade / FA sign / cut are
  refused with a readable reason; rotation save, development plans and
  commanding a game work; the draft accepts suggestions and completes.
- **GM**: Career → GM card → League Manager setup → dynasty career.
  Trades / FA / cuts / draft work; rotation save and commanding a game
  are refused; sim buttons remain the GM's path.
- **GM+Coach regression**: the default Time Travel career keeps full
  control (trade, rotation, command game all work).

## Verification

- Focused: `tests/careerPermissions.test.js` pins the matrix and at least
  one end-to-end guard per role through the real mode layer (a forbidden
  operation attempted through the real entry point must fail, not just
  lose a button), plus `tests/leagueCareer.test.js`,
  `tests/playerDevelopment.test.js`, `tests/leagueDraft.test.js`,
  `tests/timeTravelCareer.test.js`.
- Browser: `scripts/qa/career-roles.mjs` (desktop 1280x800 + mobile
  390x844, zh + en) — Coach entry + refusals + rotation/command-game,
  GM setup + trade + refusals, GM+Coach regression, EN refusal strings.
  Run on a Mac (`python3 scripts/serve_nocache.py`, port 5173); this VM
  has no Chromium/Playwright and no eslint, so browser QA and lint are
  owed, not failed.

## Follow-ups (not in this slice)

- Draft-board button label for a Coach still says "pick" while the click
  suggests — label polish ("suggest") is a UI follow-up; the alert +
  the drafted player confirm the suggestion was recorded.
- A GM resource/budget-setting operation beyond training `load` does not
  exist in code yet — if the user wants the GM to set a development
  budget, that is a new operation, not a guard.
- GM+Coach workload-pressure system (see above).
- The Coach card's full interactive entry in `js/ui/careerEntry.js`
  (workstream A owns that file; the `setPrologueRole` seam is ready).
