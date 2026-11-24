// B61 step 4: the market card builders moved out of app.js. The data-* hooks are the contract app.js's click delegation relies on.
import test from "node:test";
import assert from "node:assert/strict";
import { marketFormBlock, marketOwnedCard, playerMarketCardHtml, posSelectHtml } from "../js/ui/marketCards.js";
import { realTeam } from "./helpers/realGame.js";

const p = realTeam("CHI", 1996).players[0];

test("shop card: affordable -> buy button, over budget -> disabled with the shortfall; duel -> bid button", () => {
  const ctx = { team: { players: [], coach: null } };
  const rich = playerMarketCardHtml(p, ctx, { budget: 1e9 });
  assert.ok(rich.includes(`data-buy="${p.id}"`) && !rich.includes("disabled") && !rich.includes("unaffordable"));
  const poor = playerMarketCardHtml(p, ctx, { budget: 0 });
  assert.ok(poor.includes("unaffordable") && /data-buy="[^"]+"\s+disabled/.test(poor) && poor.includes("超出预算"));
  const duel = playerMarketCardHtml(p, ctx, { duel: true, budget: 1e9 });
  assert.ok(duel.includes(`data-bid="${p.id}"`) && !duel.includes("data-buy="));
});

test("owned card: draggable, side kept, sell button only when selling is allowed, sale price shown", () => {
  const sellable = marketOwnedCard(p, true, "A");
  assert.ok(sellable.includes(`data-drag-id="${p.id}"`) && sellable.includes('data-side="A"'));
  assert.ok(sellable.includes(`data-sell="${p.id}"`) && sellable.includes("market-pos-select"));
  assert.ok(!marketOwnedCard(p, false).includes("data-sell="));
});

test("form block: no games and no card line -> the honest empty line; a card season is shown", () => {
  assert.ok(marketFormBlock({}).includes("暂无近况"));
  assert.ok(marketFormBlock({ raw: { ppg: 25.1, rpg: 5, apg: 3.2 } }).includes("卡面赛季 25.1分"));
});

test("position select marks the natural position and the chosen one, and escapes nothing it should not", () => {
  const html = posSelectHtml({ id: "x1", pos: "SF", playPos: "PF" });
  assert.ok(html.includes('data-id="x1"') && /<option value="PF" selected>/.test(html) && html.includes("SF·本职"));
  assert.ok(posSelectHtml({ id: "x1", pos: "SF" }, { disabled: true }).includes("disabled"));
});

test("shop card: the analyst fit tag can show without the scout (Gold) and never leaks the scout's value badge", () => {
  const jordan = realTeam("CHI", 1996).players.find((x) => x.name === "Michael Jordan");
  const ctx = { team: { players: realTeam("SAC", 1996).players.slice(0, 8), coach: null } };
  const gold = playerMarketCardHtml(jordan, ctx, { fitOn: true, budget: 1e9 });
  assert.ok(gold.includes("fit-badge"), "Jordan into the 1996 Kings: the analyst flags the fit");
  assert.ok(!gold.includes("value-badge"), "no scout bought: the hidden value stays hidden");
  assert.ok(!playerMarketCardHtml(jordan, ctx, { budget: 1e9 }).includes("fit-badge"), "fitOn defaults to scoutOn (the duel)");
  // B101: the fitOn = scoutOn default was unpinned — { scoutOn: true } with no
  // fitOn must still show the fit tag (Jordan's tier into these Kings is great).
  assert.ok(
    playerMarketCardHtml(jordan, ctx, { scoutOn: true, budget: 1e9 }).includes("fit-badge"),
    "scout bought, fitOn omitted: the fit tag follows scoutOn"
  );
  // B101: the value badge must be gated on scoutOn, not fitOn — Kerr is a
  // bargain (妖人) the scout would reveal, so with the fit tag on but no
  // scout the value stays hidden; with the scout it shows (the control that
  // keeps the pin from passing vacuously on a valueless fixture).
  const kerr = realTeam("CHI", 1996).players.find((x) => x.id === "kerrst01-1996-chi");
  assert.ok(
    !playerMarketCardHtml(kerr, ctx, { fitOn: true, scoutOn: false, budget: 1e9 }).includes("value-badge"),
    "fit on, no scout: Kerr's bargain value stays hidden"
  );
  assert.ok(
    playerMarketCardHtml(kerr, ctx, { fitOn: true, scoutOn: true, budget: 1e9 }).includes("value-badge"),
    "scout bought: Kerr's bargain value is revealed"
  );
});
