/**
 * Skills M1b: firing a signature move on purpose. Pure rules; the engine seam is `sim.requestedSignature`, the effect is the same
 * `signatureEffect` the random proc uses (data/skills.js), so a fired move is never stronger than a random one.
 *
 * - ONE budget per game, shared by every move he owns: SIGNATURE_BUDGET (owner-approved: 2). It lives on the sim
 *   (`sim.activeSignatureUses`), so pauses, substitutions and overtime cannot reset it, and it is saved with the game.
 * - A move he owns is "set to fire on purpose": its random proc is OFF for him (`card.activeSignatures`). When he is not asked
 *   (Auto mode, a question the gate skipped, a bubble nobody answered) the autopilot fires a move only when it is a clear
 *   edge, so nobody loses his move by not clicking.
 * - An attempt the engine refuses (the ball never reached him, a turnover first) spends nothing.
 */
import { SKILL_PACKS } from "../data/skills.js";

export const SIGNATURE_BUDGET = 2;
/** The autopilot needs this much more expected points than his best normal look: more when it is early (save the move), less in the 4th. */
export const AUTO_MARGIN_EARLY = 0.2;
export const AUTO_MARGIN_LATE = 0.05;
/** A refused attempt still makes him the ball handler for that possession, so the autopilot gives up after this many refusals a game. */
export const AUTO_MAX_REFUSALS = 3;

/** The offensive signature moves a card owns, in a stable order. */
export const signaturesOf = (card) => [...new Set(card?.skills || [])].filter((id) => SKILL_PACKS[id]?.signature && SKILL_PACKS[id].kind === "offense");

export const signaturesLeft = (sim) => Math.max(0, SIGNATURE_BUDGET - (Number(sim?.activeSignatureUses) || 0));

/** Would the autopilot fire this option now? (`margin` = its expected points minus his best normal look.) */
export const autoFires = ({ margin = 0, quarter = 1, left = 0 } = {}) => left > 0 && margin >= (quarter >= 4 ? AUTO_MARGIN_LATE : AUTO_MARGIN_EARLY);
