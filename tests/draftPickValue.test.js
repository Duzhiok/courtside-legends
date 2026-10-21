import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateDraftPickValue,
  expectedProspectAtSlot,
  totalPickValue,
} from "../js/engine/draftPickValue.js";

test("earlier slots project better prospects than later slots", () => {
  const top = expectedProspectAtSlot(3);
  const late = expectedProspectAtSlot(28);
  assert.ok(top.current > late.current);
  assert.ok(top.potential > late.potential);
});

test("unprotected firsts beat lottery-protected firsts, which beat seconds", () => {
  const opts = { currentYear: 1995 };
  const unprotected = estimateDraftPickValue({ year: 1996, round: 1, protection: "unprotected" }, opts);
  const protectedPick = estimateDraftPickValue({ year: 1996, round: 1, protection: "lottery-protected" }, opts);
  const second = estimateDraftPickValue({ year: 1996, round: 2, protection: "unprotected" }, opts);
  assert.ok(unprotected.ovrEquivalent > protectedPick.ovrEquivalent);
  assert.ok(protectedPick.ovrEquivalent > second.ovrEquivalent);
  assert.ok(second.ovrEquivalent > 0);
});

test("lottery-protected pick explains its conveyance risk in Chinese", () => {
  const value = estimateDraftPickValue({ year: 1996, round: 1, protection: "lottery-protected" }, { currentYear: 1995 });
  assert.equal(value.label, "1996 年首轮（乐透保护）");
  assert.match(value.explanation, /概率当年兑现/);
  assert.match(value.explanation, /OVR/);
});

test("picks further in the future are discounted", () => {
  const near = estimateDraftPickValue({ year: 1996, round: 1 }, { currentYear: 1995 });
  const far = estimateDraftPickValue({ year: 1999, round: 1 }, { currentYear: 1995 });
  assert.ok(near.ovrEquivalent > far.ovrEquivalent);
});

test("total pick value sums individual estimates", () => {
  const picks = [
    { year: 1996, round: 1, protection: "lottery-protected" },
    { year: 1997, round: 2, protection: "unprotected" },
  ];
  const { items, total } = totalPickValue(picks, { currentYear: 1995 });
  assert.equal(items.length, 2);
  const sum = Math.round((items[0].ovrEquivalent + items[1].ovrEquivalent) * 10) / 10;
  assert.equal(total, sum);
});
