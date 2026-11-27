// Browser smoke for PA3 interaction levels, on a real Reborn game in Full control. What a unit test cannot prove:
//  L1 bubble: floats at the bottom WITHOUT a full-viewport modal, never steals focus, a key answers it, hovering pauses the
//             countdown (WCAG 2.2.1), an ignored one leaves by itself, and after two ignored in a row the next window is SHORT.
//  L2 panel:  docks to the bottom, no coach card.   L3 dialog: the coach card is there (a real moment).
// Real lifetimes come from a MutationObserver (add/remove of .reborn-bubble-host), not from the code under test.
// Usage: node scripts/qa/reborn-tiers.mjs [outDir] [baseUrl] [zh|en]   Desktop 1440 + mobile 390.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-tiers";
const BASE = process.argv[3] || "http://127.0.0.1:5191/";
const LANG = process.argv[4] === "en" ? "en" : "zh";
const urlFor = (n) => `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=defense-qa-${n}`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const OBSERVER = () => {
  window.__bubbles = [];
  const watch = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) if (n.classList?.contains("reborn-bubble-host")) { n.__t0 = performance.now(); window.__bubbles.push({ node: n, t0: n.__t0, t1: null }); }
      for (const n of r.removedNodes) if (n.classList?.contains("reborn-bubble-host")) { const b = window.__bubbles.find((x) => x.node === n); if (b) b.t1 = performance.now(); }
    }
  });
  document.addEventListener("DOMContentLoaded", () => watch.observe(document.body, { childList: true }));
};
const lifetimes = (page) => page.evaluate(() => window.__bubbles.filter((b) => b.t1).map((b) => Math.round(b.t1 - b.t0)));

const snapshot = (page) => page.evaluate(() => {
  const vw = innerWidth;
  const vh = innerHeight;
  const bubble = document.querySelector(".reborn-bubble-host");
  const panel = document.querySelector(".reborn-takeover-dialog");
  const info = { bubble: null, panel: null };
  if (bubble) {
    const r = bubble.getBoundingClientRect();
    const chips = [...bubble.querySelectorAll(".reborn-bubble-option")];
    info.bubble = {
      inside: r.left >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5,
      bottomGap: Math.round(vh - r.bottom),
      modalOpen: !!document.querySelector(".screen-shell-modal.active"),
      focusInside: bubble.contains(document.activeElement),
      chips: chips.length,
      minChipHeight: Math.round(Math.min(...chips.map((c) => c.getBoundingClientRect().height))),
      role: bubble.querySelector(".reborn-bubble")?.getAttribute("role"),
      paused: bubble.classList.contains("paused"),
    };
  }
  if (panel) {
    const shell = panel.closest(".screen-shell-modal");
    const r = panel.getBoundingClientRect();
    info.panel = { tier: shell?.dataset.tier || "L3", coachCard: !!panel.querySelector(".reborn-agency-coach"), bottomGap: Math.round(vh - r.bottom), options: panel.querySelectorAll("[data-option]").length, defense: panel.classList.contains("reborn-agency-defense") };
  }
  return info;
});

/** Play one game, reacting to whatever tier shows up. `plan` decides what to do with the next bubble. */
async function playOne(page, tag, ev) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  await page.mouse.move(2, 2); // do not leave the pointer where the next bubble will pop up: hovering pauses it
  const started = Date.now();
  while (Date.now() - started < 150000) {
    const s = await snapshot(page);
    if (s.bubble) {
      if (!ev.bubble) { ev.bubble = s.bubble; await shoot(page, `${OUT}/${tag}-L1-bubble.png`); }
      if (!ev.hoverDone) {
        ev.hoverDone = true;
        await page.hover(".reborn-bubble-option");
        await page.waitForTimeout(3900); // longer than the 3.2s window
        const held = await snapshot(page);
        ev.hover = { stillThere: !!held.bubble, paused: !!held.bubble?.paused };
        await page.mouse.move(2, 2);
        await page.waitForTimeout(300);
        continue;
      }
      if (!ev.keyDone) {
        ev.keyDone = true;
        await page.keyboard.press("1");
        await page.waitForTimeout(250);
        ev.keyGone = !(await page.$(".reborn-bubble-host"));
        continue;
      }
      if (ev.ignored < 6) { // leave it alone: it must go by itself
        const gone = await page.waitForSelector(".reborn-bubble-host", { state: "detached", timeout: 6000 }).then(() => true).catch(() => false);
        if (gone) ev.ignored += 1;
        continue;
      }
      await page.keyboard.press("1"); // evidence is complete: answer quickly to move the game along
      await page.waitForTimeout(80);
    } else if (s.panel) {
      if (s.panel.defense || s.panel.tier === "L2") {
        if (!ev.l2 && s.panel.tier === "L2") { ev.l2 = s.panel; await shoot(page, `${OUT}/${tag}-L2-panel.png`); }
      } else if (!ev.l3) { ev.l3 = s.panel; await shoot(page, `${OUT}/${tag}-L3-dialog.png`); }
      await page.click('.reborn-takeover-option[data-option]');
      await page.waitForTimeout(80);
    }
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    const btn = await page.$("[data-play]");
    if (now && now !== before && (!btn || !(await btn.isDisabled()))) return;
    await page.waitForTimeout(40);
  }
  const stuck = await page.evaluate(() => ({
    play: document.querySelector("[data-play]")?.outerHTML.slice(0, 100),
    bubble: !!document.querySelector(".reborn-bubble-host"),
    modal: document.querySelector(".screen-shell-modal.active")?.textContent.slice(0, 120),
    report: document.querySelector(".reborn-report")?.textContent.slice(0, 80),
  }));
  console.log("STUCK-SNAPSHOT", JSON.stringify(stuck));
  await shoot(page, `${OUT}/${tag}-stuck.png`);
  throw new Error("game did not finish");
}

const browser = await chromium.launch({ executablePath: EXE });

async function session(width, height, tag, seedNo, ev) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.addInitScript(OBSERVER);
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(urlFor(seedNo), { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("courtside.lang", l);
    localStorage.setItem("cls_guide_first_run_v1", "seen"); // a clean profile opens the first-run guide, which covers the page
    const account = { id: "qa-tiers", name: "QA", createdAt: Date.now(), playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced", lastDailyDraw: null, drawHistory: [], gold: 0, rankedWins: 0, rankedLosses: 0 };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-tiers");
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
  const complete = () => ev.bubble && ev.hover && ev.keyGone !== undefined && ev.ignored >= 6 && ev.l2 && ev.l3;
  for (let g = 0; g < 90 && !complete(); g++) {
    if (!(await page.$("[data-play]:not([disabled])"))) break; // regular season over
    await playOne(page, tag, ev);
  }
  ev.lifetimes = [...(ev.lifetimes || []), ...(await lifetimes(page))];
  ev.overflow = await noOverflow(page);
  ev.errors = [...(ev.errors || []), ...errors];
  await page.close();
}

const VIEWPORTS = [[1440, 900, "desktop"], [390, 844, "mobile"]].filter(([, , t]) => !process.env.ONLY || process.env.ONLY === t);
for (const [width, height, tag] of VIEWPORTS) {
  const ev = { ignored: 0, errors: [] };
  for (let seedNo = 3; seedNo < 8; seedNo++) {
    await session(width, height, tag, seedNo, ev);
    if (ev.bubble && ev.hover && ev.ignored >= 6) break;
    console.log(`note ${tag}: seed ${seedNo} was not enough (bench rookie) - trying the next`);
  }
  const b = ev.bubble;
  check(`${tag}: an L1 bubble appeared in Full control`, !!b);
  if (b) {
    check(`${tag}: it is NOT a full-viewport modal (the court stays visible)`, !b.modalOpen);
    check(`${tag}: it never takes focus`, !b.focusInside);
    check(`${tag}: it sits inside the screen at the bottom`, b.inside && b.bottomGap >= 0 && b.bottomGap < 80, `gap ${b.bottomGap}px`);
    check(`${tag}: chips are tap-sized (>= 44px) and it is a polite status`, b.minChipHeight >= 44 && b.role === "status", `${b.minChipHeight}px`);
  }
  check(`${tag}: hovering pauses the countdown (still there after the 3.2s window)`, ev.hover?.stillThere === true && ev.hover?.paused === true, JSON.stringify(ev.hover));
  check(`${tag}: a key answers it at once`, ev.keyGone === true);
  const ig = ev.lifetimes.filter((ms) => ms >= 900 && ms <= 3700);
  const long = ig.filter((ms) => ms >= 2900);
  const short = ig.filter((ms) => ms < 1700);
  check(`${tag}: ignored bubbles leave by themselves after ~3.2s`, long.length >= 2, `lifetimes ${ev.lifetimes.slice(0, 14).join(",")}`);
  check(`${tag}: after two ignored in a row the window is short (~1.2s)`, short.length >= 2, `short: ${short.join(",")}`);
  if (ev.l2) {
    check(`${tag}: L2 panel docks to the bottom`, ev.l2.bottomGap < 60, `gap ${ev.l2.bottomGap}px`);
    check(`${tag}: L2 has its options and no coach card`, ev.l2.options >= 2 && !ev.l2.coachCard);
  } else console.log(`note ${tag}: no L2 panel came up (needs a close, late game with a clear opening) - covered by the unit tests`);
  if (ev.l3) check(`${tag}: a real moment still gets the full dialog (coach card)`, ev.l3.coachCard);
  else console.log(`note ${tag}: no L3 moment came up in this run - covered by the unit tests`);
  check(`${tag}: no horizontal overflow`, ev.overflow);
  check(`${tag}: no page errors`, ev.errors.length === 0, ev.errors.join(" | "));
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
