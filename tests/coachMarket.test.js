// B61: the gold-challenge coach market (price, board, buy-cards), tested for the first time now that it is out of app.js.
import test from "node:test";
import assert from "node:assert/strict";
import { CAREER_COACH_SHOP_SIZE, careerCoachPrice, rollCareerCoachShop } from "../js/career/coachMarket.js";
import { coachMarketCardHtml, skillOfferCardHtml } from "../js/ui/careerMarketCards.js";
import { COACHES } from "../js/data/coaches.js";

const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("careerCoachPrice: tier table, legend floor (380), fame bonus on top, and a default for no coach", () => {
  assert.equal(careerCoachPrice(null), 80);
  assert.equal(careerCoachPrice({ hiddenTier: "bench" }), 70);
  assert.equal(careerCoachPrice({}), 70, "no tier reads as bench");
  assert.equal(careerCoachPrice({ hiddenTier: "starter" }), 130);
  assert.equal(careerCoachPrice({ hiddenTier: "something-new" }), 90, "an unknown tier still gets a price");
  assert.equal(careerCoachPrice({ hiddenTier: "bench", fame: 60 }), 70, "below the legend line fame changes nothing");
  // star / allstar / hof tiers and fame >= 70 are "legend coaches" (isLegendCoach): they never cost less than 380.
  assert.equal(careerCoachPrice({ hiddenTier: "star" }), 380);
  assert.equal(careerCoachPrice({ hiddenTier: "bench", fame: 72 }), 380);
  assert.equal(careerCoachPrice({ hiddenTier: "bench", fame: 80 }), 400, "fame 75+ adds 20 on the legend floor");
  assert.equal(careerCoachPrice({ hiddenTier: "bench", fame: 95 }), 420, "fame 90+ adds 40");
  assert.equal(careerCoachPrice({ hiddenTier: "nba50" }), 520, "a tier above the floor keeps its own price");
});

test("rollCareerCoachShop: fills the board, hides the current staff and past hires, prices every card", () => {
  const first = COACHES[0].id;
  const hired = COACHES[1].id;
  const c = { team: { coach: { id: first }, assistant: { id: COACHES[2].id } }, hiredCoachIds: [hired] };
  const picks = rollCareerCoachShop(c);
  assert.equal(picks.length, CAREER_COACH_SHOP_SIZE);
  assert.equal(c.coachShop, picks, "the board is also written onto the career");
  for (const card of picks) {
    assert.ok(![first, hired, COACHES[2].id].includes(card.id), "no coach you already have");
    assert.equal(card.hireCost, careerCoachPrice(COACHES.find((x) => x.id === card.id)));
  }
  assert.notEqual(picks[0], COACHES.find((x) => x.id === picks[0].id), "cards are copies, the catalogue is untouched");
  assert.equal(rollCareerCoachShop(null).length, 0);
  assert.equal(rollCareerCoachShop({}, 3).length, 3, "size is a parameter");
});

test("coach card: name escaped, price, and the three button states (hire / can't afford / already the coach)", () => {
  const offer = { id: "x1", name: '<img src=x onerror="boom">', hiddenTier: "star", hireCost: 200, style: "pace", note: "n" };
  const html = coachMarketCardHtml(offer, 500, null);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(visible(html), /聘请 ¤200/);
  assert.doesNotMatch(html, /disabled/);
  const broke = coachMarketCardHtml(offer, 50, null);
  assert.match(broke, /disabled/);
  assert.doesNotMatch(visible(broke), /聘请 ¤200/, "short on gold shows what is missing instead of the buy label");
  const current = coachMarketCardHtml(offer, 500, { id: "x1" });
  assert.match(current, /current/);
  assert.match(current, /disabled/);
  assert.match(visible(current), /已是主帅/);
});

test("skill pack card: price, rarity, buy state, and everything escaped", () => {
  const offer = { id: "s1", name: "Sniper<script>", desc: 'a "quote"', cost: 120, rarity: "mythic", rarityLabel: "神话" };
  const html = skillOfferCardHtml(offer, 500);
  assert.doesNotMatch(html, /<script>/);
  assert.match(visible(html), /买入入库 ¤120/);
  assert.match(visible(html), /对齐超巨身价/);
  assert.match(html, /rarity-mythic/);
  assert.match(skillOfferCardHtml(offer, 10), /disabled/);
  assert.match(visible(skillOfferCardHtml({ id: "s2", name: "N" }, 500)), /¤99/, "no cost defaults to 99");
});
