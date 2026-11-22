// Browser smoke for the pick-and-roll roles panel on the Gold tactics board (tactics-pnr-roles-design.md).
// Real flow: Gold Challenge -> market -> setup. Handler + "pick and roll" opens the panel; choosing writes nothing until Apply; Apply is
// saved with the career; "start" carries the roles into the live game; nothing is written when the coach changed nothing. Desktop + 390px.
// Usage: node scripts/qa/gold-pnr-roles.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/gold-pnr-roles";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };
const B = "#setup-tactics-board";
const savedHas = (page, needle) => page.evaluate((n) => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || "").includes(n)), needle);

async function toSetup(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#screen-market.active", { timeout: 20000 });
  await page.waitForSelector("#btn-market-done", { state: "visible", timeout: 20000 });
  await page.click("#btn-market-done");
  await page.waitForSelector("#screen-setup.active", { timeout: 20000 });
  await page.waitForSelector(`${B} .tb`, { timeout: 10000 });
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await toSetup(page);

  check(`[${tag}] no roles panel before a handler plays the pick and roll`, (await page.$(`${B} .tb-pnr`)) === null);
  const handlerId = await page.$eval(`${B} [data-tb="handler"]`, (b) => b.dataset.id);
  await page.click(`${B} [data-tb="handler"][data-id="${handlerId}"]`);
  await page.click(`${B} [data-tb="action"][data-id="pnr"]`);
  await page.waitForSelector(`${B} .tb-pnr`, { timeout: 5000 });
  check(`[${tag}] the roles panel opens for the pick and roll`, true);
  const groups = await page.$$eval(`${B} .tb-pnr-h`, (h) => h.map((x) => x.textContent.trim()));
  check(`[${tag}] four groups: screener / after / the rest / finish`, groups.length === 4, groups.join(" | "));
  const pressed = (sel) => page.$$eval(`${B} ${sel}[aria-pressed="true"]`, (b) => b.length);
  check(`[${tag}] exactly one screener and one after-screen are shown selected`, (await pressed('[data-tb="pnr-screener"]')) === 1 && (await pressed('[data-tb="pnr-after"]')) === 1);
  check(`[${tag}] slip and ghost carry a risk badge`, (await page.$$eval(`${B} .tb-badge-risk`, (b) => b.length)) === 2);
  check(`[${tag}] the three other men each have spot / cut`, (await page.$$eval(`${B} .tb-pnr-man`, (r) => r.length)) === 3);
  await page.click(`${B} [data-tb="apply"]`); // apply the handler + action first, then look at "nothing chosen = nothing written"
  await page.waitForTimeout(300);
  check(`[${tag}] choosing nothing writes no roles`, !(await savedHas(page, '"afterScreen"')));
  await shoot(page, `${OUT}/${tag}-panel-default.png`);

  await page.click(`${B} [data-tb="pnr-after"][data-id="slip"]`);
  const hint = await page.textContent(`${B} .tb-pnr-hint`);
  check(`[${tag}] the cost of a slipped screen is written next to the choice`, /掩护|screen/i.test(hint) && /加成|bonus/i.test(hint), hint);
  const offId = await page.$eval(`${B} [data-tb="pnr-off"]`, (b) => b.dataset.id);
  await page.click(`${B} [data-tb="pnr-off"][data-id="${offId}"][data-val="cut"]`);
  await page.click(`${B} [data-tb="pnr-finish"][data-id="fake_kick"]`);
  check(`[${tag}] choices are marked changed`, (await page.$$eval(`${B} .tb-badge-set`, (b) => b.length)) >= 2);
  check(`[${tag}] choosing writes nothing until Apply`, !(await savedHas(page, '"afterScreen":"slip"')));
  await shoot(page, `${OUT}/${tag}-panel-chosen.png`);
  await page.locator(`${B} .tb-pnr`).screenshot({ path: `${OUT}/${tag}-panel-only.png` });
  const small = await page.$$eval(`${B} .tb-pnr button`, (b) => b.filter((x) => x.getBoundingClientRect().height < 44).length);
  check(`[${tag}] every panel button is at least 44px tall`, small === 0, `${small} too short`);
  check(`[${tag}] no horizontal overflow with the panel open`, await noOverflow(page));

  await page.click(`${B} [data-tb="apply"]`);
  await page.waitForTimeout(400);
  check(`[${tag}] Apply saves the roles with the career`, await savedHas(page, '"afterScreen":"slip"'));
  check(`[${tag}] after Apply the board is clean`, await page.$eval(`${B} [data-tb="apply"]`, (b) => b.disabled));

  // The old tip-off handler rebuilds the gameplan: it must carry the roles into the game.
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 20000 });
  await page.waitForTimeout(2500);
  check(`[${tag}] the roles survive the tip-off handler (still in the career save)`, await savedHas(page, '"afterScreen":"slip"'));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
