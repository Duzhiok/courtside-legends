/**
 * Real cards for Node tests. PLAYERS is only filled by the browser-side loadPlayers()
 * (fetch + IndexedDB), so in Node it is an empty array — a test that does
 * PLAYERS.find(...) silently finds nothing. Call this first to push a deterministic
 * sample (every `step`-th row) of the real roster through the real card builder.
 */
import { readFileSync } from "node:fs";

export async function loadSampleRoster(step = 40) {
  const { PLAYERS, seasonToCard } = await import("../../js/data/players.js");
  if (PLAYERS.length) return PLAYERS;
  const rows = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
  PLAYERS.push(...rows.filter((_, index) => index % step === 0).map(seasonToCard));
  if (!PLAYERS.length) throw new Error("sample roster is empty — roster.json missing?");
  return PLAYERS;
}
