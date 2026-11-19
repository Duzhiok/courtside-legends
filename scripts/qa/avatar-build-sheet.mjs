// Avatar Creator 2.0: the real 2D figure at chosen body builds, side by side. For judging deformation with eyes, not with numbers: the art, the renderer and the
// sliders are the shipped ones; a build is just the five editor values. Each figure is also cropped at the hands and belt (art rows ~780-900) at 1.2x.
// Usage: node scripts/qa/avatar-build-sheet.mjs <out.png> <http://127.0.0.1:5173/> "name:waist=0,arms=100" "name2:arms=0" ...
//   (no variants given = the default review set). Keys: height (cm), shoulders, waist, arms, legs (0..100). Optional jersey: ",jersey=1".
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const [OUT = "/tmp/cls-qa/avatar-build-sheet/sheet.png", BASE = "http://127.0.0.1:5173/", ...asked] = process.argv.slice(2);
const DEFAULT_SET = ["default", "waist0:waist=0", "waist100:waist=100", "arms0:arms=0", "arms100:arms=100", "arms100+waist100:arms=100,waist=100", "arms100+waist0:arms=100,waist=0", "arms0+waist100:arms=0,waist=100"];
const variants = (asked.length ? asked : DEFAULT_SET).map((spec) => {
  const [name, rest = ""] = spec.split(":");
  const build = {};
  let jersey = false;
  for (const kv of rest.split(",").filter(Boolean)) { const [k, v] = kv.split("="); if (k === "jersey") jersey = v === "1"; else build[k] = Number(v); }
  return { name, build, jersey };
});
mkdirSync(dirname(OUT), { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: "domcontentloaded" });
const shots = await page.evaluate(async (list) => {
  const { mountAvatar2d } = await import("/js/ui/avatar2d/avatar2dRenderer.js");
  const { jerseyKit } = await import("/js/ui/avatar2d/avatar2dJersey.js");
  const { listJerseyCatalog, isForSale } = await import("/js/collectibles/jerseyCatalog.js");
  const kit = jerseyKit(listJerseyCatalog().find((t) => isForSale(t)));   // the first original jersey the shop sells
  const host = document.createElement("div");
  const base = { skin: "warm", hair: "black", outfit: "forest", style: "short", body: "standard" };
  const out = [];
  let handle = null;
  for (const v of list) {
    const look = { ...base, ...(Object.keys(v.build).length ? { build: { height: 185, shoulders: 50, waist: 50, arms: 50, legs: 50, ...v.build } } : {}) };
    handle = handle ? (await handle.setLook(look), handle) : await mountAvatar2d(host, { look });
    await handle.setJersey(v.jersey ? kit : null);
    out.push({ name: v.name, url: handle.canvas.toDataURL("image/png"), w: handle.canvas.width, h: handle.canvas.height });
  }
  handle.dispose?.();
  return out;
}, variants);
const html = `<body style="margin:0;background:#14281d;color:#ddd;font:14px sans-serif"><div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px">${shots.map((s) =>
  `<figure style="margin:0;text-align:center"><div style="width:384px;height:576px;overflow:hidden;background:#1d3a2a"><img src="${s.url}" style="width:384px;height:576px;display:block"></div>`
  + `<div style="width:384px;height:230px;overflow:hidden;background:#1d3a2a;margin-top:2px"><img src="${s.url}" style="width:614px;height:922px;margin:-443px 0 0 -115px;display:block"></div><figcaption>${s.name}</figcaption></figure>`).join("")}</div></body>`;
const cols = Math.min(shots.length, 4);
const sheet = await browser.newPage({ viewport: { width: cols * 390 + 12, height: Math.ceil(shots.length / cols) * 840 + 12 } });
await sheet.setContent(html);
await sheet.waitForTimeout(300);
await sheet.screenshot({ path: OUT });
console.log(`${OUT}  (${shots.length} builds)${errors.length ? `  page errors: ${errors.join(" | ")}` : ""}`);
await browser.close();
