// Shared QA flow: a fresh browser profile -> an account with a coach and a roster -> a single-season hub -> the live game screen (#screen-game active).
import { openSingleSeason } from "./page.mjs";

export async function enterLiveGame(page, BASE, name = "Broadcast QA") {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 90000 });
  await page.evaluate(async (name) => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount(name);
    const per = Math.floor(1950 / 12);
    const sorted = players.PLAYERS.map((p) => ({ id: p.id, bref: p.bref, ovr: players.overall(p), sal: market.playerSalary(p) })).filter((p) => p.sal <= per).sort((x, y) => y.ovr - x.ovr);
    const picked = []; const seen = new Set(); let budget = 0;
    for (const p of sorted) { if (picked.length >= 12) break; if (p.bref && seen.has(p.bref)) continue; if (budget + p.sal > 1950) continue; picked.push(p.id); if (p.bref) seen.add(p.bref); budget += p.sal; }
    a.playerIds = picked; a.onboardingDone = true; a.gold = 500; a.fragments = 200;
    a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  }, name);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 90000 });
  await openSingleSeason(page);
  await page.waitForSelector("#screen-season.active");
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 15000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 30000 });
  await page.click("#btn-season-play");
  await page.waitForSelector("#screen-setup.active", { timeout: 15000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
}
