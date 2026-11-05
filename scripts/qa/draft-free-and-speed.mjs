// Browser QA: Draft Team picks are free (no fake prices), refreshing is the only gold sink, and the match
// speed button works for one human vs the CPU.
//   1. Draft Team shows NO "¤price" on a player card, says "选人免费", and picking a player leaves the gold alone.
//   2. Refresh economy is unchanged: the first DRAFT_FREE_REFRESHES refreshes are free, the next one costs gold.
//   3. After the draft, the live game shows the speed button and it cycles x1 -> x2 -> x3 -> x1; the full-game
//      quick simulation is still there next to it (speed-up and quick sim are different things).
//   4. Duel (two humans, real purchases) still shows prices and the gold label: the change is Draft Team only.
//   5. English mode leaks no Chinese into the new gold label / hint.
// Duel's LOCK itself is covered by tests/playbackSpeed.test.js, not here: reaching a Duel match takes a full
// 16-pick bidding draft plus a market round.
// Usage: node scripts/qa/draft-free-and-speed.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive, noOverflow } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/draft-free-and-speed";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const CJK = /[\u4e00-\u9fff]/;
const browser = await chromium.launch({ executablePath: EXE });

async function freshHome(width, height, lang = "zh") {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("courtside.lang", l); }, lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  return { page, errors };
}

const openDraft = async (page, selector) => {
  await page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
  await page.waitForSelector("#screen-draft.active", { timeout: 15000 });
  await page.waitForSelector("#pack-cards .player-card", { timeout: 15000 });
};
const gold = (page) => page.evaluate(() => Number(document.querySelector("#draft-gold")?.textContent));
/** My turn again: the refresh button is enabled and a pack is on the table. */
const myTurn = (page) => page.waitForFunction(() => {
  const b = document.querySelector("#btn-refresh-pack");
  return b && !b.disabled && document.querySelectorAll("#pack-cards button").length > 0;
}, null, { timeout: 15000 });

for (const [width, height, size] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const tag = `[${size}]`;
  const { page, errors } = await freshHome(width, height);
  await openDraft(page, '.mode-card[data-mode="draft"]');

  // 1. no fake prices, honest wording
  const cardMetas = await page.$$eval("#pack-cards .player-card .meta", (n) => n.map((e) => e.textContent));
  check(`${tag} the pack shows player cards (not vacuous)`, cardMetas.length >= 2, `${cardMetas.length} metas`);
  check(`${tag} no player card carries a ¤ price`, cardMetas.every((t) => !t.includes("¤")), cardMetas.filter((t) => t.includes("¤")).slice(0, 2).join(" | "));
  const salaryLines = await page.$$eval("#pack-cards .player-card", (n) => n.filter((e) => /估年薪|Est\. salary/.test(e.textContent)).length);
  check(`${tag} no card carries an "est. salary" line (Draft Team has no salaries)`, salaryLines === 0, `${salaryLines} cards`);
  check(`${tag} no "买不起" chip on any card`, (await page.$$eval("#pack-cards .chip.warn", (n) => n.filter((e) => e.textContent.includes("买不起")).length)) === 0);
  const label = await page.$eval("#draft-money-label", (e) => e.textContent.replace(/\s+/g, " ").trim());
  check(`${tag} the gold line says picks are free and what the gold is for`, /选人免费/.test(label) && /刷新/.test(label), label);
  const hint = await page.$eval("#pack-hint", (e) => e.textContent);
  check(`${tag} the pack hint says picking costs nothing and refreshing may`, /选人不花钱/.test(hint) && /刷新/.test(hint) && /金币/.test(hint), hint);

  // picking a player leaves the gold alone
  const gold0 = await gold(page);
  await page.evaluate(() => document.querySelector("#pack-cards .player-card:not([disabled])")?.click());
  await page.waitForTimeout(500);
  await myTurn(page);
  check(`${tag} picking a player costs no gold`, (await gold(page)) === gold0, `${gold0} -> ${await gold(page)}`);

  // 2. refresh economy unchanged: 3 free, then gold
  const labels = [];
  for (let i = 0; i < 3; i++) {
    labels.push((await page.textContent("#btn-refresh-pack")).trim());
    await page.click("#btn-refresh-pack");
    await myTurn(page);
  }
  check(`${tag} the first three refreshes are free and counted down`, labels.join(" | ") === "刷新列表（免费 3） | 刷新列表（免费 2） | 刷新列表（免费 1）", labels.join(" | "));
  check(`${tag} three free refreshes cost no gold`, (await gold(page)) === gold0, `${gold0} -> ${await gold(page)}`);
  const paidLabel = (await page.textContent("#btn-refresh-pack")).trim();
  const paidCost = Number(paidLabel.match(/¤(\d+)/)?.[1]);
  check(`${tag} the fourth refresh shows its gold cost`, paidCost > 0, paidLabel);
  await page.click("#btn-refresh-pack");
  await myTurn(page);
  check(`${tag} and takes exactly that gold`, (await gold(page)) === gold0 - paidCost, `${gold0} - ${paidCost} -> ${await gold(page)}`);
  check(`${tag} the label's cost matches the gold line's cost`, label.includes(`¤${paidCost}`), `${paidCost} in "${label}"`);
  check(`${tag} no horizontal overflow on the draft screen`, await noOverflow(page));
  await page.screenshot({ path: `${OUT}/${size}-draft.png` });

  // finish the draft, then play
  // wait for my turn before every click (the CPU picks in between), instead of clicking into the CPU's turn
  let lastSeen = "";
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => !document.querySelector("#btn-start-game").disabled)) break;
    await myTurn(page).catch(() => {});
    lastSeen = await page.evaluate(() => `${document.querySelector("#btn-refresh-pack")?.textContent} | left ${document.querySelector("#draft-left")?.textContent} | buttons ${document.querySelectorAll("#pack-cards button").length}/${document.querySelectorAll("#pack-cards button:not([disabled])").length}`);
    await page.evaluate(() => document.querySelector("#pack-cards button:not([disabled])")?.click());
    await page.waitForTimeout(450);
  }
  const ready = await page.evaluate(() => !document.querySelector("#btn-start-game").disabled);
  check(`${tag} the draft can be finished`, ready, ready ? "" : lastSeen);
  if (ready) {
    await page.click("#btn-start-game");
    await page.waitForSelector("#screen-setup.active", { timeout: 15000 });
    await page.click("#btn-setup-confirm");
    await page.waitForSelector("#screen-game.active", { timeout: 15000 });
    const speedState = () => page.evaluate(() => {
      const b = document.querySelector("#btn-speed");
      return { shown: !!b && !b.hidden && b.getClientRects().length > 0, text: b?.textContent.trim() };
    });
    const s1 = await speedState();
    check(`${tag} the speed button is shown in a Draft Team match`, s1.shown, s1.text);
    const seen = [s1.text];
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.querySelector("#btn-speed")?.click());
      seen.push((await speedState()).text);
    }
    check(`${tag} it cycles x1 -> x2 -> x3 -> x1`, /x1/.test(seen[0]) && /x2/.test(seen[1]) && /x3/.test(seen[2]) && /x1/.test(seen[3]), seen.join(" | "));
    const quick = await page.evaluate(() => { const b = document.querySelector("#btn-quick-sim"); return !!b && !b.hidden && b.getClientRects().length > 0; });
    check(`${tag} the full-game quick simulation is still offered next to it`, quick);
    check(`${tag} no horizontal overflow in the match`, await noOverflow(page));
    await page.screenshot({ path: `${OUT}/${size}-game.png` });
  }
  check(`${tag} no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

// 4. Duel keeps real prices
{
  const { page, errors } = await freshHome(1280, 800);
  await openDraft(page, "#btn-custom-duel");
  // the first .meta line carries the price; the second (.tiny) is the salary estimate
  const metas = await page.$$eval("#pack-cards .player-card .meta:not(.tiny)", (n) => n.map((e) => e.textContent));
  const duelSalary = await page.$$eval("#pack-cards .player-card .meta.tiny", (n) => n.filter((e) => /估年薪/.test(e.textContent)).length);
  check("[duel] the salary estimate is still shown (money matters there)", duelSalary >= 2, `${duelSalary} cards`);
  check("[duel] cards still show a ¤ price (Duel really charges)", metas.length >= 2 && metas.every((t) => /¤\d+/.test(t)), metas.slice(0, 2).join(" | "));
  const label = await page.$eval("#draft-money-label", (e) => e.textContent.trim());
  check("[duel] the gold line is the plain 金币 balance", /^金币：\d+/.test(label), label);
  check("[duel] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// 5. English
{
  const { page, errors } = await freshHome(1280, 800, "en");
  await openDraft(page, '.mode-card[data-mode="draft"]');
  const label = await page.$eval("#draft-money-label", (e) => e.textContent.replace(/\s+/g, " ").trim());
  const hint = await page.$eval("#pack-hint", (e) => e.textContent.trim());
  check("[en] the gold line says picks are free", /Picks are free/.test(label), label);
  check("[en] the gold line and the hint contain no Chinese", !CJK.test(label + hint), `${label} | ${hint}`);
  check("[en] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.txt`, `${report.join("\n")}\n`);
console.log(report.join("\n"));
const failed = report.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
if (failed) process.exit(1);
