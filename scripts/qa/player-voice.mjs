// Player Voice (ADR-008a Q2) in a real browser: category, rating, per-owner local draft, honest submit state.
// Usage: node scripts/qa/player-voice.mjs /tmp/cls-qa/voice [http://127.0.0.1:5187/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/voice";
const BASE = process.argv[3] || "http://127.0.0.1:5187/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const openPanel = async (page) => {
  await page.click('.home-tab[data-category="world"]');
  if (!(await page.$eval("#mw-feedback", (el) => !el.hidden))) await page.click(".mw-voice");
  await page.waitForSelector("#mw-feedback:not([hidden])");
};
const draftKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cls_feedback_draft_v1:")).sort());
const lit = (page) => page.$$eval("#mw-feedback .mw-star.on", (els) => els.length);
const glyph = (page, n) => page.$eval(`#mw-feedback .mw-star:nth-child(${n}) .mw-glyph`, (el) => getComputedStyle(el, "::before").content);

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await reload(page);
    const ids = await page.evaluate(async () => {
      const acc = await import("/js/data/account.js");
      const a = acc.createAccount("Alpha");
      const b = acc.createAccount("Bravo");
      acc.setActiveAccountId(a.id);
      return { a: a.id, b: b.id };
    });
    await reload(page);
    await openPanel(page);

    // 1. honest state: Submit disabled, reason shown, nothing claims "sent"
    check(`[${tag}] Submit is disabled with no server`, await page.$eval('[data-mw-action="submit-feedback"]', (b) => b.disabled && b.getAttribute("aria-disabled") === "true"));
    const panel0 = await text(page, "#mw-feedback");
    check(`[${tag}] panel says the service is not online and drafts are kept`, panel0.includes("反馈服务还没有上线") && panel0.includes("草稿"));
    check(`[${tag}] nothing claims the feedback was sent`, !/已提交|已发送|提交成功/.test(panel0));
    check(`[${tag}] GitHub is a small text link, not a button`, await page.$eval(".mw-fb-link", (a) => !a.classList.contains("btn") && a.href.startsWith("https://github.com/Duzhiok/courtside-legends/issues")));

    // 2. type, rate, write: all land in the draft
    await page.click('.mw-seg-opt:has(input[value="bug"])');
    await page.click("#mw-feedback .mw-star:nth-child(4)");
    await page.fill("#mw-feedback-note", "Free throws feel too easy");
    await page.waitForFunction(() => document.querySelector("#mw-feedback-draft")?.textContent.includes("草稿已自动保存"));
    check(`[${tag}] four stars are lit, hollow vs solid glyphs differ`, (await lit(page)) === 4 && (await glyph(page, 4)).includes("★") && (await glyph(page, 5)).includes("☆"), `${await glyph(page, 4)} / ${await glyph(page, 5)}`);
    check(`[${tag}] draft stored under Alpha's own key`, JSON.stringify(await draftKeys(page)) === JSON.stringify([`cls_feedback_draft_v1:${ids.a}`]));
    const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem(`cls_feedback_draft_v1:${id}`)), ids.a);
    check(`[${tag}] stored draft has category, rating and note`, stored.category === "bug" && stored.stars === 4 && stored.note === "Free throws feel too easy", JSON.stringify(stored));
    await shoot(page, `${OUT}/${tag}-panel.png`);

    // 3. keyboard: arrow keys move the category (native radio), and the draft follows
    await page.focus('input[name="mw-fb-category"]:checked'); // Bug -> ArrowRight -> Rating
    await page.keyboard.press("ArrowRight");
    check(`[${tag}] keyboard arrows move the type (Bug -> Rating) and save it`, await page.evaluate((id) => JSON.parse(localStorage.getItem(`cls_feedback_draft_v1:${id}`)).category === "rating", ids.a));

    // 4. reload restores it; another account sees nothing
    await reload(page);
    await openPanel(page);
    check(`[${tag}] reload restores note, rating and shows a restore notice`, (await page.inputValue("#mw-feedback-note")) === "Free throws feel too easy" && (await lit(page)) === 4 && (await text(page, "#mw-feedback-draft")).includes("已恢复"));
    await page.evaluate((id) => import("/js/data/account.js").then((a) => a.setActiveAccountId(id)), ids.b);
    await reload(page);
    await openPanel(page);
    check(`[${tag}] another account sees an empty panel (draft is per account)`, (await page.inputValue("#mw-feedback-note")) === "" && (await lit(page)) === 0 && !(await text(page, "#my-world-root")).includes("Free throws"));

    // 5. guest has its own slot
    await page.evaluate(() => localStorage.removeItem("cls_active_account"));
    await reload(page);
    await openPanel(page);
    check(`[${tag}] guest sees neither account's draft`, (await page.inputValue("#mw-feedback-note")) === "" && (await lit(page)) === 0);
    await page.fill("#mw-feedback-note", "guest note");
    await page.waitForFunction(() => localStorage.getItem("cls_feedback_draft_v1:guest"));
    check(`[${tag}] guest draft lives under its own key; Alpha's is untouched`, (await draftKeys(page)).length === 2);
    // clearing the note with no rating removes the key (no empty junk)
    await page.fill("#mw-feedback-note", "");
    await page.waitForFunction(() => !localStorage.getItem("cls_feedback_draft_v1:guest"));
    check(`[${tag}] emptying the draft removes its key`, !(await draftKeys(page)).includes("cls_feedback_draft_v1:guest"));

    // 6. back to Alpha: clear rating, copy carries category + rating
    await page.evaluate((id) => import("/js/data/account.js").then((a) => a.setActiveAccountId(id)), ids.a);
    await reload(page);
    await openPanel(page);
    await page.click('[data-mw-action="copy-feedback"]');
    await page.waitForFunction(() => document.querySelector("#mw-feedback-status")?.textContent.trim());
    const copied = await page.$eval("#mw-feedback-template", (el) => (el.hidden ? "" : el.value));
    const status = await text(page, "#mw-feedback-status");
    check(`[${tag}] copy works and the template carries rating + note`, status.includes("已复制") || (copied.includes("评分: 4/5") && copied.includes("Free throws")), status);
    await page.click('[data-mw-action="clear-stars"]');
    await page.waitForFunction(() => !document.querySelector("#mw-feedback .mw-star.on"));
    check(`[${tag}] "No rating" clears the stars and the stored rating`, (await lit(page)) === 0 && (await page.evaluate((id) => JSON.parse(localStorage.getItem(`cls_feedback_draft_v1:${id}`)).stars, ids.a)) === 0);

    // 7. real createMyWorld with an injected submit: success clears, failure/throw keep the draft
    const flows = await page.evaluate(async (accId) => {
      const { createMyWorld } = await import("/js/ui/myWorldScreen.js");
      const draftMod = await import("/js/data/feedbackDraft.js");
      const run = async (submit) => {
        draftMod.writeDraft(accId, { category: "rating", stars: 5, note: "great" });
        const el = document.createElement("div");
        document.body.appendChild(el);
        createMyWorld({ el, getLang: () => "zh", getAccount: () => ({ id: accId, name: "Alpha", playerIds: [] }), readRootSave: () => null, submitFeedback: submit });
        const btn = el.querySelector('[data-mw-action="submit-feedback"]');
        const enabled = !btn.disabled;
        el.querySelector('[data-mw-action="submit-feedback"]').click();
        await new Promise((r) => setTimeout(r, 60));
        const res = { enabled, status: el.querySelector("#mw-feedback-status")?.textContent || "", kept: !!localStorage.getItem(`cls_feedback_draft_v1:${accId}`) };
        el.remove();
        return res;
      };
      const seen = [];
      const ok = await run(async (d) => { seen.push(d); return true; });
      const no = await run(async () => false);
      const boom = await run(async () => { throw new Error("offline"); });
      const noFn = await run(null);
      draftMod.clearDraft(accId);
      return { ok, no, boom, noFn, seen };
    }, ids.a);
    check(`[${tag}] injected submit: button is enabled`, flows.ok.enabled && flows.no.enabled);
    check(`[${tag}] success: says submitted and clears the draft`, flows.ok.status.includes("已提交") && !flows.ok.kept, JSON.stringify(flows.ok));
    check(`[${tag}] the submit payload is the draft (category, rating, note, owner)`, flows.seen[0]?.category === "rating" && flows.seen[0]?.stars === 5 && flows.seen[0]?.note === "great" && flows.seen[0]?.owner === ids.a);
    check(`[${tag}] failure: says so and KEEPS the draft`, flows.no.status.includes("没有提交成功") && flows.no.kept && !flows.no.status.includes("已提交"), JSON.stringify(flows.no));
    check(`[${tag}] a throwing submit behaves like a failure`, flows.boom.status.includes("没有提交成功") && flows.boom.kept);
    check(`[${tag}] no submit function: disabled, clicking does nothing`, !flows.noFn.enabled && flows.noFn.status === "" && flows.noFn.kept);

    // 8. accessibility + layout
    const low = await textContrast(page, "#mw-feedback", { min: 4.5 });
    check(`[${tag}] panel text contrast >= 4.5 (disabled controls are exempt)`, !low.filter((x) => !/提交|Submit/.test(JSON.stringify(x))).length, JSON.stringify(low).slice(0, 160));
    const sizes = await page.evaluate(() => [...document.querySelectorAll("#mw-feedback .mw-seg-opt span, #mw-feedback .mw-star")].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check(`[${tag}] chips and stars are at least 24x24`, sizes.length === 8 && sizes.every(([sw, sh]) => sw >= 24 && sh >= 24), JSON.stringify(sizes));
    check(`[${tag}] every radio has an accessible name`, await page.$$eval('#mw-feedback input[type="radio"]', (els) => els.every((i) => i.closest("label")?.textContent.trim().length > 0)));
    check(`[${tag}] no horizontal overflow`, await noOverflow(page));

    // 9. English
    await page.evaluate(() => localStorage.setItem("courtside.lang", "en"));
    await reload(page);
    await openPanel(page);
    const en = await text(page, "#mw-feedback");
    const ph = await page.$eval("#mw-feedback-note", (el) => el.placeholder);
    check(`[${tag}] EN: panel and placeholder have no Chinese`, !CJK.test(en) && !CJK.test(ph) && en.includes("not online yet"), (en.match(/.{0,10}[\u4e00-\u9fff].{0,10}/) || [""])[0]);
    check(`[${tag}] no page errors`, !errors.length, errors.join(" | ").slice(0, 160));
  } catch (e) {
    check(`[${tag}] flow completed`, false, String(e.message).split("\n")[0].slice(0, 160));
  }
  await page.close();
}
await browser.close();
console.log(out.join("\n"));
console.log(`${out.filter((l) => l.startsWith("PASS")).length}/${out.length} passed`);
