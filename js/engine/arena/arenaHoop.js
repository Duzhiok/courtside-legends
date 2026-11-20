/**
 * Hoop trim for the existing basket (backboard frame, shooter's square, rim bracket, padded stanchion). Adds meshes to the
 * hoop group only; the rim mesh court3d animates (shake) is untouched. Uses BoxGeometry/MeshStandardMaterial only, so it
 * works on any THREE-like (the test fake included).
 */

const FRAME = 0x23282b;
const SQUARE = 0xd0352b;

/**
 * @param T      THREE namespace
 * @param group  the hoop's Group
 * @param opts   { rimZ, s (-1 for the -z hoop, +1 for the +z hoop), rimY, padColor (CSS/hex colour) }
 */
export function addHoopDetails(T, group, { rimZ, s, rimY = 3.05, padColor = 0x216747 }) {
  const boardZ = rimZ + s * 0.45;
  const faceZ = boardZ - s * 0.03; // just proud of the glass, toward the court
  const box = (w, h, d, color, x, y, z, rough = 0.6) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color, roughness: rough }));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  // Backboard frame: 1.83 x 1.07 m glass, 4 cm border.
  const bw = 1.83;
  const bh = 1.07;
  const by = 3.48;
  box(bw + 0.08, 0.05, 0.07, FRAME, 0, by + bh / 2, boardZ);
  box(bw + 0.08, 0.05, 0.07, FRAME, 0, by - bh / 2, boardZ);
  box(0.05, bh, 0.07, FRAME, -bw / 2, by, boardZ);
  box(0.05, bh, 0.07, FRAME, bw / 2, by, boardZ);
  // Shooter's square: 59 x 45 cm, bottom edge level with the rim.
  const qw = 0.59;
  const qh = 0.45;
  const qy = rimY + qh / 2;
  const line = 0.03;
  box(qw, line, 0.01, SQUARE, 0, rimY, faceZ, 0.5);
  box(qw, line, 0.01, SQUARE, 0, rimY + qh, faceZ, 0.5);
  box(line, qh, 0.01, SQUARE, -qw / 2, qy, faceZ, 0.5);
  box(line, qh, 0.01, SQUARE, qw / 2, qy, faceZ, 0.5);
  // Rim bracket between the glass and the ring.
  box(0.14, 0.05, 0.2, 0x8a3a1a, 0, rimY, rimZ + s * 0.33, 0.5);
  // Padded base of the stanchion, in the arena's accent colour.
  box(0.55, 1.5, 0.5, padColor, 0, 0.75, rimZ + s * 1.0, 0.9);
}
