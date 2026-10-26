// Browser QA for the court animation (R66-R68): simple humanoid players and the shot-release arc.
// Plays a real quick game, samples the ball every frame, and checks that jump shots actually
// fly on an arc (ball size swells mid-flight) while nothing throws and nothing overflows.
// Usage: node scripts/qa/court-simple-shot.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/court";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag, simple) {
  const label = `${tag}/${simple ? "simple" : "photo"}`;
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("courtside-simple-players", s ? "1" : "0"); }, simple);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.evaluate(() => document.querySelector('.mode-card[data-mode="quick"]').click()); // lives in the hidden 自定义 tab
  await page.waitForSelector("#btn-setup-confirm", { state: "visible", timeout: 20000 });
  if (await page.$eval("#btn-setup-confirm", (b) => b.disabled)) {
    const picks = await page.$$("#screen-setup .player-card[data-pick], #screen-setup [data-pick]");
    for (const p of picks.slice(0, 5)) await p.click();
  }
  await page.waitForFunction(() => !document.querySelector("#btn-setup-confirm").disabled, null, { timeout: 10000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#court-ball", { timeout: 20000 });
  await page.click("#btn-speed").catch(() => {}); // a little faster so shots happen sooner
  await page.click("#btn-speed").catch(() => {});

  // Sample the ball every ~40ms for 25s: record size and position.
  const samples = await page.evaluate(() => new Promise((resolve) => {
    const out = [];
    const ball = document.querySelector("#court-ball");
    const t0 = performance.now();
    const tick = () => {
      const r = ball.getBoundingClientRect();
      out.push({ t: performance.now() - t0, w: Math.round(r.width * 10) / 10, x: Math.round(r.left), y: Math.round(r.top) });
      if (performance.now() - t0 < 25000) setTimeout(tick, 40); else resolve(out);
    };
    tick();
  }));

  // Resting size = the most common width (the CSS size). The min is NOT it: a made shot
  // deliberately shrinks the ball to 8px "through the net" for 150ms.
  const counts = new Map();
  for (const s of samples) counts.set(s.w, (counts.get(s.w) || 0) + 1);
  const restW = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const maxW = Math.max(...samples.map((s) => s.w));
  const flying = samples.filter((s) => s.w > restW + 4).length;
  check(`[${label}] ball swells during jump shots (arc is animating)`, maxW >= restW + 5 && flying >= 5, `rest ${restW}px, peak ${maxW}px, ${flying} airborne frames of ${samples.length}`);
  check(`[${label}] ball ends at its resting size (arc never leaves it stuck)`, samples.slice(-5).every((s) => Math.abs(s.w - restW) < 2.5 || s.w > restW), `last widths ${samples.slice(-5).map((s) => s.w).join(",")}`);

  const tokens = await page.$$eval("#court-root .court-token", (els) => els.length);
  check(`[${label}] 10 court tokens rendered`, tokens === 10, `${tokens} tokens`);
  if (simple) {
    const parts = await page.$$eval("#court-root .court-token.simple", (els) => els.map((el) => ["torso", "arm", "leg"].map((k) => !!el.querySelector(`[class*='${k}']`))));
    check(`[${label}] every simple token has torso, arms and legs`, parts.length === 10 && parts.every((p) => p.every(Boolean)), `${parts.length} simple tokens`);
  }
  check(`[${label}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  // The court itself (not the page, which has scrolled down to the coach panel by now).
  await page.$eval("#court-root", (el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await (await page.$("#court-root")).screenshot({ path: `${OUT}/${tag}-${simple ? "simple" : "photo"}.png` });
  // Meters are floats inside the sim; the player must read whole numbers.
  const meters = await page.evaluate(() => ["#morale", "#chem", "#fit", "#opp-morale", "#opp-chem"].map((id) => document.querySelector(id)?.textContent ?? ""));
  check(`[${label}] meters read as whole numbers`, meters.every((t) => /^\d+$/.test(t.trim())), meters.join(" / "));
  const strip = await page.evaluate(() => [...document.querySelectorAll("#chem-a, #chem-b, .team-chem, [id*='chem-line']")].map((e) => e.textContent).join(" "));
  check(`[${label}] no long float tails anywhere in the scoreboard text`, !/\d+\.\d{3,}/.test(await page.evaluate(() => document.body.innerText)), strip.slice(0, 80));
  check(`[${label}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await run(1280, 800, "desktop", true);
await run(1280, 800, "desktop", false);
await run(390, 844, "mobile", true);
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("PASS")).length}/${report.length} passed`);
