/**
 * Hand-picked portraits that win over js/data/photos.scraped.js (which is generated
 * and gets overwritten on a re-scrape). Use this when the scraped photo is the wrong
 * era or not a portrait and the NOT_A_PORTRAIT blocklist alone would leave a worse fallback.
 *
 * Keys: "bref:decade" for one decade, or just "bref" for every other season.
 * Each entry keeps its attribution — CC BY-SA requires crediting the author.
 * Adding one: view the image (not just the file name!), then confirm it is a clear
 * portrait of that player from the right years.
 */

const COMMONS = "https://thumb.wikimedia.org/wikipedia/commons/thumb";

const SHAQ_1998 = {
  url: `${COMMONS}/f/fd/Shaquille_O%27Neal_1998.jpg/330px-Shaquille_O%27Neal_1998.jpg`,
  artist: "John Mathew Smith & www.celebrity-photos.com",
  license: "CC BY-SA 2.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
  page: "https://commons.wikimedia.org/wiki/File:Shaquille_O%27Neal_1998.jpg",
  taken: "1998-08-06, Washington D.C.",
};

const SHAQ_HEAT_2007 = {
  url: `${COMMONS}/3/30/Shaq_Heat.jpg/330px-Shaq_Heat.jpg`,
  artist: "Keith Allison",
  license: "CC BY-SA 2.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
  page: "https://commons.wikimedia.org/wiki/File:Shaq_Heat.jpg",
  taken: "2007-02-28, Wizards v Heat",
};

export const CURATED_PHOTOS = {
  // His 1990 and 2000 scraped entries were a Hall of Fame exhibit; the rest was a Celtics sideline candid.
  "onealsh01:1990": SHAQ_1998,
  "onealsh01:2000": SHAQ_HEAT_2007,
  "onealsh01:2010": SHAQ_HEAT_2007,
  onealsh01: SHAQ_HEAT_2007,
};
