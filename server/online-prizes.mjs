/**
 * Duel prize rules for the online economy: who gets paid, and how much.
 *
 * Prizes are new gold created out of nothing (there is no sink yet), so they have to be rationed. The
 * original rule paid the winner 200 and the loser 50 for every game, with no limit, and paid a forfeit the
 * moment the loser's socket closed: two accounts could mint thousands of gold in seconds. Now:
 *   - only the winner is paid; the loser gets nothing (a consolation prize is just a faucet);
 *   - the same two accounts pay out at most PAIR_DAILY_PRIZE_LIMIT times a day, whoever wins;
 *   - one account can earn at most DAILY_PRIZE_CAP prize gold a day, so a ring of throwaway accounts is
 *     bounded per account (and registration is rate limited separately).
 * Days are UTC calendar days. The ledger is persisted by the caller, so a restart does not reset it.
 */

export const WIN_PRIZE = 200;
export const PAIR_DAILY_PRIZE_LIMIT = 3;
export const DAILY_PRIZE_CAP = 1000;

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Names can contain any character, so the pair is keyed by an unambiguous encoding of the sorted names. */
const pairKey = (a, b) => JSON.stringify([a, b].sort());

/** A counter map from untrusted saved data: null prototype (a name like "__proto__" is an ordinary key), numbers only. */
function cleanCounts(raw) {
  const out = Object.create(null);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (Number.isFinite(value) && value > 0) out[key] = value;
    }
  }
  return out;
}

/**
 * @param {{ pairs?: object, earned?: object, day?: string }} [saved] what snapshot() returned last time
 * @param {() => number} [now] clock, injectable for tests
 * @param {number} [dailyCap] per-account daily prize gold
 */
export function createPrizeLedger({ saved, now = Date.now, dailyCap = DAILY_PRIZE_CAP } = {}) {
  let day = typeof saved?.day === "string" ? saved.day : dayOf(now());
  let pairs = cleanCounts(saved?.pairs);
  let earned = cleanCounts(saved?.earned);

  const rollOver = () => {
    const today = dayOf(now());
    if (today === day) return;
    day = today;
    pairs = Object.create(null);
    earned = Object.create(null);
  };

  return {
    /**
     * Decide the winner's prize and record it.
     * @returns {{ prize: number, limited: null | "pair" | "daily" }} `limited` says why the full prize was not paid
     */
    award(winner, loser) {
      rollOver();
      const key = pairKey(winner, loser);
      if ((pairs[key] || 0) >= PAIR_DAILY_PRIZE_LIMIT) return { prize: 0, limited: "pair" };
      const room = dailyCap - (earned[winner] || 0);
      const prize = Math.max(0, Math.min(WIN_PRIZE, room));
      if (prize > 0) {
        pairs[key] = (pairs[key] || 0) + 1;
        earned[winner] = (earned[winner] || 0) + prize;
      }
      return { prize, limited: prize < WIN_PRIZE ? "daily" : null };
    },
    /** Plain data to persist and hand back as `saved` on the next start. */
    snapshot: () => ({ day, pairs, earned }),
  };
}
