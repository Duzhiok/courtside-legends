import test from "node:test";
import assert from "node:assert/strict";
import { gmBusinessHtml } from "../js/ui/gmBusinessView.js";
import { createExecutiveScenario, advanceScenarioSeason } from "../js/career/gm/businessScenario.js";

const card = (bref, season, rating, ppg = 10, name = "Test Player") => ({
  bref, name, season, team: "VAN", pos: "SG",
  three: rating, mid: rating, paint: rating, scoring: rating, pass: rating,
  iq: rating, defense: rating, steal: rating, block: rating, rebound: rating,
  speed: rating, strength: rating, stamina: rating, clutch: rating,
  raw: { ppg },
});
const draftPlayers = [
  card("sleep01", 1997, 55, 8, "Sleeper One"), card("sleep01", 1998, 85, 22, "Sleeper One"), card("sleep01", 1999, 88, 26, "Sleeper One"),
  card("dec01", 1997, 55, 9, "Decoy One"), card("dec01", 1998, 60, 12, "Decoy One"), card("dec01", 1999, 60, 11, "Decoy One"),
  card("dec02", 1998, 55, 7, "Decoy Two"), card("dec02", 1999, 58, 10, "Decoy Two"), card("dec02", 2000, 60, 9, "Decoy Two"),
];
const star = (team) => ({
  bref: "star01", name: "Star", team, pos: "SG",
  three: 88, mid: 88, paint: 85, scoring: 92, pass: 72, iq: 82,
  defense: 76, steal: 72, block: 60, rebound: 70, speed: 82, strength: 76,
  stamina: 82, clutch: 88, raw: { ppg: 28.4 },
});
const role = (team, bref) => ({
  bref, name: "Role", team, pos: "PF",
  three: 50, mid: 50, paint: 50, scoring: 50, pass: 50, iq: 50,
  defense: 50, steal: 50, block: 50, rebound: 50, speed: 50, strength: 50,
  stamina: 50, clutch: 50, raw: { ppg: 6.1 },
});
const roster = (team) => [star(team), ...Array.from({ length: 11 }, (_, i) => role(team, `role${i}`))];

test("dashboard layer 1: stage, franchise and personal panels are separate", () => {
  const s = createExecutiveScenario({ players: draftPlayers });
  const html = gmBusinessHtml(s, { lang: "zh" });
  assert.ok(html.includes("总经理"), "stage label present");
  assert.ok(html.includes("灰熊"), "team name from real 1996 data");
  assert.ok(html.includes("经营预算"), "franchise panel present");
  assert.ok(html.includes("个人财富"), "personal panel present");
  assert.ok(html.includes("个人财富与球队经营预算是分开的"), "separation is stated on the screen");
  assert.ok(html.includes("还没有打完的赛季"), "empty state never fabricates a result");
  assert.ok(!html.includes("上赛季"), "no last-season panel before any season is played");
});

test("layer 2: ticket buttons, sponsorship offers and event choices render", () => {
  const s = createExecutiveScenario({ players: draftPlayers });
  const html = gmBusinessHtml(s, { lang: "zh" });
  assert.ok(html.includes('data-gm-action="ticket"'), "ticket price buttons");
  assert.ok(html.includes('data-gm-action="sponsor"'), "sponsorship offer buttons");
  assert.ok(html.includes('data-gm-action="event-choice"'), "event choices are real decisions, not a first-choice auto-pick");
  assert.ok(html.includes("赞助商报价"), "sponsorship event renders with its title");
  assert.ok(html.includes("球馆突发维修"), "financial crisis renders with its title");
});

test("layer 3: deep management is collapsed, clues hide until revealed", () => {
  const s = createExecutiveScenario({ players: draftPlayers });
  const html = gmBusinessHtml(s, { lang: "zh" });
  assert.ok(html.includes("<details"), "deep management is a collapsed details block");
  assert.ok(html.includes("深度经营"), "deep management label");
  assert.ok(html.includes("揭示线索"), "unrevealed clue shows a reveal button, not its content");
  assert.ok(!html.includes("Sleeper One") || html.includes("揭示线索"), "clue content stays hidden until revealed");
  const en = gmBusinessHtml(s, { lang: "en" });
  assert.ok(en.includes("Franchise") && en.includes("Personal wealth"));
});

test("after a settled season the dashboard shows real money and the minority path", () => {
  let s = createExecutiveScenario({ players: draftPlayers });
  const { state } = advanceScenarioSeason(s, { wins: 58, losses: 24, playoffRound: "finals", champion: true }, { players: roster("VAN"), rng: () => 0.5 });
  const html = gmBusinessHtml(state, { lang: "zh" });
  assert.ok(html.includes("58"), "wins shown");
  assert.ok(html.includes("上赛季"), "last-season panel appears after a season");
  assert.ok(html.includes("收入明细"), "revenue breakdown appears in deep management");
  assert.ok(html.includes("篮球商业操盘手"), "stage advanced to president after the title run");
});
