import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getLang, setLang, translateStatic } from "../js/i18n.js";
import { PHRASES } from "../js/i18n-phrases.js";

// Queue item 10 (Duel review leftovers): the market header used to read
// "金币 A … / B …" next to the header account-gold chip, which reads as a
// mismatch — the market line is the challenge budget, not the account gold.
// The label is now "挑战预算" in both career (c.gold) and duel (goldA/goldB)
// modes, which share this one header row.
test("market budget label: the market header says 挑战预算, not 金币", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const m = html.match(/<span>([^<]*)<strong id="gold-amt"/);
  assert.ok(m, "market header gold-amt span found");
  assert.equal(m[1].trim(), "挑战预算");
});

test("market budget label: the account gold chip is untouched and separate", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.includes('id="btn-gold-chip"'), "header account gold chip still present");
  assert.ok(html.includes('id="gold-chip-amt"'), "account gold amount still present");
});

test("i18n: 挑战预算 is covered by PHRASES and translates in en", () => {
  assert.ok(
    PHRASES.some(([zh, en]) => zh === "挑战预算" && en === "Challenge Budget"),
    "PHRASES has [挑战预算, Challenge Budget]"
  );
  const prev = getLang();
  try {
    setLang("en");
    assert.equal(translateStatic("挑战预算"), "Challenge Budget");
    setLang("zh");
    assert.equal(translateStatic("挑战预算"), "挑战预算");
  } finally {
    setLang(prev);
  }
});
