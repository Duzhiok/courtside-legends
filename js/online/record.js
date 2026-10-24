/**
 * T6 P2 local win/loss record (browser localStorage).
 *
 * P2 keeps records local: the server has no accounts yet (P3). The
 * storage object is injected so the logic is unit-testable in Node;
 * the browser client passes window.localStorage. A draw, a spectator
 * view, or a missing winner leaves the record unchanged.
 */

export const RECORD_KEY = "courtside-online-record";

export function loadRecord(storage) {
  try {
    const raw = storage.getItem(RECORD_KEY);
    if (!raw) return { wins: 0, losses: 0 };
    const parsed = JSON.parse(raw);
    if (typeof parsed.wins !== "number" || typeof parsed.losses !== "number") {
      return { wins: 0, losses: 0 };
    }
    return { wins: parsed.wins, losses: parsed.losses };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

export function saveRecord(storage, record) {
  try {
    storage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    /* private mode etc: record just doesn't persist */
  }
}

export function recordGame(record, { side, winner }) {
  if (side !== "home" && side !== "away") return record;
  if (winner !== "home" && winner !== "away") return record;
  return winner === side
    ? { wins: record.wins + 1, losses: record.losses }
    : { wins: record.wins, losses: record.losses + 1 };
}

export function formatRecord(record) {
  return `${record.wins} 胜 ${record.losses} 负`;
}
