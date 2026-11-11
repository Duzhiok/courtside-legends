// M4-D My World integration QA (node-only, no browser): the hero's represented-city
// anchor points at the hometown section, and the honours wall carries one labelled
// hometown-challenge line only after a game is played — never as a trophy.
// D3: museum career lines show the represented city frozen at career creation
// (M4-C snapshot), omitted when the completion record carries none.
// Mac browser QA is still owed: open My World, click the "代表" place and confirm the
// page scrolls to the Hometown Legends card; play a hometown challenge and confirm
// the honours wall gains exactly one 🏀 line (desktop + mobile); open the Legacy
// Museum and confirm a career line shows its creation-time city.
// Usage: node scripts/qa/m4d-integration.mjs
import { completionFromRoot } from "../../js/career/careerAchievements.js";
import { legacyMuseumFor } from "../../js/career/legacyMuseum.js";
import { hometownHtml } from "../../js/ui/hometownView.js";
import { museumCareerLine } from "../../js/ui/legacyMuseumView.js";
import { identityCardHtml, legacyFromAccount, legacyHtml } from "../../js/ui/myWorldView.js";

const out = [];
let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const CJK = /[\u4e00-\u9fff]/;
const id = (places) => ({ name: "A", hometown: "", bio: "", guest: false, identityPlaces: places });
const account = (challenge) => ({ playerIds: ["a"], hometownLegends: challenge ? { challenge } : undefined });

// D1: hero anchor + section target
for (const lang of ["zh", "en"]) {
  const hero = identityCardHtml(id({ birthplace: "Akron", grewUpIn: "Akron", representedCity: "Akron" }), lang);
  check(`[${lang}] hero represented city anchors to #mw-hometown`, hero.includes('<a href="#mw-hometown" class="mw-places-link">'));
  check(`[${lang}] hero birthplace / grew-up-in are plain text, not links`, !hero.includes(">Born in</a>") && !hero.includes(">出生于</a>"));
  const section = hometownHtml({ identity: id({ representedCity: "Akron" }), state: null, lang });
  check(`[${lang}] hometown section carries id="mw-hometown"`, section.includes('id="mw-hometown"'));
  const empty = hometownHtml({ identity: id({}), state: null, lang });
  check(`[${lang}] empty-state hometown section still carries the anchor target`, empty.includes('id="mw-hometown"'));
  if (lang === "en") check("[en] hero anchor text has no Chinese", !CJK.test(hero));
}

// D2: honours-wall challenge line
const unplayed = legacyHtml(legacyFromAccount(account(null)), null, "zh");
check("unplayed account: honours wall has no challenge line", !unplayed.includes("家乡挑战"));
const played = { played: 3, wins: 2, losses: 1, lastRepresentedCity: "阿克伦", lastResult: "win", lastAt: null };
const zh = legacyHtml(legacyFromAccount(account(played)), null, "zh");
check("played account: honours wall shows the challenge line", zh.includes("🏀 家乡挑战 · 3 场 · 2 胜 1 负 · 最近代表 阿克伦"));
check("challenge line adds no trophy glyph", !(zh.match(/🏆/g) || []).length);
const en = legacyHtml(legacyFromAccount(account(played)), null, "en");
check("[en] challenge line is English", en.includes("🏀 Hometown Challenge · 3 played · 2W 1L · last represented 阿克伦") && !CJK.test(en.replaceAll("阿克伦", "")));
const noCity = legacyHtml(legacyFromAccount(account({ played: 1, wins: 0, losses: 1, lastRepresentedCity: null, lastResult: "loss", lastAt: null })), null, "zh");
check("city-free record: line renders without a city fragment", noCity.includes("家乡挑战 · 1 场 · 0 胜 1 负") && !noCity.includes("最近代表"));

// D3: creation-time represented city, from snapshot to museum line
const retiredRoot = (snapshot) => ({
  identity: { currentRole: "COACH" },
  leagueCareer: { careerId: "c1", season: { year: 2001 }, ...(snapshot ? { identitySnapshot: snapshot } : {}) },
  story: { employment: { status: "retired", reason: "voluntary" }, ending: { id: "retired" } },
  coach: { reputation: 50, age: 60, stints: [{ teamId: "LAL", startYear: 1998, seasons: 3, wins: 150, losses: 96, championships: 0 }] },
});
const snap = { birthplace: "Akron", grewUpIn: "Akron", representedCity: "Akron" };
const rec = completionFromRoot(retiredRoot(snap));
check("completion freezes the snapshot represented city", rec?.representedCity === "Akron");
check("completion without a snapshot carries null, never invented", completionFromRoot(retiredRoot(null))?.representedCity === null);
const museumModel = legacyMuseumFor({
  playerIds: [],
  careerCompletions: [
    { ...rec, role: "COACH" },
    { careerId: "c2", role: "GM", prestige: false, year: 2001, seasons: 3, championships: 0, tier: "solid", reason: "voluntary", at: 1700001000000 },
  ],
});
check("museum model passes the city through", museumModel?.qualifications?.coach?.representedCity === "Akron");
check("museum model reads an old record without the field as null", museumModel?.qualifications?.gm?.representedCity === null);
check("[zh] museum line shows 创建时代表 Akron", museumCareerLine(museumModel.qualifications.coach, "zh").includes("创建时代表 Akron"));
check("[en] museum line shows Represented Akron at creation", museumCareerLine(museumModel.qualifications.coach, "en").includes("Represented Akron at creation"));
check("museum line omits the city for an old record", !museumCareerLine(museumModel.qualifications.gm, "zh").includes("创建时代表"));

console.log(out.join("\n"));
console.log(`${out.length - failures}/${out.length} passed`);
process.exit(failures ? 1 : 0);
