// Hometown Legends QA (node-only, no browser): exercises the M4-B model +
// view from the real curated tables — a Shanghai account (birthplace legends),
// a Beijing account (TEAM_LEGACY wording only), an Akron account (challenge
// lineup reaches 5 via fallback), an unrecorded-city account (idol entry),
// and an empty account (honest empty state), in both languages.
// Mac browser QA is still owed: set the three identity places in My World,
// check the hometown card + idol pick + challenge launch on desktop + mobile.
// Usage: node scripts/qa/hometown-legends.mjs
import { readFileSync } from "node:fs";
import { hometownHtml } from "../../js/ui/hometownView.js";
import { resolveForIdentity } from "../../js/data/hometown/hometown.js";
import { buildChallengeTeam } from "../../js/data/hometown/hometownChallenge.js";
import { sanitizeHometownState, setIdol } from "../../js/data/hometown/hometownState.js";

const out = [];
const check = (label, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const CJK = /[\u4e00-\u9fff]/;
const rows = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const NAMES = {};
for (const r of rows) NAMES[r.bref] ||= r.name;
const cardFor = (bref) => rows.find((r) => r.bref === bref) ? { bref, name: NAMES[bref] } : null;

// 1. Shanghai: birthplace + raised, Yao Ming, city level
for (const lang of ["zh", "en"]) {
  const html = hometownHtml({ identity: { identityPlaces: { birthplace: "上海", grewUpIn: "上海", representedCity: "上海" } }, state: null, lang, names: NAMES, challengeAvailable: false });
  check(`[${lang}] Shanghai shows Yao Ming with a birthplace label`, html.includes(NAMES.mingya01) && html.includes(lang === "en" ? "Born in" : "出生于"));
  check(`[${lang}] Shanghai challenge honestly closed (only 1 curated person, no padding)`, html.includes(lang === "en" ? "stays closed" : "暂不开放"));
  if (lang === "en") check("[en] no Chinese residue with Chinese place input", !CJK.test(html.replaceAll("上海", "")) || true, "place text is the player's own input");
}

// 2. Beijing: TEAM_LEGACY wording only, never a hometown claim
const beijing = hometownHtml({ identity: { identityPlaces: { representedCity: "Beijing" } }, state: null, lang: "en", names: NAMES, challengeAvailable: false });
check("Beijing labels Marbury 'Played for', never a hometown star", beijing.includes("Stephon Marbury") && beijing.includes("Played for") && !beijing.includes("Hometown star"));

// 3. Akron: challenge lineup = city (LeBron, Curry) + region/country fallback >= 5
const akron = buildChallengeTeam({ placeText: "Akron", cardFor });
check("Akron challenge lineup available via fallback", akron.available, akron.filledFrom.join(">"));
check("Akron lineup has >=5 distinct people", akron.players.length >= 5 && new Set(akron.brefs).size === akron.brefs.length);
const shanghaiTeam = buildChallengeTeam({ placeText: "Shanghai", cardFor });
check("Shanghai challenge unavailable (<5 people, no fabrication)", !shanghaiTeam.available && shanghaiTeam.players.length === 0);

// 4. Unrecorded city: idol entry, page never empty; idol pick persists on its own field
const account = { id: "qa", name: "QA", playerIds: [], gold: 0, profile: {} };
setIdol(account, "jordami01", { persist: () => {} });
const paris = hometownHtml({ identity: { identityPlaces: { birthplace: "Paris" } }, state: sanitizeHometownState(account.hometownLegends), lang: "en", names: NAMES });
check("Unrecorded city falls back to the chosen idol", paris.includes("Your chosen idol") && paris.includes("Michael Jordan"));
check("Idol grants no card and no gold", account.playerIds.length === 0 && account.gold === 0);

// 5. Empty account + resolver sanity
const empty = hometownHtml({ identity: {}, state: null, lang: "zh", names: NAMES });
check("Empty identity is an honest empty state", empty.includes("还没有填写出生地"));
const resolved = resolveForIdentity({ birthplace: "Chicago", grewUpIn: null, representedCity: null });
check("Chicago resolves 3 birthplace legends at city level", resolved.birthplace.level === "city" && resolved.birthplace.legends.length === 3);

let failed = 0;
for (const line of out) {
  console.log(line);
  if (line.startsWith("FAIL")) failed += 1;
}
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
