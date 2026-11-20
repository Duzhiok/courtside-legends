// Browser trace for the match presentation sync work: a real Gold match with the 3D court on, sampled every 250 ms.
// Each sample is one line of the trace: wall time, the game clock/score on the 2D scoreboard, the last commentary line, and
// which player the 3D court says has the ball (court3d writes it to #court-3d-root[data-ball-owner]).
// Checks: the ball is with a named player most of the time and really changes hands, every holder is a real roster id, pause
// freezes the ball holder, and nothing throws. Desktop 1440 and mobile 390.
// S3 (one presentation cursor): the real page's onShot, scoreboard and feed are logged with timestamps, and GameSim.emit is wrapped
// to log the AUTHORITATIVE total after every event. For every MADE shot the 3D court draws (its eventId is "sim:<seq>"): when the
// shot starts the scoreboard must NOT yet include it (board <= authoritative total - the shot's points), and within the window it
// must have caught up (board >= authoritative total). A feed line must appear in the same window.
// Usage: node scripts/qa/match-3d-sync.mjs [outDir] [baseUrl] [seconds=30] [speed=1]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/match-3d-sync";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const SECONDS = Number(process.argv[4]) || 30;
const SPEED = Math.min(3, Math.max(1, Number(process.argv[5]) || 1));
const ONLY = process.argv[6] || ""; // optional: "desktop" or "mobile"
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
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]].filter((v) => !ONLY || v[2] === ONLY)) {
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
  for (let i = 1; i < SPEED; i++) await page.click("#btn-speed");
  await page.evaluate(async () => {
    const { CourtView3D } = await import("/js/engine/court3d.js");
    const { GameSim } = await import("/js/engine/sim.js");
    window.__auth = {}; // seq -> authoritative home+away total after that event
    const emit = GameSim.prototype.emit;
    GameSim.prototype.emit = function (...args) {
      const out = emit.apply(this, args);
      if (!this._quiet) window.__auth[(this._eventSeq || 1) - 1] = this.score.home + this.score.away;
      return out;
    };
    window.__shots = [];
    window.__scoreLog = [];
    window.__feedLog = [];
    const orig = CourtView3D.prototype.onShot;
    CourtView3D.prototype.onShot = function (shot) {
      window.__shots.push({ t: performance.now(), made: !!shot.made, pts: shot.pts || 0, seq: Number(String(shot.eventId || "").replace("sim:", "")) });
      return orig.apply(this, arguments);
    };
    const total = () => (Number(document.querySelector("#score-a")?.textContent) || 0) + (Number(document.querySelector("#score-b")?.textContent) || 0);
    let last = total();
    window.__scoreBase = last;
    const onScore = () => { const v = total(); if (v !== last) { window.__scoreLog.push({ t: performance.now(), delta: v - last }); last = v; } };
    for (const id of ["#score-a", "#score-b"]) new MutationObserver(onScore).observe(document.querySelector(id), { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => window.__feedLog.push({ t: performance.now() })).observe(document.querySelector("#play-feed"), { childList: true });
  });

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

  const log = await page.evaluate(() => ({ shots: window.__shots, score: window.__scoreLog, feed: window.__feedLog, auth: window.__auth, base: window.__scoreBase }));
  const made = log.shots.filter((x) => x.made && x.pts > 0 && Number.isInteger(x.seq) && log.auth[x.seq] !== undefined);
  const WINDOW = 6000; // generous: a software-rendered frame can take seconds
  const boardAt = (t) => log.base + log.score.filter((c) => c.t <= t).reduce((sum, c) => sum + c.delta, 0);
  const spoiled = made.filter((m) => boardAt(m.t) > log.auth[m.seq] - m.pts); // the board already counted this shot when it began
  const landed = made.filter((m) => boardAt(m.t + WINDOW) >= log.auth[m.seq]);
  const lines = made.filter((m) => log.feed.some((f) => f.t >= m.t && f.t <= m.t + WINDOW));
  const delays = landed.map((m) => Math.round((log.score.find((c) => c.t >= m.t && boardAt(c.t) >= log.auth[m.seq])?.t ?? NaN) - m.t)).filter(Number.isFinite).sort((a, b) => a - b);
  console.log(`[${tag}] ${SPEED}x: ${log.shots.length} shots drawn, ${made.length} made; scoreboard rose with the ball ${landed.length}/${made.length} (median ${delays[Math.floor(delays.length / 2)] ?? "-"} ms after the shot started), feed line in the window ${lines.length}/${made.length}, spoiled ${spoiled.length}`);
  check(`[${tag}] ${SPEED}x: enough shots were drawn to judge`, made.length >= 2, `${made.length} made shots`);
  check(`[${tag}] ${SPEED}x: the scoreboard rises by the shot's points after the shot starts (not before)`, made.length > 0 && landed.length / made.length >= 0.8, `${landed.length}/${made.length}`);
  check(`[${tag}] ${SPEED}x: no made shot was already on the scoreboard when it started`, spoiled.length === 0, `${spoiled.length}`);
  check(`[${tag}] ${SPEED}x: a feed line appears with each made shot`, made.length > 0 && lines.length / made.length >= 0.8, `${lines.length}/${made.length}`);

  // #btn-pause-sim is a toggle: a quarter break at fast speed has already paused the game, and clicking would resume it.
  if (await page.locator("#btn-resume").isHidden()) await page.click("#btn-pause-sim");
  // The cursor stops at the next animation frame. A real device draws one in 16 ms; this software-rendered arena can take seconds,
  // so settle first (two equal samples in a row), then require that nothing moves afterwards.
  let frozenA = await sample(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(700);
    const next = await sample(page);
    const same = JSON.stringify(next) === JSON.stringify(frozenA);
    frozenA = next;
    if (same) break;
  }
  await page.waitForTimeout(2500);
  const frozenB = await sample(page);
  check(`[${tag}] pause freezes the ball holder, the score, the clock and the feed`, frozenA.owner === frozenB.owner && frozenA.score === frozenB.score && frozenA.clock === frozenB.clock && frozenA.feed === frozenB.feed, `A=${JSON.stringify(frozenA)} B=${JSON.stringify(frozenB)}`);
  await shoot(page, `${OUT}/${tag}-paused.png`);
  const feedAtPause = await page.evaluate(() => document.querySelectorAll("#play-feed .event").length);
  await page.click("#btn-court-3d"); // back to 2D: nothing waiting is lost, and nothing breaks while paused
  await page.waitForTimeout(400);
  const feedIn2D = await page.evaluate(() => document.querySelectorAll("#play-feed .event").length);
  check(`[${tag}] switching to 2D keeps every feed line (${feedAtPause} -> ${feedIn2D})`, feedIn2D >= feedAtPause);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
