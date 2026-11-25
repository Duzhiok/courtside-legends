/**
 * Rivalry enforcer easter egg (user idea 2026-11-14): in a rivalry game,
 * having an enforcer on the floor is a double-edged sword — the enforcer
 * may get into the rival's head, or whistle himself into foul trouble.
 *
 * Ruling guard (Career 2.0 decision 2): a rivalry never changes OVR,
 * shooting or any dice. The egg honours that:
 *  - the rattle edge moves only the engine's own hot/mood/morale state,
 *    at the exact magnitudes GameSim.breakMomentum uses (hot -2, mood -4)
 *    plus a small team-morale dip. It never touches temp.offense, so no
 *    make probability changes; the rival just stops being the hot hand
 *    (hot feeds shot selection / threat weighting, not the dice).
 *  - the foul edge only adds a personal foul + grade hit. At six personals
 *    he sits like anyone else, and the game from there follows the new lineup.
 * No attribute, no rating, no dice is touched. The rivalry is the stage
 * (trigger condition); the enforcer is the actor.
 *
 * One-sided by design: rivalries live in YOUR ledger (reborn.rivalries)
 * against the opponent's roster, so the egg is your enforcer jawing with
 * your rival. The opponent's enforcer has no rivalry relationship to
 * anyone in the ledger, so he gets no egg.
 *
 * Wiring: the Reborn driver (season.js driveGame) calls the watcher once
 * per possession step. The watcher rolls ONCE per game, the first time
 * your enforcer shares the floor with a rival — a per-step roll would
 * make the egg nearly invisible on teams whose enforcer rides the bench
 * (Rodman plays ~8 min in the sim; Oakley ~30). One roll per game keeps
 * the rate uniform (20% of eligible rivalry games) whatever the rotation.
 * The roll runs on the egg's own seeded stream (game seed +
 * "|enforcer-egg"), so the sim's dice are byte-identical whether the egg
 * is on or off — the only thing that changes a game is an actual
 * incident. At most one incident per game.
 */
import { clamp } from "../core/seededRandom.js";
import { gradeFoul } from "../engine/grade.js";
import { esc } from "../core/html.js";

/**
 * Chance the incident fires, rolled once per game the first time your
 * enforcer shares the floor with a rival. About 2 incidents per season
 * for a run that plays ~10 rivalry games — rare enough to be an egg,
 * common enough to be discovered.
 */
export const ENFORCER_EGG_GAME_CHANCE = 0.2;
/** Share of incidents that rattle the rival (the rest are fouls on the enforcer). */
const ENFORCER_EGG_RATTLE_WEIGHT = 0.5;
/** Rattle edge: breakMomentum's magnitudes (hot/mood only — never temp.offense). */
const ENFORCER_EGG_HOT_DIP = 2;
const ENFORCER_EGG_MOOD_DIP = 4;
const ENFORCER_EGG_MORALE_DIP = 3;
/** At most one incident per game — it is an easter egg, not a system. */
const ENFORCER_EGG_MAX_PER_GAME = 1;

function hasEnforcerSkill(p) {
  return (p?.skills || []).includes("enforcer");
}

const personOf = (p) => ({
  id: p?.id || null,
  bref: p?.bref || null,
  name: p?.name || "",
  nameEn: p?.nameEn || p?.name || "",
});

/**
 * The on-court pair: your enforcer + the rival he is jawing with.
 * Both must actually be playing (on court, not just on the roster).
 * Deterministic: first enforcer on court, first rival on court.
 */
export function findEggPair(youOnCourt = [], oppOnCourt = [], rivalBrefs = []) {
  const rivals = new Set(rivalBrefs || []);
  if (!rivals.size) return null;
  const enforcer = (youOnCourt || []).find(hasEnforcerSkill) || null;
  const rival = (oppOnCourt || []).find((p) => p?.bref && rivals.has(p.bref)) || null;
  if (!enforcer || !rival) return null;
  return { enforcer, rival };
}

/** Bilingual incident line (report + view + sim emit share one copy). */
export function eggCopy(incident, lang = "zh") {
  const en = incident?.enforcer || {};
  const rv = incident?.rival || {};
  const eName = esc(lang === "en" ? en.nameEn || en.name : en.name);
  const rName = esc(lang === "en" ? rv.nameEn || rv.name : rv.name);
  if (incident?.edge === "foul") {
    return lang === "en"
      ? `${eName} gets too physical with ${rName} — whistle, foul on ${eName}.`
      : `${eName}对${rName}下手太狠，吃到一次犯规。`;
  }
  return lang === "en"
    ? `${eName} bodies ${rName} hard — the rival is rattled.`
    : `${eName}一记凶狠的身体对抗，把${rName}顶得心态失衡。`;
}

/**
 * One watcher per game. Call maybeFire() after every sim.step(); it
 * returns the incident record the first time the egg fires, null after.
 * The fire roll happens once, at the first step where the pair shares
 * the floor; `rng` is the egg's own seeded stream (never the sim's).
 */
export function createEggWatcher({ sim, rivalBrefs = [], rng = Math.random } = {}) {
  const rivals = new Set(rivalBrefs || []);
  let fired = 0;
  let decided = false;
  return {
    get firedCount() {
      return fired;
    },
    maybeFire() {
      if (decided || fired >= ENFORCER_EGG_MAX_PER_GAME || !sim?.running || !rivals.size) return null;
      const you = sim.youSide === "home" ? sim.home : sim.away;
      const opp = sim.youSide === "home" ? sim.away : sim.home;
      const pair = findEggPair(you?.onCourt, opp?.onCourt, rivals);
      if (!pair) return null;
      decided = true;
      if (rng() >= ENFORCER_EGG_GAME_CHANCE) return null;
      const edge = rng() < ENFORCER_EGG_RATTLE_WEIGHT ? "rattle" : "foul";
      fired += 1;
      const incident = {
        fired: true,
        edge,
        enforcer: personOf(pair.enforcer),
        rival: personOf(pair.rival),
        quarter: sim.quarter,
        clock: sim.clock,
      };
      if (edge === "rattle") {
        pair.rival.hot = Math.max(-2, (pair.rival.hot || 0) - ENFORCER_EGG_HOT_DIP);
        pair.rival.mood = clamp((pair.rival.mood ?? 50) - ENFORCER_EGG_MOOD_DIP, 15, 95);
        opp.morale = clamp((opp.morale ?? 50) - ENFORCER_EGG_MORALE_DIP, 0, 100);
      } else {
        pair.enforcer.stats = pair.enforcer.stats || {};
        pair.enforcer.stats.pf = (pair.enforcer.stats.pf || 0) + 1;
        gradeFoul(pair.enforcer);
      }
      // Emit for the record (a no-op while the Reborn driver runs quiet;
      // the report carries the narrative). The foul meta matches the
      // other foul broadcasts (charge / defensive / shooting / and_one).
      if (typeof sim.emit === "function" && typeof sim.S === "function") {
        sim.emit(
          "coach",
          sim.S(eggCopy(incident, "zh"), eggCopy(incident, "en")),
          edge === "foul"
            ? { foul: { foulerId: pair.enforcer.id, victimId: pair.rival.id, kind: "defensive" } }
            : { enforcerEgg: edge },
        );
      }
      return incident;
    },
  };
}
