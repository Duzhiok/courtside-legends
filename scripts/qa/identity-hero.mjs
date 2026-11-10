// My World identity cleanup: the account menu replaces the loud "My Profile" button, ONE hero holds name + level + the
// three real numbers, the default portrait is an illustration, a player who picked the experimental 3D portrait gets a
// one-tap way back (and nobody's choice is ever overwritten), and nothing in the page repeats itself.
// Needs no WebGL: the 3D picture is written into the account through the real storage API, exactly what "use my 3D look" saves.
// Usage: node scripts/qa/identity-hero.mjs /tmp/cls-qa/hero [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/hero";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const isSvg = (src) => src.startsWith("data:image/svg+xml");
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getBoundingClientRect().height > 0).catch(() => false);
const avatar = (page) => page.$eval(".mw-hero .mw-avatar", (i) => i.src);

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const boot = async () => { await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector("#my-world-root .mw-hero", { timeout: 20000 }); };
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    acc.createAccount("Hero Tester");
  });
  await boot();

  // 1. Account menu: compact "账号 ▾", the old loud label is gone, avatar + name + button all open the same panel
  const label = await text(page, "#btn-profile-toggle");
  check(`[${tag}] account entry is the compact menu button, not "我的档案"`, label === "账号 ▾" && !(await text(page, "#account-home-bar")).includes("我的档案"), label);
  const open = () => page.$eval("#btn-profile-toggle", (b) => b.getAttribute("aria-expanded") === "true");
  check(`[${tag}] menu closed by default`, !(await open(page)) && !(await visible(page, "#profile-panel")));
  await page.click("#account-home-avatar");
  check(`[${tag}] clicking the avatar opens it`, (await open(page)) && (await visible(page, "#profile-panel")));
  await page.click("#account-home-bar .account-home-text");
  check(`[${tag}] clicking the name closes it`, !(await open(page)));
  await page.click("#btn-profile-toggle");
  const kept = await page.evaluate(() => ["btn-open-collection", "btn-daily-draw", "btn-switch-account"].every((id) => document.getElementById(id) && !document.getElementById(id).closest("[hidden]")));
  check(`[${tag}] every account function is still in the panel (cards, daily draw, switch account)`, kept);
  await page.click("#btn-profile-toggle");

  // 2. One hero, nothing repeated
  check(`[${tag}] the player's name is a heading exactly once`, (await page.$$eval("#my-world-root h3#mw-identity-title", (e) => e.length)) === 1);
  check(`[${tag}] one "edit look" button on the page`, (await page.$$eval('#my-world-root [data-mw-action="toggle-look"]', (e) => e.length)) === 1);
  const hero = await text(page, ".mw-hero");
  check(`[${tag}] hero carries level, XP and the three numbers`, /Lv\.1/.test(hero) && /XP/.test(hero) && hero.includes("总冠军") && hero.includes("球员卡") && hero.includes("排位胜场"));
  check(`[${tag}] no standalone account-level card`, (await page.$$eval("#my-world-root .mw-card.mw-level", (e) => e.length)) === 0);
  const legacy = await page.$$eval("#my-world-root .mw-grid .mw-card", (els) => els.map((e) => e.textContent).join(" "));
  check(`[${tag}] legacy card does not repeat the hero's cards / ranked numbers`, !/球员卡 \d+ 张|排位 \d+ 胜/.test(legacy) && legacy.includes("图鉴"));
  const order = await page.evaluate(() => ["mw-hero", "mw-showcase", "mw-grid", "mw-room"].map((c) => document.querySelector(`#my-world-root .${c}`)?.getBoundingClientRect().top ?? -1));
  check(`[${tag}] order: hero, character, games+legacy, home`, order.every((t) => t >= 0) && order.every((t, i) => i === 0 || t > order[i - 1]), order.join(","));

  // 3. Portrait: the default is an illustration; the way back only exists while the 3D picture is in use
  check(`[${tag}] default portrait is an illustration`, isSvg(await avatar(page)));
  check(`[${tag}] no "back to illustration" button while using an illustration`, !(await visible(page, '[data-mw-action="use-preset-portrait"]')));
  const seed = (portrait) => page.evaluate(async ([p]) => {
    const acc = await import("/js/data/account.js");
    const { savePortrait, lookSignature } = await import("/js/data/avatarPortrait.js");
    const { readLook } = await import("/js/data/avatarLook.js");
    const a = acc.listAccounts()[0];
    const pr = p.source === "3d" ? { ...p, sig: lookSignature(readLook(a)) } : p;
    return savePortrait(a, pr).saved;
  }, [portrait]);
  check(`[${tag}] 3D picture saved through the real storage API`, await seed({ source: "3d", image: PNG }));
  await boot();
  check(`[${tag}] the 3D picture shows (it is the player's explicit choice)`, (await avatar(page)).startsWith("data:image/png"));
  check(`[${tag}] "换成插画头像" is offered`, (await visible(page, '[data-mw-action="use-preset-portrait"]')) && (await text(page, '[data-mw-action="use-preset-portrait"]')) === "换成插画头像");
  await shoot(page, `${OUT}/${tag}-3d-picked.png`);
  await page.click('[data-mw-action="use-preset-portrait"]');
  check(`[${tag}] one tap switches to an illustration`, isSvg(await avatar(page)));
  check(`[${tag}] the button disappears again and says what happened`, !(await visible(page, '[data-mw-action="use-preset-portrait"]')) && (await text(page, "#mw-hero-status")).includes("插画"));
  await boot();
  check(`[${tag}] the choice survives a reload`, isSvg(await avatar(page)));

  // 4. Nobody's explicit choice is overwritten: an uploaded photo stays a photo and gets no "switch" nudge
  check(`[${tag}] uploaded photo saved`, await seed({ source: "photo", image: PNG }));
  await boot();
  check(`[${tag}] photo stays, no nudge to leave it`, (await avatar(page)).startsWith("data:image/png") && !(await visible(page, '[data-mw-action="use-preset-portrait"]')));
  await seed({ source: "preset", preset: "p3" });
  await boot();

  // 5. Readability + layout
  check(`[${tag}] showcase buttons are readable on the white card (the style switch used to be invisible)`, await textContrast(page, ".mw-showcase-body", { min: 4.5 }));
  check(`[${tag}] hero text readable on the dark panel`, await textContrast(page, ".mw-hero", { min: 4.5, under: [30, 80, 56] }).catch(() => false));
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-world.png`);
  await page.locator(".mw-hero").screenshot({ path: `${OUT}/${tag}-hero.png` });

  // 6. English: no Chinese left in the hero or the account entry
  await page.evaluate(() => localStorage.setItem("courtside.lang", "en"));
  await boot();
  const en = await text(page, ".mw-hero");
  check(`[${tag}] English hero has no Chinese`, !CJK.test(en), en.slice(0, 80));
  check(`[${tag}] English account menu`, (await text(page, "#btn-profile-toggle")) === "Account ▾", await text(page, "#btn-profile-toggle"));
  await page.locator(".mw-hero").screenshot({ path: `${OUT}/${tag}-hero-en.png` });
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
const failed = out.filter((l) => l.startsWith("FAIL"));
console.log(out.join("\n"));
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
