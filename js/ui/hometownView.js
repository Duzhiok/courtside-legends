/**
 * Hometown Legends view (ADR-009 H2/H3/H5, M4-B): a pure HTML builder for
 * the My World hometown section, kept in its OWN module so M4-A's identity
 * editor and the My World view stay untouched apart from one hook line.
 *
 * Honesty rules: relation labels are exact (Born in / Grew up in / Played
 * for — a TEAM_LEGACY player is never called a hometown star), the fallback
 * level is always labelled (City / Region / Country legends, or the chosen
 * idol), and empty states say so. Places are the player's own free text
 * from account.identityPlaces; this view never edits them (that is M4-A).
 */
import { hometownHonours, levelLabel, locationName, relationLabel, resolveForIdentity } from "../data/hometown/hometown.js";
import { sanitizeHometownState } from "../data/hometown/hometownState.js";
import { esc } from "../core/html.js";
import { TL } from "../i18n.js";


function legendRows(resolution, lang, names) {
  if (!resolution) return "";
  if (resolution.needsIdol) {
    return `<p class="mw-empty">${TL(lang, "这里还没有策展传奇。先选一位童年偶像，这里永远不会空着。", "No curated legends here yet. Pick your chosen idol — this spot is never empty.")}</p>`;
  }
  const level = `<span class="mw-ht-level">${esc(levelLabel(resolution.level, lang))}</span>`;
  const rows = resolution.legends.map((l) => {
    const name = names?.[l.bref] || l.bref;
    const where = resolution.matchedLocation ? locationName(resolution.matchedLocation, lang) : "";
    const label = l.relation === "IDOL" ? relationLabel("IDOL", lang) : `${relationLabel(l.relation, lang)}${where ? ` · ${where}` : ""}`;
    return `<li class="mw-ht-legend"><span class="mw-ht-name">${esc(name)}</span><span class="mw-ht-rel">${esc(label)}</span></li>`;
  }).join("");
  return `${level}<ul class="mw-ht-legends">${rows}</ul>`;
}

function placeBlock(title, resolution, lang, names) {
  if (!resolution) return "";
  return `<div class="mw-ht-place"><p class="mw-line tiny"><strong>${title}</strong> · ${esc(resolution.placeText)}</p>${legendRows(resolution, lang, names)}</div>`;
}

/**
 * The full hometown section. `identity` is readIdentity()'s result (or any
 * { identityPlaces } shape); `state` is the hometown state (idol + challenge
 * record); `names` maps bref -> display name; `challengeAvailable` says the
 * represented city's lineup reached 5 people.
 * Records/locations may be injected (tests); defaults are the curated tables.
 */
export function hometownHtml({ identity, state, lang = "zh", names = {}, challengeAvailable = false, records, locations } = {}) {
  const st = sanitizeHometownState(state);
  const resolved = resolveForIdentity(identity?.identityPlaces, { records, locations, idolBref: st.idolBref });
  const honours = hometownHonours(identity, st);
  const hasPlaces = !!(resolved.birthplace || resolved.grewUpIn.length || resolved.representedCity);
  const head = `<h3>🏠 ${TL(lang, "家乡传奇", "Hometown Legends")}</h3>`;
  const privacy = `<p class="tiny mw-note">${TL(lang, "地点为玩家自述，最细到城市；不收集住址、不请求定位。出生地不会带来任何卡牌、金币或竞技加成——只有故事、荣誉与外观。", "Places are self-reported, city-level only. No address is collected and location access is never requested. A birthplace never grants cards, gold or any competitive edge — only story, honours and looks.")}</p>`;
  if (!hasPlaces && !st.idolBref) {
    return `<section class="mw-card mw-hometown" id="mw-hometown">${head}
      <p class="mw-empty">${TL(lang, "还没有填写出生地、成长城市或代表城市。在「编辑个人资料」里写下你的城市，就能看到属于那里的篮球传奇。", "No birthplace, childhood city or represented city yet. Add your cities in Edit profile to see the basketball legends tied to them.")}</p>
      ${idolBlock(honours, lang, names)}
      ${privacy}</section>`;
  }
  const blocks = [
    placeBlock(TL(lang, "出生地", "Birthplace"), resolved.birthplace, lang, names),
    ...resolved.grewUpIn.map((r) => placeBlock(TL(lang, "成长地", "Grew up in"), r, lang, names)),
    placeBlock(TL(lang, "代表城市", "Representing"), resolved.representedCity, lang, names),
  ].join("");
  const challengeBtn = honours.representedCity
    ? challengeAvailable
      ? `<div class="btn-row"><button type="button" class="btn small mw-gold" data-mw-action="play-hometown-challenge">${TL(lang, "🏀 家乡挑战：代表城市传奇阵 vs 历史强队", "🏀 Hometown Challenge: your city's legends vs a historic powerhouse")}</button></div>`
      : `<p class="mw-empty">${TL(lang, "代表城市的传奇不足 5 人，家乡挑战暂不开放（不会用虚构球员凑数）。", "Fewer than five legends are tied to your represented city, so the Hometown Challenge stays closed — it is never padded with invented players.")}</p>`
    : "";
  const ch = honours.challenge;
  const challengeLine = ch.played
    ? `<p class="mw-line tiny">${TL(lang, `家乡挑战 ${ch.played} 场 · ${ch.wins} 胜 ${ch.losses} 负`, `Hometown Challenge: ${ch.played} played · ${ch.wins}W ${ch.losses}L`)}${ch.lastRepresentedCity ? TL(lang, ` · 最近代表 ${ch.lastRepresentedCity}`, ` · last represented ${ch.lastRepresentedCity}`) : ""}${ch.lastResult ? TL(lang, ` · 最近一场${ch.lastResult === "win" ? "胜" : "负"}`, ` · last game ${ch.lastResult === "win" ? "won" : "lost"}`) : ""}</p>`
    : `<p class="mw-line tiny">${TL(lang, "家乡挑战还没有战绩。", "No Hometown Challenge games yet.")}</p>`;
  const honoursBlock = `<div class="mw-ht-honours"><p class="mw-line tiny"><strong>${TL(lang, "家乡荣誉", "Hometown Honours")}</strong></p>
    <p class="mw-line tiny">${TL(lang, "出生", "Born")} · ${esc(honours.birthplace || TL(lang, "未填写", "Not set"))}<br />${TL(lang, "成长", "Grew up")} · ${esc(honours.grewUpIn || TL(lang, "未填写", "Not set"))}<br />${TL(lang, "代表", "Representing")} · ${esc(honours.representedCity || TL(lang, "未填写", "Not set"))}</p>
    ${challengeLine}</div>`;
  return `<section class="mw-card mw-hometown" id="mw-hometown">${head}${blocks}${idolBlock(honours, lang, names)}${challengeBtn}${honoursBlock}${privacy}
    <p class="mw-status" id="mw-hometown-status" role="status" aria-live="polite"></p></section>`;
}

function idolBlock(honours, lang, names) {
  const idol = honours.idolBref ? esc(names?.[honours.idolBref] || honours.idolBref) : null;
  const current = idol
    ? `<p class="mw-line tiny">${TL(lang, `童年偶像 · ${idol}（纯故事与展示，不影响比赛，也不是导师）`, `Childhood idol · ${idol} (story and display only — no effect on games, and not a mentor)`)}</p>`
    : `<p class="mw-line tiny">${TL(lang, "还没有童年偶像。从全名册里任选一位，不受时间线限制。", "No childhood idol yet. Pick anyone from the full roster — no timeline limits.")}</p>`;
  return `<div class="mw-ht-idol">${current}
    <form class="mw-ht-idol-form" id="mw-hometown-idol-form">
      <input name="idol-query" type="search" placeholder="${TL(lang, "搜索球员，如 乔丹 / Jordan", "Search a player, e.g. Jordan")}" aria-label="${TL(lang, "搜索童年偶像", "Search for a childhood idol")}" />
      <button type="submit" class="btn small">${TL(lang, "搜索", "Search")}</button>
    </form>
    <div class="mw-ht-idol-results" id="mw-hometown-idol-results"></div>
  </div>`;
}
