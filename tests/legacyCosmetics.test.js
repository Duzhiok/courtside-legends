/**
 * Career 2.0 decision 4: career honours (titles + a portrait frame) redeemed with Reborn career fragments.
 * A title needs the real evidence first; nothing is sold for gold; the account copy is idempotent.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buyUnlock, fragmentLedger, unlockBlocker } from "../js/reborn/fragments.js";
import { createRebornState } from "../js/reborn/identity.js";
import {
  LEGACY_UNLOCKS, equipTitle, equippedTitle, mirrorUnlocksToAccount, ownedUnlocks, runUnlockIds, unlockById,
} from "../js/collectibles/legacyCosmetics.js";
import { SHOP_ITEMS } from "../js/data/shopCatalog.js";
import { legacyUnlocksHtml } from "../js/ui/collectibles/legacyUnlocksView.js";
import { identityCardHtml } from "../js/ui/myWorldView.js";
import { fragmentsPanelHtml } from "../js/ui/reborn/fragmentsView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const run = (balance) => {
  const r = createRebornState("honours-1", ROWS);
  r.player.fragments = { balance, history: [] };
  return r;
};

test("a title needs the real evidence first; fragments only redeem it", () => {
  const r = run(20);
  assert.equal(unlockBlocker(r, "title:awakened"), "not-earned");
  assert.equal(unlockBlocker(r, "title:rival"), "not-earned");
  assert.equal(unlockBlocker(r, "title:champion"), "not-earned");
  r.player.awakening = { awakened: [{ skillId: "rainmaker", season: 1997 }] };
  r.honors = [{ id: "champion:1997", type: "champion", year: 1997 }];
  assert.equal(unlockBlocker(r, "title:awakened"), null);
  assert.equal(unlockBlocker(r, "title:champion"), null);
  assert.equal(unlockBlocker(r, "nope"), "unknown");
});

test("redeeming spends the cost once per run, never touching the input", () => {
  const r = run(unlockById("frame:reborn").cost + 1);
  assert.equal(unlockBlocker(run(3), "frame:reborn"), "short");
  const next = buyUnlock(r, "frame:reborn", 1997);
  assert.equal(fragmentLedger(next).balance, 1);
  assert.deepEqual(runUnlockIds(next), ["frame:reborn"]);
  assert.deepEqual(runUnlockIds(r), [], "input untouched");
  assert.equal(unlockBlocker({ ...next, player: { ...next.player, fragments: { balance: 99 } } }, "frame:reborn"), "already");
  assert.throws(() => buyUnlock(next, "frame:reborn"), /already|short/);
});

test("the account gets an idempotent copy; titles are worn only when owned; the frame never sells for gold", () => {
  const account = { shop: {} };
  assert.equal(mirrorUnlocksToAccount(account, ["title:reborn", "frame:reborn", "bogus"]), 2);
  assert.equal(mirrorUnlocksToAccount(account, ["title:reborn"]), 0);
  assert.equal(equipTitle(account, "title:champion").ok, false, "not owned");
  assert.equal(equipTitle(account, "frame:reborn").ok, false, "a frame isn't a title");
  assert.equal(equipTitle(account, "title:reborn").ok, true);
  assert.equal(equippedTitle(account).id, "title:reborn");
  assert.deepEqual(ownedUnlocks(account, "frame:reborn").map((e) => [e.unlock.id, e.worn]), [["title:reborn", true], ["frame:reborn", true]]);
  for (const u of LEGACY_UNLOCKS) assert.ok(!SHOP_ITEMS.some((item) => item.id === u.id), `${u.id} is not a Shop item`);
});

test("My World shows the worn title under the name and lists the honours; the Reborn panel says what a title needs", () => {
  const account = { shop: {} };
  mirrorUnlocksToAccount(account, ["title:reborn", "frame:reborn"]);
  const html = legacyUnlocksHtml(ownedUnlocks(account, null), "zh");
  assert.match(html, /「重生者」/);
  assert.match(html, /data-unlock="title:reborn"/);
  assert.match(html, /data-item="frame:reborn"/, "the frame row reuses the owned-item equip action");
  assert.equal(legacyUnlocksHtml(null), "", "guest: hidden");
  assert.match(identityCardHtml({ name: "John" }, "zh", null, "reborn", { title: "重生者" }), /mw-title-badge">「重生者」/);
  const panel = fragmentsPanelHtml({ reborn: run(4), week: 1, card: null, year: 1997, lang: "zh" });
  assert.match(panel, /data-buy-unlock="title:reborn" >/);
  assert.match(panel, /需要先在比赛中觉醒一项招牌技能/);
});
