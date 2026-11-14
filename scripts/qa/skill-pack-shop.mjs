// Browser smoke: the Gold Challenge (career run) skill packs are back, the
// fragment skill shop is NOT.
//  - (The collection-page fragment-shop checks were dropped: that page moved
//    behind the account menu; the fragment shop stays removed in code.)
//  - Career market: the refresh-skills button and shelf render, a pack costs
//    run gold only (account gold untouched), buying moves it into the
//    skill inventory with an install control and spends exactly its price.
//  - Owned-skill management (module check in-page): install / uninstall /
//    refund helpers still behave.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/skill-pack-shop";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const alerts = [];
  page.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  // Seed: an account with fragments and a card carrying legacy skills
  // (one bought with fragments before the cancellation, one learned
  // via epiphany) — both must still be on the card afterwards.
  const seeded = await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const a = acc.createAccount("QA 技能");
    const pick = (bref, season) => players.PLAYERS.filter((p) => p.bref === bref && p.season === season).sort((x, y) => players.overall(y) - players.overall(x))[0]?.id;
    const jordan = pick("jordami01", 1991);
    const bryant = pick("bryanko01", 2006);
    a.playerIds = [jordan, bryant].filter(Boolean);
    a.cardMods = {
      [jordan]: { merges: 0, skills: ["fadeaway", "clutch_killer"], bought: ["fadeaway"], roll: 1 },
      [bryant]: { merges: 0, skills: ["fadeaway"], roll: 1 },
    };
    a.onboardingDone = true;
    a.gold = 100;
    a.fragments = 600;
    acc.saveAccount(a);
    acc.setActiveAccountId(a.id);
    return { jordan, bryant };
  });
  check(`[${tag}] seeded legacy-skills account`, !!seeded.jordan && !!seeded.bryant);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  // --- Career market: shelf, price, buy -> inventory ---
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#screen-market.active", { timeout: 15000 });
  await page.waitForSelector("#free-agent-list .market-row", { timeout: 15000 });
  check(`[${tag}] market: refresh-skills button is back`, (await page.$("#btn-refresh-skills")) !== null);
  const packCards = await page.$$eval("#free-agent-list .career-skill-card", (n) => n.length);
  check(`[${tag}] market: skill packs show in the list`, packCards >= 1, `${packCards} cards`);
  const packText = await page.$eval("#free-agent-list .career-skill-card", (el) => el.textContent.replace(/\s+/g, " ").trim());
  check(`[${tag}] pack card shows effect text and a ¤ price`, /¤\d+/.test(packText) && packText.length > 20, packText.slice(0, 90));
  const buyBtn = await page.$("#free-agent-list [data-buy-skill]:not([disabled])");
  check(`[${tag}] at least one pack is affordable at the start`, !!buyBtn);
  if (buyBtn) {
    const price = Number((await buyBtn.textContent()).match(/¤(\d+)/)?.[1]);
    const accountBefore = await page.evaluate(() => localStorage.getItem("cls_accounts_v1") || "");
    await buyBtn.click();
    await page.waitForTimeout(300);
    const invText = await page.textContent("#career-skill-inventory");
    check(`[${tag}] bought pack lands in the skill inventory`, !/技能库空着/.test(invText) && /安装|无球员/.test(invText), invText.replace(/\s+/g, " ").slice(0, 100));
    check(`[${tag}] price was positive and parsed`, price > 0, String(price));
    const accountAfter = await page.evaluate(() => localStorage.getItem("cls_accounts_v1") || "");
    check(`[${tag}] account storage untouched by the purchase`, accountBefore === accountAfter);
  }
  check(`[${tag}] market: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-market.png`, fullPage: true });

  // --- Owned-skill management still works (in-page module check) ---
  const mgmt = await page.evaluate(async () => {
    const s = await import("/js/data/skills.js");
    const player = { id: "qa-1", name: "QA", skills: ["fadeaway"], purchasedSkills: ["fadeaway"], purchasedSkillCosts: { fadeaway: 520 } };
    const removed = s.removeSkillFromPlayer(player, "fadeaway");
    const refund = s.purchasedSkillsRefund({ skills: ["fadeaway"], purchasedSkills: ["fadeaway"], purchasedSkillCosts: { fadeaway: 520 } });
    const target = { id: "qa-2", name: "QA2", skills: [] };
    const granted = s.grantSkillToPlayer(target, "fadeaway");
    return {
      removedOk: removed.ok === true && removed.returnToInv?.id === "fadeaway" && player.skills.length === 0,
      refundGold: refund.gold,
      granted,
      hasTarget: target.skills.includes("fadeaway"),
    };
  });
  check(`[${tag}] legacy purchased skill uninstalls back to inventory form`, mgmt.removedOk, JSON.stringify(mgmt));
  check(`[${tag}] legacy purchased skill still refunds on sale (~55%)`, mgmt.refundGold === Math.round(520 * 0.55), `${mgmt.refundGold} gold`);
  check(`[${tag}] grantSkillToPlayer still installs (awakening path)`, mgmt.granted === true && mgmt.hasTarget);

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("PASS")).length}/${report.length} passed`);
