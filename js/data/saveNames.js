// Shared save-name guard (S-P1-1 defence in depth, extended by the 2026-11-19 esc audit):
// team / player / coach names reach innerHTML in several season views, so a save whose
// names carry markup is refused at load/import rather than trusted. Legitimate names
// never contain < or > and are far shorter than 60 chars; the user-editable names
// (custom team name, gameplan style) are sanitised on entry, so no save made through
// the UI can trip this. One helper serves every season-shaped save: the career root
// (saveRoot.js), the quick-season slot (loadSeason) and the My Team season slot
// (validMyTeamSeason) — plus the two derived name slots that reach the same render
// paths via seasonLabelOf, st.customNames and st.league.labels, which a crafted save
// could otherwise poison without touching a team name. Dependency-free on purpose:
// the engine and the data layer both import it, so it must not pull in career code.
const MAX_SAVE_NAME_LENGTH = 60;

export function isSafeDisplayName(value) {
  return typeof value === "string" && value.length <= MAX_SAVE_NAME_LENGTH && !/[<>]/.test(value);
}

function checkNames(names, message) {
  for (const name of names) {
    if (name !== undefined && !isSafeDisplayName(name)) {
      throw new Error(message);
    }
  }
}

export function validateSeasonNames(season, message = "invalid season names") {
  if (!season || typeof season !== "object") return;
  const teams = season.teams;
  if (teams && typeof teams === "object") {
    for (const team of Object.values(teams)) {
      if (!team || typeof team !== "object") continue;
      checkNames([team.name], message);
      if (Array.isArray(team.players)) {
        checkNames(team.players.map((p) => p?.name), message);
      }
      if (team.coach && typeof team.coach === "object") {
        checkNames([team.coach.name, team.coach.style], message);
      }
    }
  }
  if (season.customNames && typeof season.customNames === "object") {
    checkNames(Object.values(season.customNames), message);
  }
  if (season.league?.labels && typeof season.league.labels === "object") {
    checkNames(Object.values(season.league.labels), message);
  }
}
