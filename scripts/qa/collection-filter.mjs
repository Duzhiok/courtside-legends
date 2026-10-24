import { chromium } from "playwright-core";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
  const home = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" }); await home();
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js"); const roll = await import("/js/data/cardRoll.js"); const pl = await import("/js/data/players.js"); const co = await import("/js/data/coaches.js");
    const a = acc.createAccount("filter QA");
    const pick = (b, s) => pl.PLAYERS.filter((p) => p.bref === b && p.season === s).sort((x, y) => pl.overall(y) - pl.overall(x))[0]?.id;
    const list = [["jordami01",1991],["jordami01",1996],["bryanko01",2006],["jamesle01",2013],["curryst01",2016],["jokicni01",2023],["antetgi01",2020],["duranke01",2014],["hardeja01",2018],["leonaka01",2019],["nashst01",2005],["duncati01",2003],["livinsh01",2015],["farieke01",2012],["bogutan01",2015]];
    a.playerIds = list.map(([b, s]) => pick(b, s)).filter(Boolean);
    let bSeed = 1; while (roll.rollGrade(roll.rollOffsets(bSeed).quality) !== "B") bSeed++;
    a.cardMods = Object.fromEntries(a.playerIds.map((id) => [id, { merges: 0, skills: [], roll: bSeed }]));
    a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" }); await home();
  await page.click("#btn-open-collection"); await page.waitForSelector("#screen-collection.active");
  const total = await page.$$eval(".player-card", (n) => n.length);
  const countText = async () => (await page.textContent("[data-cf-count]")).trim();
  check(`[${tag}] filter bar shows total`, (await countText()) === `显示 ${total}/${total} 张`, await countText());

  const chipTops = await page.$$eval(".player-card", (cards) => {
    const best = cards.map((c) => [...c.querySelectorAll(".skill-chip")]).find((chips) => chips.length >= 2);
    return best ? best.slice(0, 2).map((c) => Math.round(c.getBoundingClientRect().top)) : null;
  });
  check(`[${tag}] skill chips wrap side by side, not full-width bars`, chipTops && chipTops[0] === chipTops[1], String(chipTops));
  await page.fill('[data-cf="query"]', "乔丹");
  const focused = await page.evaluate(() => document.activeElement?.dataset?.cf);
  check(`[${tag}] typing keeps focus in the search box`, focused === "query");
  check(`[${tag}] 乔丹 → 2 cards`, (await page.$$eval(".player-card", (n) => n.length)) === 2, await countText());
  await page.fill('[data-cf="query"]', "乔丹 1996");
  check(`[${tag}] 乔丹 1996 → 1 card`, (await page.$$eval(".player-card", (n) => n.length)) === 1);
  await page.fill('[data-cf="query"]', "zzzz");
  check(`[${tag}] empty result explains itself`, /放宽筛选/.test(await page.textContent("#collection-grid")));
  await page.fill('[data-cf="query"]', "");

  await page.selectOption('[data-cf="sort"]', "season");
  const firstSeasons = await page.$$eval(".player-card", (cards) => cards.slice(0, 3).map((c) => Number(c.querySelector(".meta").textContent.trim().slice(0, 4))));
  check(`[${tag}] sort by season puts newest first`, firstSeasons.length === 3 && firstSeasons[0] >= firstSeasons[1] && firstSeasons[1] >= firstSeasons[2] && firstSeasons[0] === 2023, firstSeasons.join(","));
  await page.selectOption('[data-cf="sort"]', "ovr");

  await page.selectOption('[data-cf="band"]', "low");
  const lowCount = await page.$$eval(".player-card", (n) => n.length);
  check(`[${tag}] 普通 filter narrows the list`, lowCount > 0 && lowCount < total, `${lowCount}/${total}`);
  await page.selectOption('[data-cf="band"]', "all");

  await page.check('[data-cf="junkOnly"]');
  const junkShown = await page.$$eval(".player-card", (n) => n.length);
  const junkBtn = await page.textContent("[data-recycle-junk]").catch(() => "");
  const junkN = Number((junkBtn.match(/（(\d+) 张/) || [])[1] || 0);
  check(`[${tag}] 只看可一键分解 matches the junk button`, junkShown === junkN, `${junkShown} vs ${junkN}${junkN === 0 ? " (every low card rolled S/A this run, so none is junk)" : ""}`);
  await page.uncheck('[data-cf="junkOnly"]');

  await page.check('[data-cf="redundantOnly"]');
  const red = await page.$$eval(".player-card", (n) => n.length);
  check(`[${tag}] 只看冗余版本 → the 1996 Jordan`, red === 1, String(red));
  await page.uncheck('[data-cf="redundantOnly"]');

  // filter survives a re-render (recycling one card re-opens the collection)
  await page.selectOption('[data-cf="band"]', "low");
  const before = await page.$$eval(".player-card", (n) => n.length);
  await page.click("[data-recycle]");
  await page.waitForSelector("#app-confirm-dialog[open]"); await page.click("#app-confirm-accept");
  await page.waitForFunction((n) => document.querySelectorAll(".player-card").length < n, before).catch(() => {});
  check(`[${tag}] filter persists after recycling`, (await page.$eval('[data-cf="band"]', (s) => s.value)) === "low");
  check(`[${tag}] no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await page.screenshot({ path: `${OUT}/${tag}-filter.png`, fullPage: false });
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(";"));
  await page.close();
}
await browser.close(); console.log(out.join("\n"));
