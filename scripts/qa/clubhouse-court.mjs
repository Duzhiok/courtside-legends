// My Team Clubhouse as the landing of the "My Players" tab, measured in a real browser at four widths:
// no extra click to reach it, every starter stands on his OWN position's spot (C top, PG/SG bottom), the five
// cards never overlap or clip, long names are never cut, the champion season opens to its saved starting five, an
// older champion shows only its real result, the hero offers the next step, and English has no Chinese.
// Usage: node scripts/qa/clubhouse-court.mjs /tmp/cls-qa/court [http://127.0.0.1:5192/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, imagesReady, noOverflow, overflowers, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/court";
const BASE = process.argv[3] || "http://127.0.0.1:5192/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const BREFS = ["antetgi01", "gilgesh01", "jokicni01", "jordami01", "jamesle01", "curryst01", "duncati01", "onealsh01", "bryanko01", "birdla01"];

/** Account with ten real cards (long names + a diacritic on purpose), a saved lineup and three real-shaped season records:
 *  a champion that saved its starting five (taken through the real startingFiveSnapshot), an older champion without one, and a miss. */
const seed = (page) => page.evaluate(async (brefs) => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount, setActiveAccountId, resolvePlayers } = await import("/js/data/account.js");
  const { autoLineup } = await import("/js/myteam/lineup.js");
  const { saveMyTeamLineup } = await import("/js/myteam/lineupStore.js");
  const { startingFiveSnapshot } = await import("/js/myteam/seasonRecord.js");
  const ids = brefs.map((b) => PLAYERS.filter((p) => p.bref === b).sort((x, y) => overall(y) - overall(x))[0]?.id).filter(Boolean);
  const a = createAccount("QA 球场");
  const acc = getAccount(a.id);
  acc.playerIds = ids; acc.gold = 500; acc.onboardingDone = true; acc.welcomeGranted = true;
  saveAccount(acc);
  const draft = autoLineup(acc);
  saveMyTeamLineup(a.id, draft);
  const cards = resolvePlayers(ids, acc);
  const lineup = startingFiveSnapshot({ userTeamId: "LAS", teams: { LAS: { players: cards, starterIds: draft.starterIds } } });
  const acc2 = getAccount(a.id);
  const now = Date.now();
  acc2.myTeamSeasons = [
    { seasonId: "qa-c2", variant: "quick", games: 20, w: 17, l: 3, champion: true, finish: "champion", rank: 1, star: { name: "Stephen Curry", ppg: 28.5 }, finishedAt: now, lineup },
    { seasonId: "qa-c1", variant: "quick", games: 20, w: 15, l: 5, champion: true, finish: "champion", rank: 1, star: { name: "Nikola Jokić", ppg: 26.1 }, finishedAt: now - 9e8 },
    { seasonId: "qa-m1", variant: "full", games: 82, w: 30, l: 52, champion: false, finish: "missed", rank: 9, star: { name: "Stephen Curry", ppg: 22 }, finishedAt: now - 2e9 },
  ];
  saveAccount(acc2);
  setActiveAccountId(a.id);
  return { cards: ids.length, lineup: lineup?.map((e) => ({ id: e.id, name: e.name, pos: e.pos, ovr: e.ovr })) };
}, BREFS);

const openClubhouse = async (page) => {
  await page.click('.home-tab[data-category="players"]');
  await page.waitForSelector("#my-team-clubhouse-root .mtc-hero", { state: "visible" });
  await imagesReady(page);
};

/** Geometry of the five starter cards against their court. */
const courtGeometry = (page) => page.evaluate(() => {
  const court = document.querySelector(".mtc-court");
  const cr = court.getBoundingClientRect();
  const inner = { l: cr.left + court.clientLeft, t: cr.top + court.clientTop, r: cr.left + court.clientLeft + court.clientWidth, b: cr.top + court.clientTop + court.clientHeight };
  const cards = [...document.querySelectorAll(".mtc-court-card")].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.card, pos: el.dataset.pos, slot: el.closest(".mtc-court-slot").dataset.slot, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, l: r.left, r: r.right, t: r.top, b: r.bottom,
      photo: el.querySelector(".mtc-court-photo").getBoundingClientRect().width, swap: el.querySelector(".mtc-swap-btn").getBoundingClientRect() };
  });
  const clipped = cards.filter((c) => c.l < inner.l - 0.5 || c.r > inner.r + 0.5 || c.t < inner.t - 0.5 || c.b > inner.b + 0.5 || c.swap.bottom > inner.b + 0.5).map((c) => c.pos);
  const overlaps = [];
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) overlaps.push(`${a.pos}/${b.pos}`);
  }
  return { cards, clipped, overlaps };
});

/** Names that really lose text: more laid-out line boxes than the line-clamp shows, a single clipped line, or an ellipsis.
 *  (scrollHeight vs clientHeight is NOT used: glyphs overhang the line box by ~2px without being cut.) */
const cutNames = (page) => page.evaluate(() => [...document.querySelectorAll("#my-team-clubhouse-root .mtc-court-name, #my-team-clubhouse-root .mtc-wall-name strong, #my-team-clubhouse-root .mtc-feature strong, #my-team-clubhouse-root .mtc-five-name")]
  .filter((el) => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    const range = document.createRange(); range.selectNodeContents(el);
    const rows = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    const clamp = parseInt(cs.webkitLineClamp, 10) || Infinity;
    const clipsSideways = cs.overflowX !== "visible" && cs.display !== "-webkit-box" && el.scrollWidth > el.clientWidth + 1;
    return rows > clamp || clipsSideways || cs.textOverflow === "ellipsis";
  })
  .map((el) => el.textContent.trim()));

/** A long single-word surname (Antetokounmpo) must not be snapped mid-word onto a second line. */
const brokenWords = (page) => page.evaluate(() => [...document.querySelectorAll("#my-team-clubhouse-root .mtc-court-name, #my-team-clubhouse-root .mtc-wall-name strong, #my-team-clubhouse-root .mtc-feature strong, #my-team-clubhouse-root .mtc-five-name")]
  .filter((el) => {
    if (!el.getClientRects().length) return false;
    const words = el.textContent.trim().split(/[\s-]+/); // a hyphen is a legitimate break point
    return words.some((w) => {
      const probe = document.createElement("span");
      probe.textContent = w; probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:inherit;letter-spacing:inherit";
      el.appendChild(probe); const wide = probe.getBoundingClientRect().width; probe.remove();
      return wide > el.clientWidth + 0.5; // the word alone is wider than its box -> it has to break inside the word
    });
  }).map((el) => `${String(el.className) || "strong"}:${el.textContent.trim()}(${Math.round(el.clientWidth)}px)`));

/** Contrast of hero text against the LIGHTEST colour of the hero gradient (a conservative stand-in: the element's own
 *  background composited over it). lowContrast() cannot be used here: a gradient has no backgroundColor. */
const heroContrast = (page, selectors, under = [37, 88, 62], min = 4.5) => page.evaluate(([sels, base, floor]) => {
  const rgba = (css) => { const m = css.match(/[\d.]+/g).map(Number); return m.length === 3 ? [...m, 1] : m; };
  const mix = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bad = [];
  for (const sel of sels) for (const el of document.querySelectorAll(`.mtc-hero ${sel}`)) {
    const cs = getComputedStyle(el);
    const bg = mix(rgba(cs.backgroundColor), base);
    const fg = mix(rgba(cs.color), bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < floor) bad.push(`${sel} ${ratio.toFixed(2)}`);
  }
  return bad;
}, [selectors, under, min]);

const layoutChecks = async (page, tag, minPhoto) => {
  const g = await courtGeometry(page);
  const by = Object.fromEntries(g.cards.map((c) => [c.pos, c]));
  check(`${tag}: five starters on court`, g.cards.length === 5, `got ${g.cards.length}`);
  check(`${tag}: every starter stands in the slot of his own position`, g.cards.every((c) => c.pos === c.slot), g.cards.map((c) => `${c.pos}@${c.slot}`).join(" "));
  if (g.cards.length === 5 && ["PG", "SG", "SF", "PF", "C"].every((p) => by[p])) {
    check(`${tag}: C is nearest the basket (top)`, by.C.cy < by.PF.cy && by.C.cy < by.SF.cy && by.C.cy < by.PG.cy && by.C.cy < by.SG.cy);
    check(`${tag}: PG/SG are the farthest from the basket`, by.PG.cy > by.PF.cy && by.SG.cy > by.SF.cy);
    check(`${tag}: PF/PG left, SF/SG right`, by.PF.cx < by.SF.cx && by.PG.cx < by.SG.cx);
  }
  check(`${tag}: no card is clipped by the court (incl. swap buttons)`, g.clipped.length === 0, g.clipped.join(","));
  check(`${tag}: no two cards overlap`, g.overlaps.length === 0, g.overlaps.join(","));
  check(`${tag}: starter photos are big (>= ${minPhoto}px)`, g.cards.every((c) => c.photo >= minPhoto), g.cards.map((c) => Math.round(c.photo)).join(","));
  check(`${tag}: no name is cut off`, (await cutNames(page)).length === 0, (await cutNames(page)).join(" | "));
  check(`${tag}: no long name is broken in the middle of a word`, (await brokenWords(page)).length === 0, (await brokenWords(page)).join(" | "));
  check(`${tag}: no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  check(`${tag}: hero + court images all loaded`, await page.evaluate(() => [...document.querySelectorAll(".mtc-hero img, .mtc-court img")].every((i) => i.complete && i.naturalWidth > 0)));
};

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await homeActive(page);
const seeded = await seed(page);
check("seed: 10 real cards and a saved five on the champion record", seeded.cards === 10 && seeded.lineup?.length === 5, JSON.stringify(seeded.lineup?.map((e) => `${e.pos}:${e.name}`)));
await reload(page);

// ---- landing: no extra click ----
await openClubhouse(page);
check("landing: clubhouse is visible right after opening the My Players tab (no second click)", await page.isVisible("#my-team-clubhouse-root .mtc-hero"));
check("landing: the old 'build my lineup' entry button and the separate clubhouse page are gone", (await page.$("#btn-open-my-lineup")) === null && (await page.$("#screen-my-team-clubhouse")) === null);
check("landing: ranked is still reachable on the same tab", (await page.$('[data-category="players"] .mode-card[data-mode="ranked"]')) !== null);

// ---- desktop ----
await layoutChecks(page, "desktop", 84);
const hero = await text(page, ".mtc-hero");
const champCore = [...seeded.lineup].sort((a, b) => b.ovr - a.ovr)[0];
check("hero: shows the real title count", (await text(page, ".mtc-hero .mtc-titles-num")) === "2");
check("hero: featured player is the saved champion's best starter", (await text(page, ".mtc-feature")).includes(champCore.name.normalize("NFC")) && (await text(page, ".mtc-feature")).includes("冠军核心"), champCore.name);
check("hero: primary action is play-another-season", (await text(page, ".mtc-hero-cta")) === "再来一季 · 20 场");
check("hero: latest season chip comes from the newest record", hero.includes("17–3"));
check("hero: the featured portrait is big (>= 120px)", (await page.$eval(".mtc-feature-photo", (el) => el.getBoundingClientRect().width)) >= 120);
const low = await heroContrast(page, [".mtc-kicker", "h3", ".mtc-tagline", ".mtc-chip", ".mtc-chip-gold", ".mtc-hero-cta", ".mtc-hero-sub", ".mtc-feature small", ".mtc-feature strong", ".mtc-feature figcaption span"]);
check("hero: text contrast >= 4.5 on the lightest gradient colour (incl. the gold CTA)", low.length === 0, low.join(", "));
check("hero: the gold CTA really is gold, not the generic primary green", await page.$eval(".mtc-hero-cta", (el) => getComputedStyle(el).backgroundColor === "rgb(233, 196, 106)"));

// ---- honours ----
const rows = await page.$$eval(".mtc-season", (els) => els.length);
check("honours: three seasons -> three rows, no duplicated list", rows === 3, `rows=${rows}`);
check("fonts: Latin-extended letters (Jokić, Dončić) come from the Latin font, not Noto Sans SC", await page.evaluate(async () => {
  await document.fonts.ready;
  return getComputedStyle(document.body).fontFamily.startsWith('"CLS Latin Ext"') && document.fonts.check('16px "CLS Latin Ext"', "\u0107\u010d");
}));
check("honours: no developer note and no repeated star line", !(await text(page, ".mtc")).includes("没有存档") && !(await text(page, ".mtc")).includes("PTS"));
check("honours: the trophy sits on the same line as the result (not alone above it)", await page.evaluate(() => {
  const s = document.querySelector(".mtc-season details summary");
  const cup = s.querySelector(".mtc-cup").getBoundingClientRect(), line = s.querySelector(".mtc-season-line").getBoundingClientRect();
  return Math.abs(cup.top - line.top) < 8;
}));
check("honours: only the champion that saved its lineup is expandable", (await page.$$eval(".mtc-season details", (els) => els.length)) === 1);
check("honours: the older champion shows its result and nothing invented", await page.evaluate(() => {
  const old = [...document.querySelectorAll(".mtc-season.is-champion")].find((el) => !el.querySelector("details"));
  return !!old && !old.querySelector(".mtc-five") && old.textContent.includes("Nikola Jokić");
}));
await page.click(".mtc-season details summary");
await page.waitForSelector(".mtc-five-card", { state: "visible" });
await imagesReady(page);
const five = await page.$$eval(".mtc-five-card", (els) => els.map((el) => ({ id: el.dataset.card, name: el.querySelector(".mtc-five-name").textContent.trim(), meta: el.querySelector(".mtc-five-meta").textContent.trim(), img: el.querySelector("img").naturalWidth > 0 })));
check("honours: opening the champion shows its five from the record", five.length === 5 && five.every((f) => f.img), five.map((f) => f.name).join(", "));
check("honours: those five are exactly the saved ones", seeded.lineup.every((e) => five.some((f) => f.id === e.id && f.name === e.name.normalize("NFC"))));
await shoot(page, `${OUT}/court-desktop-1280.png`);

// ---- navigation round trip: lineup editor and back ----
await page.click('.mtc-link[data-act="edit-lineup"]');
await page.waitForSelector("#screen-my-team-lineup.active");
check("nav: 'Edit lineup' opens the lineup editor", true);
await page.click("#btn-my-lineup-back");
await homeActive(page);
check("nav: back lands on the My Players tab with the clubhouse still there", await page.isVisible("#my-team-clubhouse-root .mtc-hero") && !(await page.$eval('[data-category="players"].home-category-panel', (el) => el.hidden)));

// ---- other widths ----
for (const [w, h, tag, minPhoto] of [[768, 1000, "tablet-768", 84], [390, 844, "phone-390", 64], [360, 740, "phone-360", 64]]) {
  await page.setViewportSize({ width: w, height: h });
  await reload(page);
  await openClubhouse(page);
  await layoutChecks(page, tag, minPhoto);
  if (w === 390) await shoot(page, `${OUT}/court-phone-390.png`);
}

// ---- English ----
await page.setViewportSize({ width: 1280, height: 800 });
await page.evaluate(() => localStorage.setItem("courtside.lang", "en"));
await reload(page);
await openClubhouse(page);
check("english: the clubhouse has no Chinese left", !CJK.test(await text(page, "#my-team-clubhouse-root")), (await text(page, "#my-team-clubhouse-root")).match(/[\u4e00-\u9fff]+/g)?.slice(0, 4).join(" "));
check("english: primary action is localised", (await text(page, ".mtc-hero-cta")).startsWith("Play another season"));
await layoutChecks(page, "english-desktop", 84);

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
const fails = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - fails}/${out.length} checks passed`);
process.exit(fails ? 1 : 0);
