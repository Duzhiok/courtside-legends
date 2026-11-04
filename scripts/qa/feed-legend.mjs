// Browser QA for B18 — the play-feed legend card (header + big avatar + title + sentence), the
// clutch-block / 10-0-run triggers, and the muted sub-line on plain scoring rows.
//
// Part A renders FIXED fixture events through the REAL feedRowHtml + REAL photoImg + the REAL
// stylesheet in a real page: deterministic, no simulated game, no live network (every non-local
// host is blocked, so every avatar goes through photoImg's data-URI fallback).
// Part B starts a real game and only checks that the live wiring (pushFeed -> run tracker ->
// feedRowHtml) throws nothing and that any legend card that shows up has the full structure.
// Usage: node scripts/qa/feed-legend.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, noOverflow, settled, imagesReady, lowContrast } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/feed-legend";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function openPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  return { page, errors };
}

/** Fixed fixtures -> real rows in a real `.play-feed` (real stylesheet), one per language. */
async function renderFixtures(page, lang) {
  await page.evaluate(async (language) => {
    const { feedRowHtml } = await import("/js/ui/feedView.js");
    const { photoImg } = await import("/js/data/photo.js");
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const colors = { home: { color: "#FDB927", code: "LAL", text: "#FDB927" }, away: { color: "#007A33", code: "BOS", text: "#4ade80" } };
    const star = { id: "p1", name: "Michael Jordan", team: "CHI", bref: "jordami01" };
    const big = { id: "p2", name: "Rudy Gobert", team: "MIN", bref: "goberru01" };
    const av = (p) => photoImg(p, "headshot feed-avatar");
    const shot = (pts) => ({ shot: { shooterId: "p1", made: true, pts } });
    const rows = [
      [{ type: "score", text: "Michael Jordan hits a jumper", possession: "home", quarter: 2, clock: 301, score: { home: 40, away: 38 }, meta: shot(2) }, star],
      [{ type: "score", text: "Michael Jordan drains a three", possession: "away", quarter: 2, clock: 280, score: { home: 40, away: 41 }, meta: shot(3) }, star],
      [{ type: "miss", text: "Rudy Gobert blocks Paul!", possession: "home", quarter: 3, clock: 120, score: { home: 70, away: 70 }, meta: { actorId: "p2", block: { blockedName: "Paul", side: "away" } } }, big],
      [{ type: "score", text: "Michael Jordan hits it 100-99", possession: "home", quarter: 4, clock: 2, score: { home: 100, away: 99 }, meta: shot(3) }, star],
      [{ type: "miss", text: "Rudy Gobert blocks Paul!", possession: "home", quarter: 4, clock: 11, score: { home: 100, away: 101 }, meta: { actorId: "p2", block: { blockedName: "Paul", side: "away" } } }, big],
      [{ type: "score", text: "Michael Jordan scores", possession: "home", quarter: 3, clock: 90, score: { home: 60, away: 48 }, meta: shot(2) }, star, { side: "home", points: 12, milestone: true }],
    ];
    document.getElementById("qa-feed")?.remove();
    const box = document.createElement("div");
    box.id = "qa-feed";
    box.className = "play-feed";
    box.style.cssText = "position:fixed;top:12px;left:12px;z-index:99999;width:min(460px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#0b1a13;padding:12px;border-radius:12px";
    for (const [ev, actor, run] of rows) {
      const r = feedRowHtml(ev, { colors, actorName: actor.name, avatarHtml: av(actor), escFn: esc, lang: language, run: run || null });
      const div = document.createElement("div");
      div.className = r.className;
      if (r.borderColor) div.style.borderLeftColor = r.borderColor;
      if (r.tint) div.style.setProperty("--tint", r.tint);
      div.innerHTML = r.html;
      box.append(div);
    }
    document.body.append(box);
  }, lang);
  await settled(page);
  await imagesReady(page);
}

async function partA(width, height, tag) {
  const { page, errors } = await openPage(width, height);
  for (const lang of ["en", "zh"]) {
    await renderFixtures(page, lang);
    const t = `${tag}/${lang}`;
    const cards = await page.$$eval("#qa-feed .tier-legend", (els) => els.map((el) => {
      const r = (sel) => el.querySelector(sel);
      const av = r(".feed-legend-avatar .feed-avatar")?.getBoundingClientRect();
      const title = r(".feed-legend-title");
      const sub = r(".feed-legend-sub");
      const box = el.getBoundingClientRect();
      const host = document.getElementById("qa-feed").getBoundingClientRect();
      return {
        flame: !!r(".feed-flame"),
        head: r(".feed-legend-label")?.textContent || "",
        chip: !!r(".feed-chip-team"),
        avW: av ? Math.round(av.width) : 0,
        avH: av ? Math.round(av.height) : 0,
        title: title?.textContent || "",
        titleWeight: title ? Number(getComputedStyle(title).fontWeight) : 0,
        titlePx: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        subPx: sub ? parseFloat(getComputedStyle(sub).fontSize) : 0,
        sub: sub?.textContent || "",
        opacity: Number(getComputedStyle(el).opacity),
        inside: box.left >= host.left - 1 && box.right <= host.right + 1,
        height: Math.round(box.height),
      };
    }));
    // The same blocker (Gobert, a BOS player) appears on an important-tier row AND a legend card:
    // both must carry the BLOCKER's team chip, never the blocked team's.
    const blockerChips = await page.$$eval("#qa-feed .event", (els) =>
      els.filter((el) => /Gobert/.test(el.textContent)).map((el) => el.querySelector(".feed-chip-team")?.textContent || ""));
    check(`[${t}] a block row shows the blocker's team chip on both the important row and the legend card`, blockerChips.length === 2 && blockerChips.every((c) => c === "BOS"), blockerChips.join(" | "));
    check(`[${t}] 3 legend cards render (buzzer, clutch block, 12-0 run)`, cards.length === 3, `${cards.length} (the Q3 block is only important, as designed)`);
    check(`[${t}] every card: flame icon + "HIGHLIGHT · side" header + team chip`, cards.every((c) => c.flame && /^HIGHLIGHT · \S+/.test(c.head) && c.chip), cards.map((c) => c.head).join(" | "));
    check(`[${t}] every card: big avatar (≥36px, square)`, cards.every((c) => c.avW >= 36 && c.avW === c.avH), cards.map((c) => `${c.avW}x${c.avH}`).join(" "));
    check(`[${t}] every card: bold title larger than the sentence, sentence non-empty`, cards.every((c) => c.titleWeight >= 700 && c.titlePx > c.subPx && c.sub.length > 8), cards.map((c) => c.title).join(" | "));
    check(`[${t}] every card fully visible after its entrance animation and inside the feed`, cards.every((c) => c.opacity === 1 && c.inside));
    if (lang === "en") check(`[${t}] English cards contain no Chinese`, cards.every((c) => !CJK.test(c.title + c.sub + c.head)));
    if (lang === "zh") check(`[${t}] titles are the Chinese headlines`, ["压哨反超！", "关键封盖！", "12-0 攻击波！"].every((x) => cards.some((c) => c.title === x)), cards.map((c) => c.title).join(" | "));

    const plain = await page.$$eval("#qa-feed .event.tm:not(.tier-legend):not(.tier-important)", (els) => els.map((el) => {
      const sub = el.querySelector(".feed-sub");
      const pav = el.querySelector(".feed-avatar")?.getBoundingClientRect();
      return { sub: sub?.textContent || "", subPx: sub ? parseFloat(getComputedStyle(sub).fontSize) : 0, textPx: parseFloat(getComputedStyle(el.querySelector(".feed-text")).fontSize), h: Math.round(el.getBoundingClientRect().height), avW: pav ? Math.round(pav.width) : 0 };
    }));
    check(`[${t}] plain scoring rows carry the muted sub-line, smaller than the body text`, plain.length >= 2 && plain.every((p) => p.sub && p.subPx < p.textPx), plain.map((p) => p.sub).join(" | "));
    // Hierarchy = size + weight + avatar, not just height: how tall a PLAIN row gets depends on whether a long
    // name wraps its text, which says nothing about the card. So compare like with like (the shortest of each).
    const minCard = Math.min(...cards.map((c) => c.height));
    const minPlain = Math.min(...plain.map((p) => p.h));
    check(`[${t}] visual hierarchy: even the shortest legend card is clearly taller than a single-line plain row`, minCard > minPlain * 1.3, `card≥${minCard}px vs plain≥${minPlain}px (tallest plain row ${Math.max(...plain.map((p) => p.h))}px: wrapped text)`);
    check(`[${t}] visual hierarchy: legend avatar ≥ 2x the plain-row avatar, legend title larger than plain body text`, Math.min(...cards.map((c) => c.avW)) >= 2 * Math.max(...plain.map((p) => p.avW)) && Math.min(...cards.map((c) => c.titlePx)) > Math.max(...plain.map((p) => p.textPx)), `avatar ${cards[0].avW}px vs ${plain[0].avW}px; title ${cards[0].titlePx}px vs text ${plain[0].textPx}px`);

    const low = await lowContrast(page, "#qa-feed", [".feed-legend-title", ".feed-legend-sub", ".feed-legend-label", ".feed-sub", ".feed-meta"]);
    check(`[${t}] legend/sub text contrast ≥ 4.5:1 against the feed background`, low.length === 0, low.join(", "));
    check(`[${t}] no horizontal overflow`, await noOverflow(page));
    await settled(page);
    await (await page.$("#qa-feed")).screenshot({ path: `${OUT}/${tag}-${lang}.png` });
  }
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

async function partB(width, height, tag) {
  const { page, errors } = await openPage(width, height);
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="quick"]').click());
  await page.waitForSelector("#btn-setup-confirm", { state: "visible", timeout: 20000 });
  if (await page.$eval("#btn-setup-confirm", (b) => b.disabled)) {
    for (const p of (await page.$$("#screen-setup [data-pick]")).slice(0, 5)) await p.click();
  }
  await page.waitForFunction(() => !document.querySelector("#btn-setup-confirm").disabled, null, { timeout: 10000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#court-ball", { timeout: 20000 });
  await page.click("#btn-speed").catch(() => {});
  await page.click("#btn-speed").catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll("#play-feed .event.tm").length >= 12, null, { timeout: 30000 });
  const live = await page.$$eval("#play-feed .event.tm", (els) => ({
    rows: els.length,
    subs: els.filter((e) => e.querySelector(".feed-main .feed-sub")).length,
    legendBroken: els.filter((e) => e.classList.contains("tier-legend") && !(e.querySelector(".feed-legend-title") && e.querySelector(".feed-legend-sub") && e.querySelector(".feed-flame"))).length,
    legends: els.filter((e) => e.classList.contains("tier-legend")).length,
  }));
  check(`[${tag}/live] live feed uses the new rows: scoring rows have the sub-line`, live.subs >= 1, `${live.subs}/${live.rows} rows`);
  check(`[${tag}/live] any legend card that appeared in a real game has the full structure`, live.legendBroken === 0, `${live.legends} legend card(s) seen`);
  check(`[${tag}/live] no page errors while the real sim feeds the tracker`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await partA(1280, 800, "desktop");
await partA(390, 844, "mobile");
await partB(1280, 800, "desktop");
await browser.close();
console.log(report.join("\n"));
const failed = report.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
