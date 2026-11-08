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

test("every rendered action button has a handler; user text is escaped; English has no Chinese left", async () => {
  const evil = { name: "<img src=x onerror=1>", hometown: "\"><script>", bio: "&", guest: false };
  const html = view.myWorldHtml({ identity: evil, journey: view.journeyFromRoot(root(1)), legacy: view.legacyFromAccount({ playerIds: [] }), frames: [] }, "zh");
  assert.doesNotMatch(html, /<img src=x|<script>/);
  const known = ["edit-identity", "cancel-identity", "resume-career", "start-career", "open-collection", "open-accounts", "copy-feedback", "toggle-feedback", "submit-feedback", "clear-stars", "use-3d-portrait", "toggle-look", "avatar-action-clap", "avatar-action-jump", "avatar-action-run", "avatar-action-sit", "avatar-idle"];
  const handlerSource = (await import("node:fs")).readFileSync(new URL("../js/ui/myWorldScreen.js", import.meta.url), "utf8");
  for (const [, name] of html.matchAll(/data-mw-action="([^"]+)"/g)) {
    assert.ok(known.includes(name), name);
    assert.ok(handlerSource.includes(`"${name}"`), `${name} has no handler in myWorldScreen.js`);
  }
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

test("redesign: one page title, My Games naming, feedback behind a corner icon, nothing fake is clickable", () => {
  const html = view.myWorldHtml({ identity: { name: "Z", hometown: "", bio: "", guest: true }, journey: null, legacy: null, frames: [] }, "zh");
  assert.doesNotMatch(html, /我的篮球人生|COURTSIDE LEGENDS · MY WORLD/, "no redundant headings (the tab already carries the name)");
  assert.equal((html.match(/MY WORLD/g) || []).length, 1, "exactly one page title");
  assert.match(html, /我的游戏记录/);
  assert.doesNotMatch(html, /我的旅程/);
  assert.match(html, /<section class="mw-feedback" id="mw-feedback"[^>]*hidden>/, "feedback is closed by default");
  assert.match(html, /data-mw-action="toggle-feedback"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(html, /Daily Hub|My Style|每日|换装/, "unimplemented features are omitted, not faked");
  const en = view.myWorldHtml({ identity: { name: "Z", hometown: "", bio: "", guest: true }, journey: null, legacy: null, frames: [] }, "en");
  assert.match(en, /My Games/);
  assert.doesNotMatch(en, /My Basketball Life/);
  assert.doesNotMatch(en, CJK);
});

test("Player Voice: submit is disabled and says why until a real submit exists; nothing claims 'sent'", () => {
  const closed = view.feedbackHtml("zh", {}, false);
  assert.match(closed, /data-mw-action="submit-feedback" disabled aria-disabled="true"/);
  assert.match(closed, /反馈服务还没有上线/);
  assert.match(closed, /草稿/);
  assert.doesNotMatch(closed, /已提交|已发送|感谢你的反馈/);
  const open = view.feedbackHtml("zh", {}, true);
  assert.doesNotMatch(open, /submit-feedback" disabled/);
  assert.doesNotMatch(open, /反馈服务还没有上线/);
  assert.match(view.feedbackHtml("en", {}, false), /not online yet/);
});

test("Player Voice: a draft restores category, rating and note; the note is escaped; GitHub is only a small fallback", () => {
  const html = view.feedbackHtml("zh", { category: "bug", stars: 3, note: "</textarea><img src=x onerror=1>" }, false);
  assert.match(html, /name="mw-fb-category" value="bug" checked/);
  assert.match(html, /name="mw-fb-stars" value="3" checked/);
  assert.equal((html.match(/class="mw-star on"/g) || []).length, 3, "stars 1-3 are lit");
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /已恢复你在这台设备上的草稿/);
  assert.equal(view.feedbackHtml("zh", {}, false).includes("已恢复"), false, "no draft, no restore notice");
  assert.match(html, /class="mw-fb-link"/);
  assert.doesNotMatch(html, /btn[^"]*"[^>]*href=/, "GitHub is a plain text link, not a button");
  for (const bad of [{ category: "admin", stars: 9 }, { category: null, stars: "x" }]) {
    const safe = view.feedbackHtml("zh", bad, false);
    assert.match(safe, /value="suggestion" checked/);
    assert.doesNotMatch(safe, /mw-star on/);
  }
});

test("Player Voice: template carries category and rating; English panel has no Chinese", () => {
  const t = view.feedbackTemplate({ note: "n", category: "bug", stars: 4, lang: "zh" });
  assert.match(t, /类型: 问题/);
  assert.match(t, /评分: 4\/5/);
  assert.doesNotMatch(view.feedbackTemplate({ note: "n", stars: 0, lang: "zh" }), /评分/, "no rating line when unrated");
  assert.match(view.feedbackTemplate({ category: "rating", stars: 5, lang: "en" }), /Type: Rating\nRating: 5\/5/);
  assert.doesNotMatch(view.feedbackHtml("en", { category: "bug", stars: 2, note: "hi" }, false), CJK);
});
