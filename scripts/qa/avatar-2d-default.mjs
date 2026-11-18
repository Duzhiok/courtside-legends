// 2D is the default figure: real browser, real art, desktop 1280 + mobile 390.
//   1. No flag, nothing saved -> My World mounts the 2D figure from the real art set, 3D-only controls hidden, the switch is offered.
//   2. The switch -> 3D (needs WebGL), the label flips, the choice survives a reload; switching back survives one too.
//   3. ?avatar=3d forces 3D (switch hidden); ?avatar=2d beats a saved 3D choice.
//   4. Saving a portrait from the 2D figure stores a normal 256px portrait and it survives a reload.
//   5. The duel select screen previews the same renderer.
// Screenshots are for the user's visual review, not a self-declared acceptance.
// Usage: node scripts/qa/avatar-2d-default.mjs [http://127.0.0.1:5173/] [/tmp/cls-qa/avatar-2d-default]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "/tmp/cls-qa/avatar-2d-default";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};

const state = (page) => page.evaluate(() => {
  const toggle = document.querySelector("#mw-renderer-toggle");
  const stage = document.querySelector("#mw-showcase-stage");
  const c2 = stage?.querySelector("canvas.avatar2d-canvas");
  const bar = document.querySelector(".mw-showcase-bar");
  return {
    renderer: document.querySelector("#my-world-root")?.dataset.avatarRenderer || null,
    has2d: !!c2,
    layers: c2?.dataset.layers || "",
    painted: c2 ? (() => { const d = c2.getContext("2d").getImageData(0, 0, c2.width, c2.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n += 1; return n; })() : 0,
    barVisible: !!bar && getComputedStyle(bar).display !== "none",
    toggleShown: !!toggle && !toggle.hidden && getComputedStyle(toggle).display !== "none",
    toggleText: toggle?.textContent.trim() || "",
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});

async function fresh(viewport, query = "") {
  const page = await browser.newPage({ viewport });
  const errors = [];
  const missing = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400 && /assets\/avatar2d/.test(r.url())) missing.push(`${r.status()} ${r.url().split("/").slice(-2).join("/")}`); });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    acc.createAccount("John");
    (await import("/js/data/avatarLook.js")).saveLook(acc.getAccount(), { skin: "warm", hair: "black", outfit: "forest", style: "short" });
  });
  await page.goto(BASE + query, { waitUntil: "domcontentloaded" });
  return { page, errors, missing };
}
const openWorld = async (page, sel) => {
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector(sel, { timeout: 25000 });
  await page.waitForTimeout(700);
};
const reloadWorld = async (page, sel) => { await page.reload({ waitUntil: "domcontentloaded" }); await openWorld(page, sel); };

for (const [viewport, vt] of [[{ width: 1280, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobile"]]) {
  const tag = `[${vt}]`;
  // ---- 1. the default
  const { page, errors, missing } = await fresh(viewport);
  await openWorld(page, "#mw-showcase-stage canvas");
  let s = await state(page);
  check(`${tag} no flag, nothing saved: the figure is 2D`, s.renderer === "2d" && s.has2d);
  check(`${tag} it is drawn from the real art layers, not blank`, /body/.test(s.layers) && s.painted > 40, `${s.layers} / ${s.painted} painted samples`);
  check(`${tag} no art file is missing (no 404 under assets/avatar2d)`, missing.length === 0, missing.join(", "));
  check(`${tag} 3D-only controls (style switch, rotate hint) are hidden`, s.barVisible === false);
  check(`${tag} the 3D preview is offered, worded as experimental`, s.toggleShown && /3D/.test(s.toggleText) && /实验/.test(s.toggleText), s.toggleText);
  check(`${tag} no horizontal overflow`, !s.overflow);
  await page.screenshot({ path: `${OUT}/${vt}-default-2d.png` });

  // ---- 4. a portrait saved from the 2D figure
  await page.click('[data-mw-action="toggle-look"]'); // the portrait button lives in the (collapsed) look editor
  await page.click('[data-mw-action="use-3d-portrait"]');
  await page.waitForTimeout(500);
  const portrait = await page.evaluate(async () => {
    const { readPortrait } = await import("/js/data/avatarPortrait.js");
    const { getAccount } = await import("/js/data/account.js");
    const p = readPortrait(getAccount());
    return p ? { source: p.source, jpeg: /^data:image\/jpeg/.test(p.image || ""), chars: (p.image || "").length } : null;
  });
  check(`${tag} saving the portrait from the 2D figure stores an ordinary portrait (limit respected)`, portrait?.source === "3d" && portrait.jpeg && portrait.chars > 1000 && portrait.chars <= 40000, JSON.stringify(portrait));

  // ---- 2. the switch to 3D and back, persisted across reloads
  await page.click("#mw-renderer-toggle");
  await page.waitForSelector("#my-world-root[data-avatar-renderer='3d']", { timeout: 30000 });
  s = await state(page);
  check(`${tag} the switch brings up the 3D figure`, s.renderer === "3d" && !s.has2d);
  check(`${tag} 3D controls are back and the switch now offers the way home`, s.barVisible && s.toggleShown && /2D/.test(s.toggleText), s.toggleText);
  await page.screenshot({ path: `${OUT}/${vt}-toggled-3d.png` });
  await reloadWorld(page, "#my-world-root[data-avatar-renderer='3d']");
  check(`${tag} after a reload the 3D choice is kept`, (await state(page)).renderer === "3d");
  await page.click("#mw-renderer-toggle");
  await page.waitForSelector("#my-world-root[data-avatar-renderer='2d']", { timeout: 25000 });
  await reloadWorld(page, "#my-world-root[data-avatar-renderer='2d']");
  check(`${tag} switching back to 2D is kept across a reload too`, (await state(page)).renderer === "2d");
  check(`${tag} the saved portrait survives all of that`, await page.evaluate(async () => (await import("/js/data/avatarPortrait.js")).readPortrait((await import("/js/data/account.js")).getAccount())?.source === "3d"));
  check(`${tag} no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();

  // ---- 3. URL overrides
  const f3 = await fresh(viewport, "?avatar=3d");
  await openWorld(f3.page, "#my-world-root[data-avatar-renderer='3d']");
  s = await state(f3.page);
  check(`${tag} ?avatar=3d forces 3D and hides the switch (the URL already decided)`, s.renderer === "3d" && !s.toggleShown);
  await f3.page.evaluate(async () => (await import("/js/ui/avatarMount.js")).writeRendererPref("3d"));
  await f3.page.goto(BASE + "?avatar=2d", { waitUntil: "domcontentloaded" });
  await openWorld(f3.page, "#mw-showcase-stage canvas");
  check(`${tag} ?avatar=2d beats a saved 3D choice`, (await state(f3.page)).renderer === "2d");
  check(`${tag} override runs had no page errors`, f3.errors.length === 0, f3.errors.join(" | "));
  await f3.page.close();
}

// ---- 5. the duel select screen follows the same default
{
  const { page, errors } = await fresh({ width: 1280, height: 900 });
  await page.waitForTimeout(500);
  const duel = await page.evaluate(async () => {
    const { chooseAvatarMount } = await import("/js/ui/avatarMount.js");
    const { mountAvatar2d } = await import("/js/ui/avatar2d/avatar2dRenderer.js");
    return chooseAvatarMount() === mountAvatar2d;
  });
  check("[duel] the shared chooser (used by My World and the duel preview) returns the 2D mount by default", duel);
  const wired = await page.evaluate(async () => (await (await fetch("/js/ui/duelView.js")).text()).includes("chooseAvatarMount()"));
  check("[duel] the duel select preview mounts through that chooser, not a hard-coded 3D", wired);
  check("[duel] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
