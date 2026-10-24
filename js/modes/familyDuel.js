/**
 * T2: 父子局 / 兄弟局 —— 两个"娱乐向"自定义对战，复用 FAMILY_GROUPS 这份已核对过 bref 的家族数据
 * （原本只用来在同队触发隐藏化学反应彩蛋），把它变成真正能打的两支队伍。
 *
 * 为什么不直接塞进现有的 career/duel 状态机或 draft.js 的预算轮抽：那两套系统里 c.kind、
 * 39+ 处判断、listPaidPeaks() 的全局巅峰卡池，全部假设"双方共享同一个候选池"——父子局/兄弟局恰恰
 * 相反，甲队只能买爸爸、乙队只能买儿子，强行塞两个池子进单池设计的 UI，风险远大于收益。
 * 所以这里是一个完全独立、自成一体的小系统：复用的是"花金币从候选池里一个个买人"这个交互手感
 * （跟 careerEconomy.js 的 buildAffordableShop 一样的三档定价思路），不是那套全局状态机本身。
 *
 * 球员池的构建规则：
 * - 父子局：甲队「老爹军团」= 所有在 FAMILY_GROUPS 里出现过 parents 字段的人；
 *           乙队「儿子军团」= 那些父子家族里的 children（儿子）。
 * - 兄弟局：把每个家族的 children（不论是否有 parents 记录——纯兄弟家族和父子家族的儿子们互相
 *           也是兄弟姐妹）按索引奇偶分到甲乙两队，让真兄弟尽量分在对立面上（3 人以上的大家族无法
 *           做到两两对立，只能退而求其次：至少保证不是全员堆在同一队）。
 * - 每个人只取「能力值最高的那张赛季卡」代表本人，不是把每个人的所有赛季都塞进池子——父子局/
 *   兄弟局比的是"这个人"，不是"这个人的哪个赛季版本"。
 */
import { FAMILY_GROUPS } from "../data/family.js";
import { playerPrice } from "../data/intangibles.js";
import { PLAYERS, clonePlayer, overall } from "../data/players.js";

/** Starting gold per side — same number career mode gives the human (js/app.js bootCareerBracket). */
export const FAMILY_DUEL_GOLD = 600;
export const FAMILY_DUEL_ROSTER_SIZE = 12;
export const FAMILY_DUEL_MIN_TO_START = 5;

/** One card per real person: their highest-OVR season, cloned so callers can mutate freely. */
function bestCardsByBref(brefs, source) {
  const unique = [...new Set(brefs)];
  const out = [];
  for (const bref of unique) {
    const cards = source.filter((p) => p.bref === bref);
    if (!cards.length) continue;
    const best = cards.reduce((a, b) => (overall(b) > overall(a) ? b : a));
    out.push(clonePlayer(best));
  }
  return out;
}

/** Families that actually have a tracked father (parents field) -- siblings-only families excluded. */
function fatherSonFamilies() {
  return FAMILY_GROUPS.filter((f) => Array.isArray(f.parents) && f.parents.length);
}

/**
 * 父子局的两个候选池。`source` 默认是实时名册 PLAYERS，测试里可以传自己构造的小数据。
 * @returns {{ fathers: object[], sons: object[] }}
 */
export function fatherSonPools(source = PLAYERS) {
  const families = fatherSonFamilies();
  const fathers = bestCardsByBref(families.flatMap((f) => f.parents), source);
  const sons = bestCardsByBref(families.flatMap((f) => f.children || []), source);
  return { fathers, sons };
}

/**
 * 兄弟局的两个候选池：每个家族的 children 按下标奇偶分边，真兄弟尽量对立。
 * 用 FAMILY_GROUPS 里的原始顺序而不是打乱，保证结果确定可测；真正对战时玩家仍可自由挑人，
 * 这里只是划定"这个人天生站哪一边"的候选名单，不代表强制上场。
 * @returns {{ sideA: object[], sideB: object[] }}
 */
export function brotherPools(source = PLAYERS) {
  const seenA = new Set();
  const seenB = new Set();
  const brefA = [];
  const brefB = [];
  // A GLOBAL counter (not reset per family) so odd-sized families (3-brother groups like 字母哥
  // or 霍乐迪) don't all lean the same direction and skew the two sides -- resetting i=0 for every
  // family used to do exactly that (every family's "extra" member landed on side A, every time),
  // producing a lopsided 43-vs-18 split instead of two comparably sized teams.
  let turn = 0;
  for (const fam of FAMILY_GROUPS) {
    for (const bref of fam.children || []) {
      // A person must not end up on both sides even if two different family records disagree.
      if (seenA.has(bref) || seenB.has(bref)) continue;
      if (turn % 2 === 0) {
        seenA.add(bref);
        brefA.push(bref);
      } else {
        seenB.add(bref);
        brefB.push(bref);
      }
      turn++;
    }
  }
  return { sideA: bestCardsByBref(brefA, source), sideB: bestCardsByBref(brefB, source) };
}

/** Candidate list for a given family-duel theme + side, already priced like the regular market. */
export function familyDuelPool(theme, side, source = PLAYERS) {
  if (theme === "fatherSon") {
    const { fathers, sons } = fatherSonPools(source);
    return side === "A" ? fathers : sons;
  }
  if (theme === "brothers") {
    const { sideA, sideB } = brotherPools(source);
    return side === "A" ? sideA : sideB;
  }
  return [];
}

export const FAMILY_DUEL_THEMES = {
  fatherSon: { id: "fatherSon", label: "父子局", teamA: "老爹军团", teamB: "儿子军团" },
  brothers: { id: "brothers", label: "兄弟局", teamA: "兄弟甲队", teamB: "兄弟乙队" },
};

/** Fresh { team, gold, shop, used } state for one side of a family duel. */
export function freshFamilySide(name) {
  return { name, players: [], coach: null, assistant: null, gold: FAMILY_DUEL_GOLD };
}

/**
 * Shop grid for one side: up to `size` affordable candidates from its OWN pool, cheap/mid/stretch
 * mix like careerEconomy.js's buildAffordableShop -- but scoped to a small pre-built pool instead
 * of the whole roster, so there is no risk of a father showing up in the sons' shop or vice versa.
 */
export function familyDuelShop(pool, excludeIds, gold, size = 10) {
  const exclude = excludeIds || new Set();
  const available = pool.filter((p) => !exclude.has(p.id));
  const priced = available.map((p) => ({ p, price: playerPrice(p) }));
  const budget = Math.max(60, gold);
  const cheap = priced.filter((x) => x.price <= budget * 0.55).map((x) => x.p);
  const mid = priced.filter((x) => x.price > budget * 0.55 && x.price <= budget).map((x) => x.p);
  const stretch = priced.filter((x) => x.price > budget).map((x) => x.p);

  // Generic random-pick: returns N distinct raw elements from `arr`, no shape assumptions. The
  // earlier version always did copy.splice(i,1)[0].p, silently assuming every input array held
  // {p, price} tuples -- fine for cheap/mid/stretch, but the size-topup fallback below passes
  // already-unwrapped player objects (no .p field), so that ".p" read undefined, and the shop
  // ended up with real `undefined` holes in it that blew up downstream at shop.filter(p => p.id).
  const pick = (arr, n) => {
    const copy = [...arr];
    const out = [];
    while (copy.length && out.length < n) {
      const i = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(i, 1)[0]);
    }
    return out;
  };

  let shop = [...pick(cheap, Math.ceil(size * 0.6)), ...pick(mid, Math.ceil(size * 0.3)), ...pick(stretch, 1)];
  if (shop.length < size) shop = shop.concat(pick(available, size - shop.length));
  const seen = new Set();
  shop = shop.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  return shop.slice(0, size).map(clonePlayer);
}

/** Buy one player into a side, deducting gold. Returns { ok, reason? }. */
export function buyIntoFamilySide(side, player, pool) {
  if (!side || !player) return { ok: false, reason: "缺少球员" };
  if (side.players.length >= FAMILY_DUEL_ROSTER_SIZE) return { ok: false, reason: "名单已满" };
  if (side.players.some((p) => p.id === player.id)) return { ok: false, reason: "已经在名单里" };
  const stillInPool = pool.some((p) => p.id === player.id);
  if (!stillInPool) return { ok: false, reason: "不在该队候选池里" };
  const price = playerPrice(player);
  if (price > (side.gold || 0)) return { ok: false, reason: "金币不够" };
  side.gold -= price;
  side.players.push(clonePlayer(player));
  return { ok: true };
}

/** Auto-complete a side up to FAMILY_DUEL_ROSTER_SIZE using whatever gold is left, best value first. */
export function autoFillFamilySide(side, pool) {
  const used = new Set(side.players.map((p) => p.id));
  const candidates = pool
    .filter((p) => !used.has(p.id))
    .map((p) => ({ p, price: playerPrice(p) }))
    .sort((a, b) => b.p && overall(b.p) / Math.max(40, b.price) - overall(a.p) / Math.max(40, a.price));
  for (const { p, price } of candidates) {
    if (side.players.length >= FAMILY_DUEL_ROSTER_SIZE) break;
    if (price > (side.gold || 0)) continue;
    side.gold -= price;
    side.players.push(clonePlayer(p));
    used.add(p.id);
  }
  return side;
}

export function familyDuelReadyToStart(sideA, sideB) {
  return (
    (sideA?.players?.length || 0) >= FAMILY_DUEL_MIN_TO_START &&
    (sideB?.players?.length || 0) >= FAMILY_DUEL_MIN_TO_START
  );
}
