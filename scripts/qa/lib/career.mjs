// Flows every managed-career QA needs: build a REAL 1995 career, get back to the season hub, hand-coach
// one game. Built by the real engine and driven through the real buttons -- nothing here fakes the app.
import { homeActive } from "./page.mjs";

/** Resume the saved career from the home screen and land on the season hub. */
export async function resumeToHub(page) {
  await homeActive(page);
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 }).catch(async () => {
    await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
    await page.click("#btn-time-travel-continue");
    await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  });
}

/**
 * Runs INSIDE the page: a real 1995 career, intro decision answered like a player's first click, saved.
 * `growth`: arm every young player's XP bar 10 short of a level (C2). `epiphanyGames`: pre-load that many
 * big games into every player's streak window (C3), so the next game is the one that tips it.
 * `learnedSkills`: the first player has already learned two skills in play, the second one (C3's ledger).
 */
export async function createCareerInPage({ growth = false, epiphanyGames = 0, learnedSkills = false } = {}) {
  const ttc = await import("/js/modes/timeTravelCareer.js");
  const sr = await import("/js/data/saveRoot.js");
  const dev = await import("/js/modes/playerDevelopment.js");
  const bal = await import("/js/career/balance.js");
  const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
  const root = ttc.resolveFutureKnowledgeChoice(ttc.acceptInterviewOffer(prologue, prologue.offers[1].id), "introduce-load-management");
  const season = root.leagueCareer.season;
  const mine = season.teams[season.userTeamId].players.filter((p) => p.bref);
  if (growth) {
    root.leagueCareer.management.growth = Object.fromEntries(mine.filter((p) => dev.resolvedAge(p) <= 32)
      .map((p) => [p.bref, { year: season.year, xp: bal.GROWTH_XP_PER_LEVEL - 10, levels: 0, deltas: {} }]));
  }
  if (epiphanyGames) {
    const big = { min: 30, pts: 30, reb: 12, ast: 10, stl: 3, blk: 3, tpm: 4, twoPm: 8 }; // qualifies for every rule
    root.leagueCareer.management.epiphany = Object.fromEntries(mine.map((p) => [p.bref, { form: Array(epiphanyGames).fill(big), learned: [] }]));
  }
  if (learnedSkills) {
    const skills = await import("/js/data/skills.js");
    const ids = Object.keys(skills.SKILL_PACKS);
    root.leagueCareer.management.epiphany = Object.fromEntries(mine.map((p, i) => [p.bref, { form: [], learned: i === 0 ? [ids[0], ids[1]] : i === 1 ? [ids[2]] : [] }]));
  }
  sr.writeRootSave(root, localStorage);
}

/** Fresh browser state -> a created career -> the season hub. */
export async function openCareer(page, base, config) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.evaluate(createCareerInPage, config);
  await page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(page);
}

/** Hand-coach the pending game (autopilot for the breaks, a fake clock to fast-forward). True when it ended. */
export async function playLive(page, state) {
  await page.click("#btn-season-play");
  await page.waitForSelector("#screen-setup.active", { timeout: 10000 });
  if (!state.clockInstalled) { await page.clock.install(); state.clockInstalled = true; }
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 10000 });
  return fastForwardToResult(page);
}

/**
 * From a live #screen-game: autopilot on, max speed, then run the (already installed) fake clock until
 * the result screen shows. True when it ended. Callers must page.clock.install() BEFORE the game starts.
 * `onStep` runs after every `stepMs` (default 30s) of game clock, so a caller can sample the page while the game is going.
 */
export async function fastForwardToResult(page, { onStep, stepMs = 30_000 } = {}) {
  for (const sel of ["#btn-auto-offense", "#btn-auto-defense"]) await page.click(sel);
  for (let i = 0; i < 2; i++) await page.click("#btn-speed");
  await page.click("#btn-pause-sim");
  const resultUp = () => page.evaluate(() => document.querySelector("#screen-result")?.classList.contains("active"));
  for (let i = 0; i < Math.ceil(1_800_000 / stepMs) && !(await resultUp()); i++) {
    await page.clock.runFor(stepMs);
    if (onStep && !(await resultUp())) await onStep(i);
    const stopped = await page.evaluate(() => {
      const btn = document.querySelector("#btn-pause-sim");
      return btn && !btn.hidden && btn.textContent.trim() === "继续模拟"; // Chinese UI only: call this before switching language
    });
    if (stopped) await page.click("#btn-pause-sim");
  }
  return resultUp();
}
