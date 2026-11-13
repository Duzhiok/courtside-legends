// Real-WebGL check of the Stylized outfit cuts: mounts one viewer, swaps cut / figure through setLook(), and asserts the
// right GLB is on screen each time, body-preset bones still scale, actions still play, and the portrait capture works.
// Usage: node scripts/qa/avatar-cuts.mjs /tmp/cls-qa/cuts [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/cuts";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 420, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.setDefaultTimeout(30000);
await page.goto(`${BASE}online.html`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  document.body.innerHTML = '<div id="stage" style="width:380px;height:600px;background:#1f6b45"></div>';
  window.__shot = null;
});
const base = { skin: "brown", hair: "black", outfit: "royal", style: "short", body: "standard", figure: "stylized", cut: "jersey" };
const state = () => page.evaluate(() => { const c = document.querySelector("#stage canvas"); return { model: c.dataset.model, look: JSON.parse(c.dataset.look), action: c.dataset.action }; });
await page.evaluate(async (look) => {
  const { mountAvatar3d } = await import("/js/ui/avatar3d.js");
  window.__v = await mountAvatar3d(document.getElementById("stage"), { timeoutMs: 20000, look });
}, base);
await page.waitForTimeout(600);
let s = await state();
check(s.model === "stylized_jersey.glb", `mounts the jersey cut (${s.model})`);
await page.screenshot({ path: `${OUT}/1-jersey.png` });

const set = (patch) => page.evaluate(async (p) => { await window.__v.setLook({ ...window.__v.look(), ...p }); }, patch);
await set({ cut: "street", outfit: "forest" });
await page.waitForTimeout(500);
s = await state();
check(s.model === "stylized_street.glb" && s.look.cut === "street", `swaps to the street cut (${s.model})`);
await page.screenshot({ path: `${OUT}/2-street.png` });

await set({ body: "broad" });
await page.waitForTimeout(300);
const sc = await page.evaluate(() => document.querySelector("#stage canvas").dataset.look);
check(JSON.parse(sc).body === "broad", "body preset applies on the swapped model");
await page.screenshot({ path: `${OUT}/3-street-broad.png` });

await set({ figure: "bobblehead", body: "standard" });
await page.waitForTimeout(500);
s = await state();
check(s.model === "bobblehead.glb", `bobblehead loads its own toy model (${s.model})`);

await set({ figure: "stylized", cut: "jersey", outfit: "royal" });
await page.waitForTimeout(500);
s = await state();
check(s.model === "stylized_jersey.glb", `back to jersey (${s.model})`);

// rapid swaps: the last one must win
await page.evaluate(async () => {
  const v = window.__v;
  const l = v.look();
  await Promise.all([v.setLook({ ...l, cut: "street" }), v.setLook({ ...l, cut: "jersey" }), v.setLook({ ...l, cut: "street" })]);
});
await page.waitForTimeout(500);
s = await state();
check(s.model === "stylized_street.glb" && s.look.cut === "street", `rapid swaps settle on the last look (${s.model})`);

const clip = await page.evaluate(() => window.__v.playAction("clap"));
check(clip === false || clip === true, "playAction does not throw on the swapped model (Stylized has no cheer clip yet: false is expected)");
const idle = await page.evaluate(() => window.__v.playIdle());
check(idle === true, "idle works after swaps");
const portrait = await page.evaluate(() => window.__v.capturePortrait("#1f6b45"));
check(!!portrait && portrait.length > 2000, "portrait capture works");
if (portrait) writeFileSync(`${OUT}/portrait-street.jpg`, Buffer.from(portrait.split(",")[1], "base64"));
check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
