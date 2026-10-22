import { chromium } from "playwright-core";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const home = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "domcontentloaded" }); await home();
await page.evaluate(async () => {
  const acc = await import("/js/data/account.js"); const pl = await import("/js/data/players.js"); const co = await import("/js/data/coaches.js");
  const a = acc.createAccount("contrast QA"); a.playerIds = pl.PLAYERS.filter((p) => pl.overall(p) < 70).slice(0, 12).map((p) => p.id);
  a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId]; acc.saveAccount(a); acc.setActiveAccountId(a.id);
});
await page.reload({ waitUntil: "domcontentloaded" }); await home();
await page.click("#btn-daily-draw"); await page.waitForSelector("#screen-draw.active");
await page.click(".draw-banner:nth-child(2)");
const targets = { "banner-more summary": ".banner-more summary", "rules summary": ".draw-rules-more summary", "banner subtitle": ".draw-banner:nth-child(2) .tiny", "explain paragraph": ".banner-explain p.tiny", "status line": "#draw-status", "stage placeholder": "#draw-stage .tiny" };
for (const [label, sel] of Object.entries(targets)) {
  const el = await page.$(sel);
  if (!el) { console.log(label.padEnd(20), "ELEMENT NOT FOUND"); continue; }
  await el.scrollIntoViewIfNeeded();
  const info = await el.evaluate((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { color: cs.color, size: cs.fontSize, lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2, h: r.height, text: e.textContent.trim().slice(0, 28), opacity: getComputedStyle(e).opacity }; });
  const shot = (await el.screenshot()).toString("base64");
  const res = await page.evaluate(async ({ shot, color }) => {
    const img = new Image(); img.src = "data:image/png;base64," + shot; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const counts = new Map();
    for (let i = 0; i < d.length; i += 4) { const k = `${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`; counts.set(k, (counts.get(k) || 0) + 1); }
    const [bk] = [...counts].sort((a, b) => b[1] - a[1])[0]; const bg = bk.split(",").map((v) => v * 8 + 4);
    const fg = color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g2, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g2) + 0.0722 * f(b); };
    const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return { ratio: ((l1 + 0.05) / (l2 + 0.05)).toFixed(2), bg: bg.join(","), distinctColors: counts.size };
  }, { shot, color: info.color });
  const lines = Math.round(info.h / info.lh);
  console.log(label.padEnd(20), `"${info.text}"`.padEnd(32), `fg ${info.color}`.padEnd(26), `bg rgb(${res.bg})`.padEnd(22), `contrast ${res.ratio}:1`, res.ratio >= 4.5 ? "OK" : "<<< FAILS AA", `| ${info.size}, ~${lines} line(s), opacity ${info.opacity}`);
}
await browser.close();
