# Coach Cards — Consumer Audit (workstream E, Career 2.0)

Product decision #4 (2026-11-10): coach cards stay a separate
collectible system, subject to an audit of their actual gameplay
consumers. This is that audit. **Nothing was removed.** Surfaces
flagged decorative are flagged only — removal is a separate decision.

Method: grep over `js/`, `tests/`, `index.html` for `coachIds`,
`coachId`, `COACHES`, `coachShop`, `coachDrawWeight`, `resolveCoach`,
`ownedCoaches`, `canEquipCoach`, `setAccountCoach`, then read each hit.
Branch: `feature/career-relationships-legacy`, base `1ba3f4e`.

## What a coach card is

- Data: `js/data/coaches.js` — `COACHES` (real coaches, `specialTactics`,
  `preferred` archetypes, `fame`, `hiddenTier`), `TACTICS`,
  `coachTactics()`, `composeStaff()`, `ensureTeamStaff()`,
  `coachDrawWeight()`, `isLegendCoach()`, `isStarterCoach()`.
- Ownership: `account.coachIds` (array of owned coach ids) and
  `account.coachId` (the ONE active head coach). Created in
  `js/data/account.js` `createAccount()` (`coachIds: []`, `coachId: null`).

## Producer (where cards come from)

| Site | What happens |
|---|---|
| `js/data/accountGacha.js` `drawCoachCard()` (~:95-110) | ~20% of draws are coach cards (comment :151); weighted by `coachDrawWeight`; duplicate → gold refund `max(20, round(fame * 0.9))`; id appended to `account.coachIds`; history entry kind `"coach"` |
| `js/data/account.js` `rollCoachOffers(5)` (:266) | Onboarding offers: 5 coaches from the `isStarterCoach` pool. **Not a draw and not from owned cards** — the first coach is a free pick |

## Real gameplay consumers (owned cards change play)

1. **Active head-coach slot** — `js/app.js` `#collection-staff`
   (~:2866-2873): the coach `<select>` options are `ownedCoaches(acc)`
   (`js/data/account.js:274` — maps `coachIds` to COACHES rows, plus the
   current `coachId`). Change handler calls `setAccountCoach(acc, value)`.
   `account.coachId` is the active coach.
2. **Ownership gate** — `js/data/account.js` `canEquipCoach()` (:280):
   owned, or current, or a starter coach. Enforced by
   `js/myteam/lineup.js:139` (`coach_not_owned` blocks a `coachId` that
   is not owned).
3. **Game setup → sim** — `js/myteam/mySeason.js:35`:
   `resolveCoach(account.coachId) || COACHES[0]` builds the season team's
   coach. `js/app.js:7349-7357`: the default tactic comes from
   `you.coach?.specialTactics?.[0]`. `js/engine/sim.js` reads `t.coach` /
   `t.tactic` into `lineupFit()` (`js/engine/chemistry.js:87`): coach
   `preferred` archetypes +6 fit each, tactic `needs` +5 each.
   `coachTactics(coach)` (`coaches.js:1112`) maps `specialTactics` to
   TACTICS multipliers (offense / defense / pace / threeRate) via
   `composeStaff()`. This is the only path by which a drawn coach card
   changes a game's numbers.
4. **Coach learns tactics** — `js/app.js:3180-3183`: the active coach's
   `specialTactics` gains `acc.tacticId` when the account's default
   tactic is not already in the coach's book.
5. **Onboarding gate** — `js/app.js:2388`: account setup requires
   `acc.coachId` (satisfied by the free starter pick, not by a draw).
6. **Collection display** — `#collection-staff` shows the active coach,
   specialty, default tactic and owned count; `js/ui/gachaView.js:164`
   renders coach draw results.

## Same data table, NOT owned-card consumers (flagged)

- **Career market `coachShop`** (`js/app.js:4163`, `:4240-4252`,
  `hireCareerCoach` `:4256`, `:4322`, `:5508-5510`): the long-career
  market hires coaches from the COACHES pool for salary. It **never
  checks `account.coachIds`** — a player who already drew Phil Jackson
  still pays full salary to hire him in a career. Two "coach" systems
  share one data table but not ownership.
- **AI staff generation** — `js/engine/draft.js:75,86,135-136` (generated
  teams' staff), `js/engine/season.js` via `ensureTeamStaff`
  (`coaches.js:1094`), `js/engine/seasonMarket.js:207` (market offers via
  `coachDrawWeight`): COACHES data for AI teams and offers, not owned
  cards.
- **Duplicate-draw gold refund** (`accountGacha.js:103`): an economy
  sink, not gameplay.

## Decorative / thin surfaces (flagged, NOT removed)

1. **Only the active slot matters.** Of the ~20 owned coach cards a
   long-playing account holds, exactly ONE (the active `coachId`) has
   any mechanical effect, through the tactic chain in (3) above. The
   rest of the collection has no use — no assistant-coach slot, no
   coach development, no trade value. The collection UI says so
   honestly ("名帅靠抽卡"), but the cards themselves are bench depth.
2. **Career hiring ignores the collection** (see `coachShop` above).
   If coach cards are meant to be a career asset, that is the seam to
   connect — e.g. an owned coach card could waive or discount the
   career hire. That is a product decision, not taken here.
3. **Coach `note` / `record` text** in the collection display is
   presentation only; it changes no number.

## Verdict

Coach cards are a real but thin collectible: the ownership chain
(draw → own → equip active coach → tactic chain → sim fit) is fully
wired and enforced, and nothing in it is fake. The thinness is scope,
not fraud: one active slot, no second use for the rest of the
collection, and no connection to career-mode hiring. Keep as-is until
a product decision connects (2) or adds a second use.
