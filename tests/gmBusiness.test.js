import test from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_CAPACITY_1996,
  BASE_TICKET_PRICE,
  BASE_VALUATION,
  attendanceFor,
  createBusinessState,
  demandFraction,
  expandArena,
  merchRevenue,
  rebrandTeam,
  relocateTeam,
  renovateArena,
  setTicketPrice,
  settleSeason,
  signSponsorship,
  sponsorshipOffers,
  sponsorshipRevenue,
  starMarketability,
  teamPayroll,
  teamStarAppeal,
  teamValuation,
  ticketRevenue,
} from "../js/career/gm/franchiseBusiness.js";

/** Fabricated card: overall() reads the rating fields, so a star is a star by numbers. */
const star = (team) => ({
  bref: "star01",
  team,
  pos: "SG",
  three: 88, mid: 88, paint: 85, scoring: 92, pass: 72, iq: 82,
  defense: 76, steal: 72, block: 60, rebound: 70, speed: 82, strength: 76,
  stamina: 82, clutch: 88,
  raw: { ppg: 28.4 },
});
const role = (team, bref) => ({
  bref,
  team,
  pos: "PF",
  three: 50, mid: 50, paint: 50, scoring: 50, pass: 50, iq: 50,
  defense: 50, steal: 50, block: 50, rebound: 50, speed: 50, strength: 50,
  stamina: 50, clutch: 50,
  raw: { ppg: 6.1 },
});
const weakRoster = (team) => Array.from({ length: 12 }, (_, i) => role(team, `role${i}`));
const strongRoster = (team) => [star(team), ...weakRoster(team).slice(0, 11)];

test("createBusinessState: recorded arena capacity, small-market valuation, team money only", () => {
  const s = createBusinessState({ teamId: "VAN", teamName: "灰熊", season: 1996, market: "small" });
  assert.equal(s.arena.capacity, ARENA_CAPACITY_1996.VAN);
  assert.equal(s.ticketPrice, BASE_TICKET_PRICE);
  assert.equal(s.operatingBudget, 25);
  assert.equal(s.valuation, BASE_VALUATION * 0.9);
  assert.equal(s.sponsorships.length, 0);
  assert.equal(s.personal, undefined, "no personal wealth lives on the franchise state");
});

test("demand: price empties seats, winning and stars fill them", () => {
  const base = { ticketPrice: 30, winPct: 0.4, starAppeal: 0, market: "mid" };
  const pricey = demandFraction({ ...base, ticketPrice: 120 });
  const cheap = demandFraction({ ...base, ticketPrice: 15 });
  const winning = demandFraction({ ...base, winPct: 0.75 });
  const starring = demandFraction({ ...base, starAppeal: 0.9 });
  assert.ok(pricey < demandFraction(base));
  assert.ok(cheap > demandFraction(base));
  assert.ok(winning > demandFraction(base));
  assert.ok(starring > demandFraction(base));
  const s = createBusinessState({ teamId: "VAN", season: 1996, market: "small" });
  assert.ok(attendanceFor(s, { winPct: 0.2, starAppeal: 0 }) < attendanceFor(s, { winPct: 0.7, starAppeal: 0.8 }));
});

test("ticket revenue is price x attendance x home games, in $M", () => {
  const s = createBusinessState({ teamId: "VAN", season: 1996, market: "small" });
  const rev = ticketRevenue(s, { winPct: 0.4, starAppeal: 0 });
  assert.ok(rev > 5 && rev < 40, `ticket revenue ${rev} $M should be 1996-plausible`);
});

test("sponsorship offers are deterministic; arena deal claws back on a losing season", () => {
  const a = sponsorshipOffers({ teamId: "VAN", season: 1996, seed: 7, winPct: 0.4 });
  const b = sponsorshipOffers({ teamId: "VAN", season: 1996, seed: 7, winPct: 0.4 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  const arena = a.find((o) => o.kind === "arena");
  assert.ok(arena.condition && arena.condition.minWinPct === 0.4);
  let s = createBusinessState({ teamId: "VAN", season: 1996, market: "small" });
  s = signSponsorship(s, arena);
  assert.throws(() => signSponsorship(s, arena), /already signed/);
  const full = sponsorshipRevenue(s, { winPct: 0.6 });
  const clawed = sponsorshipRevenue(s, { winPct: 0.2 });
  assert.equal(full, arena.value);
  assert.ok(clawed < full && clawed > 0);
});

test("star marketability and payroll read real cards", () => {
  assert.ok(starMarketability(star("VAN")) > 0.7);
  assert.ok(starMarketability(role("VAN", "r1")) < 0.1);
  assert.ok(teamStarAppeal(strongRoster("VAN"), "VAN") > teamStarAppeal(weakRoster("VAN"), "VAN"));
  const payroll = teamPayroll(strongRoster("VAN"), "VAN");
  assert.ok(payroll > teamPayroll(weakRoster("VAN"), "VAN"));
  assert.ok(payroll > 10 && payroll < 60, `payroll ${payroll} $M should be 1996-plausible`);
});

test("settleSeason: profit lands in the operating budget, winning lifts valuation and brand", () => {
  const players = strongRoster("VAN");
  const s = createBusinessState({ teamId: "VAN", season: 1996, market: "small" });
  const settled = settleSeason(s, { wins: 55, losses: 27, playoffRound: "conf-final", champion: false }, { players });
  assert.equal(settled.season, 1997);
  assert.equal(settled.history.length, 1);
  assert.equal(settled.history[0].season, 1996);
  assert.equal(settled.operatingBudget, 25 + settled.history[0].profit);
  assert.ok(settled.valuation > s.valuation);
  assert.ok(settled.brand > s.brand);
  const champ = settleSeason(s, { wins: 60, losses: 22, playoffRound: "finals", champion: true }, { players });
  assert.equal(champ.championships, 1);
  assert.ok(champ.valuation > settled.valuation);
  const bad = settleSeason(s, { wins: 15, losses: 67, playoffRound: null, champion: false }, { players: weakRoster("VAN") });
  assert.ok(bad.history[0].profit < settled.history[0].profit);
  assert.ok(bad.valuation < settled.valuation);
});

test("merch and valuation move with stars, wins and brand", () => {
  const s = createBusinessState({ teamId: "VAN", season: 1996, market: "small" });
  assert.ok(merchRevenue(s, { starAppeal: 0.9, winPct: 0.7 }) > merchRevenue(s, { starAppeal: 0, winPct: 0.2 }));
  assert.ok(teamValuation(s, { winPct: 0.7 }) > teamValuation(s, { winPct: 0.3 }));
});

test("setTicketPrice validates its range", () => {
  const s = createBusinessState({ teamId: "VAN", season: 1996 });
  assert.equal(setTicketPrice(s, 45).ticketPrice, 45);
  assert.throws(() => setTicketPrice(s, 1), /between \$5 and \$300/);
  assert.throws(() => setTicketPrice(s, 500), /between \$5 and \$300/);
});

test("arena actions: renovate, expand, relocate and rebrand all cost and have consequences", () => {
  let s = createBusinessState({ teamId: "VAN", season: 1996, market: "small", operatingBudget: 100 });
  const renovated = renovateArena(s);
  assert.equal(renovated.arena.level, 2);
  assert.equal(renovated.operatingBudget, 100 - 12);
  assert.throws(() => renovateArena(renovated), /already renovated/);
  const expanded = expandArena(renovated);
  assert.equal(expanded.arena.capacity, ARENA_CAPACITY_1996.VAN + 2500);
  assert.equal(expanded.operatingBudget, 100 - 12 - 30);
  assert.throws(() => renovateArena({ ...s, operatingBudget: 1 }), /cannot cover/);

  const moved = relocateTeam(s, { city: "拉斯维加斯", market: "mid", cost: 40 });
  assert.equal(moved.market, "mid");
  assert.equal(moved.teamName, "拉斯维加斯");
  assert.equal(moved.relocationHangover, 2);
  assert.ok(moved.fanLoyalty < s.fanLoyalty);
  assert.throws(() => relocateTeam(s, { city: "X", market: "huge" }), /valid market size/);

  const rebranded = rebrandTeam(s, { name: "温哥华鲸" });
  assert.equal(rebranded.teamName, "温哥华鲸");
  assert.ok(rebranded.fanLoyalty < s.fanLoyalty);
  assert.ok(rebranded.brand > s.brand);
});
