// Browser QA: Prestige Career System (The Architect, 3+1). Verifies the
// entry in its locked and unlocked states (desktop + mobile), the dev-only
// override (?architect=1 / ?architect=0), the prestige era briefing, and
// that a real unlock derived from seeded completion records persists
// across reload. The full career playthrough (retire a Coach career,
// retire a GM career, watch the card unlock) is a manual Mac check —
// it takes two full careers and cannot run in a smoke script.
// Usage: node scripts/qa/career-architect.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/career-architect";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function openCareer(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.home-tab[data-category="career"]');
  await page.waitForTimeout(300);
}

function careerState() {
  const card = document.querySelector('[data-career-identity="gm_coach"]');
  const closed = card.querySelector('[data-architect-lock="closed"]');
  const open = card.querySelector('[data-architect-lock="open"]');
  return {
    lockClosedVisible: closed && !closed.hidden,
    lockOpenVisible: open && !open.hidden,
    pills: [...card.querySelectorAll("[data-architect-pill]")].map((el) => el.textContent.trim()),
    progress: card.querySelector("[data-architect-progress]")?.textContent.trim() ?? "",
    note: document.querySelector("#career-entry-note"),
    eraHidden: document.querySelector("#career-era-panel").hidden,
  };
}

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());

  // Locked state (fresh profile, no account, no completions).
  await openCareer(page);
  const locked = await page.evaluate(careerState);
  check(`[${tag}] locked: closed lock shown, open lock hidden`, locked.lockClosedVisible && !locked.lockOpenVisible, JSON.stringify(locked));
  check(`[${tag}] locked: progress reads 0 / 2`, /0 \/ 2/.test(locked.progress), locked.progress);
  check(`[${tag}] locked: pills show Coach + GM`, JSON.stringify(locked.pills) === JSON.stringify(["教练生涯", "经理生涯"]), locked.pills.join(" | "));
  await page.screenshot({ path: `${OUT}/${tag}-career-locked.png`, fullPage: true, animations: "disabled" });
  await page.click('[data-career-identity="gm_coach"]');
  await page.waitForTimeout(200);
  const lockedNote = await page.evaluate(() => {
    const note = document.querySelector("#career-entry-note");
    return { visible: !note.hidden, text: note.textContent.trim(), eraHidden: document.querySelector("#career-era-panel").hidden, stillHome: document.querySelector("#screen-home")?.classList.contains("active") };
  });
  check(`[${tag}] locked click shows the unlock requirements, never a flow`, lockedNote.visible && lockedNote.text.includes("尚未解锁") && lockedNote.eraHidden && lockedNote.stillHome, lockedNote.text);

  // Dev-only override: ?architect=1 unlocks for this session.
  await page.goto(`${BASE}?architect=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.home-tab[data-category="career"]');
  await page.waitForTimeout(300);
  const unlocked = await page.evaluate(careerState);
  check(`[${tag}] ?architect=1: open lock shown, closed lock hidden`, unlocked.lockOpenVisible && !unlocked.lockClosedVisible, JSON.stringify(unlocked));
  check(`[${tag}] ?architect=1: progress reads unlocked`, /已解锁|Unlocked/.test(unlocked.progress), unlocked.progress);
  await page.screenshot({ path: `${OUT}/${tag}-career-unlocked.png`, fullPage: true, animations: "disabled" });
  await page.click('[data-career-identity="gm_coach"]');
  await page.waitForTimeout(200);
  const era = await page.evaluate(() => {
    const panel = document.querySelector("#career-era-panel");
    const modern = document.querySelector('[data-career-era="modern"]');
    return { visible: !panel.hidden, brief: panel.textContent, modernDisabled: modern?.disabled === true };
  });
  check(`[${tag}] unlocked Architect opens the era step with the prestige briefing`, era.visible && /双重目标/.test(era.brief) && /决策连锁/.test(era.brief) && /传奇称号/.test(era.brief) && /The Architect/.test(era.brief), era.brief.slice(0, 120));
  check(`[${tag}] era step: Modern is disabled`, era.modernDisabled);
  await page.screenshot({ path: `${OUT}/${tag}-career-era-prestige.png`, fullPage: true, animations: "disabled" });
  await page.click('[data-career-era="historical"]');
  await page.waitForFunction(() => document.querySelector("#screen-time-travel")?.classList.contains("active"), null, { timeout: 10000 });
  check(`[${tag}] Historical era reaches the Time Travel career screen`, true);

  // ?architect=0 clears the override in the same tab: the lock is back.
  await page.goto(`${BASE}?architect=0`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.home-tab[data-category="career"]');
  await page.waitForTimeout(300);
  const relocked = await page.evaluate(careerState);
  check(`[${tag}] ?architect=0: the lock is back`, relocked.lockClosedVisible && !relocked.lockOpenVisible, JSON.stringify(relocked));

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

async function runSeededUnlock() {
  // A real unlock derived from completed-career records (not the dev
  // override): seed an account with one Coach + one GM completion, load,
  // and confirm the card unlocks — then reload and confirm it persists.
  const tag = "desktop";
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.addInitScript(() => {
    const account = {
      id: "qa-architect", name: "QA", createdAt: Date.now(),
      playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced",
      lastDailyDraw: null, drawHistory: [], gold: 0, rankedWins: 0, rankedLosses: 0,
      careerCompletions: [
        { careerId: "qa-coach-1", role: "COACH", prestige: false, year: 1998, seasons: 3, championships: 1, tier: "star", reason: "retired", at: Date.now() },
        { careerId: "qa-gm-1", role: "GM", prestige: false, year: 2001, seasons: 5, championships: 0, tier: "veteran", reason: "retired", at: Date.now() },
      ],
    };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-architect");
  });
  await openCareer(page);
  const seeded = await page.evaluate(careerState);
  check(`[${tag}/seeded] two completion records unlock the Architect`, seeded.lockOpenVisible && !seeded.lockClosedVisible, JSON.stringify(seeded));
  check(`[${tag}/seeded] both pills carry the check mark`, JSON.stringify(seeded.pills) === JSON.stringify(["✓ 教练生涯", "✓ 经理生涯"]), seeded.pills.join(" | "));
  check(`[${tag}/seeded] progress reads unlocked`, /已解锁|Unlocked/.test(seeded.progress), seeded.progress);
  await page.screenshot({ path: `${OUT}/${tag}-career-seeded-unlock.png`, fullPage: true, animations: "disabled" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.home-tab[data-category="career"]');
  await page.waitForTimeout(300);
  const persisted = await page.evaluate(careerState);
  check(`[${tag}/seeded] the unlock persists across reload`, persisted.lockOpenVisible && !persisted.lockClosedVisible, JSON.stringify(persisted));
  check(`[${tag}/seeded] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await runSeededUnlock();
await browser.close();
const failed = report.filter((r) => r.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
