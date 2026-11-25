# B47 — Hosted league: one-page design + economy measurement

Status: **design only, nothing implemented.** Source decisions: ADR-008 §4 (Q3, taper table modified by the product owner 2026-11-06).
Reproduce the numbers: `node scripts/measure/b47-hosted-gold.mjs` (pure arithmetic over the real constants, no GameSim).

## What is already decided (ADR-008)
- 20 hosted games/day (prototype ceiling); weekly cap of 25 rewarded games.
- Taper covers gold **and** growth XP: games 1–5 = 100%, 6–10 = 50%, 11–20 = gold 0% / XP 25%. Stories and match records are always complete.
- Results are fixed-seed (`hash(account, date, game index)`), settled when the player returns; reload cannot reroll.
- Never touches ranked, online bonuses, trades, signings, pulls or anything irreversible. Local clock is acceptable (single-player only).

## Measurement: how much gold, next to what the Training Center burns
Hosted games priced like ranked (win 40 / loss 12, `js/data/account.js`), taper applied:

| win rate | gold / game | hosted day |
|---|---|---|
| 30% | 20.4 | ¤153 |
| 50% | 26.0 | ¤195 |
| 70% | 31.6 | ¤237 |

Training Center sink with the 2 slots we ship (`js/data/trainingRules.js`): ¤267–480 per day depending on duration; two full-day camps = ¤300/day.

- A hosted 50%-win day pays **65% of two full-day camps**. Hosted play alone cannot keep both slots busy; the player still has to play or recycle cards. That is the intended pressure, not a bug.
- Taper XP is **50% of a full-XP day** (10 of 20 units), so XP is not the cheap path either.

## Findings that change the design
1. **The two caps collide.** 10 games/day pay gold, but the weekly cap is 25 rewarded games, so gold stops after ~2.5 days. Effective weekly gold is at most 25 × ranked pay ≈ **¤650 at 50% win** (before taper), i.e. ~¤93/day on average. The ADR table reads like ¤195/day. Decide which cap wins (recommendation: the weekly cap, and show it in the UI).
2. **Hosted XP must not be a second growth route.** My Team growth now lives in the Training Center and is bounded by `TIER_BUDGETS` (per-attribute, total, skills). Hosted "growth XP" should feed that same per-attribute XP bank (`cardMods[id].training.xp`) and the same budget caps, never add attributes directly. Otherwise the tier cap can be bypassed.
3. **Gold must not be a back door to competitive power.** Training spends gold for power; hosted league earns gold offline. Net: offline play converts to strength. Keep it bounded by (1) and by the tier budget, and keep hosted gold off Gold Challenge / ranked.
4. **Hosted result strength is unmeasured.** The table assumes a win rate. The real rate for an auto-managed lineup versus league AI needs a GameSim batch (fixed seeds, several eras) before any number is final.

## Proposed implementation slices (when approved)
1. `hostedLeague.js` — pure settle function `(account, now, plan) -> { games[], gold, xp, report }`, injectable clock and save, same pattern as `trainingCamp.js`. One test file with the same guards: idempotent, fixed seed, caps, taper.
2. Return report UI — story first (key game, who grew, surprise), numbers second.
3. Plan editor — lineup + training focus snapshot taken at logout.

## Open questions for the product owner
- Q-B47-1: which cap wins, daily taper or weekly 25? (Finding 1.)
- Q-B47-2: should hosted XP feed the Training Center bank (recommended) or be dropped entirely in v1 and keep hosted pay gold-only? (Finding 2.)
- Q-B47-3: price a hosted game like ranked, or lower (e.g. 50%)? Needs the win-rate batch first.
