// W3 Avatar Creator vertical slice (no art): body presets, visual height, existing animations,
// and the appearance-only lock (a different build/height never changes any game value).
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const acc = await import("../js/data/account.js");
const look = await import("../js/data/avatarLook.js");
const { lookSignature } = await import("../js/data/avatarPortrait.js");
const { AVATAR_ACTIONS, findActionClip } = await import("../js/ui/avatar3d.js");
const { lookPanelHtml } = await import("../js/ui/avatarLookView.js");

const fresh = () => {
  globalThis.localStorage = createMemoryStorage();
};

test("bodyBoneScales: standard is the identity, broad widens, slim narrows, all factors stay modest", () => {
  const std = look.bodyBoneScales("standard");
  assert.equal(std.height, 1);
  for (const s of Object.values(std.bones)) assert.deepEqual(s, [1, 1, 1]);
  const broad = look.bodyBoneScales("broad");
  const slim = look.bodyBoneScales("slim");
  assert.ok(broad.height > 1 && broad.height <= 1.05, `broad height ${broad.height}`);
  assert.ok(slim.height < 1 && slim.height >= 0.95, `slim height ${slim.height}`);
  assert.ok(broad.bones["Shoulder.L"][0] > 1 && broad.bones["Shoulder.L"][0] <= 1.2);
  assert.ok(slim.bones["Shoulder.L"][0] < 1 && slim.bones["Shoulder.L"][0] >= 0.85);
  assert.ok(broad.bones["Torso"][0] > 1 && broad.bones["Torso"][2] > 1, "broad torso is wider, not longer");
  assert.equal(broad.bones["Torso"][1], 1, "spine length never changes");
  assert.equal(broad.bones["UpperArm.L"][1], 1, "limb length never changes");
  assert.equal(broad.bones["UpperLeg.R"][1], 1, "leg length never changes");
  // Every factor in every preset stays inside the safe band, and every bone group is covered.
  for (const preset of look.BODY_PRESETS) {
    const r = look.bodyBoneScales(preset.id);
    assert.ok(r.height >= 0.95 && r.height <= 1.05, `${preset.id} height`);
    for (const [name, s] of Object.entries(r.bones)) {
      for (const f of s) assert.ok(f >= 0.85 && f <= 1.2, `${preset.id} ${name} ${f}`);
    }
    assert.deepEqual(Object.keys(r.bones).sort(), [...look.BODY_BONE_GROUPS.shoulders, ...look.BODY_BONE_GROUPS.spine, ...look.BODY_BONE_GROUPS.arms, ...look.BODY_BONE_GROUPS.legs, "Head"].sort());
  }
  assert.deepEqual(look.bodyBoneScales("nope"), std, "unknown preset falls back to standard");
  assert.deepEqual(look.bodyBoneScales(undefined), std);
});

test("sanitizeLook whitelists body like every other field; the panel offers exactly 3 presets", () => {
  assert.equal(look.sanitizeLook({ body: "broad" }).body, "broad");
  assert.equal(look.sanitizeLook({ body: "<script>" }).body, "standard");
  assert.equal(look.sanitizeLook({ body: "__proto__" }).body, "standard");
  assert.equal(look.DEFAULT_LOOK.body, "standard");
  assert.equal(look.BODY_PRESETS.length, 3, "presets only, no slider farm");
  for (const p of look.BODY_PRESETS) {
    assert.match(p.zh, /\S/);
    assert.match(p.en, /\S/);
  }
});

test("a body change retakes the 3D portrait: the look signature includes body", () => {
  const base = lookSignature(look.DEFAULT_LOOK);
  assert.notEqual(lookSignature({ ...look.DEFAULT_LOOK, body: "broad" }), base, "broad");
  assert.notEqual(lookSignature({ ...look.DEFAULT_LOOK, body: "slim" }), base, "slim");
  assert.equal(lookSignature({ ...look.DEFAULT_LOOK, body: "nope" }), base, "junk body is sanitized away");
});

test("appearance-only lock: changing build/height never touches any other account field", () => {
  fresh();
  const a = acc.createAccount("lock-test");
  a.gold = 321;
  a.rankedWins = 7;
  a.playerIds = ["p1", "p2"];
  a.cardMods = { p1: { merges: 2, skills: ["s1"] } };
  acc.saveAccount(a);
  const snap = (x) => {
    const { avatar: _avatar, ...rest } = x;
    return rest;
  };
  const before = snap(acc.getAccount(a.id));
  for (const body of ["broad", "slim", "standard"]) {
    const res = look.saveLook(acc.getAccount(a.id), { body });
    assert.equal(res.saved, true);
    assert.equal(res.body, body);
    assert.deepEqual(snap(acc.getAccount(a.id)), before, `nothing but avatar changes for ${body}`);
    assert.deepEqual(Object.keys(acc.getAccount(a.id).avatar).sort(), ["body", "cut", "figure", "hair", "outfit", "skin", "style"], "avatar holds exactly the seven whitelisted fields");
  }
  const after = acc.getAccount(a.id);
  assert.equal(after.gold, 321, "gold untouched");
  assert.equal(after.rankedWins, 7, "wins untouched");
  assert.deepEqual(after.playerIds, ["p1", "p2"], "collection untouched");
  assert.deepEqual(after.cardMods, { p1: { merges: 2, skills: ["s1"] } }, "card mods untouched");
  assert.equal(after.tacticId, "balanced", "tactic untouched");
});

test("findActionClip matches the model's own clips exactly, never a look-alike", () => {
  const clips = [
    "HumanArmature|Man_Clapping",
    "HumanArmature|Man_Death",
    "HumanArmature|Man_Idle",
    "HumanArmature|Man_Jump",
    "HumanArmature|Man_Punch",
    "HumanArmature|Man_Run",
    "HumanArmature|Man_RunningJump",
    "HumanArmature|Man_Sitting",
    "HumanArmature|Man_Standing",
    "HumanArmature|Man_SwordSlash",
    "HumanArmature|Man_Walk",
  ].map((name) => ({ name }));
  assert.equal(findActionClip(clips, "clap")?.name, "HumanArmature|Man_Clapping");
  assert.equal(findActionClip(clips, "jump")?.name, "HumanArmature|Man_Jump");
  assert.equal(findActionClip(clips, "run")?.name, "HumanArmature|Man_Run", "Run must not pick up RunningJump");
  assert.equal(findActionClip(clips, "sit")?.name, "HumanArmature|Man_Sitting");
  assert.equal(findActionClip(clips, "dance"), null, "no such action");
  assert.equal(findActionClip([], "clap"), null);
  assert.equal(findActionClip(clips, "idle"), null, "idle is not a preview action");
  assert.deepEqual(AVATAR_ACTIONS.map((a) => a.id), ["celebrate", "clap", "jump", "run", "sit"]);
  assert.equal(findActionClip(clips, "celebrate")?.name, "HumanArmature|Man_Clapping", "the Man model has no celebrate clip: it cheers instead");
  for (const a of AVATAR_ACTIONS) {
    assert.ok(findActionClip(clips, a.id), `${a.id} has a clip in the model`);
    assert.match(a.zh, /\S/);
    assert.match(a.en, /\S/);
  }
});

test("the panel shows the build group and the action row; actions start disabled (WebGL-missing fallback)", () => {
  const html = lookPanelHtml({ ...look.DEFAULT_LOOK, body: "broad" }, "Zoro", "en");
  const checked = html.match(/name="mw-look-body" value="[a-z]+" checked/g) || [];
  assert.equal(checked.length, 1, "exactly one build checked");
  assert.match(html, /value="broad" checked/);
  assert.match(html, /Build/);
  for (const action of ["avatar-action-celebrate", "avatar-action-clap", "avatar-action-jump", "avatar-action-run", "avatar-action-sit", "avatar-idle"]) {
    assert.match(html, new RegExp(`data-mw-action="${action}" disabled`), `${action} starts disabled`);
  }
  assert.match(html, /Preview actions/);
  assert.doesNotMatch(html, /[\u4e00-\u9fff]/, "English panel has no Chinese");
  const zh = lookPanelHtml(look.DEFAULT_LOOK, "Zoro", "zh");
  assert.match(zh, /体型/);
  assert.match(zh, /动作预览/);
  assert.match(zh, /鼓掌/);
  assert.match(zh, /坐下/);
});

test("the avatar bundle exports the loop constants playAction passes to setLoop", async () => {
  // Regression: three-entry.mjs once omitted LoopRepeat/LoopOnce, so the
  // tree-shaken bundle exported them as undefined and one-shot previews
  // (clap/jump/sit) looped forever instead of returning to idle.
  const T = await import("../js/vendor/three-avatar.min.js");
  assert.equal(T.LoopRepeat, 2201, "LoopRepeat is a real three.js constant, not undefined");
  assert.equal(T.LoopOnce, 2200, "LoopOnce is a real three.js constant, not undefined");
  const { readFileSync } = await import("node:fs");
  const entry = readFileSync(new URL("../scripts/vendor/three-entry.mjs", import.meta.url), "utf8");
  assert.match(entry, /LoopRepeat/, "three-entry.mjs lists LoopRepeat so the next rebuild keeps it");
  assert.match(entry, /LoopOnce/, "three-entry.mjs lists LoopOnce so the next rebuild keeps it");
});
