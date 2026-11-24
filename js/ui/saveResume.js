// What "continue from save" decides before it touches the page, as pure functions (B61 step 12). app.js (continueFromSave) keeps everything with
// a side effect: it reads the save, revives the career / legend / draft into `state`, then calls the one screen opener this module names.
//
// Moved out of app.js unchanged: same legacy fallbacks, same screen priority, same markup (i18n-phrases.js depends on the strings).
import { POS_SLOTS, franchiseName } from "../data/franchises.js";

/**
 * The app-level switches a save carries. A save from before the three-way auto toggles has one `managed` flag: it turns into all three.
 * (`timeoutTier` is normalised by the caller, which owns that rule.)
 */
export function resumeSettings(app) {
  const legacyManaged = !!app.managed;
  return {
    mode: app.mode,
    lastMode: app.lastMode || app.mode,
    speed: app.speed || 1,
    autoOffense: app.autoOffense != null ? !!app.autoOffense : legacyManaged,
    autoDefense: app.autoDefense != null ? !!app.autoDefense : legacyManaged,
    autoRotation: app.autoRotation != null ? !!app.autoRotation : legacyManaged,
  };
}

/**
 * Which screen a save resumes into. A game in flight wins over everything; a screen name only counts when the state it needs was revived.
 * `loaded` = { draft, pendingMatch, legend, career, tournament } as revived from the save (only their truthiness matters).
 * Returns "game" | "draft" | "setup" | "legend" | "market" | "tournament" | "incomplete".
 */
/**
 * A saved sim that already reached its final buzzer (4th quarter or later, clock out, not tied). Older builds saved
 * the finished game as a live one; resuming it replayed the ending and settled (paid) the game a second time.
 */
export function isFinishedSimSave(sim) {
  if (!sim || typeof sim !== "object") return false;
  const s = sim.score || {};
  return (Number(sim.quarter) || 1) >= 4 && Number(sim.clock ?? 1) <= 0 && Number(s.home) !== Number(s.away);
}

export function resumeRoute(data, loaded) {
  if (data.sim && !isFinishedSimSave(data.sim)) return "game";
  if (data.sim && loaded.career) return "market"; // its result is already settled: back to the run, not the replay
  const needs = { draft: loaded.draft, setup: loaded.pendingMatch, legend: loaded.legend, market: loaded.career, tournament: loaded.tournament };
  // A save is user data: only a real string that names one of these screens counts. ("constructor" / "toString" would pass an `in` test,
  // and ["draft"] coerces to the key "draft".)
  const screen = data.screen;
  return typeof screen === "string" && Object.hasOwn(needs, screen) && needs[screen] ? screen : "incomplete";
}

/** The franchise chips of a legend run (the eight franchises that run is drawn from). */
export function legendChipsHtml(franchises, lang) {
  return franchises
    .map((f) => `<span class="franchise-chip" data-id="${f.id}">${franchiseName(f, lang)} <small>${f.id}</small></span>`)
    .join("");
}

/** The position radios of a legend run, `checkedId` preselected. */
export function legendPosHtml(checkedId) {
  return POS_SLOTS.map(
    (s) => `<label><input type="radio" name="legend-pos" value="${s.id}" ${s.id === checkedId ? "checked" : ""}/> ${s.label}</label>`,
  ).join("");
}
