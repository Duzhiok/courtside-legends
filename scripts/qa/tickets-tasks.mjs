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
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const a = acc.createAccount("新手 QA");
    const low = players.PLAYERS.filter((p) => players.overall(p) < 70).slice(0, 12).map((p) => p.id);
    a.playerIds = low; a.onboardingDone = true;
    a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  await page.click("#btn-daily-draw");
  await page.waitForSelector("#screen-draw.active");
  const status = await page.textContent("#draw-status");
  check(`[${tag}] welcome gift: 4 tickets`, /抽卡券 4/.test(status), status.replace(/\s+/g, " ").slice(0, 100));
  const tasks = await page.textContent("#draw-tasks");
  check(`[${tag}] task board lists 2 daily tasks + milestone`, /打 1 场排位/.test(tasks) && /排位赢 1 场/.test(tasks) && /累计 5 胜/.test(tasks));
  check(`[${tag}] first button says free pull`, /免费抽卡/.test(await page.textContent("#btn-draw-pull")));

  const results = [];
  for (let i = 0; i < 5; i++) {
    const label = await page.textContent("#btn-draw-pull");
    await page.click("#btn-draw-pull");
    await page.waitForSelector(".draw-reveal");
    const text = await page.textContent(".draw-reveal");
    const ovr = Number((text.match(/OVR (\d+)/) || [])[1] || 0);
    results.push({ label: label.trim(), ovr, pity: /保底触发/.test(text), ticket: /抽卡券 −1/.test(text) });
    if (await page.$(".roll-option")) await page.click('[data-roll-keep="old"]');
  }
  check(`[${tag}] pulls 2–5 used tickets`, results.slice(1).every((r) => r.ticket) && /用抽卡券/.test(results[1].label), results.map((r) => r.label).join(" | "));
  check(`[${tag}] 新手保底: an 85+ within 5 pulls`, results.some((r) => r.ovr >= 85), results.map((r) => r.ovr).join(","));
  const end = await page.textContent("#btn-draw-pull");
  check(`[${tag}] after all 5: points to ranked tasks`, /打排位赚抽卡券|金币加抽/.test(end), end.trim());
  check(`[${tag}] draw: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-tickets.png`, fullPage: true });

  // task settle → ✅ and ticket back
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const tasks = await import("/js/data/dailyTasks.js");
    const a = acc.getAccount(acc.getActiveAccountId());
    acc.recordRankedResult(a, true);
    tasks.recordRankedTasks(a, true);
  });
  await page.click("#btn-draw-back");
  await page.click("#btn-collection-draw");
  await page.waitForSelector("#screen-draw.active");
  const after = await page.textContent("#draw-tasks");
  check(`[${tag}] tasks show claimed after a ranked win`, (after.match(/已领/g) || []).length === 2, after.replace(/\s+/g, " ").slice(0, 120));
  check(`[${tag}] ticket from tasks usable`, /用抽卡券（剩 2）/.test(await page.textContent("#btn-draw-pull")));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}
await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
