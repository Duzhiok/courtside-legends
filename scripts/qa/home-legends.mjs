import { chromium } from "playwright-core";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const BAD = ["signed_basketball", "signed_Lakers_jersey", "Laney_High_School", "Cardinal_Law", "bus_station", "thumbnail.jpg", "signs_basketball_for_Airman", "Magic_Johnson_and_Kareem"];
for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#home-legends-wall .legend-tile", { timeout: 60000 });
  await page.waitForTimeout(6000); // let remote portraits load
  const tiles = await page.$$eval("#home-legends-wall .legend-tile", (n) => n.map((t) => ({ name: t.querySelector("strong").textContent, src: decodeURIComponent(t.querySelector("img").src), ok: t.querySelector("img").complete && t.querySelector("img").naturalWidth > 0 })));
  const modeSrcs = await page.$$eval(".mode-card-photo img", (n) => n.map((i) => decodeURIComponent(i.src)));
  const all = [...tiles.map((t) => t.src), ...modeSrcs];
  check(`[${tag}] no blocked file anywhere on the home page`, !all.some((u) => BAD.some((b) => u.includes(b))), `${all.length} images checked`);
  const jordan = tiles.find((t) => t.name.includes("乔丹"));
  check(`[${tag}] Jordan tile uses the headshot fallback`, !!jordan && /jordami01\.jpg$/.test(jordan.src), jordan?.src.slice(-60));
  const unloaded = tiles.filter((t) => !t.ok);
  const envOnly = unloaded.every((t) => /cdn\.nba\.com/.test(t.src));
  check(`[${tag}] tiles rendered (cdn.nba.com is unreachable from this sandbox, so those are skipped)`, unloaded.length === 0 || envOnly, unloaded.map((t) => `${t.name}:${t.src.slice(-30)}`).join(", ") || `${tiles.length} tiles`);
  check(`[${tag}] no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(";"));
  await (await page.$("#home-legends-wall")).screenshot({ path: `${OUT}/${tag}-legends-wall.png` });
  await page.close();
}
await browser.close(); console.log(out.join("\n"));
