import test from "node:test";
import assert from "node:assert/strict";
import { esc } from "../js/core/html.js";
import { overall } from "../js/data/players.js";
import { estimateDraftPickValue } from "../js/engine/draftPickValue.js";
import { formatSalary, pickValueOf, playerSalary, teamDraftAssets } from "../js/engine/seasonMarket.js";
import { L, getLang, setLang } from "../js/i18n.js";
import { tradeColumnsHtml, tradeSummaryText } from "../js/ui/tradeBoardView.js";

// B61 step 14: the trade form's columns + summary moved out of app.js renderSeasonMarket. The ORACLE below is the
// old inline code, mechanically lifted from app.js at 85161474 (only the DOM reads became parameters and the DOM
// writes became `return`). The new pure functions must match it byte-for-byte on every scenario.
const BAD = "<img src=x onerror=alert(1)>";
const player = (id, ovr, salary, name = id) => ({ id, name, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: 25 });
const roster = (prefix, n, base) => Array.from({ length: n }, (_, i) => player(`${prefix}${i}`, base - i, 50 + i * 20, `${prefix} Name ${i}`));

function season(extra = {}) {
  return {
    year: 1994, dayIndex: 10, phase: "regular", userTeamId: "USER",
    teams: {
      USER: { name: "我方", players: roster("u", 8, 80) },
      CPU: { name: "对手", players: roster("c", 6, 78) },
      CPU3: { name: "第三方", players: roster("t", 5, 76) },
    },
    tradeLog: [], draftAssets: [], ...extra,
  };
}

function oracle(st, you, tid, tidThree) {
  const tid3 = tidThree;
  // A club can now hold other clubs' picks, so say whose pick it is when it is not the holder's own.
  const pickLabel = (pk, holderId) => {
    const v = estimateDraftPickValue(pk, { currentYear: st.year, lang: getLang() });
    const from = pk.sourceTeamId && pk.sourceTeamId !== holderId
      ? L(`${esc(st.teams[pk.sourceTeamId]?.name || pk.sourceTeamId)} 的 `, `${esc(st.teams[pk.sourceTeamId]?.name || pk.sourceTeamId)}'s `)
      : "";
    return `<span title="${esc(v.explanation)}">${from}${esc(v.label)}${L(`（≈ +${v.ovrEquivalent} OVR）`, ` (≈ +${v.ovrEquivalent} OVR)`)}</span>`;
  };
  const tradeCheckboxRow = (cls, id, label) =>
    `<label class="sm-row sm-trade-check"><span><input type="checkbox" class="${cls}" value="${id}"> ${label}</span></label>`;

  const oldSummary = (checked) => {
        const cpu = st.teams[tid];
    const myPicksPool = teamDraftAssets(st, st.userTeamId);
    const cpuPicksPool = teamDraftAssets(st, tid);
    const checkedVals = (sel) => checked[sel] || [];
    const give = checkedVals(".sm-give-player:checked").map((id) => you.players.find((p) => p.id === id)).filter(Boolean);
        const cpu3 = tid3 && tid3 !== tid ? st.teams[tid3] : null;
    // In a three-team cycle the user receives team 3's players, not team 2's.
    const want = cpu3
      ? checkedVals(".sm-want3-player:checked").map((id) => cpu3.players.find((p) => p.id === id)).filter(Boolean)
      : checkedVals(".sm-want-player:checked").map((id) => cpu.players.find((p) => p.id === id)).filter(Boolean);
    const givePicks = cpu3 ? [] : checkedVals(".sm-give-pick:checked").map((id) => myPicksPool.find((p) => p.id === id)).filter(Boolean);
    const wantPicks = cpu3 ? [] : checkedVals(".sm-want-pick:checked").map((id) => cpuPicksPool.find((p) => p.id === id)).filter(Boolean);
    const salOut = give.reduce((s, p) => s + playerSalary(p), 0);
    const salIn = want.reduce((s, p) => s + playerSalary(p), 0);
    const valOut = give.reduce((s, p) => s + overall(p), 0) + givePicks.reduce((s, pk) => s + pickValueOf(st, pk), 0);
    const valIn = want.reduce((s, p) => s + overall(p), 0) + wantPicks.reduce((s, pk) => s + pickValueOf(st, pk), 0);
    if (!give.length && !want.length && !givePicks.length && !wantPicks.length) {
      return L("勾选两边要换的东西后，这里会显示薪资/身价对比", "Tick things on both sides and the salary/value comparison shows here");
    }
    return L(`送出：薪资 ${formatSalary(salOut)} · 身价≈${valOut.toFixed(1)}｜得到：薪资 ${formatSalary(salIn)} · 身价≈${valIn.toFixed(1)}`, `Out: salary ${formatSalary(salOut)} · value ≈${valOut.toFixed(1)} | In: salary ${formatSalary(salIn)} · value ≈${valIn.toFixed(1)}`);
  };


  const oldCols = () => {
    const cpu = st.teams[tid];
    const myPicksPool = teamDraftAssets(st, st.userTeamId);
    const cpuPicksPool = teamDraftAssets(st, tid);
    const myPlayerRows = [...(you.players || [])]
      .sort((a, b) => overall(b) - overall(a))
      .map((p) => tradeCheckboxRow("sm-give-player", p.id, `${esc(p.name)} · OVR ${overall(p)} · ${formatSalary(playerSalary(p))}`))
      .join("");
    // Picks sit after the players inside a scrolling list, so they get their own heading (and the
    // column title says they are there) -- otherwise they read as just more players, below the fold.
    const pickBlock = (rows, count) => (count ? `<div class="sm-pick-head">${L("选秀权", "Picks")} · ${count}</div>${rows}` : "");
    const myPickRows = pickBlock(
      myPicksPool.map((pk) => tradeCheckboxRow("sm-give-pick", pk.id, pickLabel(pk, st.userTeamId))).join(""),
      myPicksPool.length,
    );
    const cpuPlayerRows = [...(cpu?.players || [])]
      .sort((a, b) => overall(b) - overall(a))
      .map((p) => tradeCheckboxRow("sm-want-player", p.id, `${esc(p.name)} · OVR ${overall(p)} · ${formatSalary(playerSalary(p))}`))
      .join("");
    const cpuPickRows = pickBlock(
      cpuPicksPool.map((pk) => tradeCheckboxRow("sm-want-pick", pk.id, pickLabel(pk, tid))).join(""),
      cpuPicksPool.length,
    );
        const cpu3 = tid3 && tid3 !== tid ? st.teams[tid3] : null;
    // Three-team cycle: picks are not supported there yet, so hide pick rows rather than let the
    // user tick something the engine will silently ignore.
    const team3Rows = cpu3
      ? [...(cpu3.players || [])]
          .sort((a, b) => overall(b) - overall(a))
          .map((p) => tradeCheckboxRow("sm-want3-player", p.id, `${esc(p.name)} · OVR ${overall(p)} · ${formatSalary(playerSalary(p))}`))
          .join("")
      : "";
    const countNote = (players, picks) =>
      `<span class="sm-count"> · ${L(`${players || 0} 名球员`, `${players || 0} players`)}${cpu3 || !picks ? "" : ` · ${L(`${picks} 个选秀权（列表下方）`, `${picks} picks (below the list)`)}`}</span>`;
    return `
      <section>
        <h5 class="tiny">${L("我方送出", "You send")}${cpu3 ? L(`（→ ${esc(cpu.name)}）`, ` (→ ${esc(cpu.name)})`) : ""}${countNote(you.players?.length, myPicksPool.length)}</h5>
        <div class="sm-list">${myPlayerRows}${cpu3 ? "" : myPickRows}</div>
      </section>
      <section>
        <h5 class="tiny">${L("对方送出", "They send")}${cpu3 ? L(`（→ ${esc(cpu3.name)}）`, ` (→ ${esc(cpu3.name)})`) : ""}${countNote(cpu?.players?.length, cpuPicksPool.length)}</h5>
        <div class="sm-list">${cpuPlayerRows}${cpu3 ? "" : cpuPickRows}</div>
      </section>
      ${cpu3 ? `<section>
        <h5 class="tiny">${L("第三方送出（→ 我方）", "Third team sends (→ you)")}</h5>
        <div class="sm-list">${team3Rows}</div>
      </section>` : ""}
    `;
  };

  return { cols: oldCols(), summary: oldSummary };
}

const scenarios = {
  "two-team": [season(), "CPU", undefined],
  "two-team, third picker unset": [season(), "CPU", ""],
  "third picker == first picker is ignored": [season(), "CPU", "CPU"],
  "three-team cycle": [season(), "CPU", "CPU3"],
  "hostile names everywhere": [season({
    teams: {
      USER: { name: BAD, players: roster("u", 3, 80).map((p) => ({ ...p, name: BAD })) },
      CPU: { name: BAD, players: roster("c", 3, 78).map((p) => ({ ...p, name: BAD })) },
      CPU3: { name: BAD, players: roster("t", 3, 76).map((p) => ({ ...p, name: BAD })) },
    },
  }), "CPU", "CPU3"],
  "empty rosters": [season({ teams: { USER: { name: "我方", players: [] }, CPU: { name: "对手", players: [] }, CPU3: { name: "第三方", players: [] } } }), "CPU", "CPU3"],
};

for (const lang of ["zh", "en"]) {
  for (const [label, [st, tid, tid3]] of Object.entries(scenarios)) {
    test(`tradeColumnsHtml matches the old inline code byte-for-byte (${lang}: ${label})`, () => {
      const before = getLang();
      setLang(lang);
      try {
        const you = st.teams[st.userTeamId];
        assert.equal(tradeColumnsHtml(st, you, tid, tid3), oracle(st, you, tid, tid3).cols);
      } finally { setLang(before); }
    });

    test(`tradeSummaryText matches the old inline code on every tick pattern (${lang}: ${label})`, () => {
      const before = getLang();
      setLang(lang);
      try {
        const you = st.teams[st.userTeamId];
        const cpu = st.teams[tid];
        const myPicks = teamDraftAssets(st, st.userTeamId);
        const cpuPicks = teamDraftAssets(st, tid);
        const cases = [
          {},
          { givePlayers: you.players.slice(0, 2).map((p) => p.id), wantPlayers: cpu.players.slice(0, 1).map((p) => p.id) },
          { givePicks: myPicks.slice(0, 2).map((p) => p.id), wantPicks: cpuPicks.slice(0, 1).map((p) => p.id) },
          { givePlayers: you.players.slice(0, 1).map((p) => p.id), want3Players: (st.teams.CPU3?.players || []).slice(0, 2).map((p) => p.id), givePicks: myPicks.slice(0, 1).map((p) => p.id) },
          { givePlayers: ["no-such-id"], wantPlayers: ["nope"] },
        ];
        const old = oracle(st, you, tid, tid3).summary;
        for (const ticked of cases) {
          const checked = {
            ".sm-give-player:checked": ticked.givePlayers, ".sm-want-player:checked": ticked.wantPlayers,
            ".sm-want3-player:checked": ticked.want3Players, ".sm-give-pick:checked": ticked.givePicks, ".sm-want-pick:checked": ticked.wantPicks,
          };
          assert.equal(tradeSummaryText(st, you, tid, tid3, ticked), old(checked), JSON.stringify(ticked));
        }
      } finally { setLang(before); }
    });
  }
}

test("tradeColumnsHtml: a hostile player/team name never becomes markup, in all three columns", () => {
  const [st, tid, tid3] = scenarios["hostile names everywhere"];
  const html = tradeColumnsHtml(st, st.teams.USER, tid, tid3);
  assert.ok(!html.includes(BAD), "raw crafted name leaked");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  for (const cls of ["sm-give-player", "sm-want-player", "sm-want3-player"]) assert.ok(html.includes(`class="${cls}"`), cls);
});

test("tradeColumnsHtml: the three-team cycle hides pick rows (the engine would silently ignore them)", () => {
  const st = season();
  assert.ok(tradeColumnsHtml(st, st.teams.USER, "CPU", "").includes("sm-give-pick"));
  assert.ok(!tradeColumnsHtml(st, st.teams.USER, "CPU", "CPU3").includes("sm-give-pick"));
});
