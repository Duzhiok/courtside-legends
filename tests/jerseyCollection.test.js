/**
 * Legends Jersey Collection: catalog licensing boundary, the shop purchase, the exchange rules and the idempotent
 * state machine. Asserts the design goals only (who may be sold, who may offer, never twice), not tuning numbers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const eras = await import("../js/collectibles/jerseyEras.js");
const cat = await import("../js/collectibles/jerseyCatalog.js");
const elig = await import("../js/collectibles/jerseyEligibility.js");
const exch = await import("../js/collectibles/jerseyExchange.js");
const coll = await import("../js/collectibles/jerseyCollection.js");
const shopCatalog = await import("../js/data/shopCatalog.js");
const shop = await import("../js/data/shop.js");
const acc = await import("../js/data/account.js");
const { recordRivalryMeetings } = await import("../js/reborn/rivalry.js");
const { jerseySvg } = await import("../js/ui/collectibles/jerseySvg.js");
const { jerseyOffersHtml } = await import("../js/ui/reborn/jerseyOfferView.js");
const { jerseyCollectionHtml } = await import("../js/ui/collectibles/jerseyCollectionView.js");

const richAccount = (gold = 2000) => {
  globalThis.localStorage = createMemoryStorage();
  const a = acc.createAccount("jersey QA");
  a.gold = gold;
  a.onboardingDone = true;
  acc.saveAccount(a);
  return a;
};

// ---- eras / catalog ------------------------------------------------------------------------------------------------

test("a season maps to its era and silhouette family; an unreadable season never throws or guesses an era", () => {
  assert.equal(eras.endYearOf("1995-96"), 1996);
  assert.equal(eras.endYearOf("1999-00"), 2000);
  assert.equal(eras.endYearOf(1992), 1992);
  assert.equal(eras.endYearOf("nonsense"), null);
  assert.equal(eras.familyForSeason("1961-62"), "classic_short");
  assert.equal(eras.familyForSeason("1985-86"), "retro_80s");
  assert.equal(eras.familyForSeason("1995-96"), "oversized_2000s");
  assert.equal(eras.familyForSeason("2013-14"), "modern_fitted");
  assert.equal(eras.eraForSeason("garbage"), null);
  assert.equal(eras.familyForSeason("garbage"), "oversized_2000s");
});

test("only cleared release levels are sold: real-player and national-team references are data, never products", () => {
  const sold = cat.listJerseyCatalog({ onSale: true });
  assert.ok(sold.length >= 4);
  for (const t of sold) {
    assert.ok(["original", "licensed"].includes(t.releaseLevel), `${t.id} is ${t.releaseLevel}`);
    assert.equal(t.playerName, null, "an original jersey names no real player");
  }
  for (const t of cat.listJerseyCatalog({ category: "nba" }).concat(cat.listJerseyCatalog({ category: "national" }))) {
    assert.equal(cat.isForSale(t), false, `${t.id} must not be sellable`);
    assert.equal(t.numberVerified, false, "an unchecked number is flagged, not presented as fact");
  }
  assert.ok(shopCatalog.SHOP_ITEMS.filter((i) => i.effect?.type === "jersey").every((i) => cat.isForSale(cat.getJerseyTemplate(i.effect.templateId))));
  assert.equal(shopCatalog.validateCatalog().ok, true);
  assert.ok(shopCatalog.SHOP_ITEMS.filter((i) => i.effect?.type === "jersey").every((i) => i.category === "jersey" && i.price >= 150 && i.price <= 400), "originals sit in their own category and price band");
});

test("national teams are keyed by year, not a 'Dream Team N' counter; 1992 has its twelve", () => {
  assert.ok(cat.NATIONAL_TEAMS.USA_1992);
  assert.equal(cat.NATIONAL_TEAMS.USA_1992.roster.length, 12);
  assert.ok(!Object.keys(cat.NATIONAL_TEAMS).some((k) => /dream/i.test(k)));
  assert.equal(cat.listJerseyCatalog({ category: "national" }).length, 12);
});

test("an exchange jersey never invents a number or a signature, and uses real team colours only", () => {
  const t = cat.exchangeTemplate({ bref: "jordami01", name: "Michael Jordan", nameEn: "Michael Jordan", team: "CHI", year: 1997 });
  assert.equal(t.number, null);
  assert.equal(t.releaseLevel, "story");
  assert.equal(t.family, "oversized_2000s");
  assert.match(t.colors.primary, /^#[0-9A-Fa-f]{6}$/);
  assert.equal(cat.exchangeTemplate({ bref: "", year: 1997 }), null);
  assert.doesNotMatch(jerseySvg(t), /<text/, "no number means no number is drawn");
  assert.match(jerseySvg(cat.getJerseyTemplate("orig_neon_1986_23")), /<text[^>]*>23</);
});

// ---- the shop purchase (reuses purchaseShopItem; this only checks the jersey wiring) ----------------------------------

test("buying a jersey: charged once, owned forever, shows in the collection; repeats and short gold are refused", () => {
  const a = richAccount(1000);
  const item = shopCatalog.SHOP_ITEMS.find((i) => i.effect?.type === "jersey");
  const buy = shop.purchaseShopItem(a, item.id);
  assert.equal(buy.ok, true);
  assert.equal(a.gold, 1000 - item.price);
  assert.equal(shop.purchaseShopItem(a, item.id).reason, "already-owned");
  assert.equal(a.gold, 1000 - item.price, "no double charge");
  assert.deepEqual(coll.listOwnedJerseys(a).map((j) => j.key), [item.id]);

  const poor = richAccount(1);
  assert.equal(shop.purchaseShopItem(poor, item.id).reason, "not-enough-gold");
  assert.equal(coll.listOwnedJerseys(poor).length, 0);
  assert.equal(shop.purchaseShopItem(null, item.id).reason, "guest");
});

test("wearing a jersey survives later purchases and a reload, and cannot be faked for an item you do not own", () => {
  const a = richAccount(5000);
  const [first, second] = shopCatalog.SHOP_ITEMS.filter((i) => i.effect?.type === "jersey");
  assert.equal(coll.equipJersey(a, first.id).reason, "not-owned");
  shop.purchaseShopItem(a, first.id);
  assert.equal(shop.equipShopItem(a, first.id).ok, true);
  assert.equal(coll.equippedJerseyKey(a), first.id);
  shop.purchaseShopItem(a, second.id); // rewrites the shop record: the worn jersey must not be dropped
  assert.equal(coll.equippedJerseyKey(acc.getAccount(a.id)), first.id);
  assert.equal(coll.unequipJersey(a).ok, true);
  assert.equal(coll.equippedJerseyKey(a), null);
  assert.equal(coll.unequipJersey(a).reason, "not-equipped");
});

// ---- eligibility -------------------------------------------------------------------------------------------------

const meeting = (n, over = {}) => ({ gameId: `g${n}`, year: 1997, game: n, won: true, margin: 9, you: { pts: 14, gs: 8 }, rival: { pts: 15, gs: 8 }, ...over });
const rival = (games) => ({ bref: "rivalxx01", name: "Rival One", nameEn: "Rival One", team: "NYK", games });
const evidence = (over = {}) => ({ id: "g9", settled: true, year: 1997, game: 9, participants: ["rivalxx01"], rivalIds: ["rivalxx01"], directMatchups: [{ playerId: "you", opponentId: "rivalxx01" }], isChampionship: false, ...over });

test("respect is derived from real head-to-head games: more meetings, close games and duels raise it, capped at 100", () => {
  assert.equal(elig.respectFromRival(rival([])), 0);
  const plain = elig.respectFromRival(rival([meeting(1), meeting(2), meeting(3)]));
  const close = elig.respectFromRival(rival([meeting(1, { margin: 2 }), meeting(2), meeting(3)]));
  const duel = elig.respectFromRival(rival([meeting(1, { you: { pts: 25, gs: 14 }, rival: { pts: 27, gs: 15 } }), meeting(2), meeting(3)]));
  assert.ok(close > plain && duel > plain);
  assert.ok(elig.respectFromRival(rival(Array.from({ length: 20 }, (_, i) => meeting(i, { margin: 1, you: { gs: 20 }, rival: { gs: 20 } })))) <= 100);
});

test("without a title he needs respect AND to have really guarded you tonight; strangers and absent players never offer", () => {
  const ok = elig.evaluateExchangeCandidate({ opponent: { bref: "rivalxx01" }, game: evidence(), respect: 70, meetings: 4 });
  assert.equal(ok.eligible, true);
  assert.ok(ok.reasons.includes("MUTUAL_RESPECT"));
  assert.equal(elig.evaluateExchangeCandidate({ opponent: { bref: "rivalxx01" }, game: evidence(), respect: 50, meetings: 4 }).reason, "LOW_RESPECT");
  assert.equal(elig.evaluateExchangeCandidate({ opponent: { bref: "rivalxx01" }, game: evidence({ directMatchups: [] }), respect: 90, meetings: 4 }).reason, "NO_DIRECT_MATCHUP");
  assert.equal(elig.evaluateExchangeCandidate({ opponent: { bref: "rivalxx01" }, game: evidence({ participants: [] }), respect: 90, meetings: 4 }).reason, "NOT_A_PARTICIPANT");
  assert.equal(elig.evaluateExchangeCandidate({ opponent: { bref: "rivalxx01" }, game: evidence(), respect: 90, meetings: 1 }).reason, "TOO_FEW_MEETINGS");
  assert.equal(elig.evaluateExchangeCandidate({ opponent: { bref: "rivalxx01" }, game: evidence({ settled: false }), respect: 90, meetings: 4 }).reason, "GAME_NOT_SETTLED");
  assert.equal(elig.evaluateExchangeCandidate({ opponent: { bref: "rivalxx01" }, game: evidence(), respect: NaN, meetings: 4 }).reason, "MISSING_RELATIONSHIP");
});

test("a title win lowers the bar (rule is ready for when Reborn has playoffs), but a stranger still offers nothing", () => {
  const title = (respect) => elig.evaluateExchangeCandidate({ opponent: { bref: "rivalxx01" }, game: evidence({ isChampionship: true }), respect, meetings: 3 });
  assert.equal(title(50).eligible, true, "50 + title + rivalry + matchup clears the bar");
  assert.ok(title(50).reasons.includes("CHAMPIONSHIP"));
  assert.equal(title(30).eligible, false);
  assert.equal(title(30).reason, "LOW_RESPECT");
});

// ---- the state machine, fed by the REAL rivalry recorder ---------------------------------------------------------------

/** A Reborn game report in the shape playGame builds, with `bref` guarding you for real minutes. */
const report = (n, over = {}) => ({
  gameId: `r-${n}`, year: 1997, game: n, won: true, margin: 3, gameScore: 14,
  line: { min: 28, pts: 16, score: 14 }, you: { pos: "SG", ovr: 62 },
  opponents: [{ bref: "rivalxx01", name: "Rival One", nameEn: "Rival One", pos: "SG", team: "NYK", ovr: 66, min: 33, pts: 18, gs: 12 }],
  takeover: null, ...over,
});

/** Play n real games through recordRivalryMeetings and the offer builder; returns the last result. */
function playGames(n, startState = null) {
  let ledger = null;
  let state = startState;
  let last = null;
  for (let i = 1; i <= n; i += 1) {
    const rep = report(i);
    const rivalry = recordRivalryMeetings(ledger, rep);
    ledger = rivalry.ledger;
    last = exch.offersForGame(state, { report: rep, ledger, rivalry });
    state = last.state;
  }
  return { ...last, ledger };
}

test("real meetings build respect; a rival who keeps matching you eventually offers, and replaying a game adds nothing", () => {
  let reached = null;
  for (let n = 2; n <= 9 && !reached; n += 1) {
    const out = playGames(n);
    if (out.created.length) reached = { n, out };
  }
  assert.ok(reached, "within nine meetings a close, evenly matched man offers a jersey");
  assert.equal(reached.out.created.length, 1);
  const offer = reached.out.created[0];
  assert.equal(offer.id, `jersey-offer:r-${reached.n}:rivalxx01`);
  assert.equal(offer.status, "pending");
  assert.equal(offer.template.number, null);
  assert.equal(offer.evidence.settled, true);

  // The very same game again: same id, nothing new.
  const rep = report(reached.n);
  const rivalry = recordRivalryMeetings(reached.out.ledger, rep);
  const again = exch.offersForGame(reached.out.state, { report: rep, ledger: rivalry.ledger, rivalry });
  assert.equal(again.created.length, 0);
  assert.equal(again.state.offers.length, 1);
});

test("one jersey per person per season: a pending offer blocks a second one from the same man", () => {
  const first = playGames(9);
  assert.ok(first.state.offers.length >= 1);
  assert.equal(first.state.offers.filter((o) => o.fromBref === "rivalxx01").length, 1, "nine games, still one offer from him this season");
});

test("a man you keep facing counts even when he is not a formal rival (the ledger's watch list)", () => {
  const watch = { bref: "rivalxx01", name: "Watch Man", nameEn: "Watch Man", team: "NYK", meetings: 4, heat: 9, lastGameId: "w4" };
  assert.ok(elig.respectFromWatch(watch) >= elig.EXCHANGE_RULES.MIN_RESPECT);
  assert.equal(elig.respectFromWatch({ meetings: 1, heat: 1 }) < elig.EXCHANGE_RULES.MIN_RESPECT, true);
  assert.equal(elig.relationSummary(null), null);
  const rep = report(9);
  const out = exch.offersForGame(null, { report: rep, ledger: { rivals: [], watch: { rivalxx01: watch } }, rivalry: { met: [] } });
  assert.equal(out.created.length, 1);
  assert.equal(out.created[0].fromBref, "rivalxx01");
  assert.deepEqual(out.created[0].evidence.you, { pts: 16, gs: 14 }, "that night's lines come from the settled report, not the ledger");
  assert.deepEqual(out.created[0].evidence.rival, { pts: 18, gs: 12 });
  assert.equal(out.created[0].evidence.meetings, 4);
});

test("a keepsake stays rare: no more than the season's cap of open or kept offers, however many men qualify", () => {
  const strong = (bref) => ({ bref, name: bref, nameEn: bref, team: "NYK", meetings: 6, heat: 12 });
  const rep = report(9, { opponents: ["a", "b", "c"].map((b) => ({ bref: `${b}x01`, name: b, nameEn: b, pos: "SG", team: "NYK", ovr: 66, min: 30, pts: 10, gs: 8 })) });
  const watch = Object.fromEntries(["ax01", "bx01", "cx01"].map((b) => [b, strong(b)]));
  const rivalry = { met: ["ax01", "bx01", "cx01"].map((b) => ({ rival: { bref: b } })) };
  const out = exch.offersForGame(null, { report: rep, ledger: { rivals: Object.values(watch), watch: {} }, rivalry });
  assert.ok(out.created.length <= elig.EXCHANGE_RULES.MAX_PER_SEASON);
  assert.ok(out.created.length >= 1);
  const later = exch.offersForGame(out.state, { report: report(10), ledger: { rivals: Object.values(watch), watch: {} }, rivalry });
  assert.equal(later.state.offers.filter((o) => o.status === "pending").length <= elig.EXCHANGE_RULES.MAX_PER_SEASON, true);
});

test("accepting turns an offer into a kept jersey with its provenance; twice is a no-op, a second one in the same game is refused", () => {
  const { state } = playGames(9);
  const offer = state.offers[0];
  const accepted = exch.acceptJerseyExchange(state, offer.id);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.jersey.id, `exchange:${offer.id}`);
  assert.equal(accepted.jersey.signed, false, "a swap is never silently a signature");
  assert.equal(accepted.jersey.provenance.gameId, offer.gameId);
  assert.equal(accepted.jersey.provenance.fromBref, "rivalxx01");
  assert.equal(accepted.state.collection.length, 1);
  assert.equal(accepted.state.offers[0].status, "accepted");

  const twice = exch.acceptJerseyExchange(accepted.state, offer.id);
  assert.equal(twice.ok, true);
  assert.equal(twice.duplicate, true);
  assert.equal(twice.state.collection.length, 1);
  assert.equal(state.offers[0].status, "pending", "the input state is never mutated");

  // Same game, a second man: the per-game limit holds.
  const other = structuredClone(accepted.state);
  other.offers.push({ ...structuredClone(offer), id: "jersey-offer:" + offer.gameId + ":other01", fromBref: "other01", status: "pending" });
  assert.equal(exch.acceptJerseyExchange(other, "jersey-offer:" + offer.gameId + ":other01").reason, "GAME_EXCHANGE_LIMIT");
});

test("declining is terminal; an unknown or lapsed offer cannot be accepted; last season's offers expire", () => {
  const { state } = playGames(9);
  const id = state.offers[0].id;
  const declined = exch.declineJerseyExchange(state, id);
  assert.equal(declined.ok, true);
  assert.equal(exch.acceptJerseyExchange(declined.state, id).reason, "OFFER_NOT_PENDING");
  assert.equal(exch.declineJerseyExchange(declined.state, id).duplicate, true);
  assert.equal(exch.acceptJerseyExchange(state, "jersey-offer:nope").reason, "OFFER_NOT_FOUND");

  const expired = exch.expireOffers(state, 1998);
  assert.equal(expired.offers[0].status, "expired");
  assert.equal(exch.acceptJerseyExchange(expired, id).reason, "OFFER_NOT_PENDING");
  assert.equal(exch.expireOffers(state, 1997).offers[0].status, "pending", "same season: still open");
});

test("an old save with no jersey state reads as empty and nothing breaks", () => {
  assert.deepEqual(exch.jerseyState(undefined), { version: 1, offers: [], collection: [] });
  assert.deepEqual(exch.jerseyState({ jerseys: "junk" }), { version: 1, offers: [], collection: [] });
  assert.equal(jerseyOffersHtml({ reborn: {}, lang: "zh" }), "");
});

// ---- the account projection and the views --------------------------------------------------------------------------------

test("kept jerseys are copied to the account once (deduped by instance id) and survive a reload", () => {
  const { state } = playGames(9);
  const kept = exch.acceptJerseyExchange(state, state.offers[0].id).state;
  const a = richAccount(0);
  assert.equal(coll.mirrorJerseysToAccount(a, kept), 1);
  assert.equal(coll.mirrorJerseysToAccount(a, kept), 0, "second projection changes nothing");
  acc.saveAccount(a);
  const reloaded = acc.getAccount(a.id);
  const list = coll.listOwnedJerseys(reloaded);
  assert.equal(list.length, 1);
  assert.equal(list[0].source, "exchange");
  const prov = coll.getJerseyProvenance(reloaded, list[0].key);
  assert.equal(prov.fromBref, "rivalxx01");
  assert.equal(prov.signed, false);
  assert.equal(coll.equipJersey(reloaded, list[0].key).ok, true);
  assert.equal(coll.mirrorJerseysToAccount(null, kept), 0, "a guest keeps the run's copy only");
});

test("views escape every name and never promise a number the data does not have", () => {
  const { state } = playGames(9);
  const evil = structuredClone(state);
  evil.offers[0].fromName = '<img src=x onerror="boom">';
  evil.offers[0].fromNameEn = evil.offers[0].fromName;
  const html = jerseyOffersHtml({ reborn: { jerseys: evil }, lang: "en" });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-jersey-accept=/);
  assert.match(html, /not signed/);

  const a = richAccount(0);
  const kept = exch.acceptJerseyExchange(state, state.offers[0].id).state;
  coll.mirrorJerseysToAccount(a, kept);
  const view = jerseyCollectionHtml({ list: coll.listOwnedJerseys(a), equipped: null }, "zh");
  assert.match(view, /交换所得/);
  assert.match(view, /不是现实中存在的实物/);
  assert.equal(jerseyCollectionHtml(null), "", "a guest has no collection section");
  assert.match(jerseyCollectionHtml({ list: [], equipped: null }, "zh"), /还没有球衣/);
});
