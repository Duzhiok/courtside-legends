/**
 * Coach bench: simple / advanced (B22, docs/implementation/b22-coach-bench-modes.md).
 *
 * The coach panel has grown to ~25 controls. Simple mode keeps what a game needs minute to minute - timeout, speed, pace, the substitution bench (which lives
 * outside the panel), save, and THREE tactic choices - and hides the rest behind `.adv-only` (CSS only: every control keeps its id and its GameSim wiring, nothing
 * is removed and nothing here changes a rule). The choice is a device preference, not part of any save.
 */

export const COACH_MODE_KEY = "cls_coach_mode_v1";
export const COACH_MODES = Object.freeze(["simple", "advanced"]);
export const DEFAULT_COACH_MODE = "simple";

export function sanitizeCoachMode(v) {
  return COACH_MODES.includes(v) ? v : DEFAULT_COACH_MODE;
}

export function readCoachMode(storage) {
  try {
    return sanitizeCoachMode(storage?.getItem(COACH_MODE_KEY));
  } catch {
    return DEFAULT_COACH_MODE;
  }
}

export function writeCoachMode(storage, mode) {
  try {
    storage?.setItem(COACH_MODE_KEY, sanitizeCoachMode(mode));
    return true;
  } catch {
    return false;
  }
}

/** The first maximum of `key` over `list` (earlier wins ties), skipping the ids in `skip`. */
function best(list, key, skip) {
  let pick = null;
  for (const t of list) {
    if (skip.has(t.id)) continue;
    if (!pick || (Number(t[key]) || 0) > (Number(pick[key]) || 0)) pick = t;
  }
  return pick;
}

/**
 * The three tactics simple mode offers, from what this coach can actually run: his own system (`baseId`; the even "balanced" when he has none), the fastest one
 * (to chase), the sturdiest defence (to protect a lead). The set depends only on the pool, never on the current pick, so choosing one does not reshuffle the other two; the current tactic is appended if it is
 * not among them, so the dropdown never shows something other than what is on the floor.
 */
export function simpleTactics(tactics, currentId = null, baseId = "balanced") {
  const pool = tactics || [];
  if (!pool.length) return [];
  const baseline = pool.find((t) => t.id === baseId) || pool.find((t) => t.id === "balanced") || pool[0];
  const taken = new Set([baseline.id]);
  const fast = best(pool, "pace", taken);
  if (fast) taken.add(fast.id);
  const sturdy = best(pool, "defense", taken);
  const out = [baseline, fast, sturdy].filter(Boolean);
  const current = pool.find((t) => t.id === currentId);
  if (current && !out.includes(current)) out.push(current);
  return out;
}

const LABEL = { zh: "高级", en: "Advanced" };

/**
 * @param {{ panel: Element|null, button: Element|null, storage?: Storage|null, getLang?: () => string, onChange?: (mode: string) => void }} deps
 * @returns {{ mode(): string, isSimple(): boolean, set(mode: string): void, toggle(): void, refreshLabel(): void }}
 */
export function createCoachMode({ panel, button, storage = null, getLang = () => "zh", onChange = null }) {
  let mode = readCoachMode(storage);

  function render() {
    panel?.setAttribute("data-coach-mode", mode);
    if (button) {
      button.setAttribute("aria-pressed", String(mode === "advanced"));
      button.textContent = LABEL[getLang() === "en" ? "en" : "zh"];
    }
  }

  function set(next) {
    const clean = sanitizeCoachMode(next);
    if (clean === mode) return render();
    mode = clean;
    writeCoachMode(storage, mode);
    render();
    try {
      onChange?.(mode);
    } catch (err) {
      if (typeof console !== "undefined") console.error("[coach-mode] onChange", err);
    }
  }

  button?.addEventListener("click", () => set(mode === "simple" ? "advanced" : "simple"));
  render();
  return { mode: () => mode, isSimple: () => mode === "simple", set, toggle: () => set(mode === "simple" ? "advanced" : "simple"), refreshLabel: render };
}
