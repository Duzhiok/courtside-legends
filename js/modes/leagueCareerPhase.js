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

export function attemptCareerTransition(currentCareer, transition, persist) {
  if (typeof persist !== "function") {
    throw new TypeError("persist function is required");
  }
  const nextCareer = runCareerTransition(currentCareer, transition);
  return persist(nextCareer)
    ? { ok: true, career: nextCareer }
    : { ok: false, career: currentCareer };
}
