# Gold-challenge draft pool redesign (one-page design)

**Status:** APPROVED (user 2026-11-09). No code changes in this doc — implementation follows §8.
**Goal (user, 2026-11-04):** every player who appears in the gold-challenge
draft pool should have value and a plausible post-signing role — today only
the first few 70–80 OVR players ever get picked, while unknown low-OVR,
skill-less players are ignored.
**Queue:** this is the next item after the two approved designs that already
shipped — low-OVR role skills (`95f40f1`) and defense presentation
(`fb7c6c9`).

## 1. What the pool is today (verified against code)

The gold challenge is the budget draft: `CUSTOM_BUDGET = 15` blocks, roster
`CUSTOM_ROSTER_SIZE = 8` (`js/data/customPool.js`). Two phases
(`js/engine/draft.js`: `customSideCanSpend` / `customSpendPhaseDone`):

- **Spend phase** — `listPaidPeaks()` lists every peak card priced ≥ 1 block,
  sorted price desc, then OVR desc. Price = `max(historical floor, OVR band)`:
  OVR ≥ 96 → 5, ≥ 92 → 4, ≥ 86 → 3, ≥ 80 → 2, ≥ 74 → 1, else 0
  (`priceForPeak` / `ovrPriceBand`).
- **Filler phase** — once neither side can afford another priced card,
  `drawZeroCostPack()` deals 5 cards drawn uniformly at random from the
  price-0 peak pool until each roster reaches 8.

## 2. Why the complaint happens (diagnosis)

1. **The 1-block band (OVR 74–79) is dominated.** A 76 OVR costs a block;
   a 0-block 72 OVR is free. With 15 blocks the rational spend is stars
   (e.g. 5+5+5, or 5+4+4+2), so 74–79 players are almost never bought —
   they sit below the fold of a price-sorted list and lose to free fillers.
2. **The 0-block pool has no role signal.** `drawZeroCostPack` is uniform
   random and every filler looks identical: a body to reach 8 players.
   No low-OVR player is ever *chosen for a reason*.
3. **The spend list always opens with the same stars.** Price-then-OVR
   sorting means mid/low players are never compared on anything but price
   and OVR — the two axes on which they always lose.
4. **Partly fixed already.** `95f40f1` gives low-OVR players up to 2
   style-derived role skills, so "skill-less" is fixed at the data layer —
   but the pool UI never surfaces those skills as a reason to pick a player.

## 3. Proposal (recommended: presentation-first, no repricing in v1)

- **(a) Role line on every pool card, both phases.** Reuse the role-skill
  scenario line from `95f40f1` (one zh/en line per role skill): each card
  shows its role skills and a one-line role ("底角蹲坑 / corner spacer",
  "冲板蓝领 / energy rebounder", …). No new data, no new formulas.
- **(b) Role-diverse filler packs.** `drawZeroCostPack` deals 5 cards
  covering distinct role families (shooter / rebounder / defender /
  playmaker / energy) instead of uniform random, so each filler pick is a
  real choice between roles. Same pool, same 0 price, different deal.
- **(c) Keep the spend list order.** Do not re-sort by default — the
  price-sorted list is familiar and the spend decision is genuinely about
  price. Add only the role line from (a), so a 1-block 76 with a needed
  role can beat a 2-block 82 without one.
- **(d) Post-signing role sticks.** The roster screen shows each player's
  role label (derived from the same role skills), so a low-OVR pick keeps
  its identity after signing instead of reverting to "filler".

## 4. Alternatives (not recommended for v1)

- **(B) Reprice the middle.** Fold the 1-block band into 0, or raise the
  floor value of 74–79 OVR (e.g. a guaranteed role skill + higher floor).
  This is a balance change: it moves gold value, not just presentation.
  Only if measurement shows (a)–(d) still leave the 74–79 band unpicked.
- **(C) Curated spend packs.** Each spend pack guarantees 1 star + 2 mid +
  2 role players. Deeper UI change (the spend phase is currently a full
  sorted list, not packs) — revisit if the list still funnels to stars.

## 5. Measurement first (house style, before any price change)

Simulate N budget drafts with two pickers (greedy-value and random) and
count pick rate by OVR band and price. Expected baseline: 74–79 band and
0-block pool picked only as filler. Re-run after (a)–(d): every band's
pick rate should rise above the filler-only baseline, and no band should
stay at ~0. If (B) is ever proposed, it needs its own before/after
measurement — prices do not move on vibes.

## 6. Scope and acceptance

- **In scope:** `customPool.js` (`drawZeroCostPack`, role line source),
  `draft.js` filler dealing, pool-card and roster rendering (role line).
- **Out of scope:** OVR / `playerPrice` / `customPriceOf` formulas;
  gacha `drawPack` hidden-tier weights (different mode);
  `cpuUpgradeRoster` (already value-sorts; unaffected);
  `sim.js` (no engine change).
- **No save-format change.** Presentation + deal order only; old saves
  read identically.
- **Tests:** unit tests for role-diverse dealing (5 distinct families per
  pack, no duplicates, pool exhaustion safe) and for the role line on pool
  cards; full suite if `draft.js` is touched (shared engine-adjacent code).
- **Browser QA (Mac):** one budget draft end-to-end — spend phase shows
  role lines, filler pack shows 5 distinct roles, roster keeps role labels.

## 7. Open questions for the user — RESOLVED (user 2026-11-09)

1. **Q1 — Presentation-only v1, or reprice now?** Both: implement (a)–(d)
   now, prices UNCHANGED for v1; a small pricing/budget experiment is
   pre-approved if measurement shows the 1-coin tier still unpicked.
   Do not globally change the economy without comparing outcomes.
2. **Q2 — Does the role-diverse filler deal also apply to custom duel
   mode?** Yes, both modes — but Custom Duel gets a choice: Balanced
   Roles (default, recommended) or Fully Random (original behavior).
   Custom mode's value is freedom; the optimization must not force the
   five-role pattern on it.

## 8. User decisions (2026-11-09) — implementation basis

- **Role value, not cheapness.** Low-OVR players must earn their pick by
  complementing a star-heavy roster (corner spacer for a ball-dominant
  star, energy rebounder, lockdown defender, backup playmaker, energy
  guy), not by being cheap. Value comes from existing skills and game
  mechanics — no new hidden bonuses.
- **Card shows why to pick him.** Archetype + existing skills + one fit
  line, all derived from the player's existing data (e.g. 76 OVR,
  角色球员 · 3&D, 底角射手 / 外线防守, "适合搭配持球核心，提供外线空间
  与防守轮换", ¤1). Role labels stay visible on the roster after drafting.
- **Lightweight A/B/C comparison after implementation** (no big ADR, no
  long large-scale sims — a few auto-picker strategies + real playtest):
  A = existing prices + role tags; B = A + better role recommendations;
  C = adjust low-OVR prices or budget structure. Compare pick rate by
  tier, roster role coverage, win rate, gold remaining. If A/B clearly
  improve selection, no economy change; if the 1-coin tier is still
  unpicked, proceed with C (small, configurable, no further approval).
- **Custom Duel toggle.** Balanced Roles (shooter / rebounder / defender /
  playmaker / energy) is the recommended default; Fully Random preserves
  the original random behavior. Player choice is kept.
- **Proceed with implementation** and playable UI verification; focused
  tests + short balance comparison; coordinate via the board; continue to
  the next approved task when finished.
