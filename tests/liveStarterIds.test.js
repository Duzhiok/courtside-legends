import test from "node:test";
import assert from "node:assert/strict";
import { liveStarterIds, toggleStarter } from "../js/engine/gameplan.js";

const team = (ids, starterIds, rotationIds) => ({
  players: ids.map((id) => ({ id })),
  ...(starterIds === undefined ? {} : { starterIds }),
  ...(rotationIds ? { rotation: { starterIds: rotationIds } } : {}),
});

test("ids of players no longer on the roster are not starters (traded / cut)", () => {
  const t = team(["a", "b", "c"], ["a", "gone1", "gone2", "gone3", "gone4"]);
  assert.deepEqual(liveStarterIds(t), ["a"]);
});

test("falls back to the saved rotation's starters when the team has none of its own", () => {
  assert.deepEqual(liveStarterIds(team(["a", "b"], null, ["b"])), ["b"]);
  assert.deepEqual(liveStarterIds(team(["a", "b"], undefined, ["a"])), ["a"]);
});

test("an explicit empty list stays empty (does not resurrect the rotation's starters)", () => {
  assert.deepEqual(liveStarterIds(team(["a", "b"], [], ["a"])), []);
});

test("duplicates collapse; junk input is safe", () => {
  assert.deepEqual(liveStarterIds(team(["a", "b"], ["a", "a", "b"])), ["a", "b"]);
  assert.deepEqual(liveStarterIds(null), []);
  assert.deepEqual(liveStarterIds({}), []);
  assert.deepEqual(liveStarterIds({ players: [{ id: "a" }], starterIds: "a" }), []);
});

test("the reported bug: four ghost starters no longer block picking the first real one", () => {
  const t = team(["a", "b", "c", "d", "e", "f"], ["x1", "x2", "x3", "x4", "x5"]);
  const out = toggleStarter(t, "a", true);
  assert.equal(out.ok, true);
  assert.deepEqual(out.ids, ["a"]);
});

test("a real sixth starter is still refused, and nothing changes", () => {
  const t = team(["a", "b", "c", "d", "e", "f"], ["a", "b", "c", "d", "e"]);
  const out = toggleStarter(t, "f", true);
  assert.equal(out.ok, false);
  assert.deepEqual(out.ids, ["a", "b", "c", "d", "e"]);
});

test("picking someone already a starter is a no-op success; unticking removes him", () => {
  const t = team(["a", "b"], ["a"]);
  assert.deepEqual(toggleStarter(t, "a", true).ids, ["a"]);
  assert.deepEqual(toggleStarter(t, "a", false).ids, []);
  assert.deepEqual(toggleStarter(t, "b", true).ids, ["a", "b"]);
});

test("a player who is not on the roster cannot be made a starter", () => {
  const out = toggleStarter(team(["a"], []), "nobody", true);
  assert.equal(out.ok, false);
  assert.deepEqual(out.ids, []);
});
