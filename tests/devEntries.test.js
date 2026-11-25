import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEV_ENTRY_DELAY_MS, devEntriesFromSearch } from "../js/ui/devEntries.js";

// B61 step 15: boot()'s nine copy-pasted dev-entry URL checks became devEntriesFromSearch() + a table in app.js.
// ORACLE: the old block, verbatim from app.js at f8a8baec, RUN against stubs (its location, setTimeout and views).
const OLD_BLOCK = "    // Player Reborn dev entry: ?reborn=1 opens the slice after boot.\n    if (new URLSearchParams(location.search).get(\"reborn\") === \"1\") {\n      setTimeout(() => { openRebornGuarded(); }, 250);\n    }\n    // Career Relationships dev entry (workstream E): ?relationships=1\n    // opens the relationships / promises / legacy panel after boot.\n    if (new URLSearchParams(location.search).get(\"relationships\") === \"1\") {\n      setTimeout(() => { relationshipsView.open(); }, 250);\n    }\n    // Shared Career Inbox dev entry (workstream A): ?inbox=1 opens the\n    // inbox slice after boot.\n    if (new URLSearchParams(location.search).get(\"inbox\") === \"1\") {\n      setTimeout(() => { careerInboxView.open(); }, 250);\n    }\n    // Signature Awakening dev entry (workstream D): ?awakening=1 opens the\n    // Reborn slice — the awakening progress panel lives on its season\n    // screen, and a skill fired there lands on the card from the next game.\n    if (new URLSearchParams(location.search).get(\"awakening\") === \"1\") {\n      setTimeout(() => { openRebornGuarded(); }, 250);\n    }\n    // GM Executive Dynasty dev entry: ?gm-business=1 opens the business scenario after boot.\n    if (new URLSearchParams(location.search).get(\"gm-business\") === \"1\") {\n      setTimeout(() => { gmBusinessView.open(gmBusinessView.createScenario({ players: PLAYERS }), PLAYERS); }, 250);\n    }\n    // Career Role Permissions dev entry: ?career=coach opens the Time\n    // Travel creation with the Coach role pre-set (ADR-006 R4) — the\n    // Career entry's Coach card does the same through onPlay; the GM\n    // path is the League Manager setup, the GM+Coach path is the\n    // existing card.\n    if (new URLSearchParams(location.search).get(\"career\") === \"coach\") {\n      setPrologueRole(\"COACH\");\n      setTimeout(() => { startMode(\"timeTravel\"); }, 250);\n    }\n    // Coach tactical depth dev entry (workstream B): ?coach-tactics=1 opens\n    // the tactical comeback challenge after boot.\n    if (new URLSearchParams(location.search).get(\"coach-tactics\") === \"1\") {\n      setTimeout(() => { coachingMomentView.open(); }, 250);\n    }\n    // GM draft gamble dev entry (workstream C): ?draft-gamble=1 opens\n    // the 1996 scouting/draft slice after boot.\n    if (new URLSearchParams(location.search).get(\"draft-gamble\") === \"1\") {\n      setTimeout(() => { draftGambleView.open(); }, 250);\n    }\n    // [Career 2.0 G] Career Network dev entries: ?scout=1 / ?film=1 /\n    // ?analytics=1 / ?network=1 open the slices after boot.\n    {\n      const networkParam = new URLSearchParams(location.search);\n      if (networkParam.get(\"scout\") === \"1\") setTimeout(() => { networkView.open(\"scout\"); }, 250);\n      else if (networkParam.get(\"film\") === \"1\") setTimeout(() => { networkView.open(\"film\"); }, 250);\n      else if (networkParam.get(\"analytics\") === \"1\") setTimeout(() => { networkView.open(\"analytics\"); }, 250);\n      else if (networkParam.get(\"network\") === \"1\") setTimeout(() => { networkView.open(\"board\"); }, 250);\n    }\n";

/** Run the old inline block for `search`; returns the effects in the order they happen (timers flushed in order). */
function runOld(search) {
  const log = [];
  const timers = [];
  const stub = (name) => (...args) => log.push([name, ...args.filter((a) => typeof a === "string")].join(":"));
  const PLAYERS = [];
  const view = (name, extra = {}) => ({ open: stub(`${name}.open`), ...extra });
  const env = {
    location: { search },
    setTimeout: (fn, ms) => timers.push([fn, ms]),
    openRebornGuarded: stub("reborn"),
    relationshipsView: view("relationships"),
    careerInboxView: view("inbox"),
    gmBusinessView: { open: () => log.push("gm-business"), createScenario: () => ({}) },
    PLAYERS,
    setPrologueRole: stub("setPrologueRole"),
    startMode: stub("startMode"),
    coachingMomentView: view("coach-tactics"),
    draftGambleView: view("draft-gamble"),
    networkView: view("network"),
  };
  new Function(...Object.keys(env), OLD_BLOCK)(...Object.values(env));
  const delays = new Set(timers.map(([, ms]) => ms));
  for (const [fn] of timers) fn();
  return { log, delays: [...delays] };
}

/** The new path, wired the way app.js wires it (same table shape, same loop). */
function runNew(search) {
  const log = [];
  const timers = [];
  const actions = {
    reborn: { later: () => log.push("reborn") },
    relationships: { later: () => log.push("relationships.open") },
    inbox: { later: () => log.push("inbox.open") },
    awakening: { later: () => log.push("reborn") },
    "gm-business": { later: () => log.push("gm-business") },
    "career-coach": { now: () => log.push("setPrologueRole:COACH"), later: () => log.push("startMode:timeTravel") },
    "coach-tactics": { later: () => log.push("coach-tactics.open") },
    "draft-gamble": { later: () => log.push("draft-gamble.open") },
    network: { later: (board) => log.push(`network.open:${board}`) },
  };
  for (const { key, arg } of devEntriesFromSearch(search)) {
    actions[key].now?.();
    timers.push([() => actions[key].later(arg), DEV_ENTRY_DELAY_MS]);
  }
  const delays = new Set(timers.map(([, ms]) => ms));
  for (const [fn] of timers) fn();
  return { log, delays: [...delays] };
}

const SEARCHES = [
  "", "?", "?x=1",
  "?reborn=1", "?relationships=1", "?inbox=1", "?awakening=1", "?gm-business=1", "?career=coach", "?coach-tactics=1", "?draft-gamble=1",
  "?scout=1", "?film=1", "?analytics=1", "?network=1",
  // only the exact value counts
  "?reborn=0", "?reborn=true", "?reborn=", "?reborn", "?career=gm", "?career=", "?scout=2", "?network=yes",
  // independent entries, boot order regardless of URL order
  "?inbox=1&reborn=1", "?reborn=1&awakening=1", "?awakening=1&reborn=1", "?coach-tactics=1&career=coach&reborn=1",
  "?draft-gamble=1&gm-business=1&relationships=1&inbox=1",
  // the Career Network flags are one chain: first present wins
  "?network=1&scout=1", "?analytics=1&film=1", "?film=1&scout=1", "?network=1&analytics=1&film=1&scout=1", "?scout=0&film=1",
  // network chain still runs alongside the independent entries
  "?network=1&reborn=1&career=coach", "?film=1&draft-gamble=1",
  // everything at once
  "?reborn=1&relationships=1&inbox=1&awakening=1&gm-business=1&career=coach&coach-tactics=1&draft-gamble=1&scout=1&film=1&analytics=1&network=1",
];

for (const search of SEARCHES) {
  test(`dev entries match the old inline block: ${search || "(empty)"}`, () => {
    assert.deepEqual(runNew(search), runOld(search));
  });
}

test("the old block really opens things (the oracle is not vacuous)", () => {
  assert.ok(runOld("?reborn=1&inbox=1").log.length === 2);
  assert.deepEqual(runOld("?career=coach").log, ["setPrologueRole:COACH", "startMode:timeTravel"]);
});

test("devEntriesFromSearch: shape, order and the network board name", () => {
  assert.deepEqual(devEntriesFromSearch("?network=1&inbox=1"), [{ key: "inbox" }, { key: "network", arg: "board" }]);
  assert.deepEqual(devEntriesFromSearch(undefined), []);
  assert.equal(DEV_ENTRY_DELAY_MS, 250);
});

test("app.js wires exactly the entries the parser can produce, through the parser (no URL sniffing left in boot)", () => {
  const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const table = src.slice(src.indexOf("const devEntryActions = {"), src.indexOf("for (const { key, arg } of devEntriesFromSearch"));
  assert.ok(table.length > 100, "devEntryActions table not found");
  const wired = [...table.matchAll(/^ {6}"?([a-z-]+)"?: \{/gm)].map((m) => m[1]).sort();
  const everything = devEntriesFromSearch("?reborn=1&relationships=1&inbox=1&awakening=1&gm-business=1&career=coach&coach-tactics=1&draft-gamble=1&network=1");
  assert.deepEqual(wired, everything.map((e) => e.key).sort());
  for (const board of ["scout", "film", "analytics", "network"]) assert.equal(devEntriesFromSearch(`?${board}=1`)[0].key, "network");
  assert.ok(!/new URLSearchParams\(location\.search\)\.get\("(reborn|inbox|career|scout)"\)/.test(src), "boot still sniffs the URL inline");
});
