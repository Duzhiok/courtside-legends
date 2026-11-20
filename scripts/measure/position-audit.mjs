// Audit of every player-season card's natural position against his body and game: is the label something he could really play?
// Flags (a label is judged against height and the engine's own attribute-based recommendation, nothing invented):
//   C   shorter than 199 cm                      PG  taller than 207 cm without elite passing
//   PF  shorter than 188 cm                      SG  taller than 208 cm
//   and any card whose label is two or more steps from recommendPlayPos (PG-SG-SF-PF-C).
// Usage: node scripts/measure/position-audit.mjs [minMpg=15] [top=25]
import { readFileSync } from "node:fs";
import { seasonToCard, overall } from "../../js/data/players.js";
import { recommendPlayPos } from "../../js/engine/gameplan.js";
import { normalizePos } from "../../js/data/positions.js";
import { SLOT_ORDER } from "../../js/engine/lineupSlots.js";

const MIN_MPG = Number(process.argv[2]) || 15;
const TOP = Number(process.argv[3]) || 25;
const rows = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const cards = rows.filter((r) => r.mpg >= MIN_MPG && r.gp >= 30).map(seasonToCard);
const gap = (a, b) => Math.abs(SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

const flags = { "C under 199cm": [], "PF under 188cm": [], "PG over 207cm, pass<80": [], "SG over 208cm": [], "label 2+ steps from recommended": [] };
for (const c of cards) {
  const pos = normalizePos(c.pos);
  const h = c.heightCm || 0;
  if (pos === "C" && h < 199) flags["C under 199cm"].push(c);
  if (pos === "PF" && h < 188) flags["PF under 188cm"].push(c);
  if (pos === "PG" && h > 207 && (c.pass || 0) < 80) flags["PG over 207cm, pass<80"].push(c);
  if (pos === "SG" && h > 208) flags["SG over 208cm"].push(c);
  if (gap(pos, recommendPlayPos(c)) >= 2) flags["label 2+ steps from recommended"].push(c);
}
console.log(`${cards.length} player-season cards (mpg >= ${MIN_MPG}, gp >= 30)`);
for (const [name, list] of Object.entries(flags)) {
  console.log(`\n${name}: ${list.length}`);
  for (const c of list.sort((a, b) => overall(b) - overall(a)).slice(0, TOP)) {
    console.log(`  ${String(c.season)} ${c.name.padEnd(24)} label ${normalizePos(c.pos)} h${c.heightCm} recommended ${recommendPlayPos(c)} (ovr ${overall(c)})`);
  }
}
