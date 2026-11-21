/**
 * Everything at the edge of the floor that is not a stand: team benches with their players and coaches, the scorer's table with
 * its officials, courtside LED boards, the shot clocks, the hung scoreboard, the light rigs and the arena walls.
 * Layout comes from arenaLayout; this file only turns it into instanced meshes (a handful of draw calls in total).
 */
import { COURTSIDE, FLOOR_HALF_W, FLOOR_HALF_L, SECTIONS, STEP_RUN, rowGeometry } from "./arenaLayout.js";
import { instancedBoxes } from "./arenaInstances.js";
import { canvasTexture, drawLedStrip, drawScoreboard, scoreboardState, stateKey } from "./arenaScreens.js";

const SUIT = 0x1b1f24;
const OFFICIAL_SHIRTS = [0x2c3036, 0xe6e6e6];
const RIM_Z = 14.33 - 1.72; // the hoops court3d builds
const SHOT_CLOCK_Y = 4.55;
const SCOREBOARD_Y = 6.4;
/** The hung scoreboard's box (metres), so the broadcast labels can stay clear of where it is drawn on screen. */
export const SCOREBOARD_BOX = Object.freeze({ y: SCOREBOARD_Y, w: 4.6, h: 2.1, d: 2.1 });

/** Bench players, head coach + assistants, table officials: one pair of instanced meshes. */
export function courtsidePeople(preset, colors) {
  const skins = preset.crowd.skin;
  const skin = (i) => skins[i % skins.length];
  const people = [];
  COURTSIDE.benches.forEach((b, bi) => {
    const jersey = colors[b.side];
    for (let i = 0; i < 10; i++) {
      people.push({ x: COURTSIDE.benchX, y: 0, z: b.z - b.halfLen + 0.35 + (i * (b.halfLen * 2 - 0.7)) / 9, body: jersey, skin: skin(i + bi) });
    }
    // Head coach stands at the front of his bench; two assistants sit at the end nearest the table.
    people.push({ x: COURTSIDE.benchX + 1.5, y: 0, z: b.z, body: SUIT, skin: skin(bi + 1), bodyH: 1.4, standing: true });
    const towardTable = Math.sign(-b.z);
    for (let k = 0; k < 2; k++) people.push({ x: COURTSIDE.benchX - 0.7, y: 0, z: b.z + towardTable * (b.halfLen - 0.4 - k * 0.6), body: SUIT, skin: skin(bi + k + 2) });
  });
  for (let i = 0; i < 5; i++) {
    people.push({ x: COURTSIDE.tableX - 0.95, y: 0, z: -2.2 + i * 1.1, body: OFFICIAL_SHIRTS[i % 2], skin: skin(i + 1) });
  }
  return people;
}

/** Benches, table, cables, trusses, walls: plain boxes with per-instance colours, one draw call. */
export function furnitureBoxes(T, preset) {
  const sh = preset.shell;
  const items = [];
  for (const b of COURTSIDE.benches) {
    items.push({ x: COURTSIDE.benchX, y: 0.22, z: b.z, sx: 0.5, sy: 0.44, sz: b.halfLen * 2, color: sh.seatAlt });
    items.push({ x: COURTSIDE.benchX - 0.3, y: 0.7, z: b.z, sx: 0.08, sy: 0.9, sz: b.halfLen * 2, color: sh.seat });
  }
  items.push({ x: COURTSIDE.tableX, y: 0.375, z: 0, sx: 0.7, sy: 0.75, sz: COURTSIDE.tableHalfLen * 2, color: sh.wall });
  items.push({ x: COURTSIDE.tableX + 0.36, y: 0.36, z: 0, sx: 0.04, sy: 0.7, sz: COURTSIDE.tableHalfLen * 2 - 0.1, color: sh.led });
  for (const sx of [-2.0, 2.0]) for (const sz of [-0.9, 0.9]) items.push({ x: sx, y: 11.0, z: sz, sx: 0.05, sy: 9.0, sz: 0.05, color: sh.rail }); // scoreboard cables up to the truss
  for (const s of [-1, 1]) {
    items.push({ x: -5 * s, y: 15.5, z: 0, sx: 0.3, sy: 0.3, sz: 30, color: sh.rail }); // light trusses along the court
    items.push({ x: 0, y: SHOT_CLOCK_Y, z: s * (RIM_Z + 1.0), sx: 0.9, sy: 0.5, sz: 0.25, color: 0x14181b }); // shot clock housings, above each stanchion
  }
  items.push({ x: -4, y: -0.06, z: 0, sx: 64, sy: 0.1, sz: 62, color: sh.wall }); // concourse floor under and around everything
  items.push({ x: -30, y: 8, z: 0, sx: 0.5, sy: 16, sz: 70, color: sh.wall }); // far wall
  for (const s of [-1, 1]) items.push({ x: -6, y: 8, z: s * 29, sx: 62, sy: 16, sz: 0.5, color: sh.wall }); // end walls
  return instancedBoxes(T, items, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
}

/** Seats of the stands + the aisle railings: one draw call (colours alternate by row). */
export function standBoxes(T, preset, steps) {
  const sh = preset.shell;
  const items = steps.map((st) => ({ ...st, color: st.row % 2 ? sh.seatAlt : sh.seat }));
  for (const sec of SECTIONS) { // a railing along the walkway between the lower and upper bowl
    if (sec.rows <= 7) continue;
    const g = rowGeometry(sec, 6);
    const edge = sec.dir * (g.d + STEP_RUN);
    const mid = (sec.from + sec.to) / 2;
    const len = sec.to - sec.from;
    items.push(sec.axis === "x"
      ? { x: edge, y: g.top + 0.55, z: mid, sx: 0.05, sy: 0.9, sz: len, color: sh.rail }
      : { x: mid, y: g.top + 0.55, z: edge, sx: len, sy: 0.9, sz: 0.05, color: sh.rail });
  }
  return instancedBoxes(T, items, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
}

/** Glowing parts (light panels, shot-clock digits) on an unlit material, plus the sponsor LED boards. */
export function glowBoxes(T, doc, preset) {
  const group = new T.Group();
  const lights = [];
  for (const x of [-5, 5]) for (let i = 0; i < 6; i++) lights.push({ x, y: 15.2, z: -12.5 + i * 5, sx: 1.4, sy: 0.12, sz: 1.4, color: 0xfff6d8 });
  const digits = [-1, 1].map((s) => ({ x: 0, y: SHOT_CLOCK_Y, z: s * (RIM_Z + 1.0) - s * 0.14, sx: 0.55, sy: 0.28, sz: 0.02, color: 0xff3b2f }));
  group.add(instancedBoxes(T, [...lights, ...digits], new T.MeshBasicMaterial({ color: 0xffffff })));
  const strip = canvasTexture(T, doc, 1024, 64, (ctx, w, h) => drawLedStrip(ctx, preset, w, h));
  const boards = [-1, 1].map((s) => ({ x: 0, y: 0.8, z: s * (FLOOR_HALF_L + 0.35), sx: FLOOR_HALF_W * 2, sy: 0.8, sz: 0.12 }));
  group.add(instancedBoxes(T, boards, new T.MeshBasicMaterial(strip ? { map: strip.tex } : { color: preset.shell.led })));
  return group;
}

/** The hung centre scoreboard. `set(snap)` redraws only when what it shows changed. */
export function hungScoreboard(T, doc, preset) {
  const screen = canvasTexture(T, doc, 512, 256, (ctx, w, h) => drawScoreboard(ctx, preset, null, w, h));
  const face = new T.MeshBasicMaterial(screen ? { map: screen.tex } : { color: 0x06080a });
  const casing = new T.MeshBasicMaterial({ color: 0x0a0c0f });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The four sides show the screen; top and bottom are plain casing (a stretched
  // screen on the top face read as a blurry streak from the broadcast camera).
  const mesh = new T.Mesh(new T.BoxGeometry(SCOREBOARD_BOX.w, SCOREBOARD_BOX.h, SCOREBOARD_BOX.d), [face, face, casing, casing, face, face]);
  mesh.position.set(0, SCOREBOARD_Y, 0); // low enough to sit inside the broadcast frame, high enough to stay above every sightline to the floor
  let shown = "";
  return {
    mesh,
    set(snap) {
      const state = scoreboardState(snap);
      const key = stateKey(state);
      if (!screen || !state || key === shown) return;
      shown = key;
      try {
        drawScoreboard(screen.ctx, preset, state, 512, 256);
        screen.tex.needsUpdate = true;
      } catch {
        /* a failed redraw leaves the previous frame on the board */
      }
    },
  };
}
