// Browser E2E: "I haven't picked five starters, yet ticking one says at most 5".
// The saved team still lists five starters who have since left (traded / cut). They are invisible on the
// rotation screen but used to fill the five slots. Real career, real buttons; the only hand-edit is putting
// the stale ids into the save, which is exactly what a trade leaves behind.
// Usage: node scripts/qa/rotation-ghost-starters.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { noOverflow, shoot } from "./lib/page.mjs";
import { openCareer, resumeToHub } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/ghost-starters";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`;
  report.push(line);
  console.log(line);
};
const browser = await chromium.launch({ executablePath: EXE });

const ticked = (page) => page.$$eval("#season-rotation .rot-row", (rows) => rows.filter((r) => r.querySelector(".rot-start-cb").checked).length);
const rowIds = (page) => page.$$eval("#season-rotation .rot-row", (rows) => rows.map((r) => r.dataset.id));
const savedStarters = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3"));
  const season = root.leagueCareer.season;
  return season.teams[season.userTeamId].starterIds ?? null;
});

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  const dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await openCareer(page, BASE, {});

  // the stale save: five ids that belong to nobody on this roster
  await page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    const season = root.leagueCareer.season;
    season.teams[season.userTeamId].starterIds = ["gone-1", "gone-2", "gone-3", "gone-4", "gone-5"];
    localStorage.setItem("cls_root_v3", JSON.stringify(root));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(page);
  await page.click('[data-season-tab="rotation"]');
  await page.waitForSelector("#season-rotation .rot-row", { timeout: 15000 });

  check(`[${tag}] nobody is shown as a starter (the five stale ids are invisible)`, (await ticked(page)) === 0);
  const ids = await rowIds(page);
  await shoot(page, `${OUT}/${tag}-before.png`);

  await page.click(`#season-rotation .rot-row[data-id="${ids[0]}"] .rot-start-cb`);
  check(`[${tag}] ticking the first starter does NOT say "at most 5"`, dialogs.length === 0, dialogs.join(" | "));
  check(`[${tag}] he is now ticked, and he is the only one`, (await ticked(page)) === 1);

  for (const id of ids.slice(1, 5)) await page.click(`#season-rotation .rot-row[data-id="${id}"] .rot-start-cb`);
  check(`[${tag}] five real starters can be ticked without a warning`, (await ticked(page)) === 5 && dialogs.length === 0, `ticked ${await ticked(page)}, dialogs ${dialogs.length}`);

  // ticking only changes the open screen; saving is what writes the team -- and it must not keep the ghosts
  await page.click("#btn-rot-save");
  const saved = await savedStarters(page);
  check(`[${tag}] saved starters are exactly the five real ones, no stale ids`, JSON.stringify([...saved].sort()) === JSON.stringify(ids.slice(0, 5).sort()), JSON.stringify(saved));
  const afterSave = dialogs.length; // the "rotation saved" notice

  await page.click(`#season-rotation .rot-row[data-id="${ids[5]}"] .rot-start-cb`);
  check(`[${tag}] a real sixth is still refused`, dialogs.length === afterSave + 1 && /5/.test(dialogs.at(-1)) && (await ticked(page)) === 5, `${dialogs.length - afterSave} new dialog(s), ticked ${await ticked(page)}`);
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-after.png`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join("\n") + "\n");
const fails = report.filter((r) => r.startsWith("FAIL"));
console.log(`\n${report.length - fails.length}/${report.length} passed`);
process.exit(fails.length ? 1 : 0);
