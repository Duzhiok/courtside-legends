/**
 * Where a photo URL comes from. Only Wikimedia Commons files are ever shipped, and each
 * needs a credit (see photoCredits.js), so this is the one place that recognises them.
 */

const COMMONS_FILE = /^https:\/\/(?:thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/;

/** "https://thumb.wikimedia.org/.../Shaq_Heat.jpg/330px-Shaq_Heat.jpg" → "Shaq Heat.jpg"; null if not Commons. */
export function wikimediaFile(url) {
  const match = COMMONS_FILE.exec(String(url || ""));
  if (!match) return null;
  let name = match[1];
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the raw segment when it is not valid percent-encoding
  }
  return name.replace(/_/g, " ");
}
