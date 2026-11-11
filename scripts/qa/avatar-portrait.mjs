// My World profile picture (ADR-008a addendum W1), end to end in a real browser with real WebGL (swiftshader):
// default / preset / 3D capture, persistence (guest + account), account isolation, stale-look rule, the home bar,
// the no-WebGL fallback, English, touch targets, overflow and page errors. Desktop + mobile.
// Usage: node scripts/qa/avatar-portrait.mjs /tmp/cls-qa/portrait [http://127.0.0.1:5189/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/portrait";
const BASE = process.argv[3] || "http://127.0.0.1:5189/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const scratch = await browser.newPage();

/** Share of pixels that differ clearly from the background colour, plus the image's natural size. */
const inspect = (src, bg) => scratch.evaluate(async ([s, [br, bgc, bb]]) => {
  const img = new Image(); img.src = s; await img.decode();
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let diff = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgc) + Math.abs(d[i + 2] - bb) > 60) diff++;
  return { w: img.naturalWidth, h: img.naturalHeight, share: diff / (d.length / 4) };
}, [src, bg]);

const avatarSrc = (page) => page.$eval(".mw-avatar", (i) => i.src);
const barSrc = (page) => page.$eval("#account-home-avatar", (i) => i.src);
const isPreset = (src) => src.startsWith("data:image/svg+xml") && decodeURIComponent(src).includes('cx="48" cy="41"');
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const openPanel = async (page) => {
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForFunction(() => document.querySelector("#mw-showcase-stage canvas[data-look]") || /can't be shown|暂时无法/.test(document.querySelector("#mw-look-status")?.textContent || ""), null, { timeout: 15000 });
};
const fresh = async (viewport, { noWebgl = false } = {}) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (noWebgl) await page.addInitScript(() => { const real = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : real.call(this, t, ...a); }; });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="world"]');
  return { page, errors };
};
const makeAccount = (page, name) => page.evaluate(async (n) => {
  const a = await import("/js/data/account.js");
  const acc = a.createAccount(n); // also becomes the active account
  return acc.id;
}, name);
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); await page.click('.home-tab[data-category="world"]'); };

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  // A. guest: default picture, preset pick, persistence, home bar
  const { page, errors } = await fresh({ width: w, height: h });
  const def = await avatarSrc(page);
  check(`[${tag}] guest default is a drawn portrait, not initials`, isPreset(def));
  check(`[${tag}] home bar shows the same picture`, (await barSrc(page)) === def);
  check(`[${tag}] opening My World alone wrote no portrait`, (await stored(page, "cls_guest_portrait_v1")) === null);
  await openPanel(page);
  check(`[${tag}] 3D figure loaded and the 3D-picture button is enabled`, await page.$eval('[data-mw-action="use-3d-portrait"]', (b) => !b.disabled));
  const presetRadios = await page.$$eval('input[name="mw-portrait"]', (r) => r.length);
  check(`[${tag}] six presets offered`, presetRadios === 6, `${presetRadios}`);
  check(`[${tag}] preset targets >= 44px`, await page.$$eval(".mw-portrait-opt img", (els) => els.every((e) => e.getBoundingClientRect().width >= 44 && e.getBoundingClientRect().height >= 44)));
  await page.click('.mw-portrait-opt:has(input[value="p2"])');
  const p2 = await avatarSrc(page);
  check(`[${tag}] picking a preset changes the My World picture`, isPreset(p2) && p2 !== def);
  check(`[${tag}] ...and the home bar, without closing the 3D figure`, (await barSrc(page)) === p2 && (await page.locator("#mw-showcase-stage canvas").count()) === 1);
  check(`[${tag}] preset saved for the guest`, JSON.parse(await stored(page, "cls_guest_portrait_v1")).preset === "p2");
  await reload(page);
  check(`[${tag}] preset survives a reload (page + bar)`, (await avatarSrc(page)) === p2 && (await barSrc(page)) === p2);

  // B. 3D capture
  await openPanel(page);
  const t0 = Date.now();
  await page.click('[data-mw-action="use-3d-portrait"]');
  const tCapture = Date.now() - t0;
  const shot = await avatarSrc(page);
  check(`[${tag}] 3D picture replaces the preset (JPEG data URL)`, shot.startsWith("data:image/jpeg;base64,"));
  const info = await inspect(shot, [0x1f, 0x6b, 0x45]);
  check(`[${tag}] 3D picture is 128px and actually contains the figure`, info.w === 128 && info.h === 128 && info.share > 0.15 && info.share < 0.97, JSON.stringify(info));
  check(`[${tag}] capture is quick`, tCapture < 1500, `${tCapture}ms`);
  check(`[${tag}] picture is small enough to store`, shot.length < 40000, `${shot.length} chars`);
  check(`[${tag}] home bar shows the 3D picture too`, (await barSrc(page)) === shot);
  check(`[${tag}] the on-screen 3D figure is intact after capture (canvas visible, not 128px)`, await page.$eval("#mw-showcase-stage canvas", (c) => c.getBoundingClientRect().width > 100 && c.getBoundingClientRect().height > 100));
  check(`[${tag}] button shows the pressed state (attribute AND label)`, (await page.getAttribute('[data-mw-action="use-3d-portrait"]', "aria-pressed")) === "true" && /✓/.test(await page.textContent('[data-mw-action="use-3d-portrait"]')));
  await page.click('.mw-portrait-opt:has(input[value="p1"])');
  check(`[${tag}] picking a preset un-presses the 3D button and restores its label`, (await page.getAttribute('[data-mw-action="use-3d-portrait"]', "aria-pressed")) === "false" && !/✓/.test(await page.textContent('[data-mw-action="use-3d-portrait"]')));
  await page.click('[data-mw-action="use-3d-portrait"]');
  await page.locator(".mw-identity").screenshot({ path: `${OUT}/${tag}-identity-3d.png` });
  const rot0 = await page.evaluate(() => document.querySelector("#mw-showcase-stage canvas").dataset.look);
  // 3D picture follows a look change
  await page.click('.mw-swatch:has(input[name="mw-look-hair"][value="red"])');
  await page.waitForTimeout(200);
  const after = await avatarSrc(page);
  check(`[${tag}] changing the look retakes the 3D picture`, after.startsWith("data:image/jpeg") && after !== shot);
  const savedNow = JSON.parse(await page.evaluate(() => localStorage.getItem("cls_guest_portrait_v1")));
  check(`[${tag}] stored signature matches the new look`, savedNow.source === "3d" && savedNow.sig.includes(".red."), savedNow.sig);
  check(`[${tag}] look still saved separately`, JSON.parse(await stored(page, "cls_guest_avatar_v1")).hair === "red" && rot0 !== undefined);
  await reload(page);
  check(`[${tag}] 3D picture survives a reload`, (await avatarSrc(page)) === after && (await barSrc(page)) === after);

  // C. stale: look edited behind the picture's back => the old picture must not be shown
  await page.evaluate(() => localStorage.setItem("cls_guest_avatar_v1", JSON.stringify({ skin: "deep", hair: "gray", outfit: "royal", style: "short" })));
  await reload(page);
  const stale = await avatarSrc(page);
  check(`[${tag}] stale 3D picture is replaced by a preset, not shown`, isPreset(stale));
  await page.click('[data-mw-action="toggle-look"]');
  check(`[${tag}] panel explains why`, /no longer shown|hidden|不再显示/.test(await page.$eval(".mw-portraits .mw-note", (n) => n.textContent)));

  // D. tampered storage never reaches an <img>
  await page.evaluate(() => localStorage.setItem("cls_guest_portrait_v1", JSON.stringify({ source: "3d", image: "https://evil.example/x.png", sig: "x" })));
  await reload(page);
  check(`[${tag}] a hand-edited external image URL is ignored`, isPreset(await avatarSrc(page)) && !(await avatarSrc(page)).includes("evil.example"));

  // E. accounts: own picture each, nothing leaks from the guest
  const a = await makeAccount(page, "Alpha");
  await reload(page);
  const alphaDefault = await avatarSrc(page);
  check(`[${tag}] a new account does not inherit the guest picture`, isPreset(alphaDefault) && (await stored(page, "cls_guest_portrait_v1")) !== null);
  await openPanel(page);
  await page.click('.mw-portrait-opt:has(input[value="p5"])');
  const alphaPick = await avatarSrc(page);
  const accountsRaw = JSON.parse(await stored(page, "cls_accounts_v1"));
  const alphaRec = (accountsRaw.accounts || accountsRaw).find?.((x) => x.id === a) || accountsRaw[a];
  check(`[${tag}] saved on the account (avatarPortrait)`, alphaRec?.avatarPortrait?.preset === "p5", JSON.stringify(alphaRec?.avatarPortrait));
  check(`[${tag}] saving the picture did not touch other account fields`, Array.isArray(alphaRec?.playerIds));
  const b = await makeAccount(page, "Beta");
  await reload(page);
  const betaSrc = await avatarSrc(page);
  // (Beta's automatic default is a hash of its id, so it may legitimately equal Alpha's hand-picked one: compare the stored data instead.)
  const recs = JSON.parse(await stored(page, "cls_accounts_v1"));
  const findRec = (id) => (recs.accounts || recs).find?.((x) => x.id === id) || recs[id];
  check(`[${tag}] second account shows a drawn portrait and nothing was written to it`, isPreset(betaSrc) && !findRec(b)?.avatarPortrait);
  check(`[${tag}] first account's choice is untouched by the second account`, findRec(a)?.avatarPortrait?.preset === "p5");
  await page.evaluate(async (id) => (await import("/js/data/account.js")).setActiveAccountId(id), a);
  await reload(page);
  check(`[${tag}] switching back restores the first account's picture`, (await avatarSrc(page)) === alphaPick && (await barSrc(page)) === alphaPick);

  // F. layout / a11y
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  await openPanel(page);
  await page.screenshot({ path: `${OUT}/${tag}-panel.png`, fullPage: false });
  const low = await textContrast(page, "#mw-look", { min: 4.5 });
  check(`[${tag}] panel text contrast >= 4.5`, low.length === 0, low.join(" | "));
  check(`[${tag}] home bar avatar does not break the bar (<= 90px tall)`, await page.$eval("#account-home-bar", (b) => b.getBoundingClientRect().height <= 90));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();

  // G. no WebGL: presets still work, 3D button stays disabled and says why, nothing is invented
  const nog = await fresh({ width: w, height: h }, { noWebgl: true });
  await openPanel(nog.page);
  check(`[${tag}] no WebGL: 3D button disabled`, await nog.page.$eval('[data-mw-action="use-3d-portrait"]', (b) => b.disabled));
  check(`[${tag}] no WebGL: fallback message shown`, (await nog.page.$eval("#mw-look-status", (n) => n.textContent)).length > 5);
  await nog.page.click('.mw-portrait-opt:has(input[value="p6"])');
  check(`[${tag}] no WebGL: presets still work and save`, JSON.parse(await stored(nog.page, "cls_guest_portrait_v1")).preset === "p6");
  check(`[${tag}] no WebGL: no page errors`, nog.errors.length === 0, nog.errors.join(" | ").slice(0, 200));
  await nog.page.close();

  // H. English
  const en = await fresh({ width: w, height: h });
  await en.page.click("#btn-lang");
  await openPanel(en.page);
  const txt = await en.page.$eval("#my-world-root", (n) => n.innerText);
  check(`[${tag}] English: no Chinese in My World`, !CJK.test(txt), CJK.test(txt) ? txt.match(CJK.source + ".{0,20}")?.[0] : "");
  check(`[${tag}] English: labels present`, txt.includes("Profile picture") && txt.includes("Use my 3D look"));
  await en.page.screenshot({ path: `${OUT}/${tag}-panel-en.png` });
  await en.page.close();
}

await scratch.close();
await browser.close();
console.log(out.join("\n"));
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
