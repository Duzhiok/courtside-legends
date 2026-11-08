export function isManagedCareer(career) {
  return Boolean(
    career &&
      typeof career === "object" &&
      career.management &&
      typeof career.management === "object" &&
      !Array.isArray(career.management),
  );
}

export function careerForPersistence(career, season) {
  if (!career) return null;
  const preserveDraft =
    isManagedCareer(career) &&
    career.phase === "draft" &&
    season?.phase === "done";
  return {
    ...career,
    phase: preserveDraft ? "draft" : (season?.phase ?? career.phase),
    season: season ?? career.season,
  };
}

export function runCareerTransition(currentCareer, transition) {
  if (!currentCareer || typeof transition !== "function") {
    throw new TypeError("current career and transition function are required");
  }
  return transition(structuredClone(currentCareer));
}

// B19: season/career phase ids (regular | awards | playoffs | done | draft)
// must never leak into UI text verbatim — map them to readable labels.
const SEASON_PHASE_LABELS = {
  draft: { zh: "选秀", en: "Draft" },
  regular: { zh: "常规赛", en: "Regular Season" },
  awards: { zh: "评奖", en: "Awards" },
  playoffs: { zh: "季后赛", en: "Playoffs" },
  done: { zh: "已结束", en: "Finished" },
};

export function seasonPhaseLabel(phase, lang = "zh") {
  const entry = SEASON_PHASE_LABELS[phase];
  if (!entry) return "—";
  return lang === "en" ? entry.en : entry.zh;
}
