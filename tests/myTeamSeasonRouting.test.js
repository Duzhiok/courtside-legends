// Structural guards for ADR-010 T2. A My Team season in the quick-season slot would silently destroy a
// different player's save, so the routing rules are pinned in source, not just by behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const fnBody = (name) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = app.indexOf("\nfunction ", start + 10);
  return app.slice(start, next < 0 ? undefined : next);
};

test("every saveSeason() call lives inside saveSeasonAndCareer, AFTER the My Team router", () => {
  const body = fnBody("saveSeasonAndCareer");
  const calls = [...app.matchAll(/\bsaveSeason\(/g)].length;
  const inside = [...body.matchAll(/\bsaveSeason\(/g)].length;
  assert.equal(calls, inside, "no other code path may write the quick-season slot directly");
  assert.ok(body.indexOf("st?.myTeam") >= 0 && body.indexOf("st?.myTeam") < body.indexOf("saveSeason("), "router comes first");
  assert.ok(body.includes("saveMyTeamSeason(st)"));
});

test("abandoning a My Team season can never reach the whole-career delete", () => {
  const i = app.indexOf('$("#btn-season-abandon")?.addEventListener');
  const handler = app.slice(i, app.indexOf("\n});", i));
  const mine = handler.indexOf("state.season?.myTeam");
  assert.ok(mine >= 0);
  assert.ok(mine < handler.indexOf("deleteCareerSave"), "my-team branch returns before deleteCareerSave");
  assert.ok(mine < handler.indexOf('blockedByForeignSave("career"'), "and before the career lock check");
  const end = handler.indexOf("\n    return;\n  }", mine); // the my-team branch's own closing return
  assert.ok(end > mine, "the my-team branch ends with a return");
  const branch = handler.slice(mine, end);
  assert.ok(branch.includes("clearMyTeamSeason"));
  assert.ok(!branch.includes("clearSeasonSave") && !branch.includes("deleteCareerSave"));
});

test("the My Team slot is wired into boot stamping and the foreign-save tables", () => {
  assert.ok(/stampLegacySaves\(\{[^}]*myteam: readMyTeamSeason\(\)/.test(app));
  assert.ok(/myteam: \["我的赛季", "My Team season"\]/.test(app));
  assert.ok(/myteam: \(\) => hasMyTeamSeason\(\)/.test(app));
});
