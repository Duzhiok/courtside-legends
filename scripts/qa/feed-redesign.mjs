// Browser QA for the play-feed redesign (R134): one team-code chip per row (not a border +
// background tint + per-team text colour + "主/客" label), the old #feed-legend bar removed
// (redundant with the always-visible scoreboard header), and a player avatar spliced in right
// after the actor's name for every event where the sim can resolve one.
// Usage: node scripts/qa/feed-redesign.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/feed-redesign";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Avatars can hotlink real Wikimedia/basketball-reference photos (js/data/photo.js) -- live
  // network in a sandboxed headless browser is exactly the kind of flake season-resume.mjs
  // already solved this way. Blocking every non-localhost host forces EVERY avatar through
  // photoImg()'s onerror fallback (a local data: URI, never a network request), which is what
  // this QA actually needs to check: not "did Wikimedia respond today", but "does the fallback
  // this redesign depends on actually render something when the real photo is unavailable".
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.evaluate(() => document.querySelector('.mode-card[data-mode="quick"]').click());
  await page.waitForSelector("#btn-setup-confirm", { state: "visible", timeout: 20000 });
  if (await page.$eval("#btn-setup-confirm", (b) => b.disabled)) {
    const picks = await page.$$("#screen-setup .player-card[data-pick], #screen-setup [data-pick]");
    for (const p of picks.slice(0, 5)) await p.click();
  }
  await page.waitForFunction(() => !document.querySelector("#btn-setup-confirm").disabled, null, { timeout: 10000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#court-ball", { timeout: 20000 });
  await page.click("#btn-speed").catch(() => {});
  await page.click("#btn-speed").catch(() => {});

  // Let a real quarter's worth of events pile up.
  await page.waitForFunction(
    () => document.querySelectorAll("#play-feed .event.tm").length >= 8,
    null,
    { timeout: 25000 }
  );
  await page.waitForTimeout(400); // let the last row's entrance animation settle before reading it

  // photoImg() marks every avatar loading="lazy" (sane for a long-lived feed scrolled by a
  // real player). On the narrow mobile viewport #play-feed sits below the fold here, so those
  // images haven't started fetching yet -- scrolling into view BEFORE any check that reads
  // naturalWidth is what actually makes them start, not a retry or a longer timeout.
  await page.$eval("#play-feed", (el) => el.scrollIntoView({ block: "center" }));

  check(`[${tag}] the old legend bar is gone (redundant with the scoreboard header)`, !(await page.$("#feed-legend")));

  const rows = await page.$$eval("#play-feed .event.tm", (els) =>
    els.map((el) => ({
      html: el.innerHTML,
      hasChip: !!el.querySelector(".feed-chip-team"),
      chipText: el.querySelector(".feed-chip-team")?.textContent || "",
      chipBg: el.querySelector(".feed-chip-team") ? getComputedStyle(el.querySelector(".feed-chip-team")).backgroundColor : "",
      borderColor: getComputedStyle(el).borderLeftColor,
      textColor: el.querySelector(".feed-text") ? getComputedStyle(el.querySelector(".feed-text")).color : "",
      hasAvatar: !!el.querySelector(".feed-avatar"),
    }))
  );
  check(`[${tag}] every team row carries a team-code chip`, rows.every((r) => r.hasChip), `${rows.filter((r) => r.hasChip).length}/${rows.length}`);
  check(`[${tag}] chip text is a real team code, not an empty/placeholder blob`, rows.every((r) => r.chipText.length >= 1 && r.chipText.length <= 4), rows.map((r) => r.chipText).join(","));

  const uniqueTextColors = new Set(rows.map((r) => r.textColor));
  check(`[${tag}] body text is ONE consistent colour across rows, not tinted per team`, uniqueTextColors.size === 1, [...uniqueTextColors].join(" | "));

  const uniqueChipColors = new Set(rows.map((r) => r.chipBg));
  check(`[${tag}] at least two distinct chip colours show up (both teams appear)`, uniqueChipColors.size >= 2, [...uniqueChipColors].join(" | "));

  const chipTexts = new Set(rows.map((r) => r.chipText));
  check(`[${tag}] home and away chips never print the SAME code (ad-hoc-squad NBA/NBA collision)`, chipTexts.size >= 2, [...chipTexts].join(" | "));

  const withAvatar = rows.filter((r) => r.hasAvatar).length;
  check(`[${tag}] most rows resolve an actor and show their avatar`, withAvatar >= rows.length * 0.6, `${withAvatar}/${rows.length}`);

  // An avatar must sit INSIDE the feed-text span, right after a name — not before everything
  // or dangling outside the row's text.
  const avatarPlacement = await page.$$eval("#play-feed .event.tm .feed-text", (els) =>
    els.map((el) => {
      const img = el.querySelector(".feed-avatar");
      if (!img) return null;
      const idx = Array.from(el.childNodes).findIndex((n) => n === img);
      // true when there's a real text node with content before the image in the same span
      const before = Array.from(el.childNodes).slice(0, idx).map((n) => n.textContent || "").join("");
      return before.trim().length > 0;
    }).filter((v) => v !== null)
  );
  check(`[${tag}] avatars sit AFTER some name text, not glued to the front of the line`, avatarPlacement.length > 0 && avatarPlacement.every(Boolean), `${avatarPlacement.filter(Boolean).length}/${avatarPlacement.length}`);

  // One atomic read, not two: the sim keeps running under this script (speed x3, prepending
  // new rows the whole time), so a count taken from a querySelectorAll() here and a count taken
  // from a SEPARATE querySelectorAll() moments later can legitimately describe two different,
  // differently-sized DOM populations (a live "broken: 19 of total: 12" was exactly that --
  // not 19 real broken avatars, a stale `avatarTotal` from an earlier, smaller sample).
  // Capturing the NodeList once and reusing it for both the wait and the count removes that
  // whole class of flake; it does NOT change what's actually being asserted.
  const avatarCheck = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll("#play-feed .feed-avatar")];
    await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; }))));
    return { total: imgs.length, broken: imgs.filter((img) => img.naturalWidth === 0).length };
  });
  // Every external host is blocked above, so every avatar is FORCED through photoImg()'s
  // onerror -> avatarDataUri() fallback (a local, generated data: URI). This is no longer
  // tolerating network flake -- it's a hard requirement: if the fallback is wired correctly,
  // 0 broken images is the only acceptable result.
  check(`[${tag}] every avatar's onerror fallback renders (external hosts are blocked above -- this is not network luck)`, avatarCheck.broken === 0, `${avatarCheck.broken} broken of ${avatarCheck.total}`);

  // The score chip must never float/overlap: its box should sit fully within its row's box.
  const overlaps = await page.$$eval("#play-feed .event.tm.scored", (els) =>
    els.map((el) => {
      const chip = el.querySelector(".feed-score");
      if (!chip) return true;
      const a = el.getBoundingClientRect();
      const b = chip.getBoundingClientRect();
      return b.left >= a.left - 1 && b.right <= a.right + 1 && b.bottom <= a.bottom + 1;
    })
  );
  check(`[${tag}] score chips stay inside their own row (no float overlap)`, overlaps.every(Boolean), `${overlaps.filter(Boolean).length}/${overlaps.length}`);

  check(`[${tag}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.$eval("#play-feed", (el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
  await (await page.$("#play-feed")).screenshot({ path: `${OUT}/${tag}-feed.png` });
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("PASS")).length}/${report.length} passed`);
