/** Photos the game must never show as a player's picture. Pure data + one predicate. */

/**
 * Scraped Commons files that are NOT a portrait of that player: objects, buildings,
 * paintings, a bus station, someone else. The scraper matched on file names, so
 * these slipped in (e.g. LeBron's 2000s card was a bus-station platform).
 * Matched against the decoded URL; a card that loses its era photo falls back to
 * the NBA CDN headshot. Keep exact — "World_Basketball_Festival_<player>" is fine.
 */
export const NOT_A_PORTRAIT = [
  "signed_basketball",
  "signed_Lakers_jersey",
  "Basketball_Center,_Syracuse",
  "Embassy_of_Hope",
  "Schuh_v._Shaquille",
  "Laney_High_School",
  "Bernard_Cardinal_Law",
  "Girls_playing_basketball",
  "At_Anchor_by_Paul",
  "Cultural_Centre_bus_station",
  "Jerry_Bell_Field",
  "LeBron_James_signs_basketball_for_Airman", // an autograph line; his face is out of frame
  "Magic_Johnson_and_Kareem", // a two-shot, not either player alone
  "thumbnail.jpg",
  // Found while preparing the credits page (judged from the file titles):
  "Nancy_Reagan_Being_Lifted", // the First Lady, lifted by two players
  "President_Ronald_Reagan_Looking_Up", // the President is the subject
  "Dominique_Wilkins,_Isiah_Thomas,_Clyde_Drexler", // a group photo
  "Lou_Hudson_and_Connie_Smythe", // 1924 — a different Lou Hudson
  // Two-shots: not either player alone (same rule as Magic and Kareem).
  "Harrison_Barnes_and_Kyrie_Irving",
  "Tom_Heinsohn_and_Elgin_Baylor",
  "Dale_Schlueter_and_Wilt_Chamberlain",
  "Damian_Lillard_and_Kyle_Korver",
  "Guerin_and_maravich",
  "Larry_Bird_vs_Adrian_Dantley",
  "Carter_vs_Gasol",
];

export function isPortrait(url) {
  if (!url) return false;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // keep the raw URL if it is not valid percent-encoding
  }
  return !NOT_A_PORTRAIT.some((bad) => decoded.includes(bad));
}
