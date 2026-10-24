/**
 * The button copy when you can't afford something.
 *
 * "差钱 ¤447" used to just repeat the full price — the exact number you'd see printed right
 * next to it as the cost. That's not telling you anything: 差钱 = "short on cash", and the one
 * thing worth adding is HOW MUCH short. So: price - gold you have, never below 0.
 */
export function shortfall(price, gold) {
  return Math.max(0, Math.round(price) - Math.round(gold || 0));
}

export function shortfallLabel(price, gold) {
  return `差钱 ¤${shortfall(price, gold)}`;
}
