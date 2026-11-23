// B61: the season hub's heading and "next game" card are pure now (js/ui/seasonHubView.js). Hand-built seasons, no engine sim.
// The move was proven identical to the old inline code on real engine seasons (see docs/BACKLOG.md B61 step 8).
import test from "node:test";
import assert from "node:assert/strict";
import { setLang } from "../js/i18n.js";
import { hubHeading, nextCardView } from "../js/ui/seasonHubView.js";

const helpers = { hubTeamHex: (t) => `#${t.id}`, playoffSeriesLabel: (st, s) => `LBL${s.round}` };
const teams = { A: { id: "A", name: "Aces" }, B: { id: "B", name: "<b>Bolts</b>" } };
const base = (over) => ({ phase: "regular", year: 2024, mode: "modern", userTeamId: "A", teams, schedule: [[{ homeId: "A", awayId: "B", played: false }]], rsGames: 82, standings: { A: { w: 3, l: 1 } }, ...over });
const card = (st, opts, h) => nextCardView(st, { phase: st.phase, ...opts }, h); // the phase the hub saw before it advanced the schedule
const pay = { payroll: 100_000_000, space: 5_000_000, overCap: false };

test("heading: title names the team and the season, the pills split on the middle dot, a My Team season shows the lock instead of payroll", () => {
  setLang("zh");
  const h = hubHeading(base(), { you: teams.A, pay, lang: "zh" });
  assert.equal(h.title, "Aces · 2024 赛季");
  assert.ok(h.metaParts.length >= 3 && h.metaParts.every(Boolean), h.metaParts.join("|"));
  assert.equal(h.metaParts[0], "Aces 3胜1负", "the first pill is the record");
  assert.ok(h.metaParts.some((p) => p.startsWith("薪资")) && h.metaParts.some((p) => p.startsWith("空间")));
  const my = hubHeading(base({ myTeam: { goldEarned: 0 } }), { you: teams.A, pay, lang: "zh" });
  assert.ok(my.metaParts.includes("阵容已锁定"));
  assert.ok(!my.metaParts.some((p) => p.startsWith("薪资")), "no payroll to alarm a frozen roster");
  assert.ok(hubHeading(base({ myTeam: { goldEarned: 75 } }), { you: teams.A, pay, lang: "zh" }).metaParts.some((p) => p.includes("¤75")), "gold earned shows once there is some");
  assert.ok(!my.metaParts.some((p) => p.includes("🪙")), "and not when there is none");
  assert.equal(hubHeading(base(), { you: undefined, pay, lang: "zh" }).title, "我方 · 2024 赛季", "an unnamed team falls back");
});

test("heading: a historical season uses the year label and counts the teams; going over the cap says so", () => {
  setLang("en");
  const hist = base({ mode: "historical", league: { yearLabel: "1995-96" }, teams });
  const h = hubHeading(hist, { you: teams.A, pay: { ...pay, overCap: true }, lang: "en" });
  assert.equal(h.title, "Aces · 1995-96 Historic Season");
  assert.ok(h.metaParts.some((p) => /teams, historic rosters/.test(p)));
  assert.ok(h.metaParts.some((p) => /over soft cap/.test(p)));
  assert.equal(hubHeading(base({ mode: "historical" }), { you: teams.A, pay, lang: "en" }).title, "Aces · 2024 Season", "historical without a label falls back to the plain year");
});

test("regular season: the matchup is escaped HTML with the user's side marked, all three buttons are live; no game left -> all disabled", () => {
  setLang("zh");
  const withGame = card(base({ userTeamId: "B" }), { info: { game: { homeId: "A", awayId: "B" }, day: 4 } }, helpers);
  assert.match(withGame.html, /<span class="nm-team"><i class="nm-dot" style="background:#A"><\/i>Aces<\/span>/);
  assert.match(withGame.html, /nm-team nm-you"><i class="nm-dot" style="background:#B"><\/i>&lt;b&gt;Bolts&lt;\/b&gt;/, "the user is the away side here and a hostile name is escaped");
  assert.match(withGame.html, /第 1\/82 场 · 日程日 5/);
  const evilHome = card(base({ teams: { A: { id: "A", name: "<img src=x onerror=1>" }, B: teams.B } }), { info: { game: { homeId: "A", awayId: "B" }, day: 0 } }, helpers);
  assert.ok(evilHome.html.includes("&lt;img src=x onerror=1&gt;") && !evilHome.html.includes("<img"), "the home name is escaped too");
  assert.deepEqual([withGame.play, withGame.simOne, withGame.simWeek], [false, false, false]);
  const over = card(base(), { info: null }, helpers);
  assert.match(over.text, /常规赛已打完/);
  assert.deepEqual([over.play, over.simOne, over.simWeek], [true, true, true]);
});

test("the card follows the phase the hub SAW, not the one advancing the schedule leaves behind", () => {
  // advanceToUserGame moves a finished regular season on to "awards" (and the old inline code had already picked its branch by then).
  // Reading st.phase after that advance showed the awards sentence instead of "regular season done": caught by the old-vs-new oracle.
  setLang("zh");
  const advanced = base({ phase: "awards" });
  const seen = nextCardView(advanced, { phase: "regular", info: null }, helpers);
  assert.match(seen.text, /常规赛已打完/);
  assert.doesNotMatch(seen.text, /已生成赛季评奖/);
  assert.match(nextCardView(advanced, { phase: "awards", info: null }, helpers).text, /已生成赛季评奖/, "and it is the awards sentence only when the hub opened on awards");
});

test("awards: a hint, everything disabled", () => {
  setLang("en");
  const c = card(base({ phase: "awards" }), { info: null }, helpers);
  assert.match(c.text, /Awards are in/);
  assert.deepEqual([c.play, c.simOne, c.simWeek], [true, true, true]);
});

test("playoffs: your turn shows the series score and venue and enables play + sim-one (never sim-5); no game -> says why", () => {
  setLang("zh");
  const series = { round: 2, high: { id: "A" }, low: { id: "B", name: "Bolts" }, winsHigh: 2, winsLow: 1 };
  const mine = card(base({ phase: "playoffs" }), { info: { series, homeId: "A" } }, helpers);
  assert.equal(mine.text, "LBL2 第 4 场 · 2-1 vs Bolts（主场）");
  assert.deepEqual([mine.play, mine.simOne, mine.simWeek], [false, false, true]);
  const away = card(base({ phase: "playoffs", userTeamId: "B" }), { info: { series, homeId: "A" } }, helpers);
  assert.equal(away.text, "LBL2 第 4 场 · 1-2 vs 对手（客场）", "the user is the low seed here: wins are read from the user's side, the unnamed opponent falls back, and the venue is away");
  const idle = card(base({ phase: "playoffs" }), { info: null }, helpers);
  assert.match(idle.text, /你的系列赛暂无进行中的比赛/);
  assert.deepEqual([idle.play, idle.simOne, idle.simWeek], [true, true, true]);
  const won = card(base({ phase: "playoffs", playoffs: { championId: "A" } }), { info: null }, helpers);
  assert.equal(won.text, "总冠军：Aces");
});

test("done: the text follows My Team / managed career / champion; play and sim-one are disabled", () => {
  setLang("zh");
  const done = (over, managed = false) => card(base({ phase: "done", playoffs: { championId: "A" }, ...over }), { info: null, managed }, helpers);
  assert.match(done({ myTeam: {} }).text, /总冠军：Aces。这一季打完了，点上方「再来一季」继续/);
  assert.match(done({ myTeam: {}, playoffs: {} }).text, /^这一季打完了/);
  assert.match(done({}).text, /可进入休赛期：球员按史实生涯成长\/衰老，并开启 2025 赛季/);
  assert.match(done({}, true).text, /可进入休赛期选秀，完成选择后开启 2025 赛季/);
  assert.equal(done({ playoffs: {} }).text, "赛季结束。可进入休赛期让球员按史实潜力成长。");
  assert.equal(done({ playoffs: {} }, true).text, "赛季结束。可进入休赛期选秀。");
  const c = done({});
  assert.deepEqual([c.play, c.simOne, c.simWeek], [true, true, true]);
});

test("a phase the hub has no card for gets none", () => {
  assert.equal(card(base({ phase: "setup" }), { info: null }, helpers), null);
});
