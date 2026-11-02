// Browser E2E for C4 (highlights and market buzz). A REAL managed career, played through the real buttons.
// Every claim on the card is reconciled against the SAVE and the box-score stats the season really holds:
//   * a highlight's figure ("41 分") must equal what that player really did in that game (season-stat delta);
//   * buzz after a game must equal buzz before x 0.8 + what the card says it earned (nothing silent);
//   * "hot" on the card must be exactly the hot players in the ledger, with the ledger's number;
//   * every price-up on a trade offer must carry the ledger's buzz and the documented bonus, and the
//     cached offers must be re-made the moment the market's mood changes (the stale-cache bug).
// Real thresholds (30 points, 5 blocks ...) can't be conjured on demand, so the plumbing runs on a RELAXED
// copy of js/career/balance.js (the same app code, one module intercepted); the real thresholds get their
// own pass: no false claims, no silent omissions, and a seeded 40-point night that cools off.
// Usage: [QA_VIEWPORT=desktop|mobile] node scripts/qa/career-buzz.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { CJK, lowContrast, noOverflow, onResult, overflowers, settled, shoot, unbroken } from "./lib/page.mjs";
import { openCareer, resumeToHub } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/buzz";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

// ---- the relaxed copy of the balance module (and a loud failure if it stops looking as expected)
const SRC = readFileSync(new URL("../../js/career/balance.js", import.meta.url), "utf8");
const RELAXED = SRC
  .replace('{ id: "pts40", min: 40, points: 4 }', '{ id: "pts40", min: 14, points: 4 }')
  .replace('{ id: "pts30", min: 30, points: 2 }', '{ id: "pts30", min: 6, points: 2 }')
  .replace("HIGHLIGHT_BLOCKS = { min: 5,", "HIGHLIGHT_BLOCKS = { min: 1,")
  .replace("HIGHLIGHT_THREES = { min: 8,", "HIGHLIGHT_THREES = { min: 2,");
check("the relaxed balance module was built from the real one", RELAXED !== SRC && /min: 14,/.test(RELAXED) && /min: 6,/.test(RELAXED) && /HIGHLIGHT_BLOCKS = \{ min: 1,/.test(RELAXED) && /HIGHLIGHT_THREES = \{ min: 2,/.test(RELAXED));
const relax = (page) => page.route(/\/js\/career\/balance\.js/, (route) => route.fulfill({ contentType: "text/javascript", body: RELAXED }));

const r2 = (x) => Math.round(x * 100) / 100;
const HOT = 2;
const DECAY = 0.8;

/** What the SAVE says: buzz ledger, cached offers, games played, and every roster player's season totals. */
const saved = (page) => page.evaluate(async () => {
  const { buzzKey } = await import("/js/career/buzz.js");
  const root = JSON.parse(localStorage.getItem("cls_root_v3"));
  const st = root.leagueCareer.season;
  const rec = st.standings[st.userTeamId] || { w: 0, l: 0 };
  const roster = st.teams[st.userTeamId].players;
  return {
    games: rec.w + rec.l,
    buzz: st.buzz || {},
    key: buzzKey(st),
    cachedKey: st.tradeProposalsBuzz,
    proposals: st.tradeProposals || [],
    roster: roster.map((p) => ({ id: p.id, name: p.cardName || p.name })),
    stats: Object.fromEntries(roster.map((p) => [p.id, { ...(st.playerSeason[`${st.userTeamId}:${p.id}`]?.stats || {}) }])),
  };
});

/** The highlight blocks as the player sees them, plus layout facts. The card fades in: read it settled. */
const card = async (page) => {
  await settled(page);
  return page.evaluate(() => {
    const box = document.querySelector("#result-rewards");
    const rows = [...box.querySelectorAll(".pg-hl")].map((li) => ({
      name: li.querySelector("strong").textContent.trim(),
      tags: [...li.querySelectorAll(".pg-who > span .pg-nowrap")].map((s) => s.textContent.trim()),
      gain: Number(li.querySelector(".pg-buzz").textContent.match(/\+(\d+(?:\.\d+)?)/)[1]),
    }));
    const more = Number((box.querySelector(".pg-highlights + .pg-more")?.textContent.match(/\d+/) || [0])[0]);
    const hot = [...box.querySelectorAll(".pg-hotnote .pg-nowrap")].map((s) => {
      const m = s.textContent.trim().match(/^(.*) (\d+\.\d)$/);
      return { name: m[1], buzz: Number(m[2]) };
    });
    const titles = [...box.querySelectorAll(".pg-section-title")].map((el) => el.textContent.trim());
    const hl = box.querySelector(".pg-highlights");
    const stars = box.querySelector("ol.pg-stars");
    const growth = box.querySelector(".pg-growth");
    const after = (a, b) => !a || !b || !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const gaps = [...box.querySelectorAll(".pg-section-title")].map((t) => (t.previousElementSibling ? t.getBoundingClientRect().top - t.previousElementSibling.getBoundingClientRect().bottom : 99));
    return {
      rows, more, hot, titles, gaps,
      kicker: box.querySelector(".pg-kicker")?.textContent.trim(),
      ordered: after(stars, hl) && after(hl, growth),
      text: box.textContent.replace(/\s+/g, " ").trim(),
      opacity: getComputedStyle(box.querySelector(".pg-card")).opacity,
    };
  });
};

/** "41 分" / "6 blocks" / "三双" -> { kind, n } */
function parseTag(text) {
  let m;
  if ((m = text.match(/^(\d+) (?:分|points)$/))) return { kind: "pts", n: Number(m[1]) };
  if ((m = text.match(/^(\d+) (?:次盖帽|blocks)$/))) return { kind: "blk", n: Number(m[1]) };
  if ((m = text.match(/^(\d+) (?:记三分|threes)$/))) return { kind: "tpm", n: Number(m[1]) };
  if (/^(?:三双|Triple-double)$/.test(text)) return { kind: "td" };
  return /^\+\d+$/.test(text) ? { kind: "more" } : { kind: "?" };
}
/** Per-player stat change between two saves (one game's worth when the saves are one game apart). */
const delta = (before, after, id) => Object.fromEntries(["pts", "reb", "ast", "stl", "blk", "tp"].map((k) => [k, (after.stats[id]?.[k] || 0) - (before.stats[id]?.[k] || 0)]));
const tripleDouble = (d) => ["pts", "reb", "ast", "stl", "blk"].filter((k) => d[k] >= 10).length >= 3;
/** The highlights the REAL thresholds say a stat line earns. */
const realKinds = (d) => [d.pts >= 40 || d.pts >= 30 ? "pts" : null, tripleDouble(d) ? "td" : null, d.blk >= 5 ? "blk" : null, d.tp >= 8 ? "tpm" : null].filter(Boolean);

/** One game, card vs save vs stats. `real`: also hold the card to the real thresholds. */
function reconcile(tag, label, before, after, c, { real }) {
  const idOf = Object.fromEntries(after.roster.map((p) => [p.name, p.id]));
  const rowOf = Object.fromEntries(c.rows.map((r) => [r.name, r]));
  check(`[${tag}] ${label}: every highlighted name is a player on my roster`, c.rows.every((r) => idOf[r.name]), c.rows.map((r) => r.name).join(", "));
  // 1. each figure on the card is what he really did
  const figures = c.rows.flatMap((row) => row.tags.map(parseTag).map((t) => ({ row, t }))).filter(({ t }) => t.kind !== "more");
  const bad = figures.filter(({ row, t }) => {
    const d = delta(before, after, idOf[row.name]);
    if (t.kind === "pts") return t.n !== d.pts;
    if (t.kind === "blk") return t.n !== d.blk;
    if (t.kind === "tpm") return t.n !== d.tp;
    return t.kind === "td" ? !tripleDouble(d) : true;
  });
  check(`[${tag}] ${label}: every highlight figure equals what the player really did`, bad.length === 0 && (real || figures.length > 0), // real thresholds: a quiet game has no figures, and that is right
    bad.map(({ row, t }) => `${row.name} ${JSON.stringify(t)}`).join("; ") || `${figures.length} figures`);
  // 2. buzz after = buzz before x 0.8 + the gain the card announced (nothing silent)
  let silent = 0;
  const off = [];
  for (const p of after.roster) {
    const prev = before.buzz[p.id] || 0;
    const decayed = prev * DECAY;
    const expected = r2(Math.min(10, decayed + (rowOf[p.name]?.gain || 0)));
    const got = after.buzz[p.id] || 0;
    const rounded = expected < 0.05 ? 0 : expected;
    if (Math.abs(got - rounded) > 0.011) {
      if (!rowOf[p.name] && c.more > 0 && got >= decayed - 0.011) silent += 1; // a gain beyond the four rows shown
      else off.push(`${p.name}: ${prev} -> ${got}, expected ${rounded}`);
    }
  }
  check(`[${tag}] ${label}: buzz after = buzz before x ${DECAY} + the gain on the card`, off.length === 0 && silent <= c.more, off.join("; "));
  check(`[${tag}] ${label}: nobody is left on the ledger who is not on the roster`, Object.keys(after.buzz).every((id) => idOf[after.roster.find((p) => p.id === id)?.name]), Object.keys(after.buzz).join(","));
  // 3. who is hot on the card == who is hot in the ledger
  const hotSaved = after.roster.filter((p) => (after.buzz[p.id] || 0) >= HOT).map((p) => ({ name: p.name, buzz: after.buzz[p.id] })).sort((a, b) => b.buzz - a.buzz);
  const wantTop = hotSaved.slice(0, 3);
  const sameHot = c.hot.length === wantTop.length && c.hot.every((h, i) => Math.abs(h.buzz - wantTop[i].buzz) < 0.06 && hotSaved.some((s) => s.name === h.name && Math.abs(s.buzz - h.buzz) < 0.06));
  check(`[${tag}] ${label}: the "hot" line is exactly the hottest players in the ledger, with its numbers`, sameHot, `card ${JSON.stringify(c.hot)} vs ledger ${JSON.stringify(wantTop)}`);
  if (real) {
    // 4. real thresholds: no false claims, no silent omissions
    const claimed = new Set(c.rows.map((r) => r.name));
    const earned = after.roster.filter((p) => realKinds(delta(before, after, p.id)).length).map((p) => p.name);
    check(`[${tag}] ${label}: only players who really hit a real threshold are listed`, [...claimed].every((n) => earned.includes(n)), `listed ${[...claimed].join(", ")} / earned ${earned.join(", ")}`);
    check(`[${tag}] ${label}: every player who hit a threshold is listed (or counted in "还有 N 位")`, earned.length === claimed.size + c.more, `earned ${earned.length}, listed ${claimed.size}, more ${c.more}`);
  }
}

async function looks(page, tag, label, c) {
  check(`[${tag}] ${label}: no stat figure is split from its unit across lines`, await unbroken(page));
  check(`[${tag}] ${label}: no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  check(`[${tag}] ${label}: stars, then highlights, then growth`, c.ordered);
  check(`[${tag}] ${label}: every section title has air above it (>= 8px)`, c.gaps.every((g) => g >= 8), c.gaps.map((g) => Math.round(g)).join(","));
  const lows = await lowContrast(page, "#result-rewards", [".pg-buzz", ".pg-hotnote", ".pg-hl .pg-who span", ".pg-more", ".pg-section-title"]);
  check(`[${tag}] ${label}: text in the new blocks is AA contrast (>= 4.5)`, lows.length === 0, lows.join(" | "));
  check(`[${tag}] ${label}: the card settled fully visible`, c.opacity === "1", c.opacity);
}

const backToHub = async (page) => {
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
};
const simOne = async (page) => {
  await page.click("#btn-season-sim-one");
  await onResult(page);
};
/** Open the trade market tab so the (cached) offers are built/refreshed the way a player would see them. */
const viewMarket = async (page) => {
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector("#season-market .sm-proposals", { timeout: 10000 });
};
const proposalCards = (page) => page.$$eval("#season-market .trade-proposal-card", (els) => els.map((el) => ({ id: el.dataset.proposalId, text: el.textContent.replace(/\s+/g, " ").trim() })));
const seedBuzz = async (page, pick) => {
  const who = await page.evaluate((mode) => {
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    const st = root.leagueCareer.season;
    const mine = st.teams[st.userTeamId].players;
    const ovr = (p) => p.ovr2k || p.ovr || 0;
    const star = [...mine].sort((a, b) => ovr(b) - ovr(a))[0];
    st.buzz = mode === "star" ? { [star.id]: 4 } : {};
    delete st.tradeProposals;
    delete st.tradeProposalsBuzz;
    localStorage.setItem("cls_root_v3", JSON.stringify(root));
    return { id: star.id, name: star.cardName || star.name };
  }, pick);
  await page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(page);
  return who;
};

const VIEWPORTS = [[1280, 800, "desktop"], [390, 844, "mobile"]].filter(([, , tag]) => !process.env.QA_VIEWPORT || process.env.QA_VIEWPORT === tag);
for (const [width, height, vp] of VIEWPORTS) {
  // A step that throws (a result screen that never comes) becomes a red line, not a lost report.
  try {
    const newPage = async (relaxed, errors) => {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on("pageerror", (e) => errors.push(e.message));
      if (relaxed) await relax(page);
      return page;
    };

    // ============================================================ relaxed: the whole pipeline, game by game
    {
      const tag = `${vp}/relaxed`;
      const errors = [];
      const page = await newPage(true, errors);
      await openCareer(page, BASE, {});
      let before = await saved(page);
      check(`[${tag}] a fresh career has nobody hot and no ledger`, Object.keys(before.buzz).length === 0, JSON.stringify(before.buzz));
      let first = null;
      for (let game = 1; game <= 3; game += 1) {
        await simOne(page);
        const after = await saved(page);
        const c = await card(page);
        check(`[${tag}] game ${game}: exactly one game was played`, after.games - before.games === 1, `${before.games} -> ${after.games}`);
        check(`[${tag}] game ${game}: the card shows highlights`, c.rows.length > 0, `${c.rows.length} rows`);
        reconcile(tag, `game ${game}`, before, after, c, { real: false });
        await looks(page, tag, `game ${game}`, c);
        if (game === 1) { first = c; await shoot(page, `${OUT}/${tag.replace("/", "-")}-single.png`); }
        await backToHub(page);
        // the market, opened right after the game, must be priced on THIS game's buzz
        await viewMarket(page);
        const m = await saved(page);
        const cards = await proposalCards(page);
        check(`[${tag}] game ${game}: the offer cache carries the market's current mood`, m.cachedKey === m.key, `cached "${m.cachedKey}" vs now "${m.key}"`);
        const boosted = m.proposals.filter((p) => p.buzz);
        check(`[${tag}] game ${game}: every price-up carries the ledger's buzz and the documented bonus`, boosted.every((p) => {
          const v = m.buzz[p.giveIds[0]] || 0;
          return v >= HOT && Math.abs(p.buzz.value - v) < 0.011 && Math.abs(p.buzz.bonus - r2(Math.min(4, v * 0.75))) < 0.011;
        }), JSON.stringify(boosted.map((p) => p.buzz)));
        check(`[${tag}] game ${game}: the offer card says "热度" exactly when the offer was priced up`, m.proposals.every((p) => cards.some((cd) => cd.id === p.id && /热度/.test(cd.text) === !!p.buzz)), `${cards.length} cards`);
        if (game === 1) check(`[${tag}] game 1: hot players are being called (at least one priced-up offer)`, boosted.length >= 1, `${m.proposals.length} offers`);
        if (game === 1) await shoot(page, `${OUT}/${tag.replace("/", "-")}-market.png`);
        before = m;
        await page.click('[data-season-tab="standings"]');
      }
      check(`[${tag}] the first card had highlights AND a hot line`, first.rows.length > 0 && first.hot.length > 0, `${first.rows.length} rows, ${first.hot.length} hot`);

      // a week: one stretch card, the whole stretch's highlights, hot as of the LAST game
      before = await saved(page);
      await page.click("#btn-season-sim-week");
      await onResult(page);
      let after = await saved(page);
      let c = await card(page);
      check(`[${tag}] sim week: this is the stretch card`, /本段收获/.test(c.kicker || ""), c.kicker);
      check(`[${tag}] sim week: more than one game was played`, after.games - before.games > 1, `${after.games - before.games}`);
      check(`[${tag}] sim week: highlights of the stretch are shown, titled as such`, c.rows.length > 0 && c.titles.some((t) => /这段时间的高光/.test(t)), JSON.stringify(c.titles));
      const idOf = Object.fromEntries(after.roster.map((p) => [p.name, p.id]));
      check(`[${tag}] sim week: every highlighted name is on my roster`, c.rows.every((r) => idOf[r.name]));
      const hotNow = after.roster.filter((p) => (after.buzz[p.id] || 0) >= HOT).map((p) => ({ name: p.name, buzz: after.buzz[p.id] })).sort((a, b) => b.buzz - a.buzz).slice(0, 3);
      check(`[${tag}] sim week: the hot line is who is hot after the LAST game`, c.hot.length === hotNow.length && c.hot.every((h) => hotNow.some((s) => s.name === h.name && Math.abs(s.buzz - h.buzz) < 0.06)), `card ${JSON.stringify(c.hot)} vs ledger ${JSON.stringify(hotNow)}`);
      await looks(page, tag, "sim week", c);
      await shoot(page, `${OUT}/${tag.replace("/", "-")}-batch.png`);
      await backToHub(page);

      // reload: the ledger and the card survive a save
      const preReload = await saved(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await resumeToHub(page);
      const postReload = await saved(page);
      check(`[${tag}] reload: the ledger survives`, JSON.stringify(postReload.buzz) === JSON.stringify(preReload.buzz), JSON.stringify(postReload.buzz).slice(0, 120));

      // English
      await page.evaluate(() => document.querySelector("#btn-lang").click());
      await page.waitForTimeout(300);
      before = await saved(page);
      await simOne(page);
      after = await saved(page);
      c = await card(page);
      const en = c.text.slice(c.text.search(/Highlights|Market buzz/));
      check(`[${tag}] English: highlights and the hot line are English through and through`, c.rows.length > 0 && !CJK.test(en), en.slice(0, 160));
      check(`[${tag}] English: the hot line reads "Trade-market buzz: …"`, c.hot.length === 0 || /Trade-market buzz:/.test(c.text), "");
      reconcile(tag, "English", before, after, c, { real: false });
      await looks(page, tag, "English", c);
      await shoot(page, `${OUT}/${tag.replace("/", "-")}-english.png`);
      check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
      await page.close();
    }

    // ============================================================ real thresholds
    {
      const tag = `${vp}/real`;
      const errors = [];
      const page = await newPage(false, errors);
      await openCareer(page, BASE, {});
      const bal = await page.evaluate(async () => { const b = await import("/js/career/balance.js"); return { s: b.HIGHLIGHT_SCORING.map((t) => t.min), b: b.HIGHLIGHT_BLOCKS.min, t: b.HIGHLIGHT_THREES.min }; });
      check(`[${tag}] the page runs the REAL thresholds`, JSON.stringify(bal) === JSON.stringify({ s: [40, 30], b: 5, t: 8 }), JSON.stringify(bal));

      // 1. a run of real games: no false claims, no silent omissions, buzz bookkeeping exact
      let before = await saved(page);
      let sawHighlight = 0;
      for (let game = 1; game <= 8; game += 1) {
        await simOne(page);
        const after = await saved(page);
        const c = await card(page);
        sawHighlight += c.rows.length;
        reconcile(tag, `game ${game}`, before, after, c, { real: true });
        if (c.rows.length || c.hot.length) await looks(page, tag, `game ${game}`, c);
        await backToHub(page);
        before = after;
      }
      check(`[${tag}] (info) real highlights seen across 8 games`, true, `${sawHighlight}`);

      // 2. a seeded 40-point night: a clearly better offer, then it cools off and the offers go back
      const star = await seedBuzz(page, "star");
      await viewMarket(page);
      let m = await saved(page);
      const hotOffer = m.proposals.find((p) => p.giveIds.includes(star.id));
      check(`[${tag}] a 40-point night: the star is called, priced up by the documented +3`, !!hotOffer?.buzz && hotOffer.buzz.bonus === 3, JSON.stringify(hotOffer?.buzz));
      const cards = await proposalCards(page);
      check(`[${tag}] the offer card explains the price-up and that it fades`, cards.some((cd) => cd.id === hotOffer?.id && /热度 4\.0/.test(cd.text) && /几场后会回落/.test(cd.text)), cards[0]?.text.slice(0, 120));
      await shoot(page, `${OUT}/${tag.replace("/", "-")}-hot-offer.png`);

      const compared = await page.evaluate(async (id) => {
        const tp = await import("/js/engine/tradeProposals.js");
        const { overall } = await import("/js/data/players.js");
        const season = JSON.parse(localStorage.getItem("cls_root_v3")).leagueCareer.season;
        const offerFor = (buzz) => {
          const st = structuredClone(season);
          st.buzz = buzz;
          delete st.tradeProposals;
          const o = tp.generateTradeProposals(st, 3).find((p) => p.giveIds.includes(id));
          return o && { best: Math.max(...o.receivePlayers.map(overall)), picks: o.offerPicks.length, bonus: o.buzz?.bonus ?? 0 };
        };
        return { cold: offerFor({}), hot: offerFor({ [id]: 4 }) };
      }, star.id);
      check(`[${tag}] the same star: the hot offer is clearly better than the cold one`, !!compared.hot && !!compared.cold && compared.hot.bonus === 3 && compared.hot.best >= compared.cold.best && (compared.hot.best > compared.cold.best || compared.hot.picks > compared.cold.picks), JSON.stringify(compared));

      let cooled = null;
      let rehot = false;
      before = await saved(page);
      for (let game = 1; game <= 10 && cooled === null; game += 1) {
        await page.click('[data-season-tab="standings"]');
        await simOne(page);
        const after = await saved(page);
        const c = await card(page);
        reconcile(tag, `cooling game ${game}`, before, after, c, { real: true });
        if (c.rows.some((r) => r.name === star.name)) rehot = true;
        await backToHub(page);
        await viewMarket(page);
        const mm = await saved(page);
        check(`[${tag}] cooling game ${game}: offers are re-priced with the market's mood`, mm.cachedKey === mm.key, `cached "${mm.cachedKey}" vs now "${mm.key}"`);
        if ((mm.buzz[star.id] || 0) < HOT) cooled = { after: mm, game };
        before = mm;
      }
      check(`[${tag}] the star cooled below "hot" within 10 games (or got a fresh highlight on the way)`, cooled !== null || rehot, `buzz now ${before.buzz[star.id]}`);
      if (cooled) {
        const offer = cooled.after.proposals.find((p) => p.giveIds.includes(star.id));
        check(`[${tag}] once cooled, his offer is no longer priced up`, !offer || offer.buzz === null, JSON.stringify(offer?.buzz));
        const cardsNow = await proposalCards(page);
        check(`[${tag}] once cooled, no offer card mentions 热度 for him`, !cardsNow.some((cd) => cd.id === offer?.id && /热度/.test(cd.text)), "");
      }
      check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
      await page.close();
    }
  } catch (error) {
    check(`[${vp}] the run did not crash`, false, String(error.message).split("\n")[0]);
  }
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
