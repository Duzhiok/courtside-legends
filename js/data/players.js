import { buildCareerSpanIndex } from "./careerArc.js";
import { attachIntangibles } from "./intangibles.js";
import {
  applyLegendTwilightFloor,
  isTwilightSeason,
  legendMeta,
  teamLabel,
} from "./legends.js";
import { resolveCardPhoto } from "./photo.js";
import { impactOvrFloor, resolve2KRatings } from "./ratings2k.js";
import {
  fetchRosterJson,
  loadCachedPlayers,
  loadCachedPlayersFast,
  saveCachedPlayers,
} from "./rosterCache.js";
import { assignSkillPacks } from "./skills.js";

export const HIDDEN_TIERS = {
  undrafted_gleague: { weight: 22, label: "落选+短期合同+D联盟" },
  water_cooler: { weight: 18, label: "饮水机管理员" },
  bench: { weight: 20, label: "bench player" },
  starter: { weight: 16, label: "starters" },
  star: { weight: 10, label: "球星" },
  allstar: { weight: 7, label: "全明星" },
  hof: { weight: 4, label: "名人堂" },
  nba50: { weight: 2, label: "NBA 50 大巨星" },
  superstar: { weight: 1, label: "超级巨星" },
};

/** @type {any[]} */
export let PLAYERS = [];

let _loaded = false;
let _loading = null;

export function playersReady() {
  return _loaded;
}

/**
 * Convert raw per-game season row → game card with attributes + hidden tier.
 * Attributes follow NBA 2K yearly scales (see ratings2k.js); landmark seasons
 * use published 2K-band anchors when available.
 */
export function seasonToCard(r) {
  const repaired = repairSeasonStats(r);
  const ppg = repaired.ppg;
  const rpg = repaired.rpg;
  const apg = repaired.apg;
  const spg = repaired.spg;
  const bpg = repaired.bpg;
  const tpg = repaired.tpg;
  const mpg = repaired.mpg;
  const gp = repaired.gp;
  const fg = repaired.fg;
  const tp = repaired.tp;
  const ft = repaired.ft;
  const fga = repaired.fga;
  const tpa = repaired.tpa;
  const pos = repaired.pos;
  const threeRate = tpa / Math.max(fga, 1);
  // use repaired row for archetype / tags
  r = { ...r, ...repaired };

  let {
    attrs,
    ovrHint,
    source: ratingSource,
    anchorSpeed,
    age,
    careerPhase,
    careerPhaseLabel,
  } = resolve2KRatings(r);
  const twilightApplied = applyLegendTwilightFloor(r, attrs, ovrHint);
  attrs = twilightApplied.attrs;
  ovrHint = twilightApplied.ovrHint;
  const twilight = twilightApplied.twilight || isTwilightSeason(r);
  if (twilightApplied.twilight && ratingSource === "formula") ratingSource = "twilight";
  let {
    scoring,
    three,
    mid,
    paint,
    defense,
    rebound,
    pass,
    speed,
    strength,
    stamina,
    iq,
    clutch,
    steal,
    block,
  } = attrs;
  const { heightCm, weightKg } = derivePhysique(r, { pos, strength, speed, rebound });
  // 体型回写速度/力量：瘦高更快更轻，壮高更慢更沉（奥尼尔/加内特等特体除外）
  const ath = applyPhysiqueToAthleticism(
    { speed, strength },
    { heightCm, weightKg, bref: r.bref }
  );
  speed = ath.speed;
  strength = ath.strength;
  // R106: 锚点卡速度不叠过头——生涯弧线 + 体型加分曾把 2K 锚点速度顶出 +15
  //（Wiggins 锚点 84 → 卡面 99），最终速度锁在锚点 ±5 内。
  if (ratingSource === "anchor" && anchorSpeed != null) {
    speed = clamp(speed, anchorSpeed - 5, anchorSpeed + 5);
  }
  // R106: 场均篮板上双的中锋力量地板 60——护框型扣分叠加曾把壮汉压到 50 出头。
  if (pos === "C" && rpg >= 10) strength = Math.max(strength, 60);
  const tends = deriveShotTendencies(r, {
    three,
    mid,
    paint,
    scoring,
    speed,
    pos,
    threeRate,
    tpa,
    fga,
    ppg,
    apg,
  });

  // Approximate zone FG% from overall / 3P tendencies (not exact shot-zone data)
  const threeFg = clamp(tp || 0.28, 0.05, 0.5);
  const paintFg = clamp(0.48 + (fg - 0.42) * 0.7 + (["C", "PF"].includes(pos) ? 0.04 : 0), 0.35, 0.72);
  const midFg = clamp(fg * 0.95, 0.28, 0.55);

  const prod = ppg * 1.0 + rpg * 0.7 + apg * 0.9 + spg * 1.5 + bpg * 1.4;
  // 要求 prod 高还不够，旧规则还硬性再加一道 ppg 门槛，等于把非得分型巨星罚了两次：
  // 朗多 2012 季 11.9 分/11.7 助攻/1.8 断，prod≈29（allstar 级），却因 ppg<14 被按在 starter，
  // 连「有技能」的骰子都摇不到。改成：高 prod + （真的会得分 或 顶级组织 或 顶级防守指标）任一达标。
  const bigScorer = ppg >= 14;
  const elitePasser = apg >= 9;
  const eliteDefender = spg >= 2.2 || bpg >= 2.2;
  const bigScorerPlus = ppg >= 18;
  const elitePasserPlus = apg >= 10.5;
  const eliteDefenderPlus = spg >= 2.6 || bpg >= 2.6;
  const bigScorerSuper = ppg >= 24;
  const elitePasserSuper = apg >= 11.5;
  const eliteDefenderSuper = spg >= 3.0 || bpg >= 3.0;
  let hiddenTier = "bench";
  if (prod < 8 || mpg < 12) hiddenTier = "water_cooler";
  if (prod < 5 && gp < 30) hiddenTier = "undrafted_gleague";
  if (prod >= 14 && mpg >= 22) hiddenTier = "starter";
  if (prod >= 22 && (bigScorer || elitePasser || eliteDefender)) hiddenTier = "star";
  if (prod >= 28 && (bigScorerPlus || elitePasserPlus || eliteDefenderPlus)) hiddenTier = "allstar";
  if (prod >= 34 && (bigScorerSuper || elitePasserSuper || eliteDefenderSuper)) hiddenTier = "superstar";
  // Old legends production curve was different — bump era stars
  if (r.season <= 1979 && ppg >= 20) hiddenTier = "hof";
  if (r.season <= 1979 && ppg >= 27) hiddenTier = "nba50";

  // Young cards keep ceiling room; vets are more "finished"
  let growth = clamp(
    Math.round(100 - (r.season - 1950) * 0.15 - ppg * 1.2 + (mpg < 20 ? 25 : 0)),
    5,
    95
  );
  if ((age || 26) <= 22) growth = clamp(growth + 18, 25, 95);
  else if ((age || 26) <= 25) growth = clamp(growth + 8, 15, 95);
  else if ((age || 26) >= 33) growth = clamp(growth - 20, 5, 55);
  const growthSpeed = clamp(growth - 5, 5, 95);

  const displayName = r.nameZh || r.name;
  const leg = legendMeta(r.bref);
  const nbaId = r.nbaId || leg?.nbaId || null;
  // Era map (decade Wikimedia/Google) → NBA CDN → BRef → avatar
  const photoMeta = resolveCardPhoto({
    name: displayName,
    bref: r.bref || null,
    nbaId,
    season: r.season,
  });

  const subAttrs = deriveSubAttributes({
    pos,
    three,
    mid,
    paint,
    defense,
    rebound,
    pass,
    speed,
    strength,
    block,
    steal,
    scoring,
    heightCm,
    offenseStyle: tends.offenseStyle,
  });

  const card = {
    id: r.id,
    name: displayName,
    nameEn: r.name,
    season: r.season,
    team: r.team,
    teamLabel: teamLabel(r.team),
    pos,
    nbaId,
    bref: r.bref || null,
    photo: photoMeta.photo,
    photoCareerDefault: photoMeta.photoCareerDefault,
    photoSource: photoMeta.photoSource,
    twilight,
    scoring,
    three,
    mid,
    paint,
    defense,
    rebound,
    pass,
    speed,
    strength,
    heightCm,
    weightKg,
    stamina,
    iq,
    clutch,
    steal,
    block,
    // NBA2K风格的细分子能力(R84): 控球/外线防守/内线防守/接球投/持球投/前场篮板/后场篮板
    ...subAttrs,
    // 2K-style tendencies / offense style (drive shot selection, not just make%)
    shotTend: tends.shotTend,
    threeTend: tends.threeTend,
    midTend: tends.midTend,
    paintTend: tends.paintTend,
    offenseStyle: tends.offenseStyle,
    paintFg,
    midFg,
    threeFg,
    ft: clamp(ft || 0.75, 0.4, 0.95),
    personality: {
      ego: clamp(Math.round(30 + ppg * 1.5 - ((age || 26) >= 32 ? 6 : 0)), 15, 95),
      team: clamp(
        Math.round(70 - ppg * 0.6 + apg * 3 + ((age || 26) >= 30 ? 10 : (age || 26) <= 22 ? -6 : 0)),
        25,
        95
      ),
      fiery: clamp(
        Math.round(35 + spg * 10 + (ppg > 25 ? 15 : 0) - ((age || 26) >= 32 ? 8 : 0)),
        15,
        95
      ),
      calm: clamp(
        Math.round(55 + (apg > 6 ? 15 : 0) - (ppg > 28 ? 10 : 0) + ((age || 26) >= 30 ? 10 : 0)),
        20,
        95
      ),
    },
    growth,
    growthSpeed,
    age: age || null,
    careerPhase: careerPhase || null,
    careerPhaseLabel: careerPhaseLabel || null,
    archetype: inferArchetype(r, { three, pass, defense, paint, steal, block, mid, scoring }),
    hiddenTier,
    tags: buildTags(r, hiddenTier),
    raw: { ppg, rpg, apg, spg, bpg, tpg, mpg, gp, fg, tp, ft, fga, tpa },
    // 2K calibration metadata
    ovr2k: ovrHint,
    ratingSource,
  };
  assignSkillPacks(card);
  return attachIntangibles(card);
}

/**
 * Safety net for old caches / partial scrapes.
 * Root cause fixed in build_full_roster.py: BRef wraps league-leading cells in
 * <strong>/<a>, so a naive ([^<]*) parse wiped BLK/STL/TRB/AST for leaders
 * (Ibaka 2013 BPG, CP3 steals, DJ rebounds, Harden assists, etc.).
 */
const WIPED_STAT_PATCH = {
  "ibakase01:2013": { bpg: 3.0 },
  "davisan02:2014": { bpg: 2.8 },
  "davisan02:2015": { bpg: 2.9 },
  "davisan02:2018": { bpg: 2.6 },
  "whiteha01:2016": { bpg: 3.7 },
  "whiteha01:2020": { bpg: 2.9 },
  "goberru01:2017": { bpg: 2.6 },
  "turnemy01:2019": { bpg: 2.7 },
  "turnemy01:2021": { bpg: 3.4 },
  "jacksja02:2022": { bpg: 2.3 },
  "jacksja02:2023": { bpg: 3.0 },
  "wembavi01:2024": { bpg: 3.6 },
  "wembavi01:2025": { bpg: 3.8 },
};

/**
 * 史源本职纠错：talldata 生涯主位置 / BRef 单季标签偶发把 PF 标成 C。
 * 例：诺维茨基早期赛季大量标 C，但生涯身份是大前锋。
 *
 * 另外一类更广泛的问题：构建 roster.json 的脚本把模糊的 "F"（前锋，未区分 SF/PF）统一归
 * 一化成了 "SF"（见 scripts/build_full_roster.py 的 normalize_pos）。结果是大批历史大前锋全
 * 生涯被标成 SF：马隆、巴克利、罗德曼、加内特……对照真实赛季编号在 rpg/apg 上的签名很易找到
 * 这批“被误判为 SF 的大前锋”（全生涯标 SF 且 rpg>=9/apg<=4.2 的，足有 30 位，其中这几位是每个
 * 球迷都知道的无争议 HOF 大前锋，其余个别 1950–60 年代边缘人物产产业证据不足暂未改）。
 *
 * 同样的归一化套路也发生在后卫身上：模糊的 "G"（后卫，未区分 PG/SG）被统一归一化成了 "SG"。
 * 结果是一大批每个球迷都知道的无争议 HOF 组织后卫全生涯被标成 SG：斯托克顿、魔术师约翰逊、
 * 艾赛亚·托马斯、加里·佩顿……同样用 apg 签名（全生涯标 SG 且 apg>=6.5 的）很容易找到这批
 * “被误判为 SG 的控卫”（杰里·韦斯特、米切尔·雷·理查德森这类历史上长期被列为双位置后卫、
 * 本身就有争议的生涯，暂不动）。
 */
const POS_OVERRIDES = {
  nowitdi01: "PF", // Dirk Nowitzki
  willija02: "PG", // Jason Williams (White Chocolate)
  // 被 "F"→"SF" 归一化误收的历史大前锋（roster.json 全生涯都标 SF，但现实中都是 PF/C）
  garneke01: "PF", // Kevin Garnett — 1996–2011 全标 SF，实际生涯身份是大前锋
  malonka01: "PF", // Karl Malone
  barklch01: "PF", // Charles Barkley
  rodmade01: "PF", // Dennis Rodman
  hayesel01: "PF", // Elvin Hayes
  pettibo01: "PF", // Bob Pettit
  haywosp01: "PF", // Spencer Haywood
  willibu01: "PF", // Buck Williams
  silaspa01: "PF", // Paul Silas
  debusda01: "PF", // Dave DeBusschere
  schaydo01: "PF", // Dolph Schayes
  mchalke01: "PF", // Kevin McHale — 100% 标 SF达 13 季
  oaklech01: "PF", // Charles Oakley — 100% 标 SF 达 19 季
  willike02: "PF", // Kevin Willis — 100% 标 SF 达 21 季
  kempsh01: "PF", // Shawn Kemp — 100% 标 SF 达 14 季
  pachuza01: "C", // Zaza Pachulia — 2004–11（talldata 源）全标 SF，2012 起（bref 源）才正确标 C；
  // 他整个生涯都是撞人挡拆/卡位抢板的纯中锋，从没打过小前锋
  rondora01: "PG", // Rajon Rondo — 2007–11 全标 SF，他整个生涯都是组织后卫
  // 被 "G"→"SG" 归一化误收的历史控卫（roster.json 全生涯都标 SG，但现实中都是无争议 PG）
  stockjo01: "PG", // John Stockton — NBA 历史助攻王，19 个赛季全标 SG
  cousybo01: "PG", // Bob Cousy
  rodgegu01: "PG", // Guy Rodgers
  roberos01: "PG", // Oscar Robertson
  wilkele01: "PG", // Lenny Wilkens
  vanlino01: "PG", // Norm Van Lier
  archina01: "PG", // Nate "Tiny" Archibald
  porteke01: "PG", // Kevin Porter
  lucasjo01: "PG", // John Lucas
  nixonno01: "PG", // Norm Nixon
  cheekma01: "PG", // Maurice Cheeks
  johnsma02: "PG", // Earvin "Magic" Johnson
  moorejo01: "PG", // Johnny Moore
  thomais01: "PG", // Isiah Thomas
  pricema01: "PG", // Mark Price
  jacksma01: "PG", // Mark Jackson
  johnske02: "PG", // Kevin Johnson
  boguemu01: "PG", // Muggsy Bogues
  stricro02: "PG", // Rod Strickland
  hardati01: "PG", // Tim Hardaway
  paytoga01: "PG", // Gary Payton
  brandte01: "PG", // Terrell Brandon
  vanexni01: "PG", // Nick Van Exel
  marbust01: "PG", // Stephon Marbury
  nashst01: "PG", // Steve Nash — 1997–2011 全标 SG，2012 起数据源才正确标 PG
  paulch01: "PG", // Chris Paul — 2006–2011 全标 SG
  kiddja01: "PG", // Jason Kidd — 除 2012 外全标 SG
  // R108 1995 森林狼无控卫：三人现实里全是正牌控卫，老数据 "G" 一律被归成 SG，且都在 2012 换数据源前退役、R106 审计无法对照
  garlawi01: "PG", // Winston Garland — 生涯全程 PG
  martida01: "PG", // Darrick Martin — 生涯全程 PG
  eisleho01: "PG", // Howard Eisley — 生涯全程 PG
  // R106 审计修复（P0-PG，21 人）
  adamsmi01: "PG", // Michael Adams
  anderke01: "PG", // Kenny Anderson
  baglejo01: "PG", // John Bagley
  bingda01: "PG", // Dave Bing
  blaylmo01: "PG", // Mookie Blaylock
  cassesa01: "PG", // Sam Cassell
  davisba01: "PG", // Baron Davis
  fordph01: "PG", // Phil Ford
  francst01: "PG", // Steve Francis
  fraziwa01: "PG", // Walt Frazier
  knighbr01: "PG", // Brevin Knight
  leverfa01: "PG", // Fat Lever
  mcmilna01: "PG", // Nate McMillan
  millean02: "PG", // Andre Miller
  richami01: "PG", // Micheal Ray Richardson
  richapo01: "PG", // Pooh Richardson
  skilesc01: "PG", // Scott Skiles
  stoudda01: "PG", // Damon Stoudamire
  tinslja01: "PG", // Jamaal Tinsley
  wattssl01: "PG", // Slick Watts
  willide01: "PG", // Deron Williams
  // R106 审计修复（P0-big，39 人）
  boozeca01: "PF", // Carlos Boozer
  bridgbi01: "PF", // Bill Bridges
  campbel01: "C", // Elden Campbell
  chandty01: "C", // Tyson Chandler
  clarkke01: "C", // Keon Clark
  colemde01: "PF", // Derrick Coleman
  colemja01: "PF", // Jack Coleman
  ellispe01: "C", // Pervis Ellison
  gallaha01: "PF", // Harry Gallatin
  griffed01: "PF", // Eddie Griffin
  hairsha01: "PF", // Happy Hairston
  hinsoro01: "PF", // Roy Hinson
  howelba01: "PF", // Bailey Howell
  hutchme01: "PF", // Mel Hutchins
  johnsgu01: "PF", // Gus Johnson
  jonesch01: "C", // Charles Jones
  kellocl01: "PF", // Clark Kellogg
  lafrera01: "C", // Raef LaFrentz
  larusru01: "PF", // Rudy LaRusso
  leecl01: "PF", // Clyde Lee
  lucasje01: "PF", // Jerry Lucas
  mcginge01: "PF", // George McGinnis
  mikkeve01: "PF", // Vern Mikkelsen
  nancela01: "PF", // Larry Nance
  naullwi01: "PF", // Willie Naulls
  okafoem01: "C", // Emeka Okafor
  perrycu01: "PF", // Curtis Perry
  randoza01: "PF", // Zach Randolph
  ratlith01: "C", // Theo Ratliff
  robintr01: "PF", // Truck Robinson
  rogerro02: "PF", // Roy Rogers
  roundda01: "PF", // Dan Roundfield
  scottra01: "PF", // Ray Scott
  smithjo03: "PF", // Josh Smith
  smithla01: "PF", // Larry Smith
  stokema01: "PF", // Maurice Stokes
  wallabe01: "C", // Ben Wallace
  webbech01: "PF", // Chris Webber
  williho01: "C", // Hot Rod Williams
  // R106 审计修复（P1-PG，59 人）
  arenagi01: "PG", // Gilbert Arenas
  augusdj01: "PG", // D.J. Augustin
  bareajo01: "PG", // J.J. Barea
  bayleje01: "PG", // Jerryd Bayless
  beaubro01: "PG", // Rodrigue Beaubois
  bibbymi01: "PG", // Mike Bibby
  blakest01: "PG", // Steve Blake
  bledser01: "PG", // Eric Bledsoe
  boykiea01: "PG", // Earl Boykins
  brookaa01: "PG", // Aaron Brooks
  brownbo02: "PG", // Bobby Brown
  bynumwi01: "PG", // Will Bynum
  caldejo01: "PG", // José Calderón
  cartean01: "PG", // Anthony Carter
  collida01: "PG", // Darren Collison
  conlemi01: "PG", // Mike Conley
  curryst01: "PG", // Stephen Curry
  douglto01: "PG", // Toney Douglas
  dragigo01: "PG", // Goran Dragić
  duhonch01: "PG", // Chris Duhon
  farmajo01: "PG", // Jordan Farmar
  feltora01: "PG", // Raymond Felton
  fishede01: "PG", // Derek Fisher
  flynnjo01: "PG", // Jonny Flynn
  fordtj01: "PG", // T.J. Ford
  harride01: "PG", // Devin Harris
  hillge01: "PG", // George Hill
  hinriki01: "PG", // Kirk Hinrich
  holidjr01: "PG", // Jrue Holiday
  jackja01: "PG", // Jarrett Jack
  jamesmi01: "PG", // Mike James
  jennibr01: "PG", // Brandon Jennings
  johnsar02: "PG", // Armon Johnson
  lawsoty01: "PG", // Ty Lawson
  linje01: "PG", // Jeremy Lin
  livinsh01: "PG", // Shaun Livingston
  lowryky01: "PG", // Kyle Lowry
  lucasjo02: "PG", // John Lucas III
  maynoer01: "PG", // Eric Maynor
  millspa02: "PG", // Patty Mills
  nelsoja01: "PG", // Jameer Nelson
  pargoja01: "PG", // Jannero Pargo
  parketo01: "PG", // Tony Parker
  priceaj01: "PG", // A.J. Price
  pricero01: "PG", // Ronnie Price
  robinna01: "PG", // Nate Robinson
  rodrise01: "PG", // Sergio Rodríguez
  rosede01: "PG", // Derrick Rose
  sessira01: "PG", // Ramon Sessions
  smithis01: "PG", // Ish Smith
  teaguje01: "PG", // Jeff Teague
  telfase01: "PG", // Sebastian Telfair
  uzohbe01: "PG", // Ben Uzoh
  vasqugr01: "PG", // Greivis Vásquez
  walljo01: "PG", // John Wall
  watsocj01: "PG", // C.J. Watson
  watsoea01: "PG", // Earl Watson
  westbru01: "PG", // Russell Westbrook
  willima01: "PG", // Mo Williams
  // R106 审计修复（P1-big，70 人）
  adrieje01: "PF", // Jeff Adrien
  amundlo01: "PF", // Lou Amundson
  anderch01: "C", // Chris Andersen
  anderry01: "PF", // Ryan Anderson
  armsthi01: "C", // Hilton Armstrong
  arthuda01: "PF", // Darrell Arthur
  bassbr01: "PF", // Brandon Bass
  biedran01: "C", // Andris Biedriņš
  booketr01: "PF", // Trevor Booker
  brockjo01: "PF", // Jon Brockman
  clarkea01: "PF", // Earl Clark
  cookbr01: "PF", // Brian Cook
  cunnida01: "PF", // Dante Cunningham
  curryed01: "C", // Eddy Curry
  davisgl01: "PF", // Glen Davis
  davisjo02: "PF", // Josh Davis
  dorsejo01: "PF", // Joey Dorsey
  evansre01: "PF", // Reggie Evans
  fosteje01: "C", // Jeff Foster
  gortama01: "C", // Marcin Gortat
  greendo01: "PF", // Donté Greene
  hansbty01: "PF", // Tyler Hansbrough
  haranlu01: "PF", // Luke Harangody
  harrimi01: "PF", // Mike Harris
  hayesch01: "C", // Chuck Hayes
  horfoal01: "C", // Al Horford
  howardw01: "C", // Dwight Howard
  howarju01: "PF", // Juwan Howard
  humphkr01: "PF", // Kris Humphries
  ilyaser01: "PF", // Ersan İlyasova
  jamisan01: "PF", // Antawn Jamison
  jeffeal01: "C", // Al Jefferson
  jeffrja01: "PF", // Jared Jeffries
  jerebjo01: "PF", // Jonas Jerebko
  jianlyi01: "PF", // Yi Jianlian
  johnsch03: "C", // Chris Johnson
  johnsja01: "PF", // James Johnson
  jonesso01: "PF", // Solomon Jones
  landrca01: "PF", // Carl Landry
  leeda02: "PF", // David Lee
  magloja01: "C", // Jamaal Magloire
  maxieja01: "PF", // Jason Maxiell
  mcrobjo01: "PF", // Josh McRoberts
  milicda01: "C", // Darko Miličić
  murphtr01: "PF", // Troy Murphy
  najered01: "PF", // Eduardo Nájera
  noahjo01: "C", // Joakim Noah
  novakst01: "PF", // Steve Novak
  pattepa01: "PF", // Patrick Patterson
  pekovni01: "C", // Nikola Peković
  randoan01: "PF", // Anthony Randolph
  randosh01: "PF", // Shavlik Randolph
  samuesa01: "C", // Samardo Samuels
  scalabr01: "PF", // Brian Scalabrine
  scolalu01: "PF", // Luis Scola
  singlja01: "PF", // James Singleton
  smithcr01: "PF", // Craig Smith
  thomaty01: "PF", // Tyrus Thomas
  turiaro01: "C", // Ronny Turiaf
  varejan01: "C", // Anderson Varejão
  villach01: "PF", // Charlie Villanueva
  wallara01: "C", // Rasheed Wallace
  waltolu01: "PF", // Luke Walton
  warriha01: "PF", // Hakim Warrick
  whitedj01: "PF", // D.J. White
  wilcoch01: "C", // Chris Wilcox
  willima02: "PF", // Marvin Williams
  willise01: "C", // Sean Williams
  willish02: "C", // Shelden Williams
  youngth01: "PF", // Thaddeus Young
  // R110 sweep：单来源 SG/SF 嫌疑逐个核对（BRef 主位置为准）后的整生涯修正。
  // SG 嫌疑 185 人 + SF 嫌疑 139 人，5 组并行核对；本块含整生涯覆盖 215 人
  // （改 PG 125、改 SF 2、改 PF 87、改 C 1，其中 24 人另有个别赛季例外，见 BY_SEASON）。
  // 已知局限：C 倾向 5 人（Cage、Dele、Dale Davis、Warner、Lorenzo Williams）先给 PF，
  // C 赛季待完整赛季表再拆；Feick、Jaric 证据混杂不动；Lucas 的 ABA 中锋赛季不在库中，无需补丁。
  // --- SG 嫌疑 → PG（整生涯）---
  daviebo01: "PG", // Bob Davies — R110 sweep
  phillan01: "PG", // Andy Phillip — R110 sweep
  senesge01: "PG", // George Senesky — R110 sweep
  martisl01: "PG", // Slater Martin — R110 sweep
  mcguidi01: "PG", // Dick McGuire — R110 sweep
  kingge01: "PG", // George King — R110 sweep
  costela01: "PG", // Larry Costello — R110 sweep
  greensi01: "PG", // Si Green — R110 sweep
  leonasl01: "PG", // Slick Leonard — R110 sweep
  mccarjo01: "PG", // Johnny McCarthy — R110 sweep
  joneskc01: "PG", // K.C. Jones — R110 sweep
  attleal01: "PG", // Al Attles — R110 sweep
  eganjo01: "PG", // Johnny Egan — R110 sweep
  komivho01: "PG", // Howard Komives — R110 sweep
  weissbo01: "PG", // Bob Weiss — R110 sweep
  robinfl01: "PG", // Flynn Robinson — R110 sweep
  williar01: "PG", // Art Williams — R110 sweep
  williro01: "PG", // Ron Williams — R110 sweep
  adelmri01: "PG", // Rick Adelman — R110 sweep
  whitejo01: "PG", // Jo Jo White — R110 sweep
  allenlu01: "PG", // Lucius Allen — R110 sweep
  beardbu01: "PG", // Butch Beard — R110 sweep
  cleamji01: "PG", // Jim Cleamons — R110 sweep
  priceji01: "PG", // Jim Price — R110 sweep
  bibbyhe01: "PG", // Henry Bibby — R110 sweep
  dudlech01: "PG", // Charles Dudley — R110 sweep
  digreer01: "PG", // Ernie DiGregorio — R110 sweep
  hendeto01: "PG", // Tom Henderson — R110 sweep
  walkefo01: "PG", // Foots Walker — R110 sweep
  willigu01: "PG", // Gus Williams — R110 sweep
  hollili01: "PG", // Lionel Hollins — R110 sweep
  mcelrji01: "PG", // Jim McElroy — R110 sweep
  taylobr01: "PG", // Brian Taylor — R110 sweep
  galemi01: "PG", // Mike Gale — R110 sweep
  leero01: "PG", // Ron Lee — R110 sweep
  bucknqu01: "PG", // Quinn Buckner — R110 sweep
  busedo01: "PG", // Don Buse — R110 sweep
  hillar01: "PG", // Armond Hill — R110 sweep
  dunlemi01: "PG", // Mike Dunleavy — R110 sweep
  jordaed01: "PG", // Eddie Jordan — R110 sweep
  willira01: "PG", // Ray Williams — R110 sweep
  bratzmi01: "PG", // Mike Bratz — R110 sweep
  greenri01: "PG", // Rickey Green — R110 sweep
  davisbr01: "PG", // Brad Davis — R110 sweep
  higgske01: "PG", // Kenny Higgs — R110 sweep
  leaveal01: "PG", // Allen Leavell — R110 sweep
  hendege01: "PG", // Gerald Henderson — R110 sweep
  hustoge01: "PG", // Geoff Huston — R110 sweep
  ranseke01: "PG", // Kelvin Ransey — R110 sweep
  matthwe01: "PG", // Wes Matthews — R110 sweep
  cookda01: "PG", // Darwin Cook — R110 sweep
  macyky01: "PG", // Kyle Macy — R110 sweep
  drewla01: "PG", // Larry Drew — R110 sweep
  romarlo01: "PG", // Lorenzo Romar — R110 sweep
  lestero01: "PG", // Ronnie Lester — R110 sweep
  sparrro01: "PG", // Rory Sparrow — R110 sweep
  sichtje01: "PG", // Jerry Sichting — R110 sweep
  johnsfr01: "PG", // Frank Johnson — R110 sweep
  valenda01: "PG", // Darnell Valentine — R110 sweep
  edwarfr01: "PG", // Franklin Edwards — R110 sweep
  floydsl01: "PG", // Sleepy Floyd — R110 sweep
  williro02: "PG", // Rob Williams — R110 sweep
  connele01: "PG", // Lester Conner — R110 sweep
  riverdo01: "PG", // Doc Rivers — R110 sweep
  whatlen01: "PG", // Ennis Whatley — R110 sweep
  walkeda01: "PG", // Darrell Walker — R110 sweep
  harpede01: "PG", // Derek Harper — R110 sweep
  lowesi01: "PG", // Sidney Lowe — R110 sweep
  threase01: "PG", // Sedale Threatt — R110 sweep
  paxsojo01: "PG", // John Paxson — R110 sweep
  flemive01: "PG", // Vern Fleming — R110 sweep
  holtomi01: "PG", // Michael Holton — R110 sweep
  webbsp01: "PG", // Spud Webb — R110 sweep
  portete01: "PG", // Terry Porter — R110 sweep
  minnidi01: "PG", // Dirk Minniefield — R110 sweep
  vincesa01: "PG", // Sam Vincent — R110 sweep
  dawkijo01: "PG", // Johnny Dawkins — R110 sweep
  smithke01: "PG", // Kenny Smith — R110 sweep
  grantga01: "PG", // Gary Grant — R110 sweep
  shawbr01: "PG", // Brian Shaw — R110 sweep
  willimi02: "PG", // Michael Williams — R110 sweep
  lesji01: "PG", // Jim Les — R110 sweep
  johnsav01: "PG", // Avery Johnson — R110 sweep
  douglsh01: "PG", // Sherman Douglas — R110 sweep
  barroda01: "PG", // Dana Barros — R110 sweep
  grantgr01: "PG", // Greg Grant — R110 sweep
  workmha01: "PG", // Haywoode Workman — R110 sweep
  abdulma02: "PG", // Mahmoud Abdul-Rauf — R110 sweep
  brownde01: "PG", // Dee Brown — R110 sweep
  robinru01: "PG", // Rumeal Robinson — R110 sweep
  colesbi01: "PG", // Bimbo Coles — R110 sweep
  anthogr01: "PG", // Greg Anthony — R110 sweep
  packro01: "PG", // Robert Pack — R110 sweep
  murdoer01: "PG", // Eric Murdock — R110 sweep
  pricebr01: "PG", // Brent Price — R110 sweep
  hurlebo01: "PG", // Bobby Hurley — R110 sweep
  childch01: "PG", // Chris Childs — R110 sweep
  wardch01: "PG", // Charlie Ward — R110 sweep
  edneyty01: "PG", // Tyus Edney — R110 sweep
  besttr01: "PG", // Travis Best — R110 sweep
  armstda01: "PG", // Darrell Armstrong — R110 sweep
  alexaco01: "PG", // Cory Alexander — R110 sweep
  snower01: "PG", // Eric Snow — R110 sweep
  mcinnje01: "PG", // Jeff McInnis — R110 sweep
  willial02: "PG", // Alvin Williams — R110 sweep
  brunsri01: "PG", // Rick Brunson — R110 sweep
  hudsotr01: "PG", // Troy Hudson — R110 sweep
  jonesda01: "PG", // Damon Jones — R110 sweep
  luety01: "PG", // Tyronn Lue — R110 sweep
  atkinch01: "PG", // Chucky Atkins — R110 sweep
  alstora01: "PG", // Rafer Alston — R110 sweep
  claxtsp01: "PG", // Speedy Claxton — R110 sweep
  arroyca01: "PG", // Carlos Arroyo Bermudez — R110 sweep
  hartja01: "PG", // Jason Hart — R110 sweep
  dickada01: "PG", // Dan Dickau — R110 sweep
  davisjo01: "PG", // Johnny Davis — R110 sweep
  // --- SG 嫌疑 → PG（个别赛季例外见 BY_SEASON）---
  mcmahja01: "PG", // Jack McMahon — R110 sweep
  georgja01: "PG", // Jack George — R110 sweep
  shuege01: "PG", // Gene Shue — R110 sweep
  abdulma01: "PG", // Mahdi Abdul-Rahman — R110 sweep
  clarkar01: "PG", // Archie Clark — R110 sweep
  murphca01: "PG", // Calvin Murphy — R110 sweep
  moneyer01: "PG", // Eric Money — R110 sweep
  johnsde01: "PG", // Dennis Johnson — R110 sweep
  humphja01: "PG", // Jay Humphries — R110 sweep
  // --- SG 嫌疑 → SF（整生涯）---
  wilkebo01: "SF", // Bob Wilkerson — R110 sweep
  kukocto01: "SF", // Toni Kukoc — R110 sweep
  // --- SF 嫌疑 → PF（整生涯）---
  hitchle01: "PF", // Lew Hitch — R110 sweep
  heinsto01: "PF", // Tom Heinsohn — R110 sweep
  greenjo01: "PF", // Johnny Green — R110 sweep
  tresvjo01: "PF", // John Tresvant — R110 sweep
  washiji01: "PF", // Jim Washington — R110 sweep
  blockjo01: "PF", // John Block — R110 sweep
  kimbato01: "PF", // Toby Kimball — R110 sweep
  greenla01: "PF", // Lamar Green — R110 sweep
  heardga01: "PF", // Garfield Heard — R110 sweep
  wickssi01: "PF", // Sidney Wicks — R110 sweep
  rowecu01: "PF", // Curtis Rowe — R110 sweep
  davisdw01: "PF", // Dwight Davis — R110 sweep
  behagro01: "PF", // Ron Behagen — R110 sweep
  breweji01: "PF", // Jim Brewer — R110 sweep
  washike01: "PF", // Kermit Washington — R110 sweep
  johnsmi01: "PF", // Mickey Johnson — R110 sweep
  shumajo01: "PF", // John Shumate — R110 sweep
  kenonla01: "PF", // Larry Kenon — R110 sweep
  washiri01: "PF", // Richard Washington — R110 sweep
  hillmda01: "PF", // Darnell Hillman — R110 sweep
  kupchmi01: "PF", // Mitch Kupchak — R110 sweep
  basseti01: "PF", // Tim Bassett — R110 sweep
  warneco01: "PF", // Cornell Warner — R110 sweep
  jackslu01: "PF", // Luke Jackson — R110 sweep
  carrke01: "PF", // Kenny Carr — R110 sweep
  landsma01: "PF", // Mark Landsberger — R110 sweep
  greenda01: "PF", // David Greenwood — R110 sweep
  robincl01: "PF", // Cliff Robinson — R110 sweep
  cummipa01: "PF", // Pat Cummings — R110 sweep
  chambto01: "PF", // Tom Chambers — R110 sweep
  rambiku01: "PF", // Kurt Rambis — R110 sweep
  cummite01: "PF", // Terry Cummings — R110 sweep
  greensi02: "PF", // Sidney Green — R110 sweep
  thorpot01: "PF", // Otis Thorpe — R110 sweep
  perkisa01: "PF", // Sam Perkins — R110 sweep
  cagemi01: "PF", // Michael Cage — R110 sweep
  greenac01: "PF", // A.C. Green — R110 sweep
  gilliar01: "PF", // Armon Gilliam — R110 sweep
  andergr01: "PF", // Greg Anderson — R110 sweep
  grantho01: "PF", // Horace Grant — R110 sweep
  longgr01: "PF", // Grant Long — R110 sweep
  laneje01: "PF", // Jerome Lane — R110 sweep
  reidjr01: "PF", // J.R. Reid — R110 sweep
  daviste01: "PF", // Terry Davis — R110 sweep
  masonan01: "PF", // Anthony Mason — R110 sweep
  vaughlo01: "PF", // Loy Vaught — R110 sweep
  millste01: "PF", // Terry Mills — R110 sweep
  willija01: "PF", // Jayson Williams — R110 sweep
  laettch01: "PF", // Christian Laettner — R110 sweep
  weathcl01: "PF", // Clarence Weatherspoon — R110 sweep
  ellisla01: "PF", // Laphonso Ellis — R110 sweep
  guglito01: "PF", // Tom Gugliotta — R110 sweep
  radjadi01: "PF", // Dino Radja — R110 sweep
  bakervi01: "PF", // Vin Baker — R110 sweep
  davisan01: "PF", // Antonio Davis — R110 sweep
  jonespo01: "PF", // Popeye Jones — R110 sweep
  blounco01: "PF", // Corie Blount — R110 sweep
  marshdo01: "PF", // Donyell Marshall — R110 sweep
  grantbr01: "PF", // Brian Grant — R110 sweep
  smithmi02: "PF", // Michael Smith — R110 sweep
  smithjo02: "PF", // Joe Smith — R110 sweep
  mcdyean01: "PF", // Antonio McDyess — R110 sweep
  abdursh01: "PF", // Shareef Abdur-Rahim — R110 sweep
  walkean02: "PF", // Antoine Walker — R110 sweep
  willije01: "PF", // Jerome Williams — R110 sweep
  fortsda01: "PF", // Danny Fortson — R110 sweep
  skinnbr01: "PF", // Brian Skinner — R110 sweep
  thomake01: "PF", // Kenny Thomas — R110 sweep
  delebi01: "PF", // Bison Dele — R110 sweep
  davisda01: "PF", // Dale Davis — R110 sweep
  willilo01: "PF", // Lorenzo Williams — R110 sweep
  jonesbo01: "PF", // Bobby Jones — R110 sweep
  // --- SF 嫌疑 → PF（个别赛季例外见 BY_SEASON）---
  grabojo01: "PF", // Joe Graboski — R110 sweep
  barksdo01: "PF", // Don Barksdale — R110 sweep
  sauldwo01: "PF", // Woody Sauldsberry — R110 sweep
  boozebo01: "PF", // Bob Boozer — R110 sweep
  chapple01: "PF", // Len Chappell — R110 sweep
  lovebo01: "PF", // Bob Love — R110 sweep
  kauffbo01: "PF", // Bob Kauffman — R110 sweep
  hummejo01: "PF", // John Hummer — R110 sweep
  tomjaru01: "PF", // Rudy Tomjanovich — R110 sweep
  bantomi01: "PF", // Mike Bantom — R110 sweep
  jonesdw01: "PF", // Dwight Jones — R110 sweep
  lucasma01: "PF", // Maurice Lucas — R110 sweep
  smithch01: "PF", // Charles Smith — R110 sweep
  johnsla02: "PF", // Larry Johnson — R110 sweep
  vinceja01: "PF", // Jay Vincent — R110 sweep（SF 赛季见 BY_SEASON）
  // --- SF 嫌疑 → C（整生涯）---
  wrighlo02: "C", // Lorenzen Wright — R110 sweep
};

/**
 * 少数球员的误判只发生在个别赛季（不是整段生涯），所以不能用上面整段生涯的 bref 覆盖——那样会
 * 连带改掉他本来就标对的赛季。按 "bref:season" 精确打补丁，找不到才退回整段生涯覆盖 / 原始值。
 */
const POS_OVERRIDES_BY_SEASON = {
  // Vince Carter 2019/2020 老鹰生涯（42–43 岁替补）两个赛季被标成 PF，但他从未真正打内线——
  // 其余 20 个赛季（猛龙/篮网/魔术/太阳/独行侠/灰熊/国王）全部正确标 SF/SG，整段生涯覆盖只会
  // 把那些本来对的赛季也改错。
  "cartevi01:2019": "SF",
  "cartevi01:2020": "SF",
  // R106 P0 Elton Brand（2000–2011→PF）
  "brandel01:2000": "PF",
  "brandel01:2001": "PF",
  "brandel01:2002": "PF",
  "brandel01:2003": "PF",
  "brandel01:2004": "PF",
  "brandel01:2005": "PF",
  "brandel01:2006": "PF",
  "brandel01:2007": "PF",
  "brandel01:2008": "PF",
  "brandel01:2009": "PF",
  "brandel01:2010": "PF",
  "brandel01:2011": "PF",
  // R106 P0 Pau Gasol（2002–2011→PF）
  "gasolpa01:2002": "PF",
  "gasolpa01:2003": "PF",
  "gasolpa01:2004": "PF",
  "gasolpa01:2005": "PF",
  "gasolpa01:2006": "PF",
  "gasolpa01:2007": "PF",
  "gasolpa01:2008": "PF",
  "gasolpa01:2009": "PF",
  "gasolpa01:2010": "PF",
  "gasolpa01:2011": "PF",
  // R106 P0 Jermaine O'Neal（1997–2011→C）
  "onealje01:1997": "C",
  "onealje01:1998": "C",
  "onealje01:1999": "C",
  "onealje01:2000": "C",
  "onealje01:2001": "C",
  "onealje01:2002": "C",
  "onealje01:2003": "C",
  "onealje01:2004": "C",
  "onealje01:2005": "C",
  "onealje01:2006": "C",
  "onealje01:2007": "C",
  "onealje01:2008": "C",
  "onealje01:2009": "C",
  "onealje01:2010": "C",
  "onealje01:2011": "C",
  // R106 P1 LaMarcus Aldridge（2007–2011→PF）
  "aldrila01:2007": "PF",
  "aldrila01:2008": "PF",
  "aldrila01:2009": "PF",
  "aldrila01:2010": "PF",
  "aldrila01:2011": "PF",
  // R106 P1 Andrea Bargnani（2007–2011→PF）
  "bargnan01:2007": "PF",
  "bargnan01:2008": "PF",
  "bargnan01:2009": "PF",
  "bargnan01:2010": "PF",
  "bargnan01:2011": "PF",
  // R106 P1 DeJuan Blair（2010–2011→PF）
  "blairde01:2010": "PF",
  "blairde01:2011": "PF",
  // R106 P1 Andray Blatche（2006–2011→PF）
  "blatcan01:2006": "PF",
  "blatcan01:2007": "PF",
  "blatcan01:2008": "PF",
  "blatcan01:2009": "PF",
  "blatcan01:2010": "PF",
  "blatcan01:2011": "PF",
  // R106 P1 Matt Bonner（2005–2011→PF）
  "bonnema01:2005": "PF",
  "bonnema01:2006": "PF",
  "bonnema01:2007": "PF",
  "bonnema01:2008": "PF",
  "bonnema01:2009": "PF",
  "bonnema01:2010": "PF",
  "bonnema01:2011": "PF",
  // R106 P1 Chris Bosh（2004–2011→PF; 2007–2010→C）
  "boshch01:2004": "PF",
  "boshch01:2005": "PF",
  "boshch01:2006": "PF",
  "boshch01:2008": "PF",
  "boshch01:2011": "PF",
  "boshch01:2007": "C",
  "boshch01:2009": "C",
  "boshch01:2010": "C",
  // R106 P1 Nick Collison（2005–2011→PF）
  "collini01:2005": "PF",
  "collini01:2006": "PF",
  "collini01:2007": "PF",
  "collini01:2008": "PF",
  "collini01:2009": "PF",
  "collini01:2010": "PF",
  "collini01:2011": "PF",
  // R106 P1 Derrick Favors（2011→PF）
  "favorde01:2011": "PF",
  // R106 P1 Taj Gibson（2010–2011→PF）
  "gibsota01:2010": "PF",
  "gibsota01:2011": "PF",
  // R106 P1 Drew Gooden（2003–2011→PF）
  "goodedr01:2003": "PF",
  "goodedr01:2004": "PF",
  "goodedr01:2005": "PF",
  "goodedr01:2006": "PF",
  "goodedr01:2007": "PF",
  "goodedr01:2008": "PF",
  "goodedr01:2009": "PF",
  "goodedr01:2010": "PF",
  "goodedr01:2011": "PF",
  // R106 P1 Blake Griffin（2011→PF）
  "griffbl01:2011": "PF",
  // R106 P1 Al Harrington（1999–2011→PF）
  "harrial01:1999": "PF",
  "harrial01:2000": "PF",
  "harrial01:2001": "PF",
  "harrial01:2002": "PF",
  "harrial01:2003": "PF",
  "harrial01:2004": "PF",
  "harrial01:2005": "PF",
  "harrial01:2006": "PF",
  "harrial01:2007": "PF",
  "harrial01:2008": "PF",
  "harrial01:2009": "PF",
  "harrial01:2010": "PF",
  "harrial01:2011": "PF",
  // R106 P1 J.J. Hickson（2009–2011→PF）
  "hicksjj01:2009": "PF",
  "hicksjj01:2010": "PF",
  "hicksjj01:2011": "PF",
  // R106 P1 Nenê（2003–2011→PF）
  "hilarne01:2003": "PF",
  "hilarne01:2004": "PF",
  "hilarne01:2005": "PF",
  "hilarne01:2007": "PF",
  "hilarne01:2008": "PF",
  "hilarne01:2009": "PF",
  "hilarne01:2010": "PF",
  "hilarne01:2011": "PF",
  // R106 P1 Jordan Hill（2010–2011→PF）
  "hilljo01:2010": "PF",
  "hilljo01:2011": "PF",
  // R106 P1 Serge Ibaka（2010→PF; 2011→C）
  "ibakase01:2010": "PF",
  "ibakase01:2011": "C",
  // R106 P1 Amir Johnson（2007→C; 2008–2011→PF）
  "johnsam01:2007": "C",
  "johnsam01:2008": "PF",
  "johnsam01:2009": "PF",
  "johnsam01:2010": "PF",
  "johnsam01:2011": "PF",
  // R106 P1 Kevin Love（2009–2011→PF）
  "loveke01:2009": "PF",
  "loveke01:2010": "PF",
  "loveke01:2011": "PF",
  // R106 P1 Kenyon Martin（2001–2002→C; 2003–2011→PF）
  "martike01:2001": "C",
  "martike01:2002": "C",
  "martike01:2003": "PF",
  "martike01:2004": "PF",
  "martike01:2005": "PF",
  "martike01:2006": "PF",
  "martike01:2008": "PF",
  "martike01:2009": "PF",
  "martike01:2010": "PF",
  "martike01:2011": "PF",
  // R106 P1 Paul Millsap（2007–2011→PF）
  "millspa01:2007": "PF",
  "millspa01:2008": "PF",
  "millspa01:2009": "PF",
  "millspa01:2010": "PF",
  "millspa01:2011": "PF",
  // R106 P1 Jeff Ayres（2010→PF）
  "pendeje02:2010": "PF",
  // R106 P1 Larry Sanders（2011→PF）
  "sandela01:2011": "PF",
  // R106 P1 Kevin Séraphin（2011→PF）
  "serapke01:2011": "PF",
  // R106 P1 Jason Smith（2008–2011→PF）
  "smithja02:2008": "PF",
  "smithja02:2010": "PF",
  "smithja02:2011": "PF",
  // R106 P1 Tiago Splitter（2011→PF）
  "splitti01:2011": "PF",
  // R106 P1 Amar'e Stoudemire（2003–2010→PF; 2004–2011→C）
  "stoudam01:2003": "PF",
  "stoudam01:2007": "PF",
  "stoudam01:2009": "PF",
  "stoudam01:2010": "PF",
  "stoudam01:2004": "C",
  "stoudam01:2005": "C",
  "stoudam01:2008": "C",
  "stoudam01:2011": "C",
  // R106 P1 Kurt Thomas（1996–2011→PF; 2005→C）
  "thomaku01:1996": "PF",
  "thomaku01:1997": "PF",
  "thomaku01:1998": "PF",
  "thomaku01:1999": "PF",
  "thomaku01:2000": "PF",
  "thomaku01:2001": "PF",
  "thomaku01:2002": "PF",
  "thomaku01:2003": "PF",
  "thomaku01:2004": "PF",
  "thomaku01:2006": "PF",
  "thomaku01:2007": "PF",
  "thomaku01:2008": "PF",
  "thomaku01:2009": "PF",
  "thomaku01:2010": "PF",
  "thomaku01:2011": "PF",
  "thomaku01:2005": "C",
  // R106 P1 Jason Thompson（2009–2011→PF）
  "thompja02:2009": "PF",
  "thompja02:2010": "PF",
  "thompja02:2011": "PF",
  // R106 P1 Ekpe Udoh（2011→C）
  "udohek01:2011": "C",
  // R106 P1 David West（2004–2011→PF）
  "westda01:2004": "PF",
  "westda01:2005": "PF",
  "westda01:2006": "PF",
  "westda01:2007": "PF",
  "westda01:2008": "PF",
  "westda01:2009": "PF",
  "westda01:2010": "PF",
  "westda01:2011": "PF",
  // R106 P1 Brandan Wright（2008–2011→PF）
  "wrighbr03:2008": "PF",
  "wrighbr03:2009": "PF",
  "wrighbr03:2011": "PF",
  // R107 拆 bref 合并后补丁（talldata 季原标 SF，按 R106 分流规则应为 PF）
  "davised01:2011": "PF",
  "mbahalu01:2009": "PF",
  "mbahalu01:2010": "PF",
  "mbahalu01:2011": "PF",
  // R110 sweep：按赛季拆分（整生涯覆盖会改错本来就对的赛季）。
  // --- 整生涯 PG 的 SG 赛季例外 ---
  "mcmahja01:1957": "SG", // Jack McMahon — R110 sweep
  "mcmahja01:1958": "SG", // Jack McMahon — R110 sweep
  "georgja01:1957": "SG", // Jack George — R110 sweep
  "shuege01:1958": "SG", // Gene Shue — R110 sweep
  "abdulma01:1965": "SG", // Mahdi Abdul-Rahman — R110 sweep
  "abdulma01:1966": "SG", // Mahdi Abdul-Rahman — R110 sweep
  "clarkar01:1967": "SG", // Archie Clark — R110 sweep
  "clarkar01:1969": "SG", // Archie Clark — R110 sweep
  "murphca01:1978": "SG", // Calvin Murphy — R110 sweep
  "murphca01:1980": "SG", // Calvin Murphy — R110 sweep
  "moneyer01:1975": "SG", // Eric Money — R110 sweep
  "johnsde01:1977": "SG", // Dennis Johnson — R110 sweep
  "johnsde01:1978": "SG", // Dennis Johnson — R110 sweep
  "johnsde01:1979": "SG", // Dennis Johnson — R110 sweep
  "johnsde01:1980": "SG", // Dennis Johnson — R110 sweep
  "humphja01:1985": "SG", // Jay Humphries — R110 sweep
  "humphja01:1990": "SG", // Jay Humphries — R110 sweep
  "humphja01:1993": "SG", // Jay Humphries — R110 sweep
  "humphja01:1994": "SG", // Jay Humphries — R110 sweep
  "humphja01:1995": "SG", // Jay Humphries — R110 sweep
  // --- 整生涯 PF 的例外赛季 ---
  "grabojo01:1952": "C", // Joe Graboski — R110 sweep
  "grabojo01:1953": "C", // Joe Graboski — R110 sweep
  "barksdo01:1955": "SF", // Don Barksdale — R110 sweep
  "sauldwo01:1959": "C", // Woody Sauldsberry — R110 sweep
  "boozebo01:1964": "SF", // Bob Boozer — R110 sweep
  "chapple01:1965": "C", // Len Chappell — R110 sweep
  "chapple01:1967": "C", // Len Chappell — R110 sweep
  "lovebo01:1976": "SF", // Bob Love — R110 sweep
  "kauffbo01:1969": "C", // Bob Kauffman — R110 sweep
  "kauffbo01:1971": "C", // Bob Kauffman — R110 sweep
  "kauffbo01:1973": "SF", // Bob Kauffman — R110 sweep
  "hummejo01:1971": "C", // John Hummer — R110 sweep
  "tomjaru01:1974": "SF", // Rudy Tomjanovich — R110 sweep
  "bantomi01:1978": "SF", // Mike Bantom — R110 sweep
  "jonesdw01:1975": "C", // Dwight Jones — R110 sweep
  "jonesdw01:1976": "C", // Dwight Jones — R110 sweep
  "smithch01:1991": "SF", // Charles Smith — R110 sweep
  "smithch01:1992": "SF", // Charles Smith — R110 sweep
  "smithch01:1993": "SF", // Charles Smith — R110 sweep
  "smithch01:1994": "SF", // Charles Smith — R110 sweep
  "smithch01:1995": "SF", // Charles Smith — R110 sweep
  "johnsla02:1997": "SF", // Larry Johnson — R110 sweep
  "johnsla02:1998": "SF", // Larry Johnson — R110 sweep
  "johnsla02:1999": "SF", // Larry Johnson — R110 sweep
  // --- Jay Vincent：SF 赛季（其余赛季 PF）---
  "vinceja01:1984": "SF", // Jay Vincent — R110 sweep
  "vinceja01:1987": "SF", // Jay Vincent — R110 sweep
  "vinceja01:1988": "SF", // Jay Vincent — R110 sweep
  "vinceja01:1989": "SF", // Jay Vincent — R110 sweep
  "vinceja01:1990": "SF", // Jay Vincent — R110 sweep
  // --- 无整生涯覆盖的按赛季拆分 ---
  "sprewla01:1999": "SF", // Latrell Sprewell — R110 sweep
  "sprewla01:2000": "SF", // Latrell Sprewell — R110 sweep
  "sprewla01:2001": "SF", // Latrell Sprewell — R110 sweep
  "sprewla01:2002": "SF", // Latrell Sprewell — R110 sweep
  "sprewla01:2003": "SF", // Latrell Sprewell — R110 sweep
  "sprewla01:2004": "SF", // Latrell Sprewell — R110 sweep
  "sprewla01:2005": "SF", // Latrell Sprewell — R110 sweep
  "roseja01:1997": "SF", // Jalen Rose — R110 sweep
  "roseja01:1998": "SF", // Jalen Rose — R110 sweep
  "roseja01:1999": "SF", // Jalen Rose — R110 sweep
  "roseja01:2000": "SF", // Jalen Rose — R110 sweep
  "roseja01:2001": "SF", // Jalen Rose — R110 sweep
  "roseja01:2002": "SF", // Jalen Rose — R110 sweep
  "roseja01:2003": "SF", // Jalen Rose — R110 sweep
  "roseja01:2004": "PG", // Jalen Rose — R110 sweep
  "roseja01:2007": "SF", // Jalen Rose — R110 sweep
  "finlemi01:1996": "SF", // Michael Finley — R110 sweep
  "finlemi01:1997": "SF", // Michael Finley — R110 sweep
  "finlemi01:1998": "SF", // Michael Finley — R110 sweep
  "finlemi01:1999": "SF", // Michael Finley — R110 sweep
  "finlemi01:2000": "SF", // Michael Finley — R110 sweep
  "finlemi01:2001": "SF", // Michael Finley — R110 sweep
  "finlemi01:2002": "SF", // Michael Finley — R110 sweep
  "finlemi01:2003": "SF", // Michael Finley — R110 sweep
  "maxwece01:1979": "PF", // Cedric Maxwell — R110 sweep
  "maxwece01:1980": "PF", // Cedric Maxwell — R110 sweep
  "maxwece01:1981": "PF", // Cedric Maxwell — R110 sweep
  "maxwece01:1982": "PF", // Cedric Maxwell — R110 sweep
  "maxwece01:1983": "PF", // Cedric Maxwell — R110 sweep
  "maxwece01:1984": "PF", // Cedric Maxwell — R110 sweep
  "maxwece01:1985": "PF", // Cedric Maxwell — R110 sweep
};

/** Recover wiped box-score fields (some scrape rows lost PPG/FGA/BPG/…). */
function repairSeasonStats(r) {
  let ppg = +r.ppg || 0;
  let rpg = +r.rpg || 0;
  let apg = +r.apg || 0;
  let fga = +r.fga || 0;
  let spg = +r.spg || 0;
  let bpg = +r.bpg || 0;
  const tpg = +r.tpg || 0;
  const mpg = +r.mpg || 15;
  const gp = +r.gp || 20;
  const fg = +r.fg || 0.42;
  const tp = +r.tp || 0;
  let ft = +r.ft || 0.75;
  if (ft <= 0) ft = 0.75;
  const tpa = +r.tpa || 0;
  const brefKey = String(r.bref || "").toLowerCase();
  const pos =
    POS_OVERRIDES_BY_SEASON[`${brefKey}:${r.season}`] || POS_OVERRIDES[brefKey] || r.pos || "SF";
  if (r.bref && r.season) {
    const patched = WIPED_STAT_PATCH[`${r.bref}:${r.season}`];
    if (patched) {
      if (bpg <= 0 && patched.bpg) bpg = patched.bpg;
      if (spg <= 0 && patched.spg) spg = patched.spg;
      if (rpg <= 0 && patched.rpg) rpg = patched.rpg;
      if (apg <= 0 && patched.apg) apg = patched.apg;
    }
  }
  if (fga < 4 && tpa >= 4) fga = Math.max(tpa + 8, Math.round((tpa / 0.38) * 10) / 10);
  if (fga < 4 && ppg >= 15) fga = Math.max(12, Math.round((ppg / Math.max(fg * 2.15, 0.9)) * 10) / 10);
  if (ppg < 3 && fga >= 8) {
    const fgm = fga * fg;
    const tpm = tpa * tp;
    const fta = fga * 0.3;
    ppg = Math.round((fgm * 2 + tpm + fta * ft) * 10) / 10;
  }
  return { ppg, rpg, apg, spg, bpg, tpg, mpg, gp, fg, tp, ft, fga, tpa, pos };
}

function inferArchetype(r, a) {
  const ppg = r.ppg || 0;
  const apg = r.apg || 0;
  const tpg = r.tpg || 0;
  const pos = r.pos || "";
  // KD-type: elite scorer who can on/off ball, stretch + size (plug-and-play)
  if (
    ppg >= 24 &&
    a.three >= 78 &&
    a.mid >= 78 &&
    a.scoring >= 90 &&
    apg <= 7 &&
    (pos === "SF" || pos === "PF" || pos === "SG")
  ) {
    return "versatile_scorer";
  }
  // High-usage creators who live on the ball (Westbrook / Harden profile)
  if (ppg >= 20 && apg >= 6 && tpg >= 3.2 && (pos === "PG" || pos === "SG")) return "iso_creator";
  if (apg >= 7 && (pos === "PG" || pos === "SG")) return "floor_general";
  if ((r.bpg || 0) >= 2.2) return "pest";
  if ((r.spg || 0) >= 2.0 && ppg < 18) return "pest";
  if (a.three >= 88 && apg <= 4 && a.scoring < 90) return "shooter";
  if (a.three >= 88 && ppg < 20) return "shooter";
  if ((r.rpg || 0) >= 11) return "rebounder";
  if (a.paint >= 88 && ["C", "PF"].includes(pos)) return "dominant_big";
  if (apg >= 5 && ["C", "PF"].includes(pos)) return "playmaking_big";
  if (a.defense >= 86 && ppg >= 16) return "two_way_wing";
  if (ppg >= 22) return "iso_scorer";
  return "connector";
}

function buildTags(r, tier) {
  const tags = [];
  if (r.season <= 1969) tags.push("上古神兽");
  else if (r.season <= 1989) tags.push("古典时代");
  if ((r.ppg || 0) >= 30) tags.push("得分爆炸");
  if ((r.apg || 0) >= 10) tags.push("助攻核");
  if ((r.bpg || 0) >= 3) tags.push("盖帽威胁");
  if ((r.spg || 0) >= 2.5) tags.push("抢断威胁");
  if ((r.bpg || 0) >= 2.5 && (r.fg || 0) >= 0.52 && ["C", "PF"].includes(r.pos || "")) {
    tags.push("护框中投");
  }
  if (isTwilightSeason(r)) tags.push("生涯末期");
  // Do not tag productive rotation players as「边缘人」
  if (
    (tier === "water_cooler" || tier === "undrafted_gleague") &&
    (r.mpg || 0) < 14 &&
    (r.ppg || 0) < 6 &&
    !isTwilightSeason(r)
  ) {
    tags.push("板凳深度");
  }
  return tags.slice(0, 3);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * NBA 2K-style shot / three tendencies + offense style.
 * Tendency gates WHETHER they take the shot; rating gates WHETHER it goes in.
 */
function deriveShotTendencies(r, a) {
  const tpa = a.tpa || 0;
  const fga = Math.max(a.fga || 1, 1);
  const threeRate = a.threeRate ?? tpa / fga;
  const pos = a.pos || "SF";
  const ppg = a.ppg || 0;
  const apg = a.apg || 0;

  // Three tendency: driven by actual 3PA volume, crushed for traditional bigs
  let threeTend = Math.round(threeRate * 200 + Math.min(tpa, 10) * 5.5 + (a.three - 45) * 0.4);
  if (tpa < 0.35 && ["C", "PF"].includes(pos)) threeTend = Math.min(threeTend, 10);
  if (tpa < 0.15) threeTend = Math.min(threeTend, 6);
  if (tpa < 1.0 && ["C", "PF"].includes(pos)) threeTend = Math.min(threeTend, 18);
  if ((a.three || 40) < 42) threeTend = Math.min(threeTend, Math.round((a.three || 40) * 0.28));
  if ((a.three || 40) < 50 && tpa < 2) threeTend = Math.min(threeTend, 22);
  threeTend = clamp(threeTend, 1, 99);

  // Overall shot creation hunger
  const shotTend = clamp(Math.round(32 + ppg * 1.35 + Math.min(fga, 22) * 1.6), 20, 99);

  // Zone tendencies
  let paintTend = clamp(
    Math.round(28 + (1 - Math.min(threeRate, 0.55)) * 45 + (["C", "PF"].includes(pos) ? 18 : 4) + (a.paint - 50) * 0.35),
    15,
    99
  );
  let midTend = clamp(
    Math.round(30 + (a.mid - 50) * 0.55 + (1 - Math.min(threeRate, 0.5)) * 18 - (["C"].includes(pos) ? 6 : 0)),
    12,
    95
  );
  if (threeTend >= 60) {
    paintTend = Math.round(paintTend * 0.85);
    midTend = Math.round(midTend * 0.9);
  }
  if (threeTend <= 15) {
    paintTend = clamp(paintTend + 12, 20, 99);
    midTend = clamp(midTend + 4, 12, 95);
  }

  // Offense style package
  let offenseStyle = "balanced";
  if (["C", "PF"].includes(pos) && threeTend <= 22 && paintTend >= 60) offenseStyle = "post";
  else if (threeTend >= 62 && (a.three || 0) >= 72) offenseStyle = "stretch";
  else if (threeTend >= 48 && (a.three || 0) >= 68 && apg < 5) offenseStyle = "spot";
  else if ((a.speed || 50) >= 74 && paintTend >= 55 && threeTend < 55) offenseStyle = "slash";
  else if (apg >= 7 || (a.scoring || 0) < 78 && apg >= 5) offenseStyle = "playmake";
  else if ((a.mid || 0) >= 82 && midTend >= 55) offenseStyle = "midiso";

  return { shotTend, threeTend, midTend, paintTend, offenseStyle };
}

/**
 * NBA2K-style sub-attributes, additive on top of the 14 core ratings. We don't have real
 * orb/drb, ast/tov, or shot-location splits in the source box scores (only aggregate
 * rpg/apg/tpg/fga), so these are derived the same way the rest of this file already derives
 * archetype/hiddenTier/shot tendencies from aggregate production + position priors, not new
 * raw data. Every formula has a documented fallback to the matching core attribute so old
 * save snapshots (serialized before this existed) keep working without these fields.
 */
export function deriveSubAttributes({ pos, three, mid, paint, defense, rebound, pass, speed, strength, block, steal, scoring, heightCm, offenseStyle }) {
  const p = pos || "SF";

  // 控球 (ball-handling): position prior + pass/vision + quickness. Giants who still bring
  // it up themselves (point-forwards) get a mild bump via offenseStyle="playmake".
  const handlePosBase = { PG: 72, SG: 60, SF: 48, PF: 36, C: 26 }[p] ?? 50;
  let handle = handlePosBase + (pass - 50) * 0.5 + (speed - 50) * 0.22;
  if (offenseStyle === "playmake") handle += 10;
  if (offenseStyle === "post") handle -= 8;
  if ((heightCm || 198) >= 213) handle -= 6;
  handle = clamp(Math.round(handle), 15, 99);

  // 外线防守 / 内线防守: split the single `defense` rating by zone, same spirit as the old
  // runtime-only perimeterDefenseRating() in sim.js -- except now it's a real, persisted,
  // player-facing number instead of a hidden formula nobody could see or scout.
  const perimDiscount = p === "C" ? 0.4 : p === "PF" ? 0.25 : 0;
  const mobility = clamp(((speed || 50) - 50) / 40, 0, 1);
  let perimDef = defense * (1 - perimDiscount * (1 - mobility * 0.5)) + (steal - 50) * 0.15;
  perimDef = clamp(Math.round(perimDef), 15, 99);

  const interiorBoost = { C: 1.15, PF: 1.05, SF: 0.9, SG: 0.72, PG: 0.68 }[p] ?? 0.85;
  let interiorDef = defense * interiorBoost + (block - 50) * 0.3 + (strength - 50) * 0.15 + ((heightCm || 198) - 198) * 0.25;
  interiorDef = clamp(Math.round(interiorDef), 15, 99);

  // 接球投 / 持球投: split three+mid by shot creation style -- a spot-up shooter and an
  // off-the-dribble pull-up artist can share the same raw three% and still play completely
  // different roles on offense.
  let catchShoot = three * 0.72 + mid * 0.28;
  if (offenseStyle === "spot" || offenseStyle === "stretch") catchShoot += 10;
  else if (offenseStyle === "playmake") catchShoot -= 4;
  else if (offenseStyle === "post") catchShoot -= 10;
  catchShoot = clamp(Math.round(catchShoot), 15, 99);

  let offDribble = three * 0.4 + mid * 0.45 + scoring * 0.15;
  if (offenseStyle === "midiso" || offenseStyle === "playmake") offDribble += 10;
  else if (offenseStyle === "slash") offDribble += 4;
  else if (offenseStyle === "spot") offDribble -= 10;
  offDribble = clamp(Math.round(offDribble), 15, 99);

  // 前场篮板(二次进攻) / 后场篮板: offensive boards reward size+motor far more unevenly by
  // position than defensive boards do (bigs crash, guards mostly just box out/leak out).
  const offRebPosMult = { C: 1.15, PF: 1.08, SF: 0.85, SG: 0.55, PG: 0.4 }[p] ?? 0.8;
  let offReb = rebound * offRebPosMult + (strength - 50) * 0.2 + (paint - 50) * 0.1;
  offReb = clamp(Math.round(offReb), 10, 99);

  const defRebPosMult = { C: 1.08, PF: 1.04, SF: 0.95, SG: 0.85, PG: 0.8 }[p] ?? 0.9;
  let defReb = rebound * defRebPosMult + ((heightCm || 198) - 198) * 0.15;
  defReb = clamp(Math.round(defReb), 15, 99);

  return { handle, perimDef, interiorDef, catchShoot, offDribble, offReb, defReb };
}

export const OFFENSE_STYLE_LABELS = {
  post: "低位强打",
  stretch: "空间射手",
  spot: "定点接投",
  slash: "突破杀伤",
  playmake: "持球组织",
  midiso: "中距离单打",
  balanced: "均衡进攻",
};

export function tendencyLabel(p) {
  if (!p) return "";
  const style = OFFENSE_STYLE_LABELS[p.offenseStyle] || "";
  return `投篮倾向${p.shotTend ?? "—"} · 三分倾向${p.threeTend ?? "—"} · ${style}`;
}

/** Stable 0..n-1 hash from player id (same season card → same body). */
function physHash(key, mod) {
  let h = 2166136261;
  const s = String(key || "x");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % mod;
}

/** 已知球员身高体重（cm / kg）——覆盖公式抖动，避免詹姆斯被算成 201cm. */
const PHYS_OVERRIDES = {
  jamesle01: { heightCm: 206, weightKg: 113 }, // 6'9" / 250lb
  onealsh01: { heightCm: 216, weightKg: 147 },
  garneke01: { heightCm: 211, weightKg: 100 },
  jordami01: { heightCm: 198, weightKg: 98 },
  bryanko01: { heightCm: 198, weightKg: 96 },
  duranke01: { heightCm: 211, weightKg: 109 },
  antetgi01: { heightCm: 211, weightKg: 110 },
  chambwi01: { heightCm: 216, weightKg: 125 },
  // Marcus Morris — 6'8" / ~245lb 厚实侧翼，不是瘦高
  morrima03: { heightCm: 203, weightKg: 110 },
  // Khris Middleton — real-life ~198cm/101kg stocky two-way wing; the formula was spitting
  // out 210cm "瘦高" (lanky) for him, which is backwards.
  middlkh01: { heightCm: 198, weightKg: 101 },
  // Ben Simmons — real-life 208cm/109kg; no raw height in roster.json, so the fallback formula
  // fell back to the generic "PG" bucket (188cm) since he's statistically a point guard despite
  // being a legit 6'10" forward-sized frame who can guard/create from 1 through 5.
  simmobe01: { heightCm: 208, weightKg: 109 },
};

/**
 * Height/weight for UI + future matchup use.
 * Prefer real roster fields when present; else derive from pos / strength / speed.
 */
function derivePhysique(r, { pos, strength, speed, rebound }) {
  const ov = PHYS_OVERRIDES[String(r.bref || "").toLowerCase()];
  if (ov) {
    return {
      heightCm: clamp(ov.heightCm, 170, 231),
      weightKg: clamp(ov.weightKg, 70, 160),
    };
  }
  if (r.heightCm && r.weightKg) {
    return {
      heightCm: clamp(Math.round(+r.heightCm), 170, 231),
      weightKg: clamp(Math.round(+r.weightKg), 70, 160),
    };
  }
  // inches / lbs from scrape → convert
  if (r.heightIn || r.weightLb) {
    const cm = r.heightIn ? Math.round(+r.heightIn * 2.54) : null;
    const kg = r.weightLb ? Math.round(+r.weightLb * 0.453592) : null;
    if (cm && kg) {
      return { heightCm: clamp(cm, 170, 231), weightKg: clamp(kg, 70, 160) };
    }
  }
  // NBA-ish position means (cm / kg); jitter keeps individuals distinct
  const base = {
    PG: [188, 88],
    SG: [198, 95],
    SF: [206, 102],
    PF: [211, 113],
    C: [215, 120],
  }[pos] || [200, 98];
  const key = r.bref || r.id || r.name || "x";
  const hJ = physHash(key, 13) - 6; // -6..+6
  const wJ = physHash(key + "|w", 17) - 8; // -8..+8
  // 身高跟帽/板走，不要跟力量绑死（否则瘦高中锋会又高又被算成壮）
  const block = r.bpg != null ? Number(r.bpg) : 0;
  const heightCm = clamp(
    Math.round(
      base[0] +
        hJ +
        (rebound - 50) * 0.06 +
        (block >= 1.5 ? 3 : block >= 0.8 ? 1 : 0) +
        (["C", "PF"].includes(pos) ? Math.max(0, (strength - 70) * 0.04) : 0)
    ),
    170,
    231
  );
  // 力量低 → 明显更轻，呈现瘦高
  const weightKg = clamp(
    Math.round(
      base[1] +
        wJ +
        (strength - 55) * 0.38 +
        (rebound - 50) * 0.06 -
        (speed - 60) * 0.14 -
        (block >= 1.8 && strength < 72 ? 6 : 0)
    ),
    70,
    160
  );
  return { heightCm, weightKg };
}

/** e.g. "216cm / 102kg · 瘦高" */
export function physiqueLabel(p) {
  if (!p?.heightCm || !p?.weightKg) return "";
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  let build = "";
  if (p.heightCm >= 208 && bmi < 24.5) build = " · 瘦高";
  else if (p.heightCm >= 205 && bmi < 24.8 && (p.strength || 50) < 68) build = " · 瘦高";
  else if (bmi >= 29 || (p.strength || 50) >= 88) build = " · 壮硕";
  else if (bmi >= 26.5 && (p.strength || 50) >= 72) build = " · 厚实";
  else if (bmi >= 27 && (p.strength || 50) >= 80) build = " · 厚实";
  return `${p.heightCm}cm / ${p.weightKg}kg${build}`;
}

/**
 * 体型 ↔ 速度/力量：瘦高更快更轻，壮高更慢更沉。
 * 特例（巅峰奥尼尔 / 加内特等）保留原稿，不被体型公式改写。
 */
const PHYSIQUE_ATH_EXCEPTIONS = new Set([
  "onealsh01", // Shaq — 壮硕仍有惊人第一步
  "garneke01", // KG — 瘦高却兼具力量与机动
  "antetgi01", // Giannis
  "jamesle01", // LeBron
  "barklch01", // Barkley — 矮壮坦克
  "robinda01", // Admiral
  "olajuha01", // Hakeem
  "chambwi01", // Wilt
]);

function bodyMassIndex(heightCm, weightKg) {
  const h = Number(heightCm) || 0;
  const w = Number(weightKg) || 0;
  if (h < 150 || w < 50) return null;
  return w / (h / 100) ** 2;
}

/**
 * @returns {{ speed: number, strength: number, build: string|null }}
 */
export function applyPhysiqueToAthleticism(attrs, { heightCm, weightKg, bref = "" } = {}) {
  const speed0 = Number(attrs?.speed) || 50;
  const strength0 = Number(attrs?.strength) || 50;
  const out = { speed: speed0, strength: strength0, build: null };
  if (!heightCm || !weightKg) return out;
  if (PHYSIQUE_ATH_EXCEPTIONS.has(String(bref || "").toLowerCase())) {
    out.build = "特体";
    return out;
  }
  const bmi = bodyMassIndex(heightCm, weightKg);
  if (bmi == null) return out;
  const tall = heightCm >= 203;
  const veryTall = heightCm >= 211;
  let speed = speed0;
  let strength = strength0;
  let build = null;

  if (tall && bmi < 23.8) {
    // 极瘦高：机动换吨位
    const lean = clamp((23.8 - bmi) / 3.5, 0, 1);
    speed += Math.round(5 + lean * (veryTall ? 6 : 4));
    strength -= Math.round(6 + lean * (veryTall ? 8 : 5));
    build = "瘦高";
  } else if (tall && bmi < 25.2) {
    const lean = clamp((25.2 - bmi) / 2.2, 0, 1);
    speed += Math.round(3 + lean * 3);
    strength -= Math.round(3 + lean * 4);
    build = "瘦高";
  } else if (tall && bmi >= 29.2) {
    // 壮高：吨位换脚步
    const thick = clamp((bmi - 29.2) / 4.5, 0, 1);
    speed -= Math.round(5 + thick * (veryTall ? 7 : 5));
    strength += Math.round(4 + thick * 5);
    build = "壮硕";
  } else if (tall && bmi >= 27.2) {
    const thick = clamp((bmi - 27.2) / 2.5, 0, 1);
    speed -= Math.round(2 + thick * 3);
    strength += Math.round(2 + thick * 3);
    build = "厚实";
  }

  out.speed = clamp(Math.round(speed), 28, 99);
  out.strength = clamp(Math.round(strength), 28, 99);
  out.build = build;
  return out;
}

/**
 * Overall: curated anchors may reach 98–100 (phenomenon).
 * Formula cards use efficiency / irreplaceability and hard-cap at 97.
 */
export function overall(p) {
  if (p?.ovr2k != null && p.ratingSource === "anchor") {
    return clamp(Math.round(p.ovr2k), 40, 100);
  }
  const shooting = ((p.three || 50) + (p.mid || 50) + (p.paint || 50)) / 3;
  const offense =
    (p.scoring || 50) * 0.48 + shooting * 0.3 + (p.pass || 50) * 0.12 + (p.iq || 50) * 0.1;
  const defense =
    (p.defense || 50) * 0.48 +
    (p.steal || 50) * 0.18 +
    (p.block || 40) * 0.18 +
    (p.rebound || 50) * 0.16;
  const athleticism = (p.speed || 50) * 0.42 + (p.strength || 50) * 0.28 + (p.stamina || 50) * 0.3;
  const mental = (p.clutch || 50) * 0.55 + (p.iq || 50) * 0.45;
  const pos = p.playPos || p.pos || "SF";
  let wOff = 0.48;
  let wDef = 0.24;
  let wAth = 0.14;
  let wMen = 0.14;
  if (pos === "PG") {
    wOff = 0.52;
    wDef = 0.2;
    wAth = 0.16;
  } else if (pos === "C") {
    wOff = 0.4;
    wDef = 0.32;
  } else if (pos === "PF") {
    wOff = 0.44;
    wDef = 0.28;
  } else if (pos === "SG") {
    wOff = 0.5;
    wDef = 0.22;
  }
  let ovr = offense * wOff + defense * wDef + athleticism * wAth + mental * wMen;
  if (p?.ovr2k != null) ovr = ovr * 0.65 + p.ovr2k * 0.35;
  ovr = Math.max(ovr, productionOvrFloor(p));
  const arch = p.archetype || "";
  if (arch === "versatile_scorer") ovr += 0.6;
  if (arch === "iso_creator" && (p.raw?.apg || 0) >= 10) ovr += 0.4;
  if ((p.ratingSource === "twilight" || p.twilight) && p.ovr2k != null) {
    ovr = Math.max(ovr, p.ovr2k);
    return clamp(Math.round(ovr), 40, 100);
  }
  // 98–100 = phenomenon only (anchors). Formula never hands out 99 for volume.
  return clamp(Math.round(Math.min(ovr, 97)), 40, 97);
}

/** Efficiency-aware floor — empty counting stats cannot unlock 99. */
function productionOvrFloor(p) {
  if (!p?.raw) return 0;
  return impactOvrFloor({
    ppg: p.raw.ppg || 0,
    rpg: p.raw.rpg || 0,
    apg: p.raw.apg || 0,
    spg: p.raw.spg || 0,
    bpg: p.raw.bpg || 0,
    tpg: p.raw.tpg || 0,
    fg: p.raw.fg ?? 0.42,
    tp: p.raw.tp ?? p.threeFg ?? 0.34,
    ft: p.raw.ft ?? 0.75,
    fga: p.raw.fga || Math.max(8, (p.raw.ppg || 0) * 0.7),
    tpa: p.raw.tpa || 0,
  });
}

export function clonePlayer(p) {
  return structuredClone(p);
}

/**
 * Load full historical roster (async). Safe to call multiple times.
 * Uses Cache Storage (raw JSON) + IndexedDB (processed cards) when available.
 * @param {(p: number, phase: string) => void} [onProgress] 0–1 progress callback
 */
export function loadPlayers(onProgress) {
  if (_loaded) return Promise.resolve(PLAYERS);
  if (_loading) return _loading;
  const report = (p, phase) => {
    try {
      onProgress?.(p, phase);
    } catch (_) {
      /* ignore UI errors */
    }
  };
  _loading = (async () => {
    // Fast path FIRST: IndexedDB processed cards — do NOT parse 6MB roster.json
    const fast = await loadCachedPlayersFast(report);
    if (fast?.length) {
      PLAYERS = fast;
      _loaded = true;
      report(1, "done");
      console.info(`[roster] loaded ${PLAYERS.length} cards from IndexedDB (skipped roster.json)`);
      return PLAYERS;
    }

    const { data, fromCache } = await fetchRosterJson("./js/data/roster.json", report);
    const meta = {
      version: data.version,
      generated: data.generated,
      count: (data.players || []).length,
    };
    report(0.22, fromCache ? "cache" : "download");

    // Secondary: IDB keyed by freshly parsed meta (e.g. localStorage cleared)
    const cached = await loadCachedPlayers(meta);
    if (cached?.length) {
      PLAYERS = cached;
      _loaded = true;
      report(1, "done");
      console.info(`[roster] loaded ${PLAYERS.length} cards from IndexedDB cache`);
      return PLAYERS;
    }

    const raw = data.players || [];
    buildCareerSpanIndex(raw);
    const list = new Array(raw.length);
    // Larger chunks = fewer yields = faster wall-clock on cold build
    const chunk = 800;
    report(0.25, "build");
    for (let i = 0; i < raw.length; i += chunk) {
      const end = Math.min(i + chunk, raw.length);
      for (let j = i; j < end; j++) list[j] = seasonToCard(raw[j]);
      report(0.25 + 0.7 * (end / raw.length), "build");
      await new Promise((r) => setTimeout(r, 0));
    }
    PLAYERS = list;
    _loaded = true;
    report(0.98, "build");
    console.info(`[roster] loaded ${PLAYERS.length} season cards (building cache…)`);
    // Persist in background — don't block entering home
    saveCachedPlayers(meta, PLAYERS).catch(() => {});
    report(1, "done");
    return PLAYERS;
  })().catch((err) => {
    _loading = null;
    console.error(err);
    throw err;
  });
  return _loading;
}
