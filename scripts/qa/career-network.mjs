// Browser QA: Basketball Career Network (workstream G). Verifies the three
// playable slices (Scout / Video Analyst / Analytics) plus the Career
// Opportunity board, via the dev entries (?scout=1, ?film=1, ?analytics=1,
// ?network=1), on desktop + mobile. The film slice runs a real seeded
// game in the browser, so it takes a few seconds per run.
// Usage: node scripts/qa/career-network.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/career-network";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function openSlice(page, param) {
  await page.goto(`${BASE}?${param}=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-network")?.classList.contains("active"), null, { timeout: 60000 });
  await page.waitForTimeout(500);
}

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());

  // Scout slice: 5 prospects, recommend one, reveal after all 5 decided.
  await openSlice(page, "scout");
  const prospects = await page.$$eval(".nw-card", (els) => els.length);
  check(`[${tag}] scout: 5 prospects shown`, prospects === 5, `got ${prospects}`);
  await page.screenshot({ path: `${OUT}/scout-${tag}.png` });
  const recBtns = await page.$$("[data-scout-rec='1']");
  for (const btn of recBtns) await btn.click();
  await page.waitForTimeout(300);
  const revealEnabled = await page.$eval("#btn-scout-reveal", (el) => !el.disabled);
  check(`[${tag}] scout: reveal enables after all 5 decisions`, revealEnabled);
  await page.click("#btn-scout-reveal");
  await page.waitForTimeout(300);
  const reveal = await page.$eval("#scout-result", (el) => el.textContent);
  check(`[${tag}] scout: 3-year reveal shows tiers and a total`, /未来巨星|首发球员|轮换球员|未能立足/.test(reveal) && /球探评分/.test(reveal), reveal.slice(0, 120));
  await page.screenshot({ path: `${OUT}/scout-reveal-${tag}.png` });

  // Film slice: a real game runs, three options appear, grading works.
  await openSlice(page, "film");
  await page.waitForSelector(".nw-challenge", { timeout: 60000 });
  const filmOpts = await page.$$eval("[data-film-opt]", (els) => els.length);
  check(`[${tag}] film: 3 options shown`, filmOpts === 3, `got ${filmOpts}`);
  await page.screenshot({ path: `${OUT}/film-${tag}.png` });
  await page.click("[data-film-opt]");
  await page.waitForTimeout(300);
  const filmResult = await page.$eval("#film-result", (el) => el.textContent);
  check(`[${tag}] film: grading explains the call`, /判断正确|判断有误/.test(filmResult), filmResult.slice(0, 120));

  // Analytics slice: 3 candidates, grading works, value board renders.
  await openSlice(page, "analytics");
  const anOpts = await page.$$eval("[data-analytics-opt]", (els) => els.length);
  check(`[${tag}] analytics: 3 candidates shown`, anOpts === 3, `got ${anOpts}`);
  await page.click("[data-analytics-opt]");
  await page.waitForTimeout(300);
  const anResult = await page.$eval("#analytics-result", (el) => el.textContent);
  check(`[${tag}] analytics: grading explains the call`, /判断正确|判断有误/.test(anResult), anResult.slice(0, 120));
  await page.screenshot({ path: `${OUT}/analytics-${tag}.png` });

  // Opportunity board: profile + offers render, ineligible offers show why.
  await openSlice(page, "network");
  const board = await page.$eval("#network-body", (el) => el.textContent);
  check(`[${tag}] network: profile and board render`, /我的职业/.test(board) && /职业机会/.test(board));
  check(`[${tag}] network: ineligible offers explain themselves`, /未达标/.test(board));
  await page.screenshot({ path: `${OUT}/network-${tag}.png` });

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
const failed = report.filter((r) => r.startsWith("FAIL")).length;
process.exit(failed ? 1 : 0);
