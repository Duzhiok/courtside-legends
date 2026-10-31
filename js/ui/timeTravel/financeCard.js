/**
 * E3: the personal-finance card (cash, salary, home, one-season investments). financeModel() is the
 * pure "what does the card show" function; the controller part runs the buy / invest clicks.
 * Split out of screen.js, which had grown past the size limit.
 */
import { ensureCoachProfile } from "../../career/coachProfile.js";
import { INVESTMENT_STAKE } from "../../career/balance.js";
import {
  availableAssetClasses, buyHouse, canAffordHouse, canAffordInvestment, currentCoachSalary, houseTiers,
  investmentForecast, placeInvestment,
} from "../../career/finance.js";
import { ASSET_LABELS_EN, HOUSE_LABELS_EN } from "./copy.js";
import { $ } from "./dom.js";
import { tr } from "./format.js";
import { paintFinance, paintKpis } from "./paint.js";
import { kpiModel } from "./viewModel.js";

export function financeModel(root, l) {
  const coach = ensureCoachProfile(root);
  const tiers = houseTiers();
  const divergence = root.story?.timelineDivergence ?? 0;
  const pending = new Map();
  for (const position of coach.pendingInvestments || []) {
    pending.set(position.assetId, (pending.get(position.assetId) || 0) + position.amount);
  }
  const houseName = (id) => (l === "en" ? HOUSE_LABELS_EN[id] : null) ?? tiers[id].label;
  return {
    cash: Math.round(coach.cash ?? 0),
    salary: currentCoachSalary(root),
    housingLabel: tiers[coach.housing] ? houseName(coach.housing) : "",
    houses: Object.entries(tiers).map(([id, tier]) => ({
      id, label: houseName(id), cost: tier.cost, moodBonus: tier.moodBonus,
      owned: coach.housing === id, affordable: canAffordHouse(coach, id),
    })),
    investments: availableAssetClasses(root.leagueCareer?.season?.year).map((asset) => ({
      id: asset.id,
      label: (l === "en" ? ASSET_LABELS_EN[asset.id] : null) ?? asset.label,
      forecast: investmentForecast(asset.id, divergence),
      stake: INVESTMENT_STAKE,
      pending: pending.get(asset.id) || 0,
      affordable: canAffordInvestment(coach, INVESTMENT_STAKE),
    })),
  };
}

export function createFinanceCard({ lang, commit, currentRootState }) {
  function financeAction(build, failure) {
    try {
      const root = currentRootState();
      commit({ ...root, coach: build(ensureCoachProfile(root), root) }, failure, { full: false });
      paintFinance(financeModel(currentRootState(), lang()), lang());
      paintKpis(kpiModel(currentRootState()), lang());
    } catch (error) {
      alert(error?.message || failure);
    }
  }

  function render(root) {
    paintFinance(financeModel(root, lang()), lang());
  }

  function wire() {
    $("#time-travel-house-list")?.addEventListener("click", (event) => {
      const id = event.target.closest("[data-house]")?.dataset.house;
      if (id) financeAction((coach) => buyHouse(coach, id), tr(lang(), "无法买这套房子", "Couldn't buy that home"));
    });
    $("#time-travel-invest-list")?.addEventListener("click", (event) => {
      const id = event.target.closest("[data-asset]")?.dataset.asset;
      if (id) {
        financeAction(
          (coach, root) => placeInvestment(coach, id, INVESTMENT_STAKE, root.leagueCareer?.season?.year),
          tr(lang(), "无法完成这笔投资", "Couldn't place that investment"),
        );
      }
    });
  }

  return { render, wire };
}
