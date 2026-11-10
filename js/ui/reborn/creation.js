/**
 * Player Reborn — career creation (integration sprint, workstream A).
 *
 * The public entry from the Career Player card: pick a historical start
 * year, pick a destiny, and — for the random destiny — let the seed draw
 * the identity. The 70/30 split is untouched (user ruling): the 30%
 * fictional path is the player's own original identity, never the main
 * source of future league players.
 *
 * Two ways to arrive at an identity:
 * - random destiny: the seeded draw (70% historical bench / 30%
 *   fictional), staged reveal at trust 40 — the player does NOT know who
 *   they are yet, and the creation screen never shows the drawn name;
 * - chosen identity: the player picks a bench player or a generated
 *   prospect by name, so they know who they are from the start (revealed).
 *
 * Pure builders + the factory; the view owns the click state.
 */
import {
  REBORN_START_YEARS,
  seasonForStartYear,
  benchPool,
  generatedProspects,
  identityForRow,
  identityForGenerated,
  createRebornState,
  REBORN_TEAM_IDS,
} from "../../reborn/identity.js";
import { seasonToCard, overall } from "../../data/players.js";
import { hashSeed, seededStream } from "../../core/seededRandom.js";

/** One line of era background per offered start year. */
export const ERA_BACKGROUND = {
  1995: {
    zh: "1995–96 赛季：公牛 72 胜 10 负，乔丹归来后的第一个完整赛季，联盟的替补席上藏着下一个故事。",
    en: "1995–96: the Bulls go 72–10 in Jordan's first full season back — and the next story is hiding on a bench somewhere.",
  },
  1996: {
    zh: "1996–97 赛季：公牛卫冕，爵士双煞逼近总冠军，联盟的替补席上藏着下一个故事。",
    en: "1996–97: the Bulls defend their title while Stockton and Malone close in — and the next story is hiding on a bench somewhere.",
  },
};

export const CREATION_DESTINIES = ["random", "historical", "fictional"];

/** The camp team for a chosen fictional prospect — deterministic per seed + bref. */
export function campTeamFor(seed, bref) {
  const rng = seededStream(hashSeed(`${String(seed)}|${String(bref)}`));
  return REBORN_TEAM_IDS[Math.floor(rng() * REBORN_TEAM_IDS.length)];
}

function cardOvr(card) {
  try {
    return overall(card);
  } catch {
    return null;
  }
}

/**
 * The choice lists for one start year: the bench pool (historical) and the
 * generated prospects (fictional), each with the display fields the
 * creation screen needs. Deterministic given the seed.
 */
export function creationChoices(rows, seed, startYear) {
  const season = seasonForStartYear(startYear);
  const historical = benchPool(rows, season).map((row) => ({
    bref: row.bref,
    name: row.name,
    nameEn: row.nameEn || row.name,
    team: row.team,
    pos: row.pos,
    ovr: cardOvr(seasonToCard(row)),
  }));
  const fictional = generatedProspects(seed, rows, Number(startYear)).map((wrapper) => {
    const player = wrapper.player;
    return {
      bref: player.bref,
      name: player.name,
      nameEn: player.nameEn || player.name,
      team: campTeamFor(seed, player.bref),
      pos: player.pos,
      ovr: cardOvr(player),
    };
  });
  return { season, historical, fictional };
}

/**
 * Build the run from a creation choice. `choice` is
 * { startYear, destiny: "random" | "historical" | "fictional", bref? }.
 * Random draws from the seed; chosen identities are built from the row /
 * prospect the player picked. The 70/30 split lives in the draw and is
 * not changed here.
 */
export function createRebornFromChoice({ seed, rows, choice } = {}) {
  const startYear = Number(choice?.startYear ?? 1996);
  const season = seasonForStartYear(startYear);
  const destiny = choice?.destiny || "random";
  if (destiny === "random") {
    return createRebornState(seed, rows, { startYear });
  }
  if (destiny === "historical") {
    const row = benchPool(rows, season).find((r) => r.bref === choice.bref);
    if (!row) throw new Error(`creation: no ${season} bench player ${choice.bref}`);
    return createRebornState(seed, rows, {
      startYear,
      identity: identityForRow(row, season),
    });
  }
  if (destiny === "fictional") {
    const found = generatedProspects(seed, rows, startYear).find(
      (w) => w.player?.bref === choice.bref,
    );
    if (!found) throw new Error(`creation: no generated prospect ${choice.bref}`);
    const team = campTeamFor(seed, found.player.bref);
    return createRebornState(seed, rows, {
      startYear,
      identity: identityForGenerated(found.player, team, season),
    });
  }
  throw new TypeError(`creation: unknown destiny ${destiny}`);
}

const L = (lang, zh, en) => (lang === "en" ? en : zh);

/** The creation panel. Pure HTML — the view holds the selection state. */
export function creationHtml({
  rows,
  seed,
  lang = "zh",
  startYear = 1996,
  destiny = null,
  pickedBref = null,
} = {}) {
  const zh = lang !== "en";
  const choices = creationChoices(rows, seed, startYear);
  const yearButtons = REBORN_START_YEARS.map((year) => {
    const active = year === Number(startYear);
    return `<button type="button" class="reborn-create-year${active ? " is-active" : ""}" data-reborn-year="${year}">${year}–${String(year + 1).slice(2)}${active ? ` · ${L(lang, "已选", "selected")}` : ""}</button>`;
  }).join("");
  const destinyButtons = [
    {
      id: "random",
      title: L(lang, "随机命运", "Random destiny"),
      desc: L(lang, "70% 真实历史替补 / 30% 虚构新秀，种子决定一切", "70% real historical bench / 30% fictional rookie — the seed decides"),
    },
    {
      id: "historical",
      title: L(lang, "自选历史替补", "Pick a historical bench player"),
      desc: L(lang, "从当季替补池里选一个人，你就是他", "Choose someone from this season's bench — you are him"),
    },
    {
      id: "fictional",
      title: L(lang, "自选虚构新秀", "Pick a fictional rookie"),
      desc: L(lang, "原创身份，从训练营打起", "An original identity, starting at camp"),
    },
  ]
    .map(
      (d) =>
        `<button type="button" class="reborn-create-destiny${destiny === d.id ? " is-active" : ""}" data-reborn-destiny="${d.id}"><strong>${d.title}</strong><span>${d.desc}</span></button>`,
    )
    .join("");

  let listHtml = "";
  if (destiny === "historical" || destiny === "fictional") {
    const list = destiny === "historical" ? choices.historical : choices.fictional;
    const rowsHtml = list
      .map((entry) => {
        const name = zh ? entry.name : entry.nameEn;
        return `<button type="button" class="reborn-create-pick${pickedBref === entry.bref ? " is-active" : ""}" data-reborn-pick="${entry.bref}"><strong>${name}</strong><span>${entry.team} · ${entry.pos}${entry.ovr ? ` · OVR ${entry.ovr}` : ""}</span></button>`;
      })
      .join("");
    listHtml =
      `<section class="reborn-create-list"><h3>${destiny === "historical" ? L(lang, "当季替补池", "This season's bench pool") : L(lang, "训练营新秀", "Camp rookies")}</h3>`
      + `<p>${L(lang, `共 ${list.length} 人`, `${list.length} players`)}</p>`
      + `<div class="reborn-create-list-body">${rowsHtml}</div></section>`;
  }

  const canConfirm = destiny === "random" || !!pickedBref;
  const confirmLabel =
    destiny === "random"
      ? L(lang, "抽取命运，进入训练营", "Draw your destiny, enter camp")
      : L(lang, "以这个身份进入训练营", "Enter camp as this player");
  const eraNote = ERA_BACKGROUND[startYear] ? ERA_BACKGROUND[startYear][zh ? "zh" : "en"] : "";
  return `<section class="reborn-create">
    <h3>${L(lang, "创建球员生涯", "Create your player career")}</h3>
    <section class="reborn-create-era"><h4>${L(lang, "起始赛季", "Starting season")}</h4>
      <div class="reborn-create-years">${yearButtons}</div>
      <p>${eraNote}</p>
      <p class="reborn-create-note">${L(lang, "更多历史年代即将推出。", "More historical eras coming soon.")}</p>
    </section>
    <section class="reborn-create-destiny"><h4>${L(lang, "命运", "Destiny")}</h4>
      <div class="reborn-create-destinies">${destinyButtons}</div>
    </section>
    ${listHtml}
    <button type="button" class="reborn-create-confirm" data-reborn-confirm="1" ${canConfirm ? "" : "disabled"}>${confirmLabel}</button>
  </section>`;
}
