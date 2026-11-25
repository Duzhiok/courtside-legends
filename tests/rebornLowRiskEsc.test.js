import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esc } from "../js/core/html.js";
import { AWAKENING_RULES } from "../js/career/player/signatureAwakening.js";
import { eggCopy } from "../js/reborn/enforcerEgg.js";
import { describeFastForwardEvent, describeFastForwardTarget } from "../js/reborn/fastForward.js";
import { benchPool } from "../js/reborn/identity.js";
import { revealLine } from "../js/reborn/reveal.js";
import { rosterCards } from "../js/reborn/season.js";
import { describeGrowth } from "../js/reborn/training.js";
import { awakeningBannerHtml } from "../js/ui/awakeningView.js";
import { creationHtml } from "../js/ui/reborn/creation.js";
import { rebornIdentityHtml } from "../js/ui/reborn/rebornView.js";
import {
  rivalryPregameHtml,
  rivalryReportHtml,
  rivalryTimelineLine,
  rivalsPanelHtml,
} from "../js/ui/reborn/rivalryView.js";

// Regression (B121, 2026-11-24): esc audit batch 5 — the low-risk Reborn group.
// The 2026-11-19 audit listed 15 sites in the Reborn/rivalry/awakening views
// (rivalryView 10, rebornView identity name, creation pick name, awakening
// rule names x3); re-verifying the group against current code found 33 more
// interpolations the audit's name-token scanner had missed — rival names
// flowing through a plain `n` variable (pregameLine, missed branch), and
// names returned by string builders (revealLine, describeFastForwardTarget /
// describeFastForwardEvent, eggCopy, describeGrowth's entry.name, which is
// the player's line name from awardGrowth). All 51 interpolations now go
// through esc() (defense in depth on top of the saveNames.js load gate;
// the names here come from roster.json / static tables, so in practice esc
// is a no-op for real names and only bites on a crafted one).
const CRAFTED = `<img src=x onerror=alert(1)>`;
const CRAFTED_EN = `<svg onload=alert(2)>`;
const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

const rivalrySrc = readFileSync(new URL("../js/ui/reborn/rivalryView.js", import.meta.url), "utf8");
const rebornViewSrc = readFileSync(new URL("../js/ui/reborn/rebornView.js", import.meta.url), "utf8");
const creationSrc = readFileSync(new URL("../js/ui/reborn/creation.js", import.meta.url), "utf8");
const awakeningSrc = readFileSync(new URL("../js/ui/awakeningView.js", import.meta.url), "utf8");
const revealSrc = readFileSync(new URL("../js/reborn/reveal.js", import.meta.url), "utf8");
const ffSrc = readFileSync(new URL("../js/reborn/fastForward.js", import.meta.url), "utf8");
const eggSrc = readFileSync(new URL("../js/reborn/enforcerEgg.js", import.meta.url), "utf8");
const trainingSrc = readFileSync(new URL("../js/reborn/training.js", import.meta.url), "utf8");

// --- Source assertions: each esc() site is pinned so reverting it reddens exactly its test ---

test("rivalryView nameOf escapes (choke point: pregame, panel, missed branches)", () => {
  assert.ok(
    rivalrySrc.includes(`const nameOf = (r, lang) => esc(lang === "en" ? r.nameEn || r.name : r.name);`),
    "nameOf must wrap the picked name in esc()",
  );
});

test("rivalryView formed / met / challenge / timeline sites escape", () => {
  assert.ok(rivalrySrc.includes("`${esc(f.name)} 成了你的宿敌。`"), "formed zh escapes f.name");
  assert.ok(rivalrySrc.includes("`${esc(f.nameEn || f.name)} is your rival now.`"), "formed en escapes f.nameEn");
  assert.ok(rivalrySrc.includes("`宿敌对决 vs ${esc(m.name)}："), "met zh escapes m.name");
  assert.ok(rivalrySrc.includes("`Rivalry game vs ${esc(m.nameEn || m.name)}:"), "met en escapes m.nameEn");
  assert.ok(rivalrySrc.includes("`向 ${esc(o.name)} 下战书`"), "challenge zh escapes o.name");
  assert.ok(rivalrySrc.includes("`Challenge ${esc(o.nameEn || o.name)}`"), "challenge en escapes o.nameEn");
  assert.ok(rivalrySrc.includes("`宿敌诞生 — ${esc(event.name)}（"), "timeline zh escapes event.name");
  assert.ok(rivalrySrc.includes("`Rivalry born — ${esc(event.nameEn || event.name)} ("), "timeline en escapes event.nameEn");
});

test("rebornView identity card escapes the revealed name", () => {
  assert.ok(rebornViewSrc.includes("<h3>${esc(name)}</h3>"), "identity <h3> must escape name");
});

test("creation pick button escapes the candidate name", () => {
  assert.ok(creationSrc.includes("<strong>${esc(name)}</strong>"), "pick button must escape name");
});

test("awakeningView progress / missing / banner sites escape the rule names", () => {
  assert.ok(awakeningSrc.includes("L(esc(p.name), esc(p.nameEn), lang)"), "progress row escapes p.name");
  assert.ok(awakeningSrc.includes("L(esc(m.name), esc(m.nameEn), lang)"), "missing row escapes m.name");
  assert.ok(
    awakeningSrc.includes("L(esc(rule?.name || a.skillId), esc(rule?.nameEn || a.skillId), lang)"),
    "banner escapes rule name",
  );
});

test("revealLine escapes the revealed identity name", () => {
  assert.ok(
    revealSrc.includes(`const name = esc(lang === "en" ? identity.nameEn || identity.name : identity.name);`),
    "revealLine must wrap the identity name in esc()",
  );
});

test("fastForward target / event sites escape rival and star names", () => {
  assert.ok(ffSrc.includes("vs ${esc(target.detail.rival)}"), "ff target zh escapes rival");
  assert.ok(ffSrc.includes("vs ${esc(target.detail.rivalEn || target.detail.rival)}"), "ff target en escapes rivalEn");
  assert.ok(ffSrc.includes("你的宿敌 ${esc(d.rival)} 在对面"), "ff event rivalry zh escapes d.rival");
  assert.ok(ffSrc.includes("your rival ${esc(d.rivalEn || d.rival)} is on the other side"), "ff event rivalry en escapes d.rivalEn");
  assert.ok(ffSrc.includes("一段宿敌关系诞生了：${esc(d.rival)}。"), "ff event rivalry-formed zh escapes d.rival");
  assert.ok(ffSrc.includes("A rivalry is born: ${esc(d.rivalEn || d.rival)}."), "ff event rivalry-formed en escapes d.rivalEn");
  assert.ok(ffSrc.includes("（${esc(d.star)} 在对面）"), "ff event key-game zh escapes d.star");
  assert.ok(ffSrc.includes(" (${esc(d.star)} on the other side)"), "ff event key-game en escapes d.star");
});

test("eggCopy escapes the enforcer and rival names", () => {
  assert.ok(
    eggSrc.includes(`const eName = esc(lang === "en" ? en.nameEn || en.name : en.name);`),
    "eggCopy must wrap the enforcer name in esc()",
  );
  assert.ok(
    eggSrc.includes(`const rName = esc(lang === "en" ? rv.nameEn || rv.name : rv.name);`),
    "eggCopy must wrap the rival name in esc()",
  );
});

test("describeGrowth escapes the entry (player) name", () => {
  assert.ok(trainingSrc.includes("（${esc(entry.name)}）"), "describeGrowth zh escapes entry.name");
  assert.ok(trainingSrc.includes(" (${esc(entry.name)})"), "describeGrowth en escapes entry.name");
});

// --- Behavioral tests: a crafted name must come out escaped, never raw ---

test("rivalsPanelHtml escapes a crafted rival name (zh + en)", () => {
  const rival = { name: CRAFTED, nameEn: CRAFTED_EN, team: "VAN", origin: "auto", games: [] };
  const zh = rivalsPanelHtml({ reborn: { rivalries: { rivals: [rival] } }, lang: "zh" });
  assert.ok(zh.includes(esc(CRAFTED)), "zh panel shows the escaped name");
  assert.ok(!zh.includes(CRAFTED), "zh panel never shows the raw payload");
  const en = rivalsPanelHtml({ reborn: { rivalries: { rivals: [rival] } }, lang: "en" });
  assert.ok(en.includes(esc(CRAFTED_EN)), "en panel shows the escaped name");
  assert.ok(!en.includes(CRAFTED_EN), "en panel never shows the raw payload");
  const normal = rivalsPanelHtml({
    reborn: { rivalries: { rivals: [{ name: "乔丹", nameEn: "Michael Jordan", team: "CHI", origin: "auto", games: [] }] } },
    lang: "zh",
  });
  assert.ok(normal.includes("乔丹"), "a real name still renders unchanged");
});

test("rivalryPregameHtml escapes a crafted rival name via pregameLine (zh + en)", () => {
  const bref = rosterCards(ROWS, "VAN", 1997)[0].bref;
  const rival = { bref, name: CRAFTED, nameEn: CRAFTED_EN, team: "VAN", origin: "auto", reason: "taunt", games: [] };
  const reborn = { player: { teamId: "CHI" }, rivalries: { rivals: [rival] } };
  const zh = rivalryPregameHtml({ reborn, rows: ROWS, nextGame: { homeId: "CHI", awayId: "VAN" }, year: 1997, lang: "zh" });
  assert.ok(zh.includes(esc(CRAFTED)), "zh pregame shows the escaped name");
  assert.ok(!zh.includes(CRAFTED), "zh pregame never shows the raw payload");
  const en = rivalryPregameHtml({ reborn, rows: ROWS, nextGame: { homeId: "CHI", awayId: "VAN" }, year: 1997, lang: "en" });
  assert.ok(en.includes(esc(CRAFTED_EN)), "en pregame shows the escaped name");
  assert.ok(!en.includes(CRAFTED_EN), "en pregame never shows the raw payload");
});

test("rivalryReportHtml escapes crafted names in formed / met / missed / challenge (zh + en)", () => {
  const report = {
    gameId: "g1",
    year: 1997,
    rivalry: {
      formed: [{ name: CRAFTED, nameEn: CRAFTED_EN, origin: "auto", reason: "taunt" }],
      met: [{ name: CRAFTED, nameEn: CRAFTED_EN, you: { pts: 30 }, rival: { pts: 28 }, won: true, wins: 2, losses: 1 }],
      missed: [{ name: CRAFTED, nameEn: CRAFTED_EN, why: "you-dnp" }],
    },
    opponents: [{ bref: "crafted01", min: 30, gs: 10, pts: 22, name: CRAFTED, nameEn: CRAFTED_EN }],
  };
  for (const lang of ["zh", "en"]) {
    const html = rivalryReportHtml({ report, reborn: null, lang });
    const want = lang === "en" ? esc(CRAFTED_EN) : esc(CRAFTED);
    const raw = lang === "en" ? CRAFTED_EN : CRAFTED;
    assert.ok(html.includes(want), `${lang} report shows the escaped name`);
    assert.ok(!html.includes(raw), `${lang} report never shows the raw payload`);
  }
});

test("rivalryTimelineLine escapes a crafted event name (zh + en)", () => {
  const event = { year: 1997, origin: "auto", name: CRAFTED, nameEn: CRAFTED_EN };
  const zh = rivalryTimelineLine({ event, lang: "zh" });
  assert.ok(zh.includes(esc(CRAFTED)) && !zh.includes(CRAFTED));
  const en = rivalryTimelineLine({ event, lang: "en" });
  assert.ok(en.includes(esc(CRAFTED_EN)) && !en.includes(CRAFTED_EN));
});

test("rebornIdentityHtml escapes a crafted revealed identity name (zh + en)", () => {
  const reborn = {
    identity: { revealed: true, name: CRAFTED, nameEn: CRAFTED_EN },
    player: { coachTrust: 80, contractStatus: "camp", teamId: "CHI" },
  };
  const zh = rebornIdentityHtml({ reborn, card: null, lang: "zh" });
  assert.ok(zh.includes(esc(CRAFTED)) && !zh.includes(CRAFTED));
  // Note: the identity card shows identity.name in both languages (no nameEn
  // branch — pre-existing behaviour, not this batch's scope); en must still
  // escape the same name.
  const en = rebornIdentityHtml({ reborn, card: null, lang: "en" });
  assert.ok(en.includes(esc(CRAFTED)) && !en.includes(CRAFTED));
});

test("creationHtml escapes a crafted bench-player name (zh + en)", () => {
  const bench0 = benchPool(ROWS, 1997)[0];
  const rows = ROWS.map((r) => (r.bref === bench0.bref ? { ...r, name: CRAFTED, nameEn: CRAFTED_EN } : r));
  const zh = creationHtml({ rows, seed: "b121-crafted", lang: "zh", startYear: 1996, destiny: "historical" });
  assert.ok(zh.includes(esc(CRAFTED)), "zh pick list shows the escaped name");
  assert.ok(!zh.includes(CRAFTED), "zh pick list never shows the raw payload");
  const en = creationHtml({ rows, seed: "b121-crafted", lang: "en", startYear: 1996, destiny: "historical" });
  assert.ok(en.includes(esc(CRAFTED_EN)), "en pick list shows the escaped name");
  assert.ok(!en.includes(CRAFTED_EN), "en pick list never shows the raw payload");
});

test("revealLine escapes a crafted identity name (zh + en)", () => {
  const identity = { name: CRAFTED, nameEn: CRAFTED_EN };
  assert.ok(revealLine(identity, "zh").includes(esc(CRAFTED)));
  assert.ok(!revealLine(identity, "zh").includes(CRAFTED));
  assert.ok(revealLine(identity, "en").includes(esc(CRAFTED_EN)));
  assert.ok(!revealLine(identity, "en").includes(CRAFTED_EN));
});

test("describeFastForwardTarget / Event escape crafted rival and star names (zh + en)", () => {
  const targetZh = describeFastForwardTarget({ type: "rivalry", detail: { rival: CRAFTED, rivalEn: CRAFTED_EN } }, "zh");
  assert.ok(targetZh.includes(esc(CRAFTED)) && !targetZh.includes(CRAFTED));
  const targetEn = describeFastForwardTarget({ type: "rivalry", detail: { rival: CRAFTED, rivalEn: CRAFTED_EN } }, "en");
  assert.ok(targetEn.includes(esc(CRAFTED_EN)) && !targetEn.includes(CRAFTED_EN));
  const rivalryZh = describeFastForwardEvent({ type: "rivalry", detail: { opp: "VAN", rival: CRAFTED, rivalEn: CRAFTED_EN } }, "zh");
  assert.ok(rivalryZh.includes(esc(CRAFTED)) && !rivalryZh.includes(CRAFTED));
  const formedEn = describeFastForwardEvent({ type: "rivalry-formed", detail: { rival: CRAFTED, rivalEn: CRAFTED_EN } }, "en");
  assert.ok(formedEn.includes(esc(CRAFTED_EN)) && !formedEn.includes(CRAFTED_EN));
  const starZh = describeFastForwardEvent({ type: "key-game", detail: { opp: "VAN", star: CRAFTED } }, "zh");
  assert.ok(starZh.includes(esc(CRAFTED)) && !starZh.includes(CRAFTED));
  const starEn = describeFastForwardEvent({ type: "key-game", detail: { opp: "VAN", star: CRAFTED } }, "en");
  assert.ok(starEn.includes(esc(CRAFTED)) && !starEn.includes(CRAFTED));
});

test("eggCopy escapes crafted enforcer and rival names, both edges (zh + en)", () => {
  const incident = (edge) => ({
    edge,
    enforcer: { name: CRAFTED, nameEn: CRAFTED_EN },
    rival: { name: CRAFTED, nameEn: CRAFTED_EN },
  });
  for (const edge of ["rattle", "foul"]) {
    const zh = eggCopy(incident(edge), "zh");
    assert.ok(zh.includes(esc(CRAFTED)), `${edge} zh shows the escaped names`);
    assert.ok(!zh.includes(CRAFTED), `${edge} zh never shows the raw payload`);
    const en = eggCopy(incident(edge), "en");
    assert.ok(en.includes(esc(CRAFTED_EN)), `${edge} en shows the escaped names`);
    assert.ok(!en.includes(CRAFTED_EN), `${edge} en never shows the raw payload`);
  }
  // And through the report line that actually renders it.
  const report = {
    gameId: "g1",
    rivalry: { formed: [], met: [], missed: [] },
    enforcerEgg: { fired: true, edge: "rattle", enforcer: { name: CRAFTED, nameEn: CRAFTED_EN }, rival: { name: CRAFTED, nameEn: CRAFTED_EN } },
  };
  const html = rivalryReportHtml({ report, reborn: null, lang: "zh" });
  assert.ok(html.includes("reborn-enforcer-egg") && html.includes(esc(CRAFTED)) && !html.includes(CRAFTED));
});

test("describeGrowth escapes a crafted entry (player) name (zh + en)", () => {
  const entries = [{ xp: 5, practice: 0, leveled: [], name: CRAFTED }];
  const zh = describeGrowth(entries, "zh").join("");
  assert.ok(zh.includes(esc(CRAFTED)), "zh growth line shows the escaped name");
  assert.ok(!zh.includes(CRAFTED), "zh growth line never shows the raw payload");
  const en = describeGrowth(entries, "en").join("");
  assert.ok(en.includes(esc(CRAFTED)), "en growth line shows the escaped name");
  assert.ok(!en.includes(CRAFTED), "en growth line never shows the raw payload");
});

test("awakeningBannerHtml still renders real static rule names unchanged", () => {
  const rule = AWAKENING_RULES.find((r) => r.skillId === "glass_cleaner");
  assert.ok(rule, "glass_cleaner rule exists");
  const zh = awakeningBannerHtml({ awakened: [{ skillId: "glass_cleaner", evidence: { qualifying: 3, keyGame: 1 } }], lang: "zh" });
  assert.ok(zh.includes(rule.name), "zh banner shows the real rule name");
  assert.ok(!zh.includes("undefined"), "no undefined leak in the zh banner");
  const en = awakeningBannerHtml({ awakened: [{ skillId: "glass_cleaner", evidence: { qualifying: 3, keyGame: 1 } }], lang: "en" });
  assert.ok(en.includes(rule.nameEn), "en banner shows the real rule name");
  assert.ok(!en.includes("undefined"), "no undefined leak in the en banner");
});
