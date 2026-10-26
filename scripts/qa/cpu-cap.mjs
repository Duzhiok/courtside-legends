// Browser QA for the CPU hard-cap rule, on REAL generated leagues (real players, real salaries).
//
// Every CPU club in a freshly built league starts far above the hard cap line, so a rule that refused any
// trade ending above the line made every trade impossible. The rule is: the cap only stops a trade that
// makes the CPU's payroll go UP and leaves it above the line. This checks, in a real browser, that
//   - a salary-neutral swap of second-round picks is accepted by (nearly) every club,
//   - a deal that sheds the CPU's salary is accepted,
//   - a deal that adds salary to a club that is over the line is still refused,
//   - and every offer the CPU itself generates can actually be accepted.
// Usage: node scripts/qa/cpu-cap.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/cpu-cap";
const BASE = (process.argv[3] || "http://127.0.0.1:5173/").replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async (LEAGUES) => {
  const players = await import("/js/data/players.js");
  await players.loadPlayers();
  const { createSeason } = await import("/js/engine/season.js");
  const market = await import("/js/engine/seasonMarket.js");
  const proposals = await import("/js/engine/tradeProposals.js");
  const { executeTrade, teamDraftAssets, teamPayroll, playerSalary, SEASON_APRON } = market;
  const LINE = SEASON_APRON + (market.CPU_APRON_SLACK ?? 50);

  const pool = [...players.PLAYERS].sort((a, b) => b.overall - a.overall);
  const out = { clubs: 0, overLine: 0, pickSwapOk: 0, shedOk: 0, shedTried: 0, addRefused: 0, addTried: 0, offers: 0, offersBounced: [], reasons: {}, error: null };

  for (let n = 0; n < LEAGUES; n++) {
    const mine = pool.slice(40 + n * 12, 52 + n * 12).map((p) => structuredClone(p));
    let st;
    try {
      st = createSeason({ userTeamId: "LAS", userTeamName: "测试队", userTeam: { name: "测试队", players: mine, coach: undefined }, mode: "modern", year: 2025, seed: 1000 + n });
    } catch (e) {
      out.error = String(e && e.message);
      return out;
    }
    st.phase = "regular";
    const myBest = [...st.teams[st.userTeamId].players].sort((a, b) => playerSalary(b) - playerSalary(a));
    for (const [id, team] of Object.entries(st.teams)) {
      if (id === st.userTeamId) continue;
      out.clubs++;
      const over = teamPayroll(team) > LINE;
      if (over) out.overLine++;

      // 1. a salary-neutral swap of two second-round picks
      const a = structuredClone(st);
      const myPick = teamDraftAssets(a, a.userTeamId).find((p) => p.round === 2);
      const theirPick = teamDraftAssets(a, id).find((p) => p.round === 2);
      const r1 = executeTrade(a, { givePickIds: [myPick.id], wantPickIds: [theirPick.id], cpuTeamId: id });
      if (r1.ok) out.pickSwapOk++;
      else out.reasons[r1.reason] = (out.reasons[r1.reason] || 0) + 1;

      if (!over) continue;
      // 2. the club sends out its highest-paid player for the player's lowest-paid: it SHEDS salary
      const heavy = [...team.players].sort((x, y) => playerSalary(y) - playerSalary(x))[0];
      const cheap = myBest[myBest.length - 1];
      if (playerSalary(heavy) > playerSalary(cheap)) {
        out.shedTried++;
        const b = structuredClone(st);
        const r2 = executeTrade(b, { giveIds: [cheap.id], wantIds: [heavy.id], cpuTeamId: id, acceptedProposal: true });
        // The player's own cap may legitimately stop a very large contract: only count the CPU-side verdict.
        if (r2.ok || /我方|交易后将超过硬帽 2300/.test(r2.reason)) out.shedOk++;
      }
      // 3. the club is asked to TAKE ON the player's best-paid player for its cheapest: still refused
      const cheapest = [...team.players].sort((x, y) => playerSalary(x) - playerSalary(y))[0];
      const dear = myBest.slice(0, 3); // the three highest-paid players for one cheap one: the club takes on salary
      if (dear.reduce((sum, p) => sum + playerSalary(p), 0) > playerSalary(cheapest)) {
        out.addTried++;
        const c = structuredClone(st);
        const r3 = executeTrade(c, { giveIds: dear.map((p) => p.id), wantIds: [cheapest.id], cpuTeamId: id, acceptedProposal: true });
        if (!r3.ok && /对方硬帽/.test(r3.reason)) out.addRefused++;
      }
    }

    // 4. every offer the CPU makes can be accepted
    const probe = structuredClone(st);
    probe.playerSeason = {};
    for (const p of probe.teams[probe.userTeamId].players.slice(0, 3)) {
      probe.playerSeason[`${probe.userTeamId}:${p.id}`] = { stats: { gp: 20, pts: 520, plusMinus: 80 } };
    }
    probe.tradeProposals = proposals.generateTradeProposals(probe);
    for (const proposal of probe.tradeProposals) {
      out.offers++;
      const res = proposals.acceptTradeProposal(structuredClone(probe), proposal.id);
      if (!res.ok) out.offersBounced.push(res.reason);
    }
  }
  return out;
}, 3);

if (result.error) check("league builds in the browser", false, result.error);
else {
  console.log(JSON.stringify(result, null, 1));
  check("every CPU club in a fresh league is over the cap line (the situation this rule must cope with)", result.overLine >= result.clubs * 0.9, `${result.overLine}/${result.clubs}`);
  check("a salary-neutral 2nd-round pick swap is accepted by (nearly) every club", result.pickSwapOk >= result.clubs * 0.9, `${result.pickSwapOk}/${result.clubs}`);
  check("a deal that sheds an over-cap club's salary is not stopped by the cap", result.shedTried > 0 && result.shedOk === result.shedTried, `${result.shedOk}/${result.shedTried}`);
  check("a deal that adds salary to an over-cap club is still refused (a real sample, and every one refused)", result.addTried >= 30 && result.addRefused === result.addTried, `${result.addRefused}/${result.addTried}`);
  check("the CPU makes offers at all", result.offers > 0, `${result.offers} offers`);
  check("every offer the CPU makes can be accepted", result.offersBounced.length === 0, result.offersBounced.slice(0, 2).join(" | "));
}
check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
const failed = report.filter((r) => r.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
