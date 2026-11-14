/** Small helpers shared by the My Team clubhouse views. Pure, no DOM. */
import { esc } from "../core/html.js";
export { esc };

export const T = (lang, zh, en) => (lang === "en" ? en : zh);

/**
 * A player's name as it should be drawn. NFC-normalised: some roster names are stored decomposed ("Jokic" + a combining
 * acute), which several fonts render as a stray "´" next to the letter instead of one "ć".
 */
export function displayName(card, lang) {
  const raw = lang === "en" ? card?.nameEn || card?.name : card?.name;
  return String(raw ?? "").normalize("NFC");
}
