// Scout pack in the two-player duel market (real browser): A and B get an explicit buy button each, only the buyer is
// charged (exactly once, even when both could pay), and the report is announced as "X paid, visible to both".
// Usage: node scripts/qa/scout-pack-duel.mjs /tmp/cls-qa/scout [http://127.0.0.1:5187/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/scout";
const BASE = process.argv[3] || "http://127.0.0.1:5187/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const skipped = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const gold = async (page) => {
  const m = (await text(page, "#gold-amt")).match(/A\s*(\d+)\s*\/\s*B\s*(\d+)/);
  return m ? { a: +m[1], b: +m[2] } : null;
};
// A fixed-seed Math.random, so a given seed always rolls the same pack, shop and draft.
const seeded = (seed) => `(() => { let a = ${seed} >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

/** Draft a duel to the market with real clicks; returns true when the market shows a scout pack. */
async function reachDuelMarket(page, seed) {
  await page.addInitScript(seeded(seed));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="custom"]');
  await page.click("#btn-custom-duel");
  await page.waitForSelector("#screen-draft.active");
  // Coaches/assistants first (each side needs both), then the cheapest player we can afford; refresh when nothing fits.
  for (let i = 0; i < 160; i += 1) {
    if (!(await page.$eval("#btn-start-game", (b) => b.disabled))) break;
    const budget = Number(await text(page, "#draft-gold"));
    // Only take staff while the side on the clock still lacks a coach or assistant (a spare staff card stays in the pack).
    const side = /B/.test(await text(page, "#draft-turn")) ? "b" : "a";
    const needStaff = /未选/.test(`${await text(page, `#coach-${side}`)} ${await text(page, `#asst-${side}`)}`);
    const staff = needStaff ? await page.$("#pack-cards .coach-card:not([disabled])") : null;
    if (staff) {
      await staff.click();
    } else {
      const prices = await page.$$eval("#pack-cards .player-card:not([disabled])", (els) => els.map((e, k) => [k, Number((e.textContent.match(/¤(\d+)/) || [])[1] || 1e9)]));
      const [idx, price] = prices.sort((x, y) => x[1] - y[1])[0] || [-1, 1e9];
      if (idx >= 0 && price <= budget) await (await page.$$("#pack-cards .player-card:not([disabled])"))[idx].click();
      else await page.click("#btn-refresh-pack").catch(() => {});
    }
    await page.waitForTimeout(30);
  }
  if (await page.$eval("#btn-start-game", (b) => b.disabled)) { if (process.env.QA_VERBOSE) console.log(`seed ${seed}: draft did not finish`); return false; }
  await page.click("#btn-start-game");
  await page.waitForSelector("#screen-market.active");
  // The interesting case is a pack BOTH sides can pay for: that is where the old code charged twice.
  const buyable = await page.$$eval("#scout-pack-offer [data-scout-buyer]", (els) => els.filter((e) => !e.disabled).length);
  const hasPack = buyable === 2;
  if (process.env.QA_VERBOSE) console.log(`seed ${seed}: market reached, pack buyable by ${buyable} side(s)`);
  return hasPack;
}

for (const [w, h, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const L = (s) => `[${tag}] ${s}`;
  let page = null;
  let found = null;
  for (let seed = 1; seed <= 14 && !found; seed += 1) {
    page = await browser.newPage({ viewport: { width: w, height: h } });
    page.setDefaultTimeout(8000);
    try {
      if (await reachDuelMarket(page, seed)) found = seed;
    } catch (e) {
      skipped.push(`seed ${seed}: ${String(e.message).split("\n")[0]}`);
    }
    if (!found) await page.close();
  }
  check(L("a seed reaches a duel market with a scout pack"), !!found, `seed ${found}`);
  if (!found) continue;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());

  const before = await gold(page);
  const cost = Number((await text(page, '#scout-pack-offer [data-scout-buyer="A"]')).match(/¤(\d+)/)?.[1]);
  const btns = await page.$$eval("#scout-pack-offer [data-scout-buyer]", (els) => els.map((e) => ({ side: e.dataset.scoutBuyer, h: Math.round(e.getBoundingClientRect().height), disabled: e.disabled, label: e.textContent.trim() })));
  check(L("two explicit buyer buttons (A and B), no anonymous buy button"), btns.map((b) => b.side).join() === "A,B" && !(await page.$("#btn-buy-scout-pack")), JSON.stringify(btns));
  check(L("both buyer buttons are 44px touch targets"), btns.every((b) => b.h >= 44), btns.map((b) => b.h).join());
  check(L("both sides can afford it here (the case that used to charge twice)"), before.a >= cost && before.b >= cost, JSON.stringify({ before, cost }));
  check(L("the offer says who pays and who sees the report"), /谁点谁付费，双方都能看到/.test(await text(page, "#scout-pack-offer")));
  check(L("no horizontal overflow with the two buttons"), await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-offer.png`);

  await page.click('#scout-pack-offer [data-scout-buyer="B"]');
  await page.waitForTimeout(200);
  const after = await gold(page);
  check(L("only B was charged, exactly once"), after.a === before.a && after.b === before.b - cost, JSON.stringify({ before, after, cost }));
  const note = await text(page, "#scout-pack-offer");
  check(L("the pack is announced as paid by B and visible to both"), /B 方付费，双方可见/.test(note) && !(await page.$("#scout-pack-offer [data-scout-buyer]")), note);
  check(L("the market now shows the active-scout note instead of the buy card"), !!(await page.$("#scout-pack-offer .scout-pack-active")) && !(await page.$("#scout-pack-offer .scout-pack-card")));
  check(L("zh only (no stray English words in the pack line)"), CJK.test(note) && !/undefined|NaN/.test(note));
  await shoot(page, `${OUT}/${tag}-bought.png`);
  check(L("no page errors"), errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
const failed = out.filter((l) => l.startsWith("FAIL"));
console.log(out.join("\n"));
if (skipped.length) console.log(`(skipped seeds: ${skipped.join("; ")})`);
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
