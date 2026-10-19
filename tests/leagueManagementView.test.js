import test from "node:test";
import assert from "node:assert/strict";
import {
  renderCareerHistory,
  renderDevelopmentPlans,
  renderDraftBoard,
} from "../js/ui/leagueManagementView.js";

function container(controls = {}) {
  return {
    innerHTML: "",
    onclick: null,
    onchange: null,
    dataset: {},
    querySelector(selector) {
      return controls[selector] || null;
    },
    querySelectorAll(selector) {
      return controls[selector] || [];
    },
  };
}

function player(bref, overrides = {}) {
  return {
    id: `${bref}-2030`,
    bref,
    name: bref,
    pos: "PG",
    age: 24,
    season: 2030,
    overall: 70,
    scoring: 70,
    three: 70,
    mid: 70,
    paint: 70,
    pass: 70,
    defense: 70,
    rebound: 70,
    steal: 70,
    block: 70,
    speed: 70,
    strength: 70,
    stamina: 70,
    iq: 70,
    clutch: 70,
    ...overrides,
  };
}

function career() {
  const players = [
    player('alpha"><img src=x onerror=1>', {
      name: 'A <script>"',
      overall: 82,
      roleExpectation: "starter",
      targetMinutes: 31,
    }),
    player("mentor", { name: "Mentor & Co", age: 31, overall: 75 }),
  ];
  return {
    kind: "franchise",
    phase: "draft",
    season: {
      phase: "done",
      year: 2030,
      userTeamId: "USER",
      teams: {
        USER: { name: 'User <Team>', players },
        CPU: { name: 'CPU "Team"', players: [] },
      },
    },
    management: {
      draft: {
        year: 2030,
        status: "in_progress",
        currentPick: 0,
        order: ["USER", "CPU"],
        selections: [],
        prospects: [
          {
            prospectId: 'hist"><bad>',
            bref: "hist",
            name: "History <One>",
            pos: "SF",
            source: "historical-debut",
            scoutingRange: { min: 77, max: 91 },
            potential: 94,
            player: { age: 20, season: 2031 },
          },
          {
            prospectId: "generated",
            bref: "generated",
            name: "Generated & Two",
            pos: "C",
            source: "generated",
            scoutingRange: { min: 70, max: 88 },
            potential: 90,
            player: { age: 21, season: 2031 },
          },
        ],
      },
      developmentPlans: {},
    },
    manualOverrides: {},
    recommendations: {},
  };
}

function target(action, data = {}) {
  const button = { dataset: { action, ...data }, disabled: false };
  return {
    closest(selector) {
      return selector === "[data-action]" ? button : null;
    },
  };
}

test("draft view escapes names/data, labels sources, and hides exact potential", () => {
  const model = career();
  const before = structuredClone(model);
  const box = container();
  renderDraftBoard(box, { career: model, teamNames: {} }, {});

  assert.match(box.innerHTML, /History &lt;One&gt;/);
  assert.match(box.innerHTML, /User &lt;Team&gt;/);
  assert.match(box.innerHTML, /hist&quot;&gt;&lt;bad&gt;/);
  assert.match(box.innerHTML, /历史首秀班（非精确选秀史）/);
  assert.match(box.innerHTML, /架空新秀/);
  assert.match(box.innerHTML, /77–91/);
  assert.doesNotMatch(box.innerHTML, /potential|94|90/);
  assert.deepEqual(model, before);
});

test("draft picking is available only on the user's turn", () => {
  const model = career();
  let picked = null;
  const box = container();
  renderDraftBoard(box, { career: model, teamNames: {} }, {
    pickProspect(id) {
      picked = id;
    },
  });
  box.onclick({ target: target("pick", { prospectId: "generated" }) });
  assert.equal(picked, "generated");

  model.management.draft.order[0] = "CPU";
  const cpuBox = container();
  renderDraftBoard(cpuBox, { career: model, teamNames: {} }, {});
  assert.doesNotMatch(cpuBox.innerHTML, /data-action="pick"/);
  assert.match(cpuBox.innerHTML, /恢复|电脑球队/);
});

test("full user roster requires an explicit waiver before picking", () => {
  const model = career();
  model.season.teams.USER.players = Array.from(
    { length: 15 },
    (_, index) => player(`roster-${index}`, { name: `Roster ${index}` }),
  );
  let picked = null;
  const waiverSelect = { value: "" };
  const error = { textContent: "", hidden: true };
  const pickButtons = [{ disabled: true }, { disabled: true }];
  const box = container({
    ".draft-waiver-select": waiverSelect,
    ".draft-waiver-error": error,
    '[data-action="pick"]': pickButtons,
  });
  renderDraftBoard(box, { career: model, teamNames: {} }, {
    pickProspect(prospectId, options) {
      picked = { prospectId, options };
    },
  });

  assert.match(box.innerHTML, /为新秀腾位置/);
  assert.match(box.innerHTML, /<option value="" disabled selected>选择要裁掉的球员<\/option>/);
  assert.match(box.innerHTML, /data-action="pick"[^>]*disabled/);
  box.onclick({ target: target("pick", { prospectId: "generated" }) });
  assert.equal(picked, null);
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /选择要裁掉的球员/);

  waiverSelect.value = "roster-9-2030";
  box.onchange({ target: waiverSelect });
  assert.deepEqual(pickButtons.map((button) => button.disabled), [false, false]);
  assert.equal(error.hidden, true);
  box.onclick({ target: target("pick", { prospectId: "generated" }) });
  assert.deepEqual(picked, {
    prospectId: "generated",
    options: { waivePlayerId: "roster-9-2030" },
  });
});

test("completed draft exposes next-season callback and selection details", async () => {
  const model = career();
  model.management.draft.status = "complete";
  model.management.draft.currentPick = 2;
  model.management.draft.selections = [{
    pickNumber: 1,
    teamId: "USER",
    prospectId: "generated",
    bref: "generated",
    name: "Generated & Two",
    source: "generated",
    contract: { years: 4, salary: 120 },
    waived: { name: "Waived <Player>" },
  }];
  let completed = 0;
  const box = container();
  renderDraftBoard(box, { career: model, teamNames: {} }, {
    async completeOffseason() {
      completed += 1;
    },
  });

  assert.match(box.innerHTML, /四年合同|¤120|Waived &lt;Player&gt;/);
  const eventTarget = target("complete-offseason");
  const pending = box.onclick({ target: eventTarget });
  assert.equal(eventTarget.closest("[data-action]").disabled, true);
  await pending;
  assert.equal(completed, 1);
});

test("a prior-year completed draft does not block the current season", () => {
  const model = career();
  model.phase = "regular";
  model.season.phase = "regular";
  model.season.year = 2031;
  model.management.draft.status = "complete";
  const box = container();

  renderDraftBoard(box, { career: model, teamNames: {} }, {});

  assert.match(box.innerHTML, /下一届选秀：2031 年/);
  assert.doesNotMatch(box.innerHTML, /开始新赛季/);
});

test("development view renders markers, selected plans, and does not mutate", () => {
  const model = career();
  const alpha = model.season.teams.USER.players[0].bref;
  model.management.developmentPlans[alpha] = {
    focus: "defense",
    role: "bench",
    mentorBref: "mentor",
    load: "low",
    source: "manual",
  };
  model.manualOverrides = { training: { [alpha]: structuredClone(model.management.developmentPlans[alpha]) } };
  model.recommendations = {
    training: {
      mentor: {
        focus: "conditioning",
        role: "starter",
        mentorBref: null,
        load: "normal",
        source: "automatic",
      },
    },
  };
  const before = structuredClone(model);
  const box = container();
  renderDevelopmentPlans(box, { career: model }, {});

  assert.match(box.innerHTML, /手动/);
  assert.match(box.innerHTML, /自动建议/);
  assert.match(box.innerHTML, /value="defense" selected/);
  assert.match(box.innerHTML, /value="mentor" selected/);
  assert.deepEqual(model, before);
});

test("invalid legacy manual values are marked invalid and do not borrow automatic-looking values", () => {
  const model = career();
  const alpha = model.season.teams.USER.players[0].bref;
  model.manualOverrides = { training: { [alpha]: "legacy-value" } };
  model.recommendations = {
    training: {
      [alpha]: {
        focus: "defense",
        role: "alpha",
        mentorBref: "mentor",
        load: "high",
        source: "automatic",
      },
    },
  };
  const box = container();

  renderDevelopmentPlans(box, { career: model }, {});

  assert.match(box.innerHTML, /手动（无效）/);
  assert.match(box.innerHTML, /value="balanced" selected/);
  assert.match(box.innerHTML, /value="role" selected/);
  assert.match(box.innerHTML, /value="normal" selected/);
  assert.doesNotMatch(box.innerHTML, /value="defense" selected/);
});

test("delegated actions keep a synchronous pending guard through the current turn", async () => {
  const model = career();
  let calls = 0;
  const box = container();
  renderDraftBoard(box, { career: model, teamNames: {} }, {
    pickProspect() {
      calls += 1;
    },
  });
  const button = {
    dataset: { action: "pick", prospectId: "generated" },
    disabled: false,
  };
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? button : null;
      },
    },
  };

  box.onclick(event);
  box.onclick(event);
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  await Promise.resolve();
  assert.equal(button.disabled, false);
});

test("delegated development save returns exact bref and selected values", () => {
  const model = career();
  const bref = model.season.teams.USER.players[0].bref;
  let saved;
  const row = {
    querySelector(selector) {
      return {
        ".development-plan-focus": { value: "playmaking" },
        ".development-plan-role": { value: "sixth" },
        ".development-plan-mentor": { value: "mentor" },
        ".development-plan-load": { value: "high" },
      }[selector];
    },
  };
  const button = { dataset: { action: "save-plan", bref } };
  const eventTarget = {
    closest(selector) {
      if (selector === "[data-action]") return button;
      if (selector === "[data-plan-row]") return row;
      return null;
    },
  };
  const box = container();
  renderDevelopmentPlans(box, { career: model }, {
    savePlan(savedBref, plan) {
      saved = { bref: savedBref, plan };
    },
  });
  box.onclick({ target: eventTarget });

  assert.deepEqual(saved, {
    bref,
    plan: {
      focus: "playmaking",
      role: "sixth",
      mentorBref: "mentor",
      load: "high",
    },
  });
});

test("history view escapes content, renders newest first, and stays immutable", () => {
  const model = career();
  model.management.seasonHistory = [
    {
      year: 2030,
      teamId: "USER",
      teamName: "User <Team>",
      record: { w: 45, l: 37 },
      finish: "playoffs",
      championId: "CPU",
      awards: {
        mvp: { name: 'MVP <script>"' },
        dpoy: null,
        roy: null,
      },
      transactions: [{
        type: "sign",
        year: 2030,
        day: 4,
        description: 'Sign <Player> & "friend"',
      }],
    },
    {
      year: 2031,
      teamId: "USER",
      teamName: "User <Team>",
      record: { w: 50, l: 32 },
      finish: "champion",
      championId: "USER",
      awards: { mvp: null, dpoy: null, roy: null },
      transactions: [],
    },
  ];
  model.management.draftHistory = [{
    year: 2030,
    selections: [{
      pickNumber: 7,
      teamId: "USER",
      name: "Rookie <One>",
      bref: "rookie",
      source: "historical-debut",
    }],
  }];
  model.history = [{
    type: "accepted-offer",
    year: 2030,
    teamId: "USER",
    at: 1,
  }];
  const before = structuredClone(model);
  const box = container();

  renderCareerHistory(box, { career: model });

  assert.ok(box.innerHTML.indexOf("2031") < box.innerHTML.indexOf("2030"));
  assert.match(box.innerHTML, /MVP &lt;script&gt;&quot;/);
  assert.match(box.innerHTML, /Rookie &lt;One&gt;/);
  assert.match(box.innerHTML, /Sign &lt;Player&gt; &amp; &quot;friend&quot;/);
  assert.match(box.innerHTML, /接受 User &lt;Team&gt; 邀请/);
  assert.doesNotMatch(box.innerHTML, /accepted-offer/);
  assert.match(box.innerHTML, /<details>/);
  assert.doesNotMatch(box.innerHTML, /<details open/);
  assert.equal(box.dataset.historyFilter, "all");
  assert.deepEqual(model, before);
});

test("history view uses one delegated filter handler and clear empty states", () => {
  const model = career();
  model.management.seasonHistory = [{
    year: 2030,
    teamId: "USER",
    record: { w: 40, l: 42 },
    finish: "lottery",
    championId: "CPU",
    awards: {},
    transactions: [],
  }];
  model.management.draftHistory = [];
  model.history = [];
  const box = container();
  box.dataset = {};
  renderCareerHistory(box, { career: model });
  const delegated = box.onclick;
  const filterButton = {
    dataset: { historyFilter: "drafts" },
    closest(selector) {
      return selector === "[data-history-filter]" ? this : null;
    },
  };

  delegated({ target: filterButton });

  assert.equal(box.onclick, delegated);
  assert.equal(box.dataset.historyFilter, "drafts");
  assert.match(box.innerHTML, /暂无.*选秀|没有.*选秀/);
  assert.deepEqual(model.management.seasonHistory[0].record, { w: 40, l: 42 });

  const unmanaged = container();
  renderCareerHistory(unmanaged, { career: { season: {} } });
  assert.match(unmanaged.innerHTML, /长期生涯|载入/);
});
