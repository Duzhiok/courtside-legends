// B61 step 9: the season market tab's markup is a pure function of the season (js/ui/seasonMarketView.js). These tests build a real
// season and assert what the tab says and which buttons it enables; renderSeasonMarket in app.js only prepares the season, deals the
// offers, writes this onto the page and wires the buttons.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAYERS, seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { historicalSeason } from "../js/data/historicalSeasons.js";
import { setLang } from "../js/i18n.js";
import { buildCpuTeamForYear, createSeason } from "../js/engine/season.js";
import { SEASON_APRON, SEASON_MAX_ROSTER, payrollSummary } from "../js/engine/seasonMarket.js";
import { LISTING_PREFERENCES, setListingPref } from "../js/engine/tradeListing.js";
import { listPlayerForTrade } from "../js/engine/tradeProposals.js";
import { marketHtml } from "../js/ui/seasonMarketView.js";

const YEAR = 2004;
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
if (!PLAYERS.some((p) => p.season === YEAR)) PLAYERS.push(...ROWS.filter((r) => r.season === YEAR).map(seasonToCard));

function freshSeason() {
  const meta = historicalSeason(YEAR).teams[0];
  return createSeason({ userTeamId: meta.id, userTeamName: meta.name, userTeam: buildCpuTeamForYear(YEAR, meta, new Set()), mode: "historical", year: YEAR, seed: 11 });
}
const nobody = () => [];
const render = (st, over = {}) => {
  const you = st.teams[st.userTeamId];
  return marketHtml(st, { you, pay: payrollSummary(you), proposals: [], managed: false, learnedOf: nobody, ...over });
};
// Scale the user's payroll to `target` so the signing rules are the only thing that varies.
function atPayroll(st, target) {
  const you = st.teams[st.userTeamId];
  const k = target / payrollSummary(you).payroll;
  for (const p of you.players) p.salary = Math.max(1, (Number(p.salary) || 8) * k);
  return st;
}
const signButtons = (html) => [...html.matchAll(/<button[^>]*data-sign="[^"]*"[^>]*>/g)].map((m) => m[0]);
const enabled = (buttons) => buttons.filter((b) => !/\sdisabled\b/.test(b)).length;

test("the tab has its five sections, the cap card reads the real roster, and the free agents are capped at 48", () => {
  setLang("zh");
  const st = freshSeason();
  const html = render(st);
  const n = st.teams[st.userTeamId].players.length;
  assert.match(html, new RegExp(`名单 <strong>${n}</strong>/${SEASON_MAX_ROSTER}`));
  for (const marker of ["sm-cap-card", "sm-staff", "我的阵容 · 裁人", "球员自由市场 · 签约", "收到的交易请求", "sm-trade"]) assert.ok(html.includes(marker), marker);
  assert.ok(signButtons(html).length > 0, "free agents are listed");
  const deep = freshSeason();
  for (let i = 0; deep.freeAgents.length < 60; i += 1) deep.freeAgents.push({ ...deep.freeAgents[i % deep.freeAgents.length], id: `extra-${i}` });
  assert.equal(signButtons(render(deep)).length, 48, "a deep free-agent pool shows its best 48");
  assert.equal([...html.matchAll(/data-cut="/g)].length, n, "one cut button per rostered player");
});

test("a signing is possible only with a roster spot and cap room (the roster limit is the one varying here)", () => {
  setLang("zh");
  const roomy = atPayroll(freshSeason(), 60);
  assert.ok(enabled(signButtons(render(roomy))) > 0, "cheap payroll + free spot: signings are open");
  const full = atPayroll(freshSeason(), 60);
  const you = full.teams[full.userTeamId];
  while (you.players.length < SEASON_MAX_ROSTER && full.freeAgents.length) { const fa = full.freeAgents.shift(); fa.salary = 1; you.players.push(fa); }
  assert.equal(you.players.length, SEASON_MAX_ROSTER);
  assert.equal(enabled(signButtons(render(full))), 0, "a full roster closes every Sign button");
  const broke = atPayroll(freshSeason(), SEASON_APRON + 50);
  assert.equal(enabled(signButtons(render(broke))), 0, "over the hard cap nothing can be signed");
});

test("a listed player shows the chip, the unlist button and the sale preference; an unmet preference earns a note", () => {
  setLang("zh");
  const st = freshSeason();
  const [first, second] = st.teams[st.userTeamId].players;
  assert.doesNotMatch(render(st), /已挂牌|sm-list-pref/);
  listPlayerForTrade(st, first.id, "zh");
  const html = render(st);
  assert.match(html, /已挂牌/);
  assert.match(html, new RegExp(`data-list-trade="${first.id}"[^>]*>取消挂牌`));
  assert.match(html, new RegExp(`data-list-pref="${first.id}"`));
  assert.doesNotMatch(html, /unmet-listing/, "the default preference never complains");
  listPlayerForTrade(st, second.id, "zh");
  const picky = Object.keys(LISTING_PREFERENCES).find((k) => k !== "any");
  setListingPref(st, second.id, picky, "zh");
  assert.match(render(st, { proposals: [] }), /unmet-listing/, "a preference with no offer answering it is said out loud");
  const answered = render(st, { proposals: [{ id: "p1", giveIds: [second.id], fromTeamName: "X", targetName: "Y", reason: "r", receivePlayers: [], offerPicks: [] }] });
  assert.doesNotMatch(answered, /unmet-listing/, "...and not when a proposal already covers him");
});

test("pick swaps only show for a managed career; learned skills come from the caller", () => {
  setLang("zh");
  const st = freshSeason();
  assert.doesNotMatch(render(st, { managed: false }), /sm-picks/);
  assert.match(render(st, { managed: true }), /sm-picks/);
  assert.doesNotMatch(render(st), /learned-badge/);
  assert.match(render(st, { learnedOf: (p) => (p === st.teams[st.userTeamId].players[0] ? ["x"] : []) }), /learned-badge/);
});

test("proposals render as cards with their actions, and a second-round offer cannot be countered", () => {
  setLang("zh");
  const st = freshSeason();
  const offer = (id, round) => ({ id, round, giveIds: [], fromTeamName: "Rivals", targetName: "Star", reason: "needs a star", receivePlayers: [], offerPicks: [] });
  const html = render(st, { proposals: [offer("a", 1), offer("b", 2)] });
  assert.equal([...html.matchAll(/class="trade-proposal-card"/g)].length, 2);
  assert.match(html, /2 份待处理/);
  assert.equal([...html.matchAll(/data-trade-proposal-action="counter"/g)].length, 1, "only the first-round offer has a Counter button");
  assert.match(render(st), /暂无新报价/);
});

test("coach and opponent-team names are escaped, and the English page says it in English", () => {
  setLang("zh");
  const st = freshSeason();
  st.teams[st.userTeamId].coach = { id: "c1", name: "<b>Coach</b>", season: 2004 };
  const rival = Object.keys(st.teams).find((id) => id !== st.userTeamId);
  st.teams[rival].name = "<i>Rivals</i>";
  const html = render(st);
  assert.ok(!html.includes("<b>Coach</b>") && html.includes("&lt;b&gt;Coach&lt;/b&gt;"), "coach name escaped");
  assert.ok(!html.includes("<i>Rivals</i>") && html.includes("&lt;i&gt;Rivals&lt;/i&gt;"), "opponent team name escaped");
  setLang("en");
  const en = render(freshSeason());
  setLang("zh");
  assert.match(en, /Salary cap/);
  assert.match(en, /Trade offers received/);
  assert.doesNotMatch(en, /工资帽|收到的交易请求/);
});

test("S-P1-1: the trade-market team dropdown escapes the name and the id of the opposing teams", () => {
  setLang("zh");
  const st = freshSeason();
  const rival = Object.keys(st.teams).find((id) => id !== st.userTeamId);
  st.teams[rival].name = "<img src=x onerror=1>";
  st.teams['x"><script>1</script>'] = st.teams[rival]; // the dropdown's value is the team's key in the season
  delete st.teams[rival];
  const html = render(st);
  assert.ok(!html.includes("<script>1</script>") && !html.includes("<img src=x"), "nothing from the imported save reaches the page as markup");
  assert.ok(html.includes("&lt;img src=x onerror=1&gt;"), "the name is there, escaped");
  assert.ok(html.includes("&quot;&gt;&lt;script&gt;"), "the id is escaped inside the attribute");
});
