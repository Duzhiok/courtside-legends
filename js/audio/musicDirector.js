/**
 * Chooses the music from what is actually happening. The pure helpers (eraOf, sceneForScreen, gameIntensity,
 * trackIdFor) hold all the rules and are unit-tested; `createDirector` only adds hysteresis and calls the player.
 * Never touches GameSim: it only reads the snapshot the UI already receives.
 */

export const eraOf = (year) => {
  const y = Number(year);
  if (!Number.isFinite(y)) return "modern";
  if (y < 1980) return "70s";
  if (y < 1990) return "80s";
  if (y < 2000) return "90s";
  if (y < 2010) return "00s";
  return "modern";
};

const HOME_TAB_SCENE = { world: "world", players: "team", career: "career", custom: "play" };
const SCREEN_SCENE = {
  home: null, // decided by the active home tab
  account: "team", onboard: "team", myTeamLineup: "team", collection: "team", draw: "team", credits: "world",
  draft: "team", market: "career", season: "career", timeTravel: "career", tournament: "play",
  customHub: "play", legend: "play", setup: "play", sandbox: "play", familyDuel: "play",
  game: "game", clutch: "game", clutchPlay: "game", clutchResult: "arena", clutch3d: "game", result: "arena",
};

/** Which musical scene a screen belongs to. Unknown screens keep whatever is playing (returns undefined). */
export function sceneForScreen(name, { homeTab = "career" } = {}) {
  if (name === "home") return HOME_TAB_SCENE[homeTab] || "career";
  return SCREEN_SCENE[name];
}

export const INTENSITY_RANK = { arena: 0, tension: 1, clutch: 2 };

/** Arena by default; tension in a close 4th quarter/OT; clutch in the final 30s of a one-possession game. */
export function gameIntensity(snap) {
  if (!snap?.score) return "arena";
  const diff = Math.abs((snap.score.home || 0) - (snap.score.away || 0));
  const late = (snap.quarter || 1) >= 4;
  if (late && Number(snap.clock) <= 30 && diff <= 3) return "clutch";
  if (late && diff <= 8) return "tension";
  return "arena";
}

/** scene (+era, +intensity) -> synth track id. `files` lets real recorded tracks override a scene. */
export function trackIdFor({ scene, era = "modern", intensity = "arena" }, files = {}) {
  const key = scene === "career" ? `career_${era}` : scene === "game" ? `game_${intensity}` : scene === "arena" ? "game_arena" : null;
  const id = key || { world: "world_chill", team: "team_hype", play: "play_upbeat" }[scene] || "world_chill";
  return files[id] || files[scene] || id;
}

export function createDirector({ player, resolve, now = () => Date.now(), holdMs = 8000 }) {
  let scene = null;
  let era = "modern";
  let intensity = "arena";
  let changedAt = 0;
  let wanted = null;

  const refresh = () => {
    if (!scene || player.mode() !== "dynamic") return;
    const id = trackIdFor({ scene, era, intensity }, player.files?.() || {});
    if (id === wanted) return; // same music: do not restart it on every re-render
    wanted = id;
    player.play(resolve(id), { fade: scene === "game" ? 1.2 : 1.8 });
  };

  return {
    setScene(next, { year } = {}) {
      if (next === undefined) return;
      if (year != null) era = eraOf(year);
      if (next !== "game") intensity = "arena";
      if (next === scene && year == null) return;
      scene = next;
      refresh();
    },
    setEra(year) { const e = eraOf(year); if (e !== era) { era = e; refresh(); } },
    /** Escalate at once; calm down only after `holdMs` so the music never flaps with the score. */
    onGameSnapshot(snap) {
      if (scene !== "game") return;
      const next = gameIntensity(snap);
      if (next === intensity) return;
      const up = INTENSITY_RANK[next] > INTENSITY_RANK[intensity];
      if (!up && now() - changedAt < holdMs) return;
      intensity = next;
      changedAt = now();
      refresh();
    },
    /** Called when the mode changes (dynamic <-> playlist <-> off). */
    reset() { wanted = null; refresh(); },
    state: () => ({ scene, era, intensity, wanted }),
  };
}
