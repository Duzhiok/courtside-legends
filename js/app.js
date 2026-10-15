import { COACHES, TACTICS, applyCoachPhilosophy, coachTactics } from "./data/coaches.js";
import { playerPrice, topIntangibles } from "./data/intangibles.js";
import { photoImg } from "./data/photo.js";
import { loadPlayers, overall, PLAYERS, clonePlayer } from "./data/players.js";
import { autoFillTeam, drawPack, teamPowerLabel } from "./engine/draft.js";
import { CourtView } from "./engine/court.js";
import { GameSim } from "./engine/sim.js";

const $ = (sel) => document.querySelector(sel);
const screens = {
  loading: $("#screen-loading"),
  home: $("#screen-home"),
  draft: $("#screen-draft"),
  setup: $("#screen-setup"),
  market: $("#screen-market"),
  game: $("#screen-game"),
  result: $("#screen-result"),
  tournament: $("#screen-tournament"),
};

let state = {
  mode: null,
  draft: null,
  setup: null,
  pendingMatch: null,
  career: null,
  sim: null,
  speed: 1,
  tournament: null,
  lastMode: null,
  lineupSig: "",
  court: null,
};

function show(name) {
  Object.values(screens).forEach((el) => el && el.classList.remove("active"));
  screens[name].classList.add("active");
}

document.querySelectorAll(".mode-card").forEach((btn) => {
  btn.addEventListener("click", () => startMode(btn.dataset.mode));
});

function startMode(mode) {
  state.mode = mode;
  state.lastMode = mode;
  state.career = null;
  state.tournament = null;
  if (mode === "quick") {
    const home = autoFillTeam("主队传奇", 10);
    const away = autoFillTeam("客队传奇", 10);
    openSetup(home, away, "home");
    return;
  }
  if (mode === "career") {
    startCareer(false);
    return;
  }
  if (mode === "tournament") {
    show("tournament");
    return;
  }
  initDraft(mode);
  show("draft");
}

$("#btn-draft-back").onclick = () => show("home");
$("#btn-tour-back").onclick = () => show("home");
$("#btn-setup-back").onclick = () => show("home");
$("#btn-home").onclick = () => show("home");
$("#btn-again").onclick = () => startMode(state.lastMode || "quick");

// —— Draft ——
function initDraft(mode) {
  const isDuel = mode === "duel";
  const picksPerSide = isDuel ? 8 : 10;
  state.draft = {
    mode,
    picksPerSide,
    picksDone: { A: 0, B: 0 },
    needCoach: { A: true, B: true },
    turn: "A",
    round: 1,
    teams: {
      A: { name: isDuel ? "玩家 A" : "你的球队", players: [], coach: null, gold: isDuel ? 800 : 600 },
      B: { name: isDuel ? "玩家 B" : "CPU", players: [], coach: null, gold: isDuel ? 800 : 600 },
    },
    used: new Set(),
    pack: [],
    cpu: !isDuel,
  };
  $("#draft-title").textContent = isDuel ? "双人交替选人（稍后可竞价补强）" : "选秀建队";
  $("#roster-a-title").textContent = state.draft.teams.A.name;
  $("#roster-b-title").textContent = state.draft.teams.B.name;
  $("#btn-start-game").disabled = true;
  refreshDraftUI();
  dealPack();
}

function dealPack() {
  const d = state.draft;
  const needCoachCard =
    (d.turn === "A" && d.needCoach.A && d.picksDone.A >= 3) ||
    (d.turn === "B" && d.needCoach.B && d.picksDone.B >= 3);
  d.pack = drawPack(5, { includeCoach: needCoachCard || Math.random() < 0.35, excludeIds: d.used });
  renderPack();
}

function renderPack() {
  const box = $("#pack-cards");
  box.innerHTML = "";
  for (const card of state.draft.pack) {
    const el = document.createElement("button");
    el.className = card.kind === "player" ? "player-card" : "coach-card";
    if (card.kind === "player") {
      const p = card.data;
      const tips = topIntangibles(p, 2)
        .map((t) => `<span class="chip growth">${t.name} ${t.value}</span>`)
        .join("");
      el.innerHTML = `
        <div class="card-head">
          ${photoImg(p, "headshot lg")}
          <div>
            <div class="name">${p.name}</div>
            <div class="meta">${p.season} · ${p.team} · ${p.pos} · OVR ${overall(p)} · ¤${playerPrice(p)}</div>
          </div>
        </div>
        <div class="stat-chips">
          <span class="chip">得分 ${p.scoring}</span>
          <span class="chip">防守 ${p.defense}</span>
          <span class="chip">抢断 ${p.steal ?? "-"}</span>
          <span class="chip">盖帽 ${p.block ?? "-"}</span>
          ${tips}
          ${(p.tags || []).slice(0, 2).map((t) => `<span class="chip warn">${t}</span>`).join("")}
        </div>`;
    } else {
      const c = card.data;
      el.innerHTML = `
        <div class="name">教练 · ${c.name}</div>
        <div class="meta">${c.season} · ${c.team} · ${c.style}</div>
        <div class="stat-chips">
          <span class="chip">攻 +${c.buffs.offense}</span>
          <span class="chip">防 +${c.buffs.defense}</span>
          <span class="chip">士气 +${c.buffs.morale}</span>
        </div>
        <p class="tiny" style="margin:8px 0 0">${c.note}</p>`;
    }
    el.onclick = () => pickCard(card);
    box.appendChild(el);
  }
}

function pickCard(card) {
  const d = state.draft;
  const side = d.turn;
  const team = d.teams[side];
  if (card.kind === "player") {
    if (team.players.length >= d.picksPerSide) return;
    team.players.push(card.data);
    d.used.add(card.data.id);
    d.picksDone[side] += 1;
  } else {
    team.coach = card.data;
    d.used.add(card.data.id);
    d.needCoach[side] = false;
  }
  advanceTurn();
  refreshDraftUI();
  ensureCoachesIfReady();
  if (draftComplete()) {
    $("#btn-start-game").disabled = false;
    $("#pack-cards").innerHTML = `<p class="tiny">选人完成。强度 A ${teamPowerLabel(d.teams.A)} / B ${teamPowerLabel(d.teams.B)}。下一步设置首发与执教方针。</p>`;
    return;
  }
  if (d.cpu && d.turn === "B") setTimeout(cpuPick, 400);
  else dealPack();
}

function cpuPick() {
  const d = state.draft;
  if (d.turn !== "B" || draftComplete()) return;
  dealPack();
  let choice = d.needCoach.B ? d.pack.find((c) => c.kind === "coach") : null;
  if (!choice) {
    const players = d.pack.filter((c) => c.kind === "player").sort((a, b) => overall(b.data) - overall(a.data));
    choice = players[0] || d.pack[0];
  }
  if (choice) pickCard(choice);
}

function advanceTurn() {
  const d = state.draft;
  d.turn = d.turn === "A" ? "B" : "A";
  d.round = Math.min(d.picksDone.A, d.picksDone.B) + 1;
}

function ensureCoachesIfReady() {
  const d = state.draft;
  if (d.teams.A.players.length < d.picksPerSide || d.teams.B.players.length < d.picksPerSide) return;
  for (const side of ["A", "B"]) {
    if (!d.teams[side].coach) {
      const free = COACHES.find((c) => !d.used.has(c.id)) || COACHES[0];
      d.teams[side].coach = structuredClone(free);
      d.used.add(free.id);
      d.needCoach[side] = false;
    }
  }
  refreshDraftUI();
}

function draftComplete() {
  const d = state.draft;
  ensureCoachesIfReady();
  return (
    d.teams.A.players.length >= d.picksPerSide &&
    d.teams.B.players.length >= d.picksPerSide &&
    d.teams.A.coach &&
    d.teams.B.coach
  );
}

function refreshDraftUI() {
  const d = state.draft;
  $("#draft-turn").textContent = d.turn === "A" ? d.teams.A.name : d.teams.B.name;
  $("#draft-left").textContent = String(
    d.picksPerSide - d.teams[d.turn].players.length + (d.needCoach[d.turn] ? 1 : 0)
  );
  $("#draft-round").textContent = String(d.round);
  renderRoster("a", d.teams.A);
  renderRoster("b", d.teams.B);
}

function renderRoster(key, team) {
  const ul = $(`#roster-${key}`);
  ul.innerHTML = team.players
    .map(
      (p) =>
        `<li class="roster-line">${photoImg(p)} <span>${p.name} <span class="tiny">(${p.season} ${p.pos})</span></span></li>`
    )
    .join("");
  $(`#coach-${key}`).textContent = team.coach
    ? `教练：${team.coach.name}（${team.coach.season}）· ${team.coach.style}`
    : "未选教练";
}

$("#btn-start-game").onclick = () => {
  const d = state.draft;
  if (!draftComplete()) return;
  if (d.mode === "duel") {
    // Duel: market bidding first, then setup+series style single game for now → career-like gold path
    state.career = {
      kind: "duel",
      round: 1,
      goldA: d.teams.A.gold || 800,
      goldB: d.teams.B.gold || 800,
      teamA: d.teams.A,
      teamB: d.teams.B,
      used: new Set([...d.teams.A.players, ...d.teams.B.players].map((p) => p.id)),
      finals: false,
      series: null,
    };
    openMarket({ duel: true });
    return;
  }
  openSetup(d.teams.A, d.teams.B, "home");
};

// —— Career progression ——
function startCareer() {
  const you = autoFillTeam("你的球队", 8);
  you.gold = 500;
  const used = new Set(you.players.map((p) => p.id));
  state.career = {
    kind: "career",
    round: 1,
    maxRounds: 4,
    gold: you.gold,
    team: you,
    used,
    finals: false,
    series: null, // { youWins, oppWins, opp }
  };
  openMarket({ career: true });
}

function openMarket({ career = false, duel = false, afterWin = false } = {}) {
  show("market");
  const c = state.career;
  $("#bid-panel").hidden = !duel;
  if (career || c?.kind === "career") {
    $("#market-hint").textContent = afterWin
      ? `第 ${c.round} 轮胜利！赚取金币后调整名单（最多12人），再迎战下一轮。`
      : `金币晋级：赢球赚钱，输球淘汰。总决赛七场四胜，每场后都可买卖。`;
    $("#market-right-title").textContent = "自由市场";
    $("#gold-amt").textContent = String(c.gold);
    renderMarketRoster(c.team, true);
    renderFreeAgents(c);
  } else if (duel || c?.kind === "duel") {
    $("#market-hint").textContent = "双人模式：可用金币买人，或对自由球员竞价。名单上限 12。";
    $("#market-right-title").textContent = "自由市场 / 竞价池";
    $("#gold-amt").textContent = `A ${c.goldA} / B ${c.goldB}`;
    renderMarketRoster(c.teamA, true, "A");
    renderFreeAgents(c, true);
    renderBidCard(c);
  }
  $("#roster-cap").textContent = String((c.team || c.teamA).players.length);
}

function renderMarketRoster(team, canSell, label = "") {
  const box = $("#my-market-roster");
  box.innerHTML = team.players
    .map((p) => {
      const price = Math.round(playerPrice(p) * 0.7);
      return `<div class="market-row">
        ${photoImg(p)}
        <div style="flex:1">
          <strong>${p.name}</strong>
          <div class="tiny">${p.season} ${p.pos} · OVR ${overall(p)} · 卖出 ¤${price}</div>
          <div class="tiny">${topIntangibles(p, 2).map((t) => `${t.name}${t.value}`).join(" · ")}</div>
        </div>
        ${canSell ? `<button class="btn small" data-sell="${p.id}" data-side="${label}">卖出</button>` : ""}
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-sell]").forEach((btn) => {
    btn.onclick = () => sellPlayer(btn.dataset.sell, btn.dataset.side);
  });
}

function renderFreeAgents(c, duel = false) {
  const exclude = c.used || new Set();
  const pack = drawPack(8, { excludeIds: exclude }).filter((x) => x.kind === "player");
  c.shop = pack.map((x) => x.data);
  const box = $("#free-agent-list");
  box.innerHTML = c.shop
    .map((p) => {
      const price = playerPrice(p);
      return `<div class="market-row">
        ${photoImg(p)}
        <div style="flex:1">
          <strong>${p.name}</strong>
          <div class="tiny">${p.season} ${p.pos} · OVR ${overall(p)} · ¤${price}</div>
        </div>
        ${
          duel
            ? `<button class="btn small" data-bid="${p.id}">加入竞价</button>`
            : `<button class="btn small" data-buy="${p.id}">买入</button>`
        }
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.onclick = () => buyPlayer(btn.dataset.buy);
  });
  box.querySelectorAll("[data-bid]").forEach((btn) => {
    btn.onclick = () => {
      c.bidTarget = c.shop.find((p) => p.id === btn.dataset.bid);
      renderBidCard(c);
    };
  });
}

function renderBidCard(c) {
  const p = c.bidTarget || c.shop?.[0];
  c.bidTarget = p;
  if (!p) {
    $("#bid-card").innerHTML = "<p class='tiny'>暂无可竞价球员</p>";
    return;
  }
  $("#bid-card").innerHTML = `${photoImg(p, "headshot lg")} <strong>${p.name}</strong> · 估价 ¤${playerPrice(p)}`;
  $("#bid-a").value = Math.min(c.goldA, playerPrice(p));
  $("#bid-b").value = Math.min(c.goldB, Math.round(playerPrice(p) * 0.9));
}

function sellPlayer(id, side = "") {
  const c = state.career;
  if (c.kind === "career") {
    if (c.team.players.length <= 8) {
      alert("至少保留 8 人");
      return;
    }
    const idx = c.team.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [p] = c.team.players.splice(idx, 1);
    c.gold += Math.round(playerPrice(p) * 0.7);
    openMarket({ career: true });
  } else {
    const team = side === "B" ? c.teamB : c.teamA;
    if (team.players.length <= 8) {
      alert("至少保留 8 人");
      return;
    }
    const idx = team.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [p] = team.players.splice(idx, 1);
    if (side === "B") c.goldB += Math.round(playerPrice(p) * 0.7);
    else c.goldA += Math.round(playerPrice(p) * 0.7);
    openMarket({ duel: true });
  }
}

function buyPlayer(id) {
  const c = state.career;
  const p = c.shop.find((x) => x.id === id);
  if (!p) return;
  const price = playerPrice(p);
  if (c.team.players.length >= 12) {
    alert("名单已满 12 人");
    return;
  }
  if (c.gold < price) {
    alert("金币不足");
    return;
  }
  c.gold -= price;
  c.team.players.push(clonePlayer(p));
  c.used.add(p.id);
  openMarket({ career: true });
}

$("#btn-bid-resolve").onclick = () => {
  const c = state.career;
  const p = c.bidTarget;
  if (!p) return;
  const a = Math.max(0, Number($("#bid-a").value) || 0);
  const b = Math.max(0, Number($("#bid-b").value) || 0);
  if (a === b) {
    alert("出价相同，请再加价");
    return;
  }
  const winnerIsA = a > b;
  const bid = winnerIsA ? a : b;
  const team = winnerIsA ? c.teamA : c.teamB;
  const goldKey = winnerIsA ? "goldA" : "goldB";
  if (c[goldKey] < bid) {
    alert("胜出方金币不足");
    return;
  }
  if (team.players.length >= 12) {
    alert("胜出方名单已满");
    return;
  }
  c[goldKey] -= bid;
  team.players.push(clonePlayer(p));
  c.used.add(p.id);
  c.shop = c.shop.filter((x) => x.id !== p.id);
  c.bidTarget = c.shop[0] || null;
  openMarket({ duel: true });
};

$("#btn-market-done").onclick = () => {
  const c = state.career;
  if (c.kind === "career") {
    if (c.team.players.length < 8) {
      alert("至少 8 人才能出战");
      return;
    }
    c.team.gold = c.gold;
    if (c.finals && c.series) {
      openSetup(c.team, c.series.opp, "home");
      return;
    }
    const opp = autoFillTeam(`第${c.round}轮对手`, 10);
    openSetup(c.team, opp, "home");
    return;
  }
  // duel → setup for A vs B
  openSetup(c.teamA, c.teamB, "home");
};

// —— Setup: starters + philosophy ——
function openSetup(home, away, youSide) {
  state.pendingMatch = { home, away, youSide };
  const you = youSide === "home" ? home : away;
  const sorted = [...you.players].sort((a, b) => overall(b) - overall(a));
  state.setup = {
    you,
    selected: new Set(sorted.slice(0, 5).map((p) => p.id)),
  };
  $("#setup-coach-base").textContent = `基础教练：${you.coach?.name || "自定义"}（${you.coach?.style || ""}）`;
  const box = $("#phil-tactics");
  const current = new Set(you.coach?.specialTactics || ["balanced"]);
  box.innerHTML = Object.values(TACTICS)
    .map(
      (t) =>
        `<label><input type="checkbox" value="${t.id}" ${current.has(t.id) ? "checked" : ""}/> ${t.name}</label>`
    )
    .join("");
  if (you.coach?.buffs) {
    $("#phil-off").value = you.coach.buffs.offense;
    $("#phil-def").value = you.coach.buffs.defense;
    $("#phil-morale").value = you.coach.buffs.morale;
    $("#phil-stam").value = you.coach.buffs.stamina;
  }
  syncPhilLabels();
  renderSetupRoster();
  show("setup");
}

function syncPhilLabels() {
  $("#phil-off-v").textContent = $("#phil-off").value;
  $("#phil-def-v").textContent = $("#phil-def").value;
  $("#phil-morale-v").textContent = $("#phil-morale").value;
  $("#phil-stam-v").textContent = $("#phil-stam").value;
}
["phil-off", "phil-def", "phil-morale", "phil-stam"].forEach((id) => {
  $(`#${id}`).oninput = syncPhilLabels;
});

function renderSetupRoster() {
  const you = state.setup.you;
  const box = $("#setup-roster");
  box.innerHTML = you.players
    .map((p) => {
      const on = state.setup.selected.has(p.id);
      const tips = topIntangibles(p, 3)
        .map((t) => `${t.name}${t.value}`)
        .join(" · ");
      return `<button class="setup-player ${on ? "selected" : ""}" data-id="${p.id}">
        ${photoImg(p)}
        <div>
          <strong>${p.name}</strong>
          <div class="tiny">${p.pos} · ${p.season} · OVR ${overall(p)}${on ? " · 首发" : ""}</div>
          <div class="tiny">暗属性：${tips}</div>
        </div>
      </button>`;
    })
    .join("");
  $("#starter-count").textContent = String(state.setup.selected.size);
  $("#btn-setup-confirm").disabled = state.setup.selected.size !== 5;
  box.querySelectorAll(".setup-player").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      if (state.setup.selected.has(id)) state.setup.selected.delete(id);
      else if (state.setup.selected.size < 5) state.setup.selected.add(id);
      renderSetupRoster();
    };
  });
}

$("#btn-setup-confirm").onclick = () => {
  if (state.setup.selected.size !== 5) return;
  const { home, away, youSide } = state.pendingMatch;
  const you = youSide === "home" ? home : away;
  const tactics = [...$("#phil-tactics").querySelectorAll("input:checked")].map((x) => x.value);
  you.coach = applyCoachPhilosophy(you.coach, {
    styleName: $("#phil-name").value || "自定义方针",
    offense: Number($("#phil-off").value),
    defense: Number($("#phil-def").value),
    morale: Number($("#phil-morale").value),
    stamina: Number($("#phil-stam").value),
    tactics: tactics.length ? tactics : ["balanced"],
    note: "玩家自定义执教方针",
  });
  you.starterIds = [...state.setup.selected];
  // CPU side auto starters
  const opp = youSide === "home" ? away : home;
  if (!opp.starterIds) {
    opp.starterIds = [...opp.players].sort((a, b) => overall(b) - overall(a)).slice(0, 5).map((p) => p.id);
  }
  beginGame(home, away, youSide);
};

// —— Game ——
function beginGame(homeTeam, awayTeam, youSide) {
  if (state.sim) state.sim.stop();
  show("game");
  state.lineupSig = "";
  state.court = new CourtView($("#court-root"));
  state.court.ensureDom();

  $("#game-team-a").textContent = homeTeam.name;
  $("#game-team-b").textContent = awayTeam.name;
  $("#you-side").textContent = youSide === "home" ? homeTeam.name : awayTeam.name;
  state.speed = 1;
  $("#btn-speed").textContent = "速度 x1";

  const sim = new GameSim({
    home: homeTeam,
    away: awayTeam,
    youSide,
    onEvent: (e) => {
      pushFeed(e.type, e.text);
      paintScore(e);
    },
    onTick: (snap) => {
      paintScore(snap);
      paintLineups(snap);
      paintMeters(snap);
      fillSubSelects(snap);
      state.court?.render(snap);
    },
    onEnd: (snap) => showResult(snap),
  });
  state.sim = sim;

  const you = youSide === "home" ? sim.home : sim.away;
  const tactics = coachTactics(you.coach || { specialTactics: [] });
  $("#tactic-select").innerHTML = tactics.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");

  const snap0 = sim.snapshot();
  paintScore(snap0);
  paintLineups(snap0);
  paintMeters(snap0);
  fillSubSelects(snap0, true);
  state.court.render(snap0);
  syncPauseUI();
  sim.start();
}

function pushFeed(type, text) {
  const feed = $("#play-feed");
  if (!feed) return;
  const div = document.createElement("div");
  div.className = `event ${type === "score" ? "score" : type === "coach" ? "coach" : type === "miss" ? "miss" : ""}`;
  div.textContent = text;
  feed.prepend(div);
  while (feed.children.length > 40) feed.removeChild(feed.lastChild);
}

function paintScore(snap) {
  $("#score-a").textContent = snap.score.home;
  $("#score-b").textContent = snap.score.away;
  $("#quarter").textContent = snap.quarter > 4 ? "OT" : `Q${snap.quarter}`;
  $("#game-clock").textContent = fmtClock(snap.clock);
  $("#poss-label").textContent = snap.possession === "home" ? "主队进攻" : "客队进攻";
}

function paintLineups(snap) {
  const sig = [...snap.home.onCourt, ...snap.away.onCourt].map((p) => p.id).join("|");
  // Avoid rewriting DOM every possession unless lineup or points board needs refresh
  const line = (p) =>
    `<li class="roster-line">${photoImg(p)} <span>${p.pos} ${p.name} · ${p.stats.pts}分 ${p.stats.reb}板 ${p.stats.ast}助 ${p.stats.stl}断 ${p.stats.blk}帽 · 疲劳${p.fatigue}</span></li>`;
  if (sig !== state.lineupSig) {
    state.lineupSig = sig;
    $("#oncourt-a").innerHTML = snap.home.onCourt.map(line).join("");
    $("#oncourt-b").innerHTML = snap.away.onCourt.map(line).join("");
    return;
  }
  // light text update only
  const update = (ul, players) => {
    [...ul.children].forEach((li, i) => {
      const p = players[i];
      if (!p) return;
      const span = li.querySelector("span");
      if (span)
        span.textContent = `${p.pos} ${p.name} · ${p.stats.pts}分 ${p.stats.reb}板 ${p.stats.ast}助 ${p.stats.stl}断 ${p.stats.blk}帽 · 疲劳${p.fatigue}`;
    });
  };
  update($("#oncourt-a"), snap.home.onCourt);
  update($("#oncourt-b"), snap.away.onCourt);
}

function paintMeters(snap) {
  const you = snap.youSide === "home" ? snap.home : snap.away;
  $("#morale").textContent = you.morale;
  $("#chem").textContent = you.chem;
  $("#fit").textContent = you.fit;
  $("#morale-bar").style.width = `${you.morale}%`;
  $("#chem-bar").style.width = `${you.chem}%`;
  $("#fit-bar").style.width = `${you.fit}%`;
}

function fillSubSelects(snap, force = false) {
  const out = $("#sub-out");
  const inn = $("#sub-in");
  // Don't rebuild while user is interacting — this was the flicker bug
  if (!force && (document.activeElement === out || document.activeElement === inn)) return;

  const you = snap.youSide === "home" ? snap.home : snap.away;
  const outIds = you.onCourt.map((p) => p.id).join(",");
  const inIds = you.bench.map((p) => p.id).join(",");
  if (!force && out.dataset.sig === outIds && inn.dataset.sig === inIds) return;

  const keepOut = out.value;
  const keepIn = inn.value;
  out.innerHTML = you.onCourt.map((p) => `<option value="${p.id}">下 ${p.name}</option>`).join("");
  inn.innerHTML = you.bench.map((p) => `<option value="${p.id}">上 ${p.name}</option>`).join("");
  out.dataset.sig = outIds;
  inn.dataset.sig = inIds;
  if ([...out.options].some((o) => o.value === keepOut)) out.value = keepOut;
  if ([...inn.options].some((o) => o.value === keepIn)) inn.value = keepIn;
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function syncPauseUI() {
  const paused = !!state.sim?.paused;
  $("#btn-resume").hidden = !paused;
  $("#pause-hint").hidden = !paused;
  $("#btn-pause-sim").textContent = paused ? "继续模拟" : "暂停模拟";
}

function resumeGame() {
  if (!state.sim) return;
  state.sim.setPaused(false);
  syncPauseUI();
  pushFeed("coach", "继续比赛！");
}

$("#btn-timeout").onclick = () => {
  state.sim?.callTimeout();
  syncPauseUI();
};
$("#btn-resume").onclick = () => resumeGame();
$("#btn-shout").onclick = () => state.sim?.shout();
$("#btn-talk").onclick = () => state.sim?.talk();
$("#btn-set-tactic").onclick = () => {
  state.sim?.setTactic($("#tactic-select").value);
  fillSubSelects(state.sim.snapshot(), true);
};
$("#btn-sub").onclick = () => {
  state.sim?.substitute($("#sub-out").value, $("#sub-in").value);
  fillSubSelects(state.sim.snapshot(), true);
  state.lineupSig = "";
};
$("#btn-pause-sim").onclick = () => {
  if (!state.sim) return;
  if (state.sim.paused) resumeGame();
  else {
    state.sim.setPaused(true);
    syncPauseUI();
    pushFeed("coach", "模拟已暂停");
  }
};
$("#btn-speed").onclick = () => {
  if (!state.sim) return;
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
  state.sim.setSpeed(state.speed);
  $("#btn-speed").textContent = `速度 x${state.speed}`;
};

function showResult(snap) {
  show("result");
  const hs = snap.score.home;
  const as = snap.score.away;
  $("#result-score").textContent = `${hs} - ${as}`;
  const youSide = snap.youSide;
  const youScore = youSide === "home" ? hs : as;
  const oppScore = youSide === "home" ? as : hs;
  const youWin = youScore > oppScore;
  const winner = hs === as ? "平局" : hs > as ? snap.home.name : snap.away.name;
  $("#result-title").textContent = hs === as ? "加时仍平——以模拟终局计" : `${winner} 获胜`;
  $("#result-summary").textContent = `化学反应 / 适配度 / 暗属性影响了回合效率。`;
  $("#box-score").innerHTML = `${boxTable(snap.home)}${boxTable(snap.away)}`;

  const cont = $("#btn-result-continue");
  cont.hidden = true;

  if (state.tournament) {
    applyTournamentResult(snap);
    return;
  }
  if (state.career?.kind === "career") {
    handleCareerResult(youWin, snap);
    return;
  }
  if (state.career?.kind === "duel") {
    cont.hidden = false;
    cont.textContent = "回到市场 / 再战";
    cont.onclick = () => {
      // reward both lightly; winner more
      state.career.goldA += youSide === "home" ? (youWin ? 350 : 120) : youWin ? 120 : 350;
      state.career.goldB += youSide === "away" ? (youWin ? 350 : 120) : youWin ? 120 : 350;
      openMarket({ duel: true, afterWin: true });
    };
  }
}

function handleCareerResult(youWin, snap) {
  const c = state.career;
  const cont = $("#btn-result-continue");
  cont.hidden = false;

  if (c.finals && c.series) {
    if (youWin) c.series.youWins += 1;
    else c.series.oppWins += 1;
    $("#result-summary").textContent = `总决赛大比分 ${c.series.youWins} - ${c.series.oppWins}（七场四胜）`;
    if (c.series.youWins >= 4) {
      $("#result-title").textContent = "总冠军！";
      cont.textContent = "捧杯回主页";
      cont.onclick = () => show("home");
      return;
    }
    if (c.series.oppWins >= 4) {
      $("#result-title").textContent = "总决赛出局";
      cont.textContent = "回主页";
      cont.onclick = () => show("home");
      return;
    }
    // earn gold each finals game
    c.gold += youWin ? 280 : 80;
    cont.textContent = "场间市场调整";
    cont.onclick = () => openMarket({ career: true, afterWin: youWin });
    return;
  }

  if (!youWin) {
    $("#result-title").textContent = "淘汰出局";
    $("#result-summary").textContent = "晋级赛输球即淘汰。";
    cont.textContent = "回主页";
    cont.onclick = () => show("home");
    return;
  }

  // win round
  const reward = 200 + c.round * 80;
  c.gold += reward;
  c.round += 1;
  $("#result-summary").textContent = `本轮胜利，获得 ¤${reward}。当前金币 ¤${c.gold}`;

  if (c.round > c.maxRounds) {
    // enter finals
    c.finals = true;
    c.series = { youWins: 0, oppWins: 0, opp: autoFillTeam("总决赛对手", 12) };
    cont.textContent = "进入总决赛市场";
    cont.onclick = () => openMarket({ career: true, afterWin: true });
  } else {
    cont.textContent = "进入转会市场";
    cont.onclick = () => openMarket({ career: true, afterWin: true });
  }
}

function boxTable(team) {
  const rows = [...team.roster]
    .sort((a, b) => b.stats.pts - a.stats.pts)
    .map((p) => {
      const s = p.stats;
      return `<tr>
        <td class="player-cell">${photoImg(p, "headshot sm")} ${p.name}<div class="tiny">${p.season}</div></td>
        <td>${s.min}</td><td>${s.pts}</td><td>${s.reb}</td><td>${s.oreb}</td><td>${s.dreb}</td>
        <td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.tov}</td><td>${s.pf}</td>
        <td>${s.fgm}/${s.fga}</td><td>${s.tpm}/${s.tpa}</td><td>${s.ftm}/${s.fta}</td>
        <td>${s.pm >= 0 ? "+" : ""}${s.pm}</td>
      </tr>`;
    })
    .join("");
  return `<div class="box-wrap"><strong>${team.name}</strong>
    <div class="table-scroll"><table>
      <thead><tr>
        <th>球员</th><th>MIN</th><th>PTS</th><th>REB</th><th>OREB</th><th>DREB</th>
        <th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>PF</th>
        <th>FGM-A</th><th>3PM-A</th><th>FTM-A</th><th>+/-</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
}

// —— Legacy tournament (kept) ——
$("#btn-tour-setup").onclick = () => {
  const n = clamp(Number($("#player-count").value) || 4, 2, 8);
  const size = 1 << Math.ceil(Math.log2(n));
  const players = [];
  for (let i = 0; i < size; i++) {
    players.push({
      id: `P${i + 1}`,
      name: i < n ? `玩家 ${i + 1}` : `轮空 AI ${i + 1}`,
      human: i < n,
      picksAllowed: 4,
      team: { name: i < n ? `玩家 ${i + 1}` : `AI ${i + 1}`, players: [], coach: null },
      eliminated: false,
    });
  }
  state.tournament = { players, round: 1, bracket: [], phase: "draft", currentMatch: 0 };
  renderTournamentSlots();
  $("#btn-tour-next").disabled = false;
  $("#btn-tour-next").textContent = "开始第 1 轮选人";
};

function renderTournamentSlots() {
  const t = state.tournament;
  if (!t) return;
  $("#tour-slots").innerHTML = t.players
    .map(
      (p) =>
        `<div class="slot"><strong>${p.name}</strong><br/>可选 ${p.picksAllowed} 人<br/>已选 ${p.team.players.length} · ${
          p.team.coach ? "有教练" : "无教练"
        }${p.eliminated ? "<br/>已淘汰" : ""}</div>`
    )
    .join("");
}

$("#btn-tour-next").onclick = () => {
  const t = state.tournament;
  if (!t) return;
  if (t.phase === "draft") {
    for (const p of t.players) {
      if (p.eliminated) continue;
      while (p.team.players.length < p.picksAllowed) {
        const pack = drawPack(5, {
          excludeIds: new Set(t.players.flatMap((x) => x.team.players.map((pl) => pl.id))),
        });
        const best = pack.filter((c) => c.kind === "player").sort((a, b) => overall(b.data) - overall(a.data))[0];
        if (!best) break;
        p.team.players.push(best.data);
      }
      if (!p.team.coach) {
        const pack = drawPack(5, { includeCoach: true, excludeIds: new Set() });
        const c = pack.find((x) => x.kind === "coach");
        if (c) p.team.coach = c.data;
      }
      p.team.name = p.name;
    }
    const alive = t.players.filter((p) => !p.eliminated);
    t.bracket = [];
    for (let i = 0; i < alive.length; i += 2) t.bracket.push({ a: alive[i], b: alive[i + 1], done: false });
    t.phase = "match";
    t.currentMatch = 0;
    renderTournamentSlots();
    renderBracket();
    playNextTournamentMatch();
    return;
  }
  playNextTournamentMatch();
};

function renderBracket() {
  const t = state.tournament;
  $("#bracket").innerHTML = t.bracket
    .map((m, i) => {
      const score = m.score ? ` → ${m.score}` : m.done ? " 结束" : i === t.currentMatch ? " ← 当前" : "";
      return `<div class="match-chip">R${t.round} 比赛${i + 1}: ${m.a.name} vs ${m.b.name}${score}</div>`;
    })
    .join("");
}

function playNextTournamentMatch() {
  const t = state.tournament;
  while (t.currentMatch < t.bracket.length && t.bracket[t.currentMatch].done) t.currentMatch++;
  if (t.currentMatch >= t.bracket.length) {
    const winners = t.bracket.map((m) => m.winner).filter(Boolean);
    if (winners.length === 1) {
      $("#bracket").innerHTML += `<div class="match-chip"><strong>总冠军：${winners[0].name}</strong></div>`;
      $("#btn-tour-next").disabled = true;
      return;
    }
    t.round += 1;
    for (const p of winners) p.picksAllowed += 1;
    for (const p of t.players) if (!winners.includes(p)) p.eliminated = true;
    t.phase = "draft";
    t.bracket = [];
    renderTournamentSlots();
    $("#btn-tour-next").disabled = false;
    $("#btn-tour-next").textContent = `第 ${t.round} 轮：每人多 1 次选人，继续`;
    return;
  }
  const m = t.bracket[t.currentMatch];
  const youSide = m.a.human ? "home" : m.b.human ? "away" : "home";
  openSetup(m.a.team, m.b.team, youSide);
}

function applyTournamentResult(snap) {
  const t = state.tournament;
  if (!t || t.phase !== "match") return;
  const m = t.bracket[t.currentMatch];
  if (!m || m.done) return;
  m.done = true;
  m.score = `${snap.score.home}-${snap.score.away}`;
  m.winner = snap.score.home >= snap.score.away ? m.a : m.b;
  const loser = m.winner === m.a ? m.b : m.a;
  loser.eliminated = true;
  t.currentMatch += 1;
  renderBracket();
  renderTournamentSlots();
  $("#btn-tour-next").disabled = false;
  $("#btn-tour-next").textContent = "继续淘汰赛";
  const cont = $("#btn-result-continue");
  cont.hidden = false;
  cont.textContent = "继续淘汰赛";
  cont.onclick = () => {
    show("tournament");
  };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

async function boot() {
  try {
    $("#load-status").textContent = "下载 / 解析全历史赛季卡…";
    $("#load-bar").style.width = "45%";
    await loadPlayers();
    $("#load-bar").style.width = "100%";
    $("#load-status").textContent = `已加载 ${PLAYERS.length} 张赛季卡`;
    const poolNote = document.querySelector(".hint-panel ul");
    if (poolNote) {
      const li = document.createElement("li");
      li.textContent = `卡池 ${PLAYERS.length} 张；含暗属性（引力/硬气/领袖等）；可自选首发与执教方针；金币晋级赛支持买卖与双人竞价。`;
      poolNote.appendChild(li);
    }
    setTimeout(() => show("home"), 200);
  } catch (e) {
    $("#load-status").textContent = `名册加载失败：${e.message}。请用本地服务器打开。`;
  }
}

boot();
