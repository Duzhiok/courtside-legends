/**
 * Shared HTML escaping — the single source for every view that builds markup from strings.
 *
 * Escapes & < > " ' (safe for element text and for single- or double-quoted attribute values).
 * null/undefined become "" (never the literal "null"). Anything else is stringified first.
 *
 * Two ways to use it:
 *   - `esc(value)`: escape one value by hand (the original opt-in style; forgetting it is the bug class
 *     behind B93/B111/B118-B121).
 *   - html`<b>${name}</b>`: escapes EVERY interpolation by default. The literal parts are trusted, an
 *     interpolated html`` result (or raw()) is inserted as markup, an array is joined, and
 *     null/undefined/false become "". Assign the result straight to `innerHTML` (it stringifies).
 */
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

/** Markup that is already safe: html`` output or raw(). Interpolating it does not escape it again. */
class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** Mark a string you built yourself (static markup, an icon, an already-escaped fragment) as safe. */
export function raw(value) {
  return new SafeHtml(String(value ?? ""));
}

function part(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(part).join("");
  if (value === false) return "";
  return esc(value);
}

/** Tagged template: every `${}` is escaped unless it is html``/raw() output; arrays are joined. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += part(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}
