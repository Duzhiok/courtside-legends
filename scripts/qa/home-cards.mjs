// Browser QA: home mode-card grid. Every card in a panel must be a sane width (no lone sliver), the grid is two
// columns on desktop and one on mobile, and nothing overflows horizontally.
// Usage: node scripts/qa/home-cards.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/home-cards";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  for (const cat of ["players", "career", "custom"]) {
    await page.click(`.home-tab[data-category="${cat}"]`);
    await page.waitForTimeout(300);
    const info = await page.evaluate((c) => {
      const panel = document.querySelector(`.home-category-panel[data-category="${c}"]`);
      const grid = panel.querySelector(".mode-grid");
      const gw = grid.getBoundingClientRect().width;
      const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      const cards = [...panel.querySelectorAll(".mode-card")].map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.querySelector("strong").textContent.trim(), w: Math.round(r.width), left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right) };
      });
      // rows: group cards by top; an isolated card must span the full grid width
      const byTop = new Map();
      for (const k of cards) byTop.set(k.top, [...(byTop.get(k.top) || []), k]);
      const lonely = [...byTop.values()].filter((row) => row.length === 1).map((row) => row[0]);
      return { gw: Math.round(gw), cols, cards, lonely };
    }, cat);
    const expectCols = width <= 640 ? 1 : 2;
    check(`[${tag}/${cat}] grid has ${expectCols} column(s)`, info.cols === expectCols, `cols=${info.cols}`);
    const bad = info.lonely.filter((k) => k.w < info.gw - 4);
    check(`[${tag}/${cat}] no card sits alone at partial width`, bad.length === 0, bad.map((k) => `${k.name}:${k.w}/${info.gw}`).join(", "));
    const narrow = info.cards.filter((k) => k.w < Math.min(260, info.gw / 2 - 20));
    check(`[${tag}/${cat}] no sliver-narrow card`, narrow.length === 0, narrow.map((k) => `${k.name}:${k.w}`).join(", "));
    check(`[${tag}/${cat}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `${OUT}/${tag}-${cat}.png`, fullPage: true, animations: "disabled" });
  }
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}
await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
const failed = report.filter((r) => r.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
