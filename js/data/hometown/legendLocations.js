/**
 * Hometown Legends (ADR-009, M4-B): person <-> place assertions.
 *
 * One record = ONE sourced assertion. Every record was checked against the
 * cited reference on `checkedOn` before it was added. Hard rules (ADR-009 §5):
 * - Never infer a birthplace from a name, a nationality, or a team's city.
 *   The roster's `team` field is only ever evidence for TEAM_LEGACY.
 * - TEAM_LEGACY means "played for that city's team" and is labelled that way.
 * - Records without a checkable source are dropped at load (hometown.js).
 *
 * Note: Yao Ming's bref is "mingya01" in the roster (Basketball-Reference
 * order); the "yaomi01" spelling in early ADR drafts does not exist and the
 * load validation correctly rejects it.
 */
const CHECKED = "2026-11-11";
const bref = (who, fact) => ({ type: "reference", ref: `Basketball-Reference, ${who} player page — ${fact}`, checkedOn: CHECKED });

export const LEGEND_LOCATIONS = [
  // --- Shanghai, China ---
  { bref: "mingya01", locationId: "CN-SH-SHANGHAI", relation: "BIRTHPLACE", source: bref("Yao Ming", "born in Shanghai, China") },
  { bref: "mingya01", locationId: "CN-SH-SHANGHAI", relation: "RAISED_IN", source: { type: "reference", ref: "Encyclopaedia Britannica, Yao Ming — born and grew up in Shanghai, China", checkedOn: CHECKED } },
  // --- Beijing, China (TEAM_LEGACY only: Marbury is from Brooklyn, never claim otherwise) ---
  { bref: "marbust01", locationId: "CN-BJ-BEIJING", relation: "TEAM_LEGACY", source: { type: "reference", ref: "Stephon Marbury career record — Beijing Ducks, Chinese Basketball Association, 2011-2017 (three CBA titles)", checkedOn: CHECKED } },
  // --- Akron, Ohio, USA ---
  { bref: "jamesle01", locationId: "US-OH-AKRON", relation: "BIRTHPLACE", source: bref("LeBron James", "born in Akron, Ohio") },
  { bref: "jamesle01", locationId: "US-OH-AKRON", relation: "RAISED_IN", source: { type: "reference", ref: "Encyclopaedia Britannica, LeBron James — born and raised in Akron, Ohio", checkedOn: CHECKED } },
  { bref: "curryst01", locationId: "US-OH-AKRON", relation: "BIRTHPLACE", source: bref("Stephen Curry", "born in Akron, Ohio (grew up in Charlotte — no RAISED_IN record here)") },
  // --- Chicago, Illinois, USA ---
  { bref: "wadedw01", locationId: "US-IL-CHICAGO", relation: "BIRTHPLACE", source: bref("Dwyane Wade", "born in Chicago, Illinois") },
  { bref: "rosede01", locationId: "US-IL-CHICAGO", relation: "BIRTHPLACE", source: bref("Derrick Rose", "born in Chicago, Illinois") },
  { bref: "thomais01", locationId: "US-IL-CHICAGO", relation: "BIRTHPLACE", source: bref("Isiah Thomas", "born in Chicago, Illinois") },
  // --- Los Angeles, California, USA ---
  { bref: "hardeja01", locationId: "US-CA-LOS-ANGELES", relation: "BIRTHPLACE", source: { type: "reference", ref: "Wikipedia, James Harden infobox — born in Los Angeles, California", checkedOn: CHECKED } },
  { bref: "leonaka01", locationId: "US-CA-LOS-ANGELES", relation: "BIRTHPLACE", source: bref("Kawhi Leonard", "born in Los Angeles, California") },
  // --- New York City, New York, USA ---
  { bref: "jordami01", locationId: "US-NY-NEW-YORK", relation: "BIRTHPLACE", source: bref("Michael Jordan", "born in Brooklyn, New York") },
  { bref: "anthoca01", locationId: "US-NY-NEW-YORK", relation: "BIRTHPLACE", source: bref("Carmelo Anthony", "born in Brooklyn, New York") },
  { bref: "abdulka01", locationId: "US-NY-NEW-YORK", relation: "BIRTHPLACE", source: bref("Kareem Abdul-Jabbar", "born in New York, New York") },
  // --- Philadelphia, Pennsylvania, USA ---
  { bref: "bryanko01", locationId: "US-PA-PHILADELPHIA", relation: "BIRTHPLACE", source: bref("Kobe Bryant", "born in Philadelphia, Pennsylvania") },
  { bref: "chambwi01", locationId: "US-PA-PHILADELPHIA", relation: "BIRTHPLACE", source: bref("Wilt Chamberlain", "born in Philadelphia, Pennsylvania") },
  // --- Houston, Texas, USA (TEAM_LEGACY only) ---
  { bref: "mingya01", locationId: "US-TX-HOUSTON", relation: "TEAM_LEGACY", source: bref("Yao Ming", "Houston Rockets, 2002-2011") },
  { bref: "olajuha01", locationId: "US-TX-HOUSTON", relation: "TEAM_LEGACY", source: bref("Hakeem Olajuwon", "Houston Rockets, 1984-2001") },
  // --- Toronto, Ontario, Canada ---
  { bref: "barrerj01", locationId: "CA-ON-TORONTO", relation: "BIRTHPLACE", source: bref("RJ Barrett", "born in Toronto, Ontario") },
  { bref: "gilgesh01", locationId: "CA-ON-TORONTO", relation: "BIRTHPLACE", source: bref("Shai Gilgeous-Alexander", "born in Toronto, Ontario") },
  // --- Athens, Greece ---
  { bref: "antetgi01", locationId: "GR-ATT-ATHENS", relation: "BIRTHPLACE", source: bref("Giannis Antetokounmpo", "born in Athens, Greece") },
  { bref: "antetgi01", locationId: "GR-ATT-ATHENS", relation: "RAISED_IN", source: { type: "reference", ref: "Encyclopaedia Britannica, Giannis Antetokounmpo — born and raised in Athens, Greece", checkedOn: CHECKED } },
  // --- Ljubljana, Slovenia ---
  { bref: "doncilu01", locationId: "SI-CENTRAL-LJUBLJANA", relation: "BIRTHPLACE", source: bref("Luka Doncic", "born in Ljubljana, Slovenia") },
  // --- Wurzburg, Germany ---
  { bref: "nowitdi01", locationId: "DE-BY-WURZBURG", relation: "BIRTHPLACE", source: bref("Dirk Nowitzki", "born in Wurzburg, West Germany") },
  // --- Barcelona, Spain ---
  { bref: "gasolpa01", locationId: "ES-CT-BARCELONA", relation: "BIRTHPLACE", source: bref("Pau Gasol", "born in Barcelona, Spain") },
  { bref: "gasolma01", locationId: "ES-CT-BARCELONA", relation: "BIRTHPLACE", source: bref("Marc Gasol", "born in Barcelona, Spain") },
  // --- Bahia Blanca, Argentina ---
  { bref: "ginobem01", locationId: "AR-BA-BAHIA-BLANCA", relation: "BIRTHPLACE", source: bref("Manu Ginobili", "born in Bahia Blanca, Argentina") },
  // --- Melbourne, Australia ---
  { bref: "irvinky01", locationId: "AU-VIC-MELBOURNE", relation: "BIRTHPLACE", source: { type: "reference", ref: "ESPN, Ben Simmons / Kyrie Irving draft prospect report — birthplace: Melbourne", checkedOn: CHECKED } },
  { bref: "simmobe01", locationId: "AU-VIC-MELBOURNE", relation: "BIRTHPLACE", source: { type: "reference", ref: "ESPN, Ben Simmons draft prospect report — birthplace: Melbourne", checkedOn: CHECKED } },
  { bref: "bogutan01", locationId: "AU-VIC-MELBOURNE", relation: "BIRTHPLACE", source: { type: "reference", ref: "ESPN, Australian No.1 draft picks report — Andrew Bogut born in Melbourne", checkedOn: CHECKED } },
  // --- Beijing, China (second person) ---
  { bref: "zhizhwa01", locationId: "CN-BJ-BEIJING", relation: "BIRTHPLACE", source: bref("Wang Zhizhi", "born in Beijing, China") },
  // --- Region / country level records ---
  // These players were born in the stated region/country but NOT in a curated
  // city, so the record is attached at the level the source actually supports
  // and the UI labels it at that level. They are what lets fallback chains
  // (and the Hometown Challenge lineup) reach beyond a single city honestly.
  { bref: "mccolcj01", locationId: "US-OH", relation: "BIRTHPLACE", source: bref("CJ McCollum", "born in Canton, Ohio — recorded at region level, Canton is not a curated city") },
  { bref: "lillada01", locationId: "US-CA", relation: "BIRTHPLACE", source: bref("Damian Lillard", "born in Oakland, California — recorded at region level, Oakland is not a curated city") },
  { bref: "boshch01", locationId: "US-TX", relation: "BIRTHPLACE", source: bref("Chris Bosh", "born in Dallas, Texas — recorded at region level, Dallas is not a curated city") },
  { bref: "duranke01", locationId: "US", relation: "BIRTHPLACE", source: bref("Kevin Durant", "born in Washington, District of Columbia, USA — recorded at country level") },
  { bref: "birdla01", locationId: "US", relation: "BIRTHPLACE", source: bref("Larry Bird", "born in West Baden Springs, Indiana, USA — recorded at country level") },
  { bref: "johnsma02", locationId: "US", relation: "BIRTHPLACE", source: bref("Earvin 'Magic' Johnson", "born in Lansing, Michigan, USA — recorded at country level") },
  { bref: "foxri01", locationId: "CA-ON-TORONTO", relation: "BIRTHPLACE", source: bref("Rick Fox", "born in Toronto, Ontario") },
  { bref: "murraja01", locationId: "CA-ON", relation: "BIRTHPLACE", source: bref("Jamal Murray", "born in Kitchener, Ontario — recorded at region level, Kitchener is not a curated city") },
  { bref: "thomptr01", locationId: "CA", relation: "BIRTHPLACE", source: bref("Tristan Thompson", "born in Brampton, Ontario, Canada — recorded at country level") },
  { bref: "jianlyi01", locationId: "CN", relation: "BIRTHPLACE", source: bref("Yi Jianlian", "born in Heshan, Guangdong, China — recorded at country level") },
  { bref: "qizh01", locationId: "CN", relation: "BIRTHPLACE", source: bref("Zhou Qi", "born in Xinxiang, Henan, China — recorded at country level") },
  { bref: "bateeme01", locationId: "CN", relation: "BIRTHPLACE", source: bref("Mengke Bateer", "born in Alxa League, Inner Mongolia, China — recorded at country level") },
  { bref: "millspa02", locationId: "AU", relation: "BIRTHPLACE", source: bref("Patty Mills", "born in Canberra, Australia — recorded at country level") },
  { bref: "inglejo01", locationId: "AU", relation: "BIRTHPLACE", source: bref("Joe Ingles", "born in Adelaide, Australia — recorded at country level") },
  { bref: "rubiori01", locationId: "ES-CT", relation: "BIRTHPLACE", source: bref("Ricky Rubio", "born in El Masnou, Catalonia, Spain — recorded at region level") },
];
