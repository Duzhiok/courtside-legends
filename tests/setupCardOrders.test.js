// Tendency dropdowns transplanted onto the setup cards (user 2026-11-22):
// each card carries its own 6 selects at the bottom, so the card and its
// instructions are read together and nothing has to be matched by name
// further down the page.
import test from "node:test";
import assert from "node:assert/strict";
import { orderSelectHtml, setupCardOrdersHtml } from "../js/ui/setupCardOrders.js";

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
  for (const [key, value] of Object.entries(orders)) {
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
