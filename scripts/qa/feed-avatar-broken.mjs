// Browser check: a play-feed headshot that fails to load must stay a small round chip, never a stretched oval that prints the
// player's name (Chrome renders a broken <img alt> as an INLINE box and ignores width/height unless display is inline-block).
// Builds the real row markup (feedRowHtml + photoImg) around a headshot that cannot load, in the real page and its real CSS.
// Usage: node scripts/qa/feed-avatar-broken.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/feed-avatar";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, tag] of [[1440, "desktop"], [390, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height: 700 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  const result = await page.evaluate(async () => {
    const { photoImg } = await import("/js/data/photo.js");
    const feed = document.createElement("div");
    feed.className = "play-feed";
    feed.style.cssText = "position:fixed;left:8px;top:8px;width:360px;z-index:99999;background:#13281d;padding:6px";
    // The same <img> photoImg() makes, pointed at a port nothing listens on, with no fallback marker: it can only fail.
    const player = { name: "Bill Robinzine", bref: "nobody99", team: "KCK", season: 1977 };
    const good = photoImg(player, "headshot feed-avatar").replace(/src="[^"]*"/, 'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"');
    const broken = photoImg(player, "headshot feed-avatar").replace(/src="[^"]*"/, 'src="http://127.0.0.1:9/never.jpg"').replace(/ data-fb="[^"]*"/, "");
    feed.innerHTML = `<div class="event tm"><span class="feed-text">Chris Bosh ${good} grabs the board</span></div>` +
      `<div class="event tm"><span class="feed-text">Bill Robinzine ${broken} 打Maurice Cheeks 强干扰</span></div>`;
    document.body.appendChild(feed);
    await new Promise((r) => setTimeout(r, 1500));
    const rect = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    const [g, b] = feed.querySelectorAll("img");
    return { good: rect(g), broken: rect(b), brokenDisplay: getComputedStyle(b).display, brokenFont: getComputedStyle(b).fontSize, complete: b.complete && b.naturalWidth === 0 };
  });
  console.log(`[${tag}]`, JSON.stringify(result));
  check(`[${tag}] the headshot that failed to load is really broken (the test is not vacuous)`, result.complete);
  check(`[${tag}] a loaded headshot is the small chip`, result.good.w <= 20 && result.good.h <= 20, `${result.good.w}x${result.good.h}`);
  check(`[${tag}] a BROKEN headshot is the same small chip, not a stretched oval printing the name`, result.broken.w <= 20 && result.broken.h <= 20, `${result.broken.w}x${result.broken.h}`);
  await page.screenshot({ path: `${OUT}/${tag}.png`, clip: { x: 0, y: 0, width: Math.min(width, 400), height: 110 } });
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
