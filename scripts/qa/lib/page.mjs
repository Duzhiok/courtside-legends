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
export const shoot = async (page, path) => { await settled(page); await page.screenshot({ path, fullPage: true }); };
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
