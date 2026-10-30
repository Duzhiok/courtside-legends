/**
 * Visual QA for the player-card tier badges (js/data/playerLegacy.js) + the "酷炫" CSS pass
 * on top of them (css/style.css: .rarity-tag gradients, .legend-season shimmer sweep,
 * .draw-reveal pop/glow). Seeds an account whose roster has one card of each tier so the
 * collection grid shows them side by side, then checks the actual computed styles picked up
 * real CSS (not just that the class name is present -- a typo'd selector would still "pass"
 * a class-name check but render as a plain gray chip).
 *
 *   node scripts/qa/card-tier-visuals.mjs <out-prefix>      (dev server on :5173)
 */
import { chromium } from "playwright-core";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (label, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? " — " + detail : ""}`);

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const home = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  check(`[${tag}] app boots with no module errors`, errors.length === 0, errors.join(" | "));

  // One card per tier, picked straight from data/playerLegacy.js's own examples so this QA
  // tracks the same source of truth the module uses, not a second hand-copied list.
  const wanted = [
    { bref: "jordami01", season: 1996, expect: "legend", expectLabel: "传奇" }, // curated iconic season
    { bref: "nowitdi01", season: 2014, expect: "super", expectLabel: "超级球星" }, // career superstar
    { bref: "georgpa01", season: 2019, expect: "allstar", expectLabel: "全明星" }, // generic bucket, NOT superstar
    { bref: "randoza01", season: 2014, expect: "star", expectLabel: "球星" },
    { bref: "garneke01", season: 1996, expect: "goto", expectLabel: "当家球星" }, // pre-MVP rookie Garnett
  ];

  const seeded = await page.evaluate(async (wanted) => {
    const acc = await import("/js/data/account.js");
    const pl = await import("/js/data/players.js");
    const co = await import("/js/data/coaches.js");
    const cards = wanted.map(({ bref, season }) => pl.PLAYERS.find((p) => p.bref === bref && p.season === season));
    const missing = wanted.filter((w, i) => !cards[i]).map((w) => `${w.bref}:${w.season}`);
    if (missing.length) return { missing };
    const picked = new Set(cards.map((p) => p.id));
    // requireAccountReady() demands a full 12-man roster before it'll let you into the
    // collection at all -- pad with filler so the 5 example cards aren't rejected for looking
    // like an incomplete onboarding.
    const filler = pl.PLAYERS.filter((p) => !picked.has(p.id)).slice(0, 12 - cards.length);
    const a = acc.createAccount("tier QA");
    a.playerIds = [...cards, ...filler].map((p) => p.id);
    a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
    return { missing: [], ids: cards.map((p) => p.id) };
  }, wanted);
  check(`[${tag}] all 5 example cards exist in roster.json`, seeded.missing.length === 0, seeded.missing.join(", "));

  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  await page.click("#btn-open-collection");
  await page.waitForSelector("#screen-collection.active");
  await page.waitForSelector("#collection-grid .player-card");

  for (const w of wanted) {
    const info = await page.evaluate(({ expectLabel, expectCls }) => {
      const tags = [...document.querySelectorAll("#collection-grid .rarity-tag")];
      const tag = tags.find((el) => el.textContent.trim() === expectLabel);
      if (!tag) return null;
      const style = getComputedStyle(tag);
      return {
        hasClass: tag.classList.contains(expectCls),
        background: style.backgroundImage, // gradients land here, not backgroundColor
        boxShadow: style.boxShadow,
      };
    }, { expectLabel: w.expectLabel, expectCls: w.expect });
    check(`[${tag}] ${w.bref}:${w.season} shows "${w.expectLabel}" badge`, !!info, JSON.stringify(info));
    if (info) {
      check(`[${tag}] ${w.expectLabel} tag has the .${w.expect} class`, info.hasClass);
      check(`[${tag}] ${w.expectLabel} tag renders a real gradient, not flat default`, /gradient/.test(info.background), info.background);
    }
  }

  // The Legendary card's wrapper should carry the shimmer-sweep card class plus the inline
  // team-colour gradient style (playerLegacy.js's iconicCardStyle) -- checked via the inline
  // style attribute itself rather than getComputedStyle().borderTopColor, which chrome-headless-
  // shell reports unreliably for multi-rule border shorthands even when the stylesheet (and a
  // real screenshot) show the correct value.
  const legendCard = await page.evaluate(() => {
    const el = document.querySelector("#collection-grid .player-card.legend-season");
    if (!el) return null;
    const inlineStyle = el.getAttribute("style") || "";
    const style = getComputedStyle(el);
    return { inlineStyle, boxShadow: style.boxShadow };
  });
  check(`[${tag}] the curated-season card wrapper gets .legend-season class`, !!legendCard, JSON.stringify(legendCard));
  if (legendCard) {
    check(`[${tag}] it carries an inline team-colour gradient background`, /gradient/.test(legendCard.inlineStyle), legendCard.inlineStyle);
    check(`[${tag}] it has the amber glow box-shadow`, /191, 0/.test(legendCard.boxShadow), legendCard.boxShadow);
  }

  const grid = await page.$("#screen-collection");
  await page.evaluate(() => window.scrollTo(0, 0));
  await grid.screenshot({ path: `${OUT}-collection-${tag}.png` });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(`[${tag}] no horizontal overflow`, !overflow);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(out.join("\n"));
process.exit(out.some((line) => line.startsWith("FAIL")) ? 1 : 0);
