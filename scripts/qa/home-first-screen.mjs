// Browser QA for B15/B16/B17 — the home page's first screen.
//   B15  the hero CTA and the `quick` card must not carry the same name (zh and en).
//   B16  the one main CTA is fully inside the first screen, and it is the ONLY visible primary
//        button there -- with a saved career too, which is when the Continue bars push it down.
//   B17  the text that sits on a plain (solid) background reaches WCAG AA: the hint under the hero CTA,
//        the Continue bars, the category hint. NOT measured: the banner and the dark featured mode
//        cards -- their backgrounds are gradients/images, which textContrast cannot read (it would call
//        white-on-dark "1.0:1"). Those are judged on the screenshot.
// Network is blocked (every non-local host aborts), so nothing depends on fonts or CDNs.
// Seeds the career save only AFTER the roster has loaded: createTimeTravelPrologue needs PLAYERS.
// Usage: node scripts/qa/home-first-screen.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive, settled, imagesReady, noOverflow, textContrast } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/home-first-screen";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

const browser = await chromium.launch({ executablePath: EXE });

async function openHome(width, height, { lang = "zh", withCareer = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("courtside.lang", l); }, lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page); // roster is loaded once the home screen is active
  if (withCareer) {
    await page.evaluate(async () => {
      const ttc = await import("/js/modes/timeTravelCareer.js");
      const sr = await import("/js/data/saveRoot.js");
      const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
      sr.writeRootSave(ttc.acceptInterviewOffer(prologue, prologue.offers[1].id), localStorage);
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await homeActive(page);
  }
  await settled(page);
  await imagesReady(page);
  return { page, errors };
}

/** Geometry + the primary buttons that are really on screen (hidden panels and 0-size boxes excluded). */
const measure = (page) => page.evaluate(() => {
  const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
  const hero = document.querySelector("#btn-play-now");
  const name = (el) => el.id || el.textContent.trim().slice(0, 14);
  const onFirstScreen = (el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; };
  return {
    vh: innerHeight,
    hero: rect(hero),
    primaries: [...document.querySelectorAll("#screen-home .btn.primary")].filter((el) => vis(el) && onFirstScreen(el)).map(name),
    heroText: hero.textContent.trim(),
    cardTitle: document.querySelector('.mode-card[data-mode="quick"] strong')?.textContent.trim(),
  };
});

for (const [width, height, size] of [[390, 844, "mobile"], [1280, 800, "desktop"]]) {
  for (const withCareer of [false, true]) {
    const tag = `[${size}${withCareer ? "+career" : ""}]`;
    const { page, errors } = await openHome(width, height, { withCareer });
    const m = await measure(page);
    if (withCareer) {
      const bar = await page.evaluate(() => !document.querySelector("#long-career-home-bar")?.hidden);
      check(`${tag} the saved-career bar is really showing (otherwise this scenario proves nothing)`, bar);
    }
    // B16
    check(`${tag} B16 the main CTA is completely inside the first screen`, m.hero.top >= 0 && m.hero.bottom <= m.vh, `CTA ${m.hero.top}-${m.hero.bottom}px of ${m.vh}px`);
    check(`${tag} B16 it is the only visible primary button on the first screen`, m.primaries.length === 1 && m.primaries[0] === "btn-play-now", m.primaries.join(" | "));
    if (withCareer) {
      // The CTA must not push Continue below the fold either: a returning player comes here to continue.
      const cont = await page.evaluate(() => { const r = document.querySelector("#btn-long-career-resume").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
      check(`${tag} B16 the Continue button is on the first screen too`, cont.top >= 0 && cont.bottom <= cont.vh, `Continue ${cont.top}-${cont.bottom}px of ${cont.vh}px`);
    }
    check(`${tag} no horizontal overflow`, await noOverflow(page));
    // B17 -- every visible text inside each solid-background block (no selector list to forget one from)
    for (const root of [".play-now-hero", "#long-career-home-bar", ".home-category-hint"]) {
      const low = await textContrast(page, root, { min: 4.5 });
      check(`${tag} B17 ${root} text reaches AA (4.5:1, large text 3:1)`, low.length === 0, low.slice(0, 4).join(" ; "));
    }
    check(`${tag} no page errors`, errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: `${OUT}/${size}${withCareer ? "-career" : ""}.png` });
    await page.close();
  }
}

// B15, in the real page, in both languages
for (const lang of ["zh", "en"]) {
  const { page } = await openHome(1280, 800, { lang });
  const m = await measure(page);
  check(`[${lang}] B15 hero and quick card read differently`, !!m.heroText && !!m.cardTitle && m.heroText !== m.cardTitle, `hero "${m.heroText}" vs card "${m.cardTitle}"`);
  if (lang === "en") check("[en] B15 neither label leaked Chinese", !/[\u4e00-\u9fff]/.test(m.heroText + m.cardTitle), `${m.heroText} | ${m.cardTitle}`);
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.txt`, `${report.join("\n")}\n`);
console.log(report.join("\n"));
const failed = report.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
if (failed) process.exit(1);
