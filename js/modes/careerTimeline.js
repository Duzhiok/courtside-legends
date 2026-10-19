const FILTERS = new Set(["all", "seasons", "drafts", "transactions"]);
const EVENT_LABELS = {
  "future-knowledge-intro": "完成未来知识抉择",
};
const HIDDEN_LIFECYCLE_EVENTS = new Set([
  "season-completed",
  "draft-opened",
  "draft-completed",
  "offseason-completed",
]);

function eventTeamName(career, teamId) {
  return career.season?.teams?.[teamId]?.name
    || career.season?.league?.labels?.[teamId]
    || teamId
    || "球队";
}

function compactEvent(event, career) {
  const type = String(event.type);
  const compact = {
    type,
    label:
      type === "accepted-offer"
        ? `接受 ${event.teamName || eventTeamName(career, event.teamId)} 邀请`
        : EVENT_LABELS[type] || "生涯事件",
  };
  if (typeof event.teamId === "string" && event.teamId) {
    compact.teamId = event.teamId;
  }
  if (typeof event.choiceId === "string" && event.choiceId) {
    compact.choiceId = event.choiceId;
  }
  if (Number.isInteger(event.nextYear)) compact.nextYear = event.nextYear;
  if (Number.isFinite(event.at)) compact.at = event.at;
  return compact;
}

function compactPick(selection) {
  if (!selection) return null;
  return {
    pickNumber: selection.pickNumber,
    name: selection.name,
    bref: selection.bref,
    source: selection.source,
  };
}

export function buildCareerTimeline(career) {
  if (!career || typeof career !== "object" || Array.isArray(career)) {
    throw new TypeError("career must be an object");
  }
  const summaries = career.management?.seasonHistory || [];
  const drafts = career.management?.draftHistory || [];
  const events = career.history || [];
  const years = new Set();
  for (const entry of [...summaries, ...drafts, ...events]) {
    if (Number.isInteger(entry?.year)) years.add(entry.year);
  }

  return [...years]
    .sort((left, right) => left - right)
    .map((year) => {
      const summary = summaries.find((entry) => entry?.year === year) || null;
      const draft = drafts.find((entry) => entry?.year === year) || null;
      const teamId = summary?.teamId || career.season?.userTeamId || null;
      const userSelection = draft?.selections?.find(
        (selection) => selection?.teamId === teamId,
      );
      const teamName =
        summary?.teamName ||
        career.season?.teams?.[teamId]?.name ||
        teamId ||
        "—";
      return {
        year,
        teamId,
        teamName,
        record: summary?.record
          ? { w: summary.record.w, l: summary.record.l }
          : null,
        finish: summary?.finish || null,
        championId: summary?.championId || null,
        awards: summary?.awards
          ? {
              mvp: summary.awards.mvp ? { ...summary.awards.mvp } : null,
              dpoy: summary.awards.dpoy ? { ...summary.awards.dpoy } : null,
              roy: summary.awards.roy ? { ...summary.awards.roy } : null,
            }
          : null,
        userDraftPick: compactPick(userSelection),
        transactions: (summary?.transactions || []).map((entry) => ({
          type: entry.type,
          year: entry.year,
          day: entry.day,
          description: entry.description,
        })),
        events: events
          .filter(
            (event) =>
              event?.year === year &&
              typeof event.type === "string" &&
              !HIDDEN_LIFECYCLE_EVENTS.has(event.type),
          )
          .sort(
            (left, right) =>
              Number(left.at || 0) - Number(right.at || 0) ||
              String(left.type).localeCompare(String(right.type)),
          )
          .map((event) => compactEvent(event, career)),
      };
    });
}

export function filterCareerTimeline(timeline, filter) {
  if (!Array.isArray(timeline)) {
    throw new TypeError("timeline must be an array");
  }
  if (!FILTERS.has(filter)) {
    throw new TypeError("invalid timeline filter");
  }
  const filtered = timeline.filter((entry) => {
    if (filter === "seasons") return entry.record !== null;
    if (filter === "drafts") return entry.userDraftPick !== null;
    if (filter === "transactions") return entry.transactions.length > 0;
    return true;
  });
  return structuredClone(filtered);
}
