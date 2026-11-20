/**
 * Pure arena geometry: where the stand steps and seats are. No THREE, no DOM, so it is unit-testable and the "no spectator on the
 * court" rule is a plain assertion.
 *
 * World frame = court3d's: x across the court (sidelines at +/-7.62), z along it (baselines at +/-14.33), y up. The floor plane
 * (playing area + apron) is +/-8.32 x +/-15.08. The broadcast camera sits on the +x side, high, looking toward -x, so:
 *   far   (x < 0)  full sideline stand, behind the benches and the scorer's table (these face the camera)
 *   ends  (z = +/-) full end stands, behind the baselines
 *   near  (x > 0)  a LOW stand, kept under the camera's line of sight so it never hides the court
 */

export const FLOOR_HALF_W = 8.32;
export const FLOOR_HALF_L = 15.08;
export const STEP_RUN = 0.9; // depth of one row
export const STEP_RISE = 0.45; // height gained per row
export const SEAT_PITCH = 0.55; // seat spacing along a row
export const FIRST_ROW_Y = 0.4;
const AISLE_AFTER_ROW = 6; // one wide walkway splits lower and upper bowl
const AISLE_RUN = 1.2;
const AISLE_RISE = 0.5;

export const SECTIONS = Object.freeze([
  { id: "far", axis: "x", dir: -1, start: 12.5, rows: 14, from: -17, to: 17 },
  { id: "near", axis: "x", dir: 1, start: 12.0, rows: 5, from: -17, to: 17 },
  { id: "endNeg", axis: "z", dir: -1, start: 17.0, rows: 10, from: -25, to: 13 },
  { id: "endPos", axis: "z", dir: 1, start: 17.0, rows: 10, from: -25, to: 13 },
]);

/**
 * One row's geometry. d = distance from the court's centre line out to this row's front edge.
 * Returns { d, top } where top is the height of the row's tread.
 */
export function rowGeometry(section, r) {
  const aisles = r > AISLE_AFTER_ROW ? 1 : 0;
  return {
    d: section.start + r * STEP_RUN + aisles * AISLE_RUN,
    top: FIRST_ROW_Y + r * STEP_RISE + aisles * AISLE_RISE,
  };
}

/**
 * Steps (solid blocks, one per row) and seats for every stand.
 * Step = { x, y, z, sx, sy, sz, section, row }; seat = { x, y, z, section, row } with y = the tread height.
 */
export function buildStands(sections = SECTIONS) {
  const steps = [];
  const seats = [];
  for (const sec of sections) {
    const len = sec.to - sec.from;
    const mid = (sec.from + sec.to) / 2;
    for (let r = 0; r < sec.rows; r++) {
      const { d, top } = rowGeometry(sec, r);
      const centre = sec.dir * (d + STEP_RUN / 2);
      const seatD = sec.dir * (d + STEP_RUN * 0.5);
      steps.push(
        sec.axis === "x"
          ? { x: centre, y: top / 2, z: mid, sx: STEP_RUN, sy: top, sz: len, section: sec.id, row: r }
          : { x: mid, y: top / 2, z: centre, sx: len, sy: top, sz: STEP_RUN, section: sec.id, row: r },
      );
      const n = Math.floor(len / SEAT_PITCH);
      for (let i = 0; i < n; i++) {
        const along = sec.from + SEAT_PITCH * (i + 0.5) + (len - n * SEAT_PITCH) / 2;
        seats.push(sec.axis === "x" ? { x: seatD, y: top, z: along, section: sec.id, row: r } : { x: along, y: top, z: seatD, section: sec.id, row: r });
      }
    }
  }
  return { steps, seats };
}

/** The courtside furniture: one bench per team on the far side, the scorer's table between them. */
export const COURTSIDE = Object.freeze({
  benchX: -10.3,
  tableX: -9.7,
  tableHalfLen: 3.0,
  benches: Object.freeze([
    Object.freeze({ side: "home", z: -8.5, halfLen: 3.3 }),
    Object.freeze({ side: "away", z: 8.5, halfLen: 3.3 }),
  ]),
});

/** Does a point stand on the playing floor (plus a safety margin)? Used by tests and by the crowd to refuse such seats. */
export function onCourt(x, z, margin = 0) {
  return Math.abs(x) < FLOOR_HALF_W + margin && Math.abs(z) < FLOOR_HALF_L + margin;
}
