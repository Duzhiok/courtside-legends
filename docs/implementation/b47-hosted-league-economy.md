# B47 — Hosted league: one-page design + economy measurement

Status: **design only, nothing implemented.** Source decisions: ADR-008 §4 (Q3, taper table modified by the product owner 2026-11-06).
Reproduce the numbers: `node scripts/measure/b47-hosted-gold.mjs` (pure arithmetic over the real constants) and `node scripts/measure/b47-hosted-winrate.mjs 250` (real GameSim).

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
4. **Measured hosted win rate (real GameSim, fixed seeds, no coach orders, 250 games per band, about ±3 points):** `node scripts/measure/b47-hosted-winrate.mjs 250`. Squad = one starter per position + 5 bench from one card-OVR band; opponent = a random real team-season 1990–2023 (mean top-10 OVR 65.1).

   | squad card OVR | squad avg | win rate | avg margin |
   |---|---|---|---|
   | 60–69 | 62.2 | 49% | +0.2 |
   | 70–77 | 73.1 | 50% | +0.5 |
   | 78–84 | 79.6 | 72% | +12.7 |
   | 85–95 | 87.6 | 90% | +27.1 |

   So the 50% assumption holds for an ordinary collection, but a strong squad wins ~90% and a hosted day pays about ¤279 (taper applied), **93% of two full-day camps**. Strong squads would nearly self-fund training offline: strength -> gold -> training -> strength. The weekly 25-game cap (Finding 1) is what keeps this loop bounded (≈ ¤930/week at 90% win, ~¤133/day), so it must be a hard cap, not a soft one. The 70–77 band not beating the 60–69 band is noise plus random position mixes; do not read a curve into it.

## Slice 1 status: DONE (wired — B150)
`js/data/hostedLeague.js` + `tests/hostedLeague.test.js` (13 tests). It is **wired to the Training Center**: `js/ui/hostedView.js` (`createHostedPanel`) mounts the hosted-league card, and `js/app.js` `openTraining` settles owed days when the screen opens (B150) and refreshes the header gold chip afterwards (B155). It was built with the recommended defaults for the three open questions: **weekly cap is hard and wins (Q1)**, **hosted XP goes through `trainingCamp.bankXp` (Q2)**, **a hosted game pays 50% of ranked (Q3)**. Changing an answer = changing a constant (`WEEKLY_PAID_GAMES`, `PRICE_SHARE`, `HOSTED_XP_PER_GAME`, `TAPER`) or dropping the XP line. Semantics: the day you set the plan does not count; each later full day settles when you are back, 20 games, seeded by hash(account, day, game), at most 7 days of catch-up.

## Proposed implementation slices
1. ~~`hostedLeague.js`~~ done (above).
1b. ~~GameSim adapter~~ done: `js/data/hostedPlay.js` (`createHostedPlayGame`, `hostedReady`, `hostedSquad`, `hostedOpponents`) + `tests/hostedPlay.test.js` (9 tests, mutations caught — 6 original + 2 B47b in-place cache rebuild + 1 B47c five-card squad). Squad = the account's own best distinct people (training bonuses applied), position-balanced five via `bestStarters`, automatic coaching, RNG = `seededStream(seed)`; opponent = real team-season (1985+) picked by `seed % n`. Wired since B150: `hostedView.js` calls it through `settleHostedAsync` / `createHostedPlayGame` when the Training Center opens; opponents' starters are lazy getters since B152 (no longer computed for every team up front). It needs the roster pool loaded (`hostedReady` is false until then), so the wiring awaits `playersReady()` first.
2. ~~Return report UI~~ done (B150): story-first welcome-back card on top of the Training Center (record → key game → focus-player growth → gold/XP), plus a per-day log; settling is chunked so the page does not freeze (B151).
3. Plan editor — partly done (B150): pick a focus player + attribute, update the plan, close hosting (closing clears `settledDay`, so closed days are never back-filled). Still open: lineup snapshot taken at logout.

## Open questions for the product owner
- Q-B47-1: which cap wins, daily taper or weekly 25? (Finding 1.)
- Q-B47-2: should hosted XP feed the Training Center bank (recommended) or be dropped entirely in v1 and keep hosted pay gold-only? (Finding 2.)
- Q-B47-3: price a hosted game like ranked, or lower (e.g. 50%)? The win-rate batch is done (Finding 4); with a strong squad ranked pricing nearly funds the sink, so lower is safer.
