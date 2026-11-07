// Shared home chrome: the landing hero is shown on the default tab only, the other tabs get a compact header so
// their own content starts near the top; the four tab labels stay on one row. Guest + signed-in, zh + en.
// Usage: node scripts/qa/home-shared-layout.mjs /tmp/cls-qa/shared [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, overflowers, shoot } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/shared";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const TABS = ["world", "players", "career", "custom"];
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };

/** Tab labels: one text line each, the bar itself is one row, and the active tab is reachable on screen. */
const tabMetrics = (page) => page.evaluate(() => {
  const bar = document.querySelector(".home-category-tabs");
  const tabs = [...bar.querySelectorAll(".home-tab")];
  const lines = tabs.map((t) => { const r = document.createRange(); r.selectNodeContents(t); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; });
  const tops = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)));
  const active = bar.querySelector(".home-tab.active").getBoundingClientRect();
  const box = bar.getBoundingClientRect();
  return { lines, rows: tops.size, minH: Math.min(...tabs.map((t) => t.getBoundingClientRect().height)),
    activeIn: active.left >= box.left - 1 && active.right <= box.right + 1, scrolls: bar.scrollWidth > bar.clientWidth + 1 };
});

for (const lang of ["zh", "en"]) {
  for (const [w, h, size] of [[1440, 900, "wide"], [1280, 800, "desktop"], [390, 844, "mobile"], [360, 800, "narrow"]]) {
    for (const who of ["guest", "account"]) {
      const tag = `${lang}/${size}/${who}`;
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => localStorage.clear());
      if (who === "account") {
        await page.evaluate(() => import("/js/data/account.js").then((acc) => acc.createAccount("Alpha")));
      }
      await page.evaluate((l) => localStorage.setItem("courtside.lang", l), lang);
      await reload(page);

      // landing: the full hero + Quick Play on the default tab
      const heroH = await page.$eval(".home-banner", (el) => Math.round(el.getBoundingClientRect().height));
      const landing = { hero: heroH };
      const ctaLanding = await page.$eval("#btn-play-now", (el) => Math.round(el.getBoundingClientRect().bottom));
      check(`[${tag}] landing keeps the full hero`, heroH >= (w <= 560 ? 250 : 200), `${heroH}px`);
      check(`[${tag}] landing Quick Play above the fold`, ctaLanding <= h, `${ctaLanding}`);

      for (const id of TABS) {
        await page.click(`.home-tab[data-category="${id}"]`);
        await page.evaluate(() => scrollTo(0, 0));
        const m = await tabMetrics(page);
        check(`[${tag}/${id}] tab labels are one line each`, m.lines.every((n) => n === 1), m.lines.join());
        check(`[${tag}/${id}] tab bar is one row`, m.rows === 1);
        check(`[${tag}/${id}] touch targets >= 36px`, m.minH >= 36, `${Math.round(m.minH)}`);
        check(`[${tag}/${id}] active tab visible in the bar`, m.activeIn);
        check(`[${tag}/${id}] no horizontal page overflow`, await noOverflow(page), (await overflowers(page)).join(" ; "));
        const cta = await page.$eval("#btn-play-now", (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, w: r.width }; });
        check(`[${tag}/${id}] Quick Play visible`, cta.top >= 0 && cta.bottom <= h && cta.w > 0, `${Math.round(cta.top)}-${Math.round(cta.bottom)}`);
        const panelTop = await page.$eval(`.home-category-panel[data-category="${id}"]`, (el) => Math.round(el.getBoundingClientRect().top + scrollY));
        const limit = id === "career" ? Infinity : (w <= 560 ? 380 : 320);
        check(`[${tag}/${id}] panel content starts near the top`, panelTop <= limit, `${panelTop}px`);
        const bannerH = await page.$eval(".home-banner", (el) => Math.round(el.getBoundingClientRect().height));
        if (id !== "career") check(`[${tag}/${id}] compact header`, bannerH < heroH * 0.5, `${bannerH}px vs ${landing.hero}px`);
        else check(`[${tag}/${id}] default tab keeps the full hero`, Math.abs(bannerH - heroH) <= 3, `${bannerH} vs ${heroH}`);
        if (who === "guest" && id === "world" && lang === "zh") await shoot(page, `${OUT}/${size}-world.png`);
        if (who === "guest" && id === "career" && lang === "zh") await shoot(page, `${OUT}/${size}-career.png`);
      }

      // keyboard: the active tab can take focus and arrow/Tab reaches the others
      await page.focus('.home-tab[data-category="world"]');
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.dataset?.category);
      check(`[${tag}] keyboard Tab moves through tabs`, focused === "players", String(focused));
      await page.keyboard.press("Enter");
      const nowActive = await page.$eval(".home-tab.active", (el) => el.dataset.category);
      check(`[${tag}] Enter activates the focused tab`, nowActive === "players", nowActive);

      check(`[${tag}] no page errors`, !errors.length, errors.join(" | ").slice(0, 160));
      await page.close();
    }
  }
}
await browser.close();
console.log(out.join("\n"));
console.log(`${out.filter((l) => l.startsWith("PASS")).length}/${out.length} passed`);
