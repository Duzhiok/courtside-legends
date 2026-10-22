import { chromium } from "playwright-core";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
for (const [w, h, tag] of [[390, 844, "mobile"], [1280, 800, "desktop"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const home = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "domcontentloaded" }); await home();
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js"); const pl = await import("/js/data/players.js"); const co = await import("/js/data/coaches.js");
    const a = acc.createAccount("fold QA"); a.playerIds = pl.PLAYERS.filter((p) => pl.overall(p) < 70).slice(0, 12).map((p) => p.id);
    a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId]; acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" }); await home();
  await page.click("#btn-daily-draw"); await page.waitForSelector("#screen-draw.active");
  await page.click(".draw-banner:nth-child(2)");
  const m = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), h: Math.round(b.height) }; }; return { rules: r("#draw-rules"), banners: r("#draw-banners"), explain: r("#draw-banner-explain"), pull: r("#btn-draw-pull"), vh: innerHeight }; });
  console.log(tag, JSON.stringify(m), "→ pull button", m.pull.top + 44 <= m.vh ? "ABOVE the fold" : `BELOW the fold by ${m.pull.top + 44 - m.vh}px`);
  await page.close();
}
await browser.close();
