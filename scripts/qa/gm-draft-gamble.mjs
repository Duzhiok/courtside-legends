// Browser QA: GM draft gamble — the 1996 scouting/draft slice (workstream C).
// Verifies the full player journey in the real UI (desktop + mobile):
// scout board (14 prospects, bands only) → tryout → pick trade (both picks
// for #5, accepted) → draft at #5 (Kobe) → three-year review labelled as a
// projection → reload restores the review. Each viewport gets a fresh
// browser context so the runs do not share localStorage.
// Usage: node scripts/qa/gm-draft-gamble.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/gm-draft-gamble";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());

  await page.goto(`${BASE}?draft-gamble=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#screen-draft-gamble")?.classList.contains("active")
      && document.querySelectorAll("#screen-draft-gamble .dg-prospect").length === 14,
    null,
    { timeout: 60000 },
  );
  const scout = await page.evaluate(() => {
    const body = document.querySelector("#screen-draft-gamble");
    return {
      prospects: body.querySelectorAll(".dg-prospect").length,
      reports: body.querySelectorAll(".dg-reports li").length,
      budget: body.textContent.includes("试训（剩余3）"),
      noPotentialAttr: !body.querySelector("[data-potential]"),
      kobe: body.textContent.includes("Kobe Bryant"),
    };
  });
  check(`[${tag}] scout board: 14 prospects`, scout.prospects === 14, `got ${scout.prospects}`);
  check(`[${tag}] scout board: 3 reports per prospect (42)`, scout.reports === 42, `got ${scout.reports}`);
  check(`[${tag}] scout board: tryout budget starts at 3`, scout.budget);
  check(`[${tag}] scout board: no data-potential attribute in the DOM`, scout.noPotentialAttr);
  check(`[${tag}] scout board: Kobe is on the board`, scout.kobe);
  await page.screenshot({ path: `${OUT}/${tag}-scout.png`, fullPage: true, animations: "disabled" });

  // Tryout: one click spends one of the three tryouts.
  await page.locator('[data-action="tryout"]').first().click();
  await page.waitForFunction(
    () => document.querySelector("#screen-draft-gamble").textContent.includes("试训（剩余2）"),
    null,
    { timeout: 10000 },
  );
  const tryout = await page.evaluate(() => ({
    block: !!document.querySelector("#screen-draft-gamble .dg-tryout"),
  }));
  check(`[${tag}] tryout: result block appears, budget drops to 2`, tryout.block);

  // Negotiation: both picks for #5 — accepted at the default seed (pinned
  // by tests/gmDraftGambleView.test.js). The picks line must then show #5.
  await page.locator('[data-action="neg-target"][data-slot="5"]').click();
  await page.locator('[data-action="neg-give"][data-slot="8"]').click();
  await page.locator('[data-action="neg-give"][data-slot="13"]').click();
  await page.locator('[data-action="neg-offer"]').click();
  await page.waitForFunction(
    () => document.querySelector("#screen-draft-gamble").textContent.includes("交易达成"),
    null,
    { timeout: 10000 },
  );
  const trade = await page.evaluate(() => {
    const neg = document.querySelector("#screen-draft-gamble .dg-neg");
    return { picksLine: neg?.textContent || "" };
  });
  check(`[${tag}] trade: #5 is now yours after giving #8 + #13`, /你手里的签位：[^。]*#5/.test(trade.picksLine), trade.picksLine.slice(0, 80));
  await page.screenshot({ path: `${OUT}/${tag}-trade.png`, fullPage: true, animations: "disabled" });

  // Draft: start, and the user pick is #5 (not #8) after the trade.
  await page.locator('[data-action="start-draft"]').click();
  await page.waitForFunction(
    () => document.querySelector("#screen-draft-gamble").textContent.includes("轮到你了：第 5 顺位"),
    null,
    { timeout: 10000 },
  );
  const draft = await page.evaluate(() => ({
    slots: document.querySelectorAll("#screen-draft-gamble .dg-slots li").length,
  }));
  check(`[${tag}] draft: 14 slots on the board`, draft.slots === 14, `got ${draft.slots}`);
  await page.screenshot({ path: `${OUT}/${tag}-draft-pick.png`, fullPage: true, animations: "disabled" });

  // Pick Kobe at #5; the draft completes and the review button appears.
  await page.locator('[data-action="pick"]', { hasText: "Kobe" }).click();
  await page.waitForFunction(
    () => !!document.querySelector('[data-action="run-review"]'),
    null,
    { timeout: 10000 },
  );
  await page.locator('[data-action="run-review"]').click();
  await page.waitForFunction(
    () => document.querySelector("#screen-draft-gamble").textContent.includes("三年推演"),
    null,
    { timeout: 10000 },
  );
  const review = await page.evaluate(() => {
    const body = document.querySelector("#screen-draft-gamble");
    return {
      grade: /评级 [ABCD]/.test(body.textContent),
      disclaimer: body.textContent.includes("不是真实比赛结果"),
      kobeRow: body.textContent.includes("Kobe Bryant"),
    };
  });
  check(`[${tag}] review: verdict grade renders`, review.grade);
  check(`[${tag}] review: labelled a projection, not real results`, review.disclaimer);
  check(`[${tag}] review: Kobe's three-year arc renders`, review.kobeRow);
  await page.screenshot({ path: `${OUT}/${tag}-review.png`, fullPage: true, animations: "disabled" });

  // Reload: the saved run restores straight into the review phase.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#screen-draft-gamble")?.classList.contains("active")
      && document.querySelector("#screen-draft-gamble").textContent.includes("三年推演"),
    null,
    { timeout: 60000 },
  );
  check(`[${tag}] reload: review phase restored from the saved run`, true);

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await context.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
process.exit(failed ? 1 : 0);
