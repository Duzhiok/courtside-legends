import test from "node:test";
import assert from "node:assert/strict";
import {
  mergePresentationEvents,
  createPresentationEventNormalizer,
} from "../js/match/presentation/normalizer.js";

function snap({ quarter = 1, clock = 720, score = { home: 0, away: 0 }, possession = "home" } = {}) {
  return { quarter, clock, score, possession, home: { onCourt: [] }, away: { onCourt: [] } };
}

// Raw GameSim emit payloads spread the snapshot into the payload itself.
const rawScore = {
  type: "score",
  text: "Home SG scores",
  ...snap({ clock: 706, score: { home: 2, away: 0 } }),
  meta: { shot: { shooterId: "home-sg", made: true, pts: 2 } },
};
const rawPass = {
  type: "pass",
  text: "Home PG swings it",
  ...snap({ clock: 712, score: { home: 0, away: 0 } }),
  meta: { pass: { passerId: "home-pg", receiverId: "home-sg", kind: "kick" } },
};
const domainStart = {
  type: "POSSESSION_START",
  meta: { possession: "home", quarter: 1, clock: 720 },
  snapshot: snap({ clock: 720 }),
};
const domainEnd = {
  type: "MATCH_END",
  meta: { score: { home: 2, away: 0 } },
  snapshot: snap({ clock: 0, score: { home: 2, away: 0 } }),
};

test("normalizer merges raw + derived into one stable-sequenced stream", () => {
  // Feed the streams in the "wrong" order on purpose: the merge must still
  // come out chronological (clock counts down inside a quarter).
  const merged = mergePresentationEvents([rawScore, rawPass], [domainEnd, domainStart]);
  assert.deepEqual(
    merged.map((e) => e.kind),
    ["possession_start", "pass", "score", "match_end"],
  );
  assert.deepEqual(
    merged.map((e) => e.seq),
    [0, 1, 2, 3],
  );
  assert.equal(merged[0].source, "derived");
  assert.equal(merged[1].source, "raw");
  assert.equal(merged[1].gameTime.clock, 712);
  assert.deepEqual(merged[2].score, { home: 2, away: 0 });
  assert.equal(merged[2].possession, "home");
  assert.equal(merged[2].text, "Home SG scores");
  assert.deepEqual(merged[2].meta, { shot: { shooterId: "home-sg", made: true, pts: 2 } });
});

test("normalizer is stable: same inputs, same order and seqs, every time", () => {
  const a = mergePresentationEvents([rawScore, rawPass], [domainEnd, domainStart]);
  const b = mergePresentationEvents([rawScore, rawPass], [domainEnd, domainStart]);
  assert.deepEqual(a, b);
});

test("normalizer puts a possession start before same-clock plays and match end last", () => {
  const sameClock = snap({ clock: 700 });
  const merged = mergePresentationEvents(
    [{ type: "pass", text: "p", ...sameClock, meta: { pass: {} } }],
    [
      { type: "POSSESSION_START", meta: {}, snapshot: sameClock },
      { type: "MATCH_END", meta: {}, snapshot: snap({ clock: 700 }) },
    ],
  );
  assert.deepEqual(merged.map((e) => e.kind), ["possession_start", "pass", "match_end"]);
});

test("normalizer drops events with no usable snapshot", () => {
  const merged = mergePresentationEvents(
    [{ type: "score", text: "no snapshot anywhere" }],
    [{ type: "POSSESSION_START", meta: {} }],
  );
  assert.equal(merged.length, 0);
  const n = createPresentationEventNormalizer();
  n.feedRaw({ type: "score", text: "no snapshot" });
  n.feedDerived({ type: "POSSESSION_START", meta: {}, snapshot: snap({}) });
  assert.equal(n.flush().length, 1);
  assert.equal(n.dropped, 1);
});

test("normalizer class: seq continues across flushes and reset restarts it", () => {
  const n = createPresentationEventNormalizer();
  n.feedRaw(rawPass);
  n.feedDerived(domainStart);
  const first = n.flush();
  assert.deepEqual(first.map((e) => e.seq), [0, 1]);
  n.feedRaw(rawScore);
  const second = n.flush();
  assert.deepEqual(second.map((e) => e.seq), [2]);
  assert.equal(n.flush().length, 0);
  n.reset();
  n.feedRaw(rawPass);
  assert.equal(n.flush()[0].seq, 0);
});

test("normalizer passes unknown kinds through lowercased, meta intact", () => {
  const merged = mergePresentationEvents([
    { type: "BUZZ", text: "b", ...snap({}), meta: { custom: 1 } },
  ]);
  assert.equal(merged[0].kind, "buzz");
  assert.deepEqual(merged[0].meta, { custom: 1 });
});
