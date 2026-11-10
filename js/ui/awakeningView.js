/**
 * Signature Awakening UI (Career 2.0, workstream D).
 *
 * Pure HTML builders, no DOM writes, no state of their own. The Reborn view
 * mounts them on the season screen: a progress panel (per-rule evidence like
 * 3/3 + the key-game tick + the ability gate) and a banner when a skill fires.
 * Skills the engine cannot measure yet (stepback) are shown honestly as
 * unmeasurable, never with fake progress.
 */
import {
  AWAKENING_RULES,
  MISSING_EVIDENCE,
  progressFor,
  skillSourceOf,
} from "../career/player/signatureAwakening.js";
import { SKILL_PACKS } from "../data/skills.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);

const skillName = (skillId, lang) => {
  const pack = SKILL_PACKS[skillId];
  if (!pack) return skillId;
  return lang === "en" ? pack.nameEn || pack.name : pack.name;
};

/**
 * The progress panel for the season screen. Shows every shippable rule with
 * its evidence (qualifying games n/3, key-game tick, ability gate) and the
 * unmeasurable skills below, plus the source split of the skills the player
 * already has (innate vs awakened).
 */
export function awakeningProgressHtml({ awakening, card, lang = "zh" } = {}) {
  const progress = progressFor(awakening, card);
  const sources = skillSourceOf(card, awakening);
  const rows = progress
    .map((p) => {
      const status =
        p.status === "awakened"
          ? L("已觉醒", "Awakened", lang)
          : p.status === "ready"
            ? L("待领悟", "Ready", lang)
            : L("进行中", "In progress", lang);
      const ability = p.abilityMet
        ? `<span>${L("天赋达标", "Ability met", lang)} (${p.abilityLabel})</span>`
        : `<span>${L("天赋未达标", "Ability not met", lang)} (${p.abilityLabel})</span>`;
      return `<li><strong>${L(p.name, p.nameEn, lang)}</strong> · ${status} — ${L("表现证据", "Evidence", lang)} ${p.qualifying}/${p.needed} · ${p.keyMet ? L("关键表现 ✓", "Key performance ✓", lang) : L("关键表现 —", "Key performance —", lang)} · ${ability}<br><small>${L(p.evidenceLabel, p.evidenceLabelEn, lang)}</small><br><small>${L(p.unlocks, p.unlocksEn, lang)}</small></li>`;
    })
    .join("");
  const missing = MISSING_EVIDENCE.map(
    (m) =>
      `<li><strong>${L(m.name, m.nameEn, lang)}</strong> · ${L("暂无比赛证据", "No game evidence yet", lang)}<br><small>${L(m.needed, m.neededEn, lang)}</small></li>`,
  ).join("");
  const owned = [...sources.awakened, ...sources.innate]
    .map((id) => {
      const tag = sources.awakened.includes(id)
        ? L("觉醒", "awakened", lang)
        : L("天生", "innate", lang);
      return `<li>${skillName(id, lang)}（${tag}）</li>`;
    })
    .join("");
  return `<section class="reborn-awakening"><h3>${L("招牌技能觉醒", "Signature Awakening", lang)}</h3><p>${L(
    "技能来自真实比赛表现，不是抽书。打出对应表现，技能自己会来。",
    "Skills come from real game performance, not from drawing a book. Show the play, and the skill follows.",
    lang,
  )}</p><ul>${rows}${missing}</ul>${
    owned
      ? `<p>${L("已有技能", "Skills held", lang)}：</p><ul>${owned}</ul>`
      : ""
  }</section>`;
}

/**
 * Banner for skills that just awakened (mounted next to the game report).
 * `awakened` is [{ skillId, evidence }] from recordGame — the evidence is
 * what the player actually did, so the banner names it.
 */
export function awakeningBannerHtml({ awakened = [], lang = "zh" } = {}) {
  if (!awakened.length) return "";
  const lines = awakened
    .map((a) => {
      const rule = AWAKENING_RULES.find((r) => r.skillId === a.skillId);
      const ev = a.evidence || {};
      const proof =
        ev.keyGame != null
          ? L(`第 ${ev.keyGame} 场的关键表现`, `the key performance in game ${ev.keyGame}`, lang)
          : L("持续的比赛表现", "sustained game performance", lang);
      return `<p>✦ ${L("领悟", "Awakened", lang)}：${L(rule?.name || a.skillId, rule?.nameEn || a.skillId, lang)} — ${L(
        rule?.unlocks || "",
        rule?.unlocksEn || "",
        lang,
      )}（${L("证据", "Evidence", lang)}：${ev.qualifying ?? "?"} ${L("场达标", "qualifying games", lang)} + ${proof}）</p>`;
    })
    .join("");
  return `<section class="reborn-awakening-banner"><h3>${L("招牌技能觉醒", "Signature Awakening", lang)}</h3>${lines}</section>`;
}

/** One career-timeline line for an awakening event (consumed by careerTimelineHtml). */
export function awakeningTimelineLine({ event, lang = "zh" } = {}) {
  if (!event || event.event !== "awakening") return "";
  const ev = event.evidence || {};
  return `<p>${event.year} ${L("赛季", "season", lang)}：${L("领悟", "Awakened", lang)} ${skillName(event.skillId, lang)}（${L(
    "第",
    "game ",
    lang,
  )}${event.game ?? "?"} ${L("场", "", lang)}，${ev.qualifying ?? "?"} ${L("场达标", "qualifying games", lang)}）</p>`;
}
