// My World hero stage: the player's 3D character is THE hero of the page (large, centred, on a platform in a locker room),
// ONE stage and ONE heading for the character, the look editor swaps in beside the live figure, and nothing regresses
// (drag-rotate, live look changes, persistence, 3D profile picture, account isolation).
// Real WebGL (software GL). Usage: node scripts/qa/my-world-stage.mjs /tmp/cls-qa/stage [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { noOverflow, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/stage";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d !== "" ? " — " + d : ""}`);

/** Share of the stage height covered by the figure (+ platform): diff the stage with and without the WebGL canvas. */
async function figureShare(page) {
  const stage = await page.$("#mw-showcase-stage");
  const withFig = (await stage.screenshot()).toString("base64");
  await page.$eval("#mw-showcase-stage canvas", (c) => (c.style.visibility = "hidden"));
  const without = (await stage.screenshot()).toString("base64");
  await page.$eval("#mw-showcase-stage canvas", (c) => (c.style.visibility = ""));
  return page.evaluate(async ([a, b]) => {
    const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${b64}`; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const da = px(A), db = px(B);
    let top = A.height, bottom = -1, left = A.width, right = -1;
    for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * 4;
      if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
    }
    return { share: bottom < 0 ? 0 : (bottom - top + 1) / A.height, cx: bottom < 0 ? 0 : (left + right) / 2 / A.width, top: top / A.height, bottom: (bottom + 1) / A.height };
  }, [withFig, without]);
}

for (const [w, h, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    acc.createAccount("John");
    const prof = await import("/js/data/profile.js");
    prof.saveIdentity?.(acc.listAccounts()[0], { name: "John", hometown: "China", bio: "dunk man" });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#mw-showcase-stage canvas", { timeout: 25000 });
  await page.waitForTimeout(1200);

  // 1. one stage, one character heading, hero before games
  check(`[${tag}] exactly one character stage, none inside the editor`, (await page.$$eval("#my-world-root #mw-showcase-stage", (e) => e.length)) === 1 && (await page.$$eval("#mw-look-stage", (e) => e.length)) === 0);
  check(`[${tag}] no duplicated "我的形象" heading`, (await page.$$eval("#my-world-root h3, #my-world-root h4", (hs) => hs.filter((x) => x.offsetParent && /我的形象/.test(x.textContent)).length)) === 0);
  check(`[${tag}] real 3D figure mounted (not the static fallback)`, await page.$eval("#mw-showcase-stage", (s) => !!s.querySelector("canvas") && s.querySelector(".mw-showcase-static")?.hidden === true));

  // 2. the character is the visual protagonist: big, centred, nothing clipped
  const stageBox = await page.$eval("#mw-showcase-stage", (s) => { const r = s.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top + scrollY }; });
  const heroBox = await page.$eval(".mw-hero", (s) => { const r = s.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top + scrollY }; });
  const fig = await figureShare(page);
  check(`[${tag}] figure fills 70–95% of the stage height`, fig.share >= 0.7 && fig.share <= 0.95, `${(fig.share * 100).toFixed(0)}% (top ${(fig.top * 100).toFixed(0)}%, bottom ${(fig.bottom * 100).toFixed(0)}%)`);
  check(`[${tag}] figure is centred and uncropped`, Math.abs(fig.cx - 0.5) < 0.08 && fig.top > 0.01 && fig.bottom < 0.995, `cx ${(fig.cx * 100).toFixed(0)}%`);
  check(`[${tag}] stage is large: ≥ ${tag === "desktop" ? 45 : 85}% of hero ${tag === "desktop" ? "width" : "width and ≥ 340px tall"}`, tag === "desktop" ? stageBox.w / heroBox.w >= 0.45 && stageBox.h >= 450 : stageBox.w / heroBox.w >= 0.85 && stageBox.h >= 340, `${Math.round(stageBox.w)}x${Math.round(stageBox.h)} in hero ${Math.round(heroBox.w)}x${Math.round(heroBox.h)}`);
  if (tag === "desktop") {
    const side = await page.$eval(".mw-hero-side", (s) => { const r = s.getBoundingClientRect(); return { l: r.left, w: r.width }; });
    const stageRight = await page.$eval("#mw-showcase-stage", (s) => s.getBoundingClientRect().right);
    check(`[${tag}] identity sits beside the stage, not below it`, side.l >= stageRight - 2, `side left ${Math.round(side.l)} vs stage right ${Math.round(stageRight)}`);
    check(`[${tag}] hero is not mostly empty: info column ≥ 30% of the hero`, side.w / heroBox.w >= 0.3, `${Math.round((side.w / heroBox.w) * 100)}%`);
  } else {
    const info = await page.$eval(".mw-hero-info", (s) => s.getBoundingClientRect().top + scrollY);
    check(`[${tag}] on a phone the stage sits above the identity`, info >= stageBox.top + stageBox.h - 2);
  }
  check(`[${tag}] hero carries name, level, XP, the three numbers and the actions`, await page.$eval(".mw-hero", (e) => { const t = e.textContent; return t.includes("John") && /Lv\.1/.test(t) && t.includes("XP") && t.includes("总冠军") && t.includes("球员卡") && t.includes("排位胜场") && t.includes("编辑形象") && t.includes("编辑资料") && t.includes("进入我的家"); }));
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  await page.screenshot({ path: `${OUT}/${tag}-world.png` });
  await (await page.$(".mw-hero")).screenshot({ path: `${OUT}/${tag}-hero.png` });

  // 3. drag rotates the figure
  const canvas = await page.$("#mw-showcase-stage canvas");
  const cb = await canvas.boundingBox();
  const yaw0 = await page.evaluate(() => document.querySelector("#mw-showcase-stage canvas").dataset.action);
  const before = (await canvas.screenshot()).toString("base64");
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 90, cb.y + cb.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = (await canvas.screenshot()).toString("base64");
  check(`[${tag}] dragging the figure rotates it`, before !== after && yaw0 === "idle");

  // 4. edit look: the editor opens beside / under the SAME live figure
  await canvas.evaluate((c) => (window.__cv = c, true));
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForTimeout(500);
  check(`[${tag}] editor opens and replaces the info column`, await page.$eval("#mw-look", (e) => !e.hidden) && await page.$eval(".mw-hero-info", (e) => getComputedStyle(e).display === "none"));
  check(`[${tag}] the same 3D canvas stays mounted while editing`, await page.evaluate(() => window.__cv === document.querySelector("#mw-showcase-stage canvas") && window.__cv.isConnected));
  const stageVis = await page.$eval("#mw-showcase-stage", (s) => { const r = s.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
  check(`[${tag}] the figure stays on screen while editing`, stageVis.top >= -2 && stageVis.bottom <= stageVis.vh + 2 && stageVis.bottom - stageVis.top >= 200, JSON.stringify(stageVis));
  const lookBefore = await page.$eval("#mw-showcase-stage canvas", (c) => c.dataset.look);
  await page.evaluate(() => document.querySelector("#mw-look").scrollIntoView({ block: "start" }));
  await page.click('[data-mw-look-group="skin"] .mw-swatch:nth-of-type(1)');
  await page.waitForTimeout(500);
  check(`[${tag}] picking a swatch changes the live figure`, (await page.$eval("#mw-showcase-stage canvas", (c) => c.dataset.look)) !== lookBefore);
  const stageVis2 = await page.$eval("#mw-showcase-stage", (s) => { const r = s.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
  check(`[${tag}] ...and the figure is still visible after scrolling the editor`, stageVis2.top >= -2 && stageVis2.bottom <= stageVis2.vh + 2 && stageVis2.bottom - stageVis2.top >= 200, JSON.stringify(stageVis2));
  await page.screenshot({ path: `${OUT}/${tag}-editing.png` });
  check(`[${tag}] no horizontal overflow while editing`, await noOverflow(page));

  // 5. actions + 3D portrait still work on the one viewer
  check(`[${tag}] preview actions are enabled`, await page.$eval('[data-mw-action="avatar-action-celebrate"]', (b) => !b.disabled));
  await page.click('[data-mw-action="avatar-action-clap"]');
  await page.waitForTimeout(300);
  check(`[${tag}] clap plays on the hero figure`, (await page.$eval("#mw-showcase-stage canvas", (c) => c.dataset.action)) === "clap");
  await page.click('[data-mw-action="avatar-idle"]');
  await page.click('[data-mw-action="use-3d-portrait"]');
  await page.waitForTimeout(400);
  const avatar = await page.$eval(".mw-hero .mw-avatar", (i) => i.src);
  check(`[${tag}] "use my 3D look" captures a real JPEG portrait`, avatar.startsWith("data:image/jpeg"), avatar.slice(0, 22));
  const portraitShot = await page.$eval(".mw-hero .mw-avatar", (i) => i.naturalWidth);
  check(`[${tag}] captured portrait is the head, platform hidden (128px square)`, portraitShot === 128);

  // 6. Done closes the editor; the way back to an illustration lives in the identity column
  await page.click('[data-mw-action="close-look"]');
  await page.click('[data-mw-action="use-preset-portrait"]');
  check(`[${tag}] Done closes the editor and brings the identity back`, await page.$eval("#mw-look", (e) => e.hidden) && await page.$eval(".mw-hero-info", (e) => getComputedStyle(e).display !== "none"));

  // 7. figure style switch persists across a reload (and rebuilds the platform for the new build)
  await page.click('[data-mw-action="showcase-figure"][data-figure="bobblehead"]');
  await page.waitForFunction(() => document.querySelector("#mw-showcase-stage canvas")?.dataset.look, null, { timeout: 25000 }); // model painted
  await page.waitForTimeout(1500);
  const bobble = await figureShare(page);
  check(`[${tag}] bobblehead also fills the stage`, bobble.share >= 0.6 && bobble.share <= 0.97, `${(bobble.share * 100).toFixed(0)}%`);
  await page.screenshot({ path: `${OUT}/${tag}-bobblehead.png` });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForFunction(() => document.querySelector("#mw-showcase-stage canvas")?.dataset.look, null, { timeout: 25000 }); // model painted
  check(`[${tag}] the chosen style survives a reload`, (await page.$eval("#mw-showcase-stage canvas", (c) => JSON.parse(c.dataset.look).figure)) === "bobblehead");

  // 8. account isolation: a second account starts from ITS OWN look, not John's
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    acc.createAccount("Beta");
    acc.setActiveAccountId(acc.listAccounts().find((a) => a.name === "John").id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForFunction(() => document.querySelector("#mw-showcase-stage canvas")?.dataset.look, null, { timeout: 25000 }); // model painted
  const johnName = await text(page, "#mw-identity-title");
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    acc.setActiveAccountId(acc.listAccounts().find((a) => a.name === "Beta").id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForFunction(() => document.querySelector("#mw-showcase-stage canvas")?.dataset.look, null, { timeout: 25000 }); // model painted
  const betaFig = await page.$eval("#mw-showcase-stage canvas", (c) => JSON.parse(c.dataset.look).figure);
  check(`[${tag}] another account shows its own name and its own default look`, johnName === "John" && (await text(page, "#mw-identity-title")) === "Beta" && betaFig === "stylized");

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}

await browser.close();
console.log(out.join("\n"));
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed — screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
