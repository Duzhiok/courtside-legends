// Browser E2E for D: the real interview (three questions, rejection, the never-stranded last club) and
// the draft prophecy (name a real sleeper, the HQ card, its hit / miss verdicts), desktop + mobile,
// Chinese + English, contrast and overflow. Real engine, real clicks; the only hand-edit is flipping
// a saved prophecy to hit / miss to see the verdict cards (settlement itself is unit-tested).
// Usage: node scripts/qa/career-interview.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";
import { openInterview, sitInterview } from "./lib/interview.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/interview";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const TT_BG = [7, 19, 12];
const report = [];
const check = (label, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`;
  report.push(line);
  console.log(line); // live: a crash later in the script must not swallow what already ran
};
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cls_root_v3") || "null"));
const trustOf = (page, arch) => page.$eval(`#time-travel-offers .tt-offer[data-archetype="${arch}"]`, (el) => Number(el.getAttribute("aria-label").match(/信任 (\d+)/)?.[1]));
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const contrastOk = async (page, sel, tag, what) => {
  const bad = await textContrast(page, sel, { under: TT_BG });
  check(`[${tag}] ${what}: every text passes 4.5:1`, bad.length === 0, JSON.stringify(bad.slice(0, 3)));
};

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]')?.click());
  await page.waitForSelector("#time-travel-year option", { state: "attached", timeout: 10000 });
  await page.evaluate(() => { const y = document.querySelector("#time-travel-year"); y.value = "1995"; y.dispatchEvent(new Event("change")); });
  await page.click("#btn-time-travel-interview");
  await page.waitForSelector("#time-travel-offers .tt-offer", { timeout: 10000 });

  // ---- the interview panel
  await page.click('#time-travel-offers .tt-offer[data-archetype="contender"]');
  check(`[${tag}] offer confirm now says "go to the interview"`, (await text(page, "#tt-offers-zone .tt-confirm [data-act=confirm]")) === "去面试");
  await page.click("#tt-offers-zone .tt-confirm [data-act=confirm]");
  await page.waitForSelector("#tt-interview:not([hidden])");
  check(`[${tag}] interview: 3 questions x 3 answers`, (await page.$$eval("#tt-interview .tt-question", (q) => q.map((x) => x.querySelectorAll(".tt-answer").length).join())) === "3,3,3");
  check(`[${tag}] submit is locked until every question is answered`, await page.$eval("#tt-interview [data-act=submit]", (b) => b.disabled && b.textContent.includes("还差 3 题")));
  await contrastOk(page, "#tt-interview", tag, "interview panel");
  await shoot(page, `${OUT}/${tag}-1-interview.png`);

  // ---- a bad fit: turned down, crossed off
  await page.click("#tt-interview [data-act=back]");
  check(`[${tag}] "try another club" closes the panel`, !(await visible(page, "#tt-interview")));
  await openInterview(page, "contender");
  await sitInterview(page, "contender", [-1, -1, 0]);
  await page.waitForSelector('#time-travel-offers .tt-offer-rejected[data-archetype="contender"]');
  check(`[${tag}] rejection says so`, (await text(page, "#time-travel-status")).includes("婉拒"), await text(page, "#time-travel-status"));
  check(`[${tag}] the rejected card is stamped and disabled`, await page.$eval('.tt-offer[data-archetype="contender"]', (el) => el.disabled && el.querySelector(".tt-stamp-no")?.textContent === "面试未通过"));
  check(`[${tag}] nobody was hired`, (await saved(page)) === null);

  // ---- a good fit: hired with the interview's trust, and the career logs it
  const middleTrust = await trustOf(page, "middle");
  await openInterview(page, "middle");
  await sitInterview(page, "middle", [1, 1, 0]);
  await page.waitForSelector("#time-travel-decision:not([hidden])", { timeout: 15000 });
  const root = await saved(page);
  check(`[${tag}] hired at offer trust + 6 (fit +2)`, root?.story?.frontOfficeTrust === middleTrust + 6, `${root?.story?.frontOfficeTrust} vs ${middleTrust}`);
  check(`[${tag}] the interview is in the career log`, root?.story?.eventLog?.some((e) => e.type === "interview" && e.score === 2));
  check(`[${tag}] status explains the interview result`, (await text(page, "#time-travel-status")).includes("面试通过"));

  // ---- the prophecy board
  check(`[${tag}] the sleeper choice warns you'll have to name him`, (await text(page, '[data-story-choice="share-draft-sleeper"]')).includes("说出一个名字"));
  await page.click('[data-story-choice="share-draft-sleeper"]');
  await page.click("#time-travel-decision > .tt-confirm-slot [data-act=confirm]");
  await page.waitForSelector("#tt-prophecy-pick:not([hidden])");
  check(`[${tag}] the intro deck steps aside for the board`, !(await visible(page, "#time-travel-decision-choices")));
  const board = await page.$$eval("#tt-prophecy-pick [data-bref]", (els) => els.map((el) => ({ bref: el.dataset.bref, img: !!el.querySelector("img"), band: /\d+–\d+/.test(el.querySelector(".tt-memory")?.textContent || "") })));
  check(`[${tag}] three prospects, each with a photo and a remembered band`, board.length === 3 && board.every((b) => b.img && b.band), JSON.stringify(board));
  check(`[${tag}] the rules say what counts as a hit`, (await text(page, "#tt-prophecy-pick .tt-prophecy-rules")).includes("≥ 76"));
  await contrastOk(page, "#tt-prophecy-pick", tag, "prophecy board");
  await shoot(page, `${OUT}/${tag}-2-board.png`);
  await page.click("#tt-prophecy-pick .tt-prophecy-back");
  check(`[${tag}] "choose something else" brings the deck back`, (await visible(page, "#time-travel-decision-choices")) && !(await visible(page, "#tt-prophecy-pick")));
  await page.click('[data-story-choice="share-draft-sleeper"]');
  await page.click("#time-travel-decision > .tt-confirm-slot [data-act=confirm]");
  await page.click(`#tt-prophecy-pick [data-bref="${board[1].bref}"]`);
  await page.click("#tt-prophecy-pick .tt-confirm [data-act=confirm]");
  await page.waitForSelector("#tt-prophecy:not([hidden])", { timeout: 10000 });
  const pledged = (await saved(page))?.story;
  check(`[${tag}] the prophecy is saved, pending, on the name you picked`, pledged?.prophecy?.bref === board[1].bref && pledged.prophecy.status === "pending");
  check(`[${tag}] the opening decision is done`, pledged?.pendingDecision !== "future-knowledge-intro");
  check(`[${tag}] HQ card says when it settles`, (await text(page, "#tt-prophecy")).includes(`${pledged.prophecy.judgeYear} 赛季结束后揭晓`));
  await contrastOk(page, "#tt-prophecy", tag, "prophecy card (pending)");

  // ---- verdict cards (flip the saved prophecy, reopen the screen)
  for (const [status, best, word] of [["hit", 81, "预言成真"], ["miss", 64, "预言落空"]]) {
    await page.evaluate(([s, b]) => {
      const r = JSON.parse(localStorage.getItem("cls_root_v3"));
      r.story.prophecy = { ...r.story.prophecy, status: s, best: b };
      localStorage.setItem("cls_root_v3", JSON.stringify(r));
    }, [status, best]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
    // With a saved career the mode card alone opens the "start a career" form: resume it first. A career with a
    // pending story event resumes straight into HQ; otherwise it lands on the season hub and HQ is one click away.
    await page.evaluate(() => document.querySelector("#btn-long-career-resume")?.click());
    await page.waitForSelector("#tt-prophecy:not([hidden])", { timeout: 15000 }).catch(async () => {
      await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
      await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]')?.click());
      await page.waitForSelector("#tt-prophecy:not([hidden])", { timeout: 10000 });
    });
    check(`[${tag}] ${status} verdict shown from the save`, (await text(page, "#tt-prophecy")).includes(word) && (await text(page, "#tt-prophecy")).includes(String(best)));
    await contrastOk(page, "#tt-prophecy", tag, `prophecy card (${status})`);
  }
  await shoot(page, `${OUT}/${tag}-3-verdict.png`);
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();

  // ---- English: the interview panel and the board, no Chinese left
  const en = await browser.newPage({ viewport: { width, height } });
  en.on("dialog", (d) => d.accept());
  await en.goto(BASE, { waitUntil: "domcontentloaded" });
  await en.evaluate(() => { localStorage.clear(); });
  await en.reload({ waitUntil: "domcontentloaded" });
  await en.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await en.evaluate(() => document.querySelector("#btn-lang").click());
  await en.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]')?.click());
  await en.waitForSelector("#time-travel-year option", { state: "attached" });
  await en.evaluate(() => { const y = document.querySelector("#time-travel-year"); y.value = "1995"; y.dispatchEvent(new Event("change")); });
  await en.click("#btn-time-travel-interview");
  await en.waitForSelector("#time-travel-offers .tt-offer");
  await openInterview(en, "middle");
  await en.waitForSelector("#tt-interview:not([hidden])");
  check(`[${tag}] EN interview panel has no Chinese`, !CJK.test(await text(en, "#tt-interview")), (await text(en, "#tt-interview")).match(/.{0,20}[\u4e00-\u9fff].{0,20}/)?.[0]);
  await sitInterview(en, "middle", [1, 0, 0]);
  await en.waitForSelector("#time-travel-decision:not([hidden])", { timeout: 15000 });
  await en.click('[data-story-choice="share-draft-sleeper"]');
  await en.click("#time-travel-decision > .tt-confirm-slot [data-act=confirm]");
  await en.waitForSelector("#tt-prophecy-pick:not([hidden])");
  check(`[${tag}] EN prophecy board has no Chinese`, !CJK.test(await text(en, "#tt-prophecy-pick")), (await text(en, "#tt-prophecy-pick")).match(/.{0,20}[\u4e00-\u9fff].{0,20}/)?.[0]);
  await shoot(en, `${OUT}/${tag}-4-en-board.png`);
  await en.close();
}
await browser.close();
const failed = report.filter((line) => line.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
