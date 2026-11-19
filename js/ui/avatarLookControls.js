/**
 * Behaviour of the Creator 2.0 editor controls that need the DOM but no storage: switching pages, reading the sliders, keeping the numbers next to them
 * and the sliders themselves in step with the saved look. My World owns saving and the figure; this only reads and writes the panel.
 *
 * The slider names are the contract with avatarLookView.js: `input[name="mw-build-<key>"]` carry `data-key`, `input[name="mw-age"]` is the age.
 */
import { sanitizeLook } from "../data/avatarLook.js";
import { AGE } from "../data/avatarAge.js";
import { effectiveBuild, LOOK_TABS } from "./avatarLookView.js";

const unitOf = (key) => (key === "height" ? " cm" : "");

/** Show one page of the editor and hide the others (aria-selected + roving tabindex, like the tabs pattern asks). */
export function selectTab(root, id) {
  if (!LOOK_TABS.some((t) => t.id === id)) return false;
  for (const tab of root.querySelectorAll(".mw-tab")) {
    const on = tab.dataset.tab === id;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  for (const pane of root.querySelectorAll(".mw-pane")) pane.hidden = pane.dataset.mwPane !== id;
  return true;
}

/** Left / Right / Home / End move between the tabs. @returns the tab id to select, or null for any other key. */
export function nextTabId(currentId, key) {
  const ids = LOOK_TABS.map((t) => t.id);
  const at = Math.max(0, ids.indexOf(currentId));
  if (key === "ArrowRight") return ids[(at + 1) % ids.length];
  if (key === "ArrowLeft") return ids[(at - 1 + ids.length) % ids.length];
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  return null;
}

/** Write the number next to a slider. */
export function showValue(root, input) {
  const key = input.name === "mw-age" ? "age" : input.dataset.key;
  const out = root.querySelector(`[data-out="${key}"]`);
  if (out) out.textContent = `${input.value}${unitOf(key)}`;
}

/** The look fields a slider edits: the age, or the WHOLE build (every build slider, so a half-set build never reaches the save). */
export function patchFromSlider(root, input) {
  if (input.name === "mw-age") return { appearanceAge: Number(input.value) };
  const build = {};
  for (const range of root.querySelectorAll('[data-mw-build] input[type="range"]')) build[range.dataset.key] = Number(range.value);
  return { build };
}

/** Put the sliders, their numbers, the preset radios and the "custom build" note on a saved look (after a preset click or a reset). */
export function syncControls(root, rawLook, lang = "zh") {
  const look = sanitizeLook(rawLook);
  const build = effectiveBuild(look);
  for (const range of root.querySelectorAll('[data-mw-build] input[type="range"]')) {
    range.value = String(build[range.dataset.key]);
    showValue(root, range);
  }
  const age = root.querySelector('input[name="mw-age"]');
  if (age) { age.value = String(look.appearanceAge ?? AGE.default); showValue(root, age); }
  const note = root.querySelector("#mw-build-state");
  if (note) note.textContent = look.build ? (lang === "en" ? "Custom build" : "自定义身材") : "";   // the words live here, not in the markup: an English page must not carry Chinese attributes
  for (const radio of root.querySelectorAll('input[name="mw-look-body"]')) radio.checked = radio.value === look.body;
}
