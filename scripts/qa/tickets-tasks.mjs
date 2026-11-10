import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2];
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
mkdirSync(OUT, { recursive: true });
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const home = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();

  const makeAccount = (name, tickets) => page.evaluate(async ({ name, tickets }) => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const a = acc.createAccount(name);
    const low = players.PLAYERS.filter((p) => players.overall(p) < 70).slice(0, 12).map((p) => p.id);
    a.playerIds = low; a.onboardingDone = true; a.gold = 1000; a.tickets = tickets;
    a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  }, { name, tickets });
  const openDraw = async () => {
    await page.click("#btn-daily-draw");
    await page.waitForSelector("#screen-draw.active");
  };
  const drawText = () => page.evaluate(() => document.querySelector("#screen-draw")?.innerText || "");
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  // --- Account A: no banked tickets — the task route end to end ---
  await makeAccount("任务 QA", 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  await openDraw();
  let status = await page.textContent("#draw-status");
  check(`[${tag}] status shows 0 tickets and the 2-of-3 ask`, /抽卡券 0/.test(status) && /再完成 2 项任务/.test(status), status.replace(/\s+/g, " ").slice(0, 120));
  let tasks = await page.textContent("#draw-tasks");
  check(`[${tag}] task board lists 3 tasks + 2-of-3 draw row + XP challenge + gold milestone`, /打 3 场排位/.test(tasks) && /排位赢 2 场/.test(tasks) && /金币挑战赛赢 3 场/.test(tasks) && /完成任意 2 项领取今日球员卡/.test(tasks) && /账号经验 \+40/.test(tasks) && /累计 10 胜/.test(tasks) && /金币 \+50/.test(tasks));
  check(`[${tag}] journey strip is visible before the claim`, /今日篮球之旅/.test(tasks) && /抽到卡后，这里会告诉你它在阵容里的位置/.test(tasks));
  let btn = await page.textContent("#btn-draw-pull");
  check(`[${tag}] before tasks: button disabled, asks for 2 more tasks`, /再完成 2 项任务可领取/.test(btn) && (await page.$eval("#btn-draw-pull", (b) => b.disabled)), btn.trim());
  let body = await drawText();
  check(`[${tag}] no gold extra-draw button and no free pull anywhere`, !/金币加抽/.test(body) && !/免费抽卡/.test(body), body.replace(/\s+/g, " ").slice(0, 120));

  // 3 ranked wins complete play + win = 2 of 3 tasks.
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const tasks = await import("/js/data/dailyTasks.js");
    const a = acc.getAccount(acc.getActiveAccountId());
    for (let i = 0; i < 3; i++) { acc.recordRankedResult(a, true); tasks.recordRankedTasks(a, true); }
  });
  await page.click("#btn-draw-back");
  await page.click("#btn-collection-draw");
  await page.waitForSelector("#screen-draw.active");
  btn = await page.textContent("#btn-draw-pull");
  check(`[${tag}] 2 of 3 tasks done: button offers the daily card`, /领取今日球员卡/.test(btn), btn.trim());
  await page.click("#btn-draw-pull");
  await page.waitForSelector(".draw-reveal");
  btn = await page.textContent("#btn-draw-pull");
  check(`[${tag}] after claiming: button says claimed`, /今日球员卡已领取/.test(btn), btn.trim());
  tasks = await page.textContent("#draw-tasks");
  // "已领" now appears twice: the draw row + the journey step 2 line.
  check(`[${tag}] after claiming: draw row marked claimed once`, (tasks.match(/已领/g) || []).length === 2, tasks.replace(/\s+/g, " ").slice(0, 120));
  check(`[${tag}] journey: after claiming it names the card's lineup spot`, /今日篮球之旅/.test(tasks) && (/首发阵容/.test(tasks) || /收藏第/.test(tasks)), tasks.replace(/\s+/g, " ").slice(0, 200));
  const revealA = await page.textContent(".draw-reveal");
  check(`[${tag}] reveal shows the card with OVR`, /OVR/.test(revealA), revealA.replace(/\s+/g, " ").slice(0, 120));
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  await openDraw();
  btn = await page.textContent("#btn-draw-pull");
  check(`[${tag}] refresh does not duplicate the claim`, /今日球员卡已领取/.test(btn) && (await page.$eval("#btn-draw-pull", (b) => b.disabled)), btn.trim());
  check(`[${tag}] draw: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-daily-draw.png`, fullPage: true });

  // --- Account B: banked tickets + tasks done — the task route is free ---
  await makeAccount("任务+票券 QA", 2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const tasks = await import("/js/data/dailyTasks.js");
    const a = acc.getAccount(acc.getActiveAccountId());
    for (let i = 0; i < 3; i++) { acc.recordRankedResult(a, true); tasks.recordRankedTasks(a, true); }
  });
  await openDraw();
  btn = await page.textContent("#btn-draw-pull");
  check(`[${tag}] tasks done with tickets banked: task route offered, not the ticket route`, /领取今日球员卡/.test(btn) && !/抽卡券/.test(btn), btn.trim());
  await page.click("#btn-draw-pull");
  await page.waitForSelector(".draw-reveal");
  status = await page.textContent("#draw-status");
  check(`[${tag}] task-route claim spends no ticket`, /抽卡券 2/.test(status), status.replace(/\s+/g, " ").slice(0, 100));

  // --- Account C: banked ticket, no tasks — the legacy ticket route ---
  await makeAccount("票券 QA", 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  await openDraw();
  btn = await page.textContent("#btn-draw-pull");
  check(`[${tag}] no tasks but 1 ticket: ticket route offered`, /用抽卡券领取（剩 1 张）/.test(btn), btn.trim());
  await page.click("#btn-draw-pull");
  await page.waitForSelector(".draw-reveal");
  const reveal = await page.textContent(".draw-reveal");
  check(`[${tag}] ticket-route reveal shows the ticket flag`, /抽卡券 −1/.test(reveal), reveal.replace(/\s+/g, " ").slice(0, 120));
  status = await page.textContent("#draw-status");
  check(`[${tag}] ticket spent, slot claimed`, /抽卡券 0/.test(status) && /今日球员卡已领取/.test(await page.textContent("#btn-draw-pull")));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}
await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
