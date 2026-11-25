// The trade form's two data-driven pieces on the season market tab: the three checkbox columns and the
// salary / value summary line. Pure functions of the season: app.js (renderSeasonMarket) keeps everything
// that touches the page -- it reads the two team pickers and which boxes are ticked, passes those in, and
// writes the result back to the DOM.
//
// Moved out of app.js unchanged (B61 step 14): the markup and every string are byte-for-byte what it inlined
// (i18n-phrases.js depends on them).
import { esc } from "../core/html.js";
import { overall } from "../data/players.js";
import { estimateDraftPickValue } from "../engine/draftPickValue.js";
import { formatSalary, pickValueOf, playerSalary, teamDraftAssets } from "../engine/seasonMarket.js";
import { L, getLang } from "../i18n.js";

/** The second team of a three-team cycle, or null when it is unset or the same club as the first. */
const thirdTeam = (st, tid, tid3) => (tid3 && tid3 !== tid ? st.teams[tid3] : null);

const byOverallDesc = (players) => [...(players || [])].sort((a, b) => overall(b) - overall(a));

/** A club can now hold other clubs' picks, so say whose pick it is when it is not the holder's own. */
function pickLabel(st, pk, holderId) {
  const v = estimateDraftPickValue(pk, { currentYear: st.year, lang: getLang() });
  const from = pk.sourceTeamId && pk.sourceTeamId !== holderId
    ? L(`${esc(st.teams[pk.sourceTeamId]?.name || pk.sourceTeamId)} 的 `, `${esc(st.teams[pk.sourceTeamId]?.name || pk.sourceTeamId)}'s `)
    : "";
  return `<span title="${esc(v.explanation)}">${from}${esc(v.label)}${L(`（≈ +${v.ovrEquivalent} OVR）`, ` (≈ +${v.ovrEquivalent} OVR)`)}</span>`;
}

const tradeCheckboxRow = (cls, id, label) =>
  `<label class="sm-row sm-trade-check"><span><input type="checkbox" class="${cls}" value="${id}"> ${label}</span></label>`;

const playerRows = (cls, players) => byOverallDesc(players)
  .map((p) => tradeCheckboxRow(cls, p.id, `${esc(p.name)} · OVR ${overall(p)} · ${formatSalary(playerSalary(p))}`))
  .join("");

/** Picks sit after the players inside a scrolling list, so they get their own heading (and the column title
 *  says they are there) -- otherwise they read as just more players, below the fold. */
const pickBlock = (rows, count) => (count ? `<div class="sm-pick-head">${L("选秀权", "Picks")} · ${count}</div>${rows}` : "");

/**
 * The three trade columns for "you" against club `tid` (and club `tid3` for a three-team cycle).
 * @returns {string} the markup for #sm-trade-cols
 */
export function tradeColumnsHtml(st, you, tid, tid3) {
  const cpu = st.teams[tid];
  const myPicksPool = teamDraftAssets(st, st.userTeamId);
  const cpuPicksPool = teamDraftAssets(st, tid);
  const myPickRows = pickBlock(
    myPicksPool.map((pk) => tradeCheckboxRow("sm-give-pick", pk.id, pickLabel(st, pk, st.userTeamId))).join(""),
    myPicksPool.length,
  );
  const cpuPickRows = pickBlock(
    cpuPicksPool.map((pk) => tradeCheckboxRow("sm-want-pick", pk.id, pickLabel(st, pk, tid))).join(""),
    cpuPicksPool.length,
  );
  const cpu3 = thirdTeam(st, tid, tid3);
  // Three-team cycle: picks are not supported there yet, so hide pick rows rather than let the
  // user tick something the engine will silently ignore.
  const team3Rows = cpu3 ? playerRows("sm-want3-player", cpu3.players) : "";
  const countNote = (players, picks) =>
    `<span class="sm-count"> · ${L(`${players || 0} 名球员`, `${players || 0} players`)}${cpu3 || !picks ? "" : ` · ${L(`${picks} 个选秀权（列表下方）`, `${picks} picks (below the list)`)}`}</span>`;
  return `
      <section>
        <h5 class="tiny">${L("我方送出", "You send")}${cpu3 ? L(`（→ ${esc(cpu.name)}）`, ` (→ ${esc(cpu.name)})`) : ""}${countNote(you.players?.length, myPicksPool.length)}</h5>
        <div class="sm-list">${playerRows("sm-give-player", you.players)}${cpu3 ? "" : myPickRows}</div>
      </section>
      <section>
        <h5 class="tiny">${L("对方送出", "They send")}${cpu3 ? L(`（→ ${esc(cpu3.name)}）`, ` (→ ${esc(cpu3.name)})`) : ""}${countNote(cpu?.players?.length, cpuPicksPool.length)}</h5>
        <div class="sm-list">${playerRows("sm-want-player", cpu?.players)}${cpu3 ? "" : cpuPickRows}</div>
      </section>
      ${cpu3 ? `<section>
        <h5 class="tiny">${L("第三方送出（→ 我方）", "Third team sends (→ you)")}</h5>
        <div class="sm-list">${team3Rows}</div>
      </section>` : ""}
    `;
}

/**
 * The one-line salary / value comparison under the trade columns.
 * @param {{ givePlayers?: string[], wantPlayers?: string[], want3Players?: string[], givePicks?: string[], wantPicks?: string[] }} ticked
 *   the ids of the ticked boxes in each column
 */
export function tradeSummaryText(st, you, tid, tid3, ticked = {}) {
  const cpu = st.teams[tid];
  const cpu3 = thirdTeam(st, tid, tid3);
  const pick = (pool, ids) => (ids || []).map((id) => pool.find((p) => p.id === id)).filter(Boolean);
  const give = pick(you.players, ticked.givePlayers);
  // In a three-team cycle the user receives team 3's players, not team 2's.
  const want = cpu3 ? pick(cpu3.players, ticked.want3Players) : pick(cpu.players, ticked.wantPlayers);
  const givePicks = cpu3 ? [] : pick(teamDraftAssets(st, st.userTeamId), ticked.givePicks);
  const wantPicks = cpu3 ? [] : pick(teamDraftAssets(st, tid), ticked.wantPicks);
  if (!give.length && !want.length && !givePicks.length && !wantPicks.length) {
    return L("勾选两边要换的东西后，这里会显示薪资/身价对比", "Tick things on both sides and the salary/value comparison shows here");
  }
  const salOut = give.reduce((s, p) => s + playerSalary(p), 0);
  const salIn = want.reduce((s, p) => s + playerSalary(p), 0);
  const valOut = give.reduce((s, p) => s + overall(p), 0) + givePicks.reduce((s, pk) => s + pickValueOf(st, pk), 0);
  const valIn = want.reduce((s, p) => s + overall(p), 0) + wantPicks.reduce((s, pk) => s + pickValueOf(st, pk), 0);
  return L(`送出：薪资 ${formatSalary(salOut)} · 身价≈${valOut.toFixed(1)}｜得到：薪资 ${formatSalary(salIn)} · 身价≈${valIn.toFixed(1)}`, `Out: salary ${formatSalary(salOut)} · value ≈${valOut.toFixed(1)} | In: salary ${formatSalary(salIn)} · value ≈${valIn.toFixed(1)}`);
}
