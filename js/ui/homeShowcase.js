/**
 * Home screen showcase: legends photo wall + photo accents on mode cards.
 * Pictures come from photo.js, which is the one place that decides what a player gets.
 * A tile is drawn only when there is real art (a local illustration or a credited photo):
 * a generated silhouette is fine in a list but would be a poor stand-in for a "legend".
 */
import { resolveCardPhoto } from "../data/photo.js";

export const HOME_LEGENDS = [
  { bref: "jordami01", season: 1991, name: "迈克尔·乔丹", era: "90 年代" },
  { bref: "birdla01", season: 1986, name: "拉里·伯德", era: "80 年代" },
  { bref: "abdulka01", season: 1980, name: "贾巴尔", era: "80 年代" },
  { bref: "olajuha01", season: 1994, name: "奥拉朱旺", era: "90 年代" },
  { bref: "onealsh01", season: 2000, name: "奥尼尔", era: "00 年代" },
  { bref: "bryanko01", season: 2008, name: "科比·布莱恩特", era: "00 年代" },
  { bref: "jamesle01", season: 2013, name: "勒布朗·詹姆斯", era: "10 年代" },
  { bref: "curryst01", season: 2016, name: "斯蒂芬·库里", era: "10 年代" },
  { bref: "jokicni01", season: 2023, name: "尼古拉·约基奇", era: "20 年代" },
];

/** Parse "bref:season" from a data attribute into an era photo URL. */
export function legendPhotoFromToken(token) {
  const [bref, season] = String(token || "").split(":");
  if (!bref) return null;
  return legendPhoto({ bref, season: Number(season) });
}

/** Real art for this legend, or null when the only option would be a generated avatar. */
export function legendPhoto(legend) {
  const { photo, photoSource } = resolveCardPhoto(legend);
  return photoSource === "generated" ? null : photo;
}

function photoImg(src, alt) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  // A broken hotlink should vanish quietly, not leave a broken-image icon.
  img.addEventListener("error", () => img.closest("[data-photo-slot]")?.remove(), { once: true });
  return img;
}

export function renderLegendsWall(container, legends = HOME_LEGENDS) {
  if (!container) return 0;
  container.replaceChildren();
  let count = 0;
  for (const legend of legends) {
    const src = legendPhoto(legend);
    if (!src) continue;
    const figure = document.createElement("figure");
    figure.className = "legend-tile";
    figure.dataset.photoSlot = "";
    figure.style.setProperty("--tilt", `${(count % 2 ? 1 : -1) * (2 + (count % 3))}deg`);
    figure.append(photoImg(src, ""));
    const caption = document.createElement("figcaption");
    caption.innerHTML = `<strong></strong><span></span>`;
    caption.querySelector("strong").textContent = legend.name;
    caption.querySelector("span").textContent = legend.era;
    figure.append(caption);
    container.append(figure);
    count += 1;
  }
  return count;
}

export function decorateModeCards(root) {
  if (!root) return 0;
  let count = 0;
  for (const card of root.querySelectorAll(".mode-card[data-legend]")) {
    if (card.querySelector(".mode-card-photo")) continue;
    const src = legendPhotoFromToken(card.dataset.legend);
    if (!src) continue;
    const slot = document.createElement("span");
    slot.className = "mode-card-photo";
    slot.dataset.photoSlot = "";
    slot.setAttribute("aria-hidden", "true");
    slot.append(photoImg(src, ""));
    card.classList.add("has-photo");
    card.prepend(slot);
    count += 1;
  }
  return count;
}

export function decorateHome(doc = document) {
  renderLegendsWall(doc.querySelector("#home-legends-wall"));
  decorateModeCards(doc.querySelector("#screen-home"));
}
