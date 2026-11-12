// Legacy Museum on the shared Screen Shell, in a real browser: honours-wall entry (44px, distinct badges), open/close,
// one screen instance inside #app, one page title, scroll-to-tapped-title, focus in/out, Back + Esc, ZH/EN in place,
// no overflow, contrast. The pure HTML/model checks live in scripts/qa/legacy-museum.mjs and tests/legacyMuseum.test.js.
// Usage: node scripts/qa/legacy-museum-ui.mjs /tmp/cls-qa/museum [http://127.0.0.1:5187/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/museum";
const BASE = process.argv[3] || "http://127.0.0.1:5187/";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const SEL = "#screen-legacy-museum";
const museumActive = (page) => page.$eval(SEL, (el) => el.classList.contains("active")).catch(() => false);
const homeIsActive = (page) => page.$eval("#screen-home", (el) => el.classList.contains("active"));

/** A real account with a full Architect legacy: coach + GM completions, then a prestige career with a title. */
const seed = (page) =>
  page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const a = acc.createAccount("Museum Tester");
    const done = (careerId, role, extra = {}) => ({ careerId, role, prestige: false, year: 2001, seasons: 3, championships: 0, tier: "solid", reason: "voluntary", at: 1700000000000, ...extra });
    a.careerCompletions = [
      done("c1", "COACH"),
      done("c2", "GM", { at: 1700001000000 }),
      done("c3", "GM_COACH", { prestige: true, championships: 1, year: 2005, tier: "great", at: 1700002000000 }),
    ];
    a.careerRelationships = {
      people: [],
      relationships: [{ kind: "rivalry", state: "active" }],
      promises: [{ status: "fulfilled" }, { status: "open" }, { status: "broken" }],
      legacy: [{ type: "transition", season: 1997, year: 1997, summary: "转投新球队", summaryEn: "Moved to a new team" }],
    };
    acc.saveAccount(a);
    acc.setActiveAccountId(a.id);
  });

for (const [w, h, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"], [360, 800, "narrow"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const L = (s) => `[${tag}] ${s}`;
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await seed(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await homeActive(page);
    await page.click('.home-tab[data-category="world"]');

    // 1. The honours wall: three titles, each a 44px button with its own look.
    const wall = await page.$$eval(".mw-title-btn", (els) => els.map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { id: e.dataset.title, h: Math.round(r.height), w: Math.round(r.width), bg: cs.backgroundColor, icon: e.querySelector("span")?.textContent }; }));
    check(L("three earned titles on the honours wall"), wall.length === 3, wall.map((b) => b.id).join());
    check(L("every title button is at least 44px tall"), wall.every((b) => b.h >= 44), wall.map((b) => b.h).join());
    check(L("the three title buttons look different (colour and icon)"), new Set(wall.map((b) => b.bg)).size === 3 && new Set(wall.map((b) => b.icon)).size === 3, JSON.stringify(wall.map((b) => [b.bg, b.icon])));
    check(L("no horizontal overflow on My World with the bigger buttons"), await noOverflow(page));

    // 2. Open from the second title.
    await page.click('.mw-title-btn[data-title="dynasty-master"]');
    await page.waitForSelector(`${SEL}.active`);
    await page.waitForTimeout(150);
    const facts = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const sel2 = el.querySelector(".lm-title.is-selected");
      const r = sel2?.getBoundingClientRect();
      return {
        instances: document.querySelectorAll(sel).length,
        parent: el.parentElement?.id,
        h2: [...el.querySelectorAll("h2")].map((x) => x.textContent.trim()),
        selected: sel2?.dataset.lmTitle,
        selectedInView: !!r && r.top >= 0 && r.top < window.innerHeight,
        focus: document.activeElement?.id,
        stats: el.querySelectorAll(".lm-stat").length,
        badges: [...el.querySelectorAll(".lm-icon")].map((i) => i.textContent).join(""),
        back: Math.round(el.querySelector(".nav-back").getBoundingClientRect().height),
      };
    }, SEL);
    check(L("museum opens as one screen instance, mounted inside #app"), facts.instances === 1 && facts.parent === "app", JSON.stringify([facts.instances, facts.parent]));
    check(L("exactly one page title, in Chinese only"), facts.h2.length === 1 && facts.h2[0] === "篮球人生博物馆", JSON.stringify(facts.h2));
    check(L("no 'LEGACY MUSEUM' kicker or English duplicate in zh"), !/legacy museum/i.test(await text(page, SEL)));
    check(L("the tapped title's section is highlighted and scrolled into view"), facts.selected === "dynasty-master" && facts.selectedInView, JSON.stringify([facts.selected, facts.selectedInView]));
    check(L("focus moved to the page heading"), facts.focus === "legacy-museum-title", String(facts.focus));
    check(L("three distinct title badges + five grouped stat tiles"), facts.badges.length >= 3 && new Set([...facts.badges.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => m[0])).size === 3 && facts.stats === 5, JSON.stringify([facts.badges, facts.stats]));
    check(L("back button is a 44px target"), facts.back >= 44, String(facts.back));
    const zhText = await text(page, SEL);
    check(L("zh page has no raw English tokens (kinds are localised)"), !/\b(transition|trade|draft|divergence|rivalry-game)\b/.test(zhText), (zhText.match(/[A-Za-z][A-Za-z-]{3,}/g) || []).join("|").slice(0, 120));
    check(L("zh content shows real records and no leaked values"), /结束于 2005 赛季/.test(zhText) && /1 座总冠军/.test(zhText) && /转投新球队/.test(zhText) && !/undefined|NaN|null/.test(zhText));
    check(L("no horizontal overflow in the museum"), await noOverflow(page));
    const low = await textContrast(page, `${SEL} .lm-museum`, { min: 4.5 });
    check(L("museum text contrast >= 4.5:1"), Array.isArray(low) ? low.length === 0 : !low, JSON.stringify(low).slice(0, 220));
    await shoot(page, `${OUT}/${tag}-zh.png`);

    // 3. Language switch with the museum open: heading, back label and body all follow, in place.
    await page.click("#btn-lang");
    await page.waitForTimeout(150);
    const en = await page.evaluate((sel) => { const el = document.querySelector(sel); return { h2: el.querySelector("h2").textContent.trim(), back: el.querySelector(".nav-back").getAttribute("aria-label"), still: el.classList.contains("active"), n: document.querySelectorAll(sel).length }; }, SEL);
    const enText = await text(page, SEL);
    check(L("EN: heading, back label follow the language without reopening"), en.h2 === "Legacy Museum" && en.back === "Back" && en.still && en.n === 1, JSON.stringify(en));
    check(L("EN: no Chinese anywhere on the museum screen"), !CJK.test(enText), (enText.match(/[\u4e00-\u9fff]+/g) || []).slice(0, 4).join("|"));
    check(L("EN: content in English (Coach career, Moved to a new team)"), /Coach career/.test(enText) && /Moved to a new team/.test(enText) && /Rivals/.test(enText));
    await shoot(page, `${OUT}/${tag}-en.png`);

    // 4. Esc goes back one layer and gives focus back to the title button that opened it.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    check(L("Esc closes the museum and shows the home screen"), !(await museumActive(page)) && (await homeIsActive(page)));
    check(L("focus returns to the title button that opened it"), await page.evaluate(() => document.activeElement?.dataset?.title === "dynasty-master"), await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 80)));

    // 5. Re-open from another title, then the Back button; still exactly one instance, scroll reset when no title is aimed.
    await page.click('.mw-title-btn[data-title="architect"]');
    await page.waitForSelector(`${SEL}.active`);
    check(L("re-opening reuses the same screen element"), (await page.$$(SEL)).length === 1);
    await page.click(`${SEL} .nav-back`);
    await page.waitForTimeout(200);
    check(L("Back button closes the museum"), !(await museumActive(page)) && (await homeIsActive(page)));
    check(L("focus returns to the architect title button"), await page.evaluate(() => document.activeElement?.dataset?.title === "architect"));

    // 6. Other tabs and screens untouched: the shell does not leave its screen visible.
    await page.click('.home-tab[data-category="career"]');
    check(L("closed museum is not visible on other tabs"), !(await museumActive(page)));
    check(L("no page errors"), errors.length === 0, errors.join(" | "));
  } catch (e) {
    check(L("flow completed"), false, String(e.message).split("\n")[0]);
  } finally {
    await page.close();
  }
}

await browser.close();
const failed = out.filter((l) => l.startsWith("FAIL"));
console.log(out.join("\n"));
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
