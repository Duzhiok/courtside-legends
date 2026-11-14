// Storage-budget measurement for the ADR-004 v3→v4 migration (M4 opening work).
//
// Measures REAL byte sizes — every shape below is built from the game's own
// constructors / validators and round-tripped through writeRootSave, so a
// shape that fails validateRoot fails this script loudly instead of silently
// measuring a fantasy payload.
//
// Shapes (contract §3.1):
//   empty — createRootState(), nothing played yet.
//   mid   — a real hired time-travel career (careerFixtures.hiredRoot) + 5
//           seasons of history, ~5 trades per season, no live game in progress.
//   late  — the same career + 20 seasons of history (≤20 trades each),
//           a live game in progress (a real GameSim exportState + 24 feed lines).
//           challengeArchive is NOT on the root: it lives on the account
//           (js/data/challengeArchive.js), so the 20-entry cap is measured
//           under the account key, where it actually costs quota.
//
// Other keys: account store (skeleton + a collection scenario), guest keys
// (profile / avatar / AXP / challenge archive), mid-match autosave. Each one is
// counted as key name + value, the way the browser charges the quota.
//
// Budget model (contract D3): localStorage is ~5 MiB per origin, counted in
// UTF-16 code units — the same unit the repo's quota simulation uses
// (tests/saveQuotaRetry.test.js). During migration the origin briefly holds
// root + backup + tmp (≈3× root); after the commit it holds root + backup
// (≈2× root) until the next verified save deletes the backup (Q3 ruling).
// Migration is refused when the migration peak would exceed the budget:
//   maxMigratableRoot = floor((BUDGET − otherKeys) / 3)
//
// Usage: node scripts/measure/save-size-budget.mjs
import { readFileSync } from "node:fs";
import {
  ROOT_SAVE_KEY,
  createRootState,
  readRootSave,
  writeRootSave,
} from "../../js/data/saveRoot.js";
import { createMemoryStorage } from "../../tests/helpers/memoryStorage.js";
import { hiredRoot } from "../../tests/helpers/careerFixtures.js";
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { GUEST_PROFILE_KEY, sanitizeProfile } from "../../js/data/profile.js";
import { DEFAULT_LOOK, GUEST_LOOK_KEY } from "../../js/data/avatarLook.js";
import { challengeArchiveEntry } from "../../js/data/challengeArchive.js";
import { createAccount } from "../../js/data/account.js";
import {
  ACCOUNTS_KEY,
  ACTIVE_ACCOUNT_KEY,
  GUEST_AXP_KEY,
} from "../../js/data/accountKeys.js";

const BUDGET = 5 * 1024 * 1024; // ~5 MiB per origin, UTF-16 code units
const GUEST_ARCHIVE_KEY = "cls_challenge_archive_v1";
const AUTOSAVE_KEY = "cls_savegame_v1";

const utf8 = (s) => Buffer.byteLength(s, "utf8");
/** Quota cost of one key: browsers count the key name AND the value (UTF-16 units). */
const entry = (key, text) => ({ units: key.length + text.length, bytes: utf8(key) + utf8(text) });
const fmt = (n) => `${n.toLocaleString("en-US")} u (${(n / 1024).toFixed(1)} KiB)`;

/** A real mid-game sim export: real rosters, real engine, exported at Q1. */
function realSimExport() {
  const sim = new GameSim({
    home: realTeam("LAL", 1996),
    away: realTeam("CHI", 1996),
    youSide: "home",
    injuries: false,
    speed: 3,
    onEvent() {},
    onTick() {},
    onEnd() {},
  });
  return sim.exportState();
}

/** 24 realistic play-by-play feed lines, the shape collectFeedLines() writes. */
function feedLines(n = 24) {
  const names = ["奥尼尔", "科比", "乔丹", "皮蓬", "奥拉朱旺", "马龙", "斯托克顿", "巴克利"];
  const templates = [
    (p) => ({ type: "score", text: `${p}中投命中` }),
    (p) => ({ type: "score", text: `${p}三分命中` }),
    (p) => ({ type: "score", text: `${p}篮下暴扣得手` }),
    (p) => ({ type: "miss", text: `${p}跳投不中` }),
    (p) => ({ type: "event", text: `${p}抢断成功，快攻上篮得手` }),
    (p) => ({ type: "coach", text: `教练请求暂停，布置${p}的进攻战术` }),
    (p) => ({ type: "event", text: `${p}造成对手犯规，走上罚球线` }),
    (p) => ({ type: "score", text: `${p}接球就投，空心入网` }),
  ];
  return Array.from({ length: n }, (_, i) => templates[i % templates.length](names[i % names.length]));
}

const TRADE_TYPES = ["trade", "sign", "cut", "trade_3team", "trade_declined", "trade_countered"];
function tradeEntry(year, i) {
  const names = ["奥尼尔", "科比", "加内特", "邓肯", "艾弗森", "卡特", "诺维茨基", "韦德"];
  const a = names[(i * 2) % names.length];
  const b = names[(i * 2 + 3) % names.length];
  const type = TRADE_TYPES[i % TRADE_TYPES.length];
  const description =
    type === "trade" ? `交易：送出${a}，换来${b}与一个未来首轮签`
    : type === "trade_3team" ? `三方交易：送出${a}，换来${b}，第三方接手到期合同`
    : type === "sign" ? `签下自由球员${a}，合同 2 年`
    : type === "cut" ? `裁掉${a}，腾出阵容名额`
    : type === "trade_declined" ? `拒绝了对方用${b}换${a}的报价`
    : `还价：用${a}换${b}，并要求对方加一个次轮签`;
  return { day: 10 + i * 7, description, descriptionEn: `Season move ${i + 1}`, type, year };
}

function seasonSummary(year, teamId, tradeCount) {
  return {
    year,
    teamId,
    teamName: "湖人",
    record: { w: 45 + (year % 13), l: 37 - (year % 11) },
    finish: year % 5 === 0 ? "champion" : year % 5 === 1 ? "finals" : year % 5 === 2 ? "playoffs" : "lottery",
    transactions: Array.from({ length: tradeCount }, (_, i) => tradeEntry(year, i)),
  };
}

function withHistory(root, seasons) {
  return {
    ...root,
    leagueCareer: {
      ...root.leagueCareer,
      management: { ...root.leagueCareer.management, seasonHistory: seasons },
    },
  };
}

/** Stored size of a root: write it (compaction included) and measure the key. */
function storedRootSize(root, label) {
  const storage = createMemoryStorage();
  writeRootSave(root, storage);
  const text = storage.getItem(ROOT_SAVE_KEY);
  if (text === null) throw new Error(`${label}: root was not stored`);
  const roundTripped = readRootSave(storage);
  if (!roundTripped) throw new Error(`${label}: stored root fails validation on read-back`);
  return { units: text.length, bytes: utf8(text) };
}

function main() {
  const simExport = realSimExport();
  const feed = feedLines(24);

  const empty = storedRootSize(createRootState(), "empty");
  const mid = storedRootSize(
    withHistory(hiredRoot(), Array.from({ length: 5 }, (_, i) => seasonSummary(1996 + i, "LAL", 5))),
    "mid",
  );
  const lateRoot = withHistory(
    hiredRoot(),
    Array.from({ length: 20 }, (_, i) => seasonSummary(1996 + i, "LAL", 20)),
  );
  lateRoot.liveGame = { context: {}, seasonPendingGame: null, sim: simExport, feed, manualOverrides: {} };
  const late = storedRootSize(lateRoot, "late");

  // ---- other keys (same origin, same budget) ----
  // Account store: localStorage polyfill so createAccount really persists.
  globalThis.localStorage = createMemoryStorage();
  const account = createAccount("测试教练");
  const skeletonStore = JSON.parse(globalThis.localStorage.getItem(ACCOUNTS_KEY));
  const skeleton = entry(ACCOUNTS_KEY, globalThis.localStorage.getItem(ACCOUNTS_KEY));
  const activeKey = entry(ACTIVE_ACCOUNT_KEY, globalThis.localStorage.getItem(ACTIVE_ACCOUNT_KEY));

  // Collection scenario: 100 real player ids, 20 merged cards, a full 20-entry
  // challenge archive, 2 completed careers, identity places set.
  const rows = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
  const brefs = [...new Set(rows.map((r) => r.bref))].slice(0, 100);
  account.playerIds = brefs;
  account.cardMods = Object.fromEntries(
    brefs.slice(0, 20).map((id) => [id, { merges: 2, skills: ["clutch_killer", "stepback"] }]),
  );
  account.challengeArchive = Array.from({ length: 20 }, (_, i) =>
    challengeArchiveEntry(
      { team: realTeam("LAL", 1996), challengeTier: "gold", round: 5, losses: { you: 2 }, finals: i % 2 === 0 },
      i % 3 === 0 ? "champion" : "eliminated",
      1790000000000 + i * 86400000,
    ),
  );
  account.careerCompletions = [
    { careerId: "c-coach-1", role: "COACH", prestige: false, year: 2008, seasons: 12, championships: 2, tier: "great", reason: "retired", at: 1790000000000 },
    { careerId: "c-gm-1", role: "GM", prestige: false, year: 2012, seasons: 9, championships: 1, tier: "solid", reason: "retired", at: 1791000000000 },
  ];
  account.identityPlaces = { birthplace: "上海", grewUpIn: "上海", representedCity: "洛杉矶" };
  account.profile = { hometown: "上海", bio: "老球迷，湖蜜二十年。" };
  skeletonStore.accounts = [account];
  const accountsFullText = JSON.stringify(skeletonStore);
  const accountsFull = entry(ACCOUNTS_KEY, accountsFullText);

  // Guest keys: a filled guest profile, the default look, a mid-level AXP record,
  // and a full 20-entry guest challenge archive.
  const guestProfile = entry(
    GUEST_PROFILE_KEY,
    JSON.stringify(sanitizeProfile({ name: "游客教练", hometown: "南京", bio: "刚入坑的新手教练，目标是带湖人重回巅峰。" })),
  );
  const guestAvatar = entry(GUEST_LOOK_KEY, JSON.stringify(DEFAULT_LOOK));
  const guestAxpText = JSON.stringify({ totalXp: 1250, claimed: ["level_2_reward", "level_3_reward"], once: { first_win: true } });
  const guestAxp = entry(GUEST_AXP_KEY, guestAxpText);
  const guestArchiveText = JSON.stringify(account.challengeArchive);
  const guestArchive = entry(GUEST_ARCHIVE_KEY, guestArchiveText);

  // Mid-match autosave: the exact payload shape writeSave() stores.
  const autosaveText = JSON.stringify({
    v: 1,
    savedAt: 1790000000000,
    screen: "match",
    label: "第3节 05:12 湖人 vs 公牛",
    app: null,
    sim: simExport,
    feed,
  });
  const autosave = entry(AUTOSAVE_KEY, autosaveText);

  const otherSignedIn = skeleton.units + activeKey.units + autosave.units;
  const otherCollection = accountsFull.units + activeKey.units + autosave.units;
  const otherGuest = guestProfile.units + guestAvatar.units + guestAxp.units + guestArchive.units + autosave.units;
  const otherKeys = Math.max(otherSignedIn, otherCollection, otherGuest);

  const threshold = Math.floor((BUDGET - otherKeys) / 3);
  const peak = (root) => 3 * root.units + otherKeys;
  const retained = (root) => 2 * root.units + otherKeys;

  const line = (s) => console.log(s);
  line("save-size budget — ADR-004 v3→v4 migration (all sizes in UTF-16 code units, the unit");
  line("localStorage quota is counted in; UTF-8 byte counts in parentheses)");
  line(`budget: ${BUDGET.toLocaleString("en-US")} u (5 MiB)`);
  line("");
  line("root shapes (stored size after writeRootSave compaction + validation):");
  for (const [name, s] of [["empty", empty], ["mid (5 seasons)", mid], ["late (20 seasons)", late]]) {
    line(`  ${name.padEnd(20)} ${fmt(s.units)}  [utf8 ${s.bytes.toLocaleString("en-US")} B]`);
  }
  line("");
  line("other keys on the same origin:");
  line(`  accounts store (skeleton, 1 account)  ${fmt(skeleton.units)}`);
  line(`  accounts store (collection scenario)   ${fmt(accountsFull.units)}`);
  line(`  active-account key                     ${fmt(activeKey.units)}`);
  line(`  guest profile (filled)                 ${fmt(guestProfile.units)}`);
  line(`  guest avatar (default look)            ${fmt(guestAvatar.units)}`);
  line(`  guest AXP (mid-level)                  ${fmt(guestAxp.units)}`);
  line(`  guest challenge archive (20 entries)   ${fmt(guestArchive.units)}`);
  line(`  mid-match autosave                     ${fmt(autosave.units)}`);
  line(`  other-keys total (worst case)          ${fmt(otherKeys)}`);
  line("");
  line("migration peak (root + backup + tmp) and retained (root + backup) vs budget:");
  for (const [name, s] of [["empty", empty], ["mid", mid], ["late", late]]) {
    const p = peak(s);
    const r = retained(s);
    line(`  ${name.padEnd(6)} peak ${fmt(p)} (${((p / BUDGET) * 100).toFixed(1)}% of budget) — ${p <= BUDGET ? "CAN migrate" : "REFUSE migration"}; retained ${fmt(r)} (${((r / BUDGET) * 100).toFixed(1)}%)`);
  }
  line("");
  line(`migration threshold: a root up to ${fmt(threshold)} may migrate (peak = 3x root + other keys <= budget).`);
  line(`  late-career root headroom: ${fmt(threshold - late.units)} under the threshold.`);
  line("");
  console.log(JSON.stringify({
    budget: BUDGET,
    empty: empty.units, mid: mid.units, late: late.units,
    otherKeys, threshold,
    lateHeadroom: threshold - late.units,
    latePeak: peak(late), lateRetained: retained(late),
  }));
}

main();
