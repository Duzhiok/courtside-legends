// Which developer entry points a URL asks boot() to open (?reborn=1, ?inbox=1, ?career=coach, ...), as a pure function
// of the query string. app.js keeps the table of what each entry DOES (it needs the views); this only decides WHICH.
//
// Moved out of app.js unchanged (B61 step 15). The semantics are the old inline ones, on purpose:
//  - the entries are independent: ?reborn=1&inbox=1 opens both, in this order;
//  - ?awakening=1 is a separate entry from ?reborn=1 even though both open Reborn (so both together open it twice);
//  - the four Career Network flags are ONE chain: the first one present wins (scout, film, analytics, network);
//  - only the exact value "1" counts (and "coach" for ?career=).

/** ms boot waits after showing home before an entry opens, so home has painted first. */
export const DEV_ENTRY_DELAY_MS = 250;

const FLAG_ENTRIES = ["reborn", "relationships", "inbox", "awakening", "gm-business"];
const TAIL_FLAG_ENTRIES = ["coach-tactics", "draft-gamble"];
/** Query flag -> the board the Career Network view opens on. First match wins. */
const NETWORK_FLAGS = [["scout", "scout"], ["film", "film"], ["analytics", "analytics"], ["network", "board"]];

/**
 * @param {string} search location.search
 * @returns {{ key: string, arg?: string }[]} the entries to open, in boot order
 */
export function devEntriesFromSearch(search) {
  const params = new URLSearchParams(search || "");
  const on = (name) => params.get(name) === "1";
  const entries = FLAG_ENTRIES.filter(on).map((key) => ({ key }));
  if (params.get("career") === "coach") entries.push({ key: "career-coach" });
  entries.push(...TAIL_FLAG_ENTRIES.filter(on).map((key) => ({ key })));
  const network = NETWORK_FLAGS.find(([flag]) => on(flag));
  if (network) entries.push({ key: "network", arg: network[1] });
  return entries;
}
