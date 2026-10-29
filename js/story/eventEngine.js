import { historicalSeason } from "../data/historicalSeasons.js";
import { eventOnCooldown, pickNextEvent } from "../career/eventPool.js";

// EVENT_POOL: each event's `order` plus `conditions` (see js/career/eventPool.js for the matching
// rules) replace what used to be a single `startOffset` -- conditions.minTenureYear carries the
// exact same "years since this job started" meaning startOffset had (minTenureYear = startOffset
// + 1, since tenureYear is 1-indexed and startOffset was 0-indexed). The six events below are
// unchanged in content and behavior; this is a pure mechanism swap (A2 of
// docs/CAREER_LIFE_ROADMAP.md), not a redesign of the story itself. Later phases add more events
// to this same array with richer conditions (trust/pressure/mood/reputation/flags/repeatable).
const EVENT_POOL = [
  {
    id: "first-year-owner-test",
    chapter: "year-one",
    order: 0,
    conditions: { minTenureYear: 1 },
    title: "老板要看见方向",
    titleEn: "The Owner Wants a Direction",
    prompt: "球队开局不顺，老板要求你在短期成绩和长期培养之间做出公开选择。你的回答会改变管理层对你的授权方式。",
    promptEn: "The team is off to a rough start, and the owner wants a public choice between short-term results and long-term development. Your answer changes how much authority the front office gives you.",
    tags: ["management", "trust"],
    choices: [
      {
        id: "protect-the-plan",
        label: "坚持长期计划",
        labelEn: "Stick to the Long-Term Plan",
        description: "承诺培养核心，不用短期交易掩盖问题。",
        descriptionEn: "Commit to developing the core; don't paper over problems with short-term trades.",
        effects: { trust: 4, mediaPressure: 2, divergence: 2, relationship: { owner: 2 } },
        flags: { longPlanProtected: true },
      },
      {
        id: "trade-for-respect",
        label: "用交易换取尊重",
        labelEn: "Trade for Respect",
        description: "主动寻求即战力，先让更衣室看到胜利可能。",
        descriptionEn: "Go get win-now talent so the locker room sees a path to winning.",
        effects: { trust: -2, mediaPressure: -3, divergence: 6, relationship: { players: 2 } },
        flags: { winNowDeclared: true },
      },
      {
        id: "ask-for-evidence",
        label: "要求三个月观察期",
        labelEn: "Ask for Three Months",
        description: "用数据和阶段性指标争取时间，不提前许诺结果。",
        descriptionEn: "Buy time with data and staged benchmarks instead of promising results up front.",
        effects: { trust: 2, mediaPressure: 1, divergence: 1, relationship: { gm: 2 } },
        flags: { evidencePlan: true },
      },
    ],
  },
  {
    id: "core-player-commitment",
    chapter: "year-one",
    order: 1,
    conditions: { minTenureYear: 1 },
    title: "核心球员的承诺",
    titleEn: "The Core Player's Commitment",
    prompt: "核心球员愿意留下，但希望你明确他的角色。这个选择会影响球员关系，也会影响未来的球队文化。",
    promptEn: "The core player will stay, but wants his role spelled out. This choice affects player relationships — and the team's future culture.",
    tags: ["players", "culture"],
    choices: [
      {
        id: "promise-role",
        label: "承诺核心角色",
        labelEn: "Promise a Core Role",
        description: "保证他是体系中心，同时接受更高的使用压力。",
        descriptionEn: "Guarantee he is the center of the system, accepting heavier usage pressure.",
        effects: { trust: 1, mediaPressure: 2, divergence: 3, relationship: { players: 5 } },
        flags: { coreRolePromised: true },
      },
      {
        id: "share-the-ball",
        label: "强调共同成长",
        labelEn: "Emphasize Shared Growth",
        description: "不保证球权，承诺用体系让每个人都得到机会。",
        descriptionEn: "Promise no guaranteed touches, but a system where everyone gets chances.",
        effects: { trust: 2, mediaPressure: 0, divergence: 2, relationship: { players: 2, coach: 2 } },
        flags: { sharedGrowth: true },
      },
    ],
  },
  {
    id: "second-year-trade-pressure",
    chapter: "year-two",
    order: 2,
    conditions: { minTenureYear: 2 },
    title: "交易截止日前的压力",
    titleEn: "Trade-Deadline Pressure",
    prompt: "球队进入竞争窗口，市场上出现一名明星球员。交易会提高短期上限，也可能拆散你正在建立的体系。",
    promptEn: "The team is entering its window and a star is on the market. A trade raises the short-term ceiling — and could break the system you are building.",
    tags: ["trade", "window"],
    choices: [
      {
        id: "keep-the-core",
        label: "保留核心与选秀权",
        labelEn: "Keep the Core and the Picks",
        description: "相信已经建立的体系，拒绝用未来换取短期名气。",
        descriptionEn: "Trust the system you built; refuse to trade the future for short-term fame.",
        effects: { trust: 3, mediaPressure: 4, divergence: 1, relationship: { gm: 2 } },
        flags: { protectedAssets: true },
      },
      {
        id: "buy-the-star",
        label: "押注明星交易",
        labelEn: "Bet on the Star Trade",
        description: "交出重要资产，提前把球队推入争冠窗口。",
        descriptionEn: "Give up major assets to push the team into its title window early.",
        effects: { trust: 5, mediaPressure: -2, divergence: 8, relationship: { players: -2 } },
        flags: { winNowTrade: true },
      },
    ],
  },
  {
    id: "third-year-butterfly",
    chapter: "year-three",
    order: 3,
    conditions: { minTenureYear: 3 },
    title: "历史开始偏离",
    titleEn: "History Starts to Diverge",
    prompt: "联盟已经注意到你的球队。媒体发现你提前押中了某些趋势，继续使用未来知识可能带来优势，也可能让时间线彻底失控。",
    promptEn: "The league has noticed your team. The media figured out you called some trends early — leaning on future knowledge could bring an edge, or send the timeline completely off the rails.",
    tags: ["timeline", "media"],
    choices: [
      {
        id: "embrace-the-change",
        label: "公开拥抱改变",
        labelEn: "Embrace the Change Publicly",
        description: "承认球队正在创造新的篮球答案，接受更高曝光。",
        descriptionEn: "Admit the team is creating new basketball answers, and accept the bigger spotlight.",
        effects: { trust: 2, mediaPressure: 8, divergence: 10, relationship: { media: 4 } },
        flags: { publicRevolution: true },
      },
      {
        id: "hide-the-edge",
        label: "隐藏领先优势",
        labelEn: "Hide the Edge",
        description: "继续低调试验，避免让竞争对手复制你的判断。",
        descriptionEn: "Keep experimenting quietly so rivals can't copy your reads.",
        effects: { trust: -1, mediaPressure: -4, divergence: 3, relationship: { media: -1 } },
        flags: { hiddenAdvantage: true },
      },
    ],
  },
  {
    id: "fourth-year-commitment",
    chapter: "year-four",
    order: 4,
    conditions: { minTenureYear: 4 },
    title: "争冠窗口的代价",
    titleEn: "The Price of the Window",
    prompt: "球队终于进入争冠窗口，但核心球员的合同、伤病和忠诚开始互相冲突。你只能优先保护一个目标。",
    promptEn: "The team has finally reached its title window, but the core's contract, health, and loyalty are pulling in different directions. You can only protect one goal.",
    tags: ["contender", "loyalty"],
    choices: [
      {
        id: "protect-the-player",
        label: "保护核心健康",
        labelEn: "Protect the Core's Health",
        description: "牺牲一部分常规赛成绩，给核心更多休息和恢复时间。",
        descriptionEn: "Sacrifice some regular-season wins to give the core more rest and recovery.",
        effects: { trust: 3, mediaPressure: 3, divergence: 4, relationship: { players: 5, coach: -1 } },
        flags: { playerHealthFirst: true },
      },
      {
        id: "chase-every-win",
        label: "追逐每一场胜利",
        labelEn: "Chase Every Win",
        description: "把能用的资源全部投入当下，接受核心过载的风险。",
        descriptionEn: "Pour every resource into right now, accepting the risk of overloading the core.",
        effects: { trust: 4, mediaPressure: -3, divergence: 7, relationship: { coach: 2, players: -3 } },
        flags: { allInSeason: true },
      },
    ],
  },
  {
    id: "fifth-year-final-call",
    chapter: "year-five",
    order: 5,
    conditions: { minTenureYear: 5 },
    title: "最后一通电话",
    titleEn: "The Final Call",
    prompt: "五年合同即将结束。你可以留下继续守护这支球队，也可以带着已经验证的理念去开启下一段职业生涯。",
    promptEn: "The five-year deal is nearly up. You can stay and keep guarding this team, or take a proven philosophy into the next chapter of your career.",
    tags: ["ending", "career"],
    choices: [
      {
        id: "stay-and-build",
        label: "留下建立王朝",
        labelEn: "Stay and Build a Dynasty",
        description: "把未来交给这群一起成长的人，承担继续守成的压力。",
        descriptionEn: "Hand the future to the people who grew together, and carry the pressure of defending it.",
        effects: { trust: 6, mediaPressure: 4, divergence: 5, relationship: { owner: 4, players: 4 } },
        flags: { stayedForDynasty: true },
      },
      {
        id: "leave-as-legend",
        label: "带着成果离开",
        labelEn: "Leave With the Results",
        description: "接受新的挑战，让这段历史停在最好的位置。",
        descriptionEn: "Take on a new challenge and let this history end at its best.",
        effects: { trust: -2, mediaPressure: -5, divergence: 8, relationship: { owner: -3, media: 3 } },
        flags: { leftAsLegend: true },
      },
    ],
  },
];

function clone(value) {
  return structuredClone(value);
}

function requireStory(root) {
  if (!root || typeof root !== "object" || !root.story || typeof root.story !== "object") {
    throw new TypeError("root with a story is required");
  }
  if (!Array.isArray(root.story.eventLog)) {
    throw new TypeError("story eventLog must be an array");
  }
}

function definitionFor(eventId) {
  const definition = EVENT_POOL.find((event) => event.id === eventId);
  if (!definition) throw new RangeError(`unknown story event: ${eventId}`);
  return definition;
}

/** Return a copy of a story event with title/prompt/choices in the given language. */
export function localizeStoryEvent(event, lang = "zh") {
  if (!event || lang !== "en") return event;
  return {
    ...event,
    title: event.titleEn || event.title,
    prompt: event.promptEn || event.prompt,
    choices: (event.choices || []).map((c) => ({
      ...c,
      label: c.labelEn || c.label,
      description: c.descriptionEn || c.description,
    })),
  };
}

function applyEffects(story, choice, year) {
  const effects = choice.effects || {};
  const relationships = { ...(story.relationships || {}) };
  for (const [key, value] of Object.entries(effects.relationship || {})) {
    relationships[key] = (relationships[key] || 0) + value;
  }
  const flags = { ...(story.flags || {}), ...(choice.flags || {}) };
  return {
    ...story,
    frontOfficeTrust: (story.frontOfficeTrust || 0) + (effects.trust || 0),
    mediaPressure: Math.max(0, (story.mediaPressure || 0) + (effects.mediaPressure || 0)),
    timelineDivergence: Math.max(0, (story.timelineDivergence || 0) + (effects.divergence || 0)),
    relationships,
    flags,
    eventLog: [
      ...story.eventLog,
      {
        type: "story-choice",
        eventId: story.pendingDecision?.eventId,
        choiceId: choice.id,
        year: Number.isInteger(year) ? year : story.startYear,
        effects: clone(effects),
        at: Date.now(),
      },
    ],
    pendingDecision: null,
  };
}

export function listStoryEvents() {
  return EVENT_POOL.map((event) => ({
    id: event.id,
    chapter: event.chapter,
    title: event.title,
    titleEn: event.titleEn,
    prompt: event.prompt,
    promptEn: event.promptEn,
    tags: [...event.tags],
    choices: event.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      labelEn: choice.labelEn,
      description: choice.description,
      descriptionEn: choice.descriptionEn,
    })),
  }));
}

export function getStoryEvent(eventId) {
  return clone(definitionFor(eventId));
}

export function queueStoryEvent(root, eventId, { year } = {}) {
  requireStory(root);
  const event = definitionFor(eventId);
  if (root.story.pendingDecision) {
    throw new Error("another story decision is already pending");
  }
  const queueYear = Number.isInteger(year) ? year : root.story.startYear;
  if (eventOnCooldown(event, root.story.eventLog, queueYear)) {
    throw new Error(`story event already resolved: ${eventId}`);
  }
  return {
    ...root,
    story: {
      ...root.story,
      currentChapter: event.chapter,
      pendingDecision: {
        type: "story-event",
        eventId,
        year: queueYear,
      },
    },
  };
}

export function resolveStoryEvent(root, choiceId) {
  requireStory(root);
  const pending = root.story.pendingDecision;
  if (!pending || pending.type !== "story-event") {
    throw new Error("no story event is pending");
  }
  const event = definitionFor(pending.eventId);
  const choice = event.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) throw new RangeError(`unknown choice for story event: ${choiceId}`);
  return {
    ...root,
    story: applyEffects(root.story, choice, pending.year),
  };
}

export function queueNextStoryEvent(root, { year } = {}) {
  requireStory(root);
  if (root.story.pendingDecision) return root;
  const currentYear = Number.isInteger(year)
    ? year
    : root.leagueCareer?.season?.year;
  if (!Number.isInteger(currentYear)) return root;
  const startYear = root.story.startYear;
  const ctx = {
    currentYear,
    tenureYear: currentYear - startYear + 1,
    trust: root.story.frontOfficeTrust || 0,
    pressure: root.story.mediaPressure || 0,
    flags: root.story.flags || {},
  };
  const next = pickNextEvent(EVENT_POOL, root.story.eventLog, ctx);
  if (!next) return root;
  return queueStoryEvent(root, next.id, { year: currentYear });
}

export function finalizeCareerEnding(root) {
  requireStory(root);
  const history = root.leagueCareer?.management?.seasonHistory || [];
  if (history.length < 5) return root;
  if (root.story.ending) return root;
  const ending = deriveEnding(root);
  return {
    ...root,
    story: {
      ...root.story,
      currentChapter: "epilogue",
      ending,
      pendingDecision: null,
      eventLog: [
        ...root.story.eventLog,
        { type: "career-ending", year: root.leagueCareer?.season?.year, ending: clone(ending), at: Date.now() },
      ],
    },
  };
}

export function buildCareerReport(root) {
  requireStory(root);
  const career = root.leagueCareer;
  const history = career?.management?.seasonHistory || [];
  const seasons = history.map((summary) => ({
    year: summary.year,
    teamName: summary.teamName,
    record: summary.record ? { ...summary.record } : null,
    finish: summary.finish,
    champion: summary.championId === summary.teamId,
  }));
  const championships = seasons.filter((season) => season.champion).length;
  const choices = root.story.eventLog.filter((entry) => entry.type === "story-choice").length;
  const historyChanges = seasons.flatMap((season) => {
    const historical = historicalSeason(season.year);
    if (!historical || !season.champion) return [];
    const currentChampion = history.find((summary) => summary.year === season.year)?.championId;
    if (!currentChampion || currentChampion === historical.championId) return [];
    return [{
      year: season.year,
      historicalChampion: historical.championName,
      currentChampion:
        career?.season?.league?.labels?.[currentChampion] || currentChampion,
    }];
  });
  const ending = root.story.ending || (history.length >= 5 ? deriveEnding(root) : null);
  const rankedSeasons = seasons
    .filter((season) => season.record)
    .sort((left, right) => (right.record.w - right.record.l) - (left.record.w - left.record.l));
  return {
    startYear: root.story.startYear,
    currentYear: career?.season?.year ?? root.story.startYear,
    seasons,
    seasonCount: seasons.length,
    maxSeasons: 5,
    finished: seasons.length >= 5,
    bestSeason: rankedSeasons[0] || null,
    championships,
    choices,
    historyChanges,
    timelineDivergence: root.story.timelineDivergence || 0,
    frontOfficeTrust: root.story.frontOfficeTrust || 0,
    mediaPressure: root.story.mediaPressure || 0,
    ending,
  };
}

export function deriveEnding(root) {
  requireStory(root);
  const history = root.leagueCareer?.management?.seasonHistory || [];
  const championships = history.filter((summary) => summary.championId === summary.teamId).length;
  const trust = root.story.frontOfficeTrust || 0;
  const pressure = root.story.mediaPressure || 0;
  if (championships >= 2 && trust >= 55) return { id: "dynasty-builder", label: "王朝建筑师", labelEn: "Dynasty Builder", tone: "success" };
  if (championships >= 1) return { id: "history-maker", label: "历史改写者", labelEn: "History Maker", tone: "success" };
  if (pressure >= 85 || trust <= 20) return { id: "dismissed", label: "在压力中离任", labelEn: "Departed Under Pressure", tone: "hard" };
  return { id: "unfinished-revolution", label: "未完的革命", labelEn: "Unfinished Revolution", tone: "neutral" };
}
