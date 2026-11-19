import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ART, CANVAS, requiredFilesFor, resolveLayers } from "../js/ui/avatar2d/avatar2dLayers.js";
import { ANCHORS, anchorsFor } from "../js/ui/avatar2d/avatar2dAnchors.js";
import { ARM_ANCHORS, ARM_ROWS, REGIONS, anchorsAt, rowOps, window4 } from "../js/ui/avatar2d/avatar2dShape.js";
import { decodePng, validateSet } from "../scripts/avatar/avatar2dValidate.mjs";
import { PRESENTATIONS } from "../js/data/avatarLook.js";

const FEMALE_DIR = fileURLToPath(new URL("../assets/avatar2d/female/", import.meta.url));

function readFolder(root) {
  const files = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name !== ".DS_Store") files.set(relative(root, full).split("\\").join("/"), readFileSync(full));
    }
  };
  walk(root);
  return files;
}
const femaleFiles = readFolder(FEMALE_DIR);

// ---- the art set ------------------------------------------------------------------------------------------------------
test("the female art folder holds exactly the files the spec lists for the female presentation (same layout, under female/)", () => {
  const wanted = requiredFilesFor("female").map((f) => f.replace(/^female\//, "")).sort();
  assert.ok(wanted.length >= 10);
  assert.deepEqual([...femaleFiles.keys()].sort(), wanted);
  assert.ok(requiredFilesFor("female").every((f) => f.startsWith("female/")), "the path convention the renderer will use once it is switched on");
});

test("the female set passes the art validator: size, RGBA, border and margin, greyscale tint range, no enclosed holes (short and shaved)", () => {
  // validateSet reads a root-layout set, which is exactly how this folder is laid out
  const findings = validateSet(femaleFiles);
  const fails = findings.filter((f) => f.level === "FAIL");
  assert.deepEqual(fails, [], fails.map((f) => `${f.id} ${f.msg}`).join("\n"));
  assert.equal(findings.filter((f) => f.level === "WARN").length, 0);
  assert.ok(findings.some((f) => f.id === "V1" && f.level === "PASS"));
  assert.equal(findings.filter((f) => f.id === "V6" && f.level === "PASS").length, 2);
});

test("the female option stays OFF until the art is visually approved (edit this test together with the switch)", () => {
  assert.ok(!ART.presentations.includes("female"));
  assert.equal(PRESENTATIONS.find((p) => p.id === "female").art, false);
  const r = resolveLayers({ presentation: "female" });
  assert.equal(r.presentation, "male");
  assert.equal(r.presentationFellBack, true, "a saved female look still draws the male art and says so");
});

// ---- the measured numbers ----------------------------------------------------------------------------------------------
for (const [name, A] of Object.entries(ANCHORS)) {
  test(`${name}: the measured tables are well formed (ordered rows, ordered edges, windows that fade in and out)`, () => {
    for (const [k, w] of Object.entries(A.regions)) assert.ok(w[0] < w[1] && w[1] <= w[2] && w[2] < w[3], `${k} window ${w}`);
    const rows = (t) => t.map((r) => r[0]);
    for (const t of [A.armAnchors, A.legAnchors]) assert.deepEqual(rows(t), [...rows(t)].sort((a, b) => a - b));
    for (const [, lo, li, ri, ro] of A.armAnchors) assert.ok(lo < li && li < A.axisX && A.axisX < ri && ri < ro && ro < CANVAS.width, `arm row ${lo},${li},${ri},${ro}`);
    for (const [, a, b, c, d] of A.legAnchors) assert.ok(a < b && b < c && c < d && d < CANVAS.width);
    assert.ok(A.armRows[0] < A.armRows[1]);
    assert.equal(window4(A.armRows[0], A.regions.arms), 0, "the arm thickness starts at zero where the arm segments start: no step in the silhouette");
    assert.ok(A.portraitCrop.x >= 0 && A.portraitCrop.x + A.portraitCrop.size <= CANVAS.width);
  });
}

test("anchorsFor: the female set for female, the male set for male and for anything unknown", () => {
  assert.equal(anchorsFor("female"), ANCHORS.female);
  assert.equal(anchorsFor("male"), ANCHORS.male);
  assert.equal(anchorsFor("robot"), ANCHORS.male);
  assert.equal(anchorsFor(undefined), ANCHORS.male);
});

test("the female windows follow the female body: the waist ends where the thighs begin, the legs end above the socks, the hands are not thickened", () => {
  const R = ANCHORS.female.regions;
  assert.equal(window4(860, R.waist), 0);          // thighs (shorts end ~856)
  assert.equal(window4(1250, R.legs), 0);          // socks start ~1238
  assert.equal(window4(1400, R.legs), 0);          // shoes
  assert.equal(window4(820, R.arms), 0);           // hands (780-850) are carried by the arm, not thickened
  assert.ok(window4(600, R.arms) === 1 && window4(1000, R.legs) === 1 && window4(740, R.waist) === 1);
  // the male windows sit on the male body: the same rows would thicken the female thigh and knee
  assert.ok(window4(1000, REGIONS.waist) === 0 && window4(1000, ANCHORS.female.regions.waist) === 0);
  assert.ok(window4(900, REGIONS.waist) > 0 && window4(900, ANCHORS.female.regions.waist) === 0, "male waist window covers rows the female legs are on");
});

// ---- the numbers against the pixels -------------------------------------------------------------------------------------
test("the female arm and leg anchors match the female body layer's own pixels (alpha > 40, +-2 px): the tables cannot drift from the art", () => {
  const body = decodePng(femaleFiles.get("base/body.png"));
  const W = body.width;
  const on = (x, y) => body.rgba[(y * W + x) * 4 + 3] > 40;
  for (const [y, lo, li, ri, ro] of ANCHORS.female.armAnchors) {
    assert.ok(on(lo + 1, y) && !on(lo - 3, y), `row ${y}: left arm outer edge ${lo}`);
    assert.ok(on(ro - 1, y) && !on(ro + 3, y), `row ${y}: right arm outer edge ${ro}`);
    assert.ok(on(li - 1, y), `row ${y}: left arm inner edge ${li}`);
    assert.ok(on(ri + 1, y), `row ${y}: right arm inner edge ${ri}`);
  }
  for (const [y, a, b, c, d] of ANCHORS.female.legAnchors) {
    if (y > 1440) continue;
    assert.ok(on(a + 1, y) && !on(a - 3, y), `row ${y}: left leg outer ${a}`);
    assert.ok(on(d - 1, y) && !on(d + 3, y), `row ${y}: right leg outer ${d}`);
    assert.ok(on(b - 1, y) && on(c + 1, y), `row ${y}: inner leg edges ${b}, ${c}`);
    if (y >= 860) assert.ok(!on(Math.round((b + c) / 2), y), `row ${y}: the gap between the legs is open`);
  }
});

// ---- the shape deformation with the female numbers ----------------------------------------------------------------------
const EXTREMES = [
  { shoulders: 0.24, waist: 0.14, arms: 0.3, legs: 0.3 }, { shoulders: -0.24, waist: -0.14, arms: -0.3, legs: -0.3 },
  { shoulders: 0.24, waist: -0.14, arms: 0.3, legs: -0.3 }, { shoulders: -0.24, waist: 0.14, arms: -0.3, legs: 0.3 },
];

test("female: at every slider extreme each hand lies inside its own arm segment (the cut never goes through a hand)", () => {
  const A = ANCHORS.female;
  for (const shape of EXTREMES) {
    for (let y = A.armRows[0] + 1; y <= A.armRows[1]; y += 2) {
      const ops = rowOps(y, shape, A);
      if (ops.length !== 3) continue;
      const [oL, iL, iR, oR] = anchorsAt(A.armAnchors, y);
      const [, left, right] = ops;
      assert.ok(left.sx <= oL && left.sx + left.sw >= iL, `row ${y}: left arm [${left.sx}, ${left.sx + left.sw}] must cover ${oL}..${iL}`);
      assert.ok(right.sx <= iR && right.sx + right.sw >= oR, `row ${y}: right arm [${right.sx}, ${right.sx + right.sw}] must cover ${iR}..${oR}`);
    }
  }
});

test("female: the waist moves the torso and shorts but not the hands; legs thicken about their own centres", () => {
  const A = ANCHORS.female;
  const y = 800;                                   // shorts rows, hands hanging beside them
  const wide = rowOps(y, { waist: 0.14 }, A);
  const narrow = rowOps(y, { waist: -0.14 }, A);
  assert.equal(wide.length, 3);
  assert.deepEqual(wide.slice(1), narrow.slice(1), "both hands are drawn exactly the same whatever the waist does");
  assert.ok(wide[0].dw > narrow[0].dw, "the shorts are wider with a wider waist");
  const legs = rowOps(1000, { legs: 0.3 }, A);
  assert.equal(legs.length, 2);
  const [a, b, c, d] = anchorsAt(A.legAnchors, 1000);
  assert.ok(Math.abs((legs[0].dx + (legs[0].dw * ((a + b) / 2)) / legs[0].sw) - (a + b) / 2) < 0.01, "left leg grows about its own centre line");
  assert.ok(c < d);
});

test("the male defaults are untouched: no anchors argument is the same as the male set, and the exported male tables are the male set", () => {
  const shape = { shoulders: 0.2, waist: -0.1, arms: 0.3, legs: 0.2 };
  for (const y of [300, 560, 700, 820, 880, 960, 1100, 1350]) assert.deepEqual(rowOps(y, shape), rowOps(y, shape, ANCHORS.male));
  assert.equal(ARM_ANCHORS, ANCHORS.male.armAnchors);
  assert.equal(ARM_ROWS, ANCHORS.male.armRows);
  assert.equal(REGIONS, ANCHORS.male.regions);
  assert.equal(ANCHORS.male.axisX, 510);
});
