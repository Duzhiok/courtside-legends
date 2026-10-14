import { COACHES, coachTactics } from "./data/coaches.js";
import { photoImg } from "./data/photo.js";
import { overall, PLAYERS } from "./data/players.js";
import { autoFillTeam, drawPack, teamPowerLabel } from "./engine/draft.js";
import { GameSim } from "./engine/sim.js";

const $ = (sel) => document.querySelector(sel);
const screens = {
  home: $("#screen-home"),
  draft: $("#screen-draft"),
  game: $("#screen-game"),
  result: $("#screen-result"),
  tournament: $("#screen-tournament"),
};

let state = {
  mode: null,
  draft: null,
  game: null,
  sim: null,
  speed: 1,
  tournament: null,
  lastMode: null,
};

function show(name) {
  Object.values(screens).forEach((el) => el.classList.remove("active"));
  screens[name].classList.add("active");
}

// —— Home ——
document.querySelectorAll(".mode-card").forEach((btn) => {
  btn.addEventListener("click", () => startMode(btn.dataset.mode));
});

function startMode(mode) {
  state.mode = mode;
  state.lastMode = mode;
  if (mode === "quick") {
    const home = autoFillTeam("主队传奇", 8);
    const away = autoFillTeam("客队传奇", 8);
    beginGame(home, away, "home");
    return;
  }
  if (mode === "tournament") {
    show("tournament");
    return;
  }
  // draft / duel
  initDraft(mode);
  show("draft");
}

$("#btn-draft-back").onclick = () => show("home");
$("#btn-tour-back").onclick = () => show("home");
$("#btn-home").onclick = () => show("home");
$("#btn-again").onclick = () => startMode(state.lastMode || "quick");

// —— Draft ——
function initDraft(mode) {
  const isDuel = mode === "duel";
  const picksPerSide = isDuel ? 6 : 8;
  state.draft = {
    mode,
    picksPerSide,
    picksDone: { A: 0, B: 0 },
    needCoach: { A: true, B: true },
    turn: "A",
    round: 1,
    teams: {
      A: { name: isDuel ? "玩家 A" : "你的球队", players: [], coach: null },
      B: { name: isDuel ? "玩家 B" : "CPU", players: [], coach: null },
    },
    used: new Set(),
    pack: [],
    cpu: !isDuel,
  };
  $("#draft-title").textContent = isDuel ? "双人交替选人" : "选秀建队";
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
  // Periodically include a coach in the pack
  const includeCoach = needCoachCard || Math.random() < 0.35;
  d.pack = drawPack(5, { includeCoach, excludeIds: d.used });
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
      el.innerHTML = `
        <div class="card-head">
          ${photoImg(p, "headshot lg")}
          <div>
            <div class="name">${p.name}</div>
            <div class="meta">${p.season} · ${p.team} · ${p.pos} · OVR ${overall(p)}</div>
          </div>
        </div>
        <div class="stat-chips">
          <span class="chip">得分 ${p.scoring}</span>
          <span class="chip">防守 ${p.defense}</span>
          <span class="chip">抢断 ${p.steal ?? "-"}</span>
          <span class="chip">盖帽 ${p.block ?? "-"}</span>
          <span class="chip">速度 ${p.speed}</span>
          <span class="chip">力量 ${p.strength}</span>
          ${p.growth >= 70 ? `<span class="chip growth">成长 ${p.growth}</span>` : ""}
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
    $("#pack-cards").innerHTML = `<p class="tiny">选人完成。阵容强度 A ${teamPowerLabel(d.teams.A)} / B ${teamPowerLabel(d.teams.B)}。隐藏等级未显示。</p>`;
    return;
  }

  if (d.cpu && d.turn === "B") {
    setTimeout(cpuPick, 450);
  } else {
    dealPack();
  }
}

function cpuPick() {
  const d = state.draft;
  if (d.turn !== "B" || draftComplete()) return;
  dealPack();
  // Prefer coach if missing and available
  let choice = null;
  if (d.needCoach.B) {
    choice = d.pack.find((c) => c.kind === "coach");
  }
  if (!choice) {
    const players = d.pack.filter((c) => c.kind === "player");
    players.sort((a, b) => overall(b.data) - overall(a.data));
    choice = players[0] || d.pack[0];
  }
  if (choice) pickCard(choice);
}

function advanceTurn() {
  const d = state.draft;
  // Snake-ish: A B B A
  if (d.mode === "duel") {
    d.turn = d.turn === "A" ? "B" : "A";
  } else {
    // player then cpu
    d.turn = d.turn === "A" ? "B" : "A";
  }
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
  beginGame(d.teams.A, d.teams.B, "home");
};

// —— Game ——
function beginGame(homeTeam, awayTeam, youSide) {
  if (state.sim) state.sim.stop();
  show("game");
  $("#play-feed").innerHTML = "";
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
    },
    onEnd: (snap) => showResult(snap),
  });
  state.sim = sim;

  // tactics dropdown
  const you = youSide === "home" ? sim.home : sim.away;
  const tactics = coachTactics(you.coach || { specialTactics: [] });
  const sel = $("#tactic-select");
  sel.innerHTML = tactics.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");

  paintScore(sim.snapshot());
  paintLineups(sim.snapshot());
  paintMeters(sim.snapshot());
  fillSubSelects(sim.snapshot());
  syncPauseUI();
  sim.start();
}

function pushFeed(type, text) {
  const feed = $("#play-feed");
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
  const line = (p) =>
    `<li class="roster-line">${photoImg(p)} <span>${p.pos} ${p.name} · ${p.stats.pts}分 ${p.stats.reb}板 ${p.stats.ast}助 ${p.stats.stl}断 ${p.stats.blk}帽 · 疲劳${p.fatigue}</span></li>`;
  $("#oncourt-a").innerHTML = snap.home.onCourt.map(line).join("");
  $("#oncourt-b").innerHTML = snap.away.onCourt.map(line).join("");
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

function fillSubSelects(snap) {
  const you = snap.youSide === "home" ? snap.home : snap.away;
  $("#sub-out").innerHTML = you.onCourt.map((p) => `<option value="${p.id}">下 ${p.name}</option>`).join("");
  $("#sub-in").innerHTML = you.bench.map((p) => `<option value="${p.id}">上 ${p.name}</option>`).join("");
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function syncPauseUI() {
  const paused = !!state.sim?.paused;
  const resume = $("#btn-resume");
  const hint = $("#pause-hint");
  const pauseSim = $("#btn-pause-sim");
  if (resume) resume.hidden = !paused;
  if (hint) hint.hidden = !paused;
  if (pauseSim) pauseSim.textContent = paused ? "继续模拟" : "暂停模拟";
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
$("#btn-set-tactic").onclick = () => state.sim?.setTactic($("#tactic-select").value);
$("#btn-sub").onclick = () => state.sim?.substitute($("#sub-out").value, $("#sub-in").value);
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
  const winner = hs === as ? "平局" : hs > as ? snap.home.name : snap.away.name;
  $("#result-title").textContent = hs === as ? "加时仍平——以模拟终局计" : `${winner} 获胜`;
  $("#result-summary").textContent = `化学反应 / 适配度影响了回合效率。巨星堆砌不是万能药。`;

  $("#box-score").innerHTML = `
    ${boxTable(snap.home)}
    ${boxTable(snap.away)}
  `;

  if (state.tournament) {
    applyTournamentResult(snap);
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

// —— Tournament ——
$("#btn-tour-setup").onclick = () => {
  const n = clamp(Number($("#player-count").value) || 4, 2, 8);
  // pad to power of 2
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
  state.tournament = {
    players,
    round: 1,
    bracket: [],
    phase: "draft", // draft | match
    currentMatch: 0,
    draftIndex: 0,
  };
  renderTournamentSlots();
  $("#btn-tour-next").disabled = false;
  $("#btn-tour-next").textContent = "开始第 1 轮选人";
};

function renderTournamentSlots() {
  const box = $("#tour-slots");
  const t = state.tournament;
  if (!t) return;
  box.innerHTML = t.players
    .map(
      (p) => `<div class="slot"><strong>${p.name}</strong><br/>可选 ${p.picksAllowed} 人<br/>已选 ${p.team.players.length} · ${p.team.coach ? "有教练" : "无教练"}${p.eliminated ? "<br/>已淘汰" : ""}</div>`
    )
    .join("");
}

$("#btn-tour-next").onclick = () => {
  const t = state.tournament;
  if (!t) return;
  if (t.phase === "draft") {
    // For simplicity: auto-draft for all seats with increasing picks, then play bracket
    for (const p of t.players) {
      if (p.eliminated) continue;
      while (p.team.players.length < p.picksAllowed) {
        const pack = drawPack(5, {
          excludeIds: new Set(t.players.flatMap((x) => x.team.players.map((pl) => pl.id))),
        });
        const best = pack
          .filter((c) => c.kind === "player")
          .sort((a, b) => overall(b.data) - overall(a.data))[0];
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
    // build bracket among non-eliminated
    const alive = t.players.filter((p) => !p.eliminated);
    t.bracket = [];
    for (let i = 0; i < alive.length; i += 2) {
      t.bracket.push({ a: alive[i], b: alive[i + 1], done: false });
    }
    t.phase = "match";
    t.currentMatch = 0;
    renderTournamentSlots();
    renderBracket();
    $("#btn-tour-next").textContent = "进入下一场比赛";
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
    // advance round
    const winners = t.bracket.map((m) => m.winner).filter(Boolean);
    if (winners.length === 1) {
      $("#bracket").innerHTML += `<div class="match-chip"><strong>总冠军：${winners[0].name}</strong></div>`;
      $("#btn-tour-next").disabled = true;
      return;
    }
    t.round += 1;
    // each surviving player gains +1 pick
    for (const p of winners) p.picksAllowed += 1;
    for (const p of t.players) {
      if (!winners.includes(p)) p.eliminated = true;
    }
    t.phase = "draft";
    t.bracket = [];
    renderTournamentSlots();
    $("#btn-tour-next").disabled = false;
    $("#btn-tour-next").textContent = `第 ${t.round} 轮：每人多 1 次选人，继续`;
    return;
  }
  const m = t.bracket[t.currentMatch];
  // human controls side A if human
  const youSide = m.a.human ? "home" : m.b.human ? "away" : "home";
  beginGame(m.a.team, m.b.team, youSide);
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
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// Home hint: card pool size
const poolNote = document.querySelector(".hint-panel ul");
if (poolNote) {
  const li = document.createElement("li");
  li.textContent = `当前卡池 ${PLAYERS.length} 张赛季球员卡（1950s 起上古神兽与各时代巅峰/新秀卡），头像取自当季 NBA 形象（缺失则回落头像）。`;
  poolNote.appendChild(li);
}
