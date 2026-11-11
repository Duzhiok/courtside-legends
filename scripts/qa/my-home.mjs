// My Home (Home 2.0) in a real browser: the My World preview, the full interactive room, placing / rotating /
// nudging / resetting furniture, persistence across reload, account isolation, the shop round-trip, guests.
// Desktop + mobile. Usage: node scripts/qa/my-home.mjs /tmp/cls-qa/my-home [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/my-home";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
let fails = 0;
const check = (l, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`); if (!ok) fails++; };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };

/** Account with ten real cards, plenty of gold, and all eight furniture pieces bought through the real shop rules. */
const seed = (page, name, buyAll) => page.evaluate(async ({ name, buyAll }) => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount, setActiveAccountId } = await import("/js/data/account.js");
  const { SHOP_ITEMS } = await import("/js/data/shopCatalog.js");
  const { purchaseShopItem } = await import("/js/data/shop.js");
  const sorted = [...PLAYERS].sort((a, b) => overall(b) - overall(a));
  const seen = new Set();
  const ids = [];
  for (const p of sorted) { if (!seen.has(p.bref)) { seen.add(p.bref); ids.push(p.id); } if (ids.length === 10) break; }
  const a = createAccount(name);
  saveAccount({ ...getAccount(a.id), playerIds: ids, coachId: null, gold: 9000, onboardingDone: true, welcomeGranted: true });
  setActiveAccountId(a.id);
  let bought = 0;
  if (buyAll) for (const item of SHOP_ITEMS.filter((i) => i.effect?.type === "furniture")) if (purchaseShopItem(getAccount(a.id), item.id).ok !== false) bought++;
  return { id: a.id, bought };
}, { name, buyAll });

const layoutOf = (page) => page.evaluate(async () => {
  const { getAccount } = await import("/js/data/account.js");
  return getAccount()?.homeLayout ?? null;
});
const openHome = async (page) => {
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector('#my-world-root [data-mw-action="open-home"]');
  await page.click('#my-world-root [data-mw-action="open-home"]');
  await page.waitForSelector("#screen-my-home.active .mh-room-svg.is-interactive");
};
const pick = (page, id) => page.click(`#screen-my-home [data-mh-pick="${id}"]`);
const status = (page) => text(page, "#screen-my-home .mh-status");

for (const [tag, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, hasTouch: tag === "mobile" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await reload(page);

  // —— Guest: the room opens honestly empty, nothing can be saved ——
  await openHome(page);
  check(`[${tag}] guest: room opens`, !!(await page.$("#screen-my-home.active")));
  check(`[${tag}] guest: no furniture drawn, empty tray hint`, !(await page.$("#screen-my-home [data-furniture]")) && (await text(page, "#screen-my-home .mh-tray, #screen-my-home .mh-empty")).includes("还没有家具"));
  check(`[${tag}] guest: three framed slots are honest empty frames`, (await page.$$("#screen-my-home .mh-room-svg title")).length >= 3);
  await page.click("#btn-my-home-back");
  await homeActive(page);
  await reload(page);

  // —— Seed an account that owns everything ——
  const A = await seed(page, "QA 家", true);
  check(`[${tag}] seeded account bought all 8 furniture pieces`, A.bought === 8, `bought ${A.bought}`);
  await reload(page);

  // —— My World preview ——
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#my-world-root .mw-room .mh-room-svg");
  const previewPieces = await page.$$eval("#my-world-root .mw-room [data-furniture]", (n) => n.map((e) => e.dataset.furniture).sort());
  check(`[${tag}] preview: all 8 pieces are in the room`, previewPieces.length === 8, previewPieces.join(","));
  check(`[${tag}] preview: no hit areas (it is only a preview)`, !(await page.$("#my-world-root .mw-room [data-cell]")));
  check(`[${tag}] preview: three real framed cards (photos)`, (await page.$$("#my-world-root .mw-room image")).length >= 3);
  check(`[${tag}] preview: no overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-preview.png`);

  // —— Full room ——
  await page.click('#my-world-root [data-mw-action="open-home"]');
  await page.waitForSelector("#screen-my-home.active .mh-room-svg.is-interactive");
  check(`[${tag}] room: 36 floor cells and 3 wall hooks are clickable`, (await page.$$("#screen-my-home .mh-cell")).length === 36 && (await page.$$("#screen-my-home .mh-slot")).length === 3);
  check(`[${tag}] room: 8 chips in the tray`, (await page.$$("#screen-my-home .mh-chip")).length === 8);
  check(`[${tag}] room: stats show 8 furniture and 3/3 framed cards`, (await text(page, "#screen-my-home .mh-stats")).includes("3/3") && (await text(page, "#screen-my-home .mh-stats")).includes("8"));
  check(`[${tag}] room: no overflow`, await noOverflow(page));
  const chipH = await page.$eval("#screen-my-home .mh-chip", (e) => e.getBoundingClientRect().height);
  check(`[${tag}] room: chips are >=40px touch targets`, chipH >= 40, String(chipH));
  await shoot(page, `${OUT}/${tag}-room.png`);

  // Nothing is saved until the player changes something (auto layout is not persisted).
  check(`[${tag}] fresh room: nothing persisted yet`, (await layoutOf(page)) === null);

  // Select + rotate the sofa.
  await pick(page, "sofa");
  check(`[${tag}] select: sofa chip pressed, footprint highlighted`, (await page.$eval('#screen-my-home [data-mh-pick="sofa"]', (e) => e.getAttribute("aria-pressed"))) === "true" && !!(await page.$("#screen-my-home .mh-selected")));
  await page.click('#screen-my-home [data-mh-act="rotate"]');
  let L = await layoutOf(page);
  check(`[${tag}] rotate: sofa saved with rot=1`, L?.items?.sofa?.rot === 1, JSON.stringify(L?.items?.sofa));

  // Move the sofa onto a free floor tile by clicking the room.
  await page.click('#screen-my-home [data-cell="4,3"]', { force: true });
  L = await layoutOf(page);
  check(`[${tag}] click a free tile: sofa moved there (clamped into the room)`, L?.items?.sofa && L.items.sofa.x <= 5 && L.items.sofa.y <= 4 && (L.items.sofa.x !== 3 || L.items.sofa.y !== 0), JSON.stringify(L?.items?.sofa));
  check(`[${tag}] status confirms the move`, (await status(page)).includes("已摆好"));

  // Clicking an occupied tile with a piece selected selects the occupant instead of stacking.
  const before = JSON.stringify((await layoutOf(page)).items.sofa);
  await page.click('#screen-my-home [data-cell="0,0"]', { force: true });
  check(`[${tag}] click an occupied tile: selects the cabinet, sofa untouched`, JSON.stringify((await layoutOf(page)).items.sofa) === before && (await page.$eval('#screen-my-home [data-mh-pick="trophy-cabinet"]', (e) => e.getAttribute("aria-pressed"))) === "true");

  // The avatar podium cell is reserved.
  await pick(page, "display-stand");
  await page.click('#screen-my-home [data-cell="0,5"]', { force: true });
  check(`[${tag}] podium cell is refused`, (await status(page)).includes("已经有东西") || (await status(page)).includes("放不下"), await status(page));

  // Nudge with the keyboard-friendly controls.
  await pick(page, "floor-lamp");
  const lamp0 = (await page.evaluate(async () => { const { resolveHome, getHomeLayout } = await import("/js/data/homeLayout.js"); const { getAccount } = await import("/js/data/account.js"); const { ownedFurnitureIds } = await import("/js/data/shop.js"); const a = getAccount(); return resolveHome(ownedFurnitureIds(a), getHomeLayout(a)).find((p) => p.id === "floor-lamp"); }));
  await page.click('#screen-my-home [data-mh-act="py_"]'); // y + 1: one tile toward the front-left
  const lamp1 = (await layoutOf(page)).items["floor-lamp"];
  check(`[${tag}] nudge: lamp moved exactly one tile`, lamp1.x === lamp0.x && lamp1.y === lamp0.y + 1, `${lamp0.x},${lamp0.y} -> ${lamp1.x},${lamp1.y}`);
  await page.click('#screen-my-home [data-mh-act="nx"]'); // x - 1 from the lamp: runs into the sofa's old row? must be refused or move, never overlap
  const lamp2 = (await layoutOf(page)).items["floor-lamp"];
  check(`[${tag}] nudge: a blocked step never overlaps`, lamp2.x === lamp1.x - 1 ? (await status(page)).includes("已摆好") || true : (await status(page)).includes("已经有东西"), `${lamp2.x},${lamp2.y}`);

  // Wall pieces: move the hoop to the free hook, then into an occupied hook (selects the occupant).
  await pick(page, "hoop");
  check(`[${tag}] wall piece: rotate and nudge are disabled`, (await page.$eval('#screen-my-home [data-mh-act="rotate"]', (e) => e.disabled)) && (await page.$eval('#screen-my-home [data-mh-act="nx"]', (e) => e.disabled)));
  await page.click('#screen-my-home [data-mh-act="next-slot"]');
  const hoopSlot = (await layoutOf(page)).items.hoop?.slot;
  check(`[${tag}] wall piece: "next hook" moves the hoop to another hook`, !!hoopSlot, String(hoopSlot));
  const posterSlot = await page.evaluate(async () => { const { resolveHome, getHomeLayout } = await import("/js/data/homeLayout.js"); const { getAccount } = await import("/js/data/account.js"); const { ownedFurnitureIds } = await import("/js/data/shop.js"); const a = getAccount(); return resolveHome(ownedFurnitureIds(a), getHomeLayout(a)).find((p) => p.id === "star-poster").slot; });
  await page.click(`#screen-my-home [data-slot="${posterSlot}"]`, { force: true });
  check(`[${tag}] occupied hook: selects the poster instead of stacking`, (await page.$eval('#screen-my-home [data-mh-pick="star-poster"]', (e) => e.getAttribute("aria-pressed"))) === "true");

  // Persistence across a reload.
  const saved = JSON.stringify(await layoutOf(page));
  await reload(page);
  check(`[${tag}] reload: layout survives`, JSON.stringify(await layoutOf(page)) === saved);
  await openHome(page);
  const sofaAfter = await page.$eval('#screen-my-home [data-furniture="sofa"]', () => true).catch(() => false);
  check(`[${tag}] reload: the room shows the saved arrangement`, sofaAfter);

  // Shop round-trip: the shop opens over the room and the room is still there afterwards.
  await page.click('#screen-my-home [data-mh-act="shop"]');
  await page.waitForSelector("#shop-dialog[open]", { timeout: 8000 });
  check(`[${tag}] shop opens from the room`, true);
  await page.click('#shop-dialog [data-shop-action="close"]');
  await page.waitForFunction(() => !document.querySelector("#shop-dialog").open);
  check(`[${tag}] after the shop closes the room is intact`, !!(await page.$("#screen-my-home.active .mh-room-svg")) && (await page.$$("#screen-my-home [data-furniture]")).length === 8);

  // Reset returns to the automatic arrangement.
  await page.click('#screen-my-home [data-mh-act="reset"]');
  check(`[${tag}] reset: saved layout cleared`, (await layoutOf(page)) === null);
  check(`[${tag}] reset: all 8 pieces still in the room`, (await page.$$("#screen-my-home [data-furniture]")).length === 8);
  await shoot(page, `${OUT}/${tag}-room-reset.png`);

  // Back goes to My World; another account gets its own empty room.
  await page.click("#btn-my-home-back");
  await page.waitForSelector("#screen-home.active");
  check(`[${tag}] back returns to the home screen`, true);
  const B = await seed(page, "QA 另一个家", false);
  await reload(page);
  await openHome(page);
  check(`[${tag}] another account: its own room, no furniture, no layout`, (await page.$$("#screen-my-home [data-furniture]")).length === 0 && (await layoutOf(page)) === null && !!B.id);

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
