import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_PREMIUM,
  DIVIDEND_PAYOUT,
  PERSONAL_CASH_UNIT_M,
  acquireControl,
  accrueDebt,
  buyEquity,
  createPersonalLedger,
  equityPct,
  forcedSaleCheck,
  investPersonal,
  payDividends,
  paySalary,
  personalCashFromCoach,
  repayLoan,
  sellEquity,
  settlePersonalInvestments,
  takeLoan,
} from "../js/career/gm/ownership.js";
import {
  CONTROL_MIN_EQUITY,
  MINORITY_PCT,
  createExecutiveRecord,
  recordSeasonAchievements,
  settleEmpireLegacy,
  stageFor,
  stageLabel,
  stageOpportunities,
} from "../js/career/gm/executiveProgression.js";

const rich = (cash = 50) => createPersonalLedger({ cash, salary: 0.8 });

test("personal ledger: salary pays into personal cash, never into team money", () => {
  const l = paySalary(rich(10));
  assert.equal(l.cash, 10.8);
  assert.equal(l.salary, 0.8);
  assert.equal(personalCashFromCoach({ coach: { cash: 10 } }), 10 * PERSONAL_CASH_UNIT_M);
  assert.equal(personalCashFromCoach({}), 0);
});

test("personal investments reuse the coach finance rolls: a fixed rng pays the base return", () => {
  const l = investPersonal(rich(20), "blue-chip", 10, 1996);
  assert.equal(l.cash, 10);
  assert.equal(l.investments.length, 1);
  assert.throws(() => investPersonal(rich(5), "blue-chip", 10, 1996), /affordable/);
  assert.throws(() => investPersonal(rich(20), "crypto", 10, 1996), /not available in 1996/);
  // rng() = 0.5 -> roll = baseReturn exactly (0.08 for blue-chip).
  const { ledger, settled } = settlePersonalInvestments(l, 1997, () => 0.5);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].roll, 0.08);
  assert.equal(ledger.cash, 10 + 10 * 1.08);
  assert.equal(ledger.investments.length, 0);
});

test("equity: buy, hold, sell; personal cash only; never above 100%", () => {
  let l = buyEquity(rich(50), { teamId: "VAN", pct: 5, pricePerPct: 1.5, season: 1996 });
  assert.equal(l.cash, 50 - 7.5);
  assert.equal(equityPct(l, "VAN"), 5);
  assert.throws(() => buyEquity(l, { teamId: "VAN", pct: 96, pricePerPct: 1.5, season: 1996 }), /invalid equity/);
  assert.throws(() => buyEquity(rich(1), { teamId: "VAN", pct: 5, pricePerPct: 1.5, season: 1996 }), /not enough personal cash/);
  l = sellEquity(l, { teamId: "VAN", pct: 2, pricePerPct: 2 });
  assert.equal(l.cash, 50 - 7.5 + 4);
  assert.equal(equityPct(l, "VAN"), 3);
  assert.throws(() => sellEquity(l, { teamId: "VAN", pct: 9, pricePerPct: 2 }), /more equity than held/);
});

test("loans: one at a time, interest accrues past the due season, repay clears", () => {
  let l = takeLoan(rich(10), { amount: 20, rate: 0.1, dueSeason: 1997 });
  assert.equal(l.cash, 30);
  assert.throws(() => takeLoan(l, { amount: 5, rate: 0.1, dueSeason: 1998 }), /repaid first/);
  l = accrueDebt(l, 1997);
  assert.equal(l.debt.principal, 20, "no interest before the due season");
  l = accrueDebt(l, 1998);
  assert.equal(l.debt.principal, 22);
  assert.equal(l.debt.seasonsOverdue, 1);
  l = repayLoan(l, 22);
  assert.equal(l.debt, null);
  assert.equal(l.cash, 30 - 22);
});

test("acquireControl: needs 25% first, premium price, shortfall is financed, never unaffordable", () => {
  const poor = buyEquity(rich(40), { teamId: "VAN", pct: 10, pricePerPct: 1.5, season: 1996 });
  assert.throws(() => acquireControl(poor, { teamId: "VAN", valuation: 150, season: 1996 }), /at least 25%/);
  let l = buyEquity(rich(100), { teamId: "VAN", pct: 30, pricePerPct: 1.5, season: 1996 });
  // 21% left to 51% at $1.5M x 1.25 premium = $39.4M; cash after buying 30% is $55M, no loan needed.
  const done = acquireControl(l, { teamId: "VAN", valuation: 150, season: 1997, loanCapacity: 20 });
  assert.equal(done.control, true);
  assert.equal(equityPct(done.ledger, "VAN"), 51);
  assert.equal(done.financed, 0);
  // Financed case: cash short of the control price, loan covers the gap.
  let l2 = buyEquity(rich(60), { teamId: "VAN", pct: 30, pricePerPct: 1.5, season: 1996 });
  const financed = acquireControl(l2, { teamId: "VAN", valuation: 150, season: 1997, loanCapacity: 40 });
  assert.equal(financed.control, true);
  assert.ok(financed.financed > 0);
  assert.ok(financed.ledger.debt);
  assert.equal(financed.ledger.debt.principal, financed.financed);
  // Unaffordable even with the loan cap.
  let l3 = buyEquity(rich(60), { teamId: "VAN", pct: 30, pricePerPct: 1.5, season: 1996 });
  assert.throws(() => acquireControl(l3, { teamId: "VAN", valuation: 400, season: 1997, loanCapacity: 20 }), /cannot finance/);
});

test("dividends: 40% of a profitable season, pro-rata; nothing on a loss", () => {
  let l = buyEquity(rich(50), { teamId: "VAN", pct: 10, pricePerPct: 1.5, season: 1996 });
  const { ledger, dividends } = payDividends(l, { teamId: "VAN", profit: 10 });
  assert.equal(dividends, 10 * 0.1 * DIVIDEND_PAYOUT);
  assert.equal(ledger.cash, 50 - 15 + dividends);
  assert.equal(payDividends(l, { teamId: "VAN", profit: -5 }).dividends, 0);
});

test("forced sale: overdue debt sells equity at a discount; nothing left means dismissal, not Game Over", () => {
  let l = buyEquity(rich(50), { teamId: "VAN", pct: 10, pricePerPct: 1.5, season: 1996 });
  l = takeLoan(l, { amount: 20, rate: 0.1, dueSeason: 1997 });
  // Not overdue yet: no forced sale.
  assert.equal(forcedSaleCheck(l, { teamId: "VAN", pricePerPct: 1.5, season: 1997 }).forced, false);
  // Overdue, but cash covers the interest: still no forced sale.
  const flush = { ...l, cash: 5 };
  assert.equal(forcedSaleCheck(flush, { teamId: "VAN", pricePerPct: 1.5, season: 1998 }).forced, false);
  // Overdue and broke: equity sells at the 30% discount.
  const broke = { ...l, cash: 0.5 };
  const sale = forcedSaleCheck(broke, { teamId: "VAN", pricePerPct: 1.5, season: 1998 });
  assert.equal(sale.forced, true);
  assert.equal(sale.kind, "equity-sale");
  assert.ok(sale.sold > 0 && sale.sold <= 10);
  assert.ok(equityPct(sale.ledger, "VAN") < 10);
  // No equity at all, and the loan money already spent: dismissal flag for the caller
  // to restart the story elsewhere.
  const noEquity = { ...takeLoan(rich(0.5), { amount: 20, rate: 0.1, dueSeason: 1997 }), cash: 0.5 };
  const dismissed = forcedSaleCheck(noEquity, { teamId: "VAN", pricePerPct: 1.5, season: 1998 });
  assert.equal(dismissed.forced, true);
  assert.equal(dismissed.kind, "dismissal");
});

test("stages derive from the record: GM -> president -> minority -> controlling -> mogul", () => {
  const exec = createExecutiveRecord();
  assert.equal(stageFor(exec), "gm");
  const pres = recordSeasonAchievements({ ...exec, boardTrust: 70 }, { wins: 45, losses: 37, playoffRound: "first-round" });
  assert.equal(stageFor(pres), "president");
  assert.equal(stageFor({ ...exec, equityPct: 5 }), "minority");
  assert.equal(stageFor({ ...exec, equityPct: 30, control: true }), "controlling");
  assert.equal(stageFor({ ...exec, equityPct: 55, control: true }), "mogul");
  assert.equal(stageFor({ ...exec, control: true, secondAsset: true }), "mogul");
  assert.equal(stageFor({ ...exec, settled: { score: 1 } }), "legacy");
  assert.equal(stageLabel("minority", "en"), "Minority Owner");
});

test("opportunities are offered, never automatic, and list what is missing", () => {
  const exec = createExecutiveRecord({ reputation: 70, boardTrust: 70 });
  const opps = stageOpportunities(exec, { wealth: 100, valuation: 150, loanCapacity: 20 });
  const minority = opps.find((o) => o.id === "minority-offer");
  assert.equal(minority.available, true, "wealth + reputation + trust meet the minority bar");
  assert.equal(minority.cost, MINORITY_PCT * 1.5);
  const control = opps.find((o) => o.id === "control-offer");
  assert.equal(control.available, false);
  assert.ok(control.missing.some((m) => m.includes(`${CONTROL_MIN_EQUITY}%`)));
  const broke = stageOpportunities(createExecutiveRecord({ reputation: 30, boardTrust: 30 }), { wealth: 1, valuation: 150 });
  assert.equal(broke.find((o) => o.id === "minority-offer").available, false);
  assert.ok(broke.find((o) => o.id === "minority-offer").missing.length >= 2);
});

test("empire legacy settles wealth, equity value, titles and years — never a Game Over", () => {
  const exec = { ...createExecutiveRecord({ reputation: 80 }), equityPct: 20, achievements: { championships: 2, playoffRuns: 5, winningSeasons: 6 } };
  const settled = settleEmpireLegacy(exec, { wealth: 120, valuation: 300, years: 12 });
  assert.equal(settled.equityValue, 60);
  assert.equal(settled.championships, 2);
  assert.ok(settled.score >= 90, `legacy score ${settled.score} should clear Basketball Immortal`);
  assert.equal(settled.title.zh, "篮球不朽");
  const mid = settleEmpireLegacy(
    { ...createExecutiveRecord({ reputation: 60 }), equityPct: 10, achievements: { championships: 1, playoffRuns: 3, winningSeasons: 4 } },
    { wealth: 40, valuation: 200, years: 8 },
  );
  assert.equal(mid.title.zh, "王朝缔造者");
  const small = settleEmpireLegacy(createExecutiveRecord(), { wealth: 2, valuation: 150, years: 3 });
  assert.equal(small.title.zh, "球队建设者");
});
