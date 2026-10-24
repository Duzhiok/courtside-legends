/**
 * Photo chain in a real browser: home wall, credits page, collection avatars, and the
 * "photo fails to load" fallback. Also records every request to prove nothing hot-links
 * NBA.com / Basketball-Reference / ui-avatars.
 *
 *   node scripts/qa/photo-chain.mjs <screenshot-dir>      (needs: python3 scripts/serve_nocache.py 5173)
 *
 * Wikimedia thumbnails need network. If the sandbox blocks them, the "loads" checks fail
 * loudly rather than passing on a broken-image icon.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node scripts/qa/photo-chain.mjs <screenshot-dir>");
mkdirSync(OUT, { recursive: true });

const BANNED = /basketball-reference\.com|cdn\.nba\.com|\/\/[^/]*nba\.com|ui-avatars\.com/i;
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (label, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${label}${detail ? " — " + detail : ""}`;
  out.push(line);
  console.log(line); // print as we go: a crash later must not hide what already passed
};

const homeActive = (page) => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

/** Images are loading="lazy": scroll each into view so it loads (or fails) like it would for a real user. */
async function revealAll(page, selector) {
  const count = await page.$$eval(selector, (nodes) => nodes.length);
  for (let i = 0; i < count; i++) {
    await page.evaluate(([sel, index]) => document.querySelectorAll(sel)[index].scrollIntoView({ block: "center" }), [selector, i]);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function seedAccount(page) {
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const roll = await import("/js/data/cardRoll.js");
    const pl = await import("/js/data/players.js");
    const co = await import("/js/data/coaches.js");
    const a = acc.createAccount("photo QA");
    // eleven with a credited photo, two whose only photos were blocked (→ generated avatar);
    // requireAccountReady() wants at least 12 cards before it opens the collection
    const wanted = [["jordami01", 1991], ["bryanko01", 2006], ["curryst01", 2016], ["jamesle01", 2013], ["jokicni01", 2023], ["antetgi01", 2020], ["duranke01", 2014], ["hardeja01", 2018], ["leonaka01", 2019], ["iversal01", 2001], ["westbru01", 2016], ["barklch01", null], ["hudsolo01", null]];
    a.playerIds = wanted
      .map(([bref, season]) => pl.PLAYERS.filter((p) => p.bref === bref && (!season || p.season === season)).sort((x, y) => pl.overall(y) - pl.overall(x))[0]?.id)
      .filter(Boolean);
    let seed = 1;
    while (roll.rollGrade(roll.rollOffsets(seed).quality) !== "B") seed++;
    a.cardMods = Object.fromEntries(a.playerIds.map((id) => [id, { merges: 0, skills: [], roll: seed }]));
    a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
}

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  page.on("request", (r) => requests.push(r.url()));

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);

  // ---- home wall
  await page.waitForSelector("#home-legends-wall .legend-tile", { timeout: 60000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll("#home-legends-wall img")).every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
  const tiles = await page.$$eval("#home-legends-wall .legend-tile", (nodes) =>
    nodes.map((t) => ({ name: t.querySelector("strong").textContent, src: decodeURIComponent(t.querySelector("img").src), visible: !!t.offsetParent, ok: t.querySelector("img").naturalWidth > 0 })));
  const visible = tiles.filter((t) => t.visible);
  check(`[${tag}] wall draws all 9 legends in the DOM`, tiles.length === 9, `${tiles.length}`);
  check(`[${tag}] every visible tile really loaded a picture`, visible.length >= 6 && visible.every((t) => t.ok), `${visible.filter((t) => t.ok).length}/${visible.length} visible`);
  const srcOf = (needle) => tiles.find((t) => t.name.includes(needle))?.src || "";
  check(`[${tag}] Jordan / Bird / Jokić use the credited photos`, /Michael_Jordan_\(1997\)/.test(srcOf("乔丹")) && /Larry_Bird_Lipofsky/.test(srcOf("伯德")) && /Nikola_Jokic_\(51914124577\)/.test(srcOf("约基奇")));
  const modeSrcs = await page.$$eval(".mode-card-photo img", (n) => n.map((i) => decodeURIComponent(i.src)));
  check(`[${tag}] all 10 mode cards carry a Wikimedia photo`, modeSrcs.length === 10 && modeSrcs.every((s) => /\.wikimedia\.org\//.test(s)), `${modeSrcs.length}`);
  check(`[${tag}] home has no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await (await page.$("#home-legends-wall")).screenshot({ path: `${OUT}/${tag}-1-wall.png` });

  // ---- credits page
  const creditCount = await page.evaluate(async () => Object.keys((await import("/js/data/photoCredits.js")).PHOTO_CREDITS).length);
  await page.click("#btn-open-credits");
  await page.waitForSelector("#screen-credits.active");
  const rows = await page.$$eval(".credit-row", (n) => n.length);
  check(`[${tag}] credits page lists every credited photo`, rows === creditCount && rows > 80, `${rows} rows / ${creditCount} credits`);
  const intro = (await page.textContent(".credits-intro")) || "";
  check(`[${tag}] credits page states resizing, silhouettes and non-affiliation`, /缩放和裁剪/.test(intro) && /并不是本人照片/.test(intro) && /非官方/.test(intro));
  const anchors = await page.$$eval("#credits-body a", (n) => n.map((a) => ({ href: a.href, rel: a.rel, target: a.target })));
  check(`[${tag}] credit links are http(s), new-tab, noopener`, anchors.length > 150 && anchors.every((a) => /^https?:/.test(a.href) && a.target === "_blank" && /noopener/.test(a.rel)), `${anchors.length} links`);
  check(`[${tag}] credits page has no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  const box = await (await page.$("#screen-credits")).boundingBox();
  await page.screenshot({ path: `${OUT}/${tag}-2-credits.png`, fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 900) } });
  await page.click("#btn-credits-back");
  await homeActive(page);
  check(`[${tag}] credits back button returns home`, true);

  // ---- collection avatars
  await seedAccount(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click("#btn-open-collection");
  await page.waitForSelector("#screen-collection.active");
  await revealAll(page, ".player-card img");
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".player-card img")).every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
  const cards = await page.$$eval(".player-card", (nodes) =>
    nodes.map((c) => {
      const img = c.querySelector("img");
      return { text: c.textContent, kind: img.src.startsWith("data:image/svg+xml") ? "generated" : /\.wikimedia\.org\//.test(img.src) ? "photo" : "other:" + img.src.slice(0, 50), ok: img.naturalWidth > 0, radius: getComputedStyle(img).borderRadius, svg: img.src.startsWith("data:") ? decodeURIComponent(img.src) : "" };
    }));
  const generated = cards.filter((c) => c.kind === "generated");
  const photos = cards.filter((c) => c.kind === "photo");
  check(`[${tag}] collection has ${cards.length} cards: photos and generated avatars both render`, photos.length >= 8 && generated.length >= 2 && cards.every((c) => c.ok), `${photos.length} photo, ${generated.length} generated`);
  check(`[${tag}] no card uses a third-party image source`, cards.every((c) => c.kind === "generated" || c.kind === "photo"), cards.map((c) => c.kind).join(","));
  const barkley = cards.find((c) => /Barkley/.test(c.text));
  check(`[${tag}] Barkley (his only photo was the Reagan lift) gets a generated avatar with initials CB`, barkley?.kind === "generated" && />CB</.test(barkley.svg));
  check(`[${tag}] avatars are circular`, cards.every((c) => c.radius.startsWith("50%") || parseFloat(c.radius) > 10), cards[0]?.radius);
  check(`[${tag}] collection has no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await (await page.$("#collection-grid")).screenshot({ path: `${OUT}/${tag}-3-collection.png` });

  // ---- a photo that fails to load must become the generated avatar
  const failing = await browser.newPage({ viewport: { width, height } });
  await failing.route(/thumb\.wikimedia\.org|upload\.wikimedia\.org/, (route) => route.abort());
  await failing.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await failing.evaluate(() => localStorage.clear());
  await failing.reload({ waitUntil: "domcontentloaded" });
  await homeActive(failing);
  await seedAccount(failing);
  await failing.reload({ waitUntil: "domcontentloaded" });
  await homeActive(failing);
  await failing.click("#btn-open-collection");
  await failing.waitForSelector("#screen-collection.active");
  await revealAll(failing, ".player-card img");
  await failing.waitForFunction(() => Array.from(document.querySelectorAll(".player-card img")).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 }).catch(() => {});
  const fallen = await failing.$$eval(".player-card img", (n) => n.map((i) => ({ generated: i.src.startsWith("data:image/svg+xml"), ok: i.naturalWidth > 0 })));
  check(`[${tag}] with Wikimedia blocked, every card falls back to a working generated avatar`, fallen.length >= 12 && fallen.every((i) => i.generated && i.ok), `${fallen.filter((i) => i.generated && i.ok).length}/${fallen.length}`);
  await failing.close();

  // ---- network hygiene across the whole session
  const hosts = [...new Set(requests.filter((u) => /^https?:/.test(u)).map((u) => new URL(u).host))].sort();
  const banned = requests.filter((u) => BANNED.test(u));
  check(`[${tag}] no request to NBA.com / Basketball-Reference / ui-avatars`, banned.length === 0, banned.slice(0, 3).join(" | ") || `hosts: ${hosts.join(", ")}`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(";"));
  await page.close();
}
await browser.close();
process.exitCode = out.some((line) => line.startsWith("FAIL")) ? 1 : 0;
