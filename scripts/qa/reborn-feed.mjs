// Browser smoke for PA3.1 "a teammate asks for the ball": it is rare by design (only a big whose post matchup beats the floor's),
// so this plays real Reborn games on full control, across careers, until one comes up, then takes it and reads the report.
// Usage: node scripts/qa/reborn-feed.mjs [outDir] [baseUrl] [zh|en]   Desktop 1440 + mobile 390.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-feed";
const BASE = process.argv[3] || "http://127.0.0.1:5191/";
const LANG = process.argv[4] === "en" ? "en" : "zh";
const urlFor = (n) => `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=feed-qa-${n}`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const SAYS = /give me the ball|把球给我/i;
const FEEDBACK = /You got the ball to|You went to|你把球交给了/;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const look = (page) => page.evaluate((says) => {
  const vw = innerWidth;
  const vh = innerHeight;
  const re = new RegExp(says.source, says.flags);
  const bubble = document.querySelector(".reborn-bubble-host");
  if (bubble) return { kind: "bubble", feed: re.test(bubble.textContent), chips: [...bubble.querySelectorAll("[data-option]")].map((c) => c.dataset.option) };
  const panel = document.querySelector(".reborn-takeover-dialog");
  if (!panel) return null;
  const card = panel.querySelector('[data-testid="feed-offer"]');
  const r = card?.getBoundingClientRect();
  const feedBtn = panel.querySelector('[data-option="feed"]');
  const fr = feedBtn?.getBoundingClientRect();
  // Taller than the screen is fine IF it scrolls: the last option must be reachable, and the top must still be where it was.
  const host = panel.closest(".screen-shell-modal");
  const last = [...panel.querySelectorAll("[data-option]")].at(-1);
  last?.scrollIntoView({ block: "nearest" });
  const lr = last?.getBoundingClientRect();
  const lastReachable = !!lr && lr.top >= 0 && lr.bottom <= vh + 1;
  const scroll = host ? { overflowY: getComputedStyle(host).overflowY, position: getComputedStyle(host).position, scrollHeight: host.scrollHeight, clientHeight: host.clientHeight, scrollTop: host.scrollTop, lastTop: Math.round(lr?.top ?? -1), lastBottom: Math.round(lr?.bottom ?? -1), vh, docScroll: Math.round(scrollY) } : null;
  if (host) host.scrollTop = 0;
  return {
    lastReachable,
    scroll,
    kind: "panel",
    tier: panel.closest(".screen-shell-modal")?.dataset.tier || "L3",
    feed: !!card,
    cardText: card?.textContent || "",
    cardInside: !!r && r.top >= 0 && r.bottom <= vh + 1 && r.left >= 0 && r.right <= vw + 1,
    btnText: feedBtn?.textContent || "",
    btnHeight: fr ? Math.round(fr.height) : 0,
    options: [...panel.querySelectorAll("[data-option]")].map((c) => c.dataset.option),
  };
}, { source: SAYS.source, flags: SAYS.flags });

async function playOne(page, tag, ev) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  await page.mouse.move(2, 2);
  const started = Date.now();
  let lastClick = started;
  while (Date.now() - started < 150000) {
    const s = await look(page);
    // A click that lands on a button the page is about to re-render is lost (a person would click again): nothing at all in 3s -> click again.
    if (!s && Date.now() - lastClick > 3000) {
      const same = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
      if (same === before && (await page.click("[data-play]:not([disabled])", { timeout: 500 }).then(() => true).catch(() => false))) {
        lastClick = Date.now();
        await page.mouse.move(2, 2);
      } else lastClick = Date.now();
    }
    if (s?.kind === "bubble") {
      if (s.feed && !ev.taken) {
        ev.seen = s;
        await shoot(page, `${OUT}/${tag}-bubble.png`);
        await page.waitForTimeout(300); // past the 250ms click guard
        await page.click('.reborn-bubble-host [data-option="feed"]');
        ev.taken = true;
      } else {
        await page.keyboard.press(s.chips.includes("feed") ? "2" : "1").catch(() => {});
        await page.waitForTimeout(80);
      }
    } else if (s?.kind === "panel") {
      if (s.feed && !ev.taken) {
        await page.waitForTimeout(1000); // the dialog fades in: measure the settled layout, not a frame of the animation
        ev.seen = (await look(page)) || s;
        await shoot(page, `${OUT}/${tag}-panel.png`);
        await page.click('.reborn-takeover-dialog [data-option="feed"]');
        ev.taken = true;
      } else {
        await page.click(".reborn-takeover-option[data-option]");
      }
      await page.waitForTimeout(80);
    }
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    const btn = await page.$("[data-play]");
    if (now && now !== before && (!btn || !(await btn.isDisabled()))) {
      if (ev.taken && !ev.report) ev.report = now;
      return;
    }
    await page.waitForTimeout(40);
  }
  const stuck = await page.evaluate(() => ({
    play: document.querySelector("[data-play]")?.outerHTML.slice(0, 120),
    bubble: document.querySelector(".reborn-bubble-host")?.textContent.slice(0, 120),
    panel: document.querySelector(".reborn-takeover-dialog")?.textContent.slice(0, 160),
    options: [...document.querySelectorAll("[data-option]")].map((o) => o.dataset.option),
    report: document.querySelector(".reborn-report")?.textContent.slice(0, 80),
  }));
  const nowText = await page.$eval(".reborn-report", (el) => el.textContent).catch((e) => `ERR ${e.message}`);
  console.log("STUCK-SNAPSHOT", JSON.stringify(stuck), "BEFORE:", JSON.stringify(before.slice(0, 60)), "NOW:", JSON.stringify(nowText.slice(0, 60)), "same:", before === nowText);
  await shoot(page, `${OUT}/${tag}-stuck.png`);
  throw new Error("game did not finish");
}

const browser = await chromium.launch({ executablePath: EXE });

async function session(width, height, tag, seedNo, ev) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(urlFor(seedNo), { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("courtside.lang", l);
    localStorage.setItem("cls_guide_first_run_v1", "seen"); // a clean profile opens the first-run guide, which covers the page
    const account = { id: "qa-feed", name: "QA", createdAt: Date.now(), playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced", lastDailyDraw: null, drawHistory: [], gold: 0, rankedWins: 0, rankedLosses: 0 };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-feed");
  }, LANG);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-create", { timeout: 20000 });
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  await page.click('.reborn-identity [data-mode="full"]');
  for (let g = 0; g < 6 && !ev.report; g++) {
    if (!(await page.$("[data-play]:not([disabled])"))) break;
    await playOne(page, tag, ev);
  }
  ev.overflow = ev.overflow !== false && (await noOverflow(page));
  ev.errors.push(...errors);
  await page.close();
}

const VIEWPORTS = [[1440, 900, "desktop"], [390, 844, "mobile"]].filter(([, , t]) => !process.env.ONLY || process.env.ONLY === t);
for (const [width, height, tag] of VIEWPORTS) {
  const ev = { errors: [] };
  for (let seedNo = 1; seedNo <= 14 && !ev.report; seedNo++) await session(width, height, tag, seedNo, ev);
  check(`${tag}: a teammate asked for the ball in a real game on full control`, !!ev.seen, ev.seen ? `${ev.seen.kind}${ev.seen.tier ? ` ${ev.seen.tier}` : ""}` : "none in 14 careers");
  if (ev.seen?.kind === "panel") {
    check(`${tag}: the teammate card says what he said, in his own words, and promises nothing`, SAYS.test(ev.seen.cardText) && /不保证|no promise|not.*promise|promise it falls/i.test(ev.seen.cardText), ev.seen.cardText.slice(0, 80));
    check(`${tag}: the card is fully inside the screen (title included)`, ev.seen.cardInside);
    check(`${tag}: a panel taller than the screen still scrolls to its last option`, ev.seen.lastReachable, JSON.stringify(ev.seen.scroll));
    check(`${tag}: the option is there, labelled, and tap-sized`, ev.seen.options.includes("feed") && /队友要球|A teammate wants it/.test(ev.seen.btnText) && ev.seen.btnHeight >= 44, `${ev.seen.btnHeight}px`);
  }
  if (ev.seen?.kind === "bubble") check(`${tag}: the bubble carries his line and a feed chip`, ev.seen.feed && ev.seen.chips.includes("feed"));
  check(`${tag}: after taking it the report says what happened to HIM`, FEEDBACK.test(ev.report || ""), (ev.report || "").slice(0, 100));
  check(`${tag}: no horizontal overflow`, ev.overflow !== false);
  check(`${tag}: no page errors`, ev.errors.length === 0, ev.errors.join(" | "));
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
