// P0 save integrity in a real browser: account B must never overwrite or delete account A's device-wide saves
// (career root, mid-game autosave, quick season), and every blocked path must say so instead of failing silently.
// Usage: node scripts/qa/save-overwrite-guard.mjs /tmp/cls-qa/guard [http://127.0.0.1:5187/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text } from "./lib/page.mjs";
import { createCareerInPage } from "./lib/career.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/guard";
const BASE = process.argv[3] || "http://127.0.0.1:5187/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const asAccount = (page, id) => page.evaluate((v) => import("/js/data/account.js").then((a) => a.setActiveAccountId(v)), id);
const raw = (page) => page.evaluate(() => ["cls_root_v3", "cls_savegame_v1", "cls_season_v1", "cls_save_owners_v1"].map((k) => localStorage.getItem(k)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

    // Alpha owns all three slots: a career, an unfinished game and a quick season.
    await page.evaluate(createCareerInPage, {});
    await page.evaluate(async () => {
      const sg = await import("/js/data/savegame.js");
      const se = await import("/js/engine/season.js");
      sg.writeSave({ screen: "market", label: "alpha game", app: {}, sim: null, feed: [] });
      se.saveSeason({ v: 1, phase: "regular", year: 1995, teams: {}, schedule: [], resultsLog: [] });
    });
    await reload(page);
    const owners = await page.evaluate(() => JSON.parse(localStorage.getItem("cls_save_owners_v1")));
    check(`[${tag}] setup: Alpha owns career, session and season`, ["career", "session", "season"].every((s) => owners[s]?.owner), JSON.stringify(Object.keys(owners)));

    // Bravo signs in on the same device.
    await asAccount(page, ids.b);
    await reload(page);
    const before = await raw(page);

    // 1. Every storage writer refuses, and nothing in storage changes.
    const res = await page.evaluate(async () => {
      const root = await import("/js/data/saveRoot.js");
      const sg = await import("/js/data/savegame.js");
      const se = await import("/js/engine/season.js");
      const tryIt = (fn) => { try { return { ok: true, v: fn() }; } catch (e) { return { ok: false, name: e.name }; } };
      return {
        write: tryIt(() => root.writeRootSave(root.createRootState())),
        freeing: tryIt(() => root.writeRootSaveFreeingOrphans(root.createRootState())),
        clear: tryIt(() => root.clearRootSave()),
        del: tryIt(() => root.deleteCareerSave()),
        session: sg.writeSave({ screen: "home", label: "bravo", app: {}, sim: null, feed: [] }),
        clearSession: sg.clearSave(),
        season: se.saveSeason({ v: 1, phase: "regular", year: 2000, teams: {}, schedule: [], resultsLog: [] }),
        clearSeason: se.clearSeasonSave(),
      };
    });
    check(`[${tag}] writeRootSave refused`, !res.write.ok && res.write.name === "ForeignSaveError", JSON.stringify(res.write));
    check(`[${tag}] writeRootSaveFreeingOrphans refused`, !res.freeing.ok && res.freeing.name === "ForeignSaveError");
    check(`[${tag}] clearRootSave refused`, !res.clear.ok && res.clear.name === "ForeignSaveError");
    check(`[${tag}] deleteCareerSave refused`, !res.del.ok && res.del.name === "ForeignSaveError");
    check(`[${tag}] autosave refused (blocked flag)`, res.session?.blocked === "foreign", JSON.stringify(res.session).slice(0, 80));
    check(`[${tag}] clearSave refused`, res.clearSession === false);
    check(`[${tag}] quick season write refused`, res.season === false);
    check(`[${tag}] quick season delete refused`, res.clearSeason === false);
    check(`[${tag}] all four raw storage keys byte-identical after the attack`, same(before, await raw(page)));

    // 2. UI: starting a time-travel career says why, with a single "Got it" button.
    await page.click('.home-tab[data-category="career"]');
    await page.click('.mode-card[data-mode="timeTravel"]');
    await page.waitForSelector("#btn-time-travel-interview", { state: "visible" });
    await page.click("#btn-time-travel-interview");
    await page.waitForSelector("#app-confirm-dialog[open]");
    const msg = await text(page, "#app-confirm-message");
    check(`[${tag}] start: notice names another account`, msg.includes("另一个账号"), msg.slice(0, 50));
    check(`[${tag}] start: notice is info-only (cancel hidden)`, await page.$eval("#app-confirm-cancel", (el) => el.hidden));
    const box = await page.$eval("#app-confirm-dialog", (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
    check(`[${tag}] start: dialog fits the viewport`, box.l >= 0 && box.r <= box.vw && box.t >= 0 && box.b <= box.vh, JSON.stringify(box));
    await shoot(page, `${OUT}/${tag}-blocked-notice.png`);
    await page.click("#app-confirm-accept");
    check(`[${tag}] start: dismissing changes nothing`, same(before, await raw(page)));

    // 3. UI: importing a career file over it is blocked before any "overwrite" question.
    await page.click(".back, #btn-time-travel-back, [data-back]").catch(() => {});
    await reload(page);
    const exported = await page.evaluate(() => import("/js/data/saveRoot.js").then((m) => m.exportRootSave(m.createRootState())));
    await page.setInputFiles("#long-career-import-file", { name: "c.json", mimeType: "application/json", buffer: Buffer.from(exported) });
    await page.waitForSelector("#app-confirm-dialog[open]");
    const imsg = await text(page, "#app-confirm-message");
    check(`[${tag}] import: blocked with the notice, not the overwrite question`, imsg.includes("另一个账号") && !imsg.includes("导入将替换"), imsg.slice(0, 50));
    await page.click("#app-confirm-accept");
    check(`[${tag}] import: nothing changed`, same(before, await raw(page)));

    // 4. English notice has no Chinese left.
    await page.evaluate(() => localStorage.setItem("courtside.lang", "en"));
    await reload(page);
    await page.setInputFiles("#long-career-import-file", { name: "c.json", mimeType: "application/json", buffer: Buffer.from(exported) });
    await page.waitForSelector("#app-confirm-dialog[open]");
    const en = await text(page, "#app-confirm-dialog");
    check(`[${tag}] EN notice: english and no Chinese`, /another account/i.test(en) && !CJK.test(en), (en.match(/.{0,10}[\u4e00-\u9fff].{0,10}/) || [""])[0]);
    await page.click("#app-confirm-accept");
    await page.evaluate(() => localStorage.setItem("courtside.lang", "zh"));
    await reload(page);

    // 5. Controls: the owner is not locked out of her own saves.
    await asAccount(page, ids.a);
    await reload(page);
    const own = await page.evaluate(async () => {
      const root = await import("/js/data/saveRoot.js");
      const sg = await import("/js/data/savegame.js");
      const se = await import("/js/engine/season.js");
      const cur = root.readRootSave();
      let ok = true;
      try { root.writeRootSave(cur); } catch { ok = false; }
      return { root: ok, session: !!sg.writeSave({ screen: "market", label: "again", app: {}, sim: null, feed: [] }).bytes, season: se.saveSeason({ v: 1, phase: "regular", year: 1995, teams: {}, schedule: [], resultsLog: [] }) };
    });
    check(`[${tag}] owner can still write her own career/session/season`, own.root && own.session && own.season === true, JSON.stringify(own));

    // 6. A deleted owner can't come back for her save, so it stops locking the slot.
    await asAccount(page, ids.b);
    await page.evaluate((id) => import("/js/data/account.js").then((a) => a.deleteAccount(id)), ids.a);
    await asAccount(page, ids.b);
    await reload(page);
    const freed = await page.evaluate(async () => {
      const root = await import("/js/data/saveRoot.js");
      try { root.writeRootSave(root.createRootState()); return "wrote"; } catch (e) { return e.reason || e.name; }
    });
    // A deleted owner's save is unassociated now: still never overwritten silently (claim or delete it first).
    check(`[${tag}] owner account deleted: save turns unassociated and stays protected`, freed === "unassociated", String(freed));

    check(`[${tag}] no horizontal overflow`, await noOverflow(page));
    check(`[${tag}] no page errors`, !errors.length, errors.join(" | ").slice(0, 160));
  } catch (e) {
    check(`[${tag}] flow completed`, false, String(e.message).split("\n")[0].slice(0, 160));
  }
  await page.close();
}
await browser.close();
console.log(out.join("\n"));
console.log(`${out.filter((l) => l.startsWith("PASS")).length}/${out.length} passed`);
