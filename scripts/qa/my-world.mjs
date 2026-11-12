// My World MVP (ADR-008 N-1): real identity persistence, account isolation, real career resume, the other three
// tabs untouched, honest empty states, English, contrast, no overflow. One desktop + one mobile pass.
// Usage: node scripts/qa/my-world.mjs /tmp/cls-qa/world [http://127.0.0.1:5187/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";
import { createCareerInPage } from "./lib/career.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/world";
const BASE = process.argv[3] || "http://127.0.0.1:5187/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const tab = (page, id) => page.click(`.home-tab[data-category="${id}"]`);
const visible = (page, sel) => page.$eval(sel, (el) => !!el && !el.closest("[hidden]") && el.getBoundingClientRect().height > 0).catch(() => false);
const editProfile = async (page, fields) => {
  await page.click('[data-mw-action="edit-identity"]');
  for (const [name, value] of Object.entries(fields)) await page.fill(`#mw-identity-form [name="${name}"]`, value);
  await page.click('#mw-identity-form button[type="submit"]');
};
const reloadHome = async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.waitForFunction(() => !document.querySelector("#load-overlay:not([hidden])") || true);
};

for (const [w, h, tag] of [[1440, 900, "wide"], [1280, 800, "desktop"], [390, 844, "mobile"], [360, 800, "narrow"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await reloadHome(page);

  // 1. Navigation: fourth tab exists, the old default + Quick Play are unchanged
  const tabs = await page.$$eval(".home-tab", (els) => els.map((e) => e.dataset.category));
  check(`[${tag}] four tabs, world first`, tabs.join() === "world,players,career,custom", tabs.join());
  check(`[${tag}] default tab is My World`, await visible(page, "#my-world-root .mw-identity"));
  const cta = await page.$eval("#btn-play-now", (el) => el.getBoundingClientRect().bottom);
  check(`[${tag}] Quick Play still above the fold`, cta <= h, `${Math.round(cta)}`);

  // 2. Guest: honest empty states + device-only note
  await tab(page, "world");
  check(`[${tag}] My World renders`, await visible(page, "#my-world-root .mw-identity"));
  const empty = await text(page, "#my-world-root");
  check(`[${tag}] guest note shown`, empty.includes("只保存在这台设备"));
  check(`[${tag}] no career => honest empty journey`, empty.includes("还没有进行中的生涯"));
  // 2b. Account Level (v1): badge + bar render for a guest, track toggles, Lv.2 locked.
  check(`[${tag}] level lives in the hero (Lv.1 guest), no separate level card`, await visible(page, "#my-world-root .mw-identity .mw-hero-level") && empty.includes("Lv.1") && !(await visible(page, "#my-world-root .mw-card.mw-level")));
  check(`[${tag}] reward track hidden by default`, !(await visible(page, "#mw-level-track")));
  await page.click('[data-mw-action="toggle-level-track"]');
  check(`[${tag}] reward track opens, Lv.2 locked for a new guest`, await visible(page, "#mw-level-track") && (await text(page, "#my-world-root")).includes("Lv.2 解锁"));
  const trackH = await page.$eval("#mw-level-track", (el) => Math.round(el.getBoundingClientRect().height));
  check(`[${tag}] open reward list is capped and scrolls inside the hero`, trackH <= 230, `${trackH}px`);
  await page.click('[data-mw-action="toggle-level-track"]'); // measure the hero in its normal (closed) state below
  check(`[${tag}] no trophies drawn`, !empty.includes("🏆"));
  check(`[${tag}] no horizontal overflow (guest)`, await noOverflow(page));
  // Redesign: single title, compact hero, closed feedback behind a corner icon, honest omissions
  const hdr = await page.$$eval("#my-world-root h2, #my-world-root .mw-head", (els) => els.length);
  check(`[${tag}] no big page heading`, hdr === 0 && !empty.includes("My Basketball Life") && !empty.includes("COURTSIDE LEGENDS · MY WORLD"));
  // The Hero is stage-driven now (a tall 3D stage beside/above the identity column), so its total height is no
  // longer the thing to guard. What matters is that the identity column is a TIGHT stack: its height is its own
  // content plus the grid gaps, i.e. nothing is stretched/spread apart into big empty bands.
  const stack = await page.$eval(".mw-hero-info", (el) => {
    const kids = [...el.children].filter((k) => k.getBoundingClientRect().height > 0);
    const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
    const content = kids.reduce((n, k) => n + k.getBoundingClientRect().height, 0) + gap * Math.max(0, kids.length - 1);
    return { slack: Math.round(el.getBoundingClientRect().height - content), h: Math.round(el.getBoundingClientRect().height) };
  });
  check(`[${tag}] hero identity column is a tight stack (no stretched gaps)`, stack.slack <= 16, // a few px of child margins (e.g. the button row); a stretched column would be hundreds of px
     `slack ${stack.slack}px of ${stack.h}px`);
  const hero = await page.$eval(".mw-identity", (el) => Math.round(el.getBoundingClientRect().height));
  check(`[${tag}] hero stays one panel (stage + identity), not a sprawl`, hero <= (w <= 640 ? 1000 : 800), `${hero}px`);
  const heroTop = await page.$eval(".mw-identity", (el) => Math.round(el.getBoundingClientRect().top + scrollY));
  check(`[${tag}] identity near the top of the panel`, heroTop - (await page.$eval("#my-world-root", (el) => Math.round(el.getBoundingClientRect().top + scrollY))) <= 70);
  // Feedback moved to the global Player Voice button in the top bar; My World carries no inline panel of its own.
  check(`[${tag}] feedback is the global Voice button, no inline panel in My World`, !(await visible(page, "#mw-feedback")) && (await visible(page, "#btn-voice")));
  check(`[${tag}] My Games card, no fake Daily Hub / My Style`, empty.includes("我的游戏记录") && !/Daily Hub|My Style|换装/.test(empty));
  const cardsH = await page.$$eval(".mw-grid .mw-card", (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(`[${tag}] cards are compact`, Math.max(...cardsH) <= (w <= 640 ? 230 : 190), cardsH.join());
  await shoot(page, `${OUT}/${tag}-guest.png`);

  // 3. Guest edit persists across a reload (guest key)
  await editProfile(page, { name: "Street Baller", hometown: "Fayetteville", bio: "Arkansas hoops" });
  await reloadHome(page);
  await tab(page, "world");
  const g = await text(page, ".mw-identity");
  check(`[${tag}] guest profile survives reload`, g.includes("Street Baller") && g.includes("Fayetteville") && g.includes("Arkansas hoops"));

  // 4. Other tabs still work
  await tab(page, "players");
  check(`[${tag}] players tab still shows ranked`, await visible(page, '.mode-card[data-mode="ranked"]'));
  await tab(page, "custom");
  check(`[${tag}] custom tab still shows gold bracket`, await visible(page, '.mode-card[data-mode="career"]'));
  await tab(page, "career");
  check(`[${tag}] career tab still shows time travel`, await visible(page, '.mode-card[data-mode="timeTravel"]'));

  // 5. Two accounts: edits go to the active account only
  const ids = await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const a = acc.createAccount("Alpha");
    const b = acc.createAccount("Bravo");
    acc.setActiveAccountId(a.id);
    return { a: a.id, b: b.id };
  });
  await reloadHome(page);
  await tab(page, "world");
  check(`[${tag}] signed-in: no guest note`, !(await text(page, "#my-world-root")).includes("只保存在这台设备"));
  await editProfile(page, { name: "Alpha Prime", hometown: "Little Rock", bio: "" });
  check(`[${tag}] account bar picks up the new name`, (await text(page, "#account-home-name")).includes("Alpha Prime"));
  await page.evaluate((id) => import("/js/data/account.js").then((acc) => acc.setActiveAccountId(id)), ids.b);
  await reloadHome(page);
  await tab(page, "world");
  const bText = await text(page, ".mw-identity");
  check(`[${tag}] account B untouched`, bText.includes("Bravo") && !bText.includes("Little Rock"), bText.slice(0, 60));
  await page.evaluate((id) => import("/js/data/account.js").then((acc) => acc.setActiveAccountId(id)), ids.a);
  await reloadHome(page);
  await tab(page, "world");
  check(`[${tag}] account A edit persisted`, (await text(page, ".mw-identity")).includes("Little Rock"));

  // 6. (Feedback is the global Player Voice button now; it is covered by scripts/qa/player-voice.mjs.)

  // 7. Contrast
  const darkLow = await textContrast(page, ".mw-identity", { min: 4.5, under: [30, 80, 56] });
  check(`[${tag}] identity card contrast >= 4.5`, !darkLow.length, JSON.stringify(darkLow).slice(0, 120));
  const cardLow = await textContrast(page, ".mw-grid", { min: 4.5 });
  check(`[${tag}] cards contrast >= 4.5`, !cardLow.length, JSON.stringify(cardLow).slice(0, 120));
  await shoot(page, `${OUT}/${tag}-account.png`);

  // 8. A real career save: journey shows it and Continue really resumes it
  await page.evaluate(createCareerInPage, {});
  await reloadHome(page);
  await tab(page, "world");
  const j = await text(page, "#my-world-root");
  check(`[${tag}] journey reads the real career save`, j.includes("穿越生涯") && j.includes("1995"), j.slice(0, 90));
  await page.click('[data-mw-action="resume-career"]');
  await page.waitForFunction(() => !document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 15000 }).catch(() => {});
  const screen = await page.evaluate(() => document.querySelector("main.screen.active")?.id);
  check(`[${tag}] Continue career leaves home into the career`, screen && screen !== "screen-home", screen);

  // 9. English: tab label + panel fully translated (user-typed names are Latin)
  await page.evaluate(() => localStorage.setItem("courtside.lang", "en"));
  await reloadHome(page);
  await tab(page, "world");
  check(`[${tag}] EN tab label`, (await text(page, '.home-tab[data-category="world"]')) === "My World");
  const enText = await text(page, "#my-world-root");
  check(`[${tag}] EN panel has no Chinese`, !CJK.test(enText), (enText.match(/.{0,12}[\u4e00-\u9fff].{0,12}/) || [""])[0]);
  check(`[${tag}] no horizontal overflow (EN)`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-en.png`);

  check(`[${tag}] no page errors`, !errors.length, errors.join(" | ").slice(0, 160));
  await page.close();
}
await browser.close();
console.log(out.join("\n"));
console.log(`${out.filter((l) => l.startsWith("PASS")).length}/${out.length} passed`);
