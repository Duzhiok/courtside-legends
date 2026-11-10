/**
 * Ownership — personal wealth, equity, debt and acquisition (workstream F, user-approved
 * 2026-11-10).
 *
 * PERSONAL wealth and the FRANCHISE operating budget are SEPARATE objects and never mix
 * except through the defined flows:
 *   salary -> personal cash (once a season) | dividends -> personal cash (from team profit)
 *   personal cash -> equity purchases | personal cash -> investments
 * Team revenue never flows to personal cash, and personal cash never pays team costs.
 *
 * Money in $M. Personal investment returns REUSE finance.js (rollInvestmentReturn /
 * investmentForecast / availableAssetClasses) — the coach-money module already solved
 * single-season bets; this module only adds the equity/debt layer on top of it.
 *
 * The coach-profile cash is only a SEED: personalCashFromCoach() converts it once when an
 * executive career attaches to a real career root (1 abstract cash unit = $0.2M, so the
 * base salary of 5 becomes $1.0M/yr — a plausible 1996 GM salary, labelled a simulated
 * parameter). After seeding, the executive personal ledger is the source of truth, so
 * settleCoachFinances() never double-pays the salary.
 *
 * Failure is a story, not a Game Over: overdue debt forces an equity sale at a discount,
 * and with nothing left to sell the career restarts at a small-market team (the caller
 * turns the `dismissal` flag into the new chapter).
 */
import { availableAssetClasses, investmentForecast, rollInvestmentReturn } from "../finance.js";
import { ensureCoachProfile } from "../coachProfile.js";

/** 1 abstract coach-profile cash unit = $0.2M (simulated parameter, see header). */
export const PERSONAL_CASH_UNIT_M = 0.2;
/** Share of team profit paid out as dividends to equity holders. */
export const DIVIDEND_PAYOUT = 0.4;
/** Forced-sale discount: distressed equity sells below market. */
export const FORCED_SALE_DISCOUNT = 0.7;
/** Control premium is defined in executiveProgression.js (single source). */
export { CONTROL_PREMIUM } from "./executiveProgression.js";

export function createPersonalLedger({ cash = 0, salary = 0.8 } = {}) {
  return {
    cash: Math.round(cash * 100) / 100,
    salary,
    investments: [], // pending { assetId, amount, placedYear }
    equity: [], // { teamId, pct, costBasis, acquiredSeason }
    debt: null, // { principal, rate, dueSeason, seasonsOverdue }
    dividendsEarned: 0,
  };
}

/** One-time seed from a real career root's coach profile. */
export function personalCashFromCoach(root) {
  const coach = ensureCoachProfile(root);
  return Math.round((coach?.cash ?? 0) * PERSONAL_CASH_UNIT_M * 100) / 100;
}

/** Annual salary credit. */
export function paySalary(ledger) {
  return { ...ledger, cash: Math.round((ledger.cash + ledger.salary) * 100) / 100 };
}

export function investPersonal(ledger, assetId, amount, year) {
  if (!availableAssetClasses(year).some((a) => a.id === assetId)) {
    throw new RangeError(`asset ${assetId} is not available in ${year}`);
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > ledger.cash) {
    throw new Error("investment amount must be positive and affordable");
  }
  return {
    ...ledger,
    cash: Math.round((ledger.cash - amount) * 100) / 100,
    investments: [...ledger.investments, { assetId, amount, placedYear: year }],
  };
}

/** Resolve pending personal investments at the next settlement (reuses finance.js rolls). */
export function settlePersonalInvestments(ledger, year, rng = Math.random) {
  let cash = ledger.cash;
  const settled = [];
  for (const position of ledger.investments) {
    const roll = rollInvestmentReturn(position.assetId, rng);
    const proceeds = Math.round(position.amount * (1 + roll) * 100) / 100;
    cash = Math.round((cash + proceeds) * 100) / 100;
    settled.push({ ...position, roll: Math.round(roll * 1000) / 1000, proceeds });
  }
  return { ledger: { ...ledger, cash, investments: [] }, settled, year };
}

/** Preview before investing: the advertised return, blurred by timeline divergence. */
export function personalInvestmentPreview(assetId, divergence, rng = Math.random) {
  return investmentForecast(assetId, divergence, rng);
}

export function equityPct(ledger, teamId) {
  return ledger.equity.filter((e) => e.teamId === teamId).reduce((sum, e) => sum + e.pct, 0);
}

export function buyEquity(ledger, { teamId, pct, pricePerPct, season }) {
  if (!teamId || pct <= 0 || equityPct(ledger, teamId) + pct > 100) {
    throw new RangeError("invalid equity purchase");
  }
  const cost = Math.round(pct * pricePerPct * 100) / 100;
  if (ledger.cash < cost) throw new Error("not enough personal cash for this equity");
  return {
    ...ledger,
    cash: Math.round((ledger.cash - cost) * 100) / 100,
    equity: [...ledger.equity, { teamId, pct, costBasis: cost, acquiredSeason: season }],
  };
}

export function sellEquity(ledger, { teamId, pct, pricePerPct }) {
  const held = equityPct(ledger, teamId);
  if (pct <= 0 || pct > held) throw new RangeError("cannot sell more equity than held");
  const proceeds = Math.round(pct * pricePerPct * 100) / 100;
  let remaining = pct;
  const equity = [];
  for (const entry of ledger.equity) {
    if (entry.teamId !== teamId || remaining <= 0) {
      equity.push(entry);
      continue;
    }
    const take = Math.min(entry.pct, remaining);
    remaining -= take;
    const keptPct = entry.pct - take;
    if (keptPct > 0) equity.push({ ...entry, pct: keptPct, costBasis: Math.round((entry.costBasis * keptPct) / entry.pct * 100) / 100 });
  }
  return { ...ledger, cash: Math.round((ledger.cash + proceeds) * 100) / 100, equity };
}

/** One outstanding loan at a time: borrow now, repay by dueSeason. */
export function takeLoan(ledger, { amount, rate, dueSeason }) {
  if (ledger.debt) throw new Error("an outstanding loan must be repaid first");
  if (!Number.isFinite(amount) || amount <= 0) throw new RangeError("loan amount must be positive");
  return {
    ...ledger,
    cash: Math.round((ledger.cash + amount) * 100) / 100,
    debt: { principal: amount, rate, dueSeason, seasonsOverdue: 0 },
  };
}

export function repayLoan(ledger, amount) {
  if (!ledger.debt) throw new Error("no outstanding loan");
  if (!Number.isFinite(amount) || amount <= 0 || amount > ledger.cash) {
    throw new Error("repayment must be positive and affordable");
  }
  const principal = Math.round((ledger.debt.principal - amount) * 100) / 100;
  return {
    ...ledger,
    cash: Math.round((ledger.cash - amount) * 100) / 100,
    debt: principal <= 0 ? null : { ...ledger.debt, principal },
  };
}

/** Interest accrues each season past the due date; the debt grows, never forgives itself. */
export function accrueDebt(ledger, season) {
  if (!ledger.debt || season <= ledger.debt.dueSeason) return ledger;
  const principal = Math.round(ledger.debt.principal * (1 + ledger.debt.rate) * 100) / 100;
  return { ...ledger, debt: { ...ledger.debt, principal, seasonsOverdue: ledger.debt.seasonsOverdue + 1 } };
}

/**
 * Buy control: reach 51% from the current holding. Cost is the remaining shares at the
 * control premium. Cash covers what it can; the shortfall is financed with a loan (the
 * debt is the risk). Requires at least 25% equity first — nobody hands a franchise to a
 * stranger. `loanCapacity` caps how much the bank will lend against the team.
 */
export function acquireControl(ledger, { teamId, valuation, season, loanCapacity = 20, rate = 0.08 } = {}) {
  const held = equityPct(ledger, teamId);
  if (held < 25) throw new Error("need at least 25% equity before acquiring control");
  const pricePerPct = valuation / 100;
  const needed = Math.max(0, 51 - held);
  const cost = Math.round(needed * pricePerPct * 1.25 * 100) / 100;
  const shortfall = Math.round((cost - ledger.cash) * 100) / 100;
  if (shortfall > loanCapacity) throw new Error("cannot finance the control purchase");
  let next = ledger;
  if (shortfall > 0) next = takeLoan(next, { amount: shortfall, rate, dueSeason: season + 3 });
  next = buyEquity(next, { teamId, pct: needed, pricePerPct: pricePerPct * 1.25, season });
  return { ledger: next, control: true, cost, financed: Math.max(0, shortfall) };
}

/** Dividends: 40% of a profitable season's profit, pro-rata to the holding. */
export function payDividends(ledger, { teamId, profit }) {
  const pct = equityPct(ledger, teamId);
  if (profit <= 0 || pct <= 0) return { ledger, dividends: 0 };
  const dividends = Math.round((profit * pct) / 100 * DIVIDEND_PAYOUT * 100) / 100;
  return {
    ledger: { ...ledger, cash: Math.round((ledger.cash + dividends) * 100) / 100, dividendsEarned: Math.round((ledger.dividendsEarned + dividends) * 100) / 100 },
    dividends,
  };
}

/**
 * Forced sale: debt is overdue and the owner cannot cover even one season's interest.
 * Equity sells at a 30% discount to cover the debt; if there is no equity left, the
 * career ends in dismissal — the caller turns `dismissal` into a restart at a
 * small-market team, a new story, never a plain Game Over.
 */
export function forcedSaleCheck(ledger, { teamId, pricePerPct, season }) {
  if (!ledger.debt || season <= ledger.debt.dueSeason) return { ledger, forced: false };
  const interest = Math.round(ledger.debt.principal * ledger.debt.rate * 100) / 100;
  if (ledger.cash >= interest) return { ledger, forced: false };
  const held = equityPct(ledger, teamId);
  if (held <= 0) return { ledger, forced: true, kind: "dismissal", sold: 0, proceeds: 0 };
  const sellPct = Math.min(held, Math.ceil((ledger.debt.principal / (pricePerPct * FORCED_SALE_DISCOUNT)) * 10) / 10);
  const sold = sellEquity(ledger, { teamId, pct: sellPct, pricePerPct: pricePerPct * FORCED_SALE_DISCOUNT });
  const next = sold.cash >= ledger.debt.principal
    ? { ...sold, cash: Math.round((sold.cash - ledger.debt.principal) * 100) / 100, debt: null }
    : { ...sold, debt: { ...ledger.debt, principal: Math.round((ledger.debt.principal - sold.cash) * 100) / 100, seasonsOverdue: ledger.debt.seasonsOverdue + 1 } };
  return {
    ledger: next,
    forced: true,
    kind: "equity-sale",
    sold: sellPct,
    proceeds: Math.round(sellPct * pricePerPct * FORCED_SALE_DISCOUNT * 100) / 100,
  };
}
