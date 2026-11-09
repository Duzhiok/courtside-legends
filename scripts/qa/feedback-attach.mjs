// Player Voice screenshots in a real browser: pick / drop real images, shrink them, keep a per-account draft in
// IndexedDB across reloads, and keep EVERYTHING when a submit fails. Desktop + mobile.
// Usage: node scripts/qa/feedback-attach.mjs /tmp/cls-qa/attach [http://127.0.0.1:5189/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/attach";
const BASE = process.argv[3] || "http://127.0.0.1:5189/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const openPanel = async (page) => {
  await page.click('.home-tab[data-category="world"]');
  if (!(await page.$eval("#mw-feedback", (el) => !el.hidden))) await page.click(".mw-voice");
  await page.waitForSelector("#mw-feedback:not([hidden])");
};
const thumbs = (page) => page.$$eval("#mw-thumbs .mw-thumb", (els) => els.map((e) => ({ id: e.dataset.id, name: e.querySelector(".mw-thumb-name").textContent, w: e.querySelector("img").naturalWidth })));
const settle = (page, n) => page.waitForFunction((k) => document.querySelectorAll("#mw-thumbs .mw-thumb").length === k && !document.querySelector("#mw-attach-status")?.textContent.includes("正在处理"), n, { timeout: 40000 });
const idbDump = (page) => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open("cls_feedback_files", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("drafts");
  req.onerror = () => resolve(null);
  req.onsuccess = () => {
    const tx = req.result.transaction("drafts", "readonly");
    const rows = {};
    const c = tx.objectStore("drafts").openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { rows[cur.key] = cur.value.map((a) => ({ type: a.type, size: a.blob.size })); cur.continue(); } };
    tx.oncomplete = () => { req.result.close(); resolve(rows); };
  };
}));
// Real image bytes, generated in the page (canvas), returned as base64.
const makeImages = (page) => page.evaluate(async () => {
  const enc = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
  const b64 = async (blob) => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };
  const canvas = (w, h, fn) => { const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); return c; };
  const grad = (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#1b6d3a"); g.addColorStop(1, "#d9a441"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
  const noise = (ctx, w, h) => { const d = ctx.createImageData(w, h); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; } ctx.putImageData(d, 0, 0); };
  const small = await enc(canvas(400, 300, grad), "image/png");
  const photo = await enc(canvas(1200, 800, grad), "image/jpeg", 0.9);
  const big = await enc(canvas(1800, 1400, noise), "image/png"); // noise does not compress: ~10 MB of PNG
  return { small: await b64(small), photo: await b64(photo), big: await b64(big), bigSize: big.size };
});
const buf = (b64) => Buffer.from(b64, "base64");
const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });

for (const [w, h, tag, lang] of [[1280, 800, "desktop", "zh"], [390, 844, "mobile", "zh"], [1280, 800, "desktop-en", "en"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate((l) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("courtside.lang", l); }, lang);
    await page.evaluate(() => indexedDB.deleteDatabase("cls_feedback_files"));
    await reload(page);
    const ids = await page.evaluate(async () => {
      const acc = await import("/js/data/account.js");
      const a = acc.createAccount("Alpha");
      const b = acc.createAccount("Bravo");
      acc.setActiveAccountId(a.id);
      return { a: a.id, b: b.id };
    });
    await reload(page);
    await openPanel(page);
    const zh = lang === "zh";
    const img = await makeImages(page);
    check(`[${tag}] test fixture: the big PNG really is over 2 MB`, img.bigSize > 2 * 1024 * 1024, `${(img.bigSize / 1048576).toFixed(1)} MB`);

    // 1. the box
    check(`[${tag}] attach box present: choose button, 0/3, accept list`, await page.$eval("#mw-attach", (el) => !!el.querySelector("#mw-attach-pick") && el.querySelector("#mw-attach-count").textContent === "0/3" && el.querySelector("#mw-attach-input").accept === "image/png,image/jpeg,image/webp"));
    check(`[${tag}] UI language is really ${lang}`, (await text(page, '.home-tab[data-category="world"]')) === (zh ? "我的世界" : "My World"));
    if (!zh) check(`[${tag}] English attach box has no Chinese`, !CJK.test(await text(page, "#mw-attach")));

    // 2. real files in: small kept, jpeg kept, huge PNG shrunk
    await page.setInputFiles("#mw-attach-input", [file("small.png", "image/png", buf(img.small)), file("photo.jpg", "image/jpeg", buf(img.photo)), file("huge.png", "image/png", buf(img.big))]);
    await settle(page, 3);
    let t = await thumbs(page);
    check(`[${tag}] three thumbnails appear and really decode`, t.length === 3 && t.every((x) => x.w > 0), JSON.stringify(t.map((x) => [x.name, x.w])));
    check(`[${tag}] the huge PNG was re-encoded, small ones kept as they are`, t[0].name === "small.png" && t[1].name === "photo.jpg" && /^huge\.(webp|jpg)$/.test(t[2].name), t.map((x) => x.name).join(","));
    let db = await idbDump(page);
    const mine = db?.[`attach_v1:${ids.a}`] || [];
    check(`[${tag}] draft stored in IndexedDB under this account, every image <= 2 MB`, mine.length === 3 && mine.every((a) => a.size > 0 && a.size <= 2 * 1024 * 1024), JSON.stringify(mine));
    check(`[${tag}] counter 3/3 and Choose disabled at the limit`, (await text(page, "#mw-attach-count")) === "3/3" && await page.$eval("#mw-attach-pick", (b) => b.disabled));
    check(`[${tag}] localStorage holds no image data (quota safe)`, await page.evaluate(() => Object.entries(localStorage).every(([k, v]) => !/^data:image|blob:/.test(v) && (!k.includes("feedback") || v.length < 2000))));
    await shoot(page, `${OUT}/${tag}-three.png`);

    // 3. a 4th file is refused with a reason
    await page.setInputFiles("#mw-attach-input", [file("fourth.png", "image/png", buf(img.small))]);
    await page.waitForFunction(() => document.querySelector("#mw-attach-status").textContent.length > 0 && !document.querySelector("#mw-attach-status").textContent.includes("正在处理"));
    check(`[${tag}] 4th image refused, list unchanged, reason shown`, (await thumbs(page)).length === 3 && /3 张|3 images/.test(await text(page, "#mw-attach-status")), await text(page, "#mw-attach-status"));

    // 4. remove one, then a text file pretending to be a PNG
    await page.click('#mw-thumbs .mw-thumb:nth-child(2) [data-mw-action="remove-attach"]');
    await settle(page, 2);
    await page.setInputFiles("#mw-attach-input", [file("evil.png", "image/png", Buffer.from("<svg onload=alert(1)></svg>"))]);
    await page.waitForFunction(() => /PNG|image/.test(document.querySelector("#mw-attach-status").textContent));
    check(`[${tag}] a text file named .png is refused, nothing added`, (await thumbs(page)).length === 2, await text(page, "#mw-attach-status"));

    // 5. drag & drop
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
      document.querySelector("#mw-drop").dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      document.querySelector("#mw-drop").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, img.small);
    await settle(page, 3);
    check(`[${tag}] dropping an image adds it`, (await thumbs(page)).some((x) => x.name === "dropped.png"));

    // 6. replace
    const before = await thumbs(page);
    await page.click('#mw-thumbs .mw-thumb:nth-child(1) [data-mw-action="replace-attach"]');
    await page.setInputFiles("#mw-attach-replace", [file("replacement.jpg", "image/jpeg", buf(img.photo))]);
    await page.waitForFunction((old) => document.querySelector("#mw-thumbs .mw-thumb .mw-thumb-name")?.textContent !== old, before[0].name);
    const after = await thumbs(page);
    check(`[${tag}] replace swaps the first image in place (still 3)`, after.length === 3 && after[0].name === "replacement.jpg" && after[1].id === before[1].id);

    // 7. reload restores the draft; another account sees nothing; coming back restores again
    await page.fill("#mw-feedback-note", "Draft with pictures");
    await page.waitForTimeout(150);
    await reload(page);
    await openPanel(page);
    await settle(page, 3);
    check(`[${tag}] after a reload the screenshots and the text are back`, (await thumbs(page)).length === 3 && (await page.inputValue("#mw-feedback-note")) === "Draft with pictures");
    await page.evaluate(async (b) => (await import("/js/data/account.js")).setActiveAccountId(b), ids.b);
    await reload(page);
    await openPanel(page);
    await page.waitForTimeout(500);
    check(`[${tag}] the other account sees no screenshots and no text`, (await thumbs(page)).length === 0 && (await page.inputValue("#mw-feedback-note")) === "");
    await page.evaluate(async (a) => (await import("/js/data/account.js")).setActiveAccountId(a), ids.a);
    await reload(page);
    await openPanel(page);
    await settle(page, 3);
    check(`[${tag}] switching back restores the first account's screenshots`, (await thumbs(page)).length === 3);

    // 8. submit: failing, throwing, slow double click, then success
    await page.evaluate(async () => {
      const m = await import("/js/data/feedbackTransport.js");
      window.__calls = [];
      window.__mode = "fail";
      m.setFeedbackTransport(async (d) => {
        window.__calls.push({ owner: d.owner, cat: d.category, note: d.note, files: d.attachments.map((a) => ({ type: a.type, size: a.size, isBlob: a.blob instanceof Blob })) });
        if (window.__mode === "throw") throw new Error("network");
        if (window.__mode === "slow") await new Promise((r) => setTimeout(r, 400));
        return window.__mode === "ok" || window.__mode === "slow";
      });
    });
    await page.click('.home-tab[data-category="players"]'); // re-render the world screen so Submit sees the transport
    await openPanel(page);
    await settle(page, 3);
    check(`[${tag}] with a transport registered Submit is enabled`, await page.$eval('[data-mw-action="submit-feedback"]', (b) => !b.disabled));
    const keep = async (label) => {
      const t2 = await thumbs(page);
      const d2 = await idbDump(page);
      check(`[${tag}] ${label}: text, ${t2.length} screenshots and the stored draft are all still there`, t2.length === 3 && (await page.inputValue("#mw-feedback-note")) === "Draft with pictures" && (d2?.[`attach_v1:${ids.a}`] || []).length === 3);
    };
    await page.click('[data-mw-action="submit-feedback"]');
    await page.waitForFunction(() => /没有提交成功|did not go through/.test(document.querySelector("#mw-feedback-status").textContent));
    const call = await page.evaluate(() => window.__calls[0]);
    check(`[${tag}] the sender got owner, text and 3 real Blobs <= 2 MB`, call.owner === ids.a && call.note === "Draft with pictures" && call.files.length === 3 && call.files.every((f) => f.isBlob && f.size <= 2 * 1024 * 1024 && ["image/png", "image/jpeg", "image/webp"].includes(f.type)));
    check(`[${tag}] failed send says screenshots are kept`, /截图|screenshots/.test(await text(page, "#mw-feedback-status")), await text(page, "#mw-feedback-status"));
    await keep("after a failed send");
    await page.evaluate(() => { window.__mode = "throw"; });
    await page.click('[data-mw-action="submit-feedback"]');
    await page.waitForFunction(() => window.__calls.length === 2);
    await page.waitForTimeout(150);
    await keep("after a send that throws");
    await page.evaluate(() => { window.__mode = "slow"; window.__calls.length = 0; });
    await page.dblclick('[data-mw-action="submit-feedback"]');
    await page.waitForFunction(() => /已提交|Submitted/.test(document.querySelector("#mw-feedback-status")?.textContent || ""), null, { timeout: 8000 });
    check(`[${tag}] double click sends once`, (await page.evaluate(() => window.__calls.length)) === 1);
    await settle(page, 0);
    db = await idbDump(page);
    check(`[${tag}] success clears the screenshots, the text and the stored draft`, (db?.[`attach_v1:${ids.a}`] || []).length === 0 && (await page.inputValue("#mw-feedback-note")) === "" && (await thumbs(page)).length === 0);
    await reload(page);
    await openPanel(page);
    await page.waitForTimeout(400);
    check(`[${tag}] and it stays cleared after a reload`, (await thumbs(page)).length === 0);

    // 9. layout with 3 thumbnails
    await page.setInputFiles("#mw-attach-input", [file("a.png", "image/png", buf(img.small)), file("b.jpg", "image/jpeg", buf(img.photo)), file("c.png", "image/png", buf(img.small))]);
    await settle(page, 3);
    check(`[${tag}] no horizontal overflow with 3 thumbnails`, await noOverflow(page));
    check(`[${tag}] every thumbnail button is inside the viewport`, await page.$$eval("#mw-thumbs button", (bs) => bs.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 && r.height >= 24; })));
    if (w < 500) {
      check(`[${tag}] phone: one compact row per image (row <= 56px, buttons on the same row)`, await page.$$eval("#mw-thumbs .mw-thumb", (rows) => rows.every((li) => { const r = li.getBoundingClientRect(); return r.height <= 56 && [...li.querySelectorAll("button")].every((b) => b.getBoundingClientRect().top < r.top + r.height / 2 + 8); })));
    }
    const low = await textContrast(page, "#mw-attach", { min: 4.5 });
    check(`[${tag}] attach box text contrast >= 4.5`, !low.length, JSON.stringify(low).slice(0, 160));
    await shoot(page, `${OUT}/${tag}-layout.png`);
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
