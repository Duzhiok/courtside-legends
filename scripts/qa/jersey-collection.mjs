// Browser smoke for the Legends Jersey Collection (J1 shop + collection, J3 Reborn exchange), real UI, desktop 1280 + mobile 390.
//
//  A. Shop: the Jerseys tab lists the original throwbacks with jersey art -> buy one for gold (charged once) -> it shows in
//     My World > Jersey Collection with its story -> wear it -> a reload keeps it.
//  B. Reborn: a real run is resumed with a jersey offer built by the REAL pipeline (recordRivalryMeetings -> offersForGame)
//     and written through the app's own save module (a natural offer is rare, ~1 season in 6, see
//     scripts/measure/jersey-offers.mjs). Accept it in the real UI -> it lands in the run AND in the account collection ->
//     My World shows it as an earned jersey with the "game story, not a real object" line.
//
// Usage: node scripts/qa/jersey-collection.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/jersey-collection";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=career2-qa-rivalry-2`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const account = (page) => page.evaluate(async () => {
  const { getAccount } = await import("/js/data/account.js");
  const { getShop } = await import("/js/data/shop.js");
  const { listOwnedJerseys, equippedJerseyKey } = await import("/js/collectibles/jerseyCollection.js");
  const a = getAccount();
  return a ? { gold: a.gold, owned: listOwnedJerseys(a).map((j) => ({ key: j.key, source: j.source })), equipped: equippedJerseyKey(a), raw: (a.jerseyCollection || []).length, shop: getShop(a).owned } : null;
});

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1280, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);

  await page.evaluate(async () => {
    const { PLAYERS, overall } = await import("/js/data/players.js");
    const { createAccount, getAccount, saveAccount, setActiveAccountId } = await import("/js/data/account.js");
    const ids = [...new Map([...PLAYERS].sort((a, b) => overall(b) - overall(a)).map((p) => [p.bref, p.id])).values()].slice(0, 10);
    const a = createAccount("QA 球衣");
    saveAccount({ ...getAccount(a.id), playerIds: ids, coachId: null, gold: 2000, onboardingDone: true, welcomeGranted: true });
    setActiveAccountId(a.id);
  });
  await reload(page);

  // ---- A. shop -> collection -> wear -> reload ----
  await page.click("#btn-gold-chip");
  await page.waitForSelector("#shop-dialog[open]", { timeout: 8000 });
  await page.click('#shop-dialog [data-shop-action="select-category"][data-category="jersey"]');
  const cards = await page.$$("#shop-dialog .shop-card");
  check(`[${tag}] the Jerseys tab lists the original throwbacks`, cards.length === 8, `${cards.length} cards`);
  check(`[${tag}] every card shows real jersey art`, (await page.$$("#shop-dialog .shop-card .jersey-svg")).length === 8);
  check(`[${tag}] no real player or team is on sale`, !/Jordan|Kobe|Bryant|Lakers|Bulls|乔丹|科比/.test(await text(page, "#shop-dialog")));
  await shoot(page, `${OUT}/${tag}-shop-jerseys.png`);
  await page.click('#shop-dialog [data-item-id="jersey-orig_neon_1986_23"]');
  await page.click('#shop-dialog [data-shop-action="buy"]');
  await page.click('#shop-dialog [data-shop-action="buy"]'); // two-step: arm, then confirm
  await page.waitForTimeout(300);
  let st = await account(page);
  check(`[${tag}] bought once for ¤220: gold 2000 -> 1780, owned`, st.gold === 1780 && st.shop["jersey-orig_neon_1986_23"] === true, `gold ${st.gold}`);
  await page.click('#shop-dialog [data-shop-action="close"]');
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector(".mw-jerseys", { timeout: 10000 });
  check(`[${tag}] My World lists the jersey as bought`, (await text(page, ".mw-jerseys")).includes("商城购买"));
  await page.click(".mw-jerseys .mw-jersey-story summary");
  check(`[${tag}] its story says original, not an official product`, (await text(page, ".mw-jerseys")).includes("不属于任何真实球队"));
  await page.click('.mw-jerseys [data-mw-action="equip-jersey"]');
  await page.waitForTimeout(250);
  st = await account(page);
  check(`[${tag}] wearing records the choice`, st.equipped === "jersey-orig_neon_1986_23");
  check(`[${tag}] the card says it is the current jersey`, (await text(page, ".mw-jerseys")).includes("当前球衣"));
  await shoot(page, `${OUT}/${tag}-collection-bought.png`);
  await reload(page);
  st = await account(page);
  check(`[${tag}] reload keeps the jersey, the choice and the balance`, st.owned.length === 1 && st.equipped === "jersey-orig_neon_1986_23" && st.gold === 1780);

  // ---- B. Reborn exchange ----
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-create", { timeout: 20000 });
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  const seeded = await page.evaluate(async () => {
    const save = await import("/js/data/saveRoot.js");
    const { recordRivalryMeetings } = await import("/js/reborn/rivalry.js");
    const { offersForGame } = await import("/js/collectibles/jerseyExchange.js");
    const root = save.readRootSave(localStorage);
    if (!root?.reborn?.player) return null;
    const rep = (n) => ({
      gameId: `qa-${n}`, year: 1997, game: n, won: true, margin: 3, gameScore: 14, line: { min: 28, pts: 16, score: 14 }, you: { pos: "SG", ovr: 62 },
      opponents: [{ bref: "jordami01", name: "Michael Jordan", nameEn: "Michael Jordan", pos: "SG", team: "CHI", ovr: 66, min: 33, pts: 18, gs: 12 }], takeover: null,
    });
    let ledger = null; let state = null; let made = null;
    for (let n = 1; n <= 6 && !made; n += 1) {
      const r = rep(n);
      const rivalry = recordRivalryMeetings(ledger, r);
      ledger = rivalry.ledger;
      const out = offersForGame(state, { report: r, ledger, rivalry });
      state = out.state;
      if (out.created.length) made = out.created[0].id;
    }
    root.reborn.rivalries = ledger;
    root.reborn.jerseys = state;
    save.writeRootSave(root, localStorage);
    return made;
  });
  check(`[${tag}] the real pipeline produced an offer from a real ledger`, !!seeded, String(seeded));
  await reload(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-jersey-offers", { timeout: 20000 });
  const offerText = await text(page, ".reborn-jersey-offers");
  check(`[${tag}] the offer names him and shows the real evidence`, offerText.includes("Michael Jordan") && /交手 \d+ 次/.test(offerText) && offerText.includes("你 16 分"), offerText.slice(0, 120));
  check(`[${tag}] it says plainly this is a game story, not a signed object`, offerText.includes("没有签名") && offerText.includes("不是现实中存在的实物"));
  check(`[${tag}] the offer has real jersey art, no invented number`, (await page.$$(".reborn-jersey-offer .jersey-svg")).length === 1 && (await page.$$(".reborn-jersey-offer .jersey-svg text")).length === 0);
  check(`[${tag}] no horizontal overflow with the offer showing`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-reborn-offer.png`);
  await page.click("[data-jersey-accept]");
  await page.waitForTimeout(400);
  check(`[${tag}] accepting removes the offer (no second click possible)`, (await page.$(".reborn-jersey-offers")) === null);
  st = await account(page);
  check(`[${tag}] the jersey is in the account collection, once`, st.raw === 1 && st.owned.filter((j) => j.source === "exchange").length === 1, JSON.stringify(st.owned));
  await reload(page);
  st = await account(page);
  check(`[${tag}] reload keeps it (and does not duplicate)`, st.raw === 1);

  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector(".mw-jerseys .mw-jersey-card", { timeout: 10000 });
  const earned = page.locator('.mw-jersey-card:has-text("交换所得")');
  check(`[${tag}] My World shows it as earned`, (await earned.count()) === 1);
  await earned.locator("summary").click();
  const story = await text(page, ".mw-jersey-card:has-text('交换所得')");
  check(`[${tag}] its story carries the evidence and the disclaimer`, story.includes("Michael Jordan") && story.includes("未签名") && story.includes("不是现实中存在的实物"), story.slice(-150));
  check(`[${tag}] no horizontal overflow on My World`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-collection-earned.png`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
