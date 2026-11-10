/**
 * Player Voice context: which screen the player was on when they opened feedback, and the module that screen most
 * likely means. It only PRE-FILLS the module picker; the player can always change it, and it is never stored as truth.
 * Keys are the real <main id> values in index.html.
 */
const BY_SCREEN = {
  "screen-account": "account",
  "screen-onboard": "account",
  "screen-collection": "account",
  "screen-draw": "account",
  "screen-my-team-lineup": "myteam",
  "screen-sandbox": "custom",
  "screen-custom-hub": "custom",
  "screen-family-duel": "custom",
  "screen-draft": "custom",
  "screen-legend": "custom",
  "screen-tournament": "custom",
  "screen-time-travel": "career",
  "screen-market": "career",
  "screen-clutch": "gameplay",
  "screen-clutch-play": "gameplay",
  "screen-clutch-result": "gameplay",
  "screen-clutch-3d": "gameplay",
  "screen-setup": "gameplay",
  "screen-game": "gameplay",
  "screen-result": "gameplay",
};
const BY_HOME_TAB = { world: "world", players: "myteam", career: "career", custom: "custom" };

/**
 * screenId: id of the active screen. hint: the active home tab (on the home screen) or the current game mode
 * (on screen-season, which both the career and My Team seasons use). Unknown -> "game" (the whole game).
 */
export function moduleForScreen(screenId, hint = "") {
  const id = String(screenId || "");
  if (id === "screen-home") return BY_HOME_TAB[hint] || "game";
  if (id === "screen-season") return /my.?team/i.test(String(hint)) ? "myteam" : "career";
  return BY_SCREEN[id] || "game";
}
