/**
 * Run `play()` (a real Reborn game) while capturing every GameSim it steps, and hand back the cards the engine REALLY played: every
 * player, in ANY of those games, whose card carries signature wiring (`activeSignatures` / `signatureLevels`). A Reborn day plays his
 * game AND the rest of the league's games on the same class, so the capture must cover all of them: the contract is that exactly one
 * player in the whole day (the hero) carries it. A report can say anything; the card on the sim is what the engine reads.
 */
import { GameSim } from "../../js/engine/sim.js";

export async function captureHero(play) {
  const original = GameSim.prototype.step;
  const sims = new Set();
  GameSim.prototype.step = function capture(...args) {
    sims.add(this);
    return original.apply(this, args);
  };
  let result;
  try {
    result = await play();
  } finally {
    GameSim.prototype.step = original;
  }
  const players = [...sims].flatMap((sim) => [...sim.home.roster, ...sim.away.roster]);
  const wired = players.filter((p) => p.activeSignatures || p.signatureLevels);
  return { result, sims: [...sims], players: players.length, wired, hero: wired[0] || null };
}
