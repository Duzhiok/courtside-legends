# Account Level & Legacy Progression

Design approved by the user 2026-11-08. MVP implementing (Luna).
Source: user's design note "Courtside Legends 2.0 — Account Level & Legacy
Progression" (2026-11-08, Courtside Legends dev chat).

## Core idea

Account Level is the cross-mode long-term growth system connecting My World,
My Team, Career and Playground. It represents the player's experience,
participation and legacy across the whole basketball universe — not just how
many games they played. It is NOT a copy of "play → XP → level → coins".

Three separate growth lines:

| System | Represents | Cross-mode? |
|---|---|---|
| Account Level | Overall experience and activity | Yes |
| My Team Progression | Collection, training, team strength | My Team only |
| Career / Reborn Growth | One character's career growth | That career only |

- A Reborn retirement ends the career level; Account Level keeps growing.
- My Team championships, Playground challenge wins, Reborn progress all feed
  Account XP.
- Account Level is permanent; it is NOT reset by starting a new save.

## Account XP (AXP) — first-version values (configurable prototype numbers)

| Player action | AXP | Limit |
|---|---|---|
| Daily first login | +10 | once per day |
| Complete a daily task | +20 | per task |
| Finish a Quick Play game | +25 | on completion |
| My Team regular-season game | +40 | per game |
| Ranked match | +50 | per game |
| Friend match | +20 | per game |
| Playground custom match | +15 | per game |
| Reborn career event | +30 | valid story events only |
| Complete a season | +200 | per valid season |
| Reach the playoffs | +150 | once per season |
| Win a championship | +500 | once per season |
| Complete a Reborn lifetime | +800 | once at the ending |
| Auto League (offline sim) | +5 | max 20 games/day (existing cap) |

Rules:

- **Losing still grants most base XP.** Account growth rewards participation
  and exploration, not only winning.
- No XP for entering a screen, entering/exiting a match, or replaying the
  same story event. XP is awarded only on actual completion / settlement.
- Season / playoff / championship rewards are paid only at settlement.

## Level curve — fast early, slower late

Levels 1–100. Do NOT force a reset after 100 (Legacy Rank is v2, see below).

```
XP_next(L) = 100 + 25L + 5L^2   (XP needed to go from L to L+1)
```

Check: L=12 → 1,120 XP; L=99 → 51,580 XP. The curve gets very steep late,
so keep it as an adjustable config. Early priority: a player should reach
Lv.2–3 in their first session (tune the config if the formula as written
does not achieve that — first session is roughly login + a few Quick Play
games, ~35 XP for login + one game vs 130 XP for Lv.2).

`totalXp` is the single source of truth; `level` is derived from it (never
stored separately, so the two cannot disagree). Reward claims are recorded
independently (`claimedLevelRewards`) so a refresh cannot re-grant them.

## Rewards — four kinds

### 1. Practical: gold, packs, cosmetics

| Level | Unlock / reward |
|---|---|
| Lv.2 | First level-up reward: gold |
| Lv.5 | Starter card pack |
| Lv.10 | Exclusive avatar frame |
| Lv.15 | Team theme background |
| Lv.20 | Premium outfit set |
| Lv.25 | Special jersey |
| Lv.30 | Exclusive celebration |
| Lv.40 | My Home furniture set |
| Lv.50 | Legendary avatar frame + commemorative pack |
| Lv.75 | Rare personal showcase animation |
| Lv.100 | Permanent legendary identity title |

Do NOT reward a specific overpowered star card — that would push players to
grind levels and break the draw / roster-building economy. Packs are fine.

v1 note: cosmetic rewards (frame, background, outfit, jersey, celebration,
furniture, showcase) are recorded as unlocked entitlements on the account;
apply them visually only where a hook already exists. Do NOT build new
cosmetic / furniture systems in v1 — that is v2.

### 2. Identity: make the account more unique over time

- Avatar frames, profile backgrounds, hometown flags / city badges, team
  entrance animations, My Home trophy shelves, personal titles, special
  jerseys and outfits. Connects to the existing 3D Avatar system.
- My World profile shows level, title and progress (concept: "Your
  Basketball Legacy", Level 35 "All-Star Collector", hometown legend /
  collector / season champion tags, account XP bar).

### 3. Gameplay unlocks — open new experiences gradually, never lock the core

| Level | Suggested unlock |
|---|---|
| Lv.1 | Quick Play, Reborn, My Team basics |
| Lv.3 | Daily Hub full tasks |
| Lv.5 | My Team Season theme challenges |
| Lv.10 | Custom team themes |
| Lv.15 | Hometown legend challenges |
| Lv.20 | Special cross-era events |
| Lv.30 | My Home advanced showcase |

Reborn, Clutch Challenge, Playground and basic draws stay open early. A new
player must feel the fun fast — do not require Lv.20 before the interesting
stuff.

### 4. Long-term honor: Account Prestige (v2, NOT v1)

After Lv.100, do not keep adding levels. A separate Legacy Rank is decided
by real achievements (completed Reborn lifetimes, My Team championships,
history challenges, legendary medals across careers, cross-era achievements),
not by grinding games. Account Level = accumulated experience; Legacy Rank =
real achievement.

## Anti-grind principles

1. Diverse XP sources — no one is forced to play ranked daily. Reborn-only,
   My Team-only and Playground-only players all progress.
2. Reward real progress, not repeated clicks — "finish a game" pays,
   "enter a game" does not; championship rewards pay at settlement only.
3. Level never adds match attributes — a Lv.80 player's Curry must not shoot
   better than a Lv.10 player's. Ranked fairness is preserved.

## Data shape (v1 — no new database, no new backend)

```js
const accountProgress = {
  accountId: "account-123",
  level: 12,               // derived from totalXp, not stored as truth
  totalXp: 8500,
  claimedLevelRewards: [2, 5, 10],
  achievements: ["first_win", "first_championship"]
};
```

- Persisted as part of the account (local accounts: localStorage; guest
  progression persists locally too).
- Account switching isolates progression; a career reset does not reset
  Account Level.
- If a private GitHub repo snapshot sync is added later, this object rides
  along as part of the account snapshot — no separate level microservice.

## Dev order

v1 (this task) — a playable Account Level system:

- Account XP + level calculation.
- My World level badge, XP bar, title.
- XP wiring for Quick Play, My Team, Career, Playground.
- Level-up celebration modal + simple rewards.
- Level reward track page.
- Account-scoped persistence + duplicate XP / duplicate reward protection.

v2 (later):

- Level avatar frames and outfits.
- My Home furniture unlocks.
- Hometown honors.
- Special events.
- Lv.100 legendary identity + Legacy Rank.

No Battle Pass, no complex mission system in v1.

## Agent brief (MVP delivery contract)

- Implement the full MVP, not just a design document.
- Account Level is shared across My World, My Team, Career, Playground.
- XP is earned from completed gameplay activities, not from entering screens.
- Account Level is permanent and independent of individual career saves.
- Losing a game still awards participation XP.
- Account Level must not directly increase GameSim attributes or ranked
  advantages. Do not modify GameSim scoring, probability or player attributes.
- Preserve existing player growth, My Team card progression, Reborn career
  progression. Do not create a new backend or migrate save schemas.
- MVP: AXP + level calc (1–100), XP for Quick Play / My Team Season /
  ranked / Career events / Playground, My World badge + progress bar,
  level-up celebration, reward track (currency, card-pack, cosmetic
  entitlements), account-scoped persistence, guest support, duplicate XP
  and reward protection.
- Validation: XP only on actual completion; losses still grant XP; account
  switching isolates progression; refresh does not duplicate XP; career
  reset does not reset level; rewards cannot be claimed twice; guest
  progression persists locally; existing My Team and ranked functionality
  intact. Run focused tests + desktop/mobile smoke QA.
- Delivery: report the working player flow, XP table, reward track, changed
  files, tests and commit SHA. Do not start unrelated features.

## Three connected growth lines (final shape)

Account Level (participation & experience) → My Team Strength (collection &
training) → Legacy Rank (legendary achievement). Every play style accumulates
a basketball identity with visible rewards.

Play Basketball. Build Your Team. Live Your Legacy.

## Implementation status (2026-11-08, v1 shipped)

- Module: `js/data/accountLevel.js` (`XP_TABLE`, `xpForLevel`, `levelForTotalXp`,
  `TITLE_TABLE`, `REWARD_TRACK`, `awardXp`/`awardAccountXp`, `recordDailyLogin`,
  `recordDailyTaskXp`, `claimLevelReward`, `levelSnapshot`, `madePlayoffs`).
  Guest record: `cls_guest_axp` (key lives in `js/data/accountKeys.js`).
  Friend-match helper: `js/data/accountLevelOnline.js` (light imports only —
  the online client must not pull in the account/card layer).
- Pack rewards: `grantPackDraws` in `js/data/accountGacha.js` (player cards
  only, normal rates, binder-full throws so the claim is not consumed).
- XP wired at settlement only (app.js): ranked +50, Quick Play +25 /
  Playground +15 (showResult fallthrough), My Team Season game +40,
  season +200 / playoff +150 / championship +500, Reborn story event +30,
  completed lifetime +800, daily login +10, daily tasks +20 each.
  Level-up celebration modal fires from game-result handlers only.
- My World: level badge + XP bar + title + collapsible reward track
  (`levelHtml` in `js/ui/myWorldView.js`, actions in `js/ui/myWorldScreen.js`,
  styles in `css/myWorld.css`). Cosmetics are recorded entitlements in v1;
  no frame/theme/furniture hook exists yet, so nothing is applied visually.
- Tests: `tests/accountLevel.test.js` (17). QA: `scripts/qa/my-world.mjs`
  gained level-card checks (Mac run still owed — no Chromium on the VM).
- Deliberately unwired: Auto League (+5/game, cap 20/day — the feature does
  not exist in code); classic-season completion / playoff / championship;
  gold-ladder (Career) per-game XP and its championship; local duels;
  tournaments; custom-hub games. First-session arithmetic: login 10 + 25 per
  Quick Play game → Lv.2 (130 XP) after ~5 games; Lv.3 (300 cumulative)
  after ~12. The curve as specified does not reach Lv.3 in "a few games" —
  a tuning decision for the user, not an implementation gap.
