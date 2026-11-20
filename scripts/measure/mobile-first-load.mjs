/* global window, performance, PerformanceObserver -- the functions passed to page.evaluate() / addInitScript() run inside the browser page */
/**
 * First-load measurement on an emulated phone (390x844, 4x CPU slowdown, 1.6 Mbps / 150 ms RTT by default (Lighthouse "Slow 4G"; --mbps for a faster link), cold cache).
 * Measurement only. It serves the repo with gzip (what any real host does) so the byte counts are realistic, then reports, per run
 * and as the median of N runs: requests and bytes by type, FCP, LCP, DOMContentLoaded, load, total blocking time, and the moment the
 * home screen is actually usable (the Play Now button is visible and clickable).
 *
 * "Usable" = the app has really booted (window.__rosterBootOk, set once the roster is loaded), not merely that the static HTML shows a button.
 * The host is served over HTTP/2 + gzip (what a real host does); --h1 serves HTTP/1.1 instead (6 connections per origin, much worse for 300+ files).
 *
 * Usage: node scripts/measure/mobile-first-load.mjs [runs=3] [--h1] [--mbps 1.6] [--root dir] [--out file.json] [--compare before.json]
 */
import { chromium } from "playwright-core";
import http from "node:http";
import http2 from "node:http2";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import zlib from "node:zlib";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ROOT = flag("--root") ? flag("--root").replace(/\/?$/, "/") : new URL("../../", import.meta.url).pathname;
const MBPS = Number(flag("--mbps") || 1.6);
const RUNS = Number(args.find((a) => /^\d+$/.test(a)) || 3);
const OUT = flag("--out");
const H1 = args.includes("--h1");
const BEFORE = flag("--compare") ? JSON.parse(readFileSync(flag("--compare"), "utf8")) : null;
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".webp": "image/webp", ".mp3": "audio/mpeg" };
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);

const handler = (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, path === "/" ? "index.html" : path);
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  const ext = extname(file);
  const body = readFileSync(file);
  const headers = { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": "no-store" };
  if (COMPRESSIBLE.has(ext) && /gzip/.test(req.headers["accept-encoding"] || "")) {
    headers["content-encoding"] = "gzip";
    res.writeHead(200, headers).end(zlib.gzipSync(body, { level: 6 }));
  } else res.writeHead(200, headers).end(body);
};
let server, SCHEME = "http";
if (H1) server = http.createServer(handler);
else {
  const dir = mkdtempSync(join(tmpdir(), "perf-cert-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
  server = http2.createSecureServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")), allowHTTP1: true }, handler);
  SCHEME = "https";
}
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `${SCHEME}://127.0.0.1:${server.address().port}/`;

async function once(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (MBPS * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const reqs = new Map();
  cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { url: e.request.url, start: e.timestamp, type: e.type }));
  cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.end = e.timestamp; } });
  await page.addInitScript(() => {
    window.__m = { lt: [], fcp: null, lcp: null };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__m.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((l) => { const es = l.getEntries(); window.__m.lcp = es[es.length - 1].startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: "commit" });
  await page.waitForFunction(() => window.__rosterBootOk === true, null, { timeout: 180000, polling: 100 });
  const usable = Date.now() - t0;
  await page.waitForLoadState("load", { timeout: 120000 });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = window.__m.fcp, lt = window.__m.lt;
    return { fcp, lcp: window.__m.lcp, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, tbt: lt.reduce((s, [st, d]) => (fcp != null && st >= fcp ? s + Math.max(0, d - 50) : s), 0), longTasks: lt.length };
  });
  const byType = {};
  let total = 0, count = 0;
  for (const r of reqs.values()) {
    if (r.bytes == null) continue;
    const k = r.type || "Other";
    byType[k] = byType[k] || { n: 0, kb: 0 };
    byType[k].n += 1; byType[k].kb += r.bytes / 1024; total += r.bytes; count += 1;
  }
  const big = [...reqs.values()].filter((r) => r.bytes != null).sort((a, b) => b.bytes - a.bytes).slice(0, 6).map((r) => ({ url: r.url.replace(BASE, ""), kb: Math.round(r.bytes / 1024), endMs: Math.round((r.end - [...reqs.values()][0].start) * 1000) }));
  const t00 = [...reqs.values()][0].start;
  const ms = (x) => Math.round((x - t00) * 1000);
  const scripts = [...reqs.values()].filter((r) => r.type === "Script" && r.end);
  const roster = [...reqs.values()].find((r) => /roster\.json/.test(r.url));
  const timeline = { scripts: scripts.length, scriptsFirstStart: ms(Math.min(...scripts.map((r) => r.start))), scriptsLastEnd: ms(Math.max(...scripts.map((r) => r.end))), rosterStart: roster ? ms(roster.start) : null, rosterEnd: roster?.end ? ms(roster.end) : null };
  await ctx.close();
  return { ...m, timeline, usable, requests: count, totalKB: total / 1024, byType, big };
}

const browser = await chromium.launch({ executablePath: EXE });
const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await once(browser));
await browser.close();
server.close();
const med = (k) => [...runs].map((r) => r[k]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
const rep = { runs: RUNS, usable: med("usable"), fcp: med("fcp"), lcp: med("lcp"), dcl: med("dcl"), load: med("load"), tbt: med("tbt"), requests: med("requests"), totalKB: med("totalKB"), timeline: runs[0].timeline, byType: runs[0].byType, big: runs[0].big };
const f = (n) => (n == null ? "n/a" : Math.round(n));
console.log(`median of ${RUNS} (390x844, 4x CPU, ${MBPS} Mbps / 150 ms, cold cache, gzip, ${H1 ? "HTTP/1.1" : "HTTP/2"}):`);
console.log(`  usable (app booted) ${f(rep.usable)} ms | FCP ${f(rep.fcp)} | LCP ${f(rep.lcp)} | DCL ${f(rep.dcl)} | load ${f(rep.load)} | TBT ${f(rep.tbt)} ms`);
console.log(`  ${f(rep.requests)} requests, ${f(rep.totalKB)} KB transferred`);
for (const [k, v] of Object.entries(rep.byType).sort((a, b) => b[1].kb - a[1].kb)) console.log(`    ${k.padEnd(12)} ${String(v.n).padStart(3)} req  ${f(v.kb).toString().padStart(6)} KB`);
console.log("  timeline (ms):", JSON.stringify(rep.timeline));
console.log("  biggest:", rep.big.map((b) => `${b.url} ${b.kb}KB@${b.endMs}ms`).join(" | "));
if (BEFORE) for (const k of ["usable", "fcp", "lcp", "load", "tbt", "requests", "totalKB"]) console.log(`  ${k.padEnd(9)} ${f(BEFORE[k])} -> ${f(rep[k])}`);
if (OUT) writeFileSync(OUT, JSON.stringify(rep));
