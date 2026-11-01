/**
 * C3 of docs/CAREER_LIFE_ROADMAP.md: 领悟 (epiphany) for a season/career game.
 *
 * The rules are `engine/epiphany.js` (a streak of qualifying games, a roll, a per-person cap); this
 * is only the ledger around them, so a managed career reuses exactly what ranked play already has.
 *
 *   management.epiphany = { [bref]: { form: [last <=5 games], learned: [skillId] } }
 *
 * `form` is a rolling window, never a game log (the quota is why). `learned` is for life: the skill
 * itself rides on the player's card (the rollover already carries a card's skills to the next year),
 * and this list is what the per-person cap counts, so it can't turn into a skill faucet. Forms reset
 * every season.
 *
 * `settleEpiphany` is pure: nothing is mutated and nothing is saved. `awardEpiphany` is the one step the
 * game takes: it also hangs the learned skill on the live player, and takes back any skill that could not
 * be hung (a ledger that remembers a skill the card doesn't have would later learn it twice, and the
 * save validator refuses a duplicate -- the career would be bricked).
 */
import { STREAK, formLine, heatHint, recordGameAndCheck } from "../engine/epiphany.js";
import { grantSkillToPlayer, skillSlotsFull } from "../data/skills.js";

/** The rule a card shows: just what the UI needs, no engine internals. */
const ruleOf = (rule) => ({ id: rule.id, stat: rule.stat, min: rule.min });

/** The name the card shows: the card's own, even when the engine renamed a same-player copy. */
const nameOf = (player, line) => line?.name || player.cardName || player.name;

const toMod = (entry) => ({ form: entry?.form || [], epiphany: entry?.learned || [], skills: [] });
const fromMod = (mod) => ({ form: mod.form, learned: mod.epiphany || [] });

/**
 * @param ledger   `{ [bref]: { form, learned } }` (undefined for a career that has none yet)
 * @param players  the user's live roster cards (id, bref, name, skills, height, team ...)
 * @param lines    this game's box-score lines for the user's side (`gameRewards.settleGame().lines`)
 * @returns { ledger, learned: [{ id, name, skillId, skill, rule, games }], heat: [{ id, name, rule, games, of }] }
 */
export function settleEpiphany({ ledger = {}, players = [], lines = [], rng = Math.random } = {}) {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const onRoster = new Set(players.map((player) => player.bref));
  const next = {};
  const learned = [];
  const heat = [];

  // Keep who we already track. A player who left keeps only what he learned (his form is meaningless).
  for (const [bref, entry] of Object.entries(ledger || {})) {
    if (onRoster.has(bref)) next[bref] = entry;
    else if (entry.learned?.length) next[bref] = { form: [], learned: entry.learned };
  }

  for (const player of players) {
    const line = lineById.get(player.id);
    const entry = next[player.bref];
    // Never created for someone who hasn't played; but a tracked player who sat THIS game gets an
    // empty line, because a streak is consecutive games.
    if (!line && !entry) continue;
    // Full card (7 skills): nothing to learn and no promise to make.
    if (skillSlotsFull(player)) continue;
    const result = recordGameAndCheck(toMod(entry), player, formLine(line || {}), rng);
    next[player.bref] = fromMod(result.mod);
    if (result.learned) {
      learned.push({
        id: player.id,
        name: nameOf(player, line),
        skillId: result.learned.skillId,
        skill: result.learned.name,
        rule: ruleOf(result.learned.rule),
        games: STREAK,
      });
    }
    // Right after learning the window is empty, so nobody who just learned is ever "heating up".
    const hint = heatHint(result.mod, player);
    if (hint) heat.push({ id: player.id, name: nameOf(player, line), rule: ruleOf(hint.rule), games: hint.games, of: STREAK });
  }

  // A tracked player with an empty window and nothing learned is just noise in the save.
  for (const [bref, entry] of Object.entries(next)) {
    if (!entry.form.length && !entry.learned.length) delete next[bref];
  }
  heat.sort((a, b) => b.games - a.games);
  return { ledger: next, learned, heat };
}

/** New season: keep what was learned for good, forget every streak. */
/** A skill that never made it onto the card never happened: out of the ledger it goes. */
export function retractLearned(ledger, bref, skillId) {
  const entry = ledger?.[bref];
  if (!entry?.learned?.includes(skillId)) return ledger;
  return { ...ledger, [bref]: { ...entry, learned: entry.learned.filter((id) => id !== skillId) } };
}

/**
 * Settle one game AND hang what was learned on the live roster cards (they are mutated: that is the point).
 * Only skills that really landed are remembered and announced. `grant` is injectable for tests.
 */
export function awardEpiphany({ grant = grantSkillToPlayer, ...input }) {
  const settled = settleEpiphany(input);
  let ledger = settled.ledger;
  const learned = settled.learned.filter((entry) => {
    const player = (input.players || []).find((candidate) => candidate.id === entry.id);
    if (grant(player, entry.skillId)) return true;
    ledger = retractLearned(ledger, player?.bref, entry.skillId);
    return false;
  });
  return { ledger, learned, heat: settled.heat };
}

export function rolloverEpiphany(ledger) {
  const next = {};
  for (const [bref, entry] of Object.entries(ledger || {})) {
    if (entry.learned?.length) next[bref] = { form: [], learned: [...entry.learned] };
  }
  return next;
}
