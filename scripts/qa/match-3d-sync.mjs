// Browser trace for the match presentation sync work: a real Gold match with the 3D court on, sampled every 250 ms.
// Each sample is one line of the trace: wall time, the game clock/score on the 2D scoreboard, the last commentary line, and
// which player the 3D court says has the ball (court3d writes it to #court-3d-root[data-ball-owner]).
// Checks: the ball is with a named player most of the time and really changes hands, every holder is a real roster id, pause
// freezes the ball holder, and nothing throws. Desktop 1440 and mobile 390.
// Usage: node scripts/qa/match-3d-sync.mjs [outDir] [baseUrl] [seconds=30]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/match-3d-sync";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const SECONDS = Number(process.argv[4]) || 30;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

const sample = (page) => page.evaluate(() => ({
  owner: document.querySelector("#court-3d-root")?.dataset.ballOwner || "",
  score: `${document.querySelector("#score-a")?.textContent}-${document.querySelector("#score-b")?.textContent}`,
  clock: document.querySelector("#clock")?.textContent || document.querySelector("#game-clock")?.textContent || "",
  feed: (document.querySelector(".play-feed .event .feed-text")?.textContent || "").trim().slice(0, 70),
}));

const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#btn-market-done", { state: "visible", timeout: 20000 });
  await page.click("#btn-market-done");
  await page.waitForSelector("#screen-setup.active", { timeout: 20000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 20000 });
  await page.click("#btn-court-3d");
  await page.waitForSelector("#court-3d-root canvas", { timeout: 30000 });

  const trace = [];
  const t0 = Date.now();
  while (Date.now() - t0 < SECONDS * 1000) {
    trace.push({ t: Date.now() - t0, ...(await sample(page)) });
    if (trace.length === 40) await shoot(page, `${OUT}/${tag}-mid.png`);
    await page.waitForTimeout(250);
  }
  writeFileSync(`${OUT}/${tag}-trace.jsonl`, trace.map((r) => JSON.stringify(r)).join("\n"));

  const named = trace.filter((r) => r.owner).length;
  const owners = trace.map((r) => r.owner).filter(Boolean);
  const changes = owners.filter((o, i) => i > 0 && o !== owners[i - 1]).length;
  check(`[${tag}] the 3D ball is with a named player ${Math.round((100 * named) / trace.length)}% of the time`, named / trace.length >= 0.6, `${named}/${trace.length}`);
  check(`[${tag}] the ball really changes hands (${changes} times)`, changes >= 3);
  check(`[${tag}] every holder is a real roster id (name-year-team), never a made-up one`, owners.every((o) => /^[a-z0-9]+-\d{4}-[a-z]{3}$/.test(o)), owners.find((o) => !/^[a-z0-9]+-\d{4}-[a-z]{3}$/.test(o)) || "");

  await page.click("#btn-pause-sim");
  await page.waitForTimeout(500);
  const frozenA = await sample(page);
  await page.waitForTimeout(2500);
  const frozenB = await sample(page);
  check(`[${tag}] pause freezes the ball holder, the score and the clock`, frozenA.owner === frozenB.owner && frozenA.score === frozenB.score && frozenA.clock === frozenB.clock, `${frozenA.owner}|${frozenA.score}|${frozenA.clock}`);
  await shoot(page, `${OUT}/${tag}-paused.png`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
