// Browser QA: Shared Career Inbox (workstream A). Verifies the ?inbox=1
// dev entry end to end (desktop + mobile): the inbox screen renders,
// a real team starts a real 1996-97 demo season, games advance through
// real GameSim results, the three-speed timeline runs, an event decision
// (when one screens — the core demand needs a real 3-game skid, so the
// script plays until one appears or reports that none did) records a
// visible consequence, and the demo progress persists across reload.
// Usage: node scripts/qa/career-inbox.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/career-inbox";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

function inboxState() {
  const body = document.querySelector("#career-inbox-body");
  const screen = document.querySelector("#screen-career-inbox");
  return {
    screenActive: screen?.classList.contains("active"),
    text: body?.textContent || "",
    gameLine: [...(body?.querySelectorAll("p") || [])].map((p) => p.textContent.trim()).find((t) => /第 \d+\/82/.test(t)) || "",
    pending: body?.querySelectorAll("[data-decide]").length || 0,
    runButtons: body?.querySelectorAll("[data-run]").length || 0,
  };
}

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());

  await page.goto(`${BASE}?inbox=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-career-inbox")?.classList.contains("active"), null, { timeout: 60000 });
  const opened = await page.evaluate(inboxState);
  check(`[${tag}] ?inbox=1 opens the inbox screen`, opened.screenActive, opened.gameLine);
  check(`[${tag}] team picker is shown before the demo starts`, /选一支球队/.test(opened.text), opened.text.slice(0, 80));
  await page.screenshot({ path: `${OUT}/${tag}-inbox-picker.png`, fullPage: true, animations: "disabled" });

  // Start the demo with Chicago and play one real game.
  await page.selectOption("#inbox-team-pick", "CHI");
  await page.click("[data-start-demo]");
  await page.waitForTimeout(500);
  const started = await page.evaluate(inboxState);
  check(`[${tag}] demo starts: CHI, game 1/82, three timeline buttons`, /CHI/.test(started.gameLine) && started.runButtons === 3, started.gameLine);
  await page.click('[data-run="next-game"]');
  await page.waitForTimeout(1500);
  const afterOne = await page.evaluate(inboxState);
  check(`[${tag}] one game advances the demo to game 2/82`, /第 2\/82/.test(afterOne.gameLine), afterOne.gameLine);
  await page.screenshot({ path: `${OUT}/${tag}-inbox-after-game.png`, fullPage: true, animations: "disabled" });

  // Run next-event up to 3 times; if an event screens, decide it and
  // verify the consequence is recorded and visible.
  let decided = false;
  for (let attempt = 0; attempt < 3 && !decided; attempt++) {
    await page.click('[data-run="next-event"]');
    await page.waitForTimeout(3000);
    const state = await page.evaluate(inboxState);
    if (state.pending > 0) {
      await page.screenshot({ path: `${OUT}/${tag}-inbox-event.png`, fullPage: true, animations: "disabled" });
      await page.click("[data-decide]");
      await page.waitForTimeout(500);
      const after = await page.evaluate(inboxState);
      check(`[${tag}] deciding an event records a visible consequence`, /决定已记录/.test(after.text), after.text.slice(0, 120));
      check(`[${tag}] the decided event leaves the pending queue`, after.pending < state.pending, `pending ${state.pending} -> ${after.pending}`);
      decided = true;
    }
  }
  if (!decided) {
    report.push(`NOTE [${tag}] no inbox event screened in 3 next-event runs — events are state-driven (the core demand needs a real 3-game skid), screening itself is pinned by unit tests`);
  }

  // Persistence: reload and confirm the demo is where it was.
  const beforeReload = await page.evaluate(inboxState);
  await page.goto(`${BASE}?inbox=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-career-inbox")?.classList.contains("active"), null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const afterReload = await page.evaluate(inboxState);
  check(`[${tag}] demo progress persists across reload`, afterReload.gameLine === beforeReload.gameLine, `${beforeReload.gameLine} -> ${afterReload.gameLine}`);

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.screenshot({ path: `${OUT}/${tag}-inbox-final.png`, fullPage: true, animations: "disabled" });
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
process.exit(failed ? 1 : 0);
