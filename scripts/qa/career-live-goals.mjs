// Browser E2E for the live "本场目标" panel (C6 follow-up). Real time-travel career, real engine, real buttons.
// Acceptance: the goals are shown on the line-up screen AND during the game, they are the ones the hub
// promised, their numbers move with the box score, nothing that locked in (done / failed) ever un-locks,
// and the result card agrees with every locked verdict. A non-career game never shows the panel.
// Usage: node scripts/qa/career-live-goals.mjs [outDir] [baseUrl]
// NOTE: needs a Mac (the executablePath below is a Mac Playwright path).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive, noOverflow, onResult, overflowers, shoot } from "./lib/page.mjs";
import { fastForwardToResult, openCareer } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/live-goals";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

const panel = (page) => page.evaluate(() => {
  const box = document.querySelector("#live-goals");
  return {
    visible: !!box && !box.hidden && box.getClientRects().length > 0,
    rows: [...(box?.querySelectorAll(".lg-goal") || [])].map((row) => ({
      id: row.dataset.goal,
      status: row.dataset.status,
      text: row.querySelector(".lg-text")?.textContent.trim(),
      value: row.querySelector(".lg-value")?.textContent.trim(),
      hasStatusWord: (row.querySelector(".lg-status")?.textContent.trim().length || 0) > 0,
    })),
  };
});
const setupGoals = (page) => page.evaluate(() => {
  const box = document.querySelector("#setup-goals");
  return { visible: !!box && !box.hidden && box.getClientRects().length > 0, texts: [...(box?.querySelectorAll(".pg-pre-goal") || [])].map((li) => li.firstChild.textContent.trim()) };
});
const hubGoals = (page) => page.$$eval("#season-next-goals .pg-pre-goal", (lis) => lis.map((li) => li.firstChild.textContent.trim()));
const resultGoals = (page) => page.$$eval("#result-rewards .pg-goal", (rows) => rows.map((row) => ({ done: row.classList.contains("pg-goal-done"), text: row.textContent.replace(/\s+/g, " ").trim() })));

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openCareer(page, BASE, {});

  const promised = await hubGoals(page);
  check(`[${tag}] hub promises 2 goals`, promised.length === 2, promised.join(" | "));

  await page.click("#btn-season-play");
  await page.waitForSelector("#screen-setup.active", { timeout: 10000 });
  const setup = await setupGoals(page);
  check(`[${tag}] line-up screen shows the same goals`, setup.visible && JSON.stringify(setup.texts) === JSON.stringify(promised), JSON.stringify(setup));
  check(`[${tag}] line-up screen has no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-setup.png`);

  await page.clock.install();
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 10000 });

  const first = await panel(page);
  check(`[${tag}] live panel is visible at tip-off with the 2 promised goals`, first.visible && first.rows.length === 2 && first.rows.every((r, i) => r.text === promised[i].replace(/\s+/g, " ")), JSON.stringify(first.rows.map((r) => r.text)));
  check(`[${tag}] every row says its status in words (not colour alone)`, first.rows.every((r) => r.hasStatusWord));
  check(`[${tag}] live panel has no horizontal overflow`, await noOverflow(page), (await overflowers(page)).slice(0, 3).join(" | "));
  await shoot(page, `${OUT}/${tag}-tipoff.png`);

  const samples = [first];
  const ended = await fastForwardToResult(page, { stepMs: 2000, onStep: async () => { samples.push(await panel(page)); } });
  check(`[${tag}] game reaches the result screen`, ended);
  if (ended) await onResult(page);

  const changed = [0, 1].some((i) => new Set(samples.map((s) => s.rows[i]?.value)).size > 1);
  check(`[${tag}] numbers moved while the game was played (${samples.length} samples)`, changed, samples.at(-1)?.rows.map((r) => r.value).join(" | "));
  check(`[${tag}] panel stayed visible through the whole game`, samples.every((s) => s.visible));

  // Locked verdicts never un-lock: atLeast goals only go open -> done; a budget only goes open -> failed.
  let unlocked = "";
  for (let i = 0; i < 2; i += 1) {
    let lock = null;
    for (const s of samples) {
      const row = s.rows[i];
      if (!row) continue;
      if (lock && row.status !== lock) unlocked = `${row.id}: ${lock} -> ${row.status}`;
      if (row.status === "done" || row.status === "failed") lock = row.status;
    }
  }
  check(`[${tag}] done/failed never flips back`, !unlocked, unlocked);

  // And the result card agrees with everything that was locked in.
  const judged = await resultGoals(page);
  const last = samples.at(-1).rows;
  const disagreements = [];
  for (const row of last) {
    const hit = judged.find((j) => j.text.includes(row.text));
    if (!hit) continue; // only the goals the result judged
    if (row.status === "done" && !hit.done) disagreements.push(`${row.id}: panel done, result missed`);
    if (row.status === "failed" && hit.done) disagreements.push(`${row.id}: panel failed, result done`);
  }
  check(`[${tag}] result card agrees with every locked verdict`, judged.length > 0 && disagreements.length === 0, disagreements.join("; ") || `${judged.length} judged`);
  await shoot(page, `${OUT}/${tag}-result.png`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

{ // A plain Play Now game must never show the panel (nor the line-up goals).
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
  check("[play-now] no live goals panel in a non-career game", !(await panel(page)).visible);
  check("[play-now] no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join("\n") + "\n");
const fails = report.filter((r) => r.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - fails.length}/${report.length} passed`);
process.exit(fails.length ? 1 : 0);
