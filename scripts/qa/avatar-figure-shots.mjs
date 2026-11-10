// Visual check for character styles: full-body render + captured head portrait, per style, with real WebGL.
// Usage: node scripts/qa/avatar-figure-shots.mjs /tmp/cls-qa/figure [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/figure";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.setDefaultTimeout(20000);
await page.goto(`${BASE}online.html`, { waitUntil: "domcontentloaded" }); // a light page: we only need the module server
await page.evaluate(() => {
  document.body.innerHTML = "";
  for (const id of ["stylized", "bobblehead"]) {
    const box = document.createElement("div");
    box.id = `fig-${id}`;
    box.style.cssText = "display:inline-block;width:320px;height:560px;background:#1f6b45;margin:8px";
    document.body.append(box);
  }
});
const portraits = await page.evaluate(async () => {
  const { mountAvatar3d } = await import("/js/ui/avatar3d.js");
  const out = {};
  for (const figure of ["stylized", "bobblehead"]) {
    const v = await mountAvatar3d(document.getElementById(`fig-${figure}`), { timeoutMs: 15000, look: { skin: "brown", hair: "black", outfit: "royal", style: "short", body: "standard", figure } });
    await new Promise((r) => setTimeout(r, 600));
    out[figure] = v.capturePortrait("#1f6b45");
  }
  return out;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/full-body.png` });
for (const [k, uri] of Object.entries(portraits)) {
  if (uri) writeFileSync(`${OUT}/portrait-${k}.jpg`, Buffer.from(uri.split(",")[1], "base64"));
  console.log(k, uri ? `portrait ${uri.length} chars` : "NO PORTRAIT");
}
await browser.close();
