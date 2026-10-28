// R84 QA: live-court play-feed column vs coach-panel equal-height fix.
// Was: .court-wrap only had min-height, so as the feed/coach-panel content changed over a game
// the whole row kept re-flowing and the two sides visibly "jumped" relative to each other
// (user complaint: 播报框和右边战术框的高度随比赛内容一直在跳). Fixed by giving .court-wrap a
// real fixed desktop height and letting each side scroll internally instead.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/court-panel-height";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function seedAndEnterLiveGame(page) {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount("R84 QA");
    const maxPlayers = 12;
    const perPlayerCap = Math.floor(1950 / maxPlayers);
    const sorted = players.PLAYERS
      .map((p) => ({ id: p.id, bref: p.bref, ovr: players.overall(p), sal: market.playerSalary(p) }))
      .filter((p) => p.sal <= perPlayerCap)
      .sort((x, y) => y.ovr - x.ovr);
    const picked = [];
    const seenPeople = new Set();
    let budget = 0;
    for (const p of sorted) {
      if (picked.length >= maxPlayers) break;
      if (p.bref && seenPeople.has(p.bref)) continue;
      if (budget + p.sal > 1950) continue;
      picked.push(p.id);
      if (p.bref) seenPeople.add(p.bref);
      budget += p.sal;
    }
    a.playerIds = picked;
    a.onboardingDone = true; a.gold = 500; a.fragments = 200;
    a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.click('.mode-card[data-mode="season"]');
  await page.waitForSelector("#screen-season.active");
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click("#btn-season-play");
  await page.waitForSelector("#screen-setup.active", { timeout: 10000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 10000 });
}

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seedAndEnterLiveGame(page);

  // Give the clock a moment to tick and the feed to append a few events, exactly the
  // "随着时间和播报一直在跳" scenario from the user's screenshot.
  await page.waitForTimeout(2500);

  const rects1 = await page.evaluate(() => {
    const col = document.querySelector(".court-column")?.getBoundingClientRect();
    const panel = document.querySelector(".coach-panel")?.getBoundingClientRect();
    return { col: col && { top: col.top, height: col.height }, panel: panel && { top: panel.top, height: panel.height } };
  });

  await page.waitForTimeout(3000); // more feed lines land, coach-panel content re-renders (tactics/rotation)

  const rects2 = await page.evaluate(() => {
    const col = document.querySelector(".court-column")?.getBoundingClientRect();
    const panel = document.querySelector(".coach-panel")?.getBoundingClientRect();
    return { col: col && { top: col.top, height: col.height }, panel: panel && { top: panel.top, height: panel.height } };
  });

  await page.screenshot({ path: `${OUT}/${tag}-live-court.png` });

  if (tag === "desktop") {
    // The LEFT column (court + legend + play-feed stacked) vs the RIGHT coach panel are the two
    // grid siblings the user is actually comparing side by side -- the feed alone is shorter
    // than the panel by design (it shares its column with the 300px court above it).
    check(`[${tag}] left column (court+feed) and right coach-panel are the same total height`,
      Math.abs(rects1.col.height - rects1.panel.height) <= 2,
      `col=${rects1.col.height.toFixed(1)} panel=${rects1.panel.height.toFixed(1)}`);
    check(`[${tag}] both start at the same top (true side-by-side alignment, not offset)`,
      Math.abs(rects1.col.top - rects1.panel.top) <= 2,
      `col.top=${rects1.col.top.toFixed(1)} panel.top=${rects1.panel.top.toFixed(1)}`);
    check(`[${tag}] heights DON'T drift as the feed/panel content changes over time (the actual bug)`,
      Math.abs(rects1.col.height - rects2.col.height) <= 1 && Math.abs(rects1.panel.height - rects2.panel.height) <= 1,
      `t1 col=${rects1.col.height.toFixed(1)} panel=${rects1.panel.height.toFixed(1)} | t2 col=${rects2.col.height.toFixed(1)} panel=${rects2.panel.height.toFixed(1)}`);
  } else {
    // Mobile stacks single-column and lets the page scroll naturally -- a tall coach-panel full
    // of content is expected there, not a bug. Just confirm the stacking order makes sense.
    const order = await page.evaluate(() => {
      const wrap = document.querySelector(".court-wrap");
      return [...wrap.children].map((c) => c.className);
    });
    check(`[${tag}] mobile still stacks court-column above coach-panel (single column, correct order)`,
      order[0]?.includes("court-column") && order[1]?.includes("coach-panel"), order.join(" | "));
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`[${tag}] no horizontal overflow`, !overflow);

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}

await run(1280, 900, "desktop").catch((e) => check("[desktop] run() crashed", false, e.message));
await run(390, 844, "mobile").catch((e) => check("[mobile] run() crashed", false, e.message));
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("FAIL")).length} failing / ${report.length} total`);
