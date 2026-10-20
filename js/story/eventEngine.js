import { historicalSeason } from "../data/historicalSeasons.js";

const EVENT_DEFINITIONS = [
  {
    id: "first-year-owner-test",
    chapter: "year-one",
    startOffset: 0,
    title: "老板要看见方向",
    prompt: "球队开局不顺，老板要求你在短期成绩和长期培养之间做出公开选择。你的回答会改变管理层对你的授权方式。",
    tags: ["management", "trust"],
    choices: [
      {
        id: "protect-the-plan",
        label: "坚持长期计划",
        description: "承诺培养核心，不用短期交易掩盖问题。",
        effects: { trust: 4, mediaPressure: 2, divergence: 2, relationship: { owner: 2 } },
        flags: { longPlanProtected: true },
      },
      {
        id: "trade-for-respect",
        label: "用交易换取尊重",
        description: "主动寻求即战力，先让更衣室看到胜利可能。",
        effects: { trust: -2, mediaPressure: -3, divergence: 6, relationship: { players: 2 } },
        flags: { winNowDeclared: true },
      },
      {
        id: "ask-for-evidence",
        label: "要求三个月观察期",
        description: "用数据和阶段性指标争取时间，不提前许诺结果。",
        effects: { trust: 2, mediaPressure: 1, divergence: 1, relationship: { gm: 2 } },
        flags: { evidencePlan: true },
      },
    ],
  },
  {
    id: "core-player-commitment",
    chapter: "year-one",
    startOffset: 0,
    title: "核心球员的承诺",
    prompt: "核心球员愿意留下，但希望你明确他的角色。这个选择会影响球员关系，也会影响未来的球队文化。",
    tags: ["players", "culture"],
    choices: [
      {
        id: "promise-role",
        label: "承诺核心角色",
        description: "保证他是体系中心，同时接受更高的使用压力。",
        effects: { trust: 1, mediaPressure: 2, divergence: 3, relationship: { players: 5 } },
        flags: { coreRolePromised: true },
      },
      {
        id: "share-the-ball",
        label: "强调共同成长",
        description: "不保证球权，承诺用体系让每个人都得到机会。",
        effects: { trust: 2, mediaPressure: 0, divergence: 2, relationship: { players: 2, coach: 2 } },
        flags: { sharedGrowth: true },
      },
    ],
  },
  {
    id: "second-year-trade-pressure",
    chapter: "year-two",
    startOffset: 1,
    title: "交易截止日前的压力",
    prompt: "球队进入竞争窗口，市场上出现一名明星球员。交易会提高短期上限，也可能拆散你正在建立的体系。",
    tags: ["trade", "window"],
    choices: [
      {
        id: "keep-the-core",
        label: "保留核心与选秀权",
        description: "相信已经建立的体系，拒绝用未来换取短期名气。",
        effects: { trust: 3, mediaPressure: 4, divergence: 1, relationship: { gm: 2 } },
        flags: { protectedAssets: true },
      },
      {
        id: "buy-the-star",
        label: "押注明星交易",
        description: "交出重要资产，提前把球队推入争冠窗口。",
        effects: { trust: 5, mediaPressure: -2, divergence: 8, relationship: { players: -2 } },
        flags: { winNowTrade: true },
      },
    ],
  },
  {
    id: "third-year-butterfly",
    chapter: "year-three",
    startOffset: 2,
    title: "历史开始偏离",
    prompt: "联盟已经注意到你的球队。媒体发现你提前押中了某些趋势，继续使用未来知识可能带来优势，也可能让时间线彻底失控。",
    tags: ["timeline", "media"],
    choices: [
      {
        id: "embrace-the-change",
        label: "公开拥抱改变",
        description: "承认球队正在创造新的篮球答案，接受更高曝光。",
        effects: { trust: 2, mediaPressure: 8, divergence: 10, relationship: { media: 4 } },
        flags: { publicRevolution: true },
      },
      {
        id: "hide-the-edge",
        label: "隐藏领先优势",
        description: "继续低调试验，避免让竞争对手复制你的判断。",
        effects: { trust: -1, mediaPressure: -4, divergence: 3, relationship: { media: -1 } },
        flags: { hiddenAdvantage: true },
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
  const definition = EVENT_DEFINITIONS.find((event) => event.id === eventId);
  if (!definition) throw new RangeError(`unknown story event: ${eventId}`);
  return definition;
}

function isEventResolved(story, eventId) {
  return story.eventLog.some((entry) => entry.type === "story-choice" && entry.eventId === eventId);
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
  return EVENT_DEFINITIONS.map((event) => ({
    id: event.id,
    chapter: event.chapter,
    title: event.title,
    prompt: event.prompt,
    tags: [...event.tags],
    choices: event.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      description: choice.description,
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
  if (isEventResolved(root.story, eventId)) {
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
        year: Number.isInteger(year) ? year : root.story.startYear,
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
  const startYear = root.story.startYear;
  const next = EVENT_DEFINITIONS.find((event) =>
    !isEventResolved(root.story, event.id)
    && Number.isInteger(currentYear)
    && currentYear >= startYear + (event.startOffset || 0),
  );
  if (!next) return root;
  return queueStoryEvent(root, next.id, { year: currentYear });
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
  return {
    startYear: root.story.startYear,
    currentYear: career?.season?.year ?? root.story.startYear,
    seasons,
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
  if (championships >= 2 && trust >= 55) return { id: "dynasty-builder", label: "王朝建筑师", tone: "success" };
  if (championships >= 1) return { id: "history-maker", label: "历史改写者", tone: "success" };
  if (pressure >= 85 || trust <= 20) return { id: "dismissed", label: "在压力中离任", tone: "hard" };
  return { id: "unfinished-revolution", label: "未完的革命", tone: "neutral" };
}
