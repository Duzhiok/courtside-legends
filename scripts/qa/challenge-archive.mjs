// B50 in a real browser: finished gold-challenge runs show in My World > My Games as read-only records.
// NOTE: records are written with the real module in the page; the "tap Back to home" trigger itself is covered by
// the wiring test + mutation in tests/challengeArchive.test.js, not by playing a 32-team bracket here.
// Usage: node scripts/qa/challenge-archive.mjs /tmp/cls-qa/archive [http://127.0.0.1:5189/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/archive";
const BASE = process.argv[3] || "http://127.0.0.1:5189/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const openWorld = async (page) => { await page.click('.home-tab[data-category="world"]'); await page.waitForSelector("#my-world-body, .mw-card", { timeout: 15000 }); };
const rows = (page) => page.$$eval(".mw-archive", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));

for (const [w, h, tag, lang] of [[1280, 800, "desktop", "zh"], [390, 844, "mobile", "zh"], [1280, 800, "desktop-en", "en"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate((l) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("courtside.lang", l); }, lang);
    await reload(page);
    const ids = await page.evaluate(async () => {
      const acc = await import("/js/data/account.js");
      const a = acc.createAccount("Alpha");
      const b = acc.createAccount("Bravo");
      acc.setActiveAccountId(a.id);
      const ar = await import("/js/data/challengeArchive.js");
      const players = [92, 88, 85, 80, 77, 70].map((v, i) => ({ id: `s${i}`, name: `Star ${i}`, scoring: v, three: v - 5, mid: v - 5, paint: v - 5, pass: 60, iq: 60, speed: 60, strength: 60, defense: 60, rebound: 60 }));
      const run = (extra) => ({ kind: "career", challengeTier: "gold", stageSize: 8, round: 2, losses: { you: 2 }, team: { name: "<i>Hawks</i>", players }, ...extra });
      const now = Date.now();
      ar.recordChallengeArchive(a.id, ar.challengeArchiveEntry(run({}), "eliminated", now - 2000));
      ar.recordChallengeArchive(a.id, ar.challengeArchiveEntry(run({ stageSize: 2 }), "eliminated", now - 1000));
      ar.recordChallengeArchive(a.id, ar.challengeArchiveEntry(run({ challengeTier: "champ7", stageSize: 2 }), "champion", now));
      return { a: a.id, b: b.id };
    });
    await reload(page);
    await openWorld(page);
    const zh = lang === "zh";
    let r = await rows(page);
    check(`[${tag}] three records listed, newest first`, r.length === 3 && (zh ? r[0].includes("通关夺冠") : r[0].includes("Champions")), r[0]?.slice(0, 80));
    check(`[${tag}] finals loss and earlier elimination are told apart`, zh ? r[1].includes("总决赛出局") && r[2].includes("淘汰出局") : r[1].includes("Lost in the Finals") && r[2].includes("Eliminated"));
    check(`[${tag}] records are read-only: no buttons inside`, await page.$$eval(".mw-archive", (els) => els.every((e) => !e.querySelector("button, [data-mw-action], a"))));
    check(`[${tag}] says it is finished and cannot be continued`, r.every((t) => (zh ? t.includes("只读记录") : t.includes("read-only"))));
    check(`[${tag}] team name is escaped (no live <i> element)`, (await page.$$(".mw-archive i")).length === 0 && r[0].includes("<i>Hawks</i>"));
    check(`[${tag}] top players listed`, r[0].includes("Star 0"));
    if (!zh) check(`[${tag}] English card has no Chinese`, !CJK.test((await text(page, "#mw-games, .mw-games"). catch(() => "")) || r.join(" ")));
    check(`[${tag}] no continue/start buttons for a run that is over`, !(await page.$('.mw-archive [data-mw-action="resume-career"]')));
    check(`[${tag}] no horizontal overflow`, await noOverflow(page));
    const low = await textContrast(page, ".mw-games", { min: 4.5 });
    check(`[${tag}] records text contrast >= 4.5`, !low.length, JSON.stringify(low).slice(0, 160));
    await shoot(page, `${OUT}/${tag}.png`);

    // survives a reload; another account sees none; the guest list is separate
    await reload(page);
    await openWorld(page);
    check(`[${tag}] records survive a reload`, (await rows(page)).length === 3);
    await page.evaluate(async (b) => (await import("/js/data/account.js")).setActiveAccountId(b), ids.b);
    await reload(page);
    await openWorld(page);
    check(`[${tag}] the other account sees none of them`, (await rows(page)).length === 0);
    check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  } catch (e) {
    check(`[${tag}] script ran to the end`, false, String(e.message).slice(0, 300));
    await page.screenshot({ path: `${OUT}/${tag}-crash.png` }).catch(() => {});
  }
  await page.close();
}
await browser.close();
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
