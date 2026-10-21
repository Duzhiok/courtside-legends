import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2];
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
mkdirSync(OUT, { recursive: true });

const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const a = acc.createAccount("QA 教练");
    const pick = (bref, season) => players.PLAYERS.find((p) => p.bref === bref && p.season === season)?.id;
    a.playerIds = [pick("livinsh01", 2015), pick("livinsh01", 2016), pick("jokicni01", 2021), pick("curryst01", 2016), pick("greendr01", 2016), pick("thompkl01", 2016), pick("iguodan01", 2015), pick("duranke01", 2014), pick("hardeja01", 2018), pick("leonaka01", 2019), pick("paulch01", 2008), pick("howardw01", 2009), pick("nashst01", 2005), pick("bogutan01", 2015)].filter(Boolean);
    const coaches = await import("/js/data/coaches.js");
    a.coachId = coaches.COACHES[0].id;
    a.coachIds = [a.coachId];
    a.onboardingDone = true;
    a.gold = 1500;
    a.cardMods = { [a.playerIds[2]]: { merges: 2, skills: [] } };
    a.gacha = { souls: { livinsh01: 3 }, wishlist: null, sinceAllstar: 7, sinceLegend: 31 };
    acc.saveAccount(a);
    acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  // Home groups
  const groups = await page.$$eval(".mode-group-label", (els) => els.map((e) => e.textContent.trim().slice(0, 6)));
  check(`[${tag}] home has 4 lanes`, groups.length === 4, groups.join(" | "));
  await page.screenshot({ path: `${OUT}/${tag}-home.png` });

  // Draw screen
  await page.click("#btn-daily-draw");
  await page.waitForSelector("#screen-draw.active");
  check(`[${tag}] 3 banners`, (await page.$$(".draw-banner")).length === 3);
  const status = await page.textContent("#draw-status");
  check(`[${tag}] pity counters shown`, /全明星保底还差 3 抽/.test(status) && /传奇保底还差 19 抽/.test(status), status.replace(/\s+/g, " "));
  await page.click(".draw-banner:nth-child(2)");
  check(`[${tag}] banner select toggles`, await page.$eval(".draw-banner:nth-child(2)", (e) => e.classList.contains("active")));
  await page.click("#btn-draw-pull");
  await page.waitForSelector(".draw-reveal");
  const reveal = await page.textContent(".draw-reveal");
  check(`[${tag}] free pull reveals a card`, reveal.length > 10, reveal.replace(/\s+/g, " ").slice(0, 120));
  const pullLabel = await page.textContent("#btn-draw-pull");
  check(`[${tag}] button switches to gold pull or 成色 choice`, /加抽|成色/.test(pullLabel), pullLabel);
  if (await page.$(".roll-option")) {
    await page.click('[data-roll-keep="new"]');
  }
  await page.click(".draw-wishlist summary");
  await page.fill("#wish-search", "利文斯顿");
  await page.waitForSelector("[data-wish]", { timeout: 5000 }).catch(() => {});
  const wishButtons = await page.$$("[data-wish]");
  check(`[${tag}] wishlist search finds Livingston`, wishButtons.length > 0);
  if (wishButtons.length) {
    await wishButtons[0].click();
    const crafts = await page.$$(".craft-row");
    check(`[${tag}] craft list shows his seasons`, crafts.length > 1, `${crafts.length} rows`);
  }
  await page.fill("#wish-search", "黑曼巴");
  const kobe = await page.textContent("#wish-panel");
  check(`[${tag}] nickname search (黑曼巴)`, /科比|Kobe/.test(kobe));
  check(`[${tag}] draw: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-draw.png`, fullPage: true });

  // Collection
  await page.click("#btn-draw-back");
  await page.waitForSelector("#screen-collection.active", { timeout: 5000 }).catch(() => {});
  if (await page.$("#screen-collection.active")) {
    const grades = await page.$$(".player-card .roll-grade");
    check(`[${tag}] collection shows 成色 grades`, grades.length >= 12, `${grades.length}`);
    const soulBtn = await page.$('[data-soul-star]:not([disabled])');
    check(`[${tag}] 球魂升星 enabled for Livingston (3/3)`, !!soulBtn);
    await page.selectOption('[data-favorite]', "playmaker");
    const fav = await page.$(".favorite-tag");
    check(`[${tag}] 本命 set`, !!fav, fav ? (await fav.textContent()).trim() : "");
    check(`[${tag}] collection: no horizontal overflow`, !(await overflow()));
    await page.screenshot({ path: `${OUT}/${tag}-collection.png`, fullPage: true });
  } else {
    check(`[${tag}] reached collection`, false);
  }

  // Sandbox
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="sandbox"]').click());
  await page.waitForSelector("#screen-sandbox.active");
  await page.fill('[data-search="A"]', "乔丹 1991");
  await page.click('[data-fill="A:0"]');
  await page.fill('[data-search="B"]', "科比 2006");
  await page.click('[data-fill="B:0"]');
  const countA = await page.textContent('[data-count="A"]');
  check(`[${tag}] ×5 fills a side`, /已选 5/.test(countA), countA);
  check(`[${tag}] sandbox: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-sandbox.png`, fullPage: true });
  await page.click("[data-start]");
  await page.waitForSelector("#screen-setup.active", { timeout: 10000 }).catch(() => {});
  check(`[${tag}] 开打 reaches setup`, !!(await page.$("#screen-setup.active")));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
