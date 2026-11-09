// Deployed-site check, in a NORMAL cached browser profile (persistent context, cache on, no route blocking):
// 1) which HTML/CSS/JS versions are served and how they are cached, 2) a second visit really comes from the
// cache and still renders the current layout, 3) the Quick Play CTA is fully inside the first screen and not
// covered, 4) mode-card photos are not stretched, 5) card grid is sane. First-screen + per-tab screenshots.
// Usage: node scripts/qa/live-home.mjs [outDir] [url]
import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] || "/tmp/cls-qa/live";
const URL_ = process.argv[3] || "https://duzhiok.github.io/courtside-legends/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

async function run(width, height, tag) {
  const profile = mkdtempSync(join(tmpdir(), "cls-live-"));
  const ctx = await chromium.launchPersistentContext(profile, { executablePath: EXE, viewport: { width, height } });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const seen = new Map();
  page.on("response", (r) => {
    const u = new globalThis.URL(r.url());
    if (u.hostname === "duzhiok.github.io" && /\/(index\.html|css\/|js\/app\.js)/.test(u.pathname + "/")) {
      if (/(\/|\.html|\.css|app\.js)$/.test(u.pathname)) seen.set(u.pathname + u.search, { status: r.status(), fromCache: r.fromServiceWorker() ? "sw" : (r.request().timing().responseStart < 0 ? "cache" : "net"), cc: r.headers()["cache-control"] });
    }
  });
  const ready = () => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 90000 });

  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await ready();
  const versions = await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet][href*="?v="],script[src*="?v="]')].map((e) => (e.href || e.src).split("/").slice(-2).join("/")));
  check(`[${tag}] served asset versions`, versions.length > 3, versions.filter((v) => /home|style|app/.test(v)).join(" , "));
  const sw = await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.() ?? []).length);
  check(`[${tag}] no Service Worker is registered`, sw === 0, `registrations=${sw}`);

  // Second visit, ordinary navigation (not a hard reload): the cache is allowed to answer.
  seen.clear();
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await ready();
  const cacheInfo = [...seen.entries()].map(([k, v]) => `${k.split("/").slice(-1)[0]}:${v.fromCache}`).join(" ");
  check(`[${tag}] second visit is a normal cached load`, seen.size > 0, cacheInfo);

  // CTA on the first screen, fully inside the viewport and not covered by anything else.
  const cta = await page.evaluate(() => {
    const el = document.querySelector("#btn-play-now");
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh: innerHeight, vw: innerWidth, covered: !(hit === el || el.contains(hit)), inHero: !!el.closest(".home-banner") };
  });
  check(`[${tag}] Quick Play is inside the hero banner`, cta.inHero);
  check(`[${tag}] Quick Play is fully above the fold and uncovered`, cta.top >= 0 && cta.bottom <= cta.vh && cta.left >= 0 && cta.right <= cta.vw && !cta.covered, JSON.stringify(cta));
  await page.screenshot({ path: `${OUT}/${tag}-first-screen.png`, animations: "disabled" });

  // Legends gallery: My World only, 40 legends, the loop copy doubles the track.
  const gallery = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#mw-legends-gallery .lg-card")];
    const unique = new Set(cards.map((c) => c.dataset.legend)).size;
    const nav = [...document.querySelectorAll("#mw-legends-gallery .lg-nav")].map((b) => b.getAttribute("aria-label"));
    return { n: cards.length, unique, nav, visible: !!document.querySelector("#mw-legends-gallery")?.offsetParent };
  });
  check(`[${tag}] the legends gallery shows 40 legends (loop copy doubles the track)`, gallery.visible && gallery.n === 80 && gallery.unique === 40, JSON.stringify(gallery));
  check(`[${tag}] the gallery has prev/next navigation`, gallery.nav.length === 2, gallery.nav.join(" | "));

  for (const cat of ["players", "career", "custom"]) {
    await page.click(`.home-tab[data-category="${cat}"]`);
    await page.waitForTimeout(1500); // let lazy photos land
    const info = await page.evaluate((c) => {
      const panel = document.querySelector(`.home-category-panel[data-category="${c}"]`);
      const grid = panel.querySelector(".mode-grid");
      const gw = grid.getBoundingClientRect().width;
      const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      const cards = [...panel.querySelectorAll(".mode-card")].map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.querySelector("strong").textContent.trim(), w: Math.round(r.width), top: Math.round(r.top), h: Math.round(r.height) };
      });
      const byTop = new Map();
      for (const k of cards) byTop.set(k.top, [...(byTop.get(k.top) || []), k]);
      const lonely = [...byTop.values()].filter((row) => row.length === 1).map((row) => row[0]);
      const imgs = [...panel.querySelectorAll(".mode-card-photo img")].map((im) => {
        const r = im.getBoundingClientRect();
        const fit = getComputedStyle(im).objectFit;
        const ok = im.complete && im.naturalWidth > 0;
        // cover/none never distorts; a stretched image would be "fill" with a different aspect ratio
        const nat = ok ? im.naturalWidth / im.naturalHeight : null;
        const box = r.width / r.height;
        return { fit, ok, distorted: fit === "fill" && ok && Math.abs(nat - box) / nat > 0.05 };
      });
      return { gw: Math.round(gw), cols, cards, lonely, imgs };
    }, cat);
    check(`[${tag}/${cat}] grid has ${width <= 640 ? 1 : 2} column(s)`, info.cols === (width <= 640 ? 1 : 2), `cols=${info.cols}`);
    check(`[${tag}/${cat}] no card alone at partial width`, info.lonely.every((k) => k.w >= info.gw - 4), info.lonely.map((k) => `${k.name}:${k.w}/${info.gw}`).join(", "));
    check(`[${tag}/${cat}] no sliver-narrow card`, info.cards.every((k) => k.w >= Math.min(260, info.gw / 2 - 20)), info.cards.map((k) => k.w).join("/"));
    const badImgs = info.imgs.filter((i) => i.distorted || (i.fit !== "cover" && i.fit !== "none"));
    check(`[${tag}/${cat}] photos use object-fit:cover (never stretched)`, badImgs.length === 0, `${info.imgs.length} photos, loaded=${info.imgs.filter((i) => i.ok).length}, fits=${[...new Set(info.imgs.map((i) => i.fit))].join(",") || "n/a"}`);
    check(`[${tag}/${cat}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `${OUT}/${tag}-${cat}.png`, fullPage: true, animations: "disabled" });
  }
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}
await run(1280, 800, "desktop");
await run(1440, 900, "desktop1440");
await run(390, 844, "mobile");
const failed = report.filter((r) => r.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
