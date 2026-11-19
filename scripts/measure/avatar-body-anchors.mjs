/* global Image, document -- the functions passed to page.evaluate() run inside the browser page */
// Where is each body part, row by row, on the shipped 2D art? Measurement only: the numbers behind js/ui/avatar2d/avatar2dShape.js ANCHORS.
// For every sampled row of the 1024x1536 art canvas it reports the opaque extent of the body skin, the jersey top and the shorts, and the separate
// runs of the body below the crotch (the two legs). A new character presentation (female art) needs this table measured before its body can be re-shaped.
// Usage: node scripts/measure/avatar-body-anchors.mjs [http://127.0.0.1:5173/] [assets sub-folder, default ""]
import { chromium } from "playwright-core";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const SUB = process.argv[3] || "";
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
const table = await page.evaluate(async ({ sub }) => {
  const load = (f) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(f)); i.src = `/assets/avatar2d/${sub}${f}`; });
  const files = { body: "base/body.png", top: "outfits/jersey/top.png", bottom: "outfits/jersey/bottom.png", shoes: "base/shoes.png" };
  const px = {};
  for (const [k, f] of Object.entries(files)) {
    const img = await load(f);
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    px[k] = g.getImageData(0, 0, c.width, c.height);
  }
  const W = px.body.width;
  const runs = (data, y, min = 6) => {
    const out = []; let start = -1;
    for (let x = 0; x <= W; x += 1) {
      const on = x < W && data.data[(y * W + x) * 4 + 3] > 40;
      if (on && start < 0) start = x;
      if (!on && start >= 0) { if (x - start >= min) out.push([start, x - 1]); start = -1; }
    }
    return out;
  };
  // ANCHORS: the arm = the skin runs outside the clothes (jersey top + shorts), pivot = the edge nearest the torso; the legs = the two body runs.
  const anchors = { arms: [], legs: [] };
  for (let y = 500; y <= 880; y += 20) {
    const cl = [runs(px.top, y), runs(px.bottom, y)].flat();
    if (!cl.length) continue;
    const left = Math.min(...cl.map((r) => r[0])), right = Math.max(...cl.map((r) => r[1]));
    const body = runs(px.body, y, 3);
    const L = body.filter((r) => r[1] < left - 2), R = body.filter((r) => r[0] > right + 2);
    if (L.length && R.length) anchors.arms.push([y, L[0][0], L[L.length - 1][1], R[0][0], R[R.length - 1][1]]);
  }
  for (let y = 900; y <= 1440; y += 20) {
    const body = runs(px.body, y, 6);
    if (body.length === 2) anchors.legs.push([y, body[0][0], body[0][1], body[1][0], body[1][1]]);
  }
  const rows = [];
  for (let y = 280; y <= 1460; y += 20) {
    const row = { y };
    for (const k of Object.keys(files)) { const r = runs(px[k], y); row[k] = r.length ? [r[0][0], r[r.length - 1][1]] : null; row[`${k}Runs`] = r; }
    rows.push(row);
  }
  return { rows, anchors };
}, { sub: SUB });
const anchors = table.anchors;
console.log("y     body            top             bottom(shorts)   body runs (legs when 2)        shoes");
for (const r of table.rows) {
  const f = (v) => (v ? `${v[0]}-${v[1]}`.padEnd(14) : "-".padEnd(14));
  console.log(String(r.y).padEnd(5), f(r.body), f(r.top), f(r.bottom), "  ", r.bodyRuns.map((x) => `${x[0]}-${x[1]}`).join(" | ").padEnd(30), f(r.shoes));
}
await browser.close();

console.log("\n// ANCHORS for avatar2dShape.js (paste): [y, outer, pivot-side...]");
console.log(`ARMS: [y, leftOuter, leftInner, rightInner, rightOuter]\n${anchors.arms.map((r) => `[${r.join(", ")}]`).join(",\n")}`);
console.log(`LEGS: [y, leftLegL, leftLegR, rightLegL, rightLegR]\n${anchors.legs.map((r) => `[${r.join(", ")}]`).join(",\n")}`);
