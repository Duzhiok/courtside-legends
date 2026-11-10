// Browser QA: Career Relationships & Legacy (workstream E). Verifies the
// ?relationships=1 dev panel end to end (desktop + mobile): add people,
// build a rivalry, make a promise, feed in real season state, resolve it
// and watch the trust effect land (pending when no Reborn run is loaded),
// record a rivalry game and a historical divergence, and confirm the
// record persists across reload. The live trust application to a Reborn
// run (trust before -> after on root.reborn.player.coachTrust) is a
// manual Mac check — it needs a real Reborn run loaded first.
// Usage: node scripts/qa/career-relationships.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/career-relationships";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function openPanel(page) {
  await page.goto(`${BASE}?relationships=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-relationships")?.classList.contains("active"), null, { timeout: 60000 });
  await page.waitForTimeout(300);
}

function panelState() {
  const body = document.querySelector("#relationships-body");
  return {
    sections: ["rel-people", "rel-relationships", "rel-promises", "rel-legacy"].every((id) => !!body.querySelector(`[data-testid="${id}"]`)),
    text: body.textContent,
    result: document.querySelector('[data-testid="rel-result"]')?.textContent.trim() || "",
  };
}

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.addInitScript(() => {
    const account = {
      id: "qa-relationships", name: "QA", createdAt: Date.now(),
      playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced",
      lastDailyDraw: null, drawHistory: [], gold: 0, rankedWins: 0, rankedLosses: 0,
    };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-relationships");
  });

  await openPanel(page);
  let state = await page.evaluate(panelState);
  check(`[${tag}] panel renders all four sections`, state.sections);
  await page.screenshot({ path: `${OUT}/${tag}-panel-empty.png`, fullPage: true, animations: "disabled" });

  // Add three people: a coach and two players.
  const addPerson = async (id, name, bref, kind) => {
    await page.fill("#rel-person-id", id);
    await page.fill("#rel-person-name", name);
    await page.fill("#rel-person-bref", bref);
    await page.selectOption("#rel-person-kind", kind);
    await page.click('[data-action="add-person"]');
    await page.waitForTimeout(200);
  };
  await addPerson("coach-1", "主教练", "", "coach");
  await addPerson("bryanko01", "Kobe Bryant", "bryanko01", "player");
  await addPerson("jordami01", "Michael Jordan", "jordami01", "player");
  state = await page.evaluate(panelState);
  check(`[${tag}] three people added and listed`, ["主教练", "Kobe Bryant", "Michael Jordan"].every((n) => state.text.includes(n)), state.text.slice(0, 200));

  // Rivalry between the two players.
  await page.selectOption("#rel-a", "bryanko01");
  await page.selectOption("#rel-b", "jordami01");
  await page.selectOption("#rel-kind", "rivalry");
  await page.fill("#rel-strength", "80");
  await page.click('[data-action="add-relationship"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(panelState);
  check(`[${tag}] rivalry built at 80/100`, state.text.includes("80/100"), state.text.slice(0, 300));

  // Promise: coach-1 gives bryanko01 more minutes (made at game 10, due in 5).
  await page.fill("#rel-state-game", "10");
  await page.selectOption("#rel-maker", "coach-1");
  await page.selectOption("#rel-target", "bryanko01");
  await page.selectOption("#rel-promise-kind", "minutes");
  await page.fill("#rel-promise-text", "未来五场给你更多上场时间");
  await page.click('[data-action="make-promise"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(panelState);
  check(`[${tag}] minutes promise recorded as open`, state.text.includes("未来五场给你更多上场时间") && state.text.includes("open"), state.result);

  // Feed in real season state: game 13, 5 games played at 21 mpg -> fulfilled early.
  await page.fill("#rel-state-game", "13");
  await page.fill("#rel-state-played", "5");
  await page.fill("#rel-state-mpg", "21");
  await page.click('[data-testid="rel-resolve"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(panelState);
  check(`[${tag}] resolving settles 1 promise as fulfilled`, /结算 1 条承诺/.test(state.result) && state.text.includes("fulfilled"), state.result);
  check(`[${tag}] trust effect recorded as pending (no Reborn run loaded)`, /待 Reborn/.test(state.result) && state.text.includes("（待应用）"), state.result);
  await page.screenshot({ path: `${OUT}/${tag}-promise-resolved.png`, fullPage: true, animations: "disabled" });

  // Rivalry game: beat Jordan -> strength 80 -> 84.
  await page.click('[data-action="rivalry-game"][data-won="1"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(panelState);
  check(`[${tag}] rivalry win moves strength to 84`, state.text.includes("84/100"), state.result);

  // Record a historical divergence.
  await page.fill("#rel-dv-subject", "1996 draft");
  await page.fill("#rel-dv-real", "Kobe goes 13th to Charlotte");
  await page.fill("#rel-dv-new", "Kobe goes 1st to Philadelphia");
  await page.fill("#rel-dv-cause", "you traded up");
  await page.click('[data-action="record-divergence"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(panelState);
  check(`[${tag}] divergence headline appears in the legacy record`, state.text.includes("历史偏离：1996 draft"), state.result);

  // Reload: the record persists (saved via saveAccount).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-relationships")?.classList.contains("active"), null, { timeout: 60000 });
  await page.waitForTimeout(300);
  state = await page.evaluate(panelState);
  check(`[${tag}] record persists across reload`, ["Kobe Bryant", "84/100", "fulfilled", "历史偏离：1996 draft"].every((s) => state.text.includes(s)), state.text.slice(0, 300));
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.screenshot({ path: `${OUT}/${tag}-panel-persisted.png`, fullPage: true, animations: "disabled" });
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
const failed = report.filter((r) => r.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
