// W3 Avatar Creator slice (no art) in a real browser with real WebGL (swiftshader):
// body presets (bone scaling + visual height), existing animations wired as preview actions,
// the appearance-only rule (a build change touches nothing but the look), the no-WebGL fallback,
// English, touch targets, overflow and page errors. Desktop + mobile.
// Shirt pattern/number is NOT covered here: the GLB has no UVs and no textures (verified from the file),
// so there is no shirt control to test — see BACKLOG B55.
// Usage: node scripts/qa/avatar-creator-slice.mjs /tmp/cls-qa/creator [http://127.0.0.1:5189/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/creator";
const BASE = process.argv[3] || "http://127.0.0.1:5189/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? ` — ${d}` : ""}`);
const scratch = await browser.newPage();

/** Share of pixels that differ clearly between two PNG buffers (same size expected). */
const shotDiff = (a, b) => scratch.evaluate(async ([sa, sb]) => {
  const load = (s) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = s; });
  const [ia, ib] = await Promise.all([load(sa), load(sb)]);
  const c = document.createElement("canvas");
  c.width = ia.naturalWidth; c.height = ia.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(ia, 0, 0);
  const da = ctx.getImageData(0, 0, c.width, c.height).data;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(ib, 0, 0);
  const db = ctx.getImageData(0, 0, c.width, c.height).data;
  if (da.length !== db.length) return { share: 1, note: "different sizes" };
  let diff = 0;
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) diff++;
  return { share: diff / (da.length / 4) };
}, [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`]);

const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const lookOf = (page) => page.$eval("#mw-look-stage canvas", (c) => JSON.parse(c.dataset.look || "{}"));
const actionOf = (page) => page.$eval("#mw-look-stage canvas", (c) => c.dataset.action || "");
const stageShot = (page) => page.locator("#mw-look-stage").screenshot();
const openPanel = async (page) => {
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForFunction(() => document.querySelector("#mw-look-stage canvas[data-look]") || /can't be shown|暂时无法/.test(document.querySelector("#mw-look-status")?.textContent || ""), null, { timeout: 15000 });
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
const pickBody = async (page, id) => {
  await page.click(`.mw-swatch:has(input[name="mw-look-body"][value="${id}"])`);
  await page.waitForFunction((want) => JSON.parse(document.querySelector("#mw-look-stage canvas").dataset.look || "{}").body === want, id, { timeout: 5000 });
  await page.waitForTimeout(600); // let a frame render with the new bone scales
};

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const { page, errors } = await fresh({ width: w, height: h });
  await openPanel(page);
  check(`[${tag}] 3D figure loaded`, (await page.locator("#mw-look-stage canvas").count()) === 1);
  check(`[${tag}] three build presets offered`, (await page.$$eval('input[name="mw-look-body"]', (r) => r.length)) === 3);
  check(`[${tag}] default build is standard`, (await lookOf(page)).body === "standard");
  check(`[${tag}] four preview actions offered, all enabled once the figure loads`, (await page.$$eval('[data-mw-action^="avatar-action-"]', (b) => b.filter((x) => !x.disabled).length)) === 4
    && !(await page.$eval('[data-mw-action="avatar-idle"]', (b) => b.disabled)));

  // A. body presets: applied (dataset + saved), and visibly different on screen.
  const shots = {};
  for (const id of ["standard", "broad", "slim"]) {
    await pickBody(page, id);
    check(`[${tag}] picking ${id} applies it in the viewer`, (await lookOf(page)).body === id);
    check(`[${tag}] picking ${id} saves only the look`, JSON.parse(await stored(page, "cls_guest_avatar_v1")).body === id);
    shots[id] = await stageShot(page);
    await page.locator("#mw-look-stage").screenshot({ path: `${OUT}/${tag}-build-${id}.png` });
  }
  const broadVsStd = await shotDiff(shots.broad, shots.standard);
  const slimVsStd = await shotDiff(shots.slim, shots.standard);
  const broadVsSlim = await shotDiff(shots.broad, shots.slim);
  check(`[${tag}] broad looks different from standard on screen`, broadVsStd.share > 0.002, `share ${broadVsStd.share.toFixed(4)}`);
  check(`[${tag}] slim looks different from standard on screen`, slimVsStd.share > 0.002, `share ${slimVsStd.share.toFixed(4)}`);
  check(`[${tag}] broad and slim look different from each other`, broadVsSlim.share > 0.002, `share ${broadVsSlim.share.toFixed(4)}`);
  // Appearance-only: a build change touched nothing but the look (no account fields exist for a guest, so the
  // look key itself must contain exactly the five whitelisted fields and nothing else was written).
  const lookKeys = Object.keys(JSON.parse(await stored(page, "cls_guest_avatar_v1"))).sort();
  check(`[${tag}] look key holds exactly the five whitelisted fields`, JSON.stringify(lookKeys) === JSON.stringify(["body", "hair", "outfit", "skin", "style"]), lookKeys.join(","));

  // B. animations: each action switches the figure (dataset + pixels), Stand returns to idle.
  await pickBody(page, "standard");
  const idleShot = await stageShot(page);
  for (const [id, label] of [["clap", "Cheer"], ["jump", "Jump"], ["run", "Run"], ["sit", "Sit"]]) {
    await page.click(`[data-mw-action="avatar-action-${id}"]`);
    await page.waitForFunction((want) => document.querySelector("#mw-look-stage canvas").dataset.action === want, id, { timeout: 5000 });
    check(`[${tag}] ${label} starts (canvas reports the action)`, (await actionOf(page)) === id);
    await page.waitForTimeout(700);
    const moved = await shotDiff(await stageShot(page), idleShot);
    check(`[${tag}] ${label} visibly moves the figure`, moved.share > 0.002, `share ${moved.share.toFixed(4)}`);
    await page.locator("#mw-look-stage").screenshot({ path: `${OUT}/${tag}-action-${id}.png` });
    await page.click('[data-mw-action="avatar-idle"]');
    await page.waitForFunction(() => document.querySelector("#mw-look-stage canvas").dataset.action === "idle", null, { timeout: 5000 });
    check(`[${tag}] Stand returns to idle after ${label}`, (await actionOf(page)) === "idle");
  }

  // C. layout / a11y
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  const low = await textContrast(page, "#mw-look", { min: 4.5 });
  check(`[${tag}] panel text contrast >= 4.5`, low.length === 0, low.join(" | "));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();

  // D. no WebGL: builds still selectable and saved; actions stay disabled and say why.
  const nog = await fresh({ width: w, height: h }, { noWebgl: true });
  await openPanel(nog.page);
  check(`[${tag}] no WebGL: figure absent, fallback message shown`, (await nog.page.$eval("#mw-look-status", (n) => n.textContent)).length > 5);
  await nog.page.click('.mw-swatch:has(input[name="mw-look-body"][value="broad"])');
  check(`[${tag}] no WebGL: build still selectable and saved`, JSON.parse(await stored(nog.page, "cls_guest_avatar_v1")).body === "broad");
  check(`[${tag}] no WebGL: preview actions stay disabled`, (await nog.page.$$eval('[data-mw-action^="avatar-action-"], [data-mw-action="avatar-idle"]', (b) => b.every((x) => x.disabled))));
  check(`[${tag}] no WebGL: no page errors`, nog.errors.length === 0, nog.errors.join(" | ").slice(0, 200));
  await nog.page.close();

  // E. English
  const en = await fresh({ width: w, height: h });
  await en.page.click("#btn-lang");
  await openPanel(en.page);
  const txt = await en.page.$eval("#my-world-root", (n) => n.innerText);
  check(`[${tag}] English: no Chinese in My World`, !CJK.test(txt), CJK.test(txt) ? txt.match(CJK.source + ".{0,20}")?.[0] : "");
  check(`[${tag}] English: labels present`, txt.includes("Build") && txt.includes("Preview actions") && txt.includes("Cheer") && txt.includes("Sit"));
  await en.page.close();
}

await scratch.close();
await browser.close();
console.log(out.join("\n"));
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
