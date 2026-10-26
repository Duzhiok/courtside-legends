// Browser QA for the draft-pick calendar in the trade market.
//   - each side offers six real picks (a first and a second for this and the next two drafts)
//   - a pick-for-pick trade moves them, and the market labels whose pick each one is
//   - the trade survives a page reload (the ownership ledger is saved and restored)
//   - narrow screens do not overflow
//
// NOTE on the setup: in a freshly generated 32-team league EVERY CPU club is already far above the
// hard cap (payrolls 2500-5500 against 2350), and executeTrade refuses any trade that leaves a CPU
// club above it -- even a salary-neutral pick swap -- so no trade can happen in a fresh league. That is a
// separate, pre-existing rule question (see docs/WORKNOTE.md). To exercise the pick flow this script
// scales every CPU salary down in the saved season first, then comes back through the real
// "继续生涯" path, which also covers the legacy-season -> root-save migration.
// Usage: node scripts/qa/pick-calendar.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/pick-calendar";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

// Photograph the scrolling list that holds the picks, scrolled so the picks are in view. A whole-page
// screenshot can easily miss them: they sit below the players inside a 420px scroll box.
async function shootPickList(page, sel, path) {
  const first = page.locator(sel).first();
  const list = await first.evaluateHandle((el) => {
    let s = el.closest("label").parentElement;
    while (getComputedStyle(s).overflowY === "visible") s = s.parentElement;
    return s;
  });
  await first.scrollIntoViewIfNeeded();
  await list.asElement().scrollIntoViewIfNeeded();
  await list.asElement().screenshot({ path });
}

const rows = (page, sel) => page.$$eval(sel, (els) => els.map((el) => el.closest("label").textContent.replace(/\s+/g, " ").trim()));

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount("QA");
    a.playerIds = players.PLAYERS.filter((p) => players.overall(p) >= 55 && players.overall(p) <= 72)
      .map((p) => ({ id: p.id, sal: market.playerSalary(p) })).sort((x, y) => x.sal - y.sal).slice(0, 15).map((p) => p.id);
    a.onboardingDone = true; a.gold = 500; a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.mode-card[data-mode="season"]');
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("cls_season_v1"));
    for (const [id, team] of Object.entries(st.teams)) {
      if (id === st.userTeamId) continue;
      for (const p of team.players) p.salary = 5;
    }
    localStorage.setItem("cls_season_v1", JSON.stringify(st));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector(".sm-give-pick", { timeout: 10000 });

  const mine0 = await rows(page, ".sm-give-pick");
  const theirs0 = await rows(page, ".sm-want-pick");
  check(`[${tag}] I can offer six picks (first + second for three drafts)`, mine0.length === 6, `${mine0.length}`);
  check(`[${tag}] the other club has six to ask for`, theirs0.length === 6, `${theirs0.length}`);
  const firsts = mine0.filter((t) => /首轮/.test(t)).length;
  check(`[${tag}] three firsts and three seconds`, firsts === 3 && mine0.length - firsts === 3, mine0.join(" | ").slice(0, 160));
  check(`[${tag}] picks are valued (≈ +N OVR) with no NaN / undefined`, mine0.concat(theirs0).every((t) => /≈ \+\d/.test(t) && !/NaN|undefined/.test(t)));
  check(`[${tag}] my own picks are not prefixed with a club name`, mine0.every((t) => !/ 的 /.test(t)));
  const years = [...new Set(mine0.map((t) => (t.match(/(\d{4}) 年/) || [])[1]))].sort();
  check(`[${tag}] covers three consecutive drafts starting this year`, years.length === 3 && Number(years[2]) - Number(years[0]) === 2, years.join(","));
  const heads = await page.$$eval(".sm-pick-head", (els) => els.map((e) => e.textContent.trim()));
  check(`[${tag}] each list has a "选秀权 · 6" heading, so picks do not read as more players`, heads.length === 2 && heads.every((t) => t === "选秀权 · 6"), heads.join(" / "));
  const titles = await page.$$eval("#sm-trade-cols h5", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  check(`[${tag}] column titles say how many players and picks are inside`, titles.length >= 2 && titles.slice(0, 2).every((t) => /\d+ 名球员 · 6 个选秀权/.test(t)), titles.join(" / "));
  const headVisible = await page.evaluate(() => {
    const list = document.querySelector(".sm-pick-head").parentElement;
    list.scrollTop = list.scrollHeight;
    const hr = document.querySelector(".sm-pick-head").getBoundingClientRect(), lr = list.getBoundingClientRect();
    return hr.top >= lr.top - 1 && hr.bottom <= lr.bottom + 1;
  });
  check(`[${tag}] the heading stays in view once you scroll down to the picks`, headVisible);
  await shootPickList(page, ".sm-want-pick", `${OUT}/${tag}-their-picks.png`);
  await page.screenshot({ path: `${OUT}/${tag}-before.png` });

  // A pick-for-pick swap of two second-rounders from the same draft: fair, so the CPU accepts.
  const myIdx = mine0.findIndex((t) => /次轮/.test(t));
  const theirIdx = theirs0.findIndex((t) => /次轮/.test(t));
  await page.locator(".sm-give-pick").nth(myIdx).check();
  await page.locator(".sm-want-pick").nth(theirIdx).check();
  await page.click("#btn-sm-trade");
  await page.waitForSelector(".sm-give-pick", { timeout: 10000 });
  // The hub re-renders after a successful trade (so the hint line is blank): judge it by its effect.
  const mine1 = await rows(page, ".sm-give-pick");
  check(`[${tag}] the trade went through (my pick list changed)`, JSON.stringify(mine1) !== JSON.stringify(mine0));
  check(`[${tag}] I still hold six picks (gave one, got one)`, mine1.length === 6, `${mine1.length}`);
  // The checkbox must sit on the same line as the start of its label. A label a few px too wide used to
  // push the whole text onto a second line and leave the checkbox stranded above it.
  const stranded = await page.evaluate(() => [...document.querySelectorAll("#sm-trade-cols label.sm-trade-check")].filter((label) => {
    const box = label.querySelector("input").getBoundingClientRect();
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    let node; let top = null;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rect = range.getClientRects()[0];
      if (rect) { top = rect.top; break; }
    }
    return top !== null && Math.abs(top - box.top) > 8;
  }).map((label) => label.textContent.replace(/\s+/g, " ").trim().slice(0, 40)));
  check(`[${tag}] every checkbox shares a line with its label (none stranded above wrapped text)`, stranded.length === 0, stranded.join(" | "));
  check(`[${tag}] one of them is now another club's, and it says whose`, mine1.filter((t) => / 的 /.test(t)).length === 1, mine1.filter((t) => / 的 /.test(t)).join(" | "));
  check(`[${tag}] the pick I gave away is gone from my list`, !mine1.includes(mine0[myIdx]) || mine1.filter((t) => t === mine0[myIdx]).length < mine0.filter((t) => t === mine0[myIdx]).length);
  await page.screenshot({ path: `${OUT}/${tag}-after.png` });
  await shootPickList(page, ".sm-give-pick", `${OUT}/${tag}-my-picks-after.png`);

  // The ledger must survive a reload. After one, the app migrates a plain season into the root save
  // as a career, so the way back in is the home screen's "继续生涯" -- not the setup page.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector(".sm-give-pick", { timeout: 10000 });
  const mine2 = await rows(page, ".sm-give-pick");
  check(`[${tag}] after a reload I still hold the acquired pick`, mine2.filter((t) => / 的 /.test(t)).length === 1 && mine2.length === 6, mine2.join(" | ").slice(0, 170));
  const saved = await page.evaluate(() => {
    const raw = Object.keys(localStorage).filter((k) => k.startsWith("cls_root")).map((k) => localStorage.getItem(k)).join("");
    return { hasLedger: /pickOwnership/.test(raw), hasPools: /"draftPoolsSeeded"/.test(raw), bytes: raw.length };
  });
  check(`[${tag}] the ownership ledger is in the save`, saved.hasLedger, JSON.stringify(saved));
  check(`[${tag}] no stored token pools are kept any more`, !saved.hasPools);
  check(`[${tag}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
const failed = report.filter((r) => r.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
