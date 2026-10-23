/**
 * NBA 历史父子 / 兄弟：场上同时出现时触发隐藏化学反应加成（父子同心 / 兄弟同心）。
 * 纯彩蛋/情怀向 —— 不在 UI 上做成可见徽章（跟 js/data/skills.js 里的 DUO_COMBOS 不一样，那些是
 * 明牌组合技），只悄悄影响 teamChemistry() 算出来的数字。
 *
 * 每条记录都是一个「家族」，不是逐对罗列——这样 3 人以上的大家族（字母哥三兄弟、霍乐迪三兄弟）
 * 不用枚举所有两两组合，也方便在自由阵容/时空对决这种可以跨年代乱凑人的模式里正确判定。
 *
 * parents + children 都在场 → 父子同心；children 里有 2+ 人在场 → 兄弟同心（无论 parents 是否
 * 追踪到——像格兰特兄弟、洛佩兹兄弟这种父亲没打过 NBA 的，就只有 children，没有 parents）。
 *
 * 每条 bref 都已对照 js/data/roster.json 核实存在，没有凭印象瞎写。
 */

export const FAMILY_GROUPS = [
  // ---- 有据可查的父子（parents 在场 + children 在场 → 父子同心） ----
  { id: "curry", label: "库里一家", parents: ["curryde01"], children: ["curryst01", "curryse01"] },
  { id: "barry", label: "巴里一家", parents: ["barryri01"], children: ["barryjo01", "barrybr01", "barrydr01"] },
  { id: "thompson", label: "汤普森一家", parents: ["thompmy01"], children: ["thompkl01", "thompmy02"] },
  { id: "rivers", label: "里弗斯父子", parents: ["riverdo01"], children: ["riverau01"] },
  { id: "walton", label: "沃顿父子", parents: ["waltobi01"], children: ["waltolu01"] },
  { id: "hardaway", label: "哈达威父子", parents: ["hardati01"], children: ["hardati02"] },
  { id: "sabonis", label: "萨博尼斯父子", parents: ["sabonar01"], children: ["sabondo01"] },
  { id: "schayes", label: "沙伊斯父子", parents: ["schaydo01"], children: ["schayda01"] },
  { id: "nance", label: "南斯父子", parents: ["nancela01"], children: ["nancela02"] },
  { id: "payton", label: "佩顿父子", parents: ["paytoga01"], children: ["paytoga02"] },
  { id: "dunleavy", label: "邓利维父子", parents: ["dunlemi01"], children: ["dunlemi02"] },
  { id: "manning", label: "曼宁父子", parents: ["mannied01"], children: ["mannida01"] },
  { id: "bryant", label: "布莱恩特父子", parents: ["bryanjo01"], children: ["bryanko01"] },
  { id: "vandeweghe", label: "范德维奇父子", parents: ["vandeer01"], children: ["vandeki01"] },
  { id: "ewing", label: "尤因父子", parents: ["ewingpa01"], children: ["ewingpa02"] },
  { id: "henderson", label: "亨德森父子", parents: ["hendege01"], children: ["hendege02"] },
  { id: "horford", label: "霍福德父子", parents: ["horfoti01"], children: ["horfoal01"] },
  { id: "trent", label: "特伦特父子", parents: ["trentga01"], children: ["trentga02"] },
  { id: "brunson", label: "布伦森父子", parents: ["brunsri01"], children: ["brunsja01"] },
  { id: "anthony", label: "安东尼父子", parents: ["anthogr01"], children: ["anthoco01"] },
  { id: "bibby", label: "毕比父子", parents: ["bibbyhe01"], children: ["bibbymi01"] },
  { id: "ferry", label: "费里父子", parents: ["ferrybo01"], children: ["ferryda01"] },
  // 乔治·米坎既是拉里·米坎的父亲，也是艾德·米坎的兄弟 —— 两段关系分两条记录，见下面的
  // mikan_brothers；同一个人（mikange01）出现在两条记录里完全没问题。
  { id: "mikan_father_son", label: "米坎父子", parents: ["mikange01"], children: ["mikanla01"] },
  { id: "lucas", label: "卢卡斯父子", parents: ["lucasjo01"], children: ["lucasjo02"] },
  { id: "jackson", label: "杰克逊父子", parents: ["jacksja01"], children: ["jacksja02"] },

  // ---- 兄弟（无 parents 字段；children 里 2+ 人在场 → 兄弟同心） ----
  { id: "grant_twins", label: "格兰特兄弟（双胞胎）", children: ["grantha01", "grantho01"] },
  { id: "gasol", label: "加索尔兄弟", children: ["gasolma01", "gasolpa01"] },
  { id: "lopez_twins", label: "洛佩兹兄弟（双胞胎）", children: ["lopezbr01", "lopezro01"] },
  { id: "morris_twins", label: "莫里斯兄弟（双胞胎）", children: ["morrima02", "morrima03"] },
  { id: "holiday", label: "霍乐迪三兄弟", children: ["holidjr01", "holidju01", "holidaa01"] },
  { id: "ball", label: "鲍尔兄弟", children: ["ballla01", "balllo01"] },
  { id: "antetokounmpo", label: "字母哥兄弟", children: ["antetgi01", "antetth01", "antetko01"] },
  { id: "king", label: "金氏兄弟", children: ["kingbe01", "kingal01"] },
  { id: "wilkins", label: "威尔金斯兄弟", children: ["wilkido01", "wilkige01"] },
  { id: "person", label: "珀森兄弟", children: ["persoch01", "persowe01"] },
  { id: "van_arsdale_twins", label: "范阿斯德尔兄弟（双胞胎）", children: ["vanardi01", "vanarto01"] },
  { id: "price", label: "普莱斯兄弟", children: ["pricebr01", "pricema01"] },
  { id: "mikan_brothers", label: "米坎兄弟", children: ["mikange01", "mikaned01"] },
  { id: "collins_twins", label: "柯林斯兄弟（双胞胎）", children: ["collija03", "collija04"] },
  { id: "porter", label: "波特兄弟", children: ["portemi01", "portejo01"] },
];

const FAMILY_PER_BONUS = { father_son: 4, brothers: 3 };
const FAMILY_BONUS_CAP = 12;

function brefKeyOf(p) {
  return String(p?.bref || "").toLowerCase();
}

/**
 * 场上已激活的家族关系列表（不是分数，分数见 familyChemistryBonus）。
 * @returns {{ id: string, label: string, type: "father_son"|"brothers" }[]}
 */
export function activeFamilyBonds(onCourt = []) {
  const here = new Set((onCourt || []).map(brefKeyOf).filter(Boolean));
  const out = [];
  for (const fam of FAMILY_GROUPS) {
    const parentsHere = (fam.parents || []).filter((b) => here.has(b));
    const childrenHere = (fam.children || []).filter((b) => here.has(b));
    if (parentsHere.length && childrenHere.length) {
      out.push({ id: fam.id, label: fam.label, type: "father_son" });
    }
    // 有 parents 记录的家族里，children 本身也互为兄弟姐妹（比如库里家 Steph + Seth）。
    if (childrenHere.length >= 2) {
      out.push({ id: fam.id, label: fam.label, type: "brothers" });
    }
  }
  return out;
}

/** 场上家族羁绊带来的隐藏化学反应加成（父子同心 / 兄弟同心），有上限，防止堆叠失控。 */
export function familyChemistryBonus(onCourt = []) {
  const bonds = activeFamilyBonds(onCourt);
  const raw = bonds.reduce((sum, b) => sum + (FAMILY_PER_BONUS[b.type] || 0), 0);
  return Math.min(FAMILY_BONUS_CAP, raw);
}
