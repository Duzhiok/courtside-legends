# Player Signature Awakening — design + evidence audit

Status: implementation in progress (workstream D, branch `feature/player-signature-awakening`).
User principle (2026-11-10, APPROVED): **no skill books** — a player's skills come
from talent, real game performance, training and key events, never from drawing
a book or buying a boost. Awakening replaces the skill-book / epiphany
acquisition path for Player careers.

## 1. Evidence audit — what the engine actually records

Read, not assumed. Sources: `js/engine/sim.js` (emit + stats), `js/engine/domainEvents.js`,
`js/reborn/season.js` (`playGame` report), `js/engine/epiphany.js`,
`js/career/seasonEpiphany.js`, `js/data/skills.js`.

| Evidence the five skills need | Exists? | Where |
| --- | --- | --- |
| Stepback attempts / makes | **NO** | The engine has no shot-type field at all. Raw emits are `coach / dunk / miss / reb / score` at possession granularity; per-player stats are totals only (`fga/fgm/tpm/tpa/pts`). `stepback` exists as a skill *pack* (`skills.js:833`) but no game action ever produces stepback evidence. |
| High-difficulty shots under defensive pressure | **NO** | No defender-distance / contest field anywhere. `clutchLog` records only `zone: "three" \| "two"`. |
| Rim protection (blocks) | **YES, as totals** | `line.blk` per game. A block *is* the rim-protection action — this is direct action evidence, not an unrelated total. |
| Rebounding contributions | **YES, as totals** | `line.reb` per game. A rebound *is* the rebounding action. |
| High-quality assists + low turnovers | **YES, as totals** | `line.ast` + `line.tov` per game. Quality is gated by an ast/tov ratio, not by a raw assist count. |
| Clutch makes | **YES, structured** | `report.takeover`: `{ option, attempted, made, points, zone, reason }` — a real takeover decision in the Q4/OT last-2:00, margin ≤ 5 window, from `sim.clutchLog`. |
| Pass actions (handoff / kick) | exists, unused by Reborn | `meta.pass { passerId, receiverId, kind }` is emitted by sim.js but Reborn drives games with `onEvent: () => {}` — discarded. Not needed for v1. |

**Verdict: ship 4 of the 5 skills. Stepback is NOT shippable** — it has no evidence
and must not be inferred from points (a 40-point game is not a stepback).
Enabling it needs a sim.js change (record shot types / stepback attempts),
which this workstream is forbidden to make; the module lists it under
`MISSING_EVIDENCE` with exactly what is needed, and the UI shows it as
"暂无比赛证据" rather than faking progress.

**What counts as evidence (the line the user drew):** the *action's own* stat is
evidence (blocks → rim protection, rebounds → rebounding, assists → playmaking,
clutch makes → clutch). An *unrelated* total is not (points → stepback is
forbidden; the module never reads `pts` / `fgm` for any rule).

## 2. The old system being replaced — seasonEpiphany (flagged, NOT rewritten here)

`js/engine/epiphany.js` + `js/career/seasonEpiphany.js` grant skills today, live in
two places:

- `js/app.js:11106` — classic long career: `awardEpiphany({ ledger: career.management?.epiphany, players, lines: report.lines })`.
- `js/data/accountProgress.js:72` — collection / ranked play: `recordGameAndCheck(account.cardMods[card.id], card, card.stats, rng)`.

How it works: `formLine` keeps only box-score totals; 3 consecutive games with
one stat over a threshold (`ast ≥ 9`, `tpm ≥ 4`, `pts ≥ 25`, `twoPm ≥ 8`,
`reb ≥ 12`, `blk ≥ 3`, `stl ≥ 3`, all with `min ≥ 18`) earns a **50% random roll**
(`EPIPHANY_CHANCE = 0.5`) for a **random** skill from the rule's family
(`options[Math.floor(rng() * options.length)]`). That is exactly what the user
rejected: score-only thresholds, a dice roll, and a random skill pick.
`stepback` and `clutch_killer` are not even in any epiphany rule list, so the
old system could never grant them.

**Proposal (for the user / S0 to confirm — not done in this workstream):**
replace both call sites with an awakening check over the same inputs
(`lines` + live `players` cards): the classic career's settle site already has
both, so the conversion is mechanical — `settleEpiphany` → `recordGame` per
player per game, `awardEpiphany` → grant the fired skill via the same
`grantSkillToPlayer` path. What blocks doing it silently: it changes behaviour
of the live classic career and ranked play (a random faucet becomes a
deterministic evidence gate), and `tests/seasonEpiphany.test.js` +
`tests/epiphany.test.js` pin the roll behaviour — they would need rewriting.
The Reborn slice gets awakening from day one; the classic path keeps epiphany
until that conversion is approved.

## 3. Awakening rules (v1 — 4 skills)

One skill per rule, fixed (no random pick). No dice anywhere: same evidence in,
same awakening out.

| Skill | Ability gate (base ability + tendency) | Qualifying game (min ≥ 8) | Representative key performance |
| --- | --- | --- | --- |
| `rim_protector` 禁区守护者 | `canRetainSkill(card, id)` — the engine's own gate (block ≥ 68, speed ≥ 46, athlete ≥ 54, age ≤ 37); a skill the card cannot retain is never granted | blk / 36 min ≥ 2.0 | one game with blk ≥ 4 |
| `glass_cleaner` 篮板怪兽 | `card.rebound ≥ 60` | reb / 36 min ≥ 10 | one game with reb ≥ 14 |
| `dime_dropper` 组织大师 | `card.pass ≥ 60` | ast / 36 min ≥ 6 **and** tov ≤ ast / 2 | one game with ast ≥ 10 and tov ≤ 2 |
| `clutch_killer` 关键先生 | `card.clutch ≥ 55` | a clutch takeover **make** | a **game-winning** clutch make: made, team won, final margin ≤ the shot's points |

- **Window:** last 5 *played* games (min ≥ 8; DNP / garbage-time cameos add no
  evidence and break nothing). Need **≥ 3 qualifying + 1 key performance in
  the window**. Clutch is the exception: takeover chances are rare (≤ 1/game,
  only in close late games), so it uses the **season** window — 3 clutch makes
  in the season + 1 game-winner.
- **Cap:** at most **2 awakened skills per player per season**; each skill once,
  ever. A rule that completes while the cap is full (or the card fails a grant
  check) waits in `ready` and fires at the next recorded game once a slot frees.
- **Grant checks at fire time:** `isLearnableSkill`, `canRetainSkill(card)`,
  `!skillSlotsFull(card)` (MAX 7 non-duo), not already on the card. A skill
  that fails a check stays ready and is retried next game.
- **Effect boundary:** awakening grants the existing skill pack; the effect is
  whatever that pack already does in the engine (bounded procs / bonuses, e.g.
  `dime_dropper` assist triggers, `rim_protector` block/contest). Awakening
  never adds a hit-rate bonus of its own and never stacks the same skill twice.

## 4. State (additive, namespaced)

`reborn.player.awakening` (optional; `validateReborn` passes it through —
`player` only has to be an object, and the view persists `root.reborn`
wholesale):

```js
{
  version: 1,
  season: 1997,          // form belongs to this season; a new season resets form
  form: [ { game, min, blk, reb, ast, tov, clutchMade, clutchGameWinner } ], // last 5 played games
  clutchMakes: 0,        // season cumulative clutch makes
  clutchGameWinner: null,// game number of the season's game-winning clutch make
  awakened: [ { skillId, source: "awakened", game, season, evidence: { qualifying, keyGame } } ],
  ready: [skillId],      // completed, waiting for a slot / grant check
}
```

**Source record:** awakened skills carry `source: "awakened"` in the ledger and in
the career-timeline event (`{ event: "awakening", skillId, source: "awakened", game, evidence }`).
Innate skills are whatever the card starts with (from its roster row / generated
prospect); the UI derives the split on the fly — `card.skills − awakened − purchased`
is innate, so no snapshot is stored and the two can never drift apart.

## 5. Hook points (all additive, one line each unless noted)

- `js/reborn/identity.js` — `buildPlayerCard(..., { extraSkills = [] })`: merges
  extra skills into `card.skills` under the same gates epiphany uses
  (`isLearnableSkill` + `canRetainSkill` + slots). New param only.
- `js/reborn/season.js` — `playGame` passes
  `extraSkills: awakenedSkillIds(reborn.player.awakening)` when building the
  player's card, so an awakened skill is live in the sim from the next game.
- `js/reborn/contract.js` — `nextSeasonCard` passes the same, so awakening
  survives the season rollover (the next season's card is a new roster row).
- `js/reborn/fastForward.js` — `onGame(out.report)` → `onGame(out.report, current)`:
  the view's fast-forward callback needs the intermediate reborn to record
  evidence live with the right card. Backward compatible (2nd arg).
- `js/ui/reborn/rebornView.js` — after each `playGame` (manual + fast-forward),
  `recordGame(awakening, { evidence: evidenceFromReport(report), card })`;
  newly fired skills push a timeline event and a banner; `render()` mounts the
  awakening progress panel and passes `extraSkills` to `buildPlayerCard`;
  `careerTimelineHtml` gains an `awakening` branch.
- `js/app.js` — `?awakening=1` dev entry (marked): opens the Reborn slice,
  same as `?reborn=1`.

No sim.js change. No new dice. No purchase path anywhere (S0 removes the shops;
this module never touches gold/fragments).

## 6. Playable slice

"Player: unknown-rookie comeback" = the Reborn flow with awakening live:
low-trust bench player (bench ≈ 10 min/game — the 8-minute evidence floor is
reachable from the bench, garbage time is not) → weekly training → key games →
awakening progress visible on the season screen (per-rule `n/3` + key-game tick)
→ the awakening banner when it fires → contract settlement. The skill is on
the card from the next game (sim + display) and in the career timeline.

## 7. Tests + QA

- `tests/signatureAwakening.test.js` — pure module: rules, windows, caps,
  determinism (same input twice → same output), DNP handling, season reset,
  grant checks, `pts` never awakening anything, stepback unmeasurable.
- `tests/rebornAwakening.test.js` — integration on the real harness
  (`createRebornState` + 2-game schedule): evidence extraction from real
  `playGame` reports, `extraSkills` threading through `buildPlayerCard` /
  `playGame` / `nextSeasonCard`, timeline event shape.
- `scripts/qa/player-awakening.mjs` — Mac run: open `?awakening=1`, create a
  run, play/fast-forward, assert the progress panel renders and (given enough
  games) an awakening fires and lands on the card + timeline.
