import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BODY_BONE_GROUPS, OUTFITS, OUTFIT_CUTS, avatarModelFile, lookColors, sanitizeLook, trimInk } from "../js/data/avatarLook.js";
import { avatarModelUrl, boneKey } from "../js/ui/avatar3d.js";

const glbJson = (file) => {
  const b = readFileSync(new URL(`../assets/avatar3d/${file}`, import.meta.url));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
};

test("cut is whitelisted and defaults to jersey", () => {
  assert.equal(sanitizeLook({}).cut, "jersey");
  assert.equal(sanitizeLook({ cut: "street" }).cut, "street");
  assert.equal(sanitizeLook({ cut: "../../evil" }).cut, "jersey");
  assert.equal(sanitizeLook({ cut: "__proto__" }).cut, "jersey");
});

test("every Stylized cut has a real GLB; Bobblehead has its own toy model", () => {
  for (const c of OUTFIT_CUTS) {
    const file = avatarModelFile({ figure: "stylized", cut: c.id });
    assert.equal(file, `stylized_${c.id}.glb`);
    assert.ok(existsSync(new URL(`../assets/avatar3d/${file}`, import.meta.url)), file);
  }
  assert.equal(avatarModelFile({ figure: "bobblehead", cut: "street" }), "bobblehead.glb");
  assert.ok(existsSync(new URL("../assets/avatar3d/bobblehead.glb", import.meta.url)), "bobblehead.glb");
  assert.match(avatarModelUrl({ cut: "street" }), /assets\/avatar3d\/stylized_street\.glb$/);
});

test("Trim ink reads on every outfit shirt (>= 3:1) and is handed to the renderer", () => {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  for (const o of OUTFITS) {
    const [a, b] = [lum(o.shirt), lum(trimInk(o.shirt))].sort((x, y) => y - x);
    assert.ok((a + 0.05) / (b + 0.05) >= 3, `${o.id} trim unreadable`);
    assert.equal(lookColors({ outfit: o.id }).Trim, trimInk(o.shirt));
  }
});

test("both GLBs carry every body-preset bone, an unscaled Prop bone for the ball, and no mesh steals a bone name", () => {
  const need = Object.values(BODY_BONE_GROUPS).flat().concat("Head");
  for (const c of OUTFIT_CUTS) {
    const json = glbJson(`stylized_${c.id}.glb`);
    const joints = new Set(json.skins[0].joints.map((j) => json.nodes[j].name));
    for (const n of need.concat("Prop")) assert.ok(joints.has(n), `${c.id}: bone ${n}`);
    const meshNodes = new Set(json.nodes.filter((n) => n.mesh !== undefined).map((n) => boneKey(n.name)));
    for (const n of need) assert.ok(!meshNodes.has(boneKey(n)), `${c.id}: a mesh is named like bone ${n}`);
    for (const m of ["Trim", "Shirt", "Pants", "Skin", "Hair"]) assert.ok(json.materials.some((x) => x.name === m), `${c.id}: material ${m}`);
    assert.ok(json.animations.some((a) => /idle/i.test(a.name)), `${c.id}: idle clip`);
  }
});

test("the two cuts really are different garments, not a recolour", () => {
  const names = (f) => new Set(glbJson(f).nodes.map((n) => n.name));
  const jersey = names("stylized_jersey.glb");
  const street = names("stylized_street.glb");
  assert.ok(jersey.has("Outfit_Jersey") && !street.has("Outfit_Jersey"));
  assert.ok(street.has("Outfit_Tee") && !jersey.has("Outfit_Tee"));
  assert.ok([...street].some((n) => n.startsWith("Outfit_Pants")) && ![...jersey].some((n) => n.startsWith("Outfit_Pants")));
});
