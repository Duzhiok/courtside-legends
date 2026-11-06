// Small page helpers shared by the career QA scripts (result-screen and layout checks).
export const CJK = /[\u4e00-\u9fff]/;

export const homeActive = (page) => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
export const text = (page, selector) => page.$eval(selector, (el) => el.textContent.replace(/\s+/g, " ").trim());
export const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
/** Every "8 分" / "2 板" segment is one line box: a wrap between a figure and its unit leaves an orphan like "1 / 助". */
export const unbroken = (page) => page.$$eval("#result-rewards .pg-nowrap", (els) => els.length > 0 && els.every((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size === 1));
export const onResult = (page) => page.waitForSelector("#screen-result.active", { timeout: 20000 });
/** .screen.active fades in over 250ms; a screenshot taken inside it comes out washed-out grey. */
export const settled = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 5000 }).catch(() => {});
/**
 * A full-page capture races image decoding: rows below the fold are lazy, and an undecoded <img> shows its CSS
 * placeholder (the dark-green "empty avatar" that once looked like a bug). Force every image to load and wait
 * for it to decode -- at most 2.5s each, so one dead hotlink cannot hang the run.
 */
export const imagesReady = (page) => page.evaluate(() => Promise.all([...document.images].map((img) => {
  img.loading = "eager";
  return Promise.race([img.decode().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2500))]);
}))).catch(() => {});
export const shoot = async (page, path) => { await settled(page); await imagesReady(page); await page.screenshot({ path, fullPage: true }); };
/** Who is sticking out past the viewport: the first few offenders, so an overflow failure names its cause. */
export const overflowers = (page) => page.evaluate(() => [...document.querySelectorAll("body *")]
  .filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > window.innerWidth + 1)
  .slice(0, 4)
  .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} right=${Math.round(el.getBoundingClientRect().right)} "${el.textContent.replace(/\s+/g, " ").trim().slice(0, 40)}"`));

/**
 * WCAG contrast of every element matching one of `selectors` inside `root`, against the colour it really
 * sits on (the nearest non-transparent ancestor background). Returns the ones below `min`, as "selector 3.21".
 */
export const lowContrast = (page, root, selectors, min = 4.5) => page.evaluate(([rootSel, sels, floor]) => {
  const rgb = (css) => css.match(/[\d.]+/g).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length < 4 || c[3] > 0.9) return c.slice(0, 3); } return [255, 255, 255]; };
  const ratio = (el) => { const a = lum(rgb(getComputedStyle(el).color).slice(0, 3)); const b = lum(bgOf(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const box = document.querySelector(rootSel);
  return sels.flatMap((sel) => [...box.querySelectorAll(sel)].map((el) => [sel, ratio(el)])).filter(([, r]) => r < floor).map(([sel, r]) => `${sel} ${r.toFixed(2)}`);
}, [root, selectors, min]);

/**
 * WCAG contrast of EVERY visible piece of text inside `root` -- no selector list to forget an element from.
 * (A hand-written list once missed the player names, the title and the big numbers of the rotation board while
 * the check kept saying "AA".) Backgrounds are composited layer by layer, so translucent panels are measured
 * against what is really behind them; text with 24px+ (or 18.66px+ bold) only needs 3:1. Disabled controls are
 * exempt, like in WCAG. `under` is the colour assumed behind everything that has no opaque background of its own
 * (white by default; the season hub is a dark panel, so pass SEASON_HUB_BASE there). Backgrounds drawn as
 * images/gradients are not measured: look at the screenshot for those.
 * Returns one line per offending element kind: "tag.class xN worst 1.13 \"sample\"".
 */
export const textContrast = (page, root, { min = 4.5, under = [255, 255, 255] } = {}) => page.evaluate(([rootSel, floor, base0]) => {
  const parse = (css) => { const m = css.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) layers.push(c); if (c.a >= 1) break; }
    return layers.reverse().reduce((base, c) => over(c, base), { r: base0[0], g: base0[1], b: base0[2], a: 1 });
  };
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const found = new Map();
  for (const el of document.querySelector(rootSel).querySelectorAll("*")) {
    if (!hasOwnText(el) || !el.getClientRects().length || el.closest("[disabled], :disabled, [aria-hidden='true']")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    const bg = backdrop(el);
    const ink = over(parse(cs.color), bg);
    const [hi, lo] = [lum(ink), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const px = parseFloat(cs.fontSize);
    const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio >= (large ? 3 : floor)) continue;
    const key = `${el.tagName.toLowerCase()}.${String(el.className).split(" ").filter(Boolean).slice(0, 2).join(".")}`;
    const seen = found.get(key) || { n: 0, worst: 99, sample: "" };
    seen.n += 1;
    if (ratio < seen.worst) { seen.worst = ratio; seen.sample = el.textContent.trim().replace(/\s+/g, " ").slice(0, 24); }
    found.set(key, seen);
  }
  return [...found].map(([key, v]) => `${key} x${v.n} worst ${v.worst.toFixed(2)} "${v.sample}"`);
}, [root, min, under]);
/** The dark stage behind the season hub tabs (#season-hub-panel's gradient, sampled at its middle). */
export const SEASON_HUB_BASE = [14, 24, 20];
// Guest-first home: the card/draw/switch buttons sit in the collapsed My Profile panel, so open it first.
export const clickProfile = async (page, selector) => {
  if (await page.$eval("#profile-panel", (el) => el.hidden).catch(() => false)) await page.click("#btn-profile-toggle");
  await page.click(selector);
};
// Single Season is now a career-length choice inside the Franchise setup page (no home card of its own).
export const openSingleSeason = async (page) => {
  await page.click('.mode-card[data-mode="franchise"]');
  await page.click("#btn-career-length-season");
};
