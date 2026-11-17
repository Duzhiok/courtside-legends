// 2D avatar smoke in a real browser: the renderer on PLACEHOLDER art (?avatar=2d-proto, engineering checks) and the real Style A
// art (?avatar=2d, section 4; screenshots for the user's visual review, not a self-declared acceptance). Usage: node scripts/qa/avatar-2d-proto.mjs [http://127.0.0.1:5173/] [/tmp/cls-qa/avatar2d]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "/tmp/cls-qa/avatar2d";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const res = [];
const check = (label, ok, detail = "") => res.push(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);

const FORMS = { A: { skin: "warm", hair: "black", outfit: "forest", style: "short" }, B: { skin: "deep", hair: "blond", outfit: "royal", style: "shaved" } };

/** Fresh account with `look`, then open My World with `query` (e.g. "?avatar=2d-proto"). */
async function open(query, look, viewport, shot, { waitFor = "#mw-showcase-stage canvas" } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (l) => {
    const acc = await import("/js/data/account.js");
    acc.createAccount("John");
    (await import("/js/data/avatarLook.js")).saveLook(acc.getAccount(), l);
  }, look);
  await page.goto(BASE + query, { waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 25000 });
  await page.waitForTimeout(800);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}.png` });
  return { page, errors };
}
const state = (page) => page.evaluate(() => {
  const c = document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas");
  const bar = document.querySelector(".mw-showcase-bar");
  return {
    renderer: document.querySelector("#my-world-root")?.dataset.avatarRenderer || null,
    look: c ? JSON.parse(c.dataset.look) : null,
    layers: c?.dataset.layers || "",
    staticHidden: document.querySelector(".mw-showcase-static")?.hidden,
    barVisible: !!bar && getComputedStyle(bar).display !== "none",
    box: c ? [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)] : null,
  };
});

// 1. both viewports x two distinct looks
for (const [viewport, vt] of [[{ width: 1440, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobile"]]) {
  for (const [name, look] of Object.entries(FORMS)) {
    const { page, errors } = await open("?avatar=2d-proto", look, viewport, `2d-${vt}-${name}`, { waitFor: "#mw-showcase-stage canvas.avatar2d-canvas" });
    const s = await state(page);
    const tag = `[${vt}/${name}]`;
    check(`${tag} 2D figure mounted, static fallback hidden`, s.staticHidden === true, s.box?.join("x"));
    check(`${tag} draws the saved look`, s.look?.skin === look.skin && s.look?.style === look.style && s.look?.outfit === look.outfit);
    check(`${tag} Shaved => no hair layers; short => hair layers`, look.style === "shaved" ? !/hair_/.test(s.layers) : /hair_front/.test(s.layers), s.layers);
    check(`${tag} 3D-only showcase controls (style switch, rotate hint) are hidden`, s.renderer === "2d" && s.barVisible === false);
    check(`${tag} no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}

// 2. editor live repaint, 2D-only wording, portrait persistence across reload and across 3D/2D
{
  const { page, errors } = await open("?avatar=2d-proto", FORMS.B, { width: 1440, height: 900 }, null, { waitFor: "#mw-showcase-stage canvas.avatar2d-canvas" });
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForTimeout(400);
  check("editor: preview-action buttons are hidden in 2D", await page.$eval("[data-mw-avatar-actions]", (e) => getComputedStyle(e).display === "none"));
  await page.click('[data-mw-look-group="skin"] .mw-swatch:nth-of-type(1)');
  await page.waitForTimeout(500);
  check("editor: a swatch repaints the 2D figure immediately", (await state(page)).look?.skin === "light");
  await page.screenshot({ path: `${OUT}/2d-desktop-editor.png` });
  await page.click('[data-mw-action="use-3d-portrait"]');
  await page.waitForTimeout(600);
  const text = await page.$eval('[data-mw-action="use-3d-portrait"]', (b) => b.textContent);
  check("portrait button wording is renderer-neutral in 2D (no '3D')", !/3D/.test(text), text);
  const shown = await page.$eval(".mw-hero .mw-avatar", (i) => ({ head: i.src.slice(0, 22), w: i.naturalWidth }));
  const saved = await page.evaluate(async () => {
    const a = (await import("/js/data/account.js")).getAccount();
    return { portrait: a.avatarPortrait ? { source: a.avatarPortrait.source, chars: a.avatarPortrait.image.length } : null, avatarKeys: Object.keys(a.avatar || {}).sort(), lookKeys: Object.keys((await import("/js/data/avatarLook.js")).DEFAULT_LOOK).sort() };
  });
  check("portrait shown is a 256px JPEG", shown.head === "data:image/jpeg;base64" && shown.w === 256, JSON.stringify(shown));
  check("saved portrait is a raster under the 40,000-char limit, same 'source' the app already knows", saved.portrait?.source === "3d" && saved.portrait.chars > 1000 && saved.portrait.chars < 40000, JSON.stringify(saved.portrait));
  check("account.avatar keeps exactly the 7 existing fields (no new persistent field)", JSON.stringify(saved.avatarKeys) === JSON.stringify(saved.lookKeys), saved.avatarKeys.join(","));
  check("editor flow: no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}
{
  // same account, reload with 2D then with 3D: the portrait and the look survive the renderer switch
  const { page } = await open("?avatar=2d-proto", FORMS.B, { width: 1440, height: 900 }, null, { waitFor: "#mw-showcase-stage canvas.avatar2d-canvas" });
  await page.click('[data-mw-action="toggle-look"]'); await page.waitForTimeout(300);
  await page.click('[data-mw-action="use-3d-portrait"]'); await page.waitForTimeout(600);
  const before = await page.$eval(".mw-hero .mw-avatar", (i) => i.src);
  await page.goto(BASE + "?avatar=3d", { waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#mw-showcase-stage canvas", { timeout: 25000 });
  await page.waitForTimeout(600);
  const after3d = await page.$eval(".mw-hero .mw-avatar", (i) => i.src);
  const look = await page.evaluate(async () => (await import("/js/data/avatarLook.js")).readLook((await import("/js/data/account.js")).getAccount()));
  check("switching to the 3D preview keeps the captured portrait and the saved look", before.startsWith("data:image/jpeg") && after3d === before && look.skin === "deep" && look.style === "shaved");
  await page.close();
}

// 3. purchased / street cosmetics are never rewritten by 2D
{
  const { page, errors } = await open("?avatar=2d-proto", { skin: "tan", hair: "brown", outfit: "street", style: "short", cut: "street" }, { width: 1440, height: 900 }, "2d-desktop-street", { waitFor: "#mw-showcase-stage canvas.avatar2d-canvas" });
  const s = await state(page);
  const saved = await page.evaluate(async () => (await import("/js/data/avatarLook.js")).readLook((await import("/js/data/account.js")).getAccount()));
  check("shop colourway + street cut still draw (jersey cut fallback) and the saved look is untouched", s.look?.outfit === "street" && s.look?.cut === "street" && saved.outfit === "street" && saved.cut === "street", `${s.look?.outfit}/${s.look?.cut}`);
  check("no page errors with the street look", errors.length === 0, errors.join(" | "));
  await page.close();
}

// 4. the real Style A art through ?avatar=2d: every layer file loads (HTTP 200), every layer draws, portrait fits, no errors
const REAL = { short: { skin: "tan", hair: "black", outfit: "forest", style: "short" }, shaved: { skin: "deep", hair: "black", outfit: "royal", style: "shaved" } };
for (const [viewport, vt] of [[{ width: 1440, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobile"]]) {
  for (const [name, look] of Object.entries(REAL)) {
    const page = await browser.newPage({ viewport });
    const errors = []; const art = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => { if (r.url().includes("/assets/avatar2d/")) art.push(r.status()); });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(async (l) => { const acc = await import("/js/data/account.js"); acc.createAccount("John"); (await import("/js/data/avatarLook.js")).saveLook(acc.getAccount(), l); }, look);
    await page.goto(BASE + "?avatar=2d", { waitUntil: "domcontentloaded" });
    await page.click('.home-tab[data-category="world"]');
    await page.waitForSelector("#mw-showcase-stage canvas.avatar2d-canvas", { timeout: 25000 });
    await page.waitForTimeout(900);
    const st = await state(page);
    const want = name === "shaved" ? 8 : 10;
    const tag = `[real art ${vt}/${name}]`;
    check(`${tag} all ${want} layers drawn from real files, all HTTP 200`, st.layers.split(",").length === want && art.length === want && art.every((c) => c === 200), `${st.layers} | http ${art.join(",")}`);
    check(`${tag} draws the saved look; 3D-only controls hidden`, st.look?.skin === look.skin && st.look?.outfit === look.outfit && st.look?.style === look.style && st.barVisible === false);
    await page.locator("#mw-showcase-stage").screenshot({ path: `${OUT}/real-${vt}-${name}-stage.png` });
    await page.screenshot({ path: `${OUT}/real-${vt}-${name}-page.png` });
    if (vt === "desktop") {
      await page.click('[data-mw-action="toggle-look"]'); await page.waitForTimeout(300);
      await page.click('[data-mw-action="use-3d-portrait"]'); await page.waitForTimeout(700);
      const p = await page.evaluate(async () => (await import("/js/data/account.js")).getAccount().avatarPortrait);
      const w = await page.$eval(".mw-hero .mw-avatar", (img) => img.naturalWidth);
      check(`${tag} portrait: 256px JPEG under 40,000 chars`, p?.image?.startsWith("data:image/jpeg") && w === 256 && p.image.length < 40000, `${p?.image?.length} chars`);
      if (p?.image) writeFileSync(`${OUT}/real-portrait-${name}-256.jpg`, Buffer.from(p.image.split(",")[1], "base64"));
    }
    check(`${tag} no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}

// 5. default stays 3D with its controls
{
  const { page, errors } = await open("", FORMS.A, { width: 1440, height: 900 }, "3d-default-desktop");
  const s = await page.evaluate(() => ({ twoD: !!document.querySelector("canvas.avatar2d-canvas"), threeD: !!document.querySelector("#mw-showcase-stage canvas"), renderer: document.querySelector("#my-world-root")?.dataset.avatarRenderer, bar: getComputedStyle(document.querySelector(".mw-showcase-bar")).display }));
  const label = await page.$eval('[data-mw-action="use-3d-portrait"]', (b) => b.textContent);
  check("default: 3D figure, its style switch and rotate hint visible, original button wording", !s.twoD && s.threeD && s.renderer === "3d" && s.bar !== "none" && /3D/.test(label), label);
  check("default: no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(res.join("\n"));
console.log(`\n${res.filter((r) => r.startsWith("PASS")).length}/${res.length} passed`);
process.exit(res.some((r) => r.startsWith("FAIL")) ? 1 : 0);
