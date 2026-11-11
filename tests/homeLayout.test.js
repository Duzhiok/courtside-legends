/**
 * My Home layout (Home 2.0): owned-only placement, no overlaps, wall hooks, rotation, persistence per account,
 * and that the isometric renderer shows exactly what the rules placed (real data, nothing invented).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const L = await import("../js/data/homeLayout.js");
const acc = await import("../js/data/account.js");
const { renderIsoRoom } = await import("../js/ui/myHome/isoRoom.js");

const ALL = ["rug", "trophy-cabinet", "bookshelf", "sofa", "floor-lamp", "display-stand", "star-poster", "hoop"];

const solidCells = (placed) => {
  const cells = [];
  for (const p of placed) {
    if (p.kind !== "floor" || L.isFlat(p.id)) continue;
    for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) cells.push(`${p.x + i},${p.y + j}`);
  }
  return cells;
};

test("everything owned is placed by default, with no overlaps and no two pieces on one hook", () => {
  const placed = L.resolveHome(ALL, null);
  assert.equal(placed.length, ALL.length);
  const cells = solidCells(placed);
  assert.equal(new Set(cells).size, cells.length, "solid pieces never share a cell");
  assert.ok(!cells.includes("0,5"), "the avatar podium cell stays free");
  const slots = placed.filter((p) => p.kind === "wall").map((p) => p.slot);
  assert.equal(new Set(slots).size, slots.length);
  assert.ok(placed.every((p) => p.kind === "wall" || (p.x >= 0 && p.y >= 0 && p.x + p.w <= L.HOME_GRID && p.y + p.d <= L.HOME_GRID)));
});

test("only owned, known furniture is ever placed; stale saved ids are dropped", () => {
  assert.deepEqual(L.resolveHome([], null), []);
  const placed = L.resolveHome(["sofa", "no-such-piece"], { items: { hoop: { slot: "R1" }, sofa: { x: 2, y: 2, rot: 0 } } });
  assert.deepEqual(placed.map((p) => p.id), ["sofa"]);
  assert.deepEqual([placed[0].x, placed[0].y], [2, 2]);
});

test("a saved spot that is no longer valid falls back to an automatic one instead of overlapping", () => {
  const saved = { items: { sofa: { x: 0, y: 0, rot: 0 }, "trophy-cabinet": { x: 0, y: 0, rot: 0 } } };
  const placed = L.resolveHome(["sofa", "trophy-cabinet"], saved);
  const cells = solidCells(placed);
  assert.equal(new Set(cells).size, cells.length);
  assert.equal(placed.length, 2);
});

test("movePiece: free spot works; occupied, reserved, out-of-room and unowned are refused", () => {
  const owned = ["sofa", "trophy-cabinet", "hoop"];
  const ok = L.movePiece(owned, null, "sofa", { x: 2, y: 3 });
  assert.equal(ok.ok, true);
  assert.deepEqual(L.resolveHome(owned, ok.layout).find((p) => p.id === "sofa").x, 2);
  assert.equal(L.movePiece(owned, null, "sofa", { x: 0, y: 0 }).reason, "occupied", "cabinet stands in the back corner");
  assert.equal(L.movePiece(owned, null, "trophy-cabinet", { x: 0, y: 5 }).reason, "occupied", "podium cell is reserved");
  assert.equal(L.movePiece(owned, null, "sofa", { x: 5, y: 5 }).reason, "out-of-room", "a 2-wide sofa cannot start at the last column");
  assert.equal(L.movePiece(owned, null, "bookshelf", { x: 1, y: 1 }).reason, "not-owned");
});

test("wall pieces take hooks only, one per hook; a floor piece cannot hang on a wall", () => {
  const owned = ["hoop", "star-poster", "sofa"];
  const placed = L.resolveHome(owned, null);
  const poster = placed.find((p) => p.id === "star-poster");
  const hoop = placed.find((p) => p.id === "hoop");
  assert.equal(L.movePiece(owned, null, "hoop", { slot: poster.slot }).reason, "occupied");
  const free = Object.keys(L.WALL_SLOTS).find((s) => s !== poster.slot && s !== hoop.slot);
  assert.equal(L.movePiece(owned, null, "hoop", { slot: free }).ok, true);
  assert.equal(L.movePiece(owned, null, "sofa", { slot: free }).reason, "wrong-spot");
  assert.equal(L.movePiece(owned, null, "hoop", { x: 1, y: 1 }).reason, "wrong-spot");
});

test("rotating swaps the footprint, refuses when it would not fit, and wall pieces cannot rotate", () => {
  const owned = ["sofa", "hoop"];
  const rot = L.rotatePiece(owned, null, "sofa");
  assert.equal(rot.ok, true);
  const sofa = L.resolveHome(owned, rot.layout).find((p) => p.id === "sofa");
  assert.deepEqual([sofa.w, sofa.d, sofa.rot], [1, 2, 1]);
  const tight = L.movePiece(owned, null, "sofa", { x: 0, y: 4 }); // 2x1 at the bottom row; rotated it needs rows 4-5 -> fits y=4..5
  assert.equal(tight.ok, true);
  const edge = L.movePiece(owned, null, "sofa", { x: 4, y: 5 }); // against the last row: rotation would leave the room
  assert.equal(L.rotatePiece(owned, edge.layout, "sofa").reason, "out-of-room");
  assert.equal(L.rotatePiece(owned, null, "hoop").reason, "wall-piece");
});

test("a layout is saved per account; a guest cannot save; reset returns to the default arrangement", () => {
  globalThis.localStorage = createMemoryStorage();
  const a = acc.createAccount("Home A");
  const b = acc.createAccount("Home B");
  const owned = ["sofa"];
  const moved = L.movePiece(owned, null, "sofa", { x: 1, y: 3 });
  assert.equal(L.saveHomeLayout(acc.getAccount(a.id), moved.layout), true);
  assert.deepEqual(L.resolveHome(owned, L.getHomeLayout(acc.getAccount(a.id)))[0].y, 3);
  assert.notEqual(L.resolveHome(owned, L.getHomeLayout(acc.getAccount(b.id)))[0].y, 3, "another account keeps its own room");
  assert.equal(L.saveHomeLayout(null, moved.layout), false, "guest: nothing to save to");
  L.resetHomeLayout(acc.getAccount(a.id));
  assert.equal(acc.getAccount(a.id).homeLayout, undefined);
});

test("a damaged saved layout is ignored, never thrown on", () => {
  for (const bad of [null, "x", 5, { items: "no" }, { items: { sofa: "x", hoop: { slot: "nowhere" }, rug: { x: "a", y: 1 } } }]) {
    const layout = L.getHomeLayout({ homeLayout: bad });
    assert.deepEqual(layout.items, {});
  }
});

test("the room shows exactly what was placed: real trophy count, framed cards, and only owned furniture", () => {
  const empty = renderIsoRoom({ placed: [], trophyCount: 0, cards: [], name: "Zoro" });
  assert.doesNotMatch(empty, /data-furniture=/);
  assert.match(empty, /Trophy shelf is empty|奖杯架还空着/);
  const placed = L.resolveHome(["trophy-cabinet", "sofa"], null);
  const full = renderIsoRoom({ placed, trophyCount: 7, cards: [{ name: "Ann", bref: "x01", season: 2001 }], name: "Zoro" });
  assert.match(full, /data-furniture="sofa"/);
  assert.match(full, /data-furniture="trophy-cabinet"/);
  assert.doesNotMatch(full, /data-furniture="hoop"/);
  assert.match(full, /×7/, "more than five trophies show the real count");
  assert.match(full, /<title>Ann<\/title>/);
  const hit = renderIsoRoom({ placed, interactive: true, selectedId: "sofa" });
  assert.equal((hit.match(/data-cell=/g) || []).length, L.HOME_GRID * L.HOME_GRID);
  assert.equal((hit.match(/data-slot=/g) || []).length, Object.keys(L.WALL_SLOTS).length);
  assert.doesNotMatch(renderIsoRoom({ placed }), /data-cell=/, "the preview has no hit areas");
});

test("user text in the room is escaped", () => {
  const svg = renderIsoRoom({ placed: [], name: '<img src=x onerror=1>', cards: [{ name: "<b>x</b>" }] });
  assert.doesNotMatch(svg, /<img src=x/);
  assert.doesNotMatch(svg, /<b>x<\/b>/);
});
