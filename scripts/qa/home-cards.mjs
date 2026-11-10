// Browser QA: home mode-card grid. Every card in a panel must be a sane width (no lone sliver), the grid is two
// columns on desktop and one on mobile, and nothing overflows horizontally. The Career panel is the exception:
// four identity cards in one row on desktop, 2x2 on tablet, one column on phones.
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
    const expectCols = cat === "career" ? (width <= 560 ? 1 : width <= 900 ? 2 : 4) : (width <= 640 ? 1 : 2);
    check(`[${tag}/${cat}] grid has ${expectCols} column(s)`, info.cols === expectCols, `cols=${info.cols}`);
    const bad = info.lonely.filter((k) => k.w < info.gw - 4);
    check(`[${tag}/${cat}] no card sits alone at partial width`, bad.length === 0, bad.map((k) => `${k.name}:${k.w}/${info.gw}`).join(", "));
    const narrow = info.cards.filter((k) => k.w < Math.min(260, info.gw / info.cols - 20));
    check(`[${tag}/${cat}] no sliver-narrow card`, narrow.length === 0, narrow.map((k) => `${k.name}:${k.w}`).join(", "));
    check(`[${tag}/${cat}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (cat === "career") {
      const polish = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.home-category-panel[data-category="career"] .mode-card')];
        const gallery = document.querySelector("#mw-legends-gallery");
        const bar = document.querySelector("#account-home-bar").getBoundingClientRect();
        return {
          identities: cards.map((c) => c.dataset.careerIdentity ?? ""),
          dark: cards.map((c) => getComputedStyle(c).backgroundImage.includes("linear-gradient")),
          tags: cards.map((c) => c.querySelector(".mode-tag")?.textContent.trim() ?? ""),
          tagFirst: cards.map((c) => { const t = c.querySelector(".mode-tag"), st = c.querySelector("strong"); return !!t && !!st && t.getBoundingClientRect().bottom <= st.getBoundingClientRect().top + 1; }),
          statuses: [...document.querySelectorAll(".career-status")].map((el) => el.textContent.trim()),
          detailCounts: cards.map((c) => c.querySelectorAll(".career-detail").length),
          galleryHiddenHere: !gallery?.offsetParent,
          barH: Math.round(bar.height),
        };
      });
      check(`[${tag}] four career identities in order (Player/Coach/GM/GM+Coach)`, JSON.stringify(polish.identities) === JSON.stringify(["player", "coach", "gm", "gm_coach"]), polish.identities.join(","));
      check(`[${tag}] all four career cards share the dark card style`, polish.dark.length === 4 && polish.dark.every(Boolean), JSON.stringify(polish.dark));
      check(`[${tag}] each career card has a positioning tag above its title`, polish.tags.every((t) => t.length > 3) && polish.tagFirst.every(Boolean), polish.tags.join(" | "));
      check(`[${tag}] career statuses are honest (dev/dev/awaiting/playable)`, JSON.stringify(polish.statuses) === JSON.stringify(["开发中", "开发中", "待独立身份实现", "经典玩法可玩"]), polish.statuses.join(" | "));
      check(`[${tag}] each career card explains control, progression and challenge`, polish.detailCounts.every((n) => n >= 3), polish.detailCounts.join(","));
      check(`[${tag}] the legends gallery is not shown under the career tab (My World only)`, polish.galleryHiddenHere);
      check(`[${tag}] the account bar is compact`, polish.barH <= (width <= 640 ? 150 : 72), `${polish.barH}px`);
    }
    await page.screenshot({ path: `${OUT}/${tag}-${cat}.png`, fullPage: true, animations: "disabled" });
  }
  // Career entry interactions: each scenario reloads fresh so navigation in
  // one scenario cannot break the next.
  const freshCareer = async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
    await page.click('.home-tab[data-category="career"]');
    await page.waitForTimeout(300);
  };
  // Player / Coach are in development: clicking shows an honest note, never a flow.
  await freshCareer();
  await page.click('[data-career-identity="player"]');
  await page.waitForTimeout(200);
  const playerNote = await page.evaluate(() => {
    const note = document.querySelector("#career-entry-note");
    return { visible: !note.hidden, text: note.textContent.trim(), stillHome: document.querySelector("#screen-home")?.classList.contains("active") };
  });
  check(`[${tag}] Player card shows the in-development note without navigating`, playerNote.visible && playerNote.text.includes("开发中") && playerNote.stillHome, playerNote.text);
  // GM + Coach opens the era step; Modern is disabled; Historical reaches the Time Travel screen.
  await freshCareer();
  await page.click('[data-career-identity="gm_coach"]');
  await page.waitForTimeout(200);
  const era = await page.evaluate(() => {
    const panel = document.querySelector("#career-era-panel");
    const modern = document.querySelector('[data-career-era="modern"]');
    return { visible: !panel.hidden, modernDisabled: modern?.disabled === true, modernText: modern?.textContent.trim() ?? "" };
  });
  check(`[${tag}] GM + Coach opens the era step with Modern disabled`, era.visible && era.modernDisabled, JSON.stringify(era));
  await page.screenshot({ path: `${OUT}/${tag}-career-era.png`, fullPage: true, animations: "disabled" });
  await page.click('[data-career-era="historical"]');
  await page.waitForFunction(() => document.querySelector("#screen-time-travel")?.classList.contains("active"), null, { timeout: 10000 });
  check(`[${tag}] Historical era reaches the Time Travel career screen`, true);
  // GM connects to the League Manager (season setup) flow.
  await freshCareer();
  await page.click('[data-career-identity="gm"]');
  await page.waitForFunction(() => document.querySelector("#screen-season")?.classList.contains("active"), null, { timeout: 10000 });
  check(`[${tag}] GM card reaches the League Manager season setup`, true);
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
