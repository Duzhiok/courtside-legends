import { chromium } from "playwright-core";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const home = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "domcontentloaded" }); await home();
  check(`[${tag}] app boots with no module/page errors (app.js imports still resolve)`, errors.length === 0, errors.join(" | "));
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js"); const pl = await import("/js/data/players.js");
    const co = await import("/js/data/coaches.js"); const g = await import("/js/data/gacha.js");
    const a = acc.createAccount("gift QA");
    a.playerIds = pl.PLAYERS.filter((p) => pl.overall(p) < 70).slice(0, 12).map((p) => p.id);
    a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId];
    a.gacha = { ...g.freshGachaState(), hadAllstar: true };   // newbie guarantee already spent
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" }); await home();
  await page.click("#btn-daily-draw"); await page.waitForSelector("#screen-draw.active");
  await page.evaluate(() => { Math.random = () => 0.5; });   // same card every pull → pull 1 new, 2..7 duplicates
  const texts = [];
  for (let i = 0; i < 7; i++) {
    await page.evaluate(async () => {            // a free pull each time, and settle the pending 成色 choice
      const acc = await import("/js/data/account.js"); const a = acc.getAccount(); a.lastDailyDraw = null; acc.saveAccount(a);
    });
    await page.evaluate(() => document.querySelector("[data-roll-keep=old]")?.click());
    await page.reload({ waitUntil: "domcontentloaded" }); await home();
    await page.click("#btn-daily-draw"); await page.waitForSelector("#screen-draw.active");
    await page.evaluate(() => { Math.random = () => 0.5; });
    const before = await page.$eval("#draw-stage", (n) => n.innerHTML);
    await page.click("#btn-draw-pull");
    await page.waitForFunction((b) => document.querySelector("#draw-stage").innerHTML !== b, before, { timeout: 15000 });
    const t = await page.$eval(".draw-reveal", (n) => n.innerText.replace(/\s+/g, " "));
    texts.push(t);
    if (i === 5) { const stage = await page.$("#draw-stage"); await stage.scrollIntoViewIfNeeded(); await stage.screenshot({ path: `${OUT}-${tag}.png` }); }
    await page.evaluate(async () => { const acc = await import("/js/data/account.js"); const a = acc.getAccount(); if (a.pendingRoll) { const g = await import("/js/data/accountGacha.js"); g.resolvePendingRoll(a, false); } });
  }
  const gifts = texts.map((t) => (t.match(/满星礼物：获得技能「([^」]+)」/) || [])[1] || null);
  const stars = texts.map((t) => (t.match(/升星 ★(\d)/) || [])[1] || null);
  check(`[${tag}] pull 1 is new, pulls 2–6 are ★1…★5`, stars.slice(1, 6).join() === "1,2,3,4,5" && !stars[0], `stars=${stars.join(",")}`);
  check(`[${tag}] no gift on pulls 1–5`, gifts.slice(0, 5).every((g) => !g), JSON.stringify(gifts.slice(0, 5)));
  check(`[${tag}] gift announced on the 5th duplicate (★5)`, !!gifts[5], gifts[5] || "none");
  check(`[${tag}] the gifted skill chip is on the revealed card`, gifts[5] ? texts[5].split(`满星礼物：获得技能「${gifts[5]}」`).join("").includes(gifts[5]) : false);
  check(`[${tag}] the 6th duplicate converts to 球魂 with no second gift`, !gifts[6] && /球魂/.test(texts[6]), texts[6].slice(0, 90));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(`[${tag}] no horizontal overflow`, !overflow);
  check(`[${tag}] no page errors during the run`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(out.join("\n")); process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);
