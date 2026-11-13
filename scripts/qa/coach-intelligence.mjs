// Team Intelligence smoke test in a real browser: a coach-less account gets a free starter coach, the panel shows
// roles/conflicts, previewing a system changes the analysis WITHOUT saving, and only "Set as active" writes it.
// Usage: node scripts/qa/coach-intelligence.mjs /tmp/cls-qa/intel [http://127.0.0.1:5193/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, overflowers, shoot } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/intel";
const BASE = process.argv[3] || "http://127.0.0.1:5193/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
let fails = 0;
const check = (l, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`); };
const BREFS = ["doncilu01", "hardati02", "dragigo01", "millspa01", "mutomdi01", "curryst01", "goberru01", "thompkl01", "duncati01", "jordami01"];

const seed = (page) => page.evaluate(async (brefs) => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount, setActiveAccountId } = await import("/js/data/account.js");
  const ids = brefs.map((b) => PLAYERS.filter((p) => p.bref === b).sort((x, y) => overall(y) - overall(x))[0]?.id).filter(Boolean);
  const a = createAccount("QA Intel");
  const acc = getAccount(a.id);
  acc.playerIds = ids; acc.gold = 500; acc.onboardingDone = true; acc.welcomeGranted = true;
  acc.coachId = null; acc.coachIds = [];
  saveAccount(acc);
  setActiveAccountId(a.id);
  return a.id;
}, BREFS);

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  const id = await seed(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="players"]');
  await page.waitForSelector("#my-team-clubhouse-root .mti", { state: "visible", timeout: 15000 });
  const acct = () => page.evaluate(async (i) => { const { getAccount } = await import("/js/data/account.js"); const a = getAccount(i); return { coachId: a.coachId, coachIds: a.coachIds, tacticId: a.tacticId, lineup: a.myTeamLineup }; }, id);
  const before = await acct();
  check(`[${label}] coach-less account was granted a starter coach`, !!before.coachId && before.coachIds.length === 1, before.coachId);
  check(`[${label}] coach card + 5 role rows render`, (await page.locator(".mti-coach h4").count()) === 1 && (await page.locator(".mti-roles tbody tr").count()) === 5);
  const rolesOf = () => page.$$eval(".mti-roles select", (s) => s.map((x) => x.value).join(","));
  const r1 = await rolesOf();
  const tactics = await page.$$eval(".mti-sys", (b) => b.map((x) => x.dataset.tactic));
  check(`[${label}] several selectable systems`, tactics.length >= 3, tactics.join(","));
  const other = tactics.find((t) => t !== (before.tacticId || "balanced")) || tactics[1];
  const rolesAcross = new Set([r1]);
  for (const t of tactics.slice(0, 6)) { await page.click(`.mti-sys[data-tactic="${t}"]`); rolesAcross.add(await rolesOf()); }
  check(`[${label}] previewing systems changes assigned roles`, rolesAcross.size >= 2, `${rolesAcross.size} distinct`);
  const mid = await acct();
  check(`[${label}] preview did NOT save tactic or lineup`, mid.tacticId === before.tacticId && JSON.stringify(mid.lineup) === JSON.stringify(before.lineup));
  await page.click(`.mti-sys[data-tactic="${other}"]`);
  await page.click('[data-act="intel-set-tactic"]');
  check(`[${label}] "Set as active" persists the tactic`, (await acct()).tacticId === other);
  const ovr = await page.$$eval(".mti-bar b", (b) => b.map((x) => Number(x.textContent)));
  check(`[${label}] fit bars are numbers 0-99`, ovr.length >= 9 && ovr.every((n) => n >= 0 && n <= 99));
  const sel = page.locator(".mti-roles select").first();
  await sel.selectOption("rimProtector");
  check(`[${label}] manual role override sticks`, (await page.locator(".mti-roles select").first().inputValue()) === "rimProtector");
  check(`[${label}] no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  check(`[${label}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.locator(".mti").scrollIntoViewIfNeeded();
  await shoot(page, `${OUT}/${label}.png`);
  await page.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
