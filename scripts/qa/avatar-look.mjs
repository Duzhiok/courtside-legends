// My World "My look" (ADR-008a N-1f step 2+3), end to end in a real browser: lazy 3D load, real recolouring (measured
// from pixels), persistence for guest and account, isolation between accounts, and the fallback paths.
// Usage: node scripts/qa/avatar-look.mjs /tmp/cls-qa/look [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/look";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const heavy = (u) => /three-avatar|\.glb/.test(u);
const scratch = await browser.newPage();

/** Count pixels in a PNG buffer whose colour matches `rule` (a function body over r,g,b). */
const countPixels = (buf, rule) => scratch.evaluate(async ([b64, body]) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const test = new Function("r", "g", "b", body);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++;
  return n;
}, [buf.toString("base64"), rule]);
const ORANGE = "return r > 150 && r > g * 1.8 && g > b * 2.2;"; // #e85d04 under lighting
const stageShot = (page, name) => page.locator("#mw-look-stage").screenshot({ path: `${OUT}/${name}.png` });
const openPanel = async (page) => {
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForFunction(() => document.querySelector("#mw-look-stage canvas[data-look]") || /3D|can't be shown/.test(document.querySelector("#mw-look-status")?.textContent || ""), null, { timeout: 12000 });
};
const pick = (page, group, id) => page.click(`.mw-swatch:has(input[name="mw-look-${group}"][value="${id}"])`);
const lookOf = (page) => page.$eval("#mw-look-stage canvas", (c) => JSON.parse(c.dataset.look)).catch(() => null);
const checkedLook = (page) => page.evaluate(() => Object.fromEntries(["skin", "hair", "outfit", "style"].map((g) => [g, document.querySelector(`input[name="mw-look-${g}"]:checked`)?.value])));
const fresh = async (viewport, { noWebgl = false, blockModel = false, lang = null } = {}) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  if (noWebgl) await page.addInitScript(() => { const real = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : real.call(this, t, ...a); }; });
  if (blockModel) await page.route("**/man.glb", (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => { localStorage.clear(); if (l) localStorage.setItem("courtside.lang", "en"); }, lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="world"]');
  return { page, errors, requests };
};

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  // A. lazy load + real recolour + guest persistence
  const { page, errors, requests } = await fresh({ width: w, height: h });
  check(`[${tag}] opening My World alone loads no 3D library or model`, !requests.some(heavy));
  check(`[${tag}] panel is closed by default`, !(await page.$eval("#mw-look", (el) => !el.hidden)));
  await openPanel(page);
  check(`[${tag}] opening the panel loads the library + model`, requests.some((u) => /three-avatar/.test(u)) && requests.some((u) => /\.glb/.test(u)));
  check(`[${tag}] a canvas is mounted and the static fallback is hidden`, (await page.locator("#mw-look-stage canvas").count()) === 1 && (await page.$eval(".mw-look-static", (el) => el.hidden)));
  check(`[${tag}] default look is painted`, JSON.stringify(await lookOf(page)) === JSON.stringify({ skin: "warm", hair: "black", outfit: "forest", style: "short" }));
  const before = await countPixels(await stageShot(page, `${tag}-default`).then(() => page.locator("#mw-look-stage").screenshot()), ORANGE);
  // hairstyle: the red hair is only visible while the hair mesh is shown
  const RED_HAIR = "return r > 110 && r < 200 && r > g * 2 && g > b * 1.2;";
  await pick(page, "hair", "red");
  await page.waitForTimeout(250);
  const withHair = await countPixels(await page.locator("#mw-look-stage").screenshot(), RED_HAIR);
  await pick(page, "style", "shaved");
  await page.waitForTimeout(250);
  const shavedBuf = await page.locator("#mw-look-stage").screenshot({ path: `${OUT}/${tag}-shaved.png` });
  const shaved = await countPixels(shavedBuf, RED_HAIR);
  check(`[${tag}] shaved style really hides the hair`, withHair > 40 && shaved < withHair / 3, `${withHair} -> ${shaved} red-hair pixels`);
  check(`[${tag}] the shaved style is what is painted and saved`, (await lookOf(page)).style === "shaved" && (await page.evaluate(() => localStorage.getItem("cls_guest_avatar_v1"))).includes('"style":"shaved"'));
  await pick(page, "style", "short");
  await pick(page, "outfit", "orange");
  await page.waitForTimeout(300);
  const afterBuf = await page.locator("#mw-look-stage").screenshot({ path: `${OUT}/${tag}-orange.png` });
  const after = await countPixels(afterBuf, ORANGE);
  check(`[${tag}] picking the orange outfit really recolours the figure`, after > before + 300, `${before} -> ${after} orange pixels`);
  check(`[${tag}] the painted look matches the picks`, JSON.stringify(await lookOf(page)) === JSON.stringify({ skin: "warm", hair: "red", outfit: "orange", style: "short" }));
  check(`[${tag}] guest look saved to the one guest key`, (await page.evaluate(() => localStorage.getItem("cls_guest_avatar_v1"))) === JSON.stringify({ skin: "warm", hair: "red", outfit: "orange", style: "short" }));
  check(`[${tag}] swatch targets are at least 36px`, await page.$$eval(".mw-swatch", (els) => els.every((e) => e.getBoundingClientRect().height >= 36 && e.getBoundingClientRect().width >= 36)));
  check(`[${tag}] no horizontal overflow with the panel open`, await noOverflow(page));
  check(`[${tag}] swatches reachable by keyboard`, await (async () => { await page.focus('input[name="mw-look-skin"]:checked'); await page.keyboard.press("ArrowRight"); return (await checkedLook(page)).skin !== "warm"; })());
  await page.keyboard.press("ArrowLeft");
  // B. reload keeps it; closing frees the canvas
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="world"]');
  await openPanel(page);
  check(`[${tag}] after a reload the picks are still selected`, JSON.stringify(await checkedLook(page)) === JSON.stringify({ skin: "warm", hair: "red", outfit: "orange", style: "short" }));
  check(`[${tag}] after a reload the figure is painted with them`, JSON.stringify(await lookOf(page)) === JSON.stringify({ skin: "warm", hair: "red", outfit: "orange", style: "short" }));
  await page.click('[data-mw-action="toggle-look"]');
  check(`[${tag}] closing the panel removes the canvas and restores the static avatar`, (await page.locator("#mw-look-stage canvas").count()) === 0 && !(await page.$eval(".mw-look-static", (el) => el.hidden)));
  // C. accounts, switched through the REAL account picker (a direct storage call would not refresh the page)
  const ids = await page.evaluate(async () => {
    const a = await import("/js/data/account.js");
    const x = a.createAccount("Alpha");
    const y = a.createAccount("Bravo");
    for (const acct of [x, y]) { acct.onboardingDone = true; a.saveAccount(acct); }
    return { x: x.id, y: y.id };
  });
  const switchTo = async (id) => {
    if (await page.$eval("#profile-panel", (el) => el.hidden)) await page.click("#btn-profile-toggle");
    await page.click("#btn-switch-account");
    await page.click(`[data-acc-login="${id}"]`);
    await homeActive(page);
    await page.click('.home-tab[data-category="world"]');
  };
  await switchTo(ids.x);
  check(`[${tag}] signed in as Alpha through the picker`, (await page.$eval("#mw-identity-title", (e) => e.textContent)) === "Alpha");
  await openPanel(page);
  check(`[${tag}] a new account starts from the default look, not the guest's`, JSON.stringify(await checkedLook(page)) === JSON.stringify({ skin: "warm", hair: "black", outfit: "forest", style: "short" }));
  check(`[${tag}] ...and the figure is painted with the default look`, JSON.stringify(await lookOf(page)) === JSON.stringify({ skin: "warm", hair: "black", outfit: "forest", style: "short" }));
  await pick(page, "outfit", "royal");
  await pick(page, "skin", "deep");
  const stored = await page.evaluate(async (id) => (await import("/js/data/account.js")).getAccount(id).avatar, ids.x);
  check(`[${tag}] the look is saved on the account`, JSON.stringify(stored) === JSON.stringify({ skin: "deep", hair: "black", outfit: "royal", style: "short" }));
  check(`[${tag}] the guest key was not touched by the account's picks`, (await page.evaluate(() => localStorage.getItem("cls_guest_avatar_v1"))) === JSON.stringify({ skin: "warm", hair: "red", outfit: "orange", style: "short" }));
  await switchTo(ids.y);
  check(`[${tag}] switched to Bravo`, (await page.$eval("#mw-identity-title", (e) => e.textContent)) === "Bravo");
  check(`[${tag}] the panel closed and the previous viewer was freed on the switch`, (await page.locator("#mw-look-stage canvas").count()) === 0);
  await openPanel(page);
  check(`[${tag}] Bravo sees the default look, not Alpha's`, JSON.stringify(await checkedLook(page)) === JSON.stringify({ skin: "warm", hair: "black", outfit: "forest", style: "short" }) && JSON.stringify(await lookOf(page)) === JSON.stringify({ skin: "warm", hair: "black", outfit: "forest", style: "short" }));
  await switchTo(ids.x);
  await openPanel(page);
  check(`[${tag}] back on Alpha the saved look returns in both swatches and figure`, JSON.stringify(await checkedLook(page)) === JSON.stringify({ skin: "deep", hair: "black", outfit: "royal", style: "short" }) && JSON.stringify(await lookOf(page)) === JSON.stringify({ skin: "deep", hair: "black", outfit: "royal", style: "short" }));
  await page.screenshot({ path: `${OUT}/${tag}-page.png`, fullPage: true });
  check(`[${tag}] no page errors`, !errors.length, errors.join(" | ").slice(0, 160));
  await page.close();

  // D. no WebGL: the panel still works and still saves; nothing heavy is fetched
  const nogl = await fresh({ width: w, height: h }, { noWebgl: true });
  await openPanel(nogl.page);
  check(`[${tag}] no WebGL: honest message, static avatar stays`, /3D/.test(await nogl.page.$eval("#mw-look-status", (e) => e.textContent)) && !(await nogl.page.$eval(".mw-look-static", (e) => e.hidden)));
  check(`[${tag}] no WebGL: no library or model downloaded`, !nogl.requests.some(heavy));
  await pick(nogl.page, "hair", "gray");
  check(`[${tag}] no WebGL: the look still saves`, (await nogl.page.evaluate(() => localStorage.getItem("cls_guest_avatar_v1"))).includes('"hair":"gray"'));
  await nogl.page.close();

  // E. model fails to load: same fallback, no stray canvas
  const bad = await fresh({ width: w, height: h }, { blockModel: true });
  await openPanel(bad.page);
  check(`[${tag}] model 404: message + static avatar, no leftover canvas`, (await bad.page.locator("#mw-look-stage canvas").count()) === 0 && !(await bad.page.$eval(".mw-look-static", (e) => e.hidden)));
  await bad.page.close();
}

// F. English: no Chinese in the panel
const en = await fresh({ width: 1280, height: 800 }, { lang: "en" });
await en.page.click('[data-mw-action="toggle-look"]');
const enText = await en.page.$eval("#mw-look", (el) => el.textContent.replace(/\s+/g, " "));
check("[en] My look panel has no Chinese", !CJK.test(enText), enText.slice(0, 80));
await en.page.close();

await browser.close();
console.log(out.join("\n"));
console.log(`${out.filter((l) => l.startsWith("PASS")).length}/${out.length} passed`);
