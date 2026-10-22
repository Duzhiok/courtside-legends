/**
 * ★5 skill gift, end to end through the real UI:
 * a card at ★4 + enough 球魂 → click「球魂升星」on the collection page → the gift is announced
 * and the card carries the skill. Also: drawing a duplicate up to ★5 must NOT gift one.
 *
 *   node scripts/qa/star-skill-gift.mjs <out-prefix>      (dev server on :5173)
 */
import { chromium } from "playwright-core";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (label, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? " — " + detail : ""}`);

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dialogs = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
  const home = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  check(`[${tag}] app boots with no module errors`, errors.length === 0, errors.join(" | "));

  const target = await page.evaluate(async () => {
    const acc = await import("/js/data/account.js"); const pl = await import("/js/data/players.js");
    const co = await import("/js/data/coaches.js"); const g = await import("/js/data/gacha.js");
    const cards = pl.PLAYERS.filter((p) => pl.overall(p) < 70).slice(0, 12);
    const a = acc.createAccount("gift QA");
    a.playerIds = cards.map((p) => p.id);
    a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId];
    a.cardMods = { [cards[0].id]: { merges: g.MAX_STARS - 1, skills: [], roll: 5 } };
    a.gacha = { ...g.freshGachaState(), hadAllstar: true, souls: { [cards[0].bref]: g.SOULS_PER_STAR * 3 } };
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
    return { id: cards[0].id, name: cards[0].name };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await home();
  await page.click("#btn-open-collection");
  await page.waitForSelector("#screen-collection.active");

  const before = await page.evaluate(async (id) => (await import("/js/data/account.js")).getAccount().cardMods[id].skills.length, target.id);
  await page.click(`[data-soul-star="${target.id}"]`);
  await page.waitForFunction(() => document.querySelector("#screen-collection.active"), null, { timeout: 10000 });
  const after = await page.evaluate(async (id) => {
    const mod = (await import("/js/data/account.js")).getAccount().cardMods[id];
    return { merges: mod.merges, skills: mod.skills.length, starSkill: mod.starSkill || null, bought: (mod.bought || []).length };
  }, target.id);
  const notice = dialogs.find((m) => /满星/.test(m));
  check(`[${tag}] ★4 → ★5 with 球魂 reaches ★5`, after.merges === 5, JSON.stringify(after));
  check(`[${tag}] the gift is announced`, !!notice, notice || "no dialog");
  check(`[${tag}] one skill added, not counted as a purchase`, after.skills === before + 1 && after.bought === 0 && !!after.starSkill);
  check(`[${tag}] the card in the collection shows the skill name`, await page.evaluate((m) => document.querySelector("#collection-grid, #screen-collection")?.innerText.includes(m), (notice || "").replace(/.*「|」.*/g, "")));
  const grid = await page.$("#screen-collection");
  await page.evaluate(() => window.scrollTo(0, 0));
  await grid.screenshot({ path: `${OUT}-${tag}.png` });
  check(`[${tag}] the ★5 card no longer offers 球魂升星`, (await page.$$(`[data-soul-star="${target.id}"]`)).length === 0);

  // drawing duplicates up to ★5 must not gift
  const drawn = await page.evaluate(async () => {
    const acc = await import("/js/data/account.js"); const pl = await import("/js/data/players.js");
    const gacha = await import("/js/data/accountGacha.js"); const g = await import("/js/data/gacha.js");
    const a = acc.getAccount();
    const card = pl.PLAYERS.find((p) => !a.playerIds.includes(p.id) && pl.overall(p) < 70);
    a.playerIds.push(card.id);
    a.cardMods[card.id] = { merges: g.MAX_STARS - 1, skills: [], roll: 9 };
    a.lastDailyDraw = null; a.pendingRoll = null;
    const r = gacha.performDailyDraw(a, { pool: [card], rng: () => 0.5 });
    return { outcome: r.outcome, stars: r.stars, starSkill: r.starSkill ?? null, mod: a.cardMods[card.id].starSkill || null };
  });
  check(`[${tag}] a duplicate DRAW to ★5 gifts nothing`, drawn.outcome === "starUp" && drawn.stars === 5 && !drawn.starSkill && !drawn.mod, JSON.stringify(drawn));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(`[${tag}] no horizontal overflow`, !overflow);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(out.join("\n"));
process.exit(out.some((line) => line.startsWith("FAIL")) ? 1 : 0);
