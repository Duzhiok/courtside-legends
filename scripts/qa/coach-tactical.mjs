// Coach tactical comeback challenge in a real browser (workstream B):
// ?coach-tactics=1 opens the Q4 down-10 slice; the opening moment renders
// with 3 choices + previews + downsides; picking one applies the tactic;
// Continue steps the sim (clock advances); a full playthrough ends in a
// decision-effect report. Desktop + mobile.
// Usage: node scripts/qa/coach-tactical.mjs /tmp/cls-qa/coach-tactical [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/coach-tactical";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };

for (const [tag, viewport] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, hasTouch: tag === "mobile" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}?coach-tactics=1`, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.waitForSelector("#screen-coach-tactics.active", { timeout: 20000 }).catch(() => {});
  const bodyText = () => text(page, "#coach-tactics-body");
  check(`${tag}: challenge screen opens`, await page.$("#screen-coach-tactics.active") !== null);
  const t0 = await bodyText().catch(() => "");
  check(`${tag}: scoreboard shows GSW/CLE Q4`, /GSW/.test(t0) && /CLE/.test(t0) && /Q4/.test(t0), t0.slice(0, 80));
  check(`${tag}: opening moment has 3 choices`, (await page.$$("#coach-tactics-body .ct-choice")).length === 3);
  check(`${tag}: each choice shows a downside`, /⚠/.test(t0));
  check(`${tag}: no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-opening.png`);

  // Pick zone_drop, then play the game out: Continue, or first choice at moments.
  const picked = await page.$$eval("#coach-tactics-body .ct-choice", (els) => {
    const btn = els.find((e) => e.dataset.choice === "zone_drop");
    if (btn) { btn.click(); return "zone_drop"; }
    return null;
  });
  check(`${tag}: zone_drop applies`, picked === "zone_drop");
  await page.waitForTimeout(300);
  const t1 = await bodyText().catch(() => "");
  check(`${tag}: tactic pill shows the switch`, /沉退|Drop Zone/.test(t1), t1.slice(0, 80));

  let ended = false;
  for (let i = 0; i < 40 && !ended; i += 1) {
    const state = await page.evaluate(() => {
      const body = document.querySelector("#coach-tactics-body");
      if (body.querySelector(".ct-report")) return "ended";
      const choice = body.querySelector(".ct-choice:not([disabled])");
      if (choice) { choice.click(); return "chose"; }
      const cont = body.querySelector('[data-act="continue"]');
      if (cont) { cont.click(); return "continued"; }
      return "stuck";
    });
    if (state === "ended") { ended = true; break; }
    if (state === "stuck") break;
    await page.waitForTimeout(200);
  }
  check(`${tag}: full playthrough reaches the report`, ended);
  if (ended) {
    const t2 = await bodyText().catch(() => "");
    check(`${tag}: report lists decision swings`, /净胜分|Swing/.test(t2));
    check(`${tag}: report shows promises + reputation`, /承诺|Promises/.test(t2) && /声望|Reputation/.test(t2));
    await shoot(page, `${OUT}/${tag}-report.png`);
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}
await browser.close();
console.log(`\n${out.filter((l) => l.startsWith("PASS")).length}/${out.length} checks passed`);
