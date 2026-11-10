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
  assert.deepEqual(view.legacyFromAccount({ playerIds: ["a", "b"], codex: ["b", "c"], rankedWins: 4 }), { cards: 2, codex: 3, rankedWins: 4, rankedLosses: 0, myTeam: { titles: 0, played: 0, recent: [] }, architect: { earned: [], progress: { coach: false, gm: false, completed: 0 } } });

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
  const known = ["edit-identity", "cancel-identity", "resume-career", "start-career", "open-collection", "open-accounts", "open-shop", "clear-stars", "use-3d-portrait", "pick-photo", "toggle-look", "avatar-action-clap", "avatar-action-jump", "avatar-action-run", "avatar-action-sit", "avatar-idle", "toggle-level-track", "claim-level-reward", "showcase-figure", "equip-owned", "unequip-owned"];
  const handlerSource = (await import("node:fs")).readFileSync(new URL("../js/ui/myWorldScreen.js", import.meta.url), "utf8");
  for (const [, name] of html.matchAll(/data-mw-action="([^"]+)"/g)) {
    assert.ok(known.includes(name), name);
    assert.ok(handlerSource.includes(`"${name}"`), `${name} has no handler in myWorldScreen.js`);
  }

  const en = view.myWorldHtml({ identity: { name: "Zoro", hometown: "Arkansas", bio: "hi", guest: true }, journey: null, legacy: null, frames: [] }, "en");
  assert.doesNotMatch(en, CJK);
});

test("redesign: one page title, My Games naming, no feedback panel on this page, nothing fake is clickable", () => {
  const html = view.myWorldHtml({ identity: { name: "Z", hometown: "", bio: "", guest: true }, journey: null, legacy: null, frames: [] }, "zh");
  assert.doesNotMatch(html, /我的篮球人生|COURTSIDE LEGENDS · MY WORLD/, "no redundant headings (the tab already carries the name)");
  assert.equal((html.match(/MY WORLD/g) || []).length, 1, "exactly one page title");
  assert.match(html, /我的游戏记录/);
  assert.doesNotMatch(html, /我的旅程/);
  assert.doesNotMatch(html, /mw-feedback|mw-voice|toggle-feedback|Player Voice/, "feedback lives in the global top-bar dialog now, not on this page");
  assert.doesNotMatch(html, /Daily Hub|My Style|每日|换装/, "unimplemented features are omitted, not faked");
  const en = view.myWorldHtml({ identity: { name: "Z", hometown: "", bio: "", guest: true }, journey: null, legacy: null, frames: [] }, "en");
  assert.match(en, /My Games/);
  assert.doesNotMatch(en, /My Basketball Life/);
  assert.doesNotMatch(en, CJK);
});

// Character showcase + owned shop items (integration sprint, workstream D): the showcase
// is always visible with a Stylized/Bobblehead switch writing the same look.figure the
// editor writes; the owned area reads the same account.shop state the shop writes.
const shopAccount = (over = {}) => ({
  id: "acc-shop",
  avatar: { figure: "stylized", skin: "tone3", style: "short", hair: "black", outfit: "forest", body: "standard" },
  shop: {
    owned: { "frame-champion-gold": true, "outfit-champion-gold": true, "furniture-trophy-cabinet": true },
    equippedFrame: "frame-champion-gold",
    tickets: 5,
    autoUsed: {},
  },
  ...over,
});

test("owned summary: recent follows purchase order, equipped state is derived from the look and the frame record", () => {
  const s = view.ownedShopSummary(shopAccount());
  assert.deepEqual(s.recent.map((i) => i.id), ["furniture-trophy-cabinet", "outfit-champion-gold", "frame-champion-gold"], "last bought first");
  assert.equal(s.tickets, 5);
  assert.deepEqual(s.furniture.map((i) => i.id), ["furniture-trophy-cabinet"]);
  assert.deepEqual(s.frames.map((o) => [o.item.id, o.equipped]), [["frame-champion-gold", true]]);
  assert.deepEqual(s.outfits.map((o) => [o.item.id, o.equipped]), [["outfit-champion-gold", false]], "forest is worn, the shop outfit is owned but not equipped");

  const wearing = view.ownedShopSummary(shopAccount({ avatar: { figure: "stylized", skin: "tone3", style: "short", hair: "black", outfit: "champion", body: "standard" } }));
  assert.deepEqual(wearing.outfits.map((o) => [o.item.id, o.equipped]), [["outfit-champion-gold", true]]);
  assert.equal(view.ownedShopSummary(null), null, "guests own nothing");
});

test("owned area: every bought item has a findable equip/place entry; furniture is shown placed in My Home", () => {
  const s = view.ownedShopSummary(shopAccount());
  const html = view.ownedShopHtml(s, "zh");
  assert.match(html, /最近购买/);
  assert.ok(html.indexOf("冠军奖杯柜") < html.indexOf("冠军金边球衣"), "newest purchase listed first");
  assert.match(html, /已摆放在 My Home/, "furniture shows where it lives");
  assert.match(html, /data-mw-action="equip-owned"/, "an owned outfit has a wear button");
  assert.match(html, /data-mw-action="unequip-owned"/, "the equipped frame has a take-off button");
  assert.match(html, /托管卡 5 张/);
  assert.doesNotMatch(html, /每日|换装/, "no forbidden copy in the owned area");

  const guest = view.ownedShopHtml(null, "zh");
  assert.match(guest, /访客没有已购物品/);
  assert.match(guest, /data-mw-action="open-accounts"/);
  const empty = view.ownedShopHtml({ recent: [], outfits: [], frames: [], furniture: [], tickets: 0 }, "zh");
  assert.match(empty, /还没有在商城买过东西/);
  assert.match(empty, /data-mw-action="open-shop"/);
});

test("showcase: stage is always rendered, the style switch reflects the real look, level chip comes from the snapshot", () => {
  const level = { level: 7, title: "球场老将", titleEn: "Veteran", totalXp: 900, xpIntoLevel: 50, xpForNext: 100, pct: 50, isMax: false, track: [] };
  const html = view.showcaseHtml({ identity: { name: "Zoro", guest: false }, look: { figure: "bobblehead" }, portrait: null, level }, "zh");
  assert.match(html, /id="mw-showcase-stage"/);
  assert.match(html, /data-figure="bobblehead" aria-pressed="true"/);
  assert.match(html, /data-figure="stylized" aria-pressed="false"/);
  assert.match(html, /Lv\.7 · 球场老将/);
  assert.match(html, /data-mw-action="toggle-look"/, "the full editor stays one tap away");
  const en = view.showcaseHtml({ identity: { name: "Zoro", guest: false }, look: { figure: "stylized" }, portrait: null, level }, "en");
  assert.doesNotMatch(en, CJK);
  assert.match(en, /Lv\.7 · Veteran/);
});

test("home scene renders owned furniture in the real room (cabinet + new pieces), skips unknown ids", () => {
  const html = view.homeSceneHtml({ identity: { name: "Zoro" }, frames: [], trophyCount: 0, furniture: ["trophy-cabinet", "sofa", "rug", "no-such-piece"] }, "zh");
  assert.match(html, /data-furniture="trophy-cabinet"/, "cabinet still renders");
  assert.match(html, /data-furniture="sofa"/, "bought sofa is placed in the real room");
  assert.match(html, /data-furniture="rug"/, "rug renders");
  assert.doesNotMatch(html, /no-such-piece/, "unknown ids never break the room");
  const empty = view.homeSceneHtml({ identity: { name: "Zoro" }, frames: [], trophyCount: 0, furniture: [] }, "zh");
  assert.doesNotMatch(empty, /data-furniture=/, "no furniture, no furniture groups");
});
