import test from "node:test";
import assert from "node:assert/strict";
import { GameSim, reboundContestWeight } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

const games = (n, a, b, year, tag) => Array.from({ length: n }, (_, i) => {
  const sim = new GameSim({ home: realTeam(a, year), away: realTeam(b, year), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`${tag}|${i}`)) });
  sim.runFast();
  return [...sim.home.onCourt, ...sim.home.bench, ...sim.away.onCourt, ...sim.away.bench].map((p) => p.stats);
});
const total = (all, key) => all.flat().reduce((s, st) => s + (st[key] || 0), 0);

test("a missed shot that draws a shooting foul is not a field-goal attempt: every missed attempt has a rebound to match", () => {
  const all = games(16, "CHI", "SEA", 1996, "acct");
  const missed = total(all, "fga") - total(all, "fgm");
  // Free-throw misses add rebounds on top, so credited rebounds are at least the missed field goals. With fouled misses counted as attempts
  // (about 7 per team-game) credited rebounds were only ~93% of the "misses".
  assert.ok(total(all, "reb") >= missed, `${total(all, "reb")} rebounds for ${missed} missed field goals`);
});

test("rebounds: a rating-35 guard is not 1/12 of a rating-80 centre any more (position was counted twice)", () => {
  const body = (pos, rating) => ({ playPos: pos, pos, rebound: rating, offReb: rating, defReb: rating, heightCm: pos === "C" ? 211 : 190, strength: 60, defense: 60, intangibles: { motor: 50 }, stats: { reb: 0 }, skills: [] });
  for (const offensive of [false, true]) {
    const ratio = reboundContestWeight(body("PG", 35), { offensive }) / reboundContestWeight(body("C", 80), { offensive });
    assert.ok(ratio > 0.2 && ratio < 0.6, `${offensive ? "offensive" : "defensive"} weight ratio guard/centre ${ratio.toFixed(2)}`);
  }
});

test("assists: about 60-70% of baskets are assisted (it was 74%, the real figure is 62%)", () => {
  const all = games(16, "BOS", "LAL", 2008, "ast");
  const share = total(all, "ast") / total(all, "fgm");
  assert.ok(share > 0.5 && share < 0.7, `assisted share ${(share * 100).toFixed(0)}%`);
});

test("free throws made never exceed attempts and shooting stats stay consistent (made <= attempted, threes <= field goals)", () => {
  for (const st of games(8, "GSW", "BOS", 2022, "consistency").flat()) {
    assert.ok(st.ftm <= st.fta && st.fgm <= st.fga && st.tpm <= st.tpa && st.tpm <= st.fgm && st.tpa <= st.fga, JSON.stringify(st));
  }
});
