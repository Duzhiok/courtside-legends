// Avatar Creator 2.0, slice 1: Standard / Broad / Slim must look different on the default 2D figure. Real browser, real art, real editor clicks.
// It measures the silhouette (opaque pixel width of the figure canvas at the head, shoulders, arms, waist, legs and feet), because "looks different"
// is otherwise a matter of opinion; then saves, reloads and checks the build survived. Desktop 1280 + mobile 390.
// Screenshots (each build, plus a side-by-side) are for the user's visual review, not a self-declared acceptance.
// Usage: node scripts/qa/avatar-body-2d.mjs [http://127.0.0.1:5173/] [/tmp/cls-qa/avatar-body-2d]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "/tmp/cls-qa/avatar-body-2d";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};

// Rows of the 1024x1536 art canvas; the figure canvas is half resolution, so y / 2.
// Steep silhouette rows (the hands ending, the hem) are avoided on purpose: a 2% height change would move the measurement onto another shape.
const ROWS = { head: 190, shoulders: 440, arms: 700, waist: 1000, legs: 1200, feet: 1430 };
const FEET_Y = 1463;
const widths = (page) => page.evaluate(({ rows, FEET }) => {
  const c = document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas");
  if (!c) return null;
  const g = c.getContext("2d");
  const out = { look: JSON.parse(c.dataset.look || "null"), shape: JSON.parse(c.dataset.shape || "null") };
  const h = 1 + (out.shape?.height || 0);   // the figure is also scaled uniformly about the feet: look at the same ROW of the art, and take the uniform scale out of the width
  for (const [name, y] of Object.entries(rows)) {
    const shown = FEET - (FEET - y) * h;
    const d = g.getImageData(0, Math.round(shown / 2), c.width, 1).data;
    let l = -1, r = -1;
    for (let x = 0; x < c.width; x++) if (d[x * 4 + 3] > 40) { if (l < 0) l = x; r = x; }
    out[name] = l < 0 ? 0 : Math.round(((r - l + 1) * 2) / h);   // back to art pixels
  }
  return out;
}, { rows: ROWS, FEET: FEET_Y });

async function fresh(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const accMod = await import("/js/data/account.js");
    const a = accMod.createAccount("John");
    a.onboardingDone = true;
    accMod.saveAccount(a);
    const { saveLook } = await import("/js/data/avatarLook.js");
    saveLook(a, { skin: "warm", hair: "black", outfit: "forest", style: "short", body: "standard" });
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  return { page, errors };
}
const openWorld = async (page) => {
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#mw-showcase-stage canvas.avatar2d-canvas", { timeout: 25000 });
  await page.waitForTimeout(500);
};
const pickBody = async (page, id) => {
  await page.locator(`label.mw-swatch:has(input[name="mw-look-body"][value="${id}"])`).click();
  await page.waitForFunction((want) => JSON.parse(document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas")?.dataset.look || "{}").body === want, id, { timeout: 8000 });
  await page.waitForTimeout(250);
};

for (const [vt, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const { page, errors } = await fresh(viewport);
  await openWorld(page);
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForSelector("#mw-look:not([hidden])");
  const m = {}; const shots = {};
  for (const id of ["standard", "broad", "slim"]) {
    await pickBody(page, id);
    m[id] = await widths(page);
    shots[id] = await page.evaluate(() => document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas").toDataURL("image/png"));
    await (await page.$("#mw-showcase-stage")).screenshot({ path: `${OUT}/${vt}-${id}.png` });
  }
  const pct = (a, b) => ((a / b - 1) * 100).toFixed(0);
  const line = (k) => `${k}: slim ${m.slim[k]} · standard ${m.standard[k]} · broad ${m.broad[k]} (${pct(m.slim[k], m.standard[k])}% / +${pct(m.broad[k], m.standard[k])}%)`;
  check(`[${vt}] the editor's body choice reaches the 2D figure (look.body and shape follow the click)`, m.broad.look?.body === "broad" && m.slim.look?.body === "slim" && m.broad.shape?.shoulders > 0 && m.slim.shape?.shoulders < 0);
  for (const k of ["shoulders", "arms", "waist"]) {
    check(`[${vt}] ${k}: broad is wider than standard is wider than slim, each step at least 8%`, m.broad[k] >= m.standard[k] * 1.08 && m.slim[k] <= m.standard[k] * 0.92, line(k));
  }
  check(`[${vt}] legs differ in the right direction`, m.broad.legs > m.standard.legs && m.slim.legs < m.standard.legs, line("legs"));
  check(`[${vt}] the head is the same size in all three builds (a broad man's head is not wider)`, Math.abs(m.broad.head - m.standard.head) <= 4 && Math.abs(m.slim.head - m.standard.head) <= 4, `${m.slim.head}/${m.standard.head}/${m.broad.head}`);
  check(`[${vt}] the feet are untouched`, Math.abs(m.broad.feet - m.standard.feet) <= 4 && Math.abs(m.slim.feet - m.standard.feet) <= 4, `${m.slim.feet}/${m.standard.feet}/${m.broad.feet}`);

  // Persistence: slim saved, reload, still slim.
  await page.reload({ waitUntil: "domcontentloaded" });
  await openWorld(page);
  const after = await widths(page);
  check(`[${vt}] the saved build survives a reload`, after.look?.body === "slim" && Math.abs(after.shoulders - m.slim.shoulders) <= 4, `body ${after.look?.body}, shoulders ${after.shoulders} vs ${m.slim.shoulders}`);
  const saved = await page.evaluate(async () => { const { readLook } = await import("/js/data/avatarLook.js"); const { getAccount } = await import("/js/data/account.js"); return readLook(getAccount()); });
  check(`[${vt}] the saved look keeps every other field (skin, hair, outfit, style, cut)`, saved.skin === "warm" && saved.hair === "black" && saved.outfit === "forest" && saved.style === "short" && saved.cut === "jersey", JSON.stringify(saved));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`[${vt}] no horizontal overflow`, overflow <= 1, `${overflow}px`);
  check(`[${vt}] no page errors`, errors.length === 0, errors.join(" | "));

  if (vt === "desktop") {   // side-by-side for the visual review
    const view = await browser.newPage({ viewport: { width: 1320, height: 700 }, deviceScaleFactor: 1 });
    await view.setContent(`<body style="margin:0;background:#14281d;display:flex;gap:16px;justify-content:center">${["slim", "standard", "broad"].map((id) => `<figure style="margin:0;color:#fff;font:16px sans-serif;text-align:center"><img src="${shots[id]}" height="650"/><figcaption>${id}</figcaption></figure>`).join("")}</body>`);
    await view.screenshot({ path: `${OUT}/side-by-side.png` });
    await view.close();
  }
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
