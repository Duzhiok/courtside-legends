import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { seasonToCard, overall } = await import("../js/data/players.js");
const view = await import("../js/ui/hostedView.js");

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const POOL = ROWS.filter((r) => [1996, 2001].includes(r.season) && r.gp >= 20).map(seasonToCard);
const ids = POOL.filter((c) => c.team === "LAL" && c.season === 2001).sort((a, b) => overall(b) - overall(a)).slice(0, 8).map((c) => c.id);
const account = (extra = {}) => ({ id: "acc-view", playerIds: ids, cardMods: {}, gold: 0, ...extra });

test("the plan form lists the account's players, marks the chosen one, and is bilingual", () => {
  const zh = view.hostedHtml(account({ hosted: { plan: { playerId: ids[0], attr: "three" }, settledDay: 1 } }), { pool: POOL, lang: "zh" });
  assert.match(zh, /托管联赛/);
  assert.match(zh, new RegExp(`value="${ids[0]}" selected`));
  assert.match(zh, /value="three" selected/);
  assert.match(zh, /更新托管/);
  assert.match(view.hostedHtml(account(), { pool: POOL, lang: "en" }), /Start hosting/);
});

test("too few distinct players: the save button is disabled and says why", () => {
  const html = view.hostedHtml(account({ playerIds: ids.slice(0, 2) }), { pool: POOL, lang: "en" });
  assert.match(html, /data-hosted-save disabled/);
  assert.match(html, /at least 5/);
});

test("the settlement line reports real totals and is empty when nothing was owed", () => {
  assert.equal(view.settledHtml({ days: [], gold: 0, xp: 0, gained: 0 }, "zh"), "");
  assert.equal(view.settledHtml(null, "en"), "");
  const line = view.settledHtml({ days: [{ games: 20, wins: 12 }, { games: 20, wins: 8 }], gold: 130, xp: 66, gained: 2 }, "en");
  assert.match(line, /2 day\(s\), 40 games \(20 W\), gold \+¤130, XP \+66, attribute \+2/);
});
