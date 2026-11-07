// Save ownership (ADR-008a Q1) in a real browser: account isolation, unassociated legacy saves, explicit claim.
// Usage: node scripts/qa/save-ownership.mjs /tmp/cls-qa/own [http://127.0.0.1:5187/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";
import { createCareerInPage } from "./lib/career.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/own";
const BASE = process.argv[3] || "http://127.0.0.1:5187/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const world = async (page) => { await page.click('.home-tab[data-category="world"]'); return text(page, "#my-world-root"); };
const shown = (page, sel) => page.$eval(sel, (el) => !!el && !el.closest("[hidden]") && el.getBoundingClientRect().height > 0).catch(() => false);
const asAccount = (page, id) => page.evaluate((v) => import("/js/data/account.js").then((a) => a.setActiveAccountId(v)), id);
const signOut = (page) => page.evaluate(() => localStorage.removeItem("cls_active_account"));
const rootSaved = (page) => page.evaluate(() => !!localStorage.getItem("cls_root_v3"));

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await reload(page);
  const ids = await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const a = acc.createAccount("Alpha");
    const b = acc.createAccount("Bravo");
    acc.setActiveAccountId(a.id);
    return { a: a.id, b: b.id };
  });
  await reload(page);

  // 1. Alpha plays a career: it is Alpha's own, no "local save" label
  await page.evaluate(createCareerInPage, {});
  await reload(page);
  let t = await world(page);
  check(`[${tag}] owner sees own career`, t.includes("穿越生涯") && t.includes("1995"));
  check(`[${tag}] own career is not labelled unassociated`, !t.includes("未关联账号"));
  check(`[${tag}] owner sees the home Continue bar`, await shown(page, "#long-career-home-bar"));

  // 2. Account B on the same device never sees Alpha's save
  await asAccount(page, ids.b);
  await reload(page);
  t = await world(page);
  check(`[${tag}] other account: career hidden in My Games`, !t.includes("穿越生涯") && t.includes("还没有进行中的生涯"), t.slice(0, 80));
  check(`[${tag}] other account: no trophies/team leak`, !t.includes("🏆") && !/公牛|爵士|Bulls|Jazz/.test(t));
  check(`[${tag}] other account: home Continue bar hidden`, !(await shown(page, "#long-career-home-bar")));
  check(`[${tag}] other account: the save itself is untouched`, await rootSaved(page));
  await signOut(page);
  await reload(page);
  t = await world(page);
  check(`[${tag}] guest: Alpha's career hidden too`, !t.includes("穿越生涯"));

  // 3. A pre-ownership save: unassociated, never auto-assigned
  await asAccount(page, ids.b);
  await page.evaluate(() => localStorage.removeItem("cls_save_owners_v1"));
  await reload(page);
  t = await world(page);
  check(`[${tag}] legacy save is labelled local / unassociated`, t.includes("本机存档") && t.includes("未关联账号") && t.includes("穿越生涯"), t.slice(0, 100));
  check(`[${tag}] legacy save was NOT auto-assigned to the signed-in account`, await page.evaluate(() => !JSON.parse(localStorage.getItem("cls_save_owners_v1") || "{}").career?.owner));
  check(`[${tag}] claim button offered`, await shown(page, '[data-mw-action="claim-career"]'));
  const low = await textContrast(page, ".mw-games", { min: 4.5 });
  check(`[${tag}] My Games text (incl. the amber local-save label) contrast >= 4.5`, !low.length, JSON.stringify(low).slice(0, 120));
  // The shelf and nameplate are HTML overlays: nothing painted in the art may sit underneath them on a narrow room.
  const covered = await page.evaluate(() => {
    const rects = [...document.querySelectorAll(".mw-shelf, .mw-plate")].map((e) => e.getBoundingClientRect());
    return [...document.querySelectorAll(".mw-floor-prop")].filter((p) => {
      const b = p.getBoundingClientRect();
      return b.width > 0 && rects.some((r) => b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top);
    }).length;
  });
  check(`[${tag}] no floor prop hides under the trophy shelf / nameplate`, covered === 0, `${covered} overlapping`);
  await shoot(page, `${OUT}/${tag}-unassociated.png`);

  // 4. Claim needs explicit confirmation; cancelling changes nothing
  await page.click('[data-mw-action="claim-career"]');
  await page.waitForSelector("#app-confirm-dialog[open]");
  const msg = await text(page, "#app-confirm-message");
  check(`[${tag}] confirm dialog warns claim is not proof of ownership`, msg.includes("不能证明"), msg.slice(0, 40));
  await page.click("#app-confirm-cancel");
  t = await text(page, "#my-world-root");
  check(`[${tag}] cancel keeps it unassociated`, t.includes("未关联账号") && await rootSaved(page));

  // 5. Confirm: claimed by Bravo only
  await page.click('[data-mw-action="claim-career"]');
  await page.waitForSelector("#app-confirm-dialog[open]");
  await page.click("#app-confirm-accept");
  await page.waitForFunction(() => document.querySelector("#mw-games-status")?.textContent.includes("已关联"));
  t = await text(page, "#my-world-root");
  check(`[${tag}] claimed: label gone, still resumable`, !t.includes("未关联账号") && await shown(page, '[data-mw-action="resume-career"]'));
  check(`[${tag}] claim wrote ownership metadata, not the save`, await page.evaluate((id) => JSON.parse(localStorage.getItem("cls_save_owners_v1")).career.owner === id, ids.b));
  await asAccount(page, ids.a);
  await reload(page);
  t = await world(page);
  check(`[${tag}] after the claim, Alpha cannot see it`, !t.includes("穿越生涯"));
  check(`[${tag}] after the claim, Alpha cannot claim it again`, !(await shown(page, '[data-mw-action="claim-career"]')));
  check(`[${tag}] still no save deleted`, await rootSaved(page));

  // 6. Guest sees an unassociated save but cannot claim it
  await page.evaluate(() => localStorage.removeItem("cls_save_owners_v1"));
  await signOut(page);
  await reload(page);
  t = await world(page);
  check(`[${tag}] guest: unassociated save visible, claim says sign in`, t.includes("未关联账号") && t.includes("登录账号后可认领") && !(await shown(page, '[data-mw-action="claim-career"]')));
  await shoot(page, `${OUT}/${tag}-guest-unassociated.png`);

  // 7. English, overflow
  await page.evaluate(() => localStorage.setItem("courtside.lang", "en"));
  await reload(page);
  t = await world(page);
  check(`[${tag}] EN: label and no Chinese`, t.includes("Local save") && !CJK.test(t), (t.match(/.{0,10}[\u4e00-\u9fff].{0,10}/) || [""])[0]);
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, !errors.length, errors.join(" | ").slice(0, 160));
  } catch (e) {
    check(`[${tag}] flow completed`, false, String(e.message).split("\n")[0].slice(0, 140));
  }
  await page.close();
}
await browser.close();
console.log(out.join("\n"));
console.log(`${out.filter((l) => l.startsWith("PASS")).length}/${out.length} passed`);
