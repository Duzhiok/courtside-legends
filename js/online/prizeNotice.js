// What to tell the winner after a duel. The server says how much it paid and, when that was less than a full
// prize, why (`limited`): the player should never be left wondering where the gold went.

/** @param {{ gold?: number, prize?: number, limited?: null | "pair" | "daily" }} msg an "economy" message */
export function prizeNotice(msg) {
  const gold = Number(msg?.gold) || 0;
  const prize = Number(msg?.prize) || 0;
  if (prize > 0 && !msg?.limited) return `对局奖金 +${prize}，现有金币 ${gold}`;
  if (prize > 0) return `奖金 +${prize}（已达今日上限），现有金币 ${gold}`;
  if (msg?.limited === "pair") return `本局没有奖金：今天和这位对手的奖金次数已用完。现有金币 ${gold}`;
  if (msg?.limited === "daily") return `本局没有奖金：今日奖金已封顶。现有金币 ${gold}`;
  return `现有金币 ${gold}`;
}
