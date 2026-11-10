/**
 * Shared Career Inbox (Career 2.0, workstream A).
 *
 * The engine of Career 2.0: one reusable career-event system shared by the
 * Player, Coach and GM careers. It screens state-driven events, holds the
 * pending queue, applies decisions and records the history — but it never
 * plays games and never invents outcomes. GameSim stays the sole authority
 * on game results; the view (js/ui/careerInboxView.js) drives real games
 * and hands this module the resulting state.
 *
 * Reuse (audited 2026-11-10 before writing anything new):
 * - js/career/eventPool.js — `eventMatches` for the shared condition
 *   vocabulary (trust / pressure / mood / reputation ranges, flags,
 *   tenure). The inbox adds its own game-level conditions on top
 *   (losing streak, core line, game index, week) via inboxEventMatches;
 *   eventPool.js itself is untouched.
 * - js/story/eventEngine.js — the effect shape { trust, mediaPressure,
 *   divergence, relationship } and the history entry shape
 *   { type: "story-choice", eventId, choiceId, year, effects, at }.
 *   Inbox records use the same shapes so the two systems stay mutually
 *   readable; the inbox keeps its own log inside root.careerInbox and
 *   never writes into root.story.
 * - js/career/calendar.js — GAMES_PER_WEEK (4) for week boundaries.
 * - js/reborn/trust.js — the 0-100 trust scale (TRUST_START 25).
 *
 * Rules:
 * - Events are STATE-DRIVEN. Every event definition carries `conditions`
 *   that must hold in the live career state (contracts, role demands,
 *   team state, trust / pressure). Nothing fires on an unconditional
 *   random popup, and there is no Math.random anywhere in this module —
 *   screening is deterministic (lowest `order` among eligible, same rule
 *   as eventPool.pickNextEvent).
 * - Every event carries who initiated it, why now, the player's choices,
 *   what each choice affects, and when the consequences appear (see the
 *   `consequence` text on each choice and the `followUp` on each result).
 * - New state is additive and optional only: root.careerInbox (version 1)
 *   is validated by validateCareerInbox() when present, never required.
 *   Existing fields are never changed.
 */
import { eventMatches } from "./eventPool.js";
import { GAMES_PER_WEEK } from "./calendar.js";

export const CAREER_INBOX_VERSION = 1;

/** Games per week — the inbox's week boundaries match the career calendar. */
export const INBOX_GAMES_PER_WEEK = GAMES_PER_WEEK;

/** The trade deadline opens at this 0-based game index (82-game season). */
export const TRADE_DEADLINE_OPENS_AT = 50;
/** The trade deadline closes after this 0-based game index. */
export const TRADE_DEADLINE_CLOSES_AT = 58;

/** News is a rolling feed, not an archive — oldest entries drop past this. */
export const INBOX_NEWS_CAP = 50;
/** History is the career record; the cap only stops unbounded save growth. */
export const INBOX_HISTORY_CAP = 200;

/** Urgency levels. Urgent events pause the timeline when they appear; normal ones wait. */
export const INBOX_URGENCY = ["urgent", "normal"];

/** Career-state vocabulary shared with js/story/eventEngine.js. */
export const INBOX_RELATIONSHIPS = ["owner", "players", "gm", "coach", "media"];

/**
 * The three event types of the first slice. Each is a definition, not an
 * instance: screening builds an instance (with the real names and numbers
 * from the live state) when the conditions hold.
 *
 * conditions — the shared eventPool vocabulary (minTrust, maxPressure,
 * requiresFlags, ...) plus inbox-level conditions, all checked by
 * inboxEventMatches against the context built by buildInboxContext():
 *   minLosingStreak — the team has lost this many in a row
 *   coreBelowAverage — the core's last game scored below his season average
 *   minGameIndex / maxGameIndex — the 0-based game index window
 *   minWeek — the season week (1-based)
 *   requiresProspect / requiresVeteran — the context carries one
 */
export const INBOX_EVENTS = [
  {
    id: "core-demands-touches",
    kind: "role-demand",
    urgency: "urgent",
    order: 0,
    tags: ["players", "trust"],
    cooldownGames: 10,
    title: "核心要求更多出手权",
    titleEn: "The Core Wants More Touches",
    prompt:
      "球队最近连续输球。核心球员认为现有进攻体系没有发挥他的优势，要求未来几场给他更多出手权。",
    promptEn:
      "The team has lost several in a row. The core player thinks the current offense is not using him, and wants more touches over the next few games.",
    conditions: { minLosingStreak: 3, coreBelowAverage: true },
    choices: [
      {
        id: "promise-touches",
        label: "承诺未来 5 场给他更多出手",
        labelEn: "Promise him more touches for 5 games",
        description: "答应调整进攻重心，让核心在接下来 5 场里承担更多终结任务。",
        descriptionEn: "Agree to shift the offense so the core finishes more plays over the next 5 games.",
        consequence:
          "信任 +2；5 场后自动检查：核心场均 15+ 分算兑现（信任 +5），否则算违约（信任 −6，交易申请风险）。",
        consequenceEn:
          "Trust +2; checked automatically after 5 games: core averaging 15+ pts counts as kept (trust +5), otherwise broken (trust −6, trade-request risk).",
        effects: { trust: 2, relationship: { players: 2 } },
        flags: {},
        promise: {
          kind: "core-touches",
          games: 5,
          minCorePtsPerGame: 15,
          text: "未来 5 场给核心更多出手",
          textEn: "More touches for the core over the next 5 games",
        },
      },
      {
        id: "adjust-rotation",
        label: "调整轮换，给他更多上场时间",
        labelEn: "Adjust the rotation, give him more minutes",
        description: "不承诺球权，但把他的轮换顺位提前，用上场时间回应诉求。",
        descriptionEn: "No promise on touches, but move him up the rotation and answer with minutes.",
        consequence: "信任 +3；轮换已调整（记录在案，教练线可消费）。",
        consequenceEn: "Trust +3; the rotation is adjusted (recorded, consumable by the Coach line).",
        effects: { trust: 3, divergence: 1 },
        flags: { rotationAdjusted: true },
      },
      {
        id: "hold-system",
        label: "坚持体系，拒绝",
        labelEn: "Hold the system, refuse",
        description: "告诉核心体系高于个人，拒绝为他一个人改进攻。",
        descriptionEn: "Tell the core the system comes before any one player, and refuse to change the offense for him.",
        consequence: "信任 −4；球员关系 −2；媒体压力 +2；核心可能在之后申请交易。",
        consequenceEn: "Trust −4; player relationships −2; media pressure +2; the core may ask for a trade later.",
        effects: { trust: -4, mediaPressure: 2, relationship: { players: -2 } },
        flags: { coreUnhappy: true },
      },
    ],
  },
  {
    id: "scout-report-gem",
    kind: "scout-report",
    urgency: "normal",
    order: 1,
    tags: ["scout", "draft"],
    cooldownGames: 20,
    title: "球探发现一名被低估的新秀",
    titleEn: "A Scout Found an Undervalued Prospect",
    prompt:
      "这名年轻球员的比赛数据一般，但球探认为他拥有罕见的成长潜力。数据是公开的，判断是球探的——球探也可能看错。",
    promptEn:
      "This young player's box-score numbers are ordinary, but a scout thinks he has rare growth potential. The numbers are public; the judgment is the scout's — and scouts can be wrong.",
    conditions: { minWeek: 2, requiresProspect: true },
    choices: [
      {
        id: "investigate",
        label: "深入调查：看试训报告",
        labelEn: "Investigate: read the tryout report",
        description: "让球探把评估依据写清楚：年龄、运动能力、现有水平。",
        descriptionEn: "Ask the scout to spell out the case: age, athleticism, current level.",
        consequence: "评估依据写入生涯记录（GM 球探系统可消费）；不改变任何属性。",
        consequenceEn: "The case is written into the career record (consumable by the GM scouting system); no attribute changes.",
        effects: { divergence: 1 },
        flags: {},
      },
      {
        id: "target-prospect",
        label: "列为重点目标",
        labelEn: "Mark him as a priority target",
        description: "把他放进重点观察名单，选秀或签约时优先考虑。",
        descriptionEn: "Put him on the priority watch list for the draft or a signing.",
        consequence: "管理层关系 +2；该球员被标记为重点目标（记录在案）。",
        consequenceEn: "Front-office relationships +2; the player is flagged as a priority target (recorded).",
        effects: { relationship: { gm: 2 } },
        flags: {},
      },
      {
        id: "pass",
        label: "暂不关注",
        labelEn: "Pass for now",
        description: "数据太平淡，先不花精力；以后还可以再看。",
        descriptionEn: "The numbers are too flat to spend energy on; he can be revisited later.",
        consequence: "无即时影响；该球员被标记为已放弃（本赛季不再重复上报）。",
        consequenceEn: "No immediate effect; the player is marked passed (not reported again this season).",
        effects: {},
        flags: {},
      },
    ],
  },
  {
    id: "trade-deadline-interest",
    kind: "league-news",
    urgency: "urgent",
    order: 2,
    tags: ["trade", "deadline"],
    cooldownGames: 0,
    title: "交易截止日：争冠球队想要你的老将",
    titleEn: "Trade Deadline: A Contender Wants Your Veteran",
    prompt:
      "交易截止日临近，一支争冠球队正在寻找经验丰富的内线球员。你的老将是对方点名要的人。",
    promptEn:
      "The trade deadline is near, and a contending team is looking for a veteran big. Your veteran is the one they named.",
    conditions: {
      minGameIndex: TRADE_DEADLINE_OPENS_AT,
      maxGameIndex: TRADE_DEADLINE_CLOSES_AT,
      requiresVeteran: true,
    },
    choices: [
      {
        id: "offer-veteran",
        label: "送出老将，换未来选秀权",
        labelEn: "Trade the veteran for a future pick",
        description: "接受对方的报价：老将去争冠，球队换回一个未来选秀权。",
        descriptionEn: "Accept the offer: the veteran goes to a contender, the team gets a future pick back.",
        consequence: "信任 +3；老将关系 −5；时间线偏离 +4（这次交易会被历史记住）。",
        consequenceEn: "Trust +3; veteran relationship −5; timeline divergence +4 (history will remember this trade).",
        effects: { trust: 3, divergence: 4, relationship: { players: -5 } },
        flags: { veteranTraded: true },
      },
      {
        id: "ask-more",
        label: "要求更多回报",
        labelEn: "Ask for more in return",
        description: "告诉对方一个选秀权不够，要加一名年轻球员或再一个选秀权。",
        descriptionEn: "Tell them one pick is not enough — add a young player or another pick.",
        consequence: "信任 +1；对方管理层关系 −2；对方是否回价由谈判系统决定（GM 线）。",
        consequenceEn: "Trust +1; the other front office −2; whether they come back is for the negotiation system (GM line).",
        effects: { trust: 1, relationship: { gm: -2 } },
        flags: { deadlineAskedMore: true },
      },
      {
        id: "keep-veteran",
        label: "留下老将冲季后赛",
        labelEn: "Keep the veteran for the playoff push",
        description: "拒绝交易：老将的经验是季后赛要用的，选秀权以后再说。",
        descriptionEn: "Refuse the trade: the veteran's experience is for the playoffs; picks can wait.",
        consequence: "信任 +2；老将关系 +3；交易截止日后不再重复出现。",
        consequenceEn: "Trust +2; veteran relationship +3; this does not come back after the deadline.",
        effects: { trust: 2, relationship: { players: 3 } },
        flags: { veteranKept: true },
      },
    ],
  },
];

export function inboxEventById(eventId) {
  const event = INBOX_EVENTS.find((candidate) => candidate.id === eventId);
  if (!event) throw new RangeError(`unknown inbox event: ${eventId}`);
  return event;
}

/** The default career state the inbox effects apply to (same scale as the story engine). */
export function defaultInboxState() {
  return {
    trust: 25,
    mediaPressure: 10,
    divergence: 0,
    relationships: { owner: 0, players: 0, gm: 0, coach: 0, media: 0 },
    flags: {},
  };
}

/**
 * The inbox object. `pending` holds screened instances waiting for a
 * choice; `news` is the rolling feed of ordinary events; `resolved` holds
 * finished instances (for cooldown + history); `promises` holds open
 * promises; `history` is the full career record; `evidence` is the
 * per-game observation log promises are checked against.
 */
export function createInbox({ role = "coach", seasonYear = 1997, teamId = null } = {}) {
  return {
    version: CAREER_INBOX_VERSION,
    role,
    seasonYear,
    teamId,
    pending: [],
    news: [],
    resolved: [],
    promises: [],
    history: [],
    evidence: [],
    flags: {},
  };
}

/**
 * The whole slice state persisted under root.careerInbox. `demo` is the
 * demo-season progress owned by the view (null until the demo starts);
 * the engine never reads it.
 */
export function createCareerInboxState({ role = "coach", seasonYear = 1997, teamId = null } = {}) {
  return {
    version: CAREER_INBOX_VERSION,
    role,
    seasonYear,
    teamId,
    inbox: createInbox({ role, seasonYear, teamId }),
    state: defaultInboxState(),
    demo: null,
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/** Validate the persisted slice state; throws on a bad shape (mirror validateReborn). */
export function validateCareerInbox(value) {
  if (
    !isObject(value)
    || value.version !== CAREER_INBOX_VERSION
    || !isNonEmptyString(value.role)
    || !Number.isInteger(value.seasonYear)
    || (value.teamId !== null && !isNonEmptyString(value.teamId))
    || !isObject(value.inbox)
    || value.inbox.version !== CAREER_INBOX_VERSION
    || !Array.isArray(value.inbox.pending)
    || !Array.isArray(value.inbox.news)
    || !Array.isArray(value.inbox.resolved)
    || !Array.isArray(value.inbox.promises)
    || !Array.isArray(value.inbox.history)
    || !Array.isArray(value.inbox.evidence)
    || !isObject(value.inbox.flags)
    || !isObject(value.state)
    || !Number.isFinite(value.state.trust)
    || !Number.isFinite(value.state.mediaPressure)
    || !Number.isFinite(value.state.divergence)
    || !isObject(value.state.relationships)
    || !isObject(value.state.flags)
    || (value.demo !== null && value.demo !== undefined && !isObject(value.demo))
  ) {
    throw new Error("invalid career inbox save");
  }
}

/**
 * Build the screening context from the live career state. The view fills
 * the demo facts (streak, core line, prospect, veteran, contender) from
 * real game results and real roster data; the engine only reads them.
 */
export function buildInboxContext({
  gameIndex = 0,
  week = 1,
  losingStreak = 0,
  coreLastPts = null,
  coreAvgPts = null,
  coreName = null,
  prospect = null,
  veteran = null,
  contenderName = null,
  trust = 25,
  pressure = 10,
  flags = {},
  tenureYear = 1,
} = {}) {
  return {
    currentYear: 1997,
    currentGame: gameIndex,
    week,
    losingStreak,
    coreLastPts,
    coreAvgPts,
    coreName,
    coreBelowAverage:
      Number.isFinite(coreLastPts) && Number.isFinite(coreAvgPts) && coreLastPts < coreAvgPts,
    prospect,
    veteran,
    contenderName,
    trust,
    pressure,
    flags,
    tenureYear,
  };
}

/**
 * The inbox-level conditions, on top of the shared eventPool vocabulary.
 * eventMatches handles trust/pressure/mood/reputation/flags/tenure; this
 * adds the game-level ones. Unknown inbox keys fail closed.
 */
export function inboxEventMatches(event, ctx) {
  if (!eventMatches(event, { ...ctx, currentYear: ctx.currentYear ?? 1997 })) return false;
  const c = event.conditions || {};
  if (Number.isFinite(c.minLosingStreak) && !(ctx.losingStreak >= c.minLosingStreak)) return false;
  if (c.coreBelowAverage === true && ctx.coreBelowAverage !== true) return false;
  if (Number.isFinite(c.minGameIndex) && !(ctx.currentGame >= c.minGameIndex)) return false;
  if (Number.isFinite(c.maxGameIndex) && !(ctx.currentGame <= c.maxGameIndex)) return false;
  if (Number.isFinite(c.minWeek) && !(ctx.week >= c.minWeek)) return false;
  if (c.requiresProspect === true && !ctx.prospect) return false;
  if (c.requiresVeteran === true && !ctx.veteran) return false;
  return true;
}

function instanceIdFor(event, ctx) {
  // The scout report is per-prospect: the same event with a different
  // prospect is a different instance. Other events are one instance per
  // season window.
  if (event.id === "scout-report-gem" && ctx.prospect?.bref) return `${event.id}:${ctx.prospect.bref}`;
  return event.id;
}

function resolvedGameIndexes(inbox, instanceId) {
  return inbox.resolved
    .filter((entry) => entry.instanceId === instanceId)
    .map((entry) => entry.gameIndex)
    .filter((gameIndex) => Number.isInteger(gameIndex));
}

/** True while the instance is inside its cooldown window (games, not years). */
export function inboxEventOnCooldown(inbox, event, currentGame, instanceId = event.id) {
  const indexes = resolvedGameIndexes(inbox, instanceId);
  if (!indexes.length) return false;
  const cooldown = Number.isFinite(event.cooldownGames) ? event.cooldownGames : 0;
  if (cooldown <= 0) return true; // resolved once and never repeatable
  return currentGame - Math.max(...indexes) < cooldown;
}

/** Instances of this event already pending (never screen a duplicate). */
function pendingInstanceIds(inbox) {
  return new Set(inbox.pending.map((entry) => entry.instanceId));
}

/**
 * Screen the pool against the live context. Returns the newly screened
 * instances (definitions + the live facts they were built from), in pool
 * order — the caller queues them. An instance already pending, or inside
 * its cooldown, is skipped.
 */
export function screenInboxEvents(inbox, ctx) {
  const pending = pendingInstanceIds(inbox);
  const screened = [];
  for (const event of INBOX_EVENTS) {
    if (!inboxEventMatches(event, ctx)) continue;
    const instanceId = instanceIdFor(event, ctx);
    if (pending.has(instanceId)) continue;
    if (inboxEventOnCooldown(inbox, event, ctx.currentGame, instanceId)) continue;
    screened.push({
      instanceId,
      eventId: event.id,
      kind: event.kind,
      urgency: event.urgency,
      order: event.order ?? 0,
      title: event.title,
      titleEn: event.titleEn,
      prompt: event.prompt,
      promptEn: event.promptEn,
      tags: [...event.tags],
      // The live facts the instance was built from — names and numbers the
      // view renders, so the event reads as a real situation, not a form.
      facts: {
        coreName: ctx.coreName || null,
        coreLastPts: ctx.coreLastPts ?? null,
        coreAvgPts: ctx.coreAvgPts ?? null,
        losingStreak: ctx.losingStreak,
        prospect: ctx.prospect ? { ...ctx.prospect } : null,
        veteran: ctx.veteran ? { ...ctx.veteran } : null,
        contenderName: ctx.contenderName || null,
        week: ctx.week,
      },
      gameIndex: ctx.currentGame,
      year: ctx.currentYear ?? 1997,
      at: Date.now(),
    });
  }
  return screened;
}

/** Queue screened instances into the inbox (new inbox object; input untouched). */
export function queueInboxEvents(inbox, instances) {
  if (!instances.length) return inbox;
  const next = structuredClone(inbox);
  for (const instance of instances) {
    if (next.pending.some((entry) => entry.instanceId === instance.instanceId)) continue;
    next.pending.push(structuredClone(instance));
  }
  next.pending.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return next;
}

/** The pending instances, urgent first, then pool order. */
export function pendingInboxEvents(inbox) {
  const rank = { urgent: 0, normal: 1 };
  return [...inbox.pending].sort(
    (a, b) => (rank[a.urgency] ?? 1) - (rank[b.urgency] ?? 1) || (a.order ?? 0) - (b.order ?? 0),
  );
}

/** Badge counts for the hub: urgent pending, normal pending, unread news. */
export function inboxSummary(inbox) {
  return {
    urgent: inbox.pending.filter((entry) => entry.urgency === "urgent").length,
    pending: inbox.pending.length,
    unreadNews: inbox.news.filter((entry) => !entry.read).length,
    openPromises: inbox.promises.filter((entry) => entry.status === "open").length,
  };
}

/**
 * Append a news item to the rolling feed (ordinary events only — they
 * never pause the timeline). The item is derived from real state (a game
 * result, a streak, a week boundary), never invented.
 */
export function recordNews(inbox, { kind, text, textEn, gameIndex = null, year = 1997 } = {}) {
  if (!isNonEmptyString(text)) throw new TypeError("news text is required");
  const next = structuredClone(inbox);
  next.news.push({ kind: kind || "general", text, textEn: textEn || text, gameIndex, year, read: false, at: Date.now() });
  while (next.news.length > INBOX_NEWS_CAP) next.news.shift();
  return next;
}

/** Mark news items read (by index, or all). */
export function markNewsRead(inbox, { all = false, index = null } = {}) {
  const next = structuredClone(inbox);
  if (all) next.news.forEach((entry) => { entry.read = true; });
  else if (Number.isInteger(index) && next.news[index]) next.news[index].read = true;
  return next;
}

/**
 * Record one game's observable evidence for promise checks: the core's
 * line that game. Promises are only ever checked against this log —
 * never against a summary or a guess.
 */
export function recordGameEvidence(inbox, { gameIndex, corePts = null, won = null } = {}) {
  const next = structuredClone(inbox);
  next.evidence.push({ gameIndex, corePts, won, at: Date.now() });
  return next;
}

/** Localize an instance for rendering (zh by default, en on request). */
export function localizeInboxEvent(instance, lang = "zh") {
  if (!instance || lang !== "en") return instance;
  return {
    ...instance,
    title: instance.titleEn || instance.title,
    prompt: instance.promptEn || instance.prompt,
  };
}

/** Localize one choice for rendering. */
export function localizeInboxChoice(choice, lang = "zh") {
  if (!choice || lang !== "en") return choice;
  return {
    ...choice,
    label: choice.labelEn || choice.label,
    description: choice.descriptionEn || choice.description,
    consequence: choice.consequenceEn || choice.consequence,
  };
}
