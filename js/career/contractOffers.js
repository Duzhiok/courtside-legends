/**
 * The renewal menu: what a signed extension is (years / salary / authority / perks / effects) and how it
 * reads in each language. Kept out of careerContract.js so the rules and the wording have one home each,
 * and keyed by offer id so a save written before the English text existed still renders in English.
 */

// B3 of the roadmap: the menu is sized to the actual tenure, not a fixed two-option pair for
// everyone. trial-extension and dynasty-extension are the new floor/ceiling; rebuild-extension and
// contender-extension are untouched so every save/test built around those two ids keeps working.
export const OFFER_TEMPLATES = [
  {
    id: "trial-extension",
    title: "试用续约",
    description: "战绩和目标完成度都不够亮眼，老板只愿意给一年观察期——证明自己才能换来下一份合同。",
    years: 1,
    salary: 4,
    authority: 30,
    privileges: [],
    effects: { trust: -2, pressure: 10, divergence: 1 },
  },
  {
    id: "rebuild-extension",
    title: "重建续约",
    description: "老板愿意给你长期时间和更大权限，但薪资保守。",
    years: 4,
    salary: 7,
    authority: 88,
    privileges: ["自定义训练计划", "发展联盟优先权"],
    effects: { trust: 5, pressure: -4, divergence: 2 },
  },
  {
    id: "contender-extension",
    title: "争冠续约",
    description: "更高薪资和更大预算，但每年都必须证明自己配得上争冠窗口。",
    years: 2,
    salary: 13,
    authority: 54,
    privileges: ["额外教练预算", "季中补强额度"],
    effects: { trust: 3, pressure: 8, divergence: 5 },
  },
  {
    id: "dynasty-extension",
    title: "王朝续约",
    description: "你已经证明自己能带队夺冠——老板给你近乎无限的信任、预算和人事权。",
    years: 5,
    salary: 20,
    authority: 96,
    privileges: ["完全人事决定权", "顶薪续约优先权", "专属训练设施预算"],
    effects: { trust: 8, pressure: 2, divergence: 8 },
  },
];

const OFFER_TEXT_EN = {
  "trial-extension": { title: "Trial Extension", description: "Your record and goal results aren't convincing. The owner will only give you a one-year audition — prove yourself to earn the next contract.", privileges: [] },
  "rebuild-extension": { title: "Rebuild Extension", description: "The owner offers long-term time and wide authority, but a conservative salary.", privileges: ["Custom training plan", "Development-league priority"] },
  "contender-extension": { title: "Contender Extension", description: "A bigger salary and budget, but you must justify the title window every single year.", privileges: ["Extra coaching budget", "In-season reinforcement allowance"] },
  "dynasty-extension": { title: "Dynasty Extension", description: "You've proven you can win titles — the owner gives you near-total trust, budget and personnel control.", privileges: ["Full personnel control", "Max-contract renewal priority", "Dedicated training-facility budget"] },
};

/**
 * An offer's wording in `lang`. Reads by id from the templates (never from the strings stored on the
 * offer, which an old save holds in Chinese only); an id the game doesn't know falls back to the offer's
 * own fields rather than going blank.
 */
export function offerText(offer, lang = "zh") {
  const template = OFFER_TEMPLATES.find((candidate) => candidate.id === offer?.id);
  const source = template || offer || {};
  if (lang === "en" && template) return { ...OFFER_TEXT_EN[template.id] };
  return {
    title: source.title || "",
    description: source.description || "",
    privileges: [...(source.privileges || [])],
  };
}
