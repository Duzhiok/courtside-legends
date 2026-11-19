// S-P1-2 collection grid: debounce + paging + context cache, and S-P2-4
// overall() computed once per card per render (2026-11-13 global review).
// app.js is a browser module, so its DOM wiring is covered by source
// assertions; the cache helper itself is unit-tested.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCollectionView, cachedOvrOf, freshFilter, redundantIds } from "../js/ui/collectionFilter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const appJs = () => read("js/app.js");

test("S-P2-4: cachedOvrOf calls the underlying overall() once per card id", () => {
  let calls = 0;
  const ovrOf = cachedOvrOf((card) => {
    calls += 1;
    return card.ovr * 2;
  });
  const a = { id: "a", ovr: 90 };
  const b = { id: "b", ovr: 70 };
  assert.equal(ovrOf(a), 180);
  assert.equal(ovrOf(a), 180);
  assert.equal(ovrOf(b), 140);
  assert.equal(ovrOf(a), 180);
  assert.equal(ovrOf(b), 140);
  assert.equal(calls, 2, "one computation per card, not one per call");
});

test("S-P1-2: paging slices the filtered view one page at a time", () => {
  const cards = Array.from({ length: 120 }, (_, i) => ({
    id: `c-${i}`,
    bref: `p${i}`,
    season: 2000 + (i % 20),
    ovr: 60 + (i % 40),
    name: `P${i}`,
    nameEn: `P${i}`,
    hiddenRoll: { grade: "B", rating: 70 },
    mergeLevel: 0,
  }));
  const ctx = {
    ovrOf: (c) => c.ovr,
    hiddenOf: (c) => c.hiddenRoll?.rating,
    redundant: redundantIds(cards, (c) => c.ovr),
    junk: new Set(),
    order: new Map(cards.map((c, i) => [c.id, i])),
  };
  const view = applyCollectionView(cards, freshFilter(), ctx);
  assert.equal(view.length, 120);
  const PAGE = 50;
  assert.equal(view.slice(0, PAGE).length, 50);
  assert.equal(view.slice(0, PAGE * 2).length, 100);
  assert.equal(view.length - PAGE * 2, 20, "20 remain for the load-more button");
  // Pages are a prefix of the same order — loading more never reshuffles.
  assert.deepEqual(view.slice(0, PAGE * 2).slice(0, PAGE), view.slice(0, PAGE));
});

test("S-P1-2: search input is debounced 150ms instead of repainting per keystroke", () => {
  const src = appJs();
  const input = src.match(/#collection-filter"\)\?\.\s*addEventListener\("input", \(event\) => \{([\s\S]*?)\n\}\);/);
  assert.ok(input, "collection-filter input listener missing");
  assert.match(input[1], /clearTimeout\(collectionQueryTimer\)/);
  assert.match(input[1], /setTimeout\(\(\) => paintCollectionGrid\(collectionCache\.acc, collectionCache\.players\), 150\)/);
  assert.doesNotMatch(input[1], /paintCollectionGrid\(collectionCache\.acc, collectionCache\.players\);\n\}\);/);
});

test("S-P1-2: grid renders one page and offers load-more with the remaining count", () => {
  const src = appJs();
  assert.match(src, /const COLLECTION_PAGE_SIZE = 50;/);
  assert.match(src, /const page = view\.slice\(0, collectionShown\);/);
  assert.match(src, /grid\.innerHTML = page\.length/);
  assert.match(src, /const rest = view\.length - collectionShown;/);
  assert.match(src, /data-cf-more/);
  assert.match(src, /加载更多（还剩 \$\{rest\} 张）/);
  // Count keeps its old meaning: filtered / owned, not shown / owned.
  assert.match(src, /`显示 \$\{view\.length\}\/\$\{players\.length\} 张`/);
  const more = src.match(/#collection-more"\)\?\.\s*addEventListener\("click", \(event\) => \{([\s\S]*?)\n\}\);/);
  assert.ok(more, "collection-more click listener missing");
  assert.match(more[1], /collectionShown \+= COLLECTION_PAGE_SIZE;/);
  assert.match(read("index.html"), /<div id="collection-more"/);
});

test("S-P1-2: filter changes reset to the first page", () => {
  const src = appJs();
  // input (debounced), clear button and select/checkbox change all reset.
  const resets = src.match(/collectionShown = COLLECTION_PAGE_SIZE;/g) ?? [];
  assert.ok(resets.length >= 4, `expected >= 4 resets (open + input + clear + change), got ${resets.length}`);
  assert.match(src, /collectionCache = \{ acc, players \};\n    collectionShown = COLLECTION_PAGE_SIZE;/);
});

test("S-P1-2: collectionContext is cached per (acc, players) pair, not rebuilt per paint", () => {
  const src = appJs();
  assert.match(src, /let collectionContextMemo = null;/);
  assert.match(
    src,
    /if \(!collectionContextMemo \|\| collectionContextMemo\.acc !== acc \|\| collectionContextMemo\.players !== players\) \{\n    collectionContextMemo = \{ acc, players, ctx: collectionContext\(acc, players, ovrOf\), ovrOf \};/
  );
  assert.match(src, /function collectionContext\(acc, players, ovrOf = overall\)/);
  assert.match(src, /redundant: redundantIds\(players, ovrOf\)/);
});

test("S-P2-4: openCollection sorts on one cached overall() per card", () => {
  const src = appJs();
  assert.match(src, /const ovrOf = cachedOvrOf\(overall\);/);
  assert.match(src, /sort\(\(a, b\) => ovrOf\(b\) - ovrOf\(a\)\)/);
  assert.match(src, /import \{[^}]*cachedOvrOf[^}]*\} from "\.\/ui\/collectionFilter\.js";/);
});
