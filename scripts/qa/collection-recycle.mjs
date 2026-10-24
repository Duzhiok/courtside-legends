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
  const alerts = [];
  page.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  const wait = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await wait();
  const seeded = await page.evaluate(async () => {
    const acc = await import("/js/data/account.js"); const roll = await import("/js/data/cardRoll.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const a = acc.createAccount("QA 教练");
    const pick = (bref, season) => players.PLAYERS.filter((p) => p.bref === bref && p.season === season).sort((x, y) => players.overall(y) - players.overall(x))[0]?.id;
    const stars = [["jordami01",1991],["bryanko01",2006],["jamesle01",2013],["curryst01",2016],["jokicni01",2023],["antetgi01",2020],["duranke01",2014],["hardeja01",2018],["leonaka01",2019],["nashst01",2005],["duncati01",2003],["wadedw01",2009]];
    const junk = [["livinsh01",2015],["farieke01",2012],["bogutan01",2015],["jordami01",1996]];
    a.playerIds = [...stars, ...junk].map(([b, s]) => pick(b, s)).filter(Boolean);
    let bSeed = 1; while (roll.rollGrade(roll.rollOffsets(bSeed).quality) !== "B") bSeed++;
    a.cardMods = Object.fromEntries(a.playerIds.map((id) => [id, { merges: 0, skills: [], roll: bSeed }]));
    a.onboardingDone = true; a.gold = 100; a.fragments = 600;
    a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    a.favoriteId = pick("jordami01", 1991);
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
    return a.playerIds.length;
  });
  check(`[${tag}] seeded cards`, seeded >= 14, String(seeded));
  await page.reload({ waitUntil: "domcontentloaded" });
  await wait();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  await page.click("#btn-open-collection");
  await page.waitForSelector("#screen-collection.active");
  const bar = await page.textContent(".manage-bar");
  check(`[${tag}] capacity + fragments + 图鉴 shown`, /卡库 \d+\/60/.test(bar) && /技能碎片 600/.test(bar) && /图鉴/.test(bar), bar.replace(/\s+/g, " ").slice(0, 110));
  check(`[${tag}] 本命 card has no recycle button`, (await page.$$("[data-recycle]")).length === (await page.$$(".player-card")).length - 1);
  check(`[${tag}] collection: no horizontal overflow`, !(await overflow()));
  const imgW = await page.$eval(".player-card img.headshot", (i) => i.getBoundingClientRect().width);
  check(`[${tag}] headshot is 56px, not full-size`, imgW <= 60, `${Math.round(imgW)}px`);
  const tops = await page.$$eval(".player-card", (n) => n.slice(0, 2).map((e) => Math.round(e.getBoundingClientRect().top)));
  check(`[${tag}] cards layout`, width < 480 ? tops[0] === tops[1] : true, tops.join(","));
  check(`[${tag}] no nested scroller in the grid`, await page.$eval("#collection-grid", (g) => g.scrollHeight <= g.clientHeight + 1));
  await page.screenshot({ path: `${OUT}/${tag}-manage.png`, fullPage: true });

  // junk recycle
  const before = await page.$$eval(".player-card", (n) => n.length);
  const junkBtn = await page.$("[data-recycle-junk]");
  check(`[${tag}] junk button offered`, !!junkBtn);
  if (junkBtn) {
    await junkBtn.click();
    await page.waitForSelector("#app-confirm-dialog[open]");
    const msg = await page.textContent("#app-confirm-message");
    check(`[${tag}] confirm names the payout`, /¤\d+/.test(msg) && /技能碎片/.test(msg), msg.slice(0, 80));
    await page.click("#app-confirm-accept");
    await page.waitForFunction((n) => document.querySelectorAll(".player-card").length < n, before);
    const after = await page.$$eval(".player-card", (n) => n.length);
    check(`[${tag}] junk recycled but ≥12 kept`, after < before && after >= 12, `${before}→${after}`);
  }

  // lineup card → two-step confirm, cancel second
  const lineupBtn = await page.$("[data-recycle]");
  const count1 = await page.$$eval(".player-card", (n) => n.length);
  await lineupBtn.click();
  await page.waitForSelector("#app-confirm-dialog[open]");
  await page.click("#app-confirm-accept");
  await page.waitForFunction(() => /这些卡很可能值得留/.test(document.querySelector("#app-confirm-title")?.textContent || "") && document.querySelector("#app-confirm-dialog[open]"));
  check(`[${tag}] lineup card triggers the second warning`, true, (await page.textContent("#app-confirm-message")).slice(0, 60));
  await page.click("#app-confirm-cancel");
  check(`[${tag}] cancelling keeps the card`, (await page.$$eval(".player-card", (n) => n.length)) === count1);

  // skill shop
  await page.click(".skill-shop summary");
  const firstCard = await page.$eval("[data-shop-card] option:nth-child(2)", (o) => o.value);
  await page.selectOption("[data-shop-card]", firstCard);
  await page.waitForSelector("[data-buy-skill]");
  const rows = await page.$$("[data-buy-skill]");
  check(`[${tag}] shop lists skills`, rows.length > 3, `${rows.length} rows`);
  const enabled = await page.$("[data-buy-skill]:not([disabled])");
  if (enabled) {
    const fragBefore = Number((await page.textContent(".manage-bar")).match(/技能碎片 (\d+)/)[1]);
    await enabled.click();
    await page.waitForFunction((n) => Number(document.querySelector(".manage-bar").textContent.match(/技能碎片 (\d+)/)[1]) < n, fragBefore);
    check(`[${tag}] bought a skill with fragments`, alerts.some((m) => /已学会/.test(m)), alerts.at(-1));
  }
  check(`[${tag}] shop: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-shop.png`, fullPage: true });

  // full binder
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const a = acc.getAccount(acc.getActiveAccountId());
    const filler = (await import("/js/data/players.js")).PLAYERS.slice(0, 60).map((p) => p.id);
    a.playerIds = [...new Set([...a.playerIds, ...filler])].slice(0, 60);
    while (a.playerIds.length < 60) a.playerIds.push(`ghost-${a.playerIds.length}`);
    acc.saveAccount(a);
  });
  await page.click("#btn-collection-back");
  await page.click("#btn-daily-draw");
  await page.waitForSelector("#screen-draw.active");
  const pullText = await page.textContent("#btn-draw-pull");
  check(`[${tag}] full binder disables pull`, /卡库已满/.test(pullText) && (await page.$eval("#btn-draw-pull", (b) => b.disabled)), pullText);

  // rates + wishlist title
  const rules = await page.textContent("#draw-rules");
  check(`[${tag}] rates show 1.7% / 4.5%`, /传奇 1\.7%/.test(rules) && /超巨 4\.5%/.test(rules));
  await page.click(".draw-wishlist summary");
  await page.fill("#wish-search", "黑曼巴");
  await page.click("[data-wish]");
  const panel = await page.textContent("#wish-panel");
  check(`[${tag}] wishlist panel names the wish`, /❤ 当前心愿/.test(panel) && /❤ Kobe Bryant 的赛季卡/.test(panel), panel.replace(/\s+/g, " ").slice(0, 80));
  check(`[${tag}] draw: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-draw2.png`, fullPage: true });

  // sandbox
  await page.click("#btn-draw-back");
  await page.click("#btn-collection-back");
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="sandbox"]').click());
  await page.waitForSelector("#screen-sandbox.active");
  await page.fill('[data-search="A"]', "乔丹 1991");
  await page.click('[data-fill="A:0"]');
  const rowsA = await page.$$('[data-roster="A"] li');
  check(`[${tag}] ×5 collapses into one row`, rowsA.length === 1 && /×5/.test(await rowsA[0].textContent()));
  await page.click('[data-more^="A:"]');
  check(`[${tag}] + adds one`, /×6/.test(await page.textContent('[data-roster="A"]')));
  await page.click('[data-remove^="A:"]');
  await page.click('[data-remove^="A:"]');
  check(`[${tag}] − removes one`, /×4/.test(await page.textContent('[data-roster="A"]')));
  const box = await (await page.$("[data-start]")).boundingBox();
  check(`[${tag}] 开打 is a wide primary button`, box.width > width * 0.6 && box.height >= 44, `${Math.round(box.width)}x${Math.round(box.height)}`);
  check(`[${tag}] sandbox: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-sandbox2.png`, fullPage: true });
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
