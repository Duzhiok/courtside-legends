// Browser QA for B46 / ADR-008 N-1: the home page's four spaces under their approved (Q2) names.
//   - zh and en, desktop 1280 and phone 390: the four tabs carry the approved names, each tab is ONE line
//     (我的篮球人生 is longer than the old 我的世界), and the tab bar does not overflow the page.
//   - clicking a tab shows exactly its own panel; the three mode panels show their hint, the world panel renders.
//   - the existing ?reborn=1 deep link still lands in Player Reborn (no routing or id changed).
// Usage: node scripts/qa/home-four-spaces.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, settled, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/home-four-spaces";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

const NAMES = {
  zh: { world: "我的篮球人生", players: "我的球队", career: "传奇生涯", custom: "自由球场" },
  en: { world: "My World", players: "My Team", career: "Career", custom: "Playground" },
};

const browser = await chromium.launch({ executablePath: EXE });

async function open(width, height, lang, query = "") {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => { localStorage.clear(); localStorage.setItem("courtside.lang", l); }, lang);
  await page.goto(BASE + query, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await settled(page);
  return { page, errors };
}

for (const lang of ["zh", "en"]) {
  for (const [vp, width, height] of [["desktop", 1280, 800], ["mobile", 390, 844]]) {
    const tag = `${lang} ${vp}`;
    const { page, errors } = await open(width, height, lang);
    const tabs = await page.$$eval(".home-tab[data-category]", (els) => els.map((el) => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4;
      const range = document.createRange();
      range.selectNodeContents(el);
      return { id: el.dataset.category, text: el.textContent.trim(), lines: Math.round(range.getBoundingClientRect().height / lineHeight), right: el.getBoundingClientRect().right };
    }));
    check(`[${tag}] four tabs with the approved names, in order`, JSON.stringify(tabs.map((t) => [t.id, t.text])) === JSON.stringify(Object.entries(NAMES[lang])), tabs.map((t) => t.text).join(" | "));
    check(`[${tag}] every tab label is one line`, tabs.every((t) => t.lines === 1), tabs.map((t) => `${t.text}:${t.lines}`).join(" "));
    check(`[${tag}] the tab bar fits the viewport`, tabs.every((t) => t.right <= width), `rightmost ${Math.max(...tabs.map((t) => t.right)).toFixed(0)} of ${width}`);
    check(`[${tag}] no horizontal overflow`, await noOverflow(page));

    for (const id of Object.keys(NAMES[lang])) {
      await page.click(`.home-tab[data-category="${id}"]`);
      const state = await page.evaluate((cat) => {
        const visible = [...document.querySelectorAll(".home-category-panel[data-category]")].filter((p) => !p.hidden).map((p) => p.dataset.category);
        const panel = document.querySelector(`.home-category-panel[data-category="${cat}"]`);
        const hint = panel.querySelector(".home-category-hint")?.textContent.trim() || "";
        return { visible, hint, selected: document.querySelector(`.home-tab[data-category="${cat}"]`).getAttribute("aria-selected"), hasContent: panel.textContent.trim().length > 0 };
      }, id);
      const hintOk = id === "world" ? state.hasContent : state.hint.length > 0 && (lang === "zh" || !/[\u4e00-\u9fff]/.test(state.hint));
      check(`[${tag}] tab ${id} shows only its own panel${id === "world" ? " (rendered)" : " with its hint"}`,
        state.visible.length === 1 && state.visible[0] === id && state.selected === "true" && hintOk, id === "world" ? "" : state.hint.slice(0, 60));
    }
    await page.click('.home-tab[data-category="world"]');
    await shoot(page, `${OUT}/${lang}-${vp}-home.png`);
    check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" / "));
    await page.close();
  }
}

// The existing query-param deep link still works (routing untouched).
{
  const { page, errors } = await open(390, 844, "zh", "?reborn=1");
  const landed = await page.waitForFunction(() => document.querySelector("#screen-reborn.active"), null, { timeout: 8000 }).then(() => true, () => false);
  check("[deep link] ?reborn=1 still opens Player Reborn", landed);
  check("[deep link] no page errors", errors.length === 0, errors.slice(0, 2).join(" / "));
  await page.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
