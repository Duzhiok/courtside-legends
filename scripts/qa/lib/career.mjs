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
 * Open the career HQ (the "time travel" screen) the way a player does: home -> "传奇生涯" tab -> the COACH card. With a career
 * loaded in memory that opens its HQ (perk points, finance, job board, contract); with none it opens the new-career wizard.
 * Clicked from JS so it works from any screen (the home panel may be hidden), through the same handler as a real click.
 * (Scripts used to click `.mode-card[data-mode="timeTravel"]` + `[data-career-era="historical"]`. That mode card is now the
 * LOCKED career-architect card -- it only opens an unlock note -- and the era picker is gone for a saved career, so every
 * "go back to HQ" step sat for 20-30s and timed out.)
 */
export async function enterTimeTravel(page) {
  await page.evaluate(() => {
    document.querySelector('.home-tab[data-category="career"]')?.click();
    document.querySelector('[data-career-identity="coach"]').click();
  });
  await page.waitForSelector("#screen-time-travel.active", { timeout: 20000 });
}

/**
 * Runs INSIDE the page: a real 1995 career, intro decision answered like a player's first click, saved.
 * `growth`: arm every young player's XP bar 10 short of a level (C2). `epiphanyGames`: pre-load that many
 * big games into every player's streak window (C3), so the next game is the one that tips it.
 * `learnedSkills`: the first player has already learned two skills in play, the second one (C3's ledger).
 * `role`: "COACH" for a coach-only career (the default is the full GM + coach career).
 */
export async function createCareerInPage({ growth = false, epiphanyGames = 0, learnedSkills = false, role = null } = {}) {
  const ttc = await import("/js/modes/timeTravelCareer.js");
  const sr = await import("/js/data/saveRoot.js");
  const dev = await import("/js/modes/playerDevelopment.js");
  const bal = await import("/js/career/balance.js");
  const players = await import("/js/data/players.js");
  await players.playersReady(); // perf-r3 gap: createTimeTravelPrologue reads PLAYERS synchronously (real bug, fixed in js/ui/timeTravel/screen.js too)
  const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7, ...(role ? { role } : {}) });
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
  // The auto-offense/auto-defense buttons live inside the coach drawer's body (closed by default once the
  // tip-off dead-ball window passes) AND behind B22's .adv-only gate (simple mode, the default, hides them).
  // Open the drawer, then flip to advanced -- same fix as B91's court-takeover.mjs, plus the drawer half B92 missed.
  const drawerOpen = await page.evaluate(() => document.querySelector(".coach-panel")?.classList.contains("coach-open"));
  if (!drawerOpen) await page.click("#btn-coach-drawer");
  await page.waitForSelector("#btn-coach-mode", { state: "visible", timeout: 5000 });
  const simple = await page.evaluate(() => document.querySelector("#btn-coach-mode")?.getAttribute("aria-pressed") !== "true");
  if (simple) await page.click("#btn-coach-mode");
  for (const sel of ["#btn-auto-offense", "#btn-auto-defense"]) await page.click(sel);
  for (let i = 0; i < 2; i++) await page.click("#btn-speed");
  await page.click("#btn-pause-sim");
  const resultUp = () => page.evaluate(() => document.querySelector("#screen-result")?.classList.contains("active"));
  for (let i = 0; i < Math.ceil(1_800_000 / stepMs) && !(await resultUp()); i++) {
    await page.clock.runFor(stepMs);
    if (onStep && !(await resultUp())) await onStep(i);
    // Any pause window (manual, dead ball, match event, injury) hides #btn-pause-sim and shows #btn-resume as the one
    // way back in (app.js syncPauseUi). The old check waited for #btn-pause-sim to read "继续模拟" while visible, which
    // no longer happens, so every caller sat paused until its timeout. Language-independent now.
    const stopped = await page.evaluate(() => {
      const btn = document.querySelector("#btn-resume");
      return !!btn && !btn.hidden && btn.getClientRects().length > 0;
    });
    if (stopped) await page.click("#btn-resume");
  }
  return resultUp();
}
