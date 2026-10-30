/**
 * Career-arc attribute shaping: the same player plays differently as a rookie
 * vs a 30+ veteran (Jokic: young bounce/speed → vet IQ / pass / strength / clutch).
 *
 * Age is estimated from known birth years when available, else first NBA season ≈ 20.
 */

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** Known birth years (season-end age ≈ season - birthYear). */
export const BIRTH_YEAR = {
  jokicni01: 1995,
  jamesle01: 1984,
  curryst01: 1988,
  duranke01: 1988,
  hardeja01: 1989,
  westbru01: 1988,
  antetgi01: 1994,
  doncilu01: 1999,
  embiijo01: 1994,
  davisan02: 1993,
  leonaka01: 1991,
  georgpa01: 1990,
  bryanko01: 1978,
  jordami01: 1963,
  onealsh01: 1972,
  duncati01: 1976,
  garneke01: 1976,
  nowitdi01: 1978,
  nashst01: 1974,
  paulch01: 1985,
  wadedw01: 1982,
  iversal01: 1975,
  mcgratr01: 1979,
  marbust01: 1977,
  farieke01: 1989,
  goberru01: 1992,
  ibakase01: 1989,
  townska01: 1995,
  bookede01: 1996,
  tatumja01: 1998,
  brownja02: 1996,
  gilgesh01: 1997,
  youngtr01: 1998,
  moranja01: 1999,
  wembavi01: 2004,
  lillada01: 1990,
  thompkl01: 1990,
  irvinky01: 1992,
  greendr01: 1990,
};

/** bref → { first, last } built once per roster load. */
let CAREER_SPAN = new Map();

export function buildCareerSpanIndex(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const bref = r.bref;
    if (!bref) continue;
    const s = +r.season || 0;
    if (!s) continue;
    const prev = map.get(bref);
    if (!prev) map.set(bref, { first: s, last: s });
    else {
      if (s < prev.first) prev.first = s;
      if (s > prev.last) prev.last = s;
    }
  }
  CAREER_SPAN = map;
  return map;
}

export function setCareerSpanIndex(map) {
  CAREER_SPAN = map || new Map();
}

export function getCareerSpan(bref) {
  return CAREER_SPAN.get(bref) || null;
}

/**
 * Estimate age for a season row.
 * Prefer birth year; else assume debut ≈ age 20.
 */
export function estimateAge(r) {
  const bref = r?.bref || "";
  const season = +r?.season || 0;
  if (!season) return 26;
  const born = BIRTH_YEAR[bref];
  if (born) return clamp(season - born, 18, 45);
  const span = CAREER_SPAN.get(bref);
  if (span?.first) return clamp(20 + (season - span.first), 18, 44);
  return 26;
}

/**
 * Career phase buckets used for attr / intangible shaping.
 */
export function careerPhase(age) {
  if (age <= 22) return "prospect";
  if (age <= 25) return "ascending";
  if (age <= 29) return "prime";
  if (age <= 34) return "veteran";
  return "twilight";
}

export const PHASE_LABEL = {
  prospect: "新秀成长期",
  ascending: "上升期",
  prime: "巅峰期",
  veteran: "老将期",
  twilight: "生涯末期",
};

/**
 * Deltas applied on top of box-score formula attrs.
 * Young: speed / motor. Vet: IQ / strength / pass / shooting touch / clutch.
 */
export function careerArcDeltas(age, pos = "SF") {
  const phase = careerPhase(age);
  const isBig = pos === "C" || pos === "PF";
  const d = {
    scoring: 0,
    three: 0,
    mid: 0,
    paint: 0,
    defense: 0,
    rebound: 0,
    pass: 0,
    speed: 0,
    strength: 0,
    stamina: 0,
    iq: 0,
    clutch: 0,
    steal: 0,
    block: 0,
  };

  if (phase === "prospect") {
    d.speed += isBig ? 5 : 8;
    d.stamina += 4;
    d.steal += 3;
    d.strength -= isBig ? 3 : 5;
    d.iq -= 7;
    d.pass -= 4;
    d.clutch -= 6;
    d.mid -= 3;
    d.three -= 2;
    d.defense -= 2;
  } else if (phase === "ascending") {
    d.speed += isBig ? 2 : 4;
    d.stamina += 2;
    d.iq -= 2;
    d.clutch -= 1;
  } else if (phase === "prime") {
    d.iq += 2;
    d.clutch += 3;
    d.pass += 1;
    d.stamina += 1;
  } else if (phase === "veteran") {
    d.speed -= isBig ? 5 : 7;
    d.stamina -= 3;
    d.steal -= 2;
    d.strength += isBig ? 5 : 3;
    d.iq += 7;
    d.pass += 5;
    d.clutch += 6;
    d.mid += 3;
    d.three += 2;
    d.scoring += 1;
    d.defense += 2;
    d.rebound += isBig ? 2 : 0;
  } else {
    // twilight 35+
    d.speed -= isBig ? 10 : 12;
    d.stamina -= 8;
    d.steal -= 4;
    d.strength += isBig ? 2 : 0;
    d.iq += 9;
    d.pass += 4;
    d.clutch += 5;
    d.mid += 2;
    d.three += 1;
    d.defense += 1;
    // legs go; vertical finishing dips a bit
    d.paint -= 2;
  }

  // Fine-grain within phase (smooth, not just bucket jumps)
  if (age <= 21) {
    d.speed += 2;
    d.iq -= 2;
  } else if (age >= 36) {
    d.speed -= 2;
    d.stamina -= 2;
    d.iq += 1;
  }

  return { phase, deltas: d };
}

/**
 * Apply career-arc deltas onto attrs. Returns new attrs + meta.
 * Anchored seasons: apply only athletic/mental shifts at 55% so curated peaks stay intact.
 */
export function applyCareerArc(attrs, r, { anchored = false } = {}) {
  const age = estimateAge(r);
  const { phase, deltas } = careerArcDeltas(age, r.pos || "SF");
  const scale = anchored ? 0.55 : 1;
  const out = { ...attrs };
  for (const [k, v] of Object.entries(deltas)) {
    if (out[k] == null || !v) continue;
    // Athletic keys always apply; for anchors mental/skill keys at reduced scale
    const athletic = k === "speed" || k === "stamina" || k === "steal" || k === "strength";
    const m = anchored && !athletic ? scale : anchored ? scale : 1;
    out[k] = clamp(Math.round(out[k] + v * m), 10, 100);
  }
  return {
    attrs: out,
    age,
    careerPhase: phase,
    careerPhaseLabel: PHASE_LABEL[phase] || phase,
  };
}

/**
 * Intangible biases from age phase (leadership, composure, motor, killer instinct…).
 */
export function careerArcIntangibleBias(age) {
  const phase = careerPhase(age);
  if (phase === "prospect") {
    return { leadership: -10, composure: -6, motor: 8, killerInstinct: -8, toughness: -4 };
  }
  if (phase === "ascending") {
    return { leadership: -3, motor: 4, killerInstinct: -2 };
  }
  if (phase === "prime") {
    return { leadership: 4, composure: 3, killerInstinct: 5, motor: 2 };
  }
  if (phase === "veteran") {
    return { leadership: 10, composure: 8, killerInstinct: 8, motor: -4, toughness: 4 };
  }
  return { leadership: 12, composure: 10, killerInstinct: 6, motor: -10, toughness: 2 };
}
