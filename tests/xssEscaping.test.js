// S-P1-1: stored XSS via an imported save — season names reached innerHTML unescaped in
// several views, and the standings tab (the default after import) triggered it with no
// further click. The render points escape now; the validator refuses markup names at
// load/import (see saveRoot.test.js); the two user-editable names are sanitised on entry.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { createAccount, saveAccount, getAccount, accountToTeam } = await import("../js/data/account.js");
const { realTeam, installRealCards } = await import("./helpers/realGame.js");
const { applyRotationPlan } = await import("../js/engine/gameplan.js");

const appSrc = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("S-P1-1: the standings table escapes the team name (default tab — the auto-trigger)", () => {
  assert.ok(appSrc.includes("</i>${esc(r.name)}</td>"), "standings row escapes r.name");
  assert.ok(!appSrc.includes("</i>${r.name}</td>"), "no unescaped standings name remains");
});

test("S-P1-1: the stats table escapes the team and player names", () => {
  assert.ok(appSrc.includes("<strong>${esc(teamNameL(team.name))}</strong>"), "stats header escapes team.name (after the display-name lookup)");
  assert.ok(appSrc.includes('${photoImg(p, "headshot sm")} ${esc(p.name)}'), "stats rows escape p.name");
  assert.ok(!appSrc.includes("<strong>${team.name}</strong>"), "no unescaped stats header remains");
});

// S-P1-1 (the trade-market team dropdown escapes the name and the id) now lives in seasonMarketView.test.js: the market markup
// moved out of app.js (B61 step 9), and that test asserts the rendered dropdown instead of a source literal.

test("S-P1-1: the player card escapes the name, team and position", () => {
  assert.ok(appSrc.includes('<div class="name">${esc(p.name)} <span class="pos-badge">'));
  assert.ok(appSrc.includes("[p.season, esc(p.team), esc(p.pos),"));
  assert.ok(!appSrc.includes('<div class="name">${p.name} <span class="pos-badge">'));
});

test("S-P1-1: the coach and assistant cards escape name, team, style and notes", () => {
  assert.ok(appSrc.includes("教练 · ${esc(c.name)}"), "coach card escapes the name");
  assert.ok(appSrc.includes("${esc(c.team)} · ${esc(c.style)}"), "coach card escapes team and style");
  assert.ok(appSrc.includes("助教 · ${esc(a.name)}"), "assistant card escapes the name");
  assert.ok(appSrc.includes('${esc(c.note || "")}'), "coach note is escaped");
  assert.ok(appSrc.includes('${esc(a.note || "")}'), "assistant note is escaped");
  assert.ok(!appSrc.includes("教练 · ${c.name}"), "no unescaped coach name remains");
  assert.ok(!appSrc.includes("助教 · ${a.name}"), "no unescaped assistant name remains");
});

test("S-P1-1: the awards page escapes player, team and coach names", async () => {
  // Rendered, not grepped: the awards tab lives in js/ui/seasonAwardsView.js now.
  const { seasonAwardsHtml } = await import("../js/ui/seasonAwardsView.js");
  const evil = (tag) => `${tag}<img src=x onerror=alert(1)>`;
  const award = (id, name) => ({ playerId: id, teamId: "EVL", name: evil(name), teamName: evil("Team"), pos: "SF", gp: 10, ppg: 20, rpg: 5, apg: 5 });
  const st = {
    userTeamId: "EVL",
    teams: { EVL: { name: evil("Squad") } },
    standings: { EVL: { w: 6, l: 4, pf: 1000, pa: 950 } },
    playerSeason: {},
    awards: {
      mvp: award("p1", "Mvp"), dpoy: award("p2", "Dpoy"), sixthMan: null, mip: null, roy: null,
      coty: { name: evil("Coach"), teamId: "EVL", teamName: evil("Team"), w: 6, l: 4 },
      allNba: { first: [award("p3", "AllNba")] }, allDefense: { first: [award("p4", "AllD")] },
      scoringChamp: award("p5", "Scorer"),
    },
  };
  for (const lang of ["zh", "en"]) {
    const html = seasonAwardsHtml(st, lang);
    assert.ok(html.includes("Mvp&lt;img"), `${lang}: the name is shown, escaped`);
    assert.ok(!/<img src=x/i.test(html), `${lang}: no injected element survives`);
    const handlers = html.match(/onerror=alert/g) || [];
    const escaped = html.match(/&lt;img src=x onerror=alert/g) || [];
    assert.equal(handlers.length, escaped.length, `${lang}: every injected handler is inert escaped text`);
  }
});

test("S-P1-1: a custom team name with markup is stripped before it becomes a team name", () => {
  const squad = realTeam("LAL", 2001).players.slice(0, 5);
  installRealCards(...[...new Set(squad.map((p) => p.bref))]);
  const acc = createAccount("Tester");
  acc.playerIds = squad.map((p) => p.id);
  saveAccount(acc);
  const team = accountToTeam(getAccount(acc.id), "Evil</option><img src=x onerror=alert(1)>");
  assert.ok(team, "the team still builds");
  assert.ok(!/[<>]/.test(team.name), `no markup survives in the team name: ${team.name}`);
  const plain = accountToTeam(getAccount(acc.id), "拉斯维加斯 Aces");
  assert.equal(plain.name, "拉斯维加斯 Aces", "an ordinary name passes through unchanged");
});

test("S-P1-1: a hostile account name cannot smuggle markup into the fallback team name either", () => {
  const squad = realTeam("LAL", 2001).players.slice(0, 5);
  installRealCards(...[...new Set(squad.map((p) => p.bref))]);
  const acc = createAccount("Bad<Name>");
  acc.playerIds = squad.map((p) => p.id);
  saveAccount(acc);
  const team = accountToTeam(getAccount(acc.id));
  assert.ok(team);
  assert.ok(!/[<>]/.test(team.name), `no markup survives in the fallback name: ${team.name}`);
});

test("S-P1-1: a gameplan style name with markup is stripped and capped before it lands on the coach", () => {
  const team = { players: [], coach: { name: "Phil", style: "三角进攻" } };
  applyRotationPlan(team, {
    phil: { styleName: "Evil<img src=x onerror=alert(1)>" + "y".repeat(100), offense: 0, defense: 0, morale: 0, stamina: 0 },
    players: [],
    starterIds: [],
  });
  assert.ok(!/[<>]/.test(team.coach.style), `no markup survives in the style: ${team.coach.style}`);
  assert.ok(team.coach.style.length <= 60, `the style is capped at 60 chars: ${team.coach.style.length}`);
  const team2 = { players: [], coach: { name: "Phil", style: "三角进攻" } };
  applyRotationPlan(team2, {
    phil: { styleName: "我的体系", offense: 0, defense: 0, morale: 0, stamina: 0 },
    players: [],
    starterIds: [],
  });
  assert.equal(team2.coach.style, "我的体系", "an ordinary style passes through unchanged");
});

test("A-P2-14: coachingMomentView's esc covers the single quote like every other esc", () => {
  const src = readFileSync(new URL("../js/ui/coachingMomentView.js", import.meta.url), "utf8");
  // Since the shared-esc refactor (c2cccf2) the view imports esc from core/html.js
  // instead of defining its own; the single-quote coverage now lives there.
  assert.ok(!src.includes("const esc ="), "no local esc definition shadows the shared one");
  assert.ok(src.includes('from "../core/html.js"'), "esc is imported from the shared module");
  const shared = readFileSync(new URL("../js/core/html.js", import.meta.url), "utf8");
  assert.ok(shared.includes("[&<>\"']"), "the shared esc character class includes the single quote");
  assert.ok(shared.includes("&#39;"), "the single quote is escaped to &#39;");
});
