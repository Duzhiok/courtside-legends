// Broadcast-first slice 1 (d2bfba2): the live feed moved out of the court column,
// so the toast mount's anchor (#play-feed) is no longer a child of it.
// ensureMatchEventMounts must only insertBefore the anchor when it really is a
// child — otherwise a real DOM throws NotFoundError and the match screen dies
// on the first info event. Pinned here with a fake document (no browser).
import test from "node:test";
import assert from "node:assert/strict";
import { createMatchEventController } from "../js/ui/matchEventCards.js";

function fakeEl(onAttach) {
  const children = [];
  const el = {
    id: "",
    innerHTML: "",
    children,
    parentNode: null,
    classList: { toggle: () => {}, contains: () => false },
    querySelectorAll: () => [],
    addEventListener: () => {},
    appendChild(child) {
      child.parentNode = el;
      children.push(child);
      onAttach?.(child);
      return child;
    },
    insertBefore(child, before) {
      // A real DOM throws NotFoundError when the anchor is not a child.
      if (!children.includes(before)) throw new Error("insertBefore: anchor is not a child");
      child.parentNode = el;
      children.splice(children.indexOf(before), 0, child);
      onAttach?.(child);
      return child;
    },
  };
  return el;
}

// feedInsideCourt: true = pre-slice-1 layout (feed is a child of .court-column);
// false = broadcast layout (feed lives beside the court column).
function fakeDoc({ feedInsideCourt } = {}) {
  const byId = new Map();
  const onAttach = (child) => { if (child.id) byId.set(child.id, child); };
  const courtCol = fakeEl(onAttach);
  const coachPanel = fakeEl(onAttach);
  const body = fakeEl(onAttach);
  const feed = fakeEl(onAttach);
  feed.id = "play-feed";
  if (feedInsideCourt) courtCol.appendChild(feed);
  else fakeEl(onAttach).appendChild(feed); // some other parent, not the court column
  return {
    body,
    createElement: () => fakeEl(onAttach),
    getElementById: (id) => (id === "play-feed" ? feed : byId.get(id) || null),
    querySelector: (sel) => (sel === ".court-column" ? courtCol : sel === ".coach-panel" ? coachPanel : null),
    _courtCol: courtCol,
    _feed: feed,
  };
}

function withDoc(doc, fn) {
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

test("broadcast layout: the toast mounts without touching the moved feed anchor", () => {
  const doc = fakeDoc({ feedInsideCourt: false });
  const { mounts } = withDoc(doc, () => createMatchEventController({}));
  assert.ok(mounts?.toast, "toast mount exists");
  assert.equal(mounts.toast.parentNode, doc._courtCol, "toast is appended to the court column");
  assert.ok(!doc._courtCol.children.includes(doc._feed), "the feed was never moved into the court column");
});

test("old layout: the toast still inserts before the feed when it is a child", () => {
  const doc = fakeDoc({ feedInsideCourt: true });
  const { mounts } = withDoc(doc, () => createMatchEventController({}));
  assert.ok(mounts?.toast, "toast mount exists");
  assert.deepEqual(
    doc._courtCol.children.map((c) => c.id),
    ["match-event-toast", "play-feed"],
    "toast sits before the feed inside the court column",
  );
});

test("mounts are idempotent: a second controller reuses the same containers", () => {
  const doc = fakeDoc({ feedInsideCourt: false });
  const first = withDoc(doc, () => createMatchEventController({}));
  const second = withDoc(doc, () => createMatchEventController({}));
  assert.equal(second.mounts.toast, first.mounts.toast);
  assert.equal(second.mounts.card, first.mounts.card);
  assert.equal(second.mounts.sheet, first.mounts.sheet);
  assert.equal(doc._courtCol.children.filter((c) => c.id === "match-event-toast").length, 1);
});
