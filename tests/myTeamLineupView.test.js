import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { installRealCards, realCards } = await import("./helpers/realGame.js");
const { overall } = await import("../js/data/players.js");
const { autoLineup, ownedCards, validateMyTeamLineup, toggleRoster } = await import("../js/myteam/lineup.js");
const { issueText, myTeamLineupHtml } = await import("../js/ui/myTeamLineupView.js");
const { createMyTeamLineup } = await import("../js/ui/myTeamLineupScreen.js");

const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01"];
installRealCards(...STARS);
const peak = (b) => realCards(b).sort((x, y) => overall(y) - overall(x))[0].id;
const account = () => ({ id: "a1", name: "T", playerIds: STARS.map(peak), cardMods: {}, gold: 1 });
const render = (acc, draft, extra = {}, lang = "zh") =>
  myTeamLineupHtml({ lang, account: acc, cards: ownedCards(acc), draft, validation: validateMyTeamLineup(acc, draft), ...extra });

test("the view shows roster / starter counts and the ready banner for an eligible lineup", () => {
  const a = account();
  const d = autoLineup(a);
  const html = render(a, d);
  assert.match(html, /名单 <b>9<\/b>\/12/);
  assert.match(html, /首发 <b>5<\/b>\/5/);
  assert.match(html, /这份阵容可以开赛季/);
  assert.equal((html.match(/class="mtl-row/g) || []).length, 9);
  assert.equal((html.match(/rot-attrs sub-attrs mtl-attrs/g) || []).length, 9, "every builder row shows the seven sub-attribute chips");
  assert.match(html, /控球/, "chip labels are the same seven sub-attributes as the collection screen");
});

test("an incomplete lineup says what is missing and still offers Save once edited", () => {
  const a = account();
  const d = { rosterIds: autoLineup(a).rosterIds.slice(0, 3), starterIds: [] };
  const html = render(a, d, { dirty: true });
  assert.match(html, /还不能开赛季，但可以继续编辑和保存/);
  assert.match(html, /名单还差 5 人/);
  assert.doesNotMatch(html, /data-act="save" disabled/);
  assert.match(render(a, d, { dirty: false }), /data-act="save" disabled/);
});

test("the star button is disabled for a card that is not on the roster", () => {
  const a = account();
  const html = render(a, { rosterIds: [], starterIds: [] });
  assert.equal((html.match(/data-act="starter"[^>]*disabled/g) || []).length, 9);
});

test("a guest gets guidance, not an editor", () => {
  const html = myTeamLineupHtml({ lang: "zh", account: null, cards: [], draft: { rosterIds: [], starterIds: [] }, validation: validateMyTeamLineup(null, {}) });
  assert.match(html, /登录或创建账号/);
  assert.match(html, /data-act="accounts"/);
  assert.doesNotMatch(html, /mtl-list/);
});

test("English output leaves no Chinese behind", () => {
  const a = account();
  const d = { rosterIds: autoLineup(a).rosterIds.slice(0, 4), starterIds: [] };
  const html = render(a, d, { dirty: true, hasSaved: true, notice: issueText({ code: "roster_full" }, "en"), source: "repaired" }, "en");
  assert.doesNotMatch(html, /[\u4e00-\u9fff]/);
  for (const code of ["guest", "not_owned", "duplicate_person", "roster_small", "roster_large", "starters_count", "starter_not_in_roster", "coach_not_owned", "position_stack", "no_guard", "roster_full", "starters_full", "not_on_roster"]) {
    const en = issueText({ code, have: 1, min: 8, max: 12, need: 5, count: 3, slot: "C" }, "en");
    assert.ok(en && !/[\u4e00-\u9fff]/.test(en), code);
  }
});

test("user text is escaped in the rendered rows and notices", () => {
  const a = account();
  const evil = ownedCards(a).map((c, i) => (i === 0 ? { ...c, name: "<img src=x onerror=1>", nameEn: "<script>1</script>" } : c));
  const html = myTeamLineupHtml({ lang: "zh", account: a, cards: evil, draft: autoLineup(a), validation: validateMyTeamLineup(a, autoLineup(a)), notice: "<b>x</b>" });
  assert.doesNotMatch(html, /<img src=x|<script>|<b>x<\/b>/);
});

// ---- controller: opening never writes; only Save / Clear do ----------------------------------------
function harness(acc) {
  const calls = { save: [], clear: [] };
  const listeners = {};
  const el = {
    innerHTML: "",
    addEventListener(type, fn) { listeners[type] = fn; },
  };
  const click = (act, cardId) => listeners.click({
    target: { closest: (sel) => (sel === "[data-act]" ? { dataset: { act }, disabled: false, closest: () => (cardId ? { dataset: { card: cardId } } : null) } : null) },
  });
  const ctl = createMyTeamLineup({
    el, getLang: () => "zh", getAccount: () => acc,
    saveLineup: (id, d) => { calls.save.push([id, d]); return { ok: true }; },
    clearLineup: (id) => { calls.clear.push(id); return { ok: true }; },
  });
  return { el, ctl, calls, click };
}

test("opening and editing the lineup never calls the store; Save and Clear are the only writers", () => {
  const a = account();
  const { el, ctl, calls, click } = harness(a);
  ctl.open();
  assert.match(el.innerHTML, /mtl-list/);
  const first = autoLineup(a).rosterIds[0];
  click("roster", first);
  click("starter", first);
  click("auto");
  ctl.refresh();
  assert.deepEqual(calls, { save: [], clear: [] });
  click("roster", first); // now dirty
  click("save");
  assert.equal(calls.save.length, 1);
  assert.equal(calls.save[0][0], "a1");
});

test("a blocked action shows an explanation instead of silently doing nothing", () => {
  const a = account();
  const { el, ctl, click } = harness(a);
  ctl.open();
  const notOnRoster = ownedCards(a).find((c) => !autoLineup(a).rosterIds.includes(c.id));
  assert.equal(notOnRoster, undefined, "fixture: all 9 fit the roster");
  const draft = autoLineup(a);
  click("roster", draft.rosterIds[0]); // remove one
  click("starter", draft.rosterIds[0]); // not on roster any more -> explanation
  assert.match(el.innerHTML, /先把他加入名单/);
});

test("the Save button is disabled until the draft differs from what was loaded", () => {
  const a = account();
  const { el, ctl } = harness(a);
  ctl.open();
  assert.match(el.innerHTML, /data-act="save" disabled/);
});

test("toggleRoster mutation guard: the editor cannot exceed the roster cap", () => {
  const a = account();
  const d = autoLineup(a);
  const tight = { minRoster: 2, maxRoster: 3, starters: 2 };
  const res = toggleRoster(a, { rosterIds: d.rosterIds.slice(0, 3), starterIds: [] }, d.rosterIds[5], tight);
  assert.equal(res.blocked, "roster_full");
});
