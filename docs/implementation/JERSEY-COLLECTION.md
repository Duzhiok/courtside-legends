# Legends Jersey Collection — status and what is NOT done

## Shipped (MVP slice)
- **Shop (J1):** a "Jerseys" category selling 8 *original, fictional* throwbacks (¤150–¤300) through the existing Gold
  lifestyle shop (`purchaseShopItem`; no second currency). Cosmetic only, no gameplay effect.
- **Art (J2, placeholder):** `js/ui/collectibles/jerseySvg.js` draws every jersey from a silhouette family
  (`classic_short`, `retro_80s`, `oversized_2000s`, `modern_fitted`) + colours + number. Original art, no logos.
- **Collection:** My World > Jersey Collection lists bought + earned jerseys, a story per jersey, wear / take off.
- **Exchange (J3):** in Player Reborn, after a settled game, a man who really guarded you and has earned enough respect
  may offer a jersey swap. Accept / decline in the Reborn screen; accepted jerseys are kept in the run and copied
  idempotently to the account. No gameplay effect, never signed unless a future story beat says so.
- Respect is **derived** from the run's rivalry ledger (rivals' games, or the `watch` list of men you keep facing).
  No second trust ledger.

## Licensing boundary (do not blur)
Real-player and national-team entries (`releaseLevel: "historical_reference"`) are **reference data, not products**.
Only `original` and `licensed` templates can be sold (`isForSale`). Selling real-player/team merchandise needs rights.

## Measured: offers are RARE (baseline, `scripts/measure/jersey-offers.mjs`)
6 real 82-game seasons (starter minutes): **1 of 6 seasons produced offers** (that one: 4, now capped at 2 per season).
In the other 5 the closest opponent was met only 1–2 times (respect 38–53 < 65). A bench-level player rarely meets the
same man 3+ times a season. Initial values: MIN_RESPECT 65, MIN_MEETINGS 2, MAX_PER_SEASON 2. Levers if it should be
more common: lower MIN_RESPECT, weight game score more, or let `watch` meetings accumulate across seasons (verify the
ledger persists through rollover first). Do not tune from one run.

## NOT done
- **Championship exchanges:** the rule exists (`isChampionship`, lower respect bar) but Reborn exposes no verified
  playoff/finals field, so nothing can trigger it yet.
- **Avatar does not draw the worn jersey.** Equip records `account.shop.equippedJersey` only; the 2D/3D renderers do
  not read it. The collection says so on screen.
- **My Home framed display / Legacy Museum:** not built.
- **Real/licensed merchandise, signed items:** none (signing needs an explicit story beat).
- **Verified historical numbers / uniform styles:** all reference entries are `numberVerified: false`.
- **National teams beyond `USA_1992`.**
- **3D jersey meshes/materials.**
- Collection filters (source / era / player), shop "owned" tab does not list jerseys.
