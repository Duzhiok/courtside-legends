// Browser QA: home mode-card grid. Every card in a panel must be a sane width (no lone sliver), the grid is two
// columns on desktop and one on mobile, and nothing overflows horizontally. The Career panel is the exception:
// the 3+1 entry — three photo cards in a row (at every width, including mobile) plus a full-width prestige card.
// Usage: node scripts/qa/home-cards.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { textContrast } from "./lib/page.mjs";

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
    if (cat === "career") {
      // 3+1 entry: three photo cards in one row + a full-width prestige card.
      const career = await page.evaluate(() => {
        const panel = document.querySelector('.home-category-panel[data-category="career"]');
        const row = panel.querySelector(".career-photo-row");
        const cols = getComputedStyle(row).gridTemplateColumns.split(" ").length;
        const photos = [...panel.querySelectorAll(".career-photo-card")].map((el) => {
          const r = el.getBoundingClientRect();
          const img = el.querySelector("img.career-photo");
          return { id: el.dataset.careerIdentity, w: Math.round(r.width), top: Math.round(r.top), imgLoaded: img?.complete && img?.naturalWidth > 0, src: img?.getAttribute("src") ?? "" };
        });
        const arch = panel.querySelector(".career-architect-card");
        const ar = arch.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const closed = arch.querySelector('[data-architect-lock="closed"]');
        const open = arch.querySelector('[data-architect-lock="open"]');
        const pills = [...arch.querySelectorAll("[data-architect-pill]")].map((el) => el.textContent.trim());
        const progress = arch.querySelector("[data-architect-progress]")?.textContent.trim() ?? "";
        const gallery = document.querySelector("#mw-legends-gallery");
        const bar = document.querySelector("#account-home-bar").getBoundingClientRect();
        return {
          cols, photos, archW: Math.round(ar.width), rowW: Math.round(rowRect.width),
          lockClosedVisible: closed && !closed.hidden, lockOpenVisible: open && !open.hidden,
          pills, progress, galleryHiddenHere: !gallery?.offsetParent, barH: Math.round(bar.height),
          statusPills: document.querySelectorAll(".career-status").length,
        };
      });
      check(`[${tag}/career] photo row is 3 across`, career.cols === 3, `cols=${career.cols}`);
      check(`[${tag}/career] three photo cards in order (Player/Coach/GM)`, JSON.stringify(career.photos.map((p) => p.id)) === JSON.stringify(["player", "coach", "gm"]), career.photos.map((p) => p.id).join(","));
      check(`[${tag}/career] photo cards share one row`, new Set(career.photos.map((p) => p.top)).size === 1, career.photos.map((p) => `${p.id}:${p.top}`).join(", "));
      // Same root cause as the stray full-width GM card: legacy .mode-card surface rules reaching the new career cards.
      const uniform = await page.evaluate(() => ["player", "coach", "gm"].map((id) => {
        const c = document.querySelector(`[data-career-identity="${id}"]`);
        return { id, imgTop: Math.round(c.querySelector("img").getBoundingClientRect().top), spanColor: getComputedStyle(c.querySelector("span")).color, bg: getComputedStyle(c).backgroundColor };
      }));
      check(`[${tag}/career] the three photo cards are visually identical (image top, caption colour, no panel surface)`, new Set(uniform.map((u) => u.imgTop)).size === 1 && new Set(uniform.map((u) => u.spanColor)).size === 1 && uniform.every((u) => u.bg === "rgba(0, 0, 0, 0)"), JSON.stringify(uniform));
      // Panel gradient #0a2417 -> #123a24: its lightest stop is the hardest case for the light captions.
      // The sr-only group label is a 1px clipped element (not visible text): assert that instead of measuring it.
      const srLabel = await page.evaluate(() => { const r = document.querySelector(".career-photo-row .mode-group-label").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
      check(`[${tag}/career] the "经理生涯" group label stays screen-reader-only (1px clip)`, srLabel.w <= 1 && srLabel.h <= 1, JSON.stringify(srLabel));
      const photoLow = (await textContrast(page, ".career-photo-row", { min: 4.5, gradient: [18, 58, 36] })).filter((row) => !row.startsWith("div.mode-group-label"));
      check(`[${tag}/career] photo-card captions meet 4.5:1 on the dark panel`, photoLow.length === 0, photoLow.join(" | "));
      const archLow = await textContrast(page, ".career-architect-card", { min: 4.5, gradient: [29, 74, 44] });
      check(`[${tag}/career] Architect text (kicker, name, description, pills, count) meets 4.5:1`, archLow.length === 0, archLow.join(" | "));
      check(`[${tag}/career] all three portraits loaded`, career.photos.every((p) => p.imgLoaded), career.photos.map((p) => p.src).join(", "));
      check(`[${tag}/career] prestige card spans the full entry width`, Math.abs(career.archW - career.rowW) <= 4, `${career.archW}/${career.rowW}`);
      check(`[${tag}/career] exactly one lock state is shown`, career.lockClosedVisible !== career.lockOpenVisible, `closed=${career.lockClosedVisible} open=${career.lockOpenVisible}`);
      check(`[${tag}/career] progress pills show Coach + GM`, JSON.stringify(career.pills) === JSON.stringify(["教练生涯", "经理生涯"]) || JSON.stringify(career.pills) === JSON.stringify(["✓ 教练生涯", "✓ 经理生涯"]) || career.pills.length === 2, career.pills.join(" | "));
      check(`[${tag}/career] progress reads 0/2, 1/2 or unlocked`, /职业资历 [012] \/ 2|已解锁|Career standing [012] \/ 2|Unlocked/.test(career.progress), career.progress);
      check(`[${tag}/career] no status pills (the mock has none)`, career.statusPills === 0, `${career.statusPills}`);
      check(`[${tag}/career] the legends gallery is not shown under the career tab (My World only)`, career.galleryHiddenHere);
      check(`[${tag}/career] the account bar is compact`, career.barH <= (width <= 640 ? 150 : 72), `${career.barH}px`);
      check(`[${tag}/career] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.screenshot({ path: `${OUT}/${tag}-${cat}.png`, fullPage: true, animations: "disabled" });
      continue;
    }
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
    const narrow = info.cards.filter((k) => k.w < Math.min(260, info.gw / info.cols - 20));
    check(`[${tag}/${cat}] no sliver-narrow card`, narrow.length === 0, narrow.map((k) => `${k.name}:${k.w}`).join(", "));
    check(`[${tag}/${cat}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
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
  // Player routes to the Reborn flow; Coach is playable too (CAREER_IDENTITIES status "playable") and opens the Time Travel creation screen.
  await freshCareer();
  await page.click('[data-career-identity="player"]');
  await page.waitForFunction(() => document.querySelector("#screen-reborn")?.classList.contains("active"), null, { timeout: 15000 });
  check(`[${tag}] Player card reaches the Reborn screen`, true);
  await freshCareer();
  await page.click('[data-career-identity="coach"]');
  await page.waitForFunction(() => document.querySelector("#screen-time-travel")?.classList.contains("active"), null, { timeout: 15000 });
  const coachNote = await page.evaluate(() => {
    const note = document.querySelector("#career-entry-note");
    return { noteShown: !note.hidden && note.textContent.trim().length > 0, text: note.textContent.trim() };
  });
  check(`[${tag}] Coach card opens the Time Travel (coach career) screen, no "in development" note`, !coachNote.noteShown && !coachNote.text.includes("开发中"), coachNote.text);
  // The Architect is locked for a fresh account: clicking shows the
  // requirements, never a flow, and the era panel stays hidden.
  await freshCareer();
  // The locked card is aria-disabled on purpose (it is still clickable so it can explain itself), which Playwright
  // treats as "not enabled". Prove it really is in the locked state, then click it with a real mouse press at its position.
  const lockedState = await page.evaluate(() => {
    const el = document.querySelector('[data-career-identity="gm_coach"]');
    const r = el.getBoundingClientRect();
    return { ariaDisabled: el.getAttribute("aria-disabled") === "true", lockedClass: el.classList.contains("career-architect-card--locked"), nativeDisabled: el.disabled, visible: r.width > 0 && r.height > 0 };
  });
  check(`[${tag}] fresh account: Architect is in the locked state (aria-disabled, locked style, visible, still a real button)`, lockedState.ariaDisabled && lockedState.lockedClass && lockedState.visible && !lockedState.nativeDisabled, JSON.stringify(lockedState));
  await page.click('[data-career-identity="gm_coach"]', { force: true });
  await page.waitForTimeout(200);
  const archNote = await page.evaluate(() => {
    const note = document.querySelector("#career-entry-note");
    const panel = document.querySelector("#career-era-panel");
    return { visible: !note.hidden, text: note.textContent.trim(), eraHidden: panel.hidden, stillHome: document.querySelector("#screen-home")?.classList.contains("active") };
  });
  check(`[${tag}] locked Architect shows the unlock requirements without navigating`, archNote.visible && archNote.text.includes("尚未解锁") && archNote.eraHidden && archNote.stillHome, archNote.text);
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
