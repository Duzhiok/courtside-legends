// Browser E2E for C6 (per-game goals + the hand-play bonus). Real time-travel career, real engine,
// real buttons -- nothing here fakes the app.
// Roadmap acceptance: the hub promises goals before a game; the post-game card judges exactly what
// it promised; a sim judges the first goal only, hand-coaching judges both and pays x1.5 on top.
// Usage: node scripts/qa/career-game-goals.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, noOverflow, onResult, overflowers, shoot } from "./lib/page.mjs";
import { openCareer, playLive } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/game-goals";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** The pre-game card under "下一场": is it there, and what does it list. */
const pregame = (page) => page.evaluate(() => {
  const box = document.querySelector("#season-next-goals");
  const rows = [...box.querySelectorAll(".pg-pre-goal")];
  return {
    visible: !!box && !box.hidden && box.getClientRects().length > 0,
    count: rows.length,
    tagged: rows.map((row) => !!row.querySelector(".pg-pre-tag")),
    texts: rows.map((row) => row.textContent.replace(/\s+/g, " ").trim()),
  };
});

/** The goals section of whatever settlement card is on screen right now (single-game or batch). */
const goalSection = (page) => page.evaluate(() => {
  const box = document.querySelector("#result-rewards");
  const rows = [...box.querySelectorAll(".pg-goal")];
  const note = box.querySelector(".pg-goals")?.closest(".pg-card, div")?.querySelector(".pg-note")?.textContent || "";
  return {
    present: rows.length > 0 || /本段目标|Goals of the stretch/.test(box.textContent),
    rows: rows.map((row) => ({ done: row.classList.contains("pg-goal-done"), text: row.textContent.replace(/\s+/g, " ").trim() })),
    note: note.replace(/\s+/g, " ").trim(),
    all: box.textContent.replace(/\s+/g, " ").trim(),
  };
});

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {};

  await openCareer(page, BASE, {});

  // ---- the hub's promise, before anything is played
  const pre = await pregame(page);
  check(`[${tag}] hub: the pre-game card is visible with ${2} goals`, pre.visible && pre.count === 2, JSON.stringify(pre));
  check(`[${tag}] hub: only the 2nd goal is tagged "counts if you coach"`, pre.tagged[0] === false && pre.tagged[1] === true, pre.tagged.join(","));
  await shoot(page, `${OUT}/${tag}-hub-pregame.png`);

  // ---- a quick sim from the hub: only the FIRST goal gets judged (settleGameGoals slices to 1)
  await page.click("#btn-season-sim-one");
  await onResult(page);
  const simGoals = await goalSection(page);
  check(`[${tag}] sim: exactly 1 goal judged (a sim never earns the 2nd)`, simGoals.rows.length === 1, JSON.stringify(simGoals.rows));
  check(`[${tag}] sim: the judged goal is the one the hub promised first`, simGoals.rows[0]?.text.includes(pre.texts[0].replace(/ Counts if you coach| 亲自指挥才计入/, "")) || pre.texts[0].includes(simGoals.rows[0]?.text.replace(/^[✓✗]\s*/, "").split(" ")[0] || "\0"), `${simGoals.rows[0]?.text} vs ${pre.texts[0]}`);
  check(`[${tag}] sim: the note does NOT claim the hand-play bonus`, !/亲自指挥 ×|You coached ×/.test(simGoals.note), simGoals.note);
  const simMult = simGoals.note.match(/×([\d.]+)/);
  const simDone = simGoals.rows.filter((r) => r.done).length;
  check(`[${tag}] sim: the shown multiplier is exactly 1 + 0.25×done (no hand-play factor)`, !!simMult && Math.abs(+simMult[1] - (1 + 0.25 * simDone)) < 0.01, `${simMult?.[1]} vs ${1 + 0.25 * simDone}`);
  await shoot(page, `${OUT}/${tag}-sim-result.png`);

  // ---- back to the hub, hand-coach the next game: BOTH goals get judged, x1.5 on top
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  const preLive = await pregame(page);
  const liveDone = await playLive(page, state);
  check(`[${tag}] live: the hand-coached game reached the result screen`, liveDone,
    liveDone ? "" : await page.evaluate(() => `screens=${[...document.querySelectorAll(".screen.active")].map((el) => el.id)}`));
  if (liveDone) {
    const liveGoals = await goalSection(page);
    check(`[${tag}] live: both goals judged (coaching it yourself earns the 2nd)`, liveGoals.rows.length === 2, JSON.stringify(liveGoals.rows));
    check(`[${tag}] live: the note claims the hand-play bonus`, /亲自指挥 ×1\.5|You coached ×1\.5/.test(liveGoals.note), liveGoals.note);
    const liveMult = liveGoals.note.match(/×([\d.]+)/);
    const liveDoneCount = liveGoals.rows.filter((r) => r.done).length;
    check(`[${tag}] live: the shown multiplier is exactly 1.5 × (1 + 0.25×done)`, !!liveMult && Math.abs(+liveMult[1] - 1.5 * (1 + 0.25 * liveDoneCount)) < 0.01, `${liveMult?.[1]} vs ${1.5 * (1 + 0.25 * liveDoneCount)}`);
    const coachNote = await page.$eval("#result-rewards", (el) => el.textContent).catch(() => "");
    check(`[${tag}] live: coach growth also shows the bonus multiplier`, liveDoneCount === 0 || /奖励 ×|Bonus ×/.test(coachNote), coachNote.slice(0, 10));
    check(`[${tag}] both pre-game goals the hub promised were the ones judged`, preLive.texts.length === 2 && liveGoals.rows.every((row, i) => preLive.texts[i].replace(/ Counts if you coach| 亲自指挥才计入/, "").includes(row.text.replace(/^[✓✗]\s*/, "").split(/,|，/)[0].split(" ")[0])), JSON.stringify({ pre: preLive.texts, judged: liveGoals.rows.map((r) => r.text) }));
    await shoot(page, `${OUT}/${tag}-live-result.png`);
  }

  // ---- a bulk sim: one goal per game folded into the stretch card, "done / total" with total === games
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click("#btn-season-sim-week");
  await onResult(page);
  const batch = await goalSection(page);
  const bm = batch.all.match(/本段目标[^·]*达成 (\d+) \/ (\d+)[^·]*·\s*(\d+) 场|Goals of the stretch[^·]*(\d+) of (\d+) met[^·]*·\s*(\d+) games/);
  const done = bm ? +(bm[1] ?? bm[4]) : NaN;
  const total = bm ? +(bm[2] ?? bm[5]) : NaN;
  const games = bm ? +(bm[3] ?? bm[6]) : NaN;
  check(`[${tag}] sim week: "本段目标" section shows done/total and game count`, !!bm, batch.all.slice(0, 200));
  check(`[${tag}] sim week: total judged goals == games (a pure sim earns 1 goal/game)`, total === games, `${total} vs ${games}`);
  check(`[${tag}] sim week: done is between 0 and total`, done >= 0 && done <= total, `${done}/${total}`);
  await shoot(page, `${OUT}/${tag}-week-result.png`);

  // ---- English: no Chinese leaks into either the hub's promise or the post-game judgment
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.evaluate(() => document.querySelector("#btn-lang").click());
  await page.waitForTimeout(300);
  const preEn = await pregame(page);
  check(`[${tag}] English: the hub's goal card has no Chinese`, preEn.texts.length === 2 && preEn.texts.every((t) => !CJK.test(t)), preEn.texts.join(" | "));
  await page.click("#btn-season-sim-one");
  await onResult(page);
  const enGoals = await goalSection(page);
  check(`[${tag}] English: the judged-goals card has no Chinese`, enGoals.rows.length === 1 && !CJK.test(enGoals.all), enGoals.all.slice(0, 160));
  check(`[${tag}] English: "Game goals" heading, not 本场目标`, /Game goals/.test(enGoals.all), enGoals.all.slice(0, 40));

  check(`[${tag}] no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
