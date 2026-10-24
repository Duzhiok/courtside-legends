import { chromium } from "playwright-core";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
  const home = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" }); await home();
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js"); const pl = await import("/js/data/players.js"); const co = await import("/js/data/coaches.js");
    const a = acc.createAccount("era QA");
    a.playerIds = pl.PLAYERS.filter((p) => pl.overall(p) < 70).slice(0, 12).map((p) => p.id);
    a.onboardingDone = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId];
    a.welcomeGranted = true; a.tickets = 8; a.gacha = { sinceAllstar: 0, sinceLegend: 0, pulls: 20, hadAllstar: true, wishlist: null, souls: {}, extra: null };
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" }); await home();
  await page.click("#btn-daily-draw"); await page.waitForSelector("#screen-draw.active");
  const banners = await page.$$eval(".draw-banner strong", (n) => n.map((e) => e.textContent));
  await page.click(".draw-banner:nth-child(2)");
  let flags = 0, players = 0, coaches = 0, shown = [];
  for (let i = 0; i < 6; i++) {
    await page.click("#btn-draw-pull"); await page.waitForSelector(".draw-reveal");
    const t = await page.textContent(".draw-reveal");
    if (/OVR \d+/.test(t)) { players++; const m = t.match(/池内 (\S+) 档/); if (m) { flags++; shown.push(m[1]); } } else coaches++;
    if (await page.$(".roll-option")) await page.click('[data-roll-keep="old"]');
  }
  check(`[${tag}] every player card from the era banner shows 池内档位`, players > 0 && flags === players, `${banners[1]} → ${shown.join(",")} (${players} players, ${coaches} coaches)`);
  check(`[${tag}] no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(";"));
  await page.close();
}
await browser.close(); console.log(out.join("\n"));
