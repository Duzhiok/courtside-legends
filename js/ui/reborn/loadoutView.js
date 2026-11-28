/**
 * Skills M1c: the signature-move collection and the three slots, on the Reborn career screen (between games, never in a decision
 * prompt: a loadout cannot be changed mid-game). Pure HTML + one click helper in the same shape as the other career-screen helpers:
 * `loadoutClick(event, reborn, card)` returns the next run, or null when the click was not a (valid) loadout change.
 */
import { esc } from "../../core/html.js";
import { SKILL_PACKS } from "../../data/skills.js";
import { skillNameL } from "../../i18n.js";
import { skillSourceOf } from "../../career/player/signatureAwakening.js";
import { SIGNATURE_BUDGET, signaturesOf } from "../../reborn/signature.js";
import { LOADOUT_SLOTS, equipSkill, loadoutOf, syncLoadout, unequipSkill, usageOf } from "../../reborn/loadout.js";
import { PROFICIENCY_BOOST_PER_LEVEL, MAX_LEVEL, XP_GAME_CAP, progressOf } from "../../reborn/proficiency.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);
const ZONE = { paint: ["禁区", "Paint"], mid: ["中距离", "Mid-range"], three: ["三分", "Three"] };
const SOURCE = { innate: ["天生", "Innate"], awakened: ["觉醒", "Awakened"], purchased: ["购买", "Purchased"] };

/** A move's type line: always offense; the zone only when the catalogue says one (a few moves have none, so none is claimed). */
const typeLine = (pack, lang) => {
  const zone = ZONE[pack.zone];
  return `${L("进攻", "Offense", lang)}${zone ? ` · ${L(zone[0], zone[1], lang)}` : ""}`;
};

/** What the career screen shows: every owned offensive signature move, the slots, and the real engine counts per move. */
export function loadoutHtml({ reborn, card, lang = "zh" }) {
  const owned = signaturesOf(card);
  if (!owned.length) return "";
  const loadout = syncLoadout(loadoutOf(reborn.player), owned);
  const sources = skillSourceOf(card, reborn.player.awakening);
  const sourceOf = (id) => Object.keys(SOURCE).find((k) => (sources[k] || []).includes(id)) || "innate";
  const full = loadout.equipped.length >= LOADOUT_SLOTS;
  const row = (id) => {
    const pack = SKILL_PACKS[id];
    const on = loadout.equipped.includes(id);
    const use = usageOf(loadout, id);
    const [srcZh, srcEn] = SOURCE[sourceOf(id)];
    const pr = progressOf(loadout.xp[id]);
    const bonus = pr.boost > 0 ? L(` · 命中 +${Math.round(pr.boost * 100)}%`, ` · +${Math.round(pr.boost * 100)}% to make`, lang) : "";
    const prof = pr.maxed
      ? L(`Lv.${pr.level} ${pr.name.zh} · 已满级${bonus}`, `Lv.${pr.level} ${pr.name.en} · max level${bonus}`, lang)
      : L(`Lv.${pr.level} ${pr.name.zh} · ${pr.xp} 经验 · 距${pr.next.zh}还差 ${pr.toNext}${bonus}`, `Lv.${pr.level} ${pr.name.en} · ${pr.xp} XP · ${pr.toNext} to ${pr.next.en}${bonus}`, lang);
    const usage = use
      ? L(`使用 ${use.u} 次 · 命中 ${use.m}`, `Used ${use.u}× · ${use.m} made`, lang)
      : L("还没有使用记录", "No uses on record yet", lang);
    const button = on
      ? `<button type="button" class="btn" data-loadout="unequip" data-skill="${esc(id)}">${L("卸下", "Unequip", lang)}</button>`
      : `<button type="button" class="btn" data-loadout="equip" data-skill="${esc(id)}"${full ? ` disabled title="${esc(L("技能槽已满，先卸下一个", "Slots are full: unequip one first", lang))}"` : ""}>${full ? L("槽位已满", "Slots full", lang) : L("装备", "Equip", lang)}</button>`;
    return `<li data-skill="${esc(id)}" data-equipped="${on}"><strong>${esc(skillNameL(pack.name, lang))}</strong> `
      + `<small>${typeLine(pack, lang)} · ${L(srcZh, srcEn, lang)}</small> `
      + `<span class="reborn-loadout-status">${on ? L("已装备", "Equipped", lang) : L("未装备", "In collection", lang)}</span> `
      + `<small>${usage}</small> <small data-testid="proficiency" data-level="${pr.level}">${prof}</small> ${button}</li>`;
  };
  const empty = Array.from({ length: LOADOUT_SLOTS - loadout.equipped.length }, () => `<li class="reborn-loadout-empty" data-empty="true">${L("空技能槽", "Empty slot", lang)}</li>`);
  const collection = owned.filter((id) => !loadout.equipped.includes(id));
  // Everything on his card that is not an offensive signature move simply works as it always did (random procs, passives).
  const others = (card.skills || []).filter((id) => !owned.includes(id) && SKILL_PACKS[id]).map((id) => esc(skillNameL(SKILL_PACKS[id].name, lang)));
  return `<section class="reborn-loadout" data-testid="loadout"><h3>${L("我的招牌动作", "My signature moves", lang)} · ${loadout.equipped.length}/${LOADOUT_SLOTS} ${L("已装备", "equipped", lang)}</h3>`
    + `<p>${L(`每场所有已装备的动作共享 ${SIGNATURE_BUDGET} 次主动发动机会。换装免费，但比赛中不能更换。没装备的招牌动作仍按原来的概率随机触发。`, `All equipped moves share ${SIGNATURE_BUDGET} on-purpose uses a game. Swapping is free but not allowed mid-game. A move left in the collection still fires at random as before.`, lang)}</p>`
    + `<details data-testid="proficiency-rules"><summary>${L("熟练度怎么算", "How proficiency works", lang)}</summary><p>${L(`每次发动 +2 经验、命中再 +1，单场每个动作最多 ${XP_GAME_CAP}；共 ${MAX_LEVEL} 级，每升一级这个动作的命中 +${Math.round(PROFICIENCY_BOOST_PER_LEVEL * 100)}%（满级 +${Math.round(PROFICIENCY_BOOST_PER_LEVEL * (MAX_LEVEL - 1) * 100)}%）。不改变每场 ${SIGNATURE_BUDGET} 次的预算。`, `+2 XP per use and +1 per make, at most ${XP_GAME_CAP} a game per move; ${MAX_LEVEL} levels, each adds +${Math.round(PROFICIENCY_BOOST_PER_LEVEL * 100)}% to that move's make chance (max +${Math.round(PROFICIENCY_BOOST_PER_LEVEL * (MAX_LEVEL - 1) * 100)}%). The ${SIGNATURE_BUDGET}-a-game budget does not change.`, lang)}</p></details>`
    + `<h4>${L("装备中", "Equipped", lang)}</h4><ul data-testid="loadout-slots">${loadout.equipped.map(row).join("")}${empty.join("")}</ul>`
    + (collection.length ? `<h4>${L("技能收藏", "Collection", lang)} · ${collection.length}</h4><ul data-testid="loadout-collection">${collection.map(row).join("")}</ul>` : "")
    + (others.length ? `<p data-testid="loadout-others">${L("其他技能（自动生效）：", "Other skills (automatic): ", lang)}${others.join(L("、", ", ", lang))}</p>` : "")
    + `</section>`;
}

/** An equip / unequip click -> the next run (the loadout lives on `reborn.player.loadout`), or null if it changed nothing. */
export function loadoutClick(event, reborn, card) {
  const btn = event.target.closest?.("[data-loadout]");
  if (!btn || !reborn?.player) return null;
  const owned = signaturesOf(card);
  const current = loadoutOf(reborn.player);
  const out = btn.dataset.loadout === "equip" ? equipSkill(current, owned, btn.dataset.skill) : unequipSkill(current, owned, btn.dataset.skill);
  return out.ok ? { ...reborn, player: { ...reborn.player, loadout: out.loadout } } : null;
}
