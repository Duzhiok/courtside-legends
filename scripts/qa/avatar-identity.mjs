// Identity slice in a real browser with real WebGL: character style (Stylized / Bobblehead) and the player's own
// photo as the profile picture. Desktop + mobile, zh + en. Writes screenshots to look at.
// Usage: node scripts/qa/avatar-identity.mjs /tmp/cls-qa/identity [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/identity";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? ` — ${d}` : ""}`);

/** A real, non-square PNG made in the page, so the crop is exercised with a real decoder. */
const makePhoto = (page, w, h, label) => page.evaluate(async ([W, H, text]) => {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#c0392b"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#2980b9"; g.fillRect(W / 2 - H / 2, 0, H, H); // the centred square is blue, the sides red
  g.fillStyle = "#fff"; g.font = "48px sans-serif"; g.fillText(text, W / 2 - 60, H / 2);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}, [w, h, label]);

const fresh = async (viewport, lang = "zh") => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => { localStorage.clear(); localStorage.setItem("cls_lang", l); }, lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="world"]');
  return { page, errors };
};
const openPanel = async (page) => {
  await page.click('[data-mw-action="toggle-look"]');
  await page.waitForFunction(() => document.querySelector("#mw-look-stage canvas[data-look]"), null, { timeout: 15000 });
};
const lookOf = (page) => page.$eval("#mw-look-stage canvas", (c) => JSON.parse(c.dataset.look || "{}"));
const headerSrc = (page) => page.$eval(".mw-avatar", (i) => i.src);

for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
  const { page, errors } = await fresh(viewport);
  const t = (l) => `[${name}] ${l}`;
  await openPanel(page);

  // 1. character style
  check(t("style group is offered first"), await page.$eval("#mw-look", (p) => p.querySelector("[data-mw-look-group]")?.dataset.mwLookGroup === "figure"));
  check(t("default is Stylized"), (await lookOf(page)).figure === "stylized");
  await page.click('.mw-swatch:has(input[name="mw-look-figure"][value="bobblehead"])');
  await page.waitForTimeout(500);
  check(t("Bobblehead reaches the 3D figure"), (await lookOf(page)).figure === "bobblehead");
  await page.locator("#mw-look-stage").screenshot({ path: `${OUT}/${name}-bobblehead.png` });
  check(t("style is saved to the guest look"), JSON.parse(await page.evaluate(() => localStorage.getItem("cls_guest_avatar_v1"))).figure === "bobblehead");
  await page.click('.mw-swatch:has(input[name="mw-look-skin"][value="deep"])');
  check(t("other choices still work in Bobblehead and the style is kept"), (await lookOf(page)).skin === "deep" && (await lookOf(page)).figure === "bobblehead");
  await page.click('.mw-swatch:has(input[name="mw-look-figure"][value="stylized"])');
  await page.waitForTimeout(400);
  await page.locator("#mw-look-stage").screenshot({ path: `${OUT}/${name}-stylized.png` });
  check(t("switching back to Stylized keeps skin"), (await lookOf(page)).figure === "stylized" && (await lookOf(page)).skin === "deep");

  // 2. own photo as profile picture (3D look untouched)
  const lookBefore = await page.evaluate(() => localStorage.getItem("cls_guest_avatar_v1"));
  const buf = await makePhoto(page, 800, 500, "ME");
  await page.setInputFiles("#mw-photo-input", { name: "me.png", mimeType: "image/png", buffer: Buffer.from(buf) });
  await page.waitForFunction(() => /已用你的照片|Your photo is now/.test(document.querySelector("#mw-look-status")?.textContent || ""), null, { timeout: 10000 });
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem("cls_guest_portrait_v1")));
  check(t("photo saved as source=photo"), stored?.source === "photo" && /^data:image\/jpeg;base64,/.test(stored.image), `${stored?.image?.length} chars`);
  check(t("photo stays small enough for localStorage"), (stored?.image?.length || 1e9) < 40000);
  check(t("the 3D character is untouched by the photo"), (await page.evaluate(() => localStorage.getItem("cls_guest_avatar_v1"))) === lookBefore);
  check(t("My World header shows the photo"), (await headerSrc(page)) === stored.image);
  const centre = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
    return { w: img.width, h: img.height, edge: px(4, img.height / 2), mid: px(img.width / 2 + 40, img.height / 2 - 40) };
  }, stored.image);
  check(t("cropped to a square"), centre.w === centre.h, `${centre.w}x${centre.h}`);
  check(t("crop took the centre (blue), not the red sides"), centre.mid[2] > centre.mid[0] && centre.edge[2] > centre.edge[0], JSON.stringify(centre));
  await page.screenshot({ path: `${OUT}/${name}-photo.png`, fullPage: true });

  // changing the character must not hide the photo
  await page.click('.mw-swatch:has(input[name="mw-look-figure"][value="bobblehead"])');
  await page.waitForTimeout(300);
  check(t("photo survives a character change"), (await headerSrc(page)) === stored.image);

  // 3. bad files change nothing and say why
  await page.setInputFiles("#mw-photo-input", { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>") });
  await page.waitForFunction(() => /没能用这张照片|Could not use/.test(document.querySelector("#mw-look-status")?.textContent || ""), null, { timeout: 8000 });
  check(t("an SVG is refused with a reason"), true, await page.$eval("#mw-look-status", (s) => s.textContent));
  await page.setInputFiles("#mw-photo-input", { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
  await page.waitForFunction(() => /读不出|Could not read/.test(document.querySelector("#mw-look-status")?.textContent || ""), null, { timeout: 8000 });
  check(t("a corrupt image is refused with a reason"), true);
  check(t("refused files left the saved photo alone"), JSON.parse(await page.evaluate(() => localStorage.getItem("cls_guest_portrait_v1"))).image === stored.image);

  // 4. reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="world"]');
  check(t("photo survives a reload"), (await headerSrc(page)) === stored.image);
  await openPanel(page);
  check(t("character style survives a reload"), (await lookOf(page)).figure === "bobblehead");
  check(t("upload button shows it is in use"), await page.$eval('[data-mw-action="pick-photo"]', (b) => b.getAttribute("aria-pressed") === "true"));

  // 5. picking a preset replaces the photo
  await page.click(".mw-portrait-opt >> nth=1");
  await page.waitForTimeout(300);
  check(t("a preset replaces the photo"), JSON.parse(await page.evaluate(() => localStorage.getItem("cls_guest_portrait_v1"))).source === "preset");

  // 6. layout
  check(t("no horizontal overflow"), await noOverflow(page));
  check(t("no page errors"), errors.length === 0, errors.join("|"));
  await page.close();
}

// English
{
  const { page, errors } = await fresh({ width: 390, height: 844 });
  await page.click("#btn-lang");
  await page.waitForFunction(() => document.documentElement.lang === "en" || /^[\x00-\x7f\s]*$/.test(document.querySelector("#btn-lang")?.textContent || "") || document.body.innerText.includes("My World"), null, { timeout: 8000 }).catch(() => {});
  await openPanel(page);
  const legendFigure = await page.$eval('[data-mw-look-group="figure"]', (f) => f.textContent);
  check("[en] style labels are English", /Character style/.test(legendFigure) && /Bobblehead/.test(legendFigure), legendFigure.replace(/\s+/g, " "));
  const text = await page.$eval("#mw-look", (p) => p.innerText);
  check("[en] the look panel has no Chinese", !CJK.test(text), (text.match(CJK) || []).slice(0, 5).join(""));
  await page.setInputFiles("#mw-photo-input", { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }).catch(() => {});
  await page.waitForTimeout(600);
  const status = await page.$eval("#mw-look-status", (s) => s.textContent);
  check("[en] a refusal is in English", /Could not use this photo/.test(status) && !CJK.test(status), status);
  check("[en] no page errors", errors.length === 0, errors.join("|"));
  await page.close();
}

await browser.close();
console.log(out.join("\n"));
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
