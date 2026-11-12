// Legacy Museum QA (node-only, no browser): exercises the museum model +
// view HTML from fixture accounts — unlocked with both qualifying careers,
// prestige careers feeding the dynasty titles, locked, guest, and missing
// fields — plus the honours-wall entry point (earned titles clickable,
// locked progress plain text).
// Mac browser QA is still owed: tap an earned title on My World and check
// the museum opens with the tapped title highlighted, and the back button
// returns to the honours wall (desktop + mobile).
// Usage: node scripts/qa/legacy-museum.mjs
import { ARCHITECT_TITLES } from "../../js/career/careerAchievements.js";
import { legacyMuseumFor } from "../../js/career/legacyMuseum.js";
import { legacyMuseumHtml } from "../../js/ui/legacyMuseumView.js";
import { architectTitlesHtml, legacyFromAccount } from "../../js/ui/myWorldView.js";

const out = [];
const check = (label, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const noLeak = (html) => !/undefined|NaN/.test(html);

const completion = ({ careerId, role, prestige = false, year = 2001, seasons = 3, championships = 0, tier = "solid", reason = "voluntary", at = 1700000000000 }) =>
  ({ careerId, role, prestige, year, seasons, championships, tier, reason, at });
const account = (completions = [], extra = {}) => ({ playerIds: [], careerCompletions: completions, ...extra });

const unlocked = account([
  completion({ careerId: "c1", role: "COACH", at: 1700000000000 }),
  completion({ careerId: "c2", role: "GM", at: 1700001000000 }),
]);
unlocked.careerRelationships = {
  people: [],
  relationships: [{ kind: "rivalry", state: "active" }],
  promises: [{ status: "fulfilled" }, { status: "open" }],
  legacy: [{ type: "transition", season: 1997, year: 1997, summary: "转投新球队", summaryEn: "Moved to a new team" }],
};
const withPrestige = account([
  completion({ careerId: "c1", role: "COACH", at: 1700000000000 }),
  completion({ careerId: "c2", role: "GM", at: 1700001000000 }),
  completion({ careerId: "c3", role: "GM_COACH", prestige: true, championships: 1, year: 2005, tier: "great" }),
]);

// 1. Model: unlocked account
const model = legacyMuseumFor(unlocked);
check("model: unlocked account has a museum", !!model);
check("model: both qualifying careers present with real fields", model?.qualifications.coach.careerId === "c1" && model?.qualifications.gm.careerId === "c2" && model?.qualifications.coach.year === 2001 && model?.qualifications.coach.seasons === 3);
check("model: unlock date is the later of the two first completions", model?.unlockedAt === 1700001000000, String(model?.unlockedAt));
check("model: titles come from ARCHITECT_TITLES", model?.titles[0] === ARCHITECT_TITLES.architect, model?.titles.map((t) => t.id).join(","));
check("model: legacy counts read from the account record", model?.legacy.transitions.length === 1 && model?.legacy.rivalries === 1 && model?.legacy.promises.fulfilled === 1 && model?.legacy.promises.open === 1);

// 2. Model: prestige careers
const prestigeModel = legacyMuseumFor(withPrestige);
check("model: prestige career feeds all three titles", prestigeModel?.titles.map((t) => t.id).join(",") === "architect,dynasty-master,basketball-immortal", prestigeModel?.titles.map((t) => t.id).join(","));
check("model: prestige career listed as an Architect career", prestigeModel?.architectCareers.length === 1 && prestigeModel?.architectCareers[0].championships === 1);

// 3. Model: nothing to show
check("model: one completion is progress, not a museum", legacyMuseumFor(account([completion({ careerId: "c1", role: "COACH" })])) === null);
check("model: guest has no museum", legacyMuseumFor(null) === null);
check("model: empty account has no museum", legacyMuseumFor(account()) === null);

// 4. View: unlocked museum, both languages
for (const lang of ["zh", "en"]) {
  const html = legacyMuseumHtml(model, lang);
  check(`[${lang}] museum body renders both careers and the unlock date, and does NOT repeat the page title`, !html.includes(lang === "en" ? "Legacy Museum" : "篮球人生博物馆") && !html.includes("<h2") && html.includes(lang === "en" ? "Coach career" : "教练生涯") && html.includes(lang === "en" ? "GM career" : "经理生涯") && html.includes(lang === "en" ? "Unlocked" : "解锁于"));
  check(`[${lang}] museum shows the legacy headline in the page language`, html.includes(lang === "en" ? "Moved to a new team" : "转投新球队"));
  check(`[${lang}] museum HTML has no leaked undefined/NaN`, noLeak(html));
  const other = lang === "en" ? "王朝缔造者" : "The Architect";
  check(`[${lang}] museum has no title names in the other language`, !html.includes(other));
}
const prestigeHtml = legacyMuseumHtml(prestigeModel, "zh", "dynasty-master");
check("view: tapped title section is highlighted", /is-selected[^>]*data-lm-title="dynasty-master"/.test(prestigeHtml));
check("view: prestige championship career shown under Dynasty Master", prestigeHtml.includes("1 座总冠军") && prestigeHtml.includes("2005"));
check("view: no museum for a null model", legacyMuseumHtml(null, "zh") === "");

// 5. View: missing fields are omitted, never invented
const sparse = account([
  completion({ careerId: "c1", role: "COACH", year: undefined, championships: undefined, tier: undefined, reason: undefined }),
  completion({ careerId: "c2", role: "GM", year: undefined, championships: undefined, tier: undefined, reason: undefined }),
]);
sparse.careerCompletions.forEach((c) => { delete c.year; delete c.championships; delete c.tier; delete c.reason; });
const sparseHtml = legacyMuseumHtml(legacyMuseumFor(sparse), "zh");
check("view: sparse records render with no invented values", noLeak(sparseHtml) && !/球队|战绩|财富|身家/.test(sparseHtml) && !/座总冠军/.test(sparseHtml));
const noDate = account([
  completion({ careerId: "c1", role: "COACH" }),
  completion({ careerId: "c2", role: "GM" }),
]);
noDate.careerCompletions.forEach((c) => delete c.at);
check("view: missing unlock timestamps say the date is unknown", legacyMuseumHtml(legacyMuseumFor(noDate), "zh").includes("解锁日期未知"));

// 6. Honours-wall entry point
const wall = architectTitlesHtml(legacyFromAccount(unlocked).architect, "zh");
check("wall: earned title is a button into the museum", wall.includes('data-mw-action="open-legacy-museum"') && wall.includes('data-title="architect"') && wall.includes("王朝缔造者"));
const lockedWall = architectTitlesHtml(legacyFromAccount(account()).architect, "zh");
check("wall: locked progress has no museum button", !lockedWall.includes("open-legacy-museum") && lockedWall.includes("教练生涯 ○"));
check("wall: guest has no titles block", architectTitlesHtml(null, "zh") === "");

const failed = out.filter((l) => l.startsWith("FAIL"));
console.log(out.join("\n"));
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
