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
