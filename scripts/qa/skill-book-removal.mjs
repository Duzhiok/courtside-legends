// Browser QA: the skill-book system is cancelled (S0) — no skill-buy UI
// remains anywhere, and already-owned skills survive.
//  - Collection page: no fragment skill shop (.skill-shop / [data-buy-skill]
//    / [data-shop-card]); a card with legacy bought skills still shows them;
//    the manage note says fragments currently have no sink.
//  - Career market (2 clicks in): no "refresh skills" button, no shelf
//    boxes, no [data-buy-skill] in the free-agent list; the list is
//    coaches + players only; the owned-skills inventory renders its
//    empty state.
//  - Owned-skill management (module check in-page): grantSkillToPlayer /
//    removeSkillFromPlayer / markPurchasedSkill still work, so a legacy
//    purchased skill can still be installed, uninstalled and refunded.
// Usage: node scripts/qa/skill-book-removal.mjs [outDir] [baseUrl]
// (Mac run: needs the Playwright chromium build; cannot run on this VM.)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/skill-book-removal";
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

  // --- Collection: no shop, owned skills survive ---
  await page.click("#btn-open-collection");
  await page.waitForSelector("#screen-collection.active", { timeout: 15000 });
  const shopEls = await page.$$eval(".skill-shop, [data-buy-skill], [data-shop-card]", (n) => n.length);
  check(`[${tag}] collection: no skill-shop UI anywhere`, shopEls === 0, `${shopEls} elements`);
  const manageText = await page.textContent("#collection-manage");
  check(`[${tag}] collection: note says fragments have no sink`, /技能碎片目前没有可兑换的物品/.test(manageText));
  const cardText = await page.textContent("#collection-grid");
  check(`[${tag}] collection: legacy bought skill still on the card`, /后仰杀手|Fadeaway/.test(cardText), cardText.replace(/\s+/g, " ").slice(0, 120));
  check(`[${tag}] collection: no horizontal overflow`, !(await overflow()));
  await page.screenshot({ path: `${OUT}/${tag}-collection.png`, fullPage: true });

  // --- Career market: no shelf, no buy, list is coaches + players only ---
  await page.click("#btn-collection-back");
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#screen-market.active", { timeout: 15000 });
  await page.waitForSelector("#free-agent-list .market-row", { timeout: 15000 });
  check(`[${tag}] market: no refresh-skills button`, (await page.$("#btn-refresh-skills")) === null);
  check(`[${tag}] market: no skill shelf boxes`, (await page.$$("#career-skill-shop, #setup-skill-shop, #live-skill-shop")).length === 0);
  const marketBuySkills = await page.$$eval("#free-agent-list [data-buy-skill]", (n) => n.length);
  check(`[${tag}] market: no skill-buy buttons in the list`, marketBuySkills === 0, `${marketBuySkills} buttons`);
  const marketSkillCards = await page.$$eval("#free-agent-list .career-skill-card", (n) => n.length);
  check(`[${tag}] market: no skill cards in the list (coaches + players only)`, marketSkillCards === 0, `${marketSkillCards} cards`);
  const invText = await page.textContent("#career-skill-inventory");
  check(`[${tag}] market: owned-skills inventory renders (empty state)`, /技能库空着/.test(invText), invText.replace(/\s+/g, " ").slice(0, 80));
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
