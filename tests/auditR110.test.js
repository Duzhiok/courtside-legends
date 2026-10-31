import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seasonToCard } from "../js/data/players.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const cardOf = (bref, season) => {
  const row = rows.find((r) => r.bref === bref && r.season === season);
  return row ? seasonToCard(row) : null;
};

// R110: sweep of 185 pre-2012-only SG suspects (a season apg >= 5) + 139 SF suspects
// (a season rpg >= 8), each verified against Basketball-Reference primary position.
// 219 players change position; 105 stay (incl. Feick/Jaric, whose evidence is mixed).
const BLANKET_PG = ["daviebo01", "phillan01", "senesge01", "martisl01", "mcguidi01", "kingge01", "costela01", "greensi01", "leonasl01", "mccarjo01", "joneskc01", "attleal01", "eganjo01", "komivho01", "weissbo01", "robinfl01", "williar01", "williro01", "adelmri01", "whitejo01", "allenlu01", "beardbu01", "cleamji01", "priceji01", "bibbyhe01", "dudlech01", "digreer01", "hendeto01", "walkefo01", "willigu01", "hollili01", "mcelrji01", "taylobr01", "galemi01", "leero01", "bucknqu01", "busedo01", "hillar01", "dunlemi01", "jordaed01", "willira01", "bratzmi01", "greenri01", "davisbr01", "higgske01", "leaveal01", "hendege01", "hustoge01", "ranseke01", "matthwe01", "cookda01", "macyky01", "drewla01", "romarlo01", "lestero01", "sparrro01", "sichtje01", "johnsfr01", "valenda01", "edwarfr01", "floydsl01", "williro02", "connele01", "riverdo01", "whatlen01", "walkeda01", "harpede01", "lowesi01", "threase01", "paxsojo01", "flemive01", "holtomi01", "webbsp01", "portete01", "minnidi01", "vincesa01", "dawkijo01", "smithke01", "grantga01", "shawbr01", "willimi02", "lesji01", "johnsav01", "douglsh01", "barroda01", "grantgr01", "workmha01", "abdulma02", "brownde01", "robinru01", "colesbi01", "anthogr01", "packro01", "murdoer01", "pricebr01", "hurlebo01", "childch01", "wardch01", "edneyty01", "besttr01", "armstda01", "alexaco01", "snower01", "mcinnje01", "willial02", "brunsri01", "hudsotr01", "jonesda01", "luety01", "atkinch01", "alstora01", "claxtsp01", "arroyca01", "hartja01", "dickada01", "davisjo01"];
const BLANKET_SF = ["wilkebo01", "kukocto01"];
const BLANKET_PF = ["hitchle01", "heinsto01", "greenjo01", "tresvjo01", "washiji01", "blockjo01", "kimbato01", "greenla01", "heardga01", "wickssi01", "rowecu01", "davisdw01", "behagro01", "breweji01", "washike01", "johnsmi01", "shumajo01", "kenonla01", "washiri01", "hillmda01", "kupchmi01", "basseti01", "warneco01", "jackslu01", "carrke01", "landsma01", "greenda01", "robincl01", "cummipa01", "chambto01", "rambiku01", "cummite01", "greensi02", "thorpot01", "perkisa01", "cagemi01", "greenac01", "gilliar01", "andergr01", "grantho01", "longgr01", "laneje01", "reidjr01", "daviste01", "masonan01", "vaughlo01", "millste01", "willija01", "laettch01", "weathcl01", "ellisla01", "guglito01", "radjadi01", "bakervi01", "davisan01", "jonespo01", "blounco01", "marshdo01", "grantbr01", "smithmi02", "smithjo02", "mcdyean01", "abdursh01", "walkean02", "willije01", "fortsda01", "skinnbr01", "thomake01", "delebi01", "davisda01", "willilo01", "jonesbo01"];
const BLANKET_C = ["wrighlo02"];
const BLANKET_WITH_PATCHES = [
  ["mcmahja01", "PG", { 1957: "SG", 1958: "SG" }],
  ["georgja01", "PG", { 1957: "SG" }],
  ["shuege01", "PG", { 1958: "SG" }],
  ["abdulma01", "PG", { 1965: "SG", 1966: "SG" }],
  ["clarkar01", "PG", { 1967: "SG", 1969: "SG" }],
  ["murphca01", "PG", { 1978: "SG", 1980: "SG" }],
  ["moneyer01", "PG", { 1975: "SG" }],
  ["johnsde01", "PG", { 1977: "SG", 1978: "SG", 1979: "SG", 1980: "SG" }],
  ["humphja01", "PG", { 1985: "SG", 1990: "SG", 1993: "SG", 1994: "SG", 1995: "SG" }],
  ["grabojo01", "PF", { 1952: "C", 1953: "C" }],
  ["barksdo01", "PF", { 1955: "SF" }],
  ["sauldwo01", "PF", { 1959: "C" }],
  ["boozebo01", "PF", { 1964: "SF" }],
  ["chapple01", "PF", { 1965: "C", 1967: "C" }],
  ["lovebo01", "PF", { 1976: "SF" }],
  ["kauffbo01", "PF", { 1969: "C", 1971: "C", 1973: "SF" }],
  ["hummejo01", "PF", { 1971: "C" }],
  ["tomjaru01", "PF", { 1974: "SF" }],
  ["bantomi01", "PF", { 1978: "SF" }],
  ["jonesdw01", "PF", { 1975: "C", 1976: "C" }],
  ["lucasma01", "PF", {  }],
  ["smithch01", "PF", { 1991: "SF", 1992: "SF", 1993: "SF", 1994: "SF", 1995: "SF" }],
  ["johnsla02", "PF", { 1997: "SF", 1998: "SF", 1999: "SF" }]
];
const NO_BLANKET_PATCHES = [
  ["sprewla01", { 1999: "SF", 2000: "SF", 2001: "SF", 2002: "SF", 2003: "SF", 2004: "SF", 2005: "SF" }],
  ["roseja01", { 1997: "SF", 1998: "SF", 1999: "SF", 2000: "SF", 2001: "SF", 2002: "SF", 2003: "SF", 2004: "PG", 2007: "SF" }],
  ["finlemi01", { 1996: "SF", 1997: "SF", 1998: "SF", 1999: "SF", 2000: "SF", 2001: "SF", 2002: "SF", 2003: "SF" }],
  ["maxwece01", { 1979: "PF", 1980: "PF", 1981: "PF", 1982: "PF", 1983: "PF", 1984: "PF", 1985: "PF" }]
];
const VINCENT_SF = [1984, 1987, 1988, 1989, 1990];

test("R110: pure-blanket players resolve to the new position for every season", () => {
  for (const [list, pos] of [[BLANKET_PG, "PG"], [BLANKET_SF, "SF"], [BLANKET_PF, "PF"], [BLANKET_C, "C"]]) {
    for (const bref of list) {
      const playerRows = rows.filter((r) => r.bref === bref);
      assert.ok(playerRows.length > 0, bref);
      for (const r of playerRows) {
        assert.equal(seasonToCard(r).pos, pos, `${bref}:${r.season}`);
      }
    }
  }
});

test("R110: blanket-plus-exception players resolve per season", () => {
  for (const [bref, blanket, patches] of BLANKET_WITH_PATCHES) {
    for (const r of rows.filter((r) => r.bref === bref)) {
      const expected = patches[r.season] ?? blanket;
      assert.equal(seasonToCard(r).pos, expected, `${bref}:${r.season}`);
    }
  }
  for (const r of rows.filter((r) => r.bref === "vinceja01")) {
    const expected = VINCENT_SF.includes(r.season) ? "SF" : "PF";
    assert.equal(seasonToCard(r).pos, expected, `vinceja01:${r.season}`);
  }
});

test("R110: no-blanket splits land on the exact seasons", () => {
  for (const [bref, patches] of NO_BLANKET_PATCHES) {
    for (const [season, pos] of Object.entries(patches)) {
      assert.equal(cardOf(bref, Number(season)).pos, pos, `${bref}:${season}`);
    }
  }
  const cases = [
    ["sprewla01", 1995, "SG"], ["sprewla01", 2002, "SF"],
    ["roseja01", 1995, "SG"], ["roseja01", 2000, "SF"], ["roseja01", 2004, "PG"],
    ["roseja01", 2006, "SG"], ["roseja01", 2007, "SF"],
    ["finlemi01", 2000, "SF"], ["finlemi01", 2006, "SG"],
    ["maxwece01", 1978, "SF"], ["maxwece01", 1982, "PF"], ["maxwece01", 1986, "SF"],
    ["johnsde01", 1979, "SG"], ["johnsde01", 1985, "PG"],
    ["humphja01", 1990, "SG"], ["humphja01", 1992, "PG"],
    ["mcmahja01", 1955, "PG"], ["mcmahja01", 1957, "SG"],
    ["vinceja01", 1983, "PF"], ["vinceja01", 1988, "SF"],
    ["johnsla02", 1994, "PF"], ["johnsla02", 1998, "SF"],
    ["smithch01", 1990, "PF"], ["smithch01", 1993, "SF"],
    ["grabojo01", 1952, "C"], ["grabojo01", 1955, "PF"],
    ["kauffbo01", 1969, "C"], ["kauffbo01", 1972, "PF"], ["kauffbo01", 1973, "SF"],
    ["lucasma01", 1977, "PF"],
    ["wrighlo02", 1998, "C"],
    ["daviebo01", 1951, "PG"],
  ];
  for (const [bref, season, pos] of cases) {
    const card = cardOf(bref, season);
    assert.ok(card, `${bref}:${season} exists`);
    assert.equal(card.pos, pos, `${bref}:${season} should be ${pos}`);
  }
});

test("R110: confirmed keeps do not move", () => {
  const keeps = [
    ["westje01", "SG"], ["greerha01", "SG"], ["goodrga01", "SG"], ["hornaje01", "SG"],
    ["maravpe01", "SG"], ["iversal01", "SG"], ["jordami01", "SG"], ["drexlcl01", "SG"],
    ["birdla01", "SF"], ["pippesc01", "SF"], ["wilkido01", "SF"], ["schrede01", "SF"],
    ["jaricma01", "SG"], ["feickja01", "SF"],
  ];
  for (const [bref, pos] of keeps) {
    const playerRows = rows.filter((r) => r.bref === bref);
    assert.ok(playerRows.length > 0, bref);
    assert.ok(playerRows.every((r) => seasonToCard(r).pos === pos), `${bref} should stay ${pos}`);
  }
});
