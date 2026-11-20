// photo.js gates every portrait on "do we hold its credit" using the small CREDITED_FILES set instead of the 900 KB PHOTO_CREDITS object.
// The two must never drift: a name only in the set would show an uncredited photo; a name only in the credits would hide a licensed one.
import test from "node:test";
import assert from "node:assert/strict";
import { CREDITED_FILES } from "../js/data/photoCreditedFiles.js";
import { PHOTO_CREDITS } from "../js/data/photoCredits.js";
import { isCreditedPhoto } from "../js/data/photo.js";
import { CURATED_PHOTOS } from "../js/data/photos.curated.js";
import { wikimediaFile } from "../js/data/photoSource.js";

test("the credited-file set is exactly the keys of PHOTO_CREDITS", () => {
  assert.deepEqual([...CREDITED_FILES].sort(), Object.keys(PHOTO_CREDITS).sort());
});

test("the gate still follows the credits: a curated (credited) photo shows, the same URL with an unknown file does not", () => {
  const url = Object.values(CURATED_PHOTOS)[0].url;
  assert.equal(isCreditedPhoto(url), true);
  assert.ok(wikimediaFile(url), "could not read the file name from a real photo URL");
  const unknown = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Definitely_not_credited_zzz.jpg/330px-Definitely_not_credited_zzz.jpg";
  assert.ok(wikimediaFile(unknown), "the negative URL must parse like a real one, otherwise this proves nothing");
  assert.equal(isCreditedPhoto(unknown), false);
});

test("photo.js no longer pulls the full credits object at boot (only the credits page does)", async () => {
  const { readFileSync } = await import("node:fs");
  assert.ok(!/photoCredits\.js"/.test(readFileSync(new URL("../js/data/photo.js", import.meta.url), "utf8")));
});
