// QA probe for the Career 2.0 gaps handoff (Board b3acbbb, Code -> Muse).
// Fixed-seed, Node-only (no browser): measures what the browser smokes cannot.
//
//   node scripts/qa/career2-qa-probe.mjs [seeds] [epiphanyTrials]
//
// (a) Reborn full-season rivalry frequency per fixed seed: rivalries formed
//     by origin, meetings, games with real minutes, DNP games.
// (b) Takeover window: takeover attempts/makes + trust swing in rivalry
//     games vs non-rivalry games (hook always takes the shot), plus a
//     Q4 micro-experiment counting possessions where only the wider
//     rivalry window makes a takeover eligible.
// (c) Epiphany old (flat 0.5, strongest family only) vs new (evidence
//     candidates, margin-scaled chance) on identical seeded streams.
// (d) Save compat: a pre-rivalry Reborn save (no `rivalries` field) plays
//     a game cleanly; the account mirror stays identical on repeat calls.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { GameSim } from "../../js/engine/sim.js";
import { seasonToCard } from "../../js/data/players.js";
import { createRebornState, buildPlayerCard, REBORN_TEAM_IDS } from "../../js/reborn/identity.js";
import { rosterCards, buildSeason, playSeason, takeoverEligible } from "../../js/reborn/season.js";
import { rivalryLedger, mirrorRivalriesToAccount, DEFAULT_TAKEOVER_WINDOW, RIVALRY_TAKEOVER_WINDOW } from "../../js/reborn/rivalry.js";
import { epiphanyCandidates, epiphanyChance, recordGameAndCheck, EPIPHANY_RULES } from "../../js/engine/epiphany.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const N_SEEDS = Number(process.argv[2]) || 6;
const EPI_TRIALS = Number(process.argv[3]) || 2000;
const alwaysTake = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });

// ---------- (a)+(b) full seasons ----------
const seasonStats = [];
for (let s = 0; s < N_SEEDS; s += 1) {
  const seed = `career2-qa-${s + 1}`;
  const t0 = Date.now();
  const reborn = createRebornState(seed, ROWS);
  reborn.player.coachTrust = 80; // starter: real minutes, so meetings can happen
  const season = buildSeason(reborn, ROWS);
  const perGame = [];
  const out = await playSeason(reborn, season, ROWS, {
    onTakeover: alwaysTake,
    onGame: (r) => perGame.push(r),
  });
  const ledger = rivalryLedger(out.reborn);
  const rivalGames = perGame.filter((r) => r.rivalry.met.length > 0 || r.rivalry.formed.length > 0);
  const rivalOppGames = perGame.filter((r) => r.rivalry.missed.length > 0 || r.rivalry.met.length > 0 || r.rivalry.formed.length > 0);
  const take = (games) => ({
    n: games.length,
    attempts: games.filter((g) => g.takeover?.attempted).length,
    makes: games.filter((g) => g.takeover?.attempted && g.takeover.made).length,
    trustDelta: games.reduce((n, g) => n + (g.trustDelta || 0), 0),
  });
  const nonRival = perGame.filter((g) => !rivalOppGames.includes(g));
  seasonStats.push({
    seed, ms: Date.now() - t0,
    games: out.summary.games,
    playedMin: perGame.filter((g) => (g.line?.min || 0) >= 12).length,
    dnp: perGame.filter((g) => (g.line?.min || 0) <= 0).length,
    rivals: ledger.rivals.map((r) => ({ name: r.nameEn || r.name, origin: r.origin, reason: r.reason, meetings: r.games.length })),
    rivalGames: rivalGames.length,
    rivalOppGames: rivalOppGames.length,
    takeRival: take(rivalOppGames),
    takeNonRival: take(nonRival),
    finalTrust: out.summary.finalTrust,
  });
}
console.log("=== (a) rivalry frequency, full 82-game seasons, always-takeover hook ===");
for (const st of seasonStats) {
  console.log(`${st.seed}: ${st.ms}ms games=${st.games} played>=12min=${st.playedMin} dnp=${st.dnp} rivals=${st.rivals.length} ${JSON.stringify(st.rivals)} rivalOppGames=${st.rivalOppGames} trust=${st.finalTrust}`);
}
const tot = (f) => seasonStats.reduce((n, s) => n + f(s), 0);
console.log(`TOTAL seeds=${N_SEEDS} rivals=${tot((s) => s.rivals.length)} auto=${tot((s) => s.rivals.filter((r) => r.origin === "auto").length)} story=${tot((s) => s.rivals.filter((r) => r.origin === "story").length)} storyTaunt=${tot((s) => s.rivals.filter((r) => r.reason === "taunt").length)} storyClutch=${tot((s) => s.rivals.filter((r) => r.reason === "clutch").length)}`);
console.log("=== (b) takeover: rivalry-opponent games vs other games ===");
const agg = (key) => seasonStats.reduce((a, s) => ({ n: a.n + s[key].n, attempts: a.attempts + s[key].attempts, makes: a.makes + s[key].makes, trustDelta: a.trustDelta + s[key].trustDelta }), { n: 0, attempts: 0, makes: 0, trustDelta: 0 });
for (const key of ["takeRival", "takeNonRival"]) {
  const a = agg(key);
  console.log(`${key}: games=${a.n} attempts=${a.attempts} (${(100 * a.attempts / Math.max(1, a.n)).toFixed(1)}%) makes=${a.makes} totalTrustDelta=${a.trustDelta}`);
}

// ---------- (b) micro: Q4 possessions where only the wide window is eligible ----------
{
  const reborn = createRebornState("career2-qa-micro", ROWS);
  const teamId = reborn.player.teamId;
  const clone = buildPlayerCard(reborn.identity, ROWS);
  const rest = rosterCards(ROWS, teamId, 1997).filter((p) => p.bref !== reborn.identity.bref);
  const homeCards = [clone, ...rest.slice(0, 9)];
  const oppId = REBORN_TEAM_IDS.find((t) => t !== teamId);
  const awayCards = rosterCards(ROWS, oppId, 1997).slice(0, 10);
  let steps = 0, wideOnly = 0, either = 0;
  for (let t = 0; t < 120; t += 1) {
    const rng = seededStream(hashSeed(`career2-qa-micro|${t}`));
    const clock0 = 60 + Math.floor(rng() * 200); // 60..259s left in Q4
    const margin0 = Math.floor(rng() * 13); // 0..12
    const sim = new GameSim({
      home: { name: teamId, players: homeCards, starterIds: homeCards.slice(0, 5).map((p) => p.id) },
      away: { name: oppId, players: awayCards, starterIds: awayCards.slice(0, 5).map((p) => p.id) },
      youSide: "home", injuries: false, speed: 3, rng,
      onEvent: () => {}, onTick: () => {}, onEnd: () => {},
    });
    sim.autoOffense = true; sim.autoDefense = true; sim.autoRotation = true;
    sim.running = true; sim.quarter = 4; sim.clock = clock0;
    sim.score = { home: 100, away: 100 + (rng() < 0.5 ? margin0 : -margin0) };
    sim.possession = "home";
    let guard = 0;
    while (sim.running && guard++ < 3000) {
      sim.step();
      if (!sim.running || sim.quarter > 4) break;
      steps += 1;
      const d = takeoverEligible(sim, clone.id, DEFAULT_TAKEOVER_WINDOW);
      const w = takeoverEligible(sim, clone.id, RIVALRY_TAKEOVER_WINDOW);
      if (w) either += 1;
      if (w && !d) wideOnly += 1;
    }
  }
  console.log(`=== (b) micro Q4 eligibility: steps=${steps} eligibleEither=${either} wideOnly=${wideOnly} (${(100 * wideOnly / Math.max(1, steps)).toFixed(2)}% of Q4 steps, ${(100 * wideOnly / Math.max(1, either)).toFixed(1)}% of eligible steps are wide-only) ===`);
}

// ---------- (c) epiphany old vs new, identical seeded streams ----------
// Old rule (pre-e292bd5): only the strongest proven family is a candidate,
// flat EPIPHANY_CHANCE = 0.5 to awaken at all. Rebuilt here from the Board
// description; the new module is imported live above.
function oldLearn(form, player, rng) {
  const recent = form.slice(-3);
  if (recent.length < 3 || recent.some((g) => g.min < 18)) return null;
  let best = null;
  for (const rule of EPIPHANY_RULES) {
    if (!recent.every((g) => g.min >= 18 && g[rule.stat] >= rule.min)) continue;
    const strength = recent.reduce((sum, g) => sum + g[rule.stat] / rule.min, 0);
    if (!best || strength > best.strength) best = { rule, strength };
  }
  if (!best) return null;
  if (rng() >= 0.5) return null;
  const owned = new Set(player.skills || []);
  const options = best.rule.skills.filter((id) => !owned.has(id));
  if (!options.length) return null;
  return { rule: best.rule.id, skill: options[Math.floor(rng() * options.length)] };
}
function streakForm(ruleId, margin, dual = null) {
  const rule = EPIPHANY_RULES.find((r) => r.id === ruleId);
  const form = [];
  for (let i = 0; i < 3; i += 1) {
    const g = { min: 30, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0, twoPm: 0 };
    g[rule.stat] = Math.ceil(rule.min * margin);
    if (dual) {
      const r2 = EPIPHANY_RULES.find((r) => r.id === dual);
      g[r2.stat] = Math.ceil(r2.min * margin);
    }
    form.push(g);
  }
  return form;
}
console.log("=== (c) epiphany: old flat-0.5/strongest-only vs new, same seeds ===");
const player = { skills: [] };
for (const [label, form] of [
  ["scorer @1.0x bar", streakForm("scorer", 1.0)],
  ["scorer @1.25x bar", streakForm("scorer", 1.25)],
  ["scorer @1.5x bar", streakForm("scorer", 1.5)],
  ["scorer @2.0x bar", streakForm("scorer", 2.0)],
  ["playmaker+scorer @1.5x (dual)", streakForm("playmaker", 1.5, "scorer")],
]) {
  const cands = epiphanyCandidates(form, player, new Set());
  let oldN = 0, newN = 0, newNonStrongest = 0;
  const strongest = cands.length ? cands.reduce((a, b) => (b.strength > a.strength ? b : a)).rule.id : null;
  for (let i = 0; i < EPI_TRIALS; i += 1) {
    const rngOld = seededStream(hashSeed(`epi-old|${label}|${i}`));
    const rngNew = seededStream(hashSeed(`epi-new|${label}|${i}`));
    if (oldLearn(form, player, rngOld)) oldN += 1;
    const { learned } = recordGameAndCheck({ form: form.slice(0, 2), skills: [], epiphany: [] }, player, form[2], rngNew);
    if (learned) {
      newN += 1;
      if (strongest && learned.rule.id !== strongest) newNonStrongest += 1;
    }
  }
  console.log(`${label}: candidates=${cands.map((c) => `${c.rule.id}(${c.strength.toFixed(1)})`).join(",") || "none"} chance=${cands.length ? epiphanyChance(cands).toFixed(2) : "0"} old=${(100 * oldN / EPI_TRIALS).toFixed(1)}% new=${(100 * newN / EPI_TRIALS).toFixed(1)}% newNonStrongest=${newNonStrongest}`);
}

// ---------- (e) fixed seed for reborn-rivalry.mjs ----------
// Replicates the browser smoke's flow in Node: historical destiny, first
// pick in the bench list, play game 1, challenge the top candidate. Then
// checks the rival's team comes up within the script's 40-game window.
// The browser may train once before game 1, which can shuffle which
// opponent tops the challenge list, so all top-3 candidates are checked.
{
  const { creationChoices, createRebornFromChoice } = await import("../../js/ui/reborn/creation.js");
  const { playGame } = await import("../../js/reborn/season.js");
  const { challengeCandidates } = await import("../../js/reborn/rivalry.js");
  const FIXED_SEED = "career2-qa-rivalry-2"; // verified below: pre-game card at game 3; plain "career2-qa-rivalry" fails (CHI never reappears in 40)
  const pick = creationChoices(ROWS, FIXED_SEED, 1996).historical[0];
  const reborn = createRebornFromChoice({ seed: FIXED_SEED, rows: ROWS, choice: { startYear: 1996, destiny: "historical", bref: pick.bref } });
  const season = buildSeason(reborn, ROWS);
  const one = await playGame(reborn, season, ROWS, { onTakeover: alwaysTake });
  const cands = challengeCandidates(rivalryLedger(one.reborn), one.report);
  console.log(`=== (e) fixed seed ${FIXED_SEED}: pick=${pick.nameEn || pick.name} (${pick.team}) game1 vs ${one.report.opp} youMin=${one.report.line.min} candidates=${cands.map((c) => `${c.nameEn || c.name}(${c.team})`).join(", ")} ===`);
  for (const c of cands) {
    const firstAt = season.games.slice(1, 41).findIndex((g) => g.homeId === c.team || g.awayId === c.team);
    console.log(`=== (e) rival ${c.nameEn || c.name} (${c.team}): first game vs his team at index ${firstAt === -1 ? "NONE in 40" : firstAt + 1} ===`);
  }
}

{
  const reborn = createRebornState("career2-qa-compat", ROWS);
  reborn.player.coachTrust = 80;
  delete reborn.rivalries; // a save written before rivalries existed
  const season = buildSeason(reborn, ROWS, { games: [{ homeId: reborn.player.teamId, awayId: REBORN_TEAM_IDS.find((t) => t !== reborn.player.teamId), day: 1, played: false }] });
  const out = await (await import("../../js/reborn/season.js")).playGame(reborn, season, ROWS, { onTakeover: alwaysTake });
  const ledgerOk = Array.isArray(out.reborn.rivalries?.rivals) && typeof out.reborn.rivalries?.watch === "object";
  console.log(`=== (d) legacy save (no rivalries field) plays a game: ok=${!!out && ledgerOk} ledger=${JSON.stringify(out.reborn.rivalries)} ===`);
  // Mirror idempotency on a real formed rival, via the public path.
  const { challengeRival } = await import("../../js/reborn/rivalry.js");
  const challenged = challengeRival(rivalryLedger(out.reborn), out.report, out.report.opponents[0].bref);
  const withRival = { ...out.reborn, rivalries: challenged.ledger };
  const account = {};
  mirrorRivalriesToAccount(account, withRival);
  const once = JSON.stringify(account);
  mirrorRivalriesToAccount(account, withRival);
  const twice = JSON.stringify(account);
  console.log(`=== (d) mirror twice identical: ${once === twice} (bytes ${once.length}) ===`);
}
