// Screenshot tour of the time-travel career screen in its main states (for design review, not
// assertions): create form, interview offers, active career (intro decision / story event /
// finance), renewal, fired. Built from the REAL engine, written to localStorage, read by the real UI.
// Usage: node scripts/qa/tt-shots.mjs [outDir] [baseUrl] [tag]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/tt";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const TAG = process.argv[4] || "before";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });

async function boot(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  return page;
}

/** seed(root-mutator source) runs in-page on a freshly accepted 1995 career. */
async function seedCareer(page, mutateSrc = "") {
  await page.evaluate(async (src) => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const sr = await import("/js/data/saveRoot.js");
    const cc = await import("/js/modes/careerContract.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    let root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    if (src) root = await new Function("root", "cc", `return (async () => { ${src} })()`)(root, cc);
    sr.writeRootSave(root, localStorage);
  }, mutateSrc);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  await page.waitForTimeout(500);
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${TAG}-${name}.png`, fullPage: true });

for (const [w, h, tag] of [[1280, 800, "d"], [390, 844, "m"]]) {
  // 1. create form + interview offers
  let page = await boot(w, h);
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  await page.waitForTimeout(400);
  await shot(page, `${tag}-1-create`);
  await page.evaluate(() => document.querySelector("#btn-time-travel-interview").click());
  await page.waitForTimeout(800);
  await shot(page, `${tag}-2-offers`);
  await page.evaluate(() => document.querySelector(".tt-offer")?.click());
  await page.waitForTimeout(300);
  await shot(page, `${tag}-2b-offer-selected`);
  await page.close();

  // 2. fresh career: intro decision card
  page = await boot(w, h);
  await seedCareer(page);
  await shot(page, `${tag}-3-intro-decision`);
  await page.evaluate(() => document.querySelector('[data-story-choice="keep-quiet"]')?.click());
  await page.waitForTimeout(300);
  await shot(page, `${tag}-3b-intro-selected`);
  await page.evaluate(() => document.querySelector("#time-travel-decision .tt-confirm [data-act=confirm]")?.click());
  await page.waitForTimeout(500);
  await shot(page, `${tag}-4-active`);
  await page.close();

  // 3. renewal pending (5 seasons of history)
  page = await boot(w, h);
  await seedCareer(page, `
    const hist = Array.from({ length: 5 }, (_, i) => ({ year: 1995 + i, teamId: root.story.employer, teamName: "Bulls", record: { w: 52 + i, l: 30 - i }, finish: i < 2 ? "champion" : "playoffs", championId: i < 2 ? root.story.employer : "LAL" }));
    root = { ...root, leagueCareer: { ...root.leagueCareer, management: { ...root.leagueCareer.management, seasonHistory: hist } } };
    root = cc.evaluateCareerEmployment(root);
    return root;`);
  await shot(page, `${tag}-5-renewal`);
  await page.close();

  // 4. fired
  page = await boot(w, h);
  await seedCareer(page, `
    const hist = [0, 1].map((i) => ({ year: 1995 + i, teamId: root.story.employer, teamName: "Bulls", record: { w: 28 - i, l: 54 + i }, finish: "lottery", championId: "LAL" }));
    root = { ...root, leagueCareer: { ...root.leagueCareer, management: { ...root.leagueCareer.management, seasonHistory: hist } } };
    root = cc.evaluateCareerEmployment(root);
    return root;`);
  await shot(page, `${tag}-6-fired`);
  await page.close();
}
await browser.close();
console.log("done ->", OUT);
