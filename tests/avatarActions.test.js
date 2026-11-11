import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { AVATAR_ACTIONS, findActionClip, findExitClip, findClipBySuffix, holdsPose } = await import("../js/ui/avatarActions.js");

const STYLIZED = ["Idle", "Stylized_Celebrate", "Stylized_Clap", "Stylized_Jump", "Stylized_Run", "Stylized_Sit", "Stylized_Stand"];
const MAN = ["HumanArmature|Man_Clapping", "HumanArmature|Man_Jump", "HumanArmature|Man_Run", "HumanArmature|Man_RunningJump", "HumanArmature|Man_Sitting"];

test("every action resolves to its own Stylized clip, and the stand clip releases Sit", () => {
  for (const a of AVATAR_ACTIONS) assert.ok(findActionClip(STYLIZED, a.id), `${a.id} has a Stylized clip`);
  assert.equal(findActionClip(STYLIZED, "run"), "Stylized_Run");
  assert.equal(findActionClip(STYLIZED, "celebrate"), "Stylized_Celebrate");
  assert.equal(findActionClip(STYLIZED, "clap"), "Stylized_Clap", "celebrate and clap are two different clips on Stylized");
  assert.equal(findExitClip(STYLIZED, "sit"), "Stylized_Stand");
  assert.equal(findExitClip(STYLIZED, "jump"), null, "only held poses have an exit clip");
});

test("the Stylized clip wins over a Man clip, and Man_Run never matches Man_RunningJump", () => {
  assert.equal(findClipBySuffix([...MAN, "Stylized_Run"], ["Stylized_Run", "Man_Run"]), "Stylized_Run");
  assert.equal(findActionClip(MAN, "run"), "HumanArmature|Man_Run");
  assert.equal(findClipBySuffix(["Man_RunningJump"], ["Man_Run"]), null);
});

test("sit only holds when the model brings a seat; without one it behaves as a one-shot", () => {
  const sit = AVATAR_ACTIONS.find((a) => a.id === "sit");
  assert.equal(holdsPose(sit, { name: "Prop_Stool" }), true);
  assert.equal(holdsPose(sit, null), false);
  assert.equal(holdsPose(AVATAR_ACTIONS.find((a) => a.id === "jump"), { name: "Prop_Stool" }), false);
});

test("actions that need both hands put the ball away; the ones that carry it keep it", () => {
  const ball = Object.fromEntries(AVATAR_ACTIONS.map((a) => [a.id, a.ball]));
  assert.deepEqual(ball, { celebrate: false, clap: false, jump: true, run: true, sit: true });
});

test("actions that raise the arms or leave the ground widen the camera; the rest keep the idle framing", () => {
  const frame = Object.fromEntries(AVATAR_ACTIONS.map((a) => [a.id, a.frame]));
  assert.ok(frame.jump > frame.celebrate && frame.celebrate > 1);
  assert.equal(frame.run, 1);
  assert.equal(frame.sit, 1);
});

// ---- the shipped GLBs: the real skeleton / clip contract, parsed from the files ----
const glb = (file) => {
  const b = readFileSync(new URL(`../assets/avatar3d/${file}`, import.meta.url));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
};
const names = (j) => (j.animations || []).map((a) => a.name).sort();
const joints = (j) => j.skins[0].joints.map((i) => j.nodes[i].name);

test("both Stylized outfits ship the SAME clips on the SAME skeleton (a new outfit needs no animation work)", () => {
  const jersey = glb("stylized_jersey.glb");
  const street = glb("stylized_street.glb");
  assert.deepEqual(names(jersey), [...STYLIZED].sort());
  assert.deepEqual(names(street), names(jersey));
  assert.deepEqual(joints(street), joints(jersey));
});

test("every Stylized clip addresses only bones that exist in the skeleton", () => {
  for (const file of ["stylized_jersey.glb", "stylized_street.glb"]) {
    const j = glb(file);
    const bones = new Set(joints(j));
    for (const a of j.animations) {
      for (const ch of a.channels) assert.ok(bones.has(j.nodes[ch.target.node].name), `${file} ${a.name} targets a real bone`);
    }
  }
});

test("each Stylized GLB carries the ball parts and the stool as Prop_ nodes the viewer can hide", () => {
  for (const file of ["stylized_jersey.glb", "stylized_street.glb"]) {
    const props = glb(file).nodes.map((n) => n.name).filter((n) => /^Prop_/.test(n || "")).sort();
    assert.deepEqual(props, ["Prop_Ball", "Prop_Seam", "Prop_Stool"]);
  }
});

test("Hips is the only bone any Stylized clip translates (the rest keep their rest offsets)", () => {
  const j = glb("stylized_street.glb");
  for (const a of j.animations.filter((x) => x.name !== "Idle")) {
    const moved = new Set(a.channels.filter((c) => c.target.path === "translation").map((c) => j.nodes[c.target.node].name));
    const varying = [...moved].filter((name) => {
      const ch = a.channels.find((c) => c.target.path === "translation" && j.nodes[c.target.node].name === name);
      const out = j.accessors[a.samplers[ch.sampler].output];
      return out.min && out.max && out.min.some((v, i) => Math.abs(out.max[i] - v) > 1e-4);
    });
    assert.deepEqual(varying.filter((n) => n !== "Hips"), [], `${a.name}: only Hips moves`);
  }
});
