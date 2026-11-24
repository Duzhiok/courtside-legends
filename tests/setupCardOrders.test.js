// Tendency dropdowns transplanted onto the setup cards (user 2026-11-22):
// each card carries its own 6 selects at the bottom, so the card and its
// instructions are read together and nothing has to be matched by name
// further down the page.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_ACTION,
  ORDER_AGGRESSION,
  ORDER_ATTACK,
  ORDER_DEF,
  ORDER_HUNT,
  ORDER_USAGE,
  ordersLabel,
} from "../js/engine/gameplan.js";
import { orderSelectHtml, setupCardOrdersHtml } from "../js/ui/setupCardOrders.js";

const CJK = /[\u4e00-\u9fff]/;
const ORDER_TABLES = { ORDER_USAGE, ORDER_ATTACK, ORDER_ACTION, ORDER_HUNT, ORDER_AGGRESSION, ORDER_DEF };
// Slot key in an orders object -> its table. ordersLabel reads each slot by key.
const ORDER_SLOTS = [
  ["usage", ORDER_USAGE],
  ["aggression", ORDER_AGGRESSION],
  ["action", ORDER_ACTION],
  ["attack", ORDER_ATTACK],
  ["hunt", ORDER_HUNT],
  ["defFocus", ORDER_DEF],
];

const orders = {
  usage: "balanced",
  aggression: "normal",
  action: "post",
  attack: "paint",
  hunt: "auto",
  defFocus: "auto",
};

test("card orders block: 6 selects, one per tendency, each carrying its key and the current value selected", () => {
  const html = setupCardOrdersHtml({ orders, ordersManual: true });
  for (const [key, _value] of Object.entries(orders)) {
    assert.match(html, new RegExp(`data-ord-key="${key}"`), `${key} select is keyed`);
  }
  assert.equal((html.match(/data-ord-key="/g) || []).length, 6, "exactly 6 tendency selects");
  assert.match(html, /<option value="balanced" selected /, "usage shows 攻传均衡");
  assert.match(html, /<option value="post" selected /, "action shows 低位要球");
  assert.match(html, /<option value="paint" selected /, "attack shows 内线杀伤");
  assert.match(html, /<option value="auto" selected title="[^"]*">跟随球队<\/option>/, "hunt stays on 跟随球队");
  assert.match(html, /<option value="auto" selected title="[^"]*">常规防守<\/option>/, "defence stays on 常规防守");
  assert.match(html, /进攻/, "offense group is labelled");
  assert.match(html, /防守/, "defence group is labelled");
  assert.doesNotMatch(html, /推荐/, "a manually set player shows no 推荐 tag");
});

test("card orders block: recommended (untouched) orders carry the 推荐 tag; missing orders default to auto", () => {
  const html = setupCardOrdersHtml({ orders, ordersManual: false });
  assert.match(html, /推荐/, "system-recommended orders are marked 推荐");
  const blank = setupCardOrdersHtml({});
  assert.match(blank, /<option value="auto" selected title="[^"]*">欲望跟随<\/option>/, "aggression falls back to auto");
  assert.doesNotMatch(blank, /<option value="balanced" selected /, "nothing is pre-picked without orders");
});

test("card orders speak English when lang is en", () => {
  const html = setupCardOrdersHtml({ orders, ordersManual: false }, "en");
  assert.match(html, /<option value="balanced" selected title="Score and pass">Balance<\/option>/);
  assert.match(html, /<option value="post" selected title="Back to the basket; needs size\.">Post up<\/option>/);
  assert.match(html, /<option value="auto" selected title="Use the team tendency">Team call<\/option>/);
  assert.match(html, />Offense</);
  assert.match(html, />Defense</);
  assert.match(html, />Suggested</);
  assert.doesNotMatch(html, /攻传均衡|进攻|推荐|跟随球队/);
  assert.equal(
    ordersLabel({ usage: "balanced", aggression: "normal", action: "post", attack: "paint", hunt: "auto", defFocus: "auto" }, "en"),
    "Balance · Normal · Post up · Paint",
  );
});

test("orderSelectHtml: selected option, key attribute, and hostile titles are escaped", () => {
  const hostile = [
    { id: "a", name: "<b>x</b>", hint: 'q"uote' },
    { id: "b", name: "B", hint: "plain" },
  ];
  const html = orderSelectHtml(hostile, "b", "cls", 't"itle', "usage");
  assert.match(html, /<select class="cls" title="t&quot;itle" data-ord-key="usage">/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /title="q&quot;uote"/);
  assert.match(html, /<option value="b" selected /);
  const noKey = orderSelectHtml(hostile, "a", "cls", "");
  assert.doesNotMatch(noKey, /data-ord-key/, "the live panel's selects carry no key");
});

// i18n coverage pin (2026-11-23 10:26 verification follow-up): the committed
// suite used to exercise only balanced/post/auto in English, so dropping
// nameEn from any other entry (e.g. ORDER_USAGE organize) stayed green.
// These three tests pin all 34 entries through every English path.
test("every ORDER_* entry (34) carries nameEn + hintEn, English has no Chinese, zh name intact", () => {
  let total = 0;
  for (const [tname, list] of Object.entries(ORDER_TABLES)) {
    for (const o of list) {
      total++;
      assert.ok(o.nameEn, `${tname}/${o.id} has nameEn`);
      assert.ok(o.hintEn, `${tname}/${o.id} has hintEn`);
      assert.doesNotMatch(o.nameEn, CJK, `${tname}/${o.id} nameEn`);
      assert.doesNotMatch(o.hintEn, CJK, `${tname}/${o.id} hintEn`);
      assert.match(o.name, CJK, `${tname}/${o.id} zh name intact`);
      assert.match(o.hint, CJK, `${tname}/${o.id} zh hint intact`);
    }
  }
  assert.equal(total, 34, "six ORDER_* tables hold 34 entries");
});

test("ordersLabel: English renders every non-auto entry by its nameEn (no silent fallback to zh)", () => {
  for (const [slot, list] of ORDER_SLOTS) {
    for (const entry of list) {
      if (entry.id === "auto") continue;
      const one = { usage: "auto", aggression: "auto", action: "auto", attack: "auto", hunt: "auto", defFocus: "auto", [slot]: entry.id };
      assert.equal(ordersLabel(one, "en"), entry.nameEn, `${slot}/${entry.id} labels by nameEn`);
      assert.doesNotMatch(ordersLabel(one, "en"), CJK, `${slot}/${entry.id} has no CJK in English`);
      assert.equal(ordersLabel(one), entry.name, `${slot}/${entry.id} zh label intact`);
    }
  }
  assert.equal(
    ordersLabel({ usage: "organize", aggression: "lock_d", action: "pnr", attack: "paint", hunt: "hunt", defFocus: "help" }, "en"),
    "Playmaker · Lock down · Pick-and-roll · Paint · Hunt · Help",
  );
  assert.equal(
    ordersLabel({ usage: "organize", aggression: "lock_d", action: "pnr", attack: "paint", hunt: "hunt", defFocus: "help" }),
    "偏组织 · 专注防守 · 挡拆 · 内线杀伤 · 积极抓机会 · 协防扫荡",
  );
});

test("orderSelectHtml + full card: English renders every ORDER_* table with no Chinese anywhere", () => {
  for (const [tname, list] of Object.entries(ORDER_TABLES)) {
    const html = orderSelectHtml(list, list[1].id, "cls", "title", undefined, "en");
    assert.doesNotMatch(html, CJK, `${tname} EN select has no CJK`);
    for (const o of list) {
      assert.ok(html.includes(`>${o.nameEn}<`), `${tname}/${o.id} shows nameEn`);
      assert.ok(html.includes(`title="${o.hintEn}"`), `${tname}/${o.id} shows hintEn`);
    }
  }
  const card = setupCardOrdersHtml(
    { orders: { usage: "organize", aggression: "lock_d", action: "pnr", attack: "paint", hunt: "hunt", defFocus: "help" }, ordersManual: true },
    "en",
  );
  assert.doesNotMatch(card, CJK, "a fully-set English card has no Chinese");
  assert.ok(card.includes(">Playmaker<"), "card shows Playmaker");
  assert.ok(card.includes(">Lock down<"), "card shows Lock down");
});
