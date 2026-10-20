const EVENT_DEFINITIONS = [
  {
    id: "first-year-owner-test",
    chapter: "year-one",
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
  const next = EVENT_DEFINITIONS.find((event) => !isEventResolved(root.story, event.id));
  if (!next) return root;
  return queueStoryEvent(root, next.id, {
    year: Number.isInteger(year) ? year : root.leagueCareer?.season?.year,
  });
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
  const ending = root.story.ending || (history.length >= 5 ? deriveEnding(root) : null);
  return {
    startYear: root.story.startYear,
    currentYear: career?.season?.year ?? root.story.startYear,
    seasons,
    championships,
    choices,
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
