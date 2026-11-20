/**
 * Arena environment: stands, crowd, benches, officials' table, LED boards, hung scoreboard, shot clocks, light rigs, walls.
 * Built once per CourtView3D into one Group. PURE PRESENTATION: it reads the match snapshot (for the scoreboard) and the clock
 * (for the crowd's idle bob) and nothing else; it cannot touch GameSim state, scores or the RNG.
 *
 * Needs T.InstancedMesh + T.Object3D; without them (the unit-test fake, ancient browsers) it returns null and the court simply
 * has no stands: the match view never depends on it.
 */
import { buildStands } from "./arenaLayout.js";
import { canInstance, disposeTree } from "./arenaInstances.js";
import { crowdPeople, instancedPeople } from "./arenaCrowd.js";
import { courtsidePeople, furnitureBoxes, glowBoxes, hungScoreboard, standBoxes } from "./arenaCourtside.js";

const DEFAULT_TEAM_COLORS = { home: 0x1d428a, away: 0x860038 };

/**
 * @param profile a QUALITY_PROFILES entry ({ crowd, detail, rigs })
 * @param opts    { doc, colors: { home, away } }
 * @returns null | { group, spectators, update(now), setSnapshot(snap), dispose() }
 */
export function buildArenaEnvironment(T, scene, preset, profile, { doc = null, colors = DEFAULT_TEAM_COLORS } = {}) {
  if (!canInstance(T)) return null;
  const group = new T.Group();
  const { steps, seats } = buildStands();
  group.add(standBoxes(T, preset, steps));

  const crowd = instancedPeople(T, crowdPeople(seats, preset, profile.crowd));
  group.add(crowd.group);
  const side = instancedPeople(T, courtsidePeople(preset, { ...DEFAULT_TEAM_COLORS, ...colors }));
  group.add(side.group);

  group.add(furnitureBoxes(T, preset));
  if (profile.detail) group.add(glowBoxes(T, doc, preset));
  const board = hungScoreboard(T, doc, preset);
  group.add(board.mesh);
  scene.add(group);

  return {
    group,
    spectators: crowd.count,
    update(now) {
      crowd.update(now);
    },
    setSnapshot(snap) {
      board.set(snap);
    },
    dispose() {
      disposeTree(group);
    },
  };
}
