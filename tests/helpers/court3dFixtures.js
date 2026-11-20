// Shared by the CourtView3D tests: a DOM stub just big enough for the view, and the clutch-time snapshot (2016 GSW vs CLE).
// Importing this file installs the fake `document` the plate canvases draw on.

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => {
      if (force === undefined) set.has(c) ? set.delete(c) : set.add(c);
      else if (force) set.add(c);
      else set.delete(c);
    },
    contains: (c) => set.has(c),
  };
}

export function makeEl() {
  const children = [];
  const bySelector = new Map();
  let html = "";
  return {
    tagName: "DIV",
    className: "",
    get innerHTML() {
      return html;
    },
    set innerHTML(v) {
      html = v;
      if (v === "") children.length = 0;
    },
    textContent: "",
    style: {},
    children,
    dataset: {},
    classList: makeClassList(),
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
      return child;
    },
    remove: () => {},
    querySelector: (sel) => {
      if (!bySelector.has(sel)) {
        bySelector.set(sel, { textContent: "", classList: makeClassList(), style: {} });
      }
      return bySelector.get(sel);
    },
    addEventListener: () => {},
  };
}

export function makeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
    }),
  };
}

globalThis.document = { createElement: (tag) => (tag === "canvas" ? makeCanvas() : makeEl()) };

export function makeContainer() {
  const el = makeEl();
  el.clientWidth = 800;
  el.clientHeight = 450;
  return el;
}

export function player(id, name, pos, pts = 0) {
  return { id, name, cardName: name, pos, playPos: pos, stats: { pts } };
}

/** The clutch scenario: 2016 GSW (home, you) vs CLE (away), Q4, 12s, 97–100. */
export function clutchSnap() {
  return {
    quarter: 4,
    clock: 12,
    score: { home: 97, away: 100 },
    possession: "home",
    youSide: "home",
    home: {
      name: "勇士",
      tactic: { id: "balanced", name: "均衡" },
      onCourt: [
        player("gsw-curry", "Stephen Curry", "PG", 24),
        player("gsw-klay", "Klay Thompson", "SG", 18),
        player("gsw-barnes", "Harrison Barnes", "SF", 9),
        player("gsw-green", "Draymond Green", "PF", 11),
        player("gsw-bogut", "Andrew Bogut", "C", 4),
      ],
    },
    away: {
      name: "骑士",
      tactic: { id: "balanced", name: "均衡" },
      onCourt: [
        player("cle-irving", "Kyrie Irving", "PG", 27),
        player("cle-smith", "J.R. Smith", "SG", 12),
        player("cle-james", "LeBron James", "SF", 31),
        player("cle-love", "Kevin Love", "PF", 15),
        player("cle-thompson", "Tristan Thompson", "C", 8),
      ],
    },
  };
}
