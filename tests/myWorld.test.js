// My World (ADR-008 N-1): identity persistence + isolation, and the view's honesty rules.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const acc = await import("../js/data/account.js");
const { saveIdentity, readIdentity, sanitizeProfile, GUEST_PROFILE_KEY, PROFILE_LIMITS } = await import("../js/data/profile.js");
const view = await import("../js/ui/myWorldView.js");

const CJK = /[\u4e00-\u9fff]/;
const fresh = () => {
  globalThis.localStorage = createMemoryStorage();
};

test("identity edits persist on the account, survive a reload, and stay isolated between accounts", () => {
  fresh();
  const a = acc.createAccount("阿尔法");
  const b = acc.createAccount("贝塔");
  a.gold = 777;
  a.playerIds = ["x-1", "x-2"];
  acc.saveAccount(a);
  const saved = saveIdentity(acc.getAccount(a.id), { name: "Zoro", hometown: "Arkansas", bio: "从街球打到总决赛" });
  assert.equal(saved.saved, true);
  const reloaded = acc.getAccount(a.id); // a fresh read from storage == "reopen the page"
  assert.equal(reloaded.name, "Zoro");
  assert.deepEqual(reloaded.profile, { hometown: "Arkansas", bio: "从街球打到总决赛" });
  assert.equal(reloaded.gold, 777, "cards / gold untouched");
  assert.deepEqual(reloaded.playerIds, ["x-1", "x-2"]);
  const other = acc.getAccount(b.id);
  assert.equal(other.name, "贝塔");
  assert.equal(other.profile, undefined, "the other account is not touched");
  assert.equal(readIdentity(other).hometown, "");
  assert.equal(localStorage.getItem(GUEST_PROFILE_KEY), null, "signed-in edits never land in the guest key");
  assert.equal(localStorage.getItem("cls_root_v3"), null, "no career save is created or touched");
});

test("an empty display name keeps the old one; values are trimmed, de-controlled and capped", () => {
  fresh();
  const a = acc.createAccount("原名");
  saveIdentity(a, { name: "   ", hometown: "  Little\tRock  ", bio: "x".repeat(500) });
  const r = acc.getAccount(a.id);
  assert.equal(r.name, "原名");
  assert.equal(r.profile.hometown, "Little Rock");
  assert.equal(r.profile.bio.length, PROFILE_LIMITS.bio);
  assert.deepEqual(sanitizeProfile({ name: "a\u0000b", hometown: null }), { name: "a b", hometown: "", bio: "" });
});

test("guests: profile lives in one local key, and a blocked storage is reported, not faked", () => {
  fresh();
  const g = saveIdentity(null, { name: "路人", hometown: "Fayetteville" });
  assert.equal(g.guest, true);
  assert.equal(g.saved, true);
  assert.equal(readIdentity(null).hometown, "Fayetteville");
  const blocked = { getItem() { return null; }, setItem() { throw new Error("quota"); } };
  assert.equal(saveIdentity(null, { name: "x" }, { store: blocked }).saved, false);
});

const root = (trophies = 0) => ({
  story: { startYear: 1995 },
  leagueCareer: {
    kind: "timeTravel",
    season: { year: 1998, userTeamId: "CHI", teams: { CHI: { name: "公牛" } } },
    management: {
      seasonHistory: Array.from({ length: 3 }, (_, i) => ({
        year: 1995 + i, teamName: "公牛", ...(i < trophies ? { trophy: { opponentName: "爵士", seriesScore: "4-2" } } : {}),
      })),
    },
  },
});

test("journey and legacy are read from real data; no career / no cards / guest are honest empty states", () => {
  assert.equal(view.journeyFromRoot(null), null);
  assert.equal(view.journeyFromRoot({ leagueCareer: {} }), null);
  const j = view.journeyFromRoot(root(2));
  assert.deepEqual([j.kind, j.startYear, j.year, j.seasonsDone, j.trophies.length], ["timeTravel", 1995, 1998, 3, 2]);
  assert.equal(view.legacyFromAccount(null), null);
  assert.deepEqual(view.legacyFromAccount({ playerIds: ["a", "b"], codex: ["b", "c"], rankedWins: 4 }), { cards: 2, codex: 3, rankedWins: 4, rankedLosses: 0 });

  const emptyHtml = view.myWorldHtml({ identity: { name: "", hometown: "", bio: "", guest: true }, journey: null, legacy: null, frames: [] }, "zh");
  assert.match(emptyHtml, /还没有进行中的生涯/);
  assert.match(emptyHtml, /还没有冠军/);
  assert.doesNotMatch(emptyHtml, /🏆/, "no trophy is drawn when there is none");
  assert.equal((emptyHtml.match(/空相框/g) || []).length, 3, "three honest empty frames");
  assert.match(emptyHtml, /访客资料只保存在这台设备/);

  const full = view.myWorldHtml({ identity: { name: "Z", hometown: "", bio: "", guest: false }, journey: view.journeyFromRoot(root(2)), legacy: view.legacyFromAccount({ playerIds: ["a"] }), frames: [] }, "zh");
  assert.equal((full.match(/🏆/g) || []).length, 4, "two trophies in the list + two on the shelf");
  assert.match(full, /data-mw-action="resume-career"/);
});

test("every rendered action button has a handler; user text is escaped; English has no Chinese left", () => {
  const evil = { name: "<img src=x onerror=1>", hometown: "\"><script>", bio: "&", guest: false };
  const html = view.myWorldHtml({ identity: evil, journey: view.journeyFromRoot(root(1)), legacy: view.legacyFromAccount({ playerIds: [] }), frames: [] }, "zh");
  assert.doesNotMatch(html, /<img src=x|<script>/);
  const known = ["edit-identity", "cancel-identity", "resume-career", "start-career", "open-collection", "open-accounts", "copy-feedback"];
  for (const [, name] of html.matchAll(/data-mw-action="([^"]+)"/g)) assert.ok(known.includes(name), name);
  assert.match(html, new RegExp(view.FEEDBACK_URL.replace(/[.]/g, "\\.")));

  const en = view.myWorldHtml({ identity: { name: "Zoro", hometown: "Arkansas", bio: "hi", guest: true }, journey: null, legacy: null, frames: [] }, "en");
  assert.doesNotMatch(en, CJK);
});

test("feedback template holds only what the player typed plus version info", () => {
  const t = view.feedbackTemplate({ note: "  加一个投篮训练小游戏 ", lang: "zh", userAgent: "UA/1" });
  assert.match(t, /我的想法: 加一个投篮训练小游戏/);
  assert.match(t, /UA\/1/);
  assert.match(view.feedbackTemplate({ lang: "en" }), /write your suggestion here/);
});
