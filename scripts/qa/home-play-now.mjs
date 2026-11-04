// Browser E2E for M1 (P0A home IA + Play Now).
// Home hero CTA goes straight into a game; every old mode card still lands
// on its original screen; the Continue panel is rooted on root v3 (never
// two Continue panels at once); EN mode shows no new Chinese copy.
// Usage: node scripts/qa/home-play-now.mjs [outDir] [baseUrl]
// NOTE: needs a Mac (the executablePath below is a Mac Playwright path).
// This script is code-reviewed, not executed, on VMs without a browser.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/home-play-now";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

const browser = await chromium.launch({ executablePath: EXE });

async function openHome(width, height, { lang = null } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.clear();
    sessionStorage.clear();
    if (l) localStorage.setItem("courtside.lang", l);
  }, lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#screen-home")?.classList.contains("active"),
    null,
    { timeout: 60000 },
  );
  return { page, errors };
}

async function clickCardAndExpectScreen(page, selector, screenId, label) {
  await page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
  try {
    await page.waitForFunction(
      (id) => document.querySelector(`#${id}`)?.classList.contains("active"),
      screenId,
      { timeout: 30000 },
    );
    check(label, true);
  } catch {
    check(label, false, `did not reach #${screenId}`);
  }
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#screen-home")?.classList.contains("active"),
    null,
    { timeout: 60000 },
  );
}

for (const [width, height, size] of [
  [1280, 800, "desktop"],
  [390, 844, "mobile"],
]) {
  const { page, errors } = await openHome(width, height);
  const heroCount = await page.evaluate(
    () => document.querySelectorAll(".hero-cta#btn-play-now").length,
  );
  check(`[${size}] exactly one dominant Play Now CTA`, heroCount === 1, `found ${heroCount}`);
  await page.evaluate(() => document.querySelector("#btn-play-now")?.click());
  try {
    await page.waitForFunction(
      () => document.querySelector("#screen-game")?.classList.contains("active"),
      null,
      { timeout: 30000 },
    );
    check(`[${size}] Play Now goes straight into a game (no setup screen)`, true);
  } catch {
    check(`[${size}] Play Now goes straight into a game (no setup screen)`, false);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  check(`[${size}] no horizontal overflow on the game screen`, !overflow);
  check(`[${size}] no page errors during Play Now`, errors.length === 0, errors.join(" | "));
  await page.close();

  // Old cards: same click, same destination screen as before M1.
  const { page: p2 } = await openHome(width, height);
  await clickCardAndExpectScreen(p2, '[data-mode="timeTravel"]', "screen-time-travel", `[${size}] 穿越生涯 card → time-travel screen`);
  await clickCardAndExpectScreen(p2, '[data-mode="custom"]', "screen-custom-hub", `[${size}] 自定义对战 card → custom hub`);
  await clickCardAndExpectScreen(p2, '[data-mode="season"]', "screen-season", `[${size}] 单赛季快玩 card → season screen`);
  await clickCardAndExpectScreen(p2, '[data-mode="tournament"]', "screen-tournament", `[${size}] 多人淘汰赛 card → tournament screen`);
  await clickCardAndExpectScreen(p2, '[data-mode="draft"]', "screen-draft", `[${size}] 选秀建队 card → draft screen`);
  await clickCardAndExpectScreen(p2, '[data-mode="sandbox"]', "screen-sandbox", `[${size}] 时空对决 card → sandbox screen`);
  await clickCardAndExpectScreen(p2, '[data-mode="quick"]', "screen-setup", `[${size}] 快速开打 card → setup screen (behavior unchanged)`);
  await p2.close();
}

// Continue panel: root v3 wins; legacy alone still shows its own bar.
{
  const { page } = await openHome(1280, 800);
  await page.evaluate(async () => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const sr = await import("/js/data/saveRoot.js");
    const sg = await import("/js/data/savegame.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    const root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    sr.writeRootSave(root, localStorage);
    sg.writeSave({ screen: "home", label: "旧版进度" });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#screen-home")?.classList.contains("active"),
    null,
    { timeout: 60000 },
  );
  const bars = await page.evaluate(() => ({
    long: !document.querySelector("#long-career-home-bar")?.hidden,
    legacy: !document.querySelector("#save-home-bar")?.hidden,
  }));
  check("Continue: root career visible, legacy bar hidden (no two panels)", bars.long && !bars.legacy, JSON.stringify(bars));
  await page.evaluate(() => localStorage.removeItem("cls_root_v3"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#screen-home")?.classList.contains("active"),
    null,
    { timeout: 60000 },
  );
  const legacyOnly = await page.evaluate(
    () => !document.querySelector("#save-home-bar")?.hidden,
  );
  check("Continue: legacy-only save still shows its bar", legacyOnly);
  await page.close();
}

// EN mode: new M1 copy must not leak Chinese.
{
  const { page } = await openHome(1280, 800, { lang: "en" });
  const heroText = await page.evaluate(
    () => document.querySelector("#btn-play-now")?.textContent?.trim(),
  );
  check("EN: hero reads Play Now", heroText === "Play Now", `got ${JSON.stringify(heroText)}`);
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.txt`, `${report.join("\n")}\n`);
console.log(report.join("\n"));
if (report.some((line) => line.startsWith("FAIL"))) process.exit(1);
