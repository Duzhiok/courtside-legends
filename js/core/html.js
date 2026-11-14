/**
 * Shared HTML escaping — the single source for every view that builds markup from strings.
 *
 * Escapes & < > " ' (safe for element text and for single- or double-quoted attribute values).
 * null/undefined become "" (never the literal "null"). Anything else is stringified first.
 */
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}
