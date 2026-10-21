const OFFER_TEMPLATES = [
  {
    id: "rebuild-extension",
    title: "重建续约",
    description: "老板愿意给你长期时间和更大权限，但薪资保守。",
    years: 4,
    salary: 7,
    authority: 88,
    privileges: ["自定义训练计划", "发展联盟优先权"],
    effects: { trust: 5, pressure: -4, divergence: 2 },
  },
  {
    id: "contender-extension",
    title: "争冠续约",
    description: "更高薪资和更大预算，但每年都必须证明自己配得上争冠窗口。",
    years: 2,
    salary: 13,
    authority: 54,
    privileges: ["额外教练预算", "季中补强额度"],
    effects: { trust: 3, pressure: 8, divergence: 5 },
  },
];

function clone(value) {
  return structuredClone(value);
}

function requireCareerRoot(root) {
  if (!root?.story || !root?.leagueCareer) {
    throw new TypeError("root with a career story is required");
  }
}

function winRate(summary) {
  const wins = Number(summary?.record?.w) || 0;
  const losses = Number(summary?.record?.l) || 0;
  return wins + losses > 0 ? wins / (wins + losses) : 0;
}

export function careerPerformance(root) {
  requireCareerRoot(root);
  const history = root.leagueCareer.management?.seasonHistory || [];
  const rates = history.map(winRate);
  const wins = history.reduce((total, summary) => total + (Number(summary.record?.w) || 0), 0);
  const games = history.reduce(
    (total, summary) => total + (Number(summary.record?.w) || 0) + (Number(summary.record?.l) || 0),
    0,
  );
  const championships = history.filter((summary) => summary.championId === summary.teamId).length;
  const lastTwo = rates.slice(-2);
  return {
    seasons: history.length,
    wins,
    games,
    winRate: games ? wins / games : 0,
    championships,
    lastSeasonRate: rates.at(-1) || 0,
    consecutiveBadSeasons: lastTwo.length === 2 && lastTwo.every((rate) => rate < 0.4),
  };
}

export function evaluateCareerEmployment(root) {
  requireCareerRoot(root);
  const performance = careerPerformance(root);
  const employment = root.story.employment || { status: "active" };
  if (employment.status !== "active") return root;

  // Two consecutive bottom-tier seasons are enough for a firing. A single bad
  // season is pressure, not an automatic game-over.
  if (performance.consecutiveBadSeasons) {
    const ending = {
      id: "fired-before-finale",
      label: "在低谷中下课",
      tone: "hard",
    };
    return {
      ...root,
      story: {
        ...root.story,
        employment: { status: "fired", reason: "two-bad-seasons", performance },
        currentChapter: "epilogue",
        ending,
        pendingDecision: null,
        eventLog: [
          ...root.story.eventLog,
          { type: "employment-ended", reason: "fired", year: root.leagueCareer.season.year, ending: clone(ending), at: Date.now() },
        ],
      },
    };
  }

  if (performance.seasons >= 5) {
    return {
      ...root,
      story: {
        ...root.story,
        employment: {
          status: "renewal",
          offers: OFFER_TEMPLATES.map(clone),
          performance,
        },
        currentChapter: "contract",
        pendingDecision: { type: "contract-renewal", year: root.leagueCareer.season.year },
        eventLog: [
          ...root.story.eventLog,
          { type: "renewal-offers", year: root.leagueCareer.season.year, offers: OFFER_TEMPLATES.map((offer) => offer.id), at: Date.now() },
        ],
      },
    };
  }
  return root;
}

export function acceptCareerContract(root, offerId) {
  requireCareerRoot(root);
  const employment = root.story.employment;
  if (employment?.status !== "renewal" || root.story.pendingDecision?.type !== "contract-renewal") {
    throw new Error("career renewal is not pending");
  }
  const offer = OFFER_TEMPLATES.find((candidate) => candidate.id === offerId);
  if (!offer) throw new RangeError("unknown career contract offer");
  return {
    ...root,
    story: {
      ...root.story,
      employment: {
        status: "renewed",
        offer: clone(offer),
        performance: employment.performance,
      },
      currentChapter: "postscript",
      ending: {
        id: "renewed-career",
        label: `${offer.title} · ${offer.years}年${offer.salary}薪资`,
        tone: "success",
      },
      frontOfficeTrust: (root.story.frontOfficeTrust || 0) + offer.effects.trust,
      mediaPressure: Math.max(0, (root.story.mediaPressure || 0) + offer.effects.pressure),
      timelineDivergence: (root.story.timelineDivergence || 0) + offer.effects.divergence,
      pendingDecision: null,
      eventLog: [
        ...root.story.eventLog,
        { type: "contract-signed", offerId, year: root.leagueCareer.season.year, at: Date.now() },
      ],
    },
  };
}

export function declineCareerContracts(root) {
  requireCareerRoot(root);
  const employment = root.story.employment;
  if (employment?.status !== "renewal" || root.story.pendingDecision?.type !== "contract-renewal") {
    throw new Error("career renewal is not pending");
  }
  const ending = {
    id: "left-as-legend",
    label: "带着成果离开",
    tone: "success",
  };
  return {
    ...root,
    story: {
      ...root.story,
      employment: { status: "departed", performance: employment.performance },
      currentChapter: "epilogue",
      ending,
      pendingDecision: null,
      eventLog: [
        ...root.story.eventLog,
        { type: "contract-declined", year: root.leagueCareer.season.year, ending: clone(ending), at: Date.now() },
      ],
    },
  };
}

export function contractOffers(root) {
  requireCareerRoot(root);
  return root.story.employment?.status === "renewal"
    ? clone(root.story.employment.offers || [])
    : [];
}
