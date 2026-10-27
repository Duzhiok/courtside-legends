// Browser QA: "继续已有赛季" on the season setup page after a page reload.
//
// A quick season is written to the legacy key; the next start migrates it into the root save and DELETES
// the legacy key. The setup page's resume button only looked at the legacy key, so after any reload it
// vanished (the home page's "继续生涯" was the only way back). It must offer the saved season, resume the
// SAME one, and keep saving into the root save afterwards: if a resumed season were saved back to the
// legacy key only, the next start would treat that key as an orphan and drop the progress.
// Usage: node scripts/qa/season-resume.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/season-resume";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

// A screen fades in when it opens; a shot taken mid-fade is a washed-out picture that proves nothing.
const shot = async (page, path) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path, animations: "disabled" });
};

const home = (page) => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

/** Games played so far, read from whichever save currently holds the season. */
const playedInSave = (page) => page.evaluate(() => {
  const root = localStorage.getItem("cls_root_v3");
  const legacy = localStorage.getItem("cls_season_v1");
  const st = root ? JSON.parse(root)?.leagueCareer?.season : legacy ? JSON.parse(legacy) : null;
  if (!st) return { played: -1, where: "nowhere" };
  const played = (st.schedule || []).flat().filter((g) => g && g.played).length;
  return { played, where: root ? "root" : "legacy", team: st.userTeamId, year: st.year };
});

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  // Nothing outside this machine is needed, and a hanging web-font request is what stalls screenshots.
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await home(page);
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const a = acc.createAccount("QA");
    a.playerIds = players.PLAYERS.filter((p) => players.overall(p) >= 55 && players.overall(p) <= 72).slice(0, 15).map((p) => p.id);
    a.onboardingDone = true; a.gold = 500; a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await home(page);

  // A real quick season, one game in.
  await page.click('.mode-card[data-mode="season"]');
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click("#btn-season-sim-one");
  await page.waitForTimeout(800); // the save is written synchronously; this just lets the result render
  const before = await playedInSave(page);
  check(`[${tag}] one game is played and saved`, before.played >= 1, JSON.stringify(before));

  // Reload: the app starts fresh from storage, like the player closing the tab.
  await page.reload({ waitUntil: "domcontentloaded" });
  await home(page);
  const afterReload = await playedInSave(page);
  check(`[${tag}] after the reload the season lives in the root save`, afterReload.where === "root" && afterReload.played === before.played, JSON.stringify(afterReload));

  await page.click('.mode-card[data-mode="season"]');
  await page.waitForSelector("#season-setup-panel:not([hidden])", { timeout: 10000 });
  const btn = page.locator("#btn-season-resume");
  const visible = await btn.isVisible();
  check(`[${tag}] the setup page offers "继续" for the saved season`, visible);
  const label = visible ? (await btn.textContent()).trim() : "";
  check(`[${tag}] the button says which season it is`, /^继续：/.test(label), label);
  await shot(page, `${OUT}/${tag}-setup.png`);
  if (!visible) { check(`[${tag}] (cannot go on without the button)`, false); await page.close(); return; }

  await btn.click();
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  const resumed = await page.evaluate(() => document.querySelector("#season-hub-panel")?.textContent.replace(/\s+/g, " ").slice(0, 400));
  check(`[${tag}] it opens the season hub`, !!resumed && !/NaN|undefined/.test(resumed));
  await shot(page, `${OUT}/${tag}-resumed.png`);

  // The part that would silently lose progress: play on, reload again, the game must still be counted.
  await page.click("#btn-season-sim-one");
  await page.waitForTimeout(800);
  const played2 = await playedInSave(page);
  // One simulated "game" is a whole night of the league (16 games), so compare with "more", not "+1".
  check(`[${tag}] a game played after resuming is saved`, played2.played > before.played && played2.where === "root", JSON.stringify(played2));
  await page.reload({ waitUntil: "domcontentloaded" });
  await home(page);
  const survived = await playedInSave(page);
  check(`[${tag}] and it survives another reload (progress is not dropped as an orphan)`, survived.played === played2.played && survived.where === "root", JSON.stringify(survived));

  // No season at all: the button must not show.
  await page.evaluate(() => { localStorage.removeItem("cls_root_v3"); localStorage.removeItem("cls_season_v1"); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await home(page);
  await page.click('.mode-card[data-mode="season"]');
  await page.waitForSelector("#season-setup-panel:not([hidden])", { timeout: 10000 });
  check(`[${tag}] with nothing saved there is no resume button`, !(await page.locator("#btn-season-resume").isVisible()));

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
