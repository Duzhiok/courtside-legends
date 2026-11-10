// Head/back-of-head check: short vs shaved, both figure styles, front and back, real WebGL. LOOK at the output.
// Usage: node scripts/qa/avatar-head-shots.mjs /tmp/cls-qa/head [http://127.0.0.1:5174/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/head";
const BASE = process.argv[3] || "http://127.0.0.1:5174/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 840 } });
page.setDefaultTimeout(30000);
await page.goto(`${BASE}online.html`, { waitUntil: "domcontentloaded" });
const cases = [];
for (const figure of ["stylized", "bobblehead"]) for (const style of ["short", "shaved"]) cases.push({ figure, style });
await page.evaluate((cs) => {
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;background:#123522;display:grid;grid-template-columns:repeat(4,240px);gap:6px;padding:6px";
  cs.forEach((c, i) => { const b = document.createElement("div"); b.id = `box-${i}`; b.style.cssText = "width:240px;height:400px;background:#1f6b45;position:relative"; document.body.append(b); });
  cs.forEach((c, i) => { const b = document.createElement("div"); b.id = `back-${i}`; b.style.cssText = "width:240px;height:400px;background:#1f6b45"; document.body.append(b); });
}, cases);
await page.evaluate(async (cs) => {
  const { mountAvatar3d } = await import("/js/ui/avatar3d.js");
  window.__h = [];
  for (const [i, c] of cs.entries()) {
    for (const prefix of ["box", "back"]) {
      const v = await mountAvatar3d(document.getElementById(`${prefix}-${i}`), { timeoutMs: 20000, look: { skin: "brown", hair: "black", outfit: "royal", style: c.style, body: "standard", figure: c.figure } });
      window.__h.push({ v, prefix });
    }
  }
}, cases);
// turn the "back" row around by really dragging the canvas, like a player would
for (let i = 4; i < 8; i++) {
  const box = await page.locator(`#back-${i - 4} canvas`).boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40 + 262, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
}
const rot = await page.evaluate(() => window.__h.filter((h) => h.prefix === "back").map((h) => h.v.rotationY().toFixed(2)));
console.log("back-row rotationY after drag:", rot.join(" "));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/heads.png` });
await browser.close();
