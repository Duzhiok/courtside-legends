// Global Player Voice (ADR-008a Q2) in a real browser: top-bar entry, module pre-pick, rating, draft + image + one
// video that survive a reload, per-account isolation, EN has no Chinese, Esc returns focus.
// Usage: node scripts/qa/player-voice.mjs /tmp/cls-qa/voice [http://127.0.0.1:5187/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/voice";
const BASE = process.argv[3] || "http://127.0.0.1:5187/";
mkdirSync(OUT, { recursive: true });

// Real magic bytes, not just a MIME label: the app sniffs the header.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const mp4 = (n) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(n)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
const MOV = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypqt  "), Buffer.alloc(32)]);

const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const dlgOpen = (page) => page.$eval("#pv-dialog, dialog.pv-dialog, dialog[open]", (d) => d.open).catch(() => false);
const openVoice = async (page) => { await page.click("#btn-voice"); await page.waitForSelector("#pv-note"); };
const counts = (page) => page.$eval("#pv-attach-count", (el) => el.textContent.replace(/\s+/g, " ").trim());
const media = (page) => page.$$eval("#pv-media .pv-media", (els) => els.map((e) => (e.classList.contains("pv-video") ? "video" : "image")));
const dlgText = (page) => page.$eval("#pv-title", (t) => t.closest("dialog").innerText);

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const L = (s) => `[${tag}] ${s}`;
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("cls_feedback_files"); });
    await reload(page);

    // Entry: one global button, visible, inside the viewport, a real tap target.
    const box = await page.$eval("#btn-voice", (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, w: r.width, h: r.height, vis: r.width > 0 }; });
    check(L("global entry is visible, on screen, and tappable"), box.vis && box.l >= 0 && box.r <= w && box.h >= 28 && box.w >= 28, JSON.stringify(box));
    check(L("old My World feedback panel is gone"), (await page.$("#mw-feedback, .mw-voice")) === null);

    // Module pre-pick follows the real tab, and the player can override it.
    await page.click('.home-tab[data-category="world"]');
    await openVoice(page);
    check(L("module pre-picked from My World"), (await page.$eval("#pv-module", (s) => s.value)) === "world");
    check(L("pre-pick is announced once"), await page.$eval("#pv-ctx", (el) => !el.hidden));
    await page.selectOption("#pv-module", "gameplay");
    check(L("changing the module hides the pre-pick hint"), await page.$eval("#pv-ctx", (el) => el.hidden));
    check(L("rating label is game-wide, not My World"), /游戏体验评分/.test(await dlgText(page)) && !/给 My World/.test(await dlgText(page)));

    // Draft: category, note, 4 stars.
    await page.check('input[name="pv-category"][value="bug"]').catch(() => page.click('.pv-seg-opt:nth-child(2)'));
    await page.fill("#pv-note", "QA draft note");
    await page.click("#pv-rate summary");
    if (!(await page.$eval("#pv-rate", (d) => d.open))) await page.click("#pv-rate summary");
    await page.click(".pv-star:nth-child(4)");
    const lit = await page.$$eval(".pv-star.on", (els) => els.length);
    check(L("4 stars lit"), lit === 4, `lit=${lit}`);

    // Attachments: image + mp4, then swap the video, refuse .mov, remove.
    await page.setInputFiles("#pv-image-input", { name: "shot.png", mimeType: "image/png", buffer: PNG });
    await page.setInputFiles("#pv-video-input", { name: "clip.mp4", mimeType: "video/mp4", buffer: mp4(2048) });
    await page.waitForSelector("#pv-media .pv-video");
    check(L("image + video listed with a real player"), (await media(page)).join() === "image,video" && (await page.$("#pv-media video.pv-player")) !== null, (await media(page)).join());
    check(L("count line shows 1 image, 1 video"), /1\/3/.test(await counts(page)) && /1\/1/.test(await counts(page)), await counts(page));
    await page.setInputFiles("#pv-video-input", { name: "next.webm", mimeType: "video/webm", buffer: WEBM });
    await page.waitForFunction(() => document.querySelector("#pv-media .pv-video .pv-media-name")?.textContent === "next.webm");
    check(L("choosing another video replaces the old one"), (await media(page)).filter((k) => k === "video").length === 1);
    await page.setInputFiles("#pv-video-input", { name: "phone.mov", mimeType: "video/quicktime", buffer: MOV });
    await page.waitForFunction(() => document.querySelector("#pv-attach-status")?.textContent.trim().length > 0);
    check(L("a .mov is refused with a reason, the kept video is untouched"), /MP4/.test(await page.$eval("#pv-attach-status", (el) => el.textContent)) && (await media(page)).includes("video"));
    await page.setInputFiles("#pv-video-input", { name: "fake.mp4", mimeType: "video/mp4", buffer: Buffer.from("this is not a video at all") });
    await page.waitForTimeout(150);
    check(L("a fake .mp4 (wrong header) is refused"), (await page.$eval("#pv-media .pv-video .pv-media-name", (el) => el.textContent)) === "next.webm");
    check(L("dialog fits the viewport width"), await noOverflow(page));
    await shoot(page, `${OUT}/${tag}-dialog.png`);

    // Reload: everything comes back from this device only.
    await reload(page);
    await openVoice(page);
    await page.waitForFunction(() => document.querySelectorAll("#pv-media .pv-media").length >= 2, null, { timeout: 5000 }).catch(() => {});
    check(L("note survives a reload"), (await page.inputValue("#pv-note")) === "QA draft note");
    check(L("rating survives a reload"), (await page.$$eval(".pv-star.on", (e) => e.length)) === 4);
    check(L("image + video survive a reload"), (await media(page)).join() === "image,video", (await media(page)).join());
    check(L("restored draft is announced"), (await page.$eval("#pv-draft", (el) => el.textContent.trim())).length > 0);

    // Remove the video.
    await page.click('#pv-media .pv-video [data-pv-action="remove-media"]');
    await page.waitForFunction(() => document.querySelectorAll("#pv-media .pv-media").length === 1).catch(() => {});
    check(L("removing the video leaves the image"), (await media(page)).join() === "image");

    // Account isolation: a second account sees an empty form; the first gets its draft back.
    const ids = await page.evaluate(async () => {
      const acc = await import("/js/data/account.js");
      const a = acc.createAccount("甲");
      const b = acc.createAccount("乙");
      acc.setActiveAccountId(a.id);
      return [a.id, b.id];
    });
    await page.keyboard.press("Escape");
    await reload(page);
    await openVoice(page);
    await page.fill("#pv-note", "draft of A");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.evaluate(async (id) => (await import("/js/data/account.js")).setActiveAccountId(id), ids[1]);
    await reload(page);
    await openVoice(page);
    check(L("second account does not see the first account's draft"), (await page.inputValue("#pv-note")) === "" && (await media(page)).length === 0);
    await page.keyboard.press("Escape");
    await page.evaluate(async (id) => (await import("/js/data/account.js")).setActiveAccountId(id), ids[0]);
    await reload(page);
    await openVoice(page);
    check(L("switching back restores the first account's draft"), (await page.inputValue("#pv-note")) === "draft of A");
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cls_feedback_draft_v1:")));
    check(L("drafts are keyed per account"), new Set(keys).size >= 1 && keys.every((k) => k.length > "cls_feedback_draft_v1:".length), keys.join());

    // Esc closes and gives focus back to the top-bar button.
    await page.keyboard.press("Escape");
    check(L("Esc closes the dialog and returns focus to the entry"), !(await page.$eval("dialog[open]", () => true).catch(() => false)) && (await page.evaluate(() => document.activeElement?.id)) === "btn-voice");

    // English: no Chinese left anywhere in the dialog.
    await page.click("#btn-lang");
    await openVoice(page);
    await page.setInputFiles("#pv-video-input", { name: "phone.mov", mimeType: "video/quicktime", buffer: MOV });
    await page.waitForFunction(() => document.querySelector("#pv-attach-status")?.textContent.trim().length > 0);
    const en = await dlgText(page);
    check(L("English dialog (incl. refusal) has no Chinese"), !CJK.test(en), (en.match(/[\u4e00-\u9fff]+/g) || []).join(" "));
    await shoot(page, `${OUT}/${tag}-dialog-en.png`);
    await page.keyboard.press("Escape");
  } catch (e) {
    check(L("script finished"), false, e.message.split("\n")[0]);
  }
  check(L("no page errors"), errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(out.join("\n"));
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
