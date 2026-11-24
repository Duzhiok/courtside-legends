import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";

const t0 = performance.now();
const data = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8"));
const tParse = performance.now();
const raw = data.players;
console.log(`rows: ${raw.length} | JSON.parse: ${(tParse - t0).toFixed(0)}ms`);
buildCareerSpanIndex(raw);
console.log(`span index: ${(performance.now() - tParse).toFixed(0)}ms`);

const rows2020 = raw.filter((r) => r.season === 2020);
const tS = performance.now();
const cards2020 = rows2020.map(seasonToCard);
void cards2020;
console.log(`2020 season (${rows2020.length} cards): ${(performance.now() - tS).toFixed(0)}ms`);

const team = raw.filter((r) => r.season === 2020 && r.team === "LAL");
const tT = performance.now();
const teamCards = team.map(seasonToCard);
void teamCards;
console.log(`one team-season (${team.length} cards): ${(performance.now() - tT).toFixed(2)}ms`);

const list = new Array(raw.length);
const chunkTimes = [];
const tB = performance.now();
for (let i = 0; i < raw.length; i += 800) {
  const c0 = performance.now();
  const end = Math.min(i + 800, raw.length);
  for (let j = i; j < end; j++) list[j] = seasonToCard(raw[j]);
  chunkTimes.push(performance.now() - c0);
}
const tFull = performance.now() - tB;
chunkTimes.sort((a, b) => a - b);
console.log(`full build: ${tFull.toFixed(0)}ms | chunks: ${chunkTimes.length} | median chunk: ${chunkTimes[Math.floor(chunkTimes.length / 2)].toFixed(1)}ms | max chunk: ${chunkTimes[chunkTimes.length - 1].toFixed(1)}ms`);
console.log(`per-card: ${(tFull / raw.length * 1000).toFixed(1)}us`);
