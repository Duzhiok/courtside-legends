// The renewal menu's wording lives in one place (js/career/contractOffers.js) and reads by offer id, so a
// save written before the English text existed -- offers stored with Chinese strings -- still renders in
// English. Previously the card, the "contract signed" notice and the privilege chips were Chinese-only.
import test from "node:test";
import assert from "node:assert/strict";
import { OFFER_TEMPLATES, offerText } from "../js/career/contractOffers.js";

const CJK = /[\u3400-\u9fff]/;

test("every renewal offer has English wording, and none of it is Chinese", () => {
  assert.ok(OFFER_TEMPLATES.length >= 4);
  for (const offer of OFFER_TEMPLATES) {
    const en = offerText(offer, "en");
    assert.ok(en.title && en.description, `${offer.id} needs an English title and description`);
    assert.ok(!CJK.test(en.title + en.description + en.privileges.join(" ")), `${offer.id}: Chinese leaked into the English wording`);
    assert.equal(en.privileges.length, offer.privileges.length, `${offer.id}: one English perk per Chinese perk`);
  }
});

test("Chinese stays Chinese, and zh/en differ", () => {
  for (const offer of OFFER_TEMPLATES) {
    const zh = offerText(offer, "zh");
    assert.equal(zh.title, offer.title);
    assert.deepEqual(zh.privileges, offer.privileges);
    assert.notEqual(zh.title, offerText(offer, "en").title);
  }
});

test("an offer stored in an old save (Chinese strings only) still reads in English, by id", () => {
  const old = { id: "rebuild-extension", title: "重建续约", description: "（旧存档里存的中文）", privileges: ["自定义训练计划"], years: 4 };
  const en = offerText(old, "en");
  assert.equal(en.title, "Rebuild Extension");
  assert.ok(!CJK.test(en.description));
  assert.ok(!CJK.test(en.privileges.join(" ")));
});

test("an offer id the game doesn't know falls back to the offer's own text instead of going blank", () => {
  const odd = { id: "mystery-extension", title: "Mystery", description: "??", privileges: ["x"] };
  assert.deepEqual(offerText(odd, "en"), { title: "Mystery", description: "??", privileges: ["x"] });
  assert.deepEqual(offerText({ id: "nope" }, "en"), { title: "", description: "", privileges: [] });
});
