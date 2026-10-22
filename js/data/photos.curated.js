/**
 * Hand-picked Wikimedia Commons photos that win over js/data/photos.scraped.js (which is
 * generated and overwritten on a re-scrape). Use one when the scraped photo is the wrong era,
 * not a portrait, or missing — and the blocklist alone would leave a worse fallback.
 *
 * Keys: "bref:decade" for one decade, or just "bref" for every other season.
 * Author / licence / source page are NOT repeated here: run scripts/photos/build-credits.mjs
 * and they land in photoCredits.js, which also decides whether a photo may be shown at all.
 *
 * Adding one: LOOK at the image (a file name proves nothing), confirm it is a clear single-
 * subject portrait of that player from the right years, then add it and rebuild the credits.
 */

const COMMONS = "https://thumb.wikimedia.org/wikipedia/commons/thumb";

const SHAQ_1998 = `${COMMONS}/f/fd/Shaquille_O%27Neal_1998.jpg/330px-Shaquille_O%27Neal_1998.jpg`;
const SHAQ_HEAT_2007 = `${COMMONS}/3/30/Shaq_Heat.jpg/330px-Shaq_Heat.jpg`;
const JORDAN_1997 = `${COMMONS}/3/39/Steve_Lipfosky_--_Michael_Jordan_%281997%29_%28cropped%29.jpg/500px-Steve_Lipfosky_--_Michael_Jordan_%281997%29_%28cropped%29.jpg`;
const BIRD_1985 = `${COMMONS}/4/4c/Larry_Bird_Lipofsky_%28high_quality%29_%28cropped%29.jpg/500px-Larry_Bird_Lipofsky_%28high_quality%29_%28cropped%29.jpg`;
const JOKIC_2022 = `${COMMONS}/9/97/Nikola_Jokic_%2851914124577%29.jpg/500px-Nikola_Jokic_%2851914124577%29.jpg`;

export const CURATED_PHOTOS = {
  // 1990 and 2000 scraped entries were a Hall of Fame exhibit; the rest a Celtics sideline candid.
  "onealsh01:1990": { url: SHAQ_1998, why: "1998 close-up, Lakers era" },
  "onealsh01:2000": { url: SHAQ_HEAT_2007, why: "2007 Heat portrait" },
  "onealsh01:2010": { url: SHAQ_HEAT_2007, why: "latest portrait we have" },
  onealsh01: { url: SHAQ_HEAT_2007, why: "default for every other season" },

  // Their scraped photos were a signed ball / a high-school building / a mayor's photo-op;
  // nothing credited was left, so the home wall lost these three tiles.
  "jordami01:1990": { url: JORDAN_1997, why: "1997 Bulls close-up (Steve Lipofsky)" },
  jordami01: { url: JORDAN_1997, why: "default for every other season" },
  "birdla01:1980": { url: BIRD_1985, why: "1985 Celtics #33 (Steve Lipofsky)" },
  birdla01: { url: BIRD_1985, why: "default for every other season" },
  "jokicni01:2020": { url: JOKIC_2022, why: "2022 All-Star weekend, single subject (Erik Drost)" },
  jokicni01: { url: JOKIC_2022, why: "default for every other season" },
};
