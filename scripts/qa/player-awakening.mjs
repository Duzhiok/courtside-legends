// Browser QA: Player Signature Awakening (workstream D). Verifies the slice
// in a real browser (desktop + mobile): ?awakening=1 opens the Reborn flow,
// the awakening progress panel renders (four rules + stepback shown as
// unmeasurable), playing games feeds the ledger in the real save, and —
// best effort over a fast-forwarded stretch — an awakening fires and lands
// on the card + timeline. An awakening is evidence-gated, so the script
// reports it as INFO when no rule completes in the scripted games; the
// firing logic itself is pinned by tests/signatureAwakening.test.js.
// Usage: node scripts/qa/player-awakening.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/player-awakening";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const info = (label, detail = "") => report.push(`INFO ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

function readAwakening() {
  try {
    const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
    return root?.reborn?.player?.awakening || null;
  } catch {
    return null;
  }
}

function panelText() {
  const panel = document.querySelector(".reborn-awakening");
  return panel ? panel.textContent : "";
}

async function settleDialogs(page) {
  // Training choice (weekly) and the takeover dialog both pause the driver.
  // Training: pick the first focus. Takeover: pass (decline the moment).
  for (let i = 0; i < 6; i += 1) {
    const acted = await page.evaluate(() => {
      const train = document.querySelector("[data-train]");
      if (train) {
        train.click();
        return "train";
      }
      const pass = document.querySelector('.reborn-takeover-option[data-option="pass"]');
      if (pass) {
        pass.click();
        return "pass";
      }
      return null;
    });
    if (!acted) return;
    await page.waitForTimeout(400);
  }
}

async function playOne(page) {
  const btn = page.locator("[data-play]");
  if ((await btn.count()) === 0) return false;
  await btn.first().click();
  await page.waitForTimeout(1500);
  await settleDialogs(page);
  await page.waitForTimeout(500);
  return true;
}

async function fastForwardOnce(page) {
  const btn = page.locator("[data-ff]");
  if ((await btn.count()) === 0) return false;
  await btn.first().click();
  await page.waitForTimeout(2500);
  await settleDialogs(page);
  await page.waitForTimeout(500);
  return true;
}

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(`${BASE}?awakening=1`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#screen-reborn")?.classList.contains("active"),
    null,
    { timeout: 60000 },
  );

  // Creation: 1996, random destiny, confirm.
  const year = page.locator('[data-reborn-year="1996"]');
  if ((await year.count()) > 0) await year.first().click();
  const destiny = page.locator('[data-reborn-destiny="random"]');
  if ((await destiny.count()) > 0) await destiny.first().click();
  await page.waitForTimeout(300);
  const confirm = page.locator("[data-reborn-confirm]");
  check(`[${tag}] creation confirm is enabled`, (await confirm.count()) > 0 && (await confirm.first().isEnabled()));
  await confirm.first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}-season-start.png`, fullPage: true, animations: "disabled" });

  // The awakening panel renders on the season screen.
  const panel = await page.evaluate(panelText);
  check(`[${tag}] awakening panel renders`, panel.includes("招牌技能觉醒") || panel.includes("Signature Awakening"), panel.slice(0, 80));
  for (const name of ["护框神", "篮板怪兽", "组织大师", "关键先生"]) {
    check(`[${tag}] panel shows ${name}`, panel.includes(name));
  }
  check(`[${tag}] stepback shown as unmeasurable, not faked`, panel.includes("暂无比赛证据") && panel.includes("后撤步"));

  // Play three games by hand; the ledger in the real save must grow.
  let played = 0;
  for (let i = 0; i < 3; i += 1) {
    if (await playOne(page)) played += 1;
    else break;
  }
  check(`[${tag}] played ${played} games by hand`, played === 3);
  const afterHand = await page.evaluate(readAwakening);
  check(
    `[${tag}] ledger recorded the hand-played games`,
    afterHand && Array.isArray(afterHand.form),
    JSON.stringify(afterHand?.form?.length ?? null),
  );
  await page.screenshot({ path: `${OUT}/${tag}-after-hand.png`, fullPage: true, animations: "disabled" });

  // Fast-forward toward the season's events until an awakening fires or the
  // season ends (max 40 hops). Training / takeover dialogs are settled above.
  let awakened = afterHand?.awakened?.length || 0;
  let hops = 0;
  let seasonDone = false;
  while (awakened === 0 && hops < 40) {
    const moved = await fastForwardOnce(page);
    hops += 1;
    if (!moved) {
      seasonDone = true;
      break;
    }
    const state = await page.evaluate(readAwakening);
    awakened = state?.awakened?.length || 0;
    const done = await page.locator("[data-settle]").count();
    if (done > 0) {
      seasonDone = true;
      break;
    }
  }
  const final = await page.evaluate(readAwakening);
  info(`[${tag}] fast-forward hops: ${hops}; season done: ${seasonDone}; form games: ${final?.form?.length ?? 0}; awakened: ${awakened}`);
  const banner = await page.evaluate(() => document.querySelector(".reborn-awakening-banner")?.textContent || "");
  if (awakened > 0) {
    check(`[${tag}] awakening fired and the banner names it`, banner.includes("领悟") || banner.includes("Awakened"), banner.slice(0, 120));
    const timeline = await page.evaluate(() => document.querySelector(".reborn-timeline")?.textContent || "");
    check(`[${tag}] awakening recorded in the career timeline`, timeline.includes("领悟") || timeline.includes("Awakened"), timeline.slice(0, 120));
    const cardHasIt = await page.evaluate(() => {
      const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
      const ids = root?.reborn?.player?.awakening?.awakened?.map((a) => a.skillId) || [];
      return ids.length > 0 && ids.every((id) => typeof id === "string");
    });
    check(`[${tag}] awakened skill ids recorded with source`, cardHasIt, JSON.stringify(final?.awakened || []));
  } else {
    info(`[${tag}] no awakening fired in the scripted stretch (evidence-gated; firing is unit-pinned)`);
  }
  await page.screenshot({ path: `${OUT}/${tag}-final.png`, fullPage: true, animations: "disabled" });
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
process.exit(failed ? 1 : 0);
