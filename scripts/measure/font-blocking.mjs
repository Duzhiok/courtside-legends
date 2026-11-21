// B77: does the web-font stylesheet hold back first paint? Loads the page with the Google Fonts CSS delayed by DELAY ms (a slow or
// unreachable font host) and reads first-contentful-paint, once with the old render-blocking <link> and once with the current one.
// Usage: node scripts/measure/font-blocking.mjs [baseUrl] [delayMs=1500] [runs=3]
import { chromium } from "playwright-core";

const BASE = process.argv[2] || "http://127.0.0.1:5418/";
const DELAY = Number(process.argv[3] || 1500);
const RUNS = Number(process.argv[4] || 3);
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OLD = '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" />';

async function fcp(browser, variant) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("https://fonts.googleapis.com/**", async (route) => {
    await new Promise((r) => setTimeout(r, DELAY));
    await route.fulfill({ status: 200, contentType: "text/css", body: "/* stub */" });
  });
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  if (variant === "blocking") {
    await page.route(`${BASE}index.html*`, async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<link id="font-css"[^>]*>/, OLD);
      await route.fulfill({ response: res, body });
    });
  }
  await page.goto(`${BASE}index.html`, { waitUntil: "domcontentloaded" });
  const t = await page.evaluate(() => new Promise((resolve) => {
    new PerformanceObserver((list) => { const e = list.getEntriesByName("first-contentful-paint")[0]; if (e) resolve(e.startTime); }).observe({ type: "paint", buffered: true });
  }));
  await page.close();
  return t;
}

const browser = await chromium.launch({ executablePath: EXE });
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const res = { blocking: [], current: [] };
for (let i = 0; i < RUNS; i++) for (const v of ["blocking", "current"]) res[v].push(Math.round(await fcp(browser, v)));
console.log(`font CSS delayed ${DELAY} ms, ${RUNS} runs each (FCP ms)`);
console.log("old blocking link:", res.blocking.join(", "), "median", med(res.blocking));
console.log("current (media=print):", res.current.join(", "), "median", med(res.current));
await browser.close();
