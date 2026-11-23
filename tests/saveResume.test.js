// B61 step 12: what "continue from save" decides before it touches the page (js/ui/saveResume.js). continueFromSave in app.js keeps
// every side effect; these tests pin the three decisions and the legend markup it used to inline.
import test from "node:test";
import assert from "node:assert/strict";
import { FRANCHISES, POS_SLOTS, franchiseName } from "../js/data/franchises.js";
import { legendChipsHtml, legendPosHtml, resumeRoute, resumeSettings } from "../js/ui/saveResume.js";

test("a save from before the three auto switches carries its one managed flag into all three", () => {
  const legacy = resumeSettings({ mode: "quick", managed: true });
  assert.deepEqual([legacy.autoOffense, legacy.autoDefense, legacy.autoRotation], [true, true, true]);
  const legacyOff = resumeSettings({ mode: "quick", managed: false });
  assert.deepEqual([legacyOff.autoOffense, legacyOff.autoDefense, legacyOff.autoRotation], [false, false, false]);
});

test("a switch the save does set wins over the legacy flag, one by one; an explicit false is not 'unset'", () => {
  const s = resumeSettings({ mode: "quick", managed: true, autoOffense: false, autoDefense: null, autoRotation: 0 });
  assert.equal(s.autoOffense, false, "explicit false beats managed:true");
  assert.equal(s.autoDefense, true, "null counts as unset, so the legacy flag applies");
  assert.equal(s.autoRotation, false, "0 is a set value (falsy, but not null)");
  assert.equal(resumeSettings({ mode: "quick", autoOffense: 1 }).autoOffense, true, "set values are coerced to booleans");
});

test("null counts as unset for the other two switches too, so the legacy flag applies (B100)", () => {
  // The earlier test pinned null→legacy only for autoDefense; M2 (!= null → !== undefined) on
  // autoOffense/autoRotation would have slipped through uncaught.
  const on = resumeSettings({ mode: "quick", managed: true, autoOffense: null, autoRotation: null });
  assert.deepEqual([on.autoOffense, on.autoRotation], [true, true], "null falls back to managed:true");
  const off = resumeSettings({ mode: "quick", managed: false, autoOffense: null, autoRotation: null });
  assert.deepEqual([off.autoOffense, off.autoRotation], [false, false], "null falls back to managed:false");
  const undef = resumeSettings({ mode: "quick", managed: true, autoOffense: undefined, autoRotation: undefined });
  assert.deepEqual([undef.autoOffense, undef.autoRotation], [true, true], "undefined is unset the same way");
});

test("mode, lastMode and speed fall back the way the old inline code did", () => {
  assert.deepEqual(
    [resumeSettings({ mode: "draft" }).lastMode, resumeSettings({ mode: "draft", lastMode: "season" }).lastMode],
    ["draft", "season"],
    "lastMode falls back to the mode",
  );
  assert.equal(resumeSettings({ mode: "quick" }).speed, 1);
  assert.equal(resumeSettings({ mode: "quick", speed: 0 }).speed, 1, "speed 0 reads as unset (||, not ??)");
  assert.equal(resumeSettings({ mode: "quick", speed: 3 }).speed, 3);
});

const ALL = { draft: {}, pendingMatch: {}, legend: {}, career: {}, tournament: {} };
const NONE = { draft: null, pendingMatch: null, legend: null, career: null, tournament: null };

test("each screen resumes only when the state it needs was revived", () => {
  for (const [screen, needs] of [["draft", "draft"], ["setup", "pendingMatch"], ["legend", "legend"], ["market", "career"], ["tournament", "tournament"]]) {
    assert.equal(resumeRoute({ screen }, ALL), screen, `${screen} with its state`);
    assert.equal(resumeRoute({ screen }, { ...ALL, [needs]: null }), "incomplete", `${screen} without ${needs}`);
    // the OTHER states being there does not stand in for the one it needs
    assert.equal(resumeRoute({ screen }, { ...NONE, ...Object.fromEntries(Object.entries(ALL).filter(([k]) => k !== needs)) }), "incomplete", `${screen}: other states don't count`);
  }
});

test("a game in flight wins over whatever screen the save names, and needs no other state", () => {
  assert.equal(resumeRoute({ sim: { home: {} }, screen: "draft" }, ALL), "game");
  assert.equal(resumeRoute({ sim: { home: {} } }, NONE), "game");
  assert.equal(resumeRoute({ sim: null, screen: "tournament" }, ALL), "tournament", "a null sim is no game");
});

test("a save is user data: no screen name outside the five counts, whatever it coerces to", () => {
  for (const screen of [undefined, null, "home", "", "constructor", "toString", "__proto__", "hasOwnProperty", ["draft"], 5, {}, true]) {
    assert.equal(resumeRoute({ screen }, ALL), "incomplete", `screen ${JSON.stringify(screen)}`);
  }
});

// The reference templates are the ones continueFromSave and the legend start used to inline, byte for byte.
const refChips = (fs, lang) => fs.map((f) => `<span class="franchise-chip" data-id="${f.id}">${franchiseName(f, lang)} <small>${f.id}</small></span>`).join("");
const refPos = (id) => POS_SLOTS.map((s) => `<label><input type="radio" name="legend-pos" value="${s.id}" ${s.id === id ? "checked" : ""}/> ${s.label}</label>`).join("");

test("the legend chips are the franchise name and id, in both languages, for real franchises", () => {
  const eight = FRANCHISES.slice(0, 8);
  assert.equal(eight.length, 8);
  for (const lang of ["zh", "en"]) assert.equal(legendChipsHtml(eight, lang), refChips(eight, lang));
  assert.equal(legendChipsHtml([], "zh"), "");
  assert.notEqual(legendChipsHtml(eight, "zh"), legendChipsHtml(eight, "en"), "the language is passed through, not baked in");
});

test("the position radios preselect exactly the asked slot (none for an unknown one)", () => {
  for (const s of POS_SLOTS) {
    const html = legendPosHtml(s.id);
    assert.equal(html, refPos(s.id));
    assert.equal([...html.matchAll(/checked/g)].length, 1, `${s.id}: exactly one radio is checked`);
    assert.match(html, new RegExp(`value="${s.id}" checked`));
  }
  assert.equal([...legendPosHtml("XX").matchAll(/checked/g)].length, 0);
});
