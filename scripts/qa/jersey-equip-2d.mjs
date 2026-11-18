// Jerseys on the 2D figure, real browser, real art: buy -> wear -> the figure changes (colour + number) -> reload keeps it ->
// switch -> take off -> 3D says plainly it has no jersey model -> another account is unaffected. Desktop 1280 + mobile 390.
// Screenshots (the figure with three different jerseys) are for the user's visual review, not a self-declared acceptance.
// Usage: node scripts/qa/jersey-equip-2d.mjs [http://127.0.0.1:5173/] [/tmp/cls-qa/jersey-equip-2d]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "/tmp/cls-qa/jersey-equip-2d";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};

// Three jerseys with clearly different colourways and numbers (catalog item ids -> template ids, see js/collectibles/jerseyCatalog.js).
const WEAR = [
  { item: "jersey-orig_neon_1986_23", number: "23", label: "neon" },
  { item: "jersey-orig_tide_1996_33", number: "33", label: "tide" },
  { item: "jersey-orig_foundry_2002_5", number: "5", label: "foundry" },
];

/** Shirt colour: the average opaque pixel colour of the chest on the figure canvas (half-resolution canvas; art coords / 2). */
const chest = (page) => page.evaluate(() => {
  const c = document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas");
  if (!c) return null;
  const g = c.getContext("2d");
  const take = (x, y, w, h) => { const d = g.getImageData(x, y, w, h).data; let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n += 1; } return n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null; };
  return { shirt: take(195, 250, 30, 24), shorts: take(200, 340, 40, 30), jersey: c.dataset.jersey ? JSON.parse(c.dataset.jersey) : null, look: JSON.parse(c.dataset.look || "null") };
});
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);

async function fresh(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const accMod = await import("/js/data/account.js");
    const a = accMod.createAccount("John");
    a.gold = 5000; a.onboardingDone = true;
    accMod.saveAccount(a);
    const { saveLook } = await import("/js/data/avatarLook.js");
    saveLook(a, { skin: "warm", hair: "black", outfit: "forest", style: "short" });
    const shop = await import("/js/data/shop.js");
    for (const id of ["jersey-orig_neon_1986_23", "jersey-orig_tide_1996_33", "jersey-orig_foundry_2002_5"]) shop.purchaseShopItem(a, id);
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  return { page, errors };
}
const openWorld = async (page) => {
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#mw-showcase-stage canvas.avatar2d-canvas", { timeout: 25000 });
  await page.waitForSelector(".mw-jerseys .mw-jersey-card", { timeout: 10000 });
  await page.waitForTimeout(600);
};
const wear = async (page, item, number) => {
  await page.click(`.mw-jersey-card[data-jersey-key="${item}"] [data-mw-action="equip-jersey"]`);
  await page.waitForFunction((n) => JSON.parse(document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas")?.dataset.jersey || "null")?.number === n, number, { timeout: 15000 });
  await page.waitForTimeout(400);
};

for (const [viewport, vt] of [[{ width: 1280, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobile"]]) {
  const tag = `[${vt}]`;
  const { page, errors } = await fresh(viewport);
  await openWorld(page);
  const plain = await chest(page);
  check(`${tag} before wearing anything the figure keeps its saved outfit and no jersey`, plain && plain.jersey === null && plain.look.outfit === "forest");

  const seen = [];
  for (const w of WEAR) {
    await wear(page, w.item, w.number);
    const s = await chest(page);
    seen.push(s);
    check(`${tag} wearing ${w.label} #${w.number}: the figure carries that number`, s.jersey?.number === w.number, JSON.stringify(s.jersey));
    check(`${tag} ${w.label}: shirt colour really changed from the previous look`, dist(s.shirt, (seen.at(-2) || plain).shirt) > 25, `${s.shirt} vs ${(seen.at(-2) || plain).shirt}`);
    check(`${tag} ${w.label}: skin, hair, outfit choice are exactly as saved`, s.look.skin === "warm" && s.look.hair === "black" && s.look.outfit === "forest" && s.look.style === "short");
    check(`${tag} ${w.label}: the collection card says it is the current jersey`, (await page.textContent(`.mw-jersey-card[data-jersey-key="${w.item}"]`)).includes("当前球衣"));
    await (await page.$("#mw-showcase-stage")).screenshot({ path: `${OUT}/${vt}-wearing-${w.label}.png` });
  }
  check(`${tag} three jerseys gave three different shirts`, new Set(seen.map((s) => s.shirt.join(","))).size === 3);
  check(`${tag} the simplified-preview note is shown for silhouettes the single cut cannot show`, (await page.textContent(".mw-jerseys")).includes("简化预览"));

  // reload keeps what is worn
  await page.reload({ waitUntil: "domcontentloaded" });
  await openWorld(page);
  const after = await chest(page);
  check(`${tag} after a reload the last jersey (#5) is still on the figure`, after.jersey?.number === "5" && dist(after.shirt, seen[2].shirt) < 12, JSON.stringify(after.jersey));

  // 3D: no jersey model, said plainly
  await page.click("#mw-renderer-toggle");
  await page.waitForSelector("#my-world-root[data-avatar-renderer='3d']", { timeout: 30000 });
  await page.waitForTimeout(500);
  const note = await page.textContent("#mw-showcase-status");
  check(`${tag} the 3D figure says it has no jersey model (and does not pretend)`, /3D/.test(note) && /球衣/.test(note), note.trim());
  await page.click("#mw-renderer-toggle");
  await page.waitForSelector("#my-world-root[data-avatar-renderer='2d']", { timeout: 25000 });
  await page.waitForTimeout(500);
  check(`${tag} back on 2D the jersey is still worn`, (await chest(page)).jersey?.number === "5");

  // take off
  await page.click('.mw-jersey-card.is-equipped [data-mw-action="unequip-jersey"]');
  await page.waitForFunction(() => !document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas")?.dataset.jersey, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const off = await chest(page);
  check(`${tag} taking it off restores the saved outfit colours and drops the number`, off.jersey === null && dist(off.shirt, plain.shirt) < 12, `${off.shirt} vs ${plain.shirt}`);
  await (await page.$("#mw-showcase-stage")).screenshot({ path: `${OUT}/${vt}-jersey-off.png` });

  // old save: an account that never touched jerseys has no key and nothing breaks
  const old = await page.evaluate(async () => {
    const accMod = await import("/js/data/account.js");
    const a = accMod.createAccount("Old");
    delete a.jerseyCollection;
    a.shop = { owned: {}, tickets: 0 };
    accMod.saveAccount(a);
    accMod.setActiveAccountId(a.id);
    return a.id;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#mw-showcase-stage canvas.avatar2d-canvas", { timeout: 25000 });
  const oldState = await chest(page);
  check(`${tag} an older account with no jersey data shows its normal figure`, oldState && oldState.jersey === null && !!old);
  check(`${tag} account isolation: the other account's worn jersey is not on this figure`, oldState.jersey === null && ((await page.textContent(".mw-jerseys")) || "").includes("还没有球衣"));
  check(`${tag} no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
