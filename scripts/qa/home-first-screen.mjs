// Browser QA for B15/B16/B17 — the home page's first screen.
//   B15  the hero CTA and the `quick` card must not carry the same name (zh and en).
//   B16  the one main CTA is fully inside the first screen, and it is the ONLY visible primary
//        button there -- with a saved career too, which is when the Continue bars push it down.
//   B17  the text that sits on a plain (solid) background reaches WCAG AA: the hint under the hero CTA,
//        the Continue bars, the category hint. NOT measured: the banner and the dark featured mode
//        cards -- their backgrounds are gradients/images, which textContrast cannot read (it would call
//        white-on-dark "1.0:1"). Those are judged on the screenshot.
// Nothing depends on the network, but the legends' photos are NOT dropped: every external image is answered with a
// portrait placeholder. Dropping them (the first version of this QA did) makes each failed tile remove itself, the
// photo wall collapses to nothing, the banner is 300px tall and the CTA "fits" -- in a page no player ever sees.
// With real photos the wall is ~800px tall, which is what pushed the CTA off the first screen on desktop.
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
const PORTRAIT = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#2b4a3a"/><circle cx="200" cy="190" r="80" fill="#6f8f7e"/><rect x="90" y="290" width="220" height="210" rx="90" fill="#6f8f7e"/></svg>`;

async function openHome(width, height, { lang = "zh", withCareer = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => (route.request().resourceType() === "image"
    ? route.fulfill({ status: 200, contentType: "image/svg+xml", body: PORTRAIT })
    : route.abort()));
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
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) }; };
  const hero = document.querySelector("#btn-play-now");
  const name = (el) => el.id || el.textContent.trim().slice(0, 14);
  const onFirstScreen = (el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; };
  return {
    vh: innerHeight,
    vw: innerWidth,
    hero: rect(hero),
    // what is really on top at the CTA's centre: the button itself, not a bar / tip / overlay
    topAtCenter: (() => { const r = hero.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1)); return el && (el === hero || hero.contains(el)); })(),
    wallTiles: [...document.querySelectorAll("#home-legends-wall .legend-tile img")].filter((i) => i.naturalWidth > 0).length,
    primaries: [...document.querySelectorAll("#screen-home .btn.primary")].filter((el) => vis(el) && onFirstScreen(el)).map(name),
    heroText: hero.textContent.trim(),
    cardTitle: document.querySelector('.mode-card[data-mode="quick"] strong')?.textContent.trim(),
  };
});

for (const [width, height, size] of [[390, 844, "mobile"], [1280, 800, "desktop"], [1440, 900, "desktop-xl"]]) {
  for (const withCareer of [false, true]) {
    const tag = `[${size}${withCareer ? "+career" : ""}]`;
    const { page, errors } = await openHome(width, height, { withCareer });
    const m = await measure(page);
    if (withCareer) {
      const bar = await page.evaluate(() => !document.querySelector("#long-career-home-bar")?.hidden);
      check(`${tag} the saved-career bar is really showing (otherwise this scenario proves nothing)`, bar);
    }
    // the photo wall is really rendered (otherwise this scenario measures a page nobody sees)
    check(`${tag} the legends wall is really rendered with photos (not vacuous)`, m.wallTiles >= 6, `${m.wallTiles} photos`);
    // B16
    check(`${tag} B16 the main CTA is completely inside the first screen`, m.hero.top >= 0 && m.hero.bottom <= m.vh && m.hero.left >= 0 && m.hero.right <= m.vw, `CTA y ${m.hero.top}-${m.hero.bottom} of ${m.vh}px, x ${m.hero.left}-${m.hero.right} of ${m.vw}px`);
    check(`${tag} B16 nothing covers the CTA (the button is what is on top at its centre)`, m.topAtCenter === true);
    check(`${tag} B16 it is the only visible primary button on the first screen`, m.primaries.length === 1 && m.primaries[0] === "btn-play-now", m.primaries.join(" | "));
    if (withCareer) {
      // The CTA must not push Continue below the fold either: a returning player comes here to continue.
      const cont = await page.evaluate(() => { const r = document.querySelector("#btn-long-career-resume").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
      check(`${tag} B16 the Continue button is on the first screen too`, cont.top >= 0 && cont.bottom <= cont.vh, `Continue ${cont.top}-${cont.bottom}px of ${cont.vh}px`);
      // B49: the save bar's text column must not be squeezed to a word, and the Continue button must not sit on it.
      const bar = await page.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const text = document.querySelector("#long-career-home-bar .account-home-text");
        const btn = document.querySelector("#btn-long-career-resume");
        const a = box(text), b = box(btn);
        return { w: Math.round(a.r - a.l), overlap: a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t };
      });
      check(`${tag} B49 the save bar's text column is not squeezed (>=140px wide)`, bar.w >= 140, `${bar.w}px`);
      check(`${tag} B49 the Continue button does not cover the save bar's text`, !bar.overlap);
    }
    check(`${tag} no horizontal overflow`, await noOverflow(page));
    // B17 -- every visible text inside each solid-background block (no selector list to forget one from)
    // the CTA block now sits on the dark banner (a gradient: textContrast reads no gradients), so it is measured
    // against the banner's mid green; the bars below are on solid backgrounds
    for (const [root, under] of [[".play-now-hero", [18, 53, 34]], ["#long-career-home-bar", undefined], [".home-category-hint", undefined]]) {
      const low = await textContrast(page, root, under ? { min: 4.5, under } : { min: 4.5 });
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
