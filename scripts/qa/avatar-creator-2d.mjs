// Avatar Creator 2.0, slices 2-3: the five pages, the five body sliders, appearance age. Real browser, real art, real slider drags.
// "Independent and visible" is measured, not eyeballed: for each slider's two extremes the script measures the figure's silhouette (head, shoulders,
// arm / torso / leg runs, feet) in art pixels and checks that THIS control moved ITS part by a lot and left the others alone. Then age 20 vs 60 (hair colour
// measured, skin and outfit must not move), save + reload, an equipped jersey, an old save, tabs and touch targets on desktop 1280 and mobile 390.
// Screenshots (every slider's extremes, age 20 vs 60, every tab) are for the user's visual review, not a self-declared acceptance.
// Usage: node scripts/qa/avatar-creator-2d.mjs [http://127.0.0.1:5197/] [/tmp/cls-qa/avatar-creator-2d]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5197/";
const OUT = process.argv[3] || "/tmp/cls-qa/avatar-creator-2d";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};
const AXIS = 510, FEET = 1463;
const ROWS = { head: 190, shoulders: 440, arms: 780, waist: 900, legs: 1200 };   // 900 = the shorts, below the hands and above the thighs; 780 = the forearms, below where the shoulder width fades out

/** The figure's silhouette in art pixels, undoing the drawing scale. */
const measure = (page) => page.evaluate(({ rows, AXIS, FEET }) => {
  const c = document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas");
  if (!c) return null;
  const g = c.getContext("2d");
  const shape = JSON.parse(c.dataset.shape || "null");
  const k = shape.scale;
  const rowRuns = (artY) => {
    const shownY = FEET - (FEET - artY) * k;
    const d = g.getImageData(0, Math.round(shownY / 2), c.width, 1).data;
    const runs = []; let s = -1;
    for (let x = 0; x <= c.width; x++) {
      const on = x < c.width && d[x * 4 + 3] > 40;
      if (on && s < 0) s = x;
      if (!on && s >= 0) { if (x - s >= 3) runs.push([AXIS + (s * 2 - AXIS) / k, AXIS + (x * 2 - AXIS) / k]); s = -1; }
    }
    return runs;
  };
  const total = (runs) => (runs.length ? runs[runs.length - 1][1] - runs[0][0] : 0);
  const w = ([l, r]) => r - l;
  const out = { k, shape, look: JSON.parse(c.dataset.look) };
  for (const [name, y] of Object.entries(rows)) { const r = rowRuns(y); out[name] = { runs: r, total: total(r) }; }
  // top and bottom of the figure in art rows
  let top = -1, bottom = -1;
  for (let y = 0; y < c.height; y++) {
    const d = g.getImageData(0, y, c.width, 1).data; let on = false;
    for (let x = 0; x < c.width; x++) if (d[x * 4 + 3] > 40) { on = true; break; }
    if (on) { if (top < 0) top = y; bottom = y; }
  }
  out.top = FEET - (FEET - top * 2) / k; out.bottom = FEET - (FEET - bottom * 2) / k;
  out.figureHeight = out.bottom - out.top;                         // in art pixels with the drawing scale undone (shape checks use these)
  out.shownTop = top * 2; out.shownBottom = bottom * 2; out.shownHeight = (bottom - top) * 2;   // as drawn on the canvas (height checks use these)
  out.armThick = out.arms.runs.length >= 3 ? [w(out.arms.runs[0]), w(out.arms.runs[2])] : null;
  out.torso700 = out.arms.runs.length >= 3 ? w(out.arms.runs[1]) : null;
  out.legs2 = out.legs.runs.length === 2 ? { widths: out.legs.runs.map(w), centres: out.legs.runs.map(([l, r]) => (l + r) / 2) } : null;
  return out;
}, { rows: ROWS, AXIS, FEET });

/** Average colour of the opaque pixels in an art-space box (hair, skin, shirt). */
const sampleColour = (page, box) => page.evaluate(({ box, AXIS, FEET }) => {
  const c = document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas");
  const g = c.getContext("2d");
  const k = JSON.parse(c.dataset.shape).scale;
  const sx = Math.round((AXIS + (box.x0 - AXIS) * k) / 2), ex = Math.round((AXIS + (box.x1 - AXIS) * k) / 2);
  const sy = Math.round((FEET - (FEET - box.y0) * k) / 2), ey = Math.round((FEET - (FEET - box.y1) * k) / 2);
  const d = g.getImageData(sx, sy, ex - sx, ey - sy).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  return n ? { r: r / n, g: gg / n, b: b / n, n } : null;
}, { box, AXIS, FEET });
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

async function fresh(viewport, avatar = { skin: "warm", hair: "black", outfit: "forest", style: "short", body: "standard" }) {
  const page = await browser.newPage({ viewport });
  const errors = [], requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (look) => {
    const accMod = await import("/js/data/account.js");
    const a = accMod.createAccount("John");
    a.gold = 5000; a.onboardingDone = true;
    a.avatar = look;
    accMod.saveAccount(a);
    const shop = await import("/js/data/shop.js");
    shop.purchaseShopItem(a, "jersey-orig_neon_1986_23");
    accMod.saveAccount(a);
  }, avatar);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  return { page, errors, requests };
}
const openEditor = async (page) => {
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#mw-showcase-stage canvas.avatar2d-canvas", { timeout: 25000 });
  await page.waitForTimeout(400);
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForSelector("#mw-look:not([hidden])");
};
const tab = (page, id) => page.click(`#mw-tab-${id}`);
const setRange = async (page, name, value) => {
  await page.locator(`input[name="${name}"]`).fill(String(value));
  await page.waitForTimeout(450);
};
const waitLook = (page, pred, arg) => page.waitForFunction(([src, a]) => { const l = JSON.parse(document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas")?.dataset.look || "{}"); return new Function("l", "a", `return (${src})(l, a)`)(l, a); }, [pred.toString(), arg], { timeout: 8000 });
const shoot = async (page, path) => (await page.$("#mw-showcase-stage")).screenshot({ path });
const within = (a, b, pct) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * pct);   // pixels: a 2px floor for anti-aliasing
const near = (a, b, pct) => Math.abs(a / b - 1) <= pct;                          // ratios: no floor

for (const [vt, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const { page, errors } = await fresh(viewport);
  await openEditor(page);
  const std = await measure(page);
  await shoot(page, `${OUT}/${vt}-default.png`);

  // ---- tabs
  const ids = ["identity", "face", "body", "hair", "outfit"];
  const tabs = await page.$$eval(".mw-tab", (els) => els.map((e) => ({ id: e.dataset.tab, h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })));
  check(`[${vt}] the editor has the five pages in order`, tabs.map((t) => t.id).join() === ids.join(), tabs.map((t) => t.id).join());
  check(`[${vt}] every tab is a 44px touch target`, tabs.every((t) => t.h >= 44 && t.w >= 44), JSON.stringify(tabs.map((t) => `${t.w}x${t.h}`)));
  for (const id of ids) {
    await tab(page, id);
    const vis = await page.$$eval(".mw-pane", (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.mwPane));
    check(`[${vt}] page ${id}: exactly that page is shown`, vis.length === 1 && vis[0] === id, vis.join());
    await page.screenshot({ path: `${OUT}/${vt}-tab-${id}.png` });
  }
  await tab(page, "identity");
  await page.focus("#mw-tab-identity");
  await page.keyboard.press("ArrowRight");
  check(`[${vt}] arrow keys move between the pages`, (await page.$eval("#mw-tab-face", (e) => e.getAttribute("aria-selected"))) === "true" && (await page.evaluate(() => document.activeElement.id)) === "mw-tab-face");
  const faceControls = await page.$eval("#mw-pane-face", (e) => e.querySelectorAll("input,button,select").length);
  check(`[${vt}] the Face page has no control that does nothing (none until the art is split)`, faceControls === 0, `${faceControls} controls`);

  // ---- body sliders: each extreme, measured
  await tab(page, "body");
  const sliderH = await page.$$eval('[data-mw-build] input[type="range"]', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(`[${vt}] five body sliders, each a 44px touch target`, sliderH.length === 5 && sliderH.every((h) => h >= 44), sliderH.join());
  const sliderRect = await page.$eval('[data-mw-build]', (e) => { const r = e.getBoundingClientRect(); return { right: r.right, vw: document.documentElement.clientWidth }; });
  check(`[${vt}] the sliders stay inside the screen`, sliderRect.right <= sliderRect.vw + 1, `${Math.round(sliderRect.right)} <= ${sliderRect.vw}`);
  const ext = {};
  const reset = async () => { await page.click('[data-mw-action="reset-build"]'); await page.waitForTimeout(500); };
  const cases = { height: [150, 220], shoulders: [0, 100], waist: [0, 100], arms: [0, 100], legs: [0, 100] };
  for (const [key, [lo, hi]] of Object.entries(cases)) {
    ext[key] = {};
    for (const [tag, v] of [["lo", lo], ["hi", hi]]) {
      await reset();
      await setRange(page, `mw-build-${key}`, v);
      await waitLook(page, (l, a) => l.build && l.build[a.key] === a.v, { key, v });
      ext[key][tag] = await measure(page);
      await shoot(page, `${OUT}/${vt}-${key}-${v}.png`);
    }
  }
  await reset();
  const e = ext;
  const ratio = (a, b) => a / b;
  // height
  const hs = (m) => m.shownHeight;
  check(`[${vt}] height: 150 vs 220 cm changes the DRAWN height in proportion (${(220 / 150).toFixed(2)}x)`, near(ratio(hs(e.height.hi), hs(e.height.lo)), 220 / 150, 0.03), `${hs(e.height.lo)} -> ${hs(e.height.hi)} canvas art px (x${ratio(hs(e.height.hi), hs(e.height.lo)).toFixed(3)})`);
  check(`[${vt}] height: the default (185 cm) sits between them in proportion (220 cm is ${(220 / 185).toFixed(2)}x)`, near(ratio(hs(e.height.hi), hs(std)), 220 / 185, 0.03) && near(ratio(hs(std), hs(e.height.lo)), 185 / 150, 0.03), `150: ${hs(e.height.lo)}, 185: ${hs(std)}, 220: ${hs(e.height.hi)}`);
  check(`[${vt}] height: the foot baseline stays fixed (150, 185 and 220 cm)`, Math.abs(e.height.hi.shownBottom - e.height.lo.shownBottom) <= 3 && Math.abs(e.height.hi.shownBottom - std.shownBottom) <= 3, `${e.height.lo.shownBottom} / ${std.shownBottom} / ${e.height.hi.shownBottom}`);
  check(`[${vt}] height: the tallest figure is not cut off at the top`, e.height.hi.shownTop >= 8, `head top at ${e.height.hi.shownTop} of ${1536}`);
  check(`[${vt}] height: the head is not stretched (head width in art pixels is the same at 150 and 220 cm)`, within(e.height.hi.head.total, e.height.lo.head.total, 0.02), `${e.height.lo.head.total.toFixed(0)} vs ${e.height.hi.head.total.toFixed(0)}`);
  // shoulders
  const sh = e.shoulders;
  check(`[${vt}] shoulders: 0 vs 100 changes the shoulder width a lot`, ratio(sh.hi.shoulders.total, sh.lo.shoulders.total) >= 1.28, `${sh.lo.shoulders.total.toFixed(0)} -> ${sh.hi.shoulders.total.toFixed(0)} (x${ratio(sh.hi.shoulders.total, sh.lo.shoulders.total).toFixed(2)})`);
  check(`[${vt}] shoulders: waist, legs, arm thickness and head do not move`, within(sh.hi.waist.total, sh.lo.waist.total, 0.015) && within(sh.hi.legs.total, sh.lo.legs.total, 0.015) && within(sh.hi.armThick[0], sh.lo.armThick[0], 0.03) && within(sh.hi.head.total, sh.lo.head.total, 0.02), `waist ${sh.lo.waist.total.toFixed(0)}/${sh.hi.waist.total.toFixed(0)} legs ${sh.lo.legs.total.toFixed(0)}/${sh.hi.legs.total.toFixed(0)} arm ${sh.lo.armThick[0].toFixed(0)}/${sh.hi.armThick[0].toFixed(0)}`);
  // waist
  const wa = e.waist;
  check(`[${vt}] waist: 0 vs 100 changes the waist a lot`, ratio(wa.hi.waist.total, wa.lo.waist.total) >= 1.3, `${wa.lo.waist.total.toFixed(0)} -> ${wa.hi.waist.total.toFixed(0)} (x${ratio(wa.hi.waist.total, wa.lo.waist.total).toFixed(2)})`);
  check(`[${vt}] waist: shoulders, arms and legs do not move`, within(wa.hi.shoulders.total, wa.lo.shoulders.total, 0.015) && within(wa.hi.armThick[0], wa.lo.armThick[0], 0.03) && within(wa.hi.legs.total, wa.lo.legs.total, 0.015), `shoulders ${wa.lo.shoulders.total.toFixed(0)}/${wa.hi.shoulders.total.toFixed(0)} legs ${wa.lo.legs.total.toFixed(0)}/${wa.hi.legs.total.toFixed(0)}`);
  // arms
  const ar = e.arms;
  check(`[${vt}] arms: 0 vs 100 changes each arm's thickness a lot`, ratio(ar.hi.armThick[0], ar.lo.armThick[0]) >= 1.8 && ratio(ar.hi.armThick[1], ar.lo.armThick[1]) >= 1.8, `left ${ar.lo.armThick[0].toFixed(0)} -> ${ar.hi.armThick[0].toFixed(0)}, right ${ar.lo.armThick[1].toFixed(0)} -> ${ar.hi.armThick[1].toFixed(0)}`);
  check(`[${vt}] arms: the torso, shoulders, waist and legs do not move`, within(ar.hi.torso700, ar.lo.torso700, 0.015) && within(ar.hi.shoulders.total, ar.lo.shoulders.total, 0.015) && within(ar.hi.waist.total, ar.lo.waist.total, 0.015) && within(ar.hi.legs.total, ar.lo.legs.total, 0.015), `torso ${ar.lo.torso700.toFixed(0)}/${ar.hi.torso700.toFixed(0)}`);
  // legs
  const lg = e.legs;
  check(`[${vt}] legs: 0 vs 100 changes each leg's thickness a lot`, !!lg.lo.legs2 && !!lg.hi.legs2 && ratio(lg.hi.legs2.widths[0], lg.lo.legs2.widths[0]) >= 1.5 && ratio(lg.hi.legs2.widths[1], lg.lo.legs2.widths[1]) >= 1.5, JSON.stringify([lg.lo.legs2?.widths.map(Math.round), lg.hi.legs2?.widths.map(Math.round)]));
  check(`[${vt}] legs: each leg grows about its own centre line (the legs do not spread apart)`, lg.lo.legs2 && lg.hi.legs2 && within(lg.hi.legs2.centres[0], lg.lo.legs2.centres[0], 0.01) && within(lg.hi.legs2.centres[1], lg.lo.legs2.centres[1], 0.01), JSON.stringify([lg.lo.legs2?.centres.map(Math.round), lg.hi.legs2?.centres.map(Math.round)]));
  check(`[${vt}] legs: shoulders, arms and waist do not move`, within(lg.hi.shoulders.total, lg.lo.shoulders.total, 0.015) && within(lg.hi.armThick[0], lg.lo.armThick[0], 0.03) && within(lg.hi.waist.total, lg.lo.waist.total, 0.015));
  check(`[${vt}] the head stays the same size under shoulders, waist, arms and legs`, [e.shoulders, e.waist, e.arms, e.legs].every((x) => within(x.hi.head.total, x.lo.head.total, 0.02)));

  // preset buttons: choosing one resets the sliders to it and drops the custom build
  await setRange(page, "mw-build-arms", 90);
  await waitLook(page, (l) => !!l.build);
  check(`[${vt}] dragging a slider marks the build as custom (the preset note says so)`, /Custom build|自定义身材/.test(await page.$eval("#mw-build-state", (el) => el.textContent)));
  await page.locator('label.mw-swatch:has(input[name="mw-look-body"][value="slim"])').click();
  await waitLook(page, (l) => l.body === "slim" && !l.build);
  const slimVals = await page.$$eval('[data-mw-build] input[type="range"]', (els) => Object.fromEntries(els.map((x) => [x.dataset.key, Number(x.value)])));
  check(`[${vt}] choosing a preset drops the custom build and the sliders show that preset`, slimVals.shoulders < 50 && slimVals.arms < 50 && slimVals.height < 185, JSON.stringify(slimVals));
  check(`[${vt}] after choosing a preset the custom-build note is gone`, (await page.$eval("#mw-build-state", (el) => el.textContent.trim())) === "");
  await page.locator('label.mw-swatch:has(input[name="mw-look-body"][value="standard"])').click();
  await waitLook(page, (l) => l.body === "standard");

  // ---- appearance age
  await tab(page, "identity");
  const hairBox = { x0: 440, x1: 580, y0: 95, y1: 150 }, skinBox = { x0: 285, x1: 325, y0: 640, y1: 690 }   /* the bare forearm: the face box would include the eyebrows, which DO grey */, shirtBox = { x0: 450, x1: 570, y0: 470, y1: 560 };
  const ages = {};
  for (const age of [20, 40, 60]) {
    await setRange(page, "mw-age", age);
    if (age === 20) await page.waitForTimeout(300); else await waitLook(page, (l, a) => l.appearanceAge === a, age);
    ages[age] = { hair: await sampleColour(page, hairBox), skin: await sampleColour(page, skinBox), shirt: await sampleColour(page, shirtBox), m: await measure(page) };
    await shoot(page, `${OUT}/${vt}-age-${age}.png`);
  }
  check(`[${vt}] age 20 vs 60: the hair is visibly lighter (grey)`, ages[60].hair && ages[20].hair && lum(ages[60].hair) - lum(ages[20].hair) >= 40, `luminance ${lum(ages[20].hair).toFixed(0)} -> ${lum(ages[40].hair).toFixed(0)} -> ${lum(ages[60].hair).toFixed(0)}`);
  check(`[${vt}] age 40 is in between (graying is gradual)`, lum(ages[20].hair) < lum(ages[40].hair) && lum(ages[40].hair) < lum(ages[60].hair));
  const same = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 10;
  check(`[${vt}] age does not change the skin, the shirt or the body shape`, same(ages[20].skin, ages[60].skin) && same(ages[20].shirt, ages[60].shirt) && within(ages[20].m.figureHeight, ages[60].m.figureHeight, 0.005) && within(ages[20].m.shoulders.total, ages[60].m.shoulders.total, 0.01), `skin ${JSON.stringify(ages[20].skin)} / ${JSON.stringify(ages[60].skin)}; shirt ${JSON.stringify(ages[20].shirt)} / ${JSON.stringify(ages[60].shirt)}; height ${ages[20].m.figureHeight.toFixed(0)}/${ages[60].m.figureHeight.toFixed(0)}`);
  check(`[${vt}] the editor says what age does and does not do (no wrinkle claim)`, /only turns the hair|现在只会让头发/.test(await page.$eval("#mw-pane-identity", (el) => el.textContent)));

  // ---- save + reload
  await tab(page, "body");
  await setRange(page, "mw-build-height", 172);
  await setRange(page, "mw-build-arms", 80);
  await waitLook(page, (l) => l.build?.height === 172 && l.build?.arms === 80);
  const saved = await page.evaluate(async () => { const { getAccount } = await import("/js/data/account.js"); return getAccount().avatar; });
  check(`[${vt}] saved to the account: build and age, nothing else changed`, saved.build?.height === 172 && saved.build?.arms === 80 && saved.appearanceAge === 60 && saved.skin === "warm" && saved.hair === "black" && saved.outfit === "forest" && saved.style === "short" && saved.cut === "jersey", JSON.stringify(saved));
  await page.reload({ waitUntil: "domcontentloaded" });
  await openEditor(page);
  await tab(page, "body");
  const after = await measure(page);
  const vals = await page.$$eval('[data-mw-build] input[type="range"]', (els) => Object.fromEntries(els.map((x) => [x.dataset.key, Number(x.value)])));
  const ageVal = await page.$eval('input[name="mw-age"]', (x) => Number(x.value));
  check(`[${vt}] after a reload the figure and the sliders are as left`, after.look.build?.height === 172 && vals.height === 172 && vals.arms === 80 && ageVal === 60 && after.look.appearanceAge === 60, JSON.stringify(vals));

  // ---- a worn jersey keeps working over a custom build
  await page.click('[data-mw-action="close-look"]');
  await page.waitForSelector(".mw-jerseys .mw-jersey-card", { timeout: 10000 });
  const jerseyBtn = page.locator('[data-mw-action="equip-jersey"]').first();
  if (await jerseyBtn.count()) {
    await jerseyBtn.click();
    await page.waitForFunction(() => !!document.querySelector("#mw-showcase-stage canvas.avatar2d-canvas")?.dataset.jersey, null, { timeout: 8000 });
    const j = await measure(page);
    const dsJersey = await page.$eval("#mw-showcase-stage canvas.avatar2d-canvas", (c) => JSON.parse(c.dataset.jersey));
    check(`[${vt}] an equipped jersey draws over the custom build (number ${dsJersey.number}) and the build is kept`, Number(dsJersey.number) === 23 && j.look.build?.height === 172 && j.look.appearanceAge === 60, JSON.stringify(dsJersey));
    await shoot(page, `${OUT}/${vt}-jersey-custom-build.png`);
  } else check(`[${vt}] a jersey is available to equip`, false, "no equip button found");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`[${vt}] no horizontal overflow`, overflow <= 1, `${overflow}px`);
  check(`[${vt}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---- an old save (none of the new fields) opens, shows the default sliders, and draws exactly the standard figure
{
  const { page, errors } = await fresh({ width: 1280, height: 900 }, { skin: "tan", hair: "brown", outfit: "orange", style: "short", body: "broad", figure: "stylized", cut: "jersey" });
  await openEditor(page);
  const m = await measure(page);
  await tab(page, "body");
  const vals = await page.$$eval('[data-mw-build] input[type="range"]', (els) => Object.fromEntries(els.map((x) => [x.dataset.key, Number(x.value)])));
  const state = await page.$eval("#mw-build-state", (el) => el.textContent.trim());
  check("[old save] a look saved before Creator 2.0 opens: no build, no age, the sliders show the Broad preset it draws", !m.look.build && m.look.appearanceAge === undefined && vals.shoulders > 60 && vals.height > 185 && state === "", JSON.stringify(vals));
  check("[old save] it is drawn as the Broad preset (shoulders wider than a standard figure's)", m.shape.shoulders > 0.1);
  await tab(page, "identity");
  const age = await page.$eval('input[name="mw-age"]', (x) => Number(x.value));
  check("[old save] the age control starts at the default age", age === 28, String(age));
  check("[old save] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---- the 256px portrait of the 2D figure, at both height extremes with every slider at its extreme, and aged
{
  const { page, errors } = await fresh({ width: 1280, height: 900 });
  const res = await page.evaluate(async () => {
    const { mountAvatar2d, PORTRAIT_PX } = await import("/js/ui/avatar2d/avatar2dRenderer.js");
    const base = { skin: "warm", hair: "black", outfit: "forest", style: "short", body: "standard" };
    const cases = {
      tallest: { build: { height: 220, shoulders: 100, waist: 100, arms: 100, legs: 100 } },
      shortest: { build: { height: 150, shoulders: 0, waist: 0, arms: 0, legs: 0 } },
      default: {}, aged: { appearanceAge: 65 },
    };
    const out = { px: PORTRAIT_PX };
    for (const [name, extra] of Object.entries(cases)) {
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-9999px;top:0;width:300px;height:450px";
      document.body.append(host);
      const handle = await mountAvatar2d(host, { look: { ...base, ...extra } });
      const url = handle.capturePortrait();
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const px = (x0, y0, w, h) => { const d = g.getImageData(x0, y0, w, h).data; let off = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 20) + Math.abs(d[i + 1] - 40) + Math.abs(d[i + 2] - 29) > 60) off++; return off / (d.length / 4); };
      out[name] = { url: url.slice(0, 23), chars: url.length, w: img.width, h: img.height, topRows: px(0, 0, img.width, 4), centre: px(Math.round(img.width * 0.3), Math.round(img.height * 0.25), Math.round(img.width * 0.4), Math.round(img.height * 0.4)), hash: url.length + ":" + url.slice(-60), url64: url.split(",")[1] };
      handle.dispose(); host.remove();
    }
    return out;
  });
  for (const name of ["tallest", "shortest", "default", "aged"]) {
    const r = res[name];
    if (r?.url64) writeFileSync(`${OUT}/portrait-256-${name}.jpg`, Buffer.from(r.url64, "base64"));
    check(`[portrait] ${name}: a ${res.px}px JPEG under the 40K storage limit`, r && r.url === "data:image/jpeg;base64," && r.w === res.px && r.h === res.px && r.chars < 40000, r ? `${r.w}x${r.h}, ${r.chars} chars` : "no portrait");
    check(`[portrait] ${name}: the head is inside the frame (nothing at the top edge) and the face fills the middle`, r && r.topRows < 0.05 && r.centre > 0.4, r ? `top edge ${(r.topRows * 100).toFixed(0)}% figure, centre ${(r.centre * 100).toFixed(0)}% figure` : "");
  }
  check("[portrait] a 65-year-old's portrait differs from the default one (the grey hair is in the stored picture)", res.aged.hash !== res.default.hash);
  check("[portrait] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---- the optional 3D figure still works with the new fields in the saved look (build, age, a presentation with no art)
{
  const newLook = { skin: "warm", hair: "black", outfit: "forest", style: "short", body: "standard", build: { height: 172, shoulders: 80, waist: 50, arms: 70, legs: 50 }, appearanceAge: 58, presentation: "female" };
  const { page, errors } = await fresh({ width: 1280, height: 900 }, newLook);
  await page.goto(`${BASE}?avatar=3d`, { waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForTimeout(6000);
  const stage = await page.$eval("#mw-showcase-stage", (el) => ({ canvases: [...el.querySelectorAll("canvas")].map((c) => c.className || "canvas"), img: !!el.querySelector("img"), has2d: !!el.querySelector("canvas.avatar2d-canvas") }));
  check("[3d] ?avatar=3d does not draw the 2D figure", !stage.has2d, JSON.stringify(stage));
  check("[3d] the 3D figure is mounted, or the static portrait is shown if WebGL is unavailable (reported: " + (stage.canvases.length ? "3D canvas" : "static portrait") + ")", stage.canvases.length > 0 || stage.img, JSON.stringify(stage));
  await shoot(page, `${OUT}/desktop-3d-fallback.png`);
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForSelector("#mw-look:not([hidden])");
  const saved = await page.evaluate(async () => (await import("/js/data/account.js")).getAccount().avatar);
  check("[3d] opening the editor in 3D leaves the saved look alone (build, age and presentation kept)", saved.build?.height === 172 && saved.appearanceAge === 58 && saved.presentation === "female", JSON.stringify(saved));
  check("[3d] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---- a save that says "female" (no art exists): drawn with the male art, nothing requested from female/, Male shown as the figure, the save untouched
for (const [vt, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const look = { skin: "tan", hair: "brown", outfit: "orange", style: "short", body: "standard", presentation: "female", build: { height: 170, shoulders: 30, waist: 50, arms: 50, legs: 50 } };
  const { page, errors, requests } = await fresh(viewport, look);
  await openEditor(page);
  const m = await measure(page);
  check(`[female save, ${vt}] the figure is drawn (male art) and the saved presentation is kept`, !!m && m.look.presentation === "female" && m.figureHeight > 800, m ? `figure ${Math.round(m.figureHeight)}px` : "no figure");
  check(`[female save, ${vt}] nothing is requested from a female/ art folder`, !requests.some((u) => /\/avatar2d\/female\//.test(u)), requests.filter((u) => /female/.test(u)).join(", "));
  const checkedId = await page.$eval('input[name="mw-look-presentation"]:checked', (el) => el.value);
  const femaleDisabled = await page.$eval('input[name="mw-look-presentation"][value="female"]', (el) => el.disabled);
  check(`[female save, ${vt}] the editor shows Male as the figure drawn and Female as disabled`, checkedId === "male" && femaleDisabled, `checked ${checkedId}, female disabled ${femaleDisabled}`);
  await tab(page, "hair");
  await page.locator('label.mw-swatch:has(input[name="mw-look-hair"][value="blond"])').first().click();   // no catch: if this cannot be clicked the test must fail, not pass empty
  await waitLook(page, (l) => l.hair === "blond");
  const saved = await page.evaluate(async () => (await import("/js/data/account.js")).getAccount().avatar);
  check(`[female save, ${vt}] editing something else (hair colour) is saved, and the presentation is not rewritten`, saved.hair === "blond" && saved.presentation === "female" && saved.build?.height === 170, JSON.stringify(saved));
  if (vt === "desktop") await shoot(page, `${OUT}/desktop-female-save-fallback.png`);
  check(`[female save, ${vt}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
