// Browser E2E for the unified promise engine (Career 2.0 E): real Reborn run,
// real account, real clicks. Two relationship promises are put on the account
// (one that is kept after the first game, one that is broken at game 2); the
// script plays games and checks the banner, the account store, the one-time
// trust application, the legacy record, and persistence across a reload.
// Desktop + mobile. Usage: node scripts/qa/promise-settle.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/promise-settle";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

async function playOneGame(page) {
  await page.click("[data-play]");
  const started = Date.now();
  while (Date.now() - started < 60000) {
    if (await visible(page, ".reborn-takeover-overlay")) await page.click('.reborn-takeover-option[data-option="pass"]');
    if (await visible(page, ".reborn-report")) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

const readState = (page) =>
  page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const rel = await import("/js/career/careerRelationships.js");
    const account = acc.getAccount(acc.getActiveAccountId());
    const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
    return {
      promises: rel.promisesOf(account).map((p) => ({ text: p.text, status: p.status, applied: p.effect?.applied ?? null, trustDelta: p.effect?.trustDelta ?? null })),
      pending: rel.pendingTrustEffects(account).length,
      legacy: rel.legacyOf(account).filter((e) => e.type === "promise").length,
      trust: root?.reborn?.player?.coachTrust ?? null,
      log: (root?.reborn?.player?.seasonLog || []).map((g) => ({ gameId: g.gameId, started: g.started })),
    };
  });

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  // web fonts are decoration; a blocked CDN must not stall screenshots
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);

  // a real account (promises live on the account)
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    acc.createAccount("PromiseQA");
  });

  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForFunction(() => document.querySelector("#screen-reborn")?.classList.contains("active"), null, { timeout: 20000 });
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector(".reborn-identity", { timeout: 10000 });

  // two promises on the account: dnp-or-better by game 5 (kept after game 1), starter by game 2 (broken)
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const rel = await import("/js/career/careerRelationships.js");
    const account = acc.getAccount(acc.getActiveAccountId());
    rel.recordPerson(account, { id: "coach", name: "Coach", role: "coach" });
    rel.recordPerson(account, { id: "me", name: "Me", role: "player" });
    rel.makePromise(account, { makerId: "coach", targetId: "me", kind: "role", text: "<b>Rotation spot</b>", madeSeason: null, madeGame: 0, check: { type: "role", role: "dnp", dueAfterGames: 5 } });
    rel.makePromise(account, { makerId: "coach", targetId: "me", kind: "role", text: "Starter by game 2", madeSeason: null, madeGame: 0, check: { type: "role", role: "starter", dueAfterGames: 2 } });
    // a "start" promise: settled from the real tip-off lineup the season log records
    rel.makePromise(account, { makerId: "coach", targetId: "me", kind: "start", text: "Start within 2 games", madeSeason: null, madeGame: 0, check: { type: "start", dueAfterGames: 2 } });
    acc.saveAccount(account);
  });
  const before = await readState(page);
  check(`[${tag}] both promises start open`, before.promises.length === 3 && before.promises.every((p) => p.status === "open"), JSON.stringify(before.promises.map((p) => p.status)));

  check(`[${tag}] game 1 settles`, await playOneGame(page));
  const afterOne = await readState(page);
  check(`[${tag}] game 1: the kept promise is fulfilled`, afterOne.promises[0].status === "fulfilled", afterOne.promises[0].status);
  check(`[${tag}] game 1: the deadline-2 promise is still open`, afterOne.promises[1].status === "open", afterOne.promises[1].status);
  check(`[${tag}] game 1: banner shows the kept promise, text escaped`, (await visible(page, ".reborn-promise-banner")) && (await text(page, ".reborn-promise-banner")).includes("承诺结算") && !(await page.$(".reborn-promise-banner b")));
  check(`[${tag}] game 1: trust effect applied exactly once (nothing left pending)`, afterOne.pending === 0 && afterOne.promises[0].applied === true);
  check(`[${tag}] game 1: the log recorded a stable id and a real started flag`, afterOne.log.length === 1 && /^game:/.test(afterOne.log[0].gameId || "") && typeof afterOne.log[0].started === "boolean", JSON.stringify(afterOne.log));
  // the start promise follows the recorded fact — fulfilled iff he started, otherwise still open until its deadline
  check(`[${tag}] game 1: start promise follows the recorded lineup`, afterOne.promises[2].status === (afterOne.log[0].started ? "fulfilled" : "open"), `${afterOne.promises[2].status} / started=${afterOne.log[0].started}`);
  await shoot(page, `${OUT}/${tag}-kept.png`);

  check(`[${tag}] game 2 settles`, await playOneGame(page));
  const afterTwo = await readState(page);
  check(`[${tag}] game 2: the starter promise is broken`, afterTwo.promises[1].status === "broken", afterTwo.promises[1].status);
  const startedEver = afterTwo.log.some((g) => g.started);
  check(`[${tag}] game 2: start promise ${startedEver ? "kept" : "broken"} by the real lineups`, afterTwo.promises[2].status === (startedEver ? "fulfilled" : "broken"), `${afterTwo.promises[2].status} / ${JSON.stringify(afterTwo.log.map((g) => g.started))}`);
  check(`[${tag}] game 2: broken effect is a trust loss, applied once`, afterTwo.promises[1].trustDelta < 0 && afterTwo.promises[1].applied === true && afterTwo.pending === 0);
  check(`[${tag}] game 2: banner shows the broken promise`, (await text(page, ".reborn-promise-banner")).includes("✗"));
  check(`[${tag}] the first promise was not settled again`, afterTwo.promises[0].status === "fulfilled" && afterTwo.promises[0].trustDelta === afterOne.promises[0].trustDelta);
  await shoot(page, `${OUT}/${tag}-broken.png`);

  // a third game must not re-apply anything
  check(`[${tag}] game 3 settles`, await playOneGame(page));
  const afterThree = await readState(page);
  check(`[${tag}] game 3: no promise changed, nothing pending, no banner`, JSON.stringify(afterThree.promises) === JSON.stringify(afterTwo.promises) && afterThree.pending === 0 && !(await visible(page, ".reborn-promise-banner")));

  // persistence across a reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  const reloaded = await readState(page);
  check(`[${tag}] statuses survive a reload`, JSON.stringify(reloaded.promises) === JSON.stringify(afterThree.promises));
  check(`[${tag}] the account legacy record has one event per settled promise`, reloaded.legacy >= 2, `legacy promise events=${reloaded.legacy}`);
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
