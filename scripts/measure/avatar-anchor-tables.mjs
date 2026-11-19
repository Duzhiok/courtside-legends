// Measure a presentation's body anchors straight from its PNG layers (no browser): the tables avatar2dAnchors.js needs, printed as JS rows.
// Usage: node scripts/measure/avatar-anchor-tables.mjs [assets/avatar2d/female]
//   armAnchors  [y, leftOuter, leftInner, rightInner, rightOuter]   rows ARM_FROM..ARM_TO: the body runs (alpha > 40) beside the torso run(s)
//   legAnchors  [y, leftLegL, leftLegR, rightLegL, rightLegR]       rows LEG_FROM..LEG_TO: the two widest runs
// tests/avatarFemaleArt.test.js checks the tables in avatar2dAnchors.js against the same pixels, so a changed art set shows up there first.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodePng } from "../avatar/avatar2dValidate.mjs";

const dir = resolve(process.argv[2] || "assets/avatar2d/female");
const body = decodePng(readFileSync(join(dir, "base/body.png")));
const W = body.width;
const ARM_FROM = 480, ARM_TO = 840, LEG_FROM = 800, LEG_TO = 1440, STEP = 20, MIN_RUN = 6, AXIS_BAND = [495, 530];

const runs = (y) => {
  const out = []; let start = -1;
  for (let x = 0; x <= W; x += 1) {
    const on = x < W && body.rgba[(y * W + x) * 4 + 3] > 40;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { if (x - start >= MIN_RUN) out.push([start, x - 1]); start = -1; }
  }
  return out;
};

const arms = []; const legs = [];
for (let y = ARM_FROM; y <= LEG_TO; y += STEP) {   // (the crotch gap is closed by the shorts above row 800: one run, no legs to tell apart)
  const r = runs(y);
  if (y <= ARM_TO) {
    const torso = r.filter(([a, b]) => a <= AXIS_BAND[1] && b >= AXIS_BAND[0]);
    const left = r.filter(([, b]) => torso.length && b < Math.min(...torso.map((t) => t[0])));
    const right = r.filter(([a]) => torso.length && a > Math.max(...torso.map((t) => t[1])));
    if (left.length && right.length) arms.push([y, Math.min(...left.map((t) => t[0])), Math.max(...left.map((t) => t[1])), Math.min(...right.map((t) => t[0])), Math.max(...right.map((t) => t[1]))]);
    else console.error(`row ${y}: no arm pair`);
  }
  if (y >= LEG_FROM) {
    const two = [...r].sort((p, q) => (q[1] - q[0]) - (p[1] - p[0])).slice(0, 2).sort((p, q) => p[0] - q[0]);
    if (two.length === 2) legs.push([y, two[0][0], two[0][1], two[1][0], two[1][1]]);
  }
}
const fmt = (rows) => rows.map((r) => `[${r.join(", ")}]`).reduce((acc, cell, i) => acc + (i % 5 === 0 ? "\n  " : " ") + cell + ",", "");
console.log(`// ${dir}\narmAnchors (rows ${arms[0][0]}-${arms.at(-1)[0]}):${fmt(arms)}\n\nlegAnchors (rows ${legs[0][0]}-${legs.at(-1)[0]}):${fmt(legs)}`);
