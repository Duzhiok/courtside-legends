/**
 * T6 P0 online client (browser, no sim — the server runs the only sim).
 * Renders slim frames from the server and sends coaching decisions.
 * Static player data (names, positions, ratings) comes from the `joined`
 * message; per-tick frames only carry ids + mutable fields.
 */

const $ = (id) => document.getElementById(id);

const state = {
  ws: null,
  url: "ws://localhost:3001",
  name: "",
  code: "",
  side: null,
  teamId: "",
  rosterById: new Map(),
  tactics: [],
  lastFrame: null,
  connected: false,
};

function feedLine(text, cls = "") {
  const feed = $("feed");
  if (!feed) return;
  const li = document.createElement("li");
  if (cls) li.className = cls;
  li.textContent = text;
  feed.prepend(li);
  while (feed.children.length > 100) feed.lastChild.remove();
}

function setStatus(text, isError = false) {
  const el = $("status");
  if (!el) return;
  el.textContent = text;
  el.className = isError ? "error" : "";
}

function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function quarterLabel(q) {
  return q > 4 ? `加时${q - 4}` : `第${q}节`;
}

function playerRow(framePlayer) {
  const p = state.rosterById.get(framePlayer.id) || {};
  const name = p.cardName || p.name || framePlayer.id;
  const st = framePlayer.stats || {};
  const hot = framePlayer.hot > 0 ? ` 手感+${framePlayer.hot}` : framePlayer.hot < 0 ? ` 手感${framePlayer.hot}` : "";
  const inj = framePlayer.injuredGames > 0 ? ` ${framePlayer.injuryStatus || "伤停"}` : "";
  return `${name} ${framePlayer.playPos} · ${st.pts}分 ${st.reb}板 ${st.ast}助 · 体力${framePlayer.fatigue}${hot}${inj}`;
}

function renderFrame(frame) {
  state.lastFrame = frame;
  const home = frame.home;
  const away = frame.away;
  $("score-home").textContent = `${home.name} ${frame.score.home}`;
  $("score-away").textContent = `${frame.score.away} ${away.name}`;
  $("clock").textContent = `${quarterLabel(frame.quarter)} ${fmtClock(frame.clock)}`;
  $("possession").textContent = frame.possession === "home" ? `◀ ${home.name} 球权` : `${away.name} 球权 ▶`;
  $("timeouts").textContent = `暂停 ${home.name} ${frame.timeouts.home} · ${away.name} ${frame.timeouts.away}`;
  $("chem").textContent = `${home.name} 化学反应 ${home.chem} · 士气 ${home.morale} · 适配 ${home.fit} ｜ ${away.name} 化学反应 ${away.chem} · 士气 ${away.morale} · 适配 ${away.fit}`;

  $("lineup-home").innerHTML = home.onCourt.map((p) => `<li>${playerRow(p)}</li>`).join("");
  $("lineup-away").innerHTML = away.onCourt.map((p) => `<li>${playerRow(p)}</li>`).join("");
  $("bench-home").innerHTML = home.bench.map((p) => `<li>${playerRow(p)}</li>`).join("");
  $("bench-away").innerHTML = away.bench.map((p) => `<li>${playerRow(p)}</li>`).join("");

  // Own-side controls follow the live frame.
  const mine = state.side === "home" ? home : away;
  const outSel = $("sub-out");
  const inSel = $("sub-in");
  const prevOut = outSel.value;
  const prevIn = inSel.value;
  outSel.innerHTML = mine.onCourt.map((p) => `<option value="${p.id}">${playerRow(p)}</option>`).join("");
  inSel.innerHTML = mine.bench.map((p) => `<option value="${p.id}">${playerRow(p)}</option>`).join("");
  if (mine.onCourt.some((p) => p.id === prevOut)) outSel.value = prevOut;
  if (mine.bench.some((p) => p.id === prevIn)) inSel.value = prevIn;

  const focusSel = $("focus-select");
  const prevFocus = focusSel.value;
  focusSel.innerHTML =
    `<option value="">不指定</option>` +
    mine.onCourt.map((p) => {
      const base = state.rosterById.get(p.id) || {};
      return `<option value="${p.id}">${base.cardName || base.name || p.id}</option>`;
    }).join("");
  focusSel.value = mine.focusId || prevFocus || "";

  const tacticSel = $("tactic-select");
  if (mine.tactic) tacticSel.value = mine.tactic.id;

  const posPlayerSel = $("pos-player");
  const prevPosPlayer = posPlayerSel.value;
  const ownRoster = [...mine.onCourt, ...mine.bench];
  posPlayerSel.innerHTML = ownRoster.map((p) => {
    const base = state.rosterById.get(p.id) || {};
    return `<option value="${p.id}">${base.cardName || base.name || p.id}（${p.playPos}）</option>`;
  }).join("");
  if (ownRoster.some((p) => p.id === prevPosPlayer)) {
    posPlayerSel.value = prevPosPlayer;
  } else if (ownRoster.length) {
    posPlayerSel.value = ownRoster[0].id;
  }
  const currentPosPlayer = ownRoster.find((p) => p.id === posPlayerSel.value);
  if (currentPosPlayer) $("pos-select").value = currentPosPlayer.playPos;

  const breakText = { timeout: "暂停", quarter: "节间休息", half: "中场休息", manual: "暂停" }[frame.breakReason] || "";
  $("pause-banner").hidden = !frame.paused;
  $("pause-banner").textContent = frame.paused ? `比赛暂停${breakText ? `（${breakText}）` : ""}——可以调整战术、换人、站位，点「继续比赛」恢复` : "";
  $("btn-resume").hidden = !frame.paused;
}

function send(obj) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(obj));
  }
}

function sendDecision(decision) {
  send({ type: "decision", decision });
}

function connect(onOpen) {
  if (state.ws) state.ws.close();
  state.ws = new WebSocket(state.url);
  state.ws.addEventListener("open", () => {
    state.connected = true;
    setStatus("已连接服务器，等待球队列表…");
    if (onOpen) onOpen();
  });
  state.ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleMessage(msg);
  });
  state.ws.addEventListener("close", () => {
    state.connected = false;
    if (state.code) {
      setStatus("连接断开，点「重新连接」回到对局（同名可认领原座位）。", true);
      $("btn-reconnect").hidden = false;
    } else {
      setStatus("连接已断开。", true);
    }
  });
}

function fillTeamSelects(presets) {
  for (const sel of [$("team-create"), $("team-join")]) {
    sel.innerHTML = presets.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case "welcome":
      state.tactics = msg.tactics || [];
      fillTeamSelects(msg.presets || []);
      $("tactic-select").innerHTML = state.tactics
        .map((t) => `<option value="${t.id}">${t.name}</option>`)
        .join("");
      setStatus("已连接。填名字、选球队，建房或输入房号加入。");
      break;
    case "room":
      state.code = msg.code;
      state.side = msg.side;
      $("room-code").textContent = `房号：${msg.code}（把房号发给对手）`;
      $("lobby").hidden = true;
      $("waiting").hidden = false;
      setStatus(msg.reclaimed ? "已认领原座位，正在同步对局…" : msg.side === "home" ? "房间已建，等对手加入…" : "已加入房间，等对局开始…");
      break;
    case "joined": {
      state.side = msg.side;
      state.rosterById = new Map();
      for (const team of [msg.home, msg.away]) {
        for (const p of team.roster || []) state.rosterById.set(p.id, p);
      }
      $("waiting").hidden = true;
      $("game").hidden = false;
      $("you-side").textContent = `你是${msg.side === "home" ? msg.home.name : msg.away.name}（${msg.side === "home" ? "主队" : "客队"}）`;
      setStatus("对局开始！");
      feedLine("对局开始！");
      break;
    }
    case "frame":
      renderFrame(msg);
      break;
    case "event":
      feedLine(msg.text || "");
      break;
    case "decision_applied":
      feedLine(msg.text || "");
      break;
    case "decision_rejected":
      setStatus(msg.reason || "指令被拒绝", true);
      break;
    case "game_over": {
      const winner = msg.winner === "home" ? state.lastFrame?.home.name : msg.winner === "away" ? state.lastFrame?.away.name : "平局";
      $("pause-banner").hidden = false;
      $("pause-banner").textContent = `全场比赛结束：${msg.score.home} - ${msg.score.away}，${msg.winner ? `${winner} 获胜` : "平局"}`;
      $("btn-resume").hidden = true;
      feedLine(`全场结束 ${msg.score.home} - ${msg.score.away}`);
      break;
    }
    case "room_closed":
      $("lobby").hidden = false;
      $("waiting").hidden = true;
      $("game").hidden = true;
      state.code = "";
      setStatus(msg.reason || "房间已关闭", true);
      break;
    default:
      break;
  }
}

function bind() {
  $("btn-connect").addEventListener("click", () => {
    state.url = $("server-url").value.trim() || "ws://localhost:3001";
    state.name = $("player-name").value.trim();
    if (!state.name) return setStatus("请先填名字。", true);
    connect();
  });
  $("btn-create").addEventListener("click", () => {
    state.name = $("player-name").value.trim();
    state.teamId = $("team-create").value;
    if (!state.ws || !state.connected) return setStatus("请先点「连接服务器」。", true);
    if (!state.name) return setStatus("请先填名字。", true);
    send({ type: "create", name: state.name, teamId: state.teamId });
  });
  $("btn-join").addEventListener("click", () => {
    state.name = $("player-name").value.trim();
    state.teamId = $("team-join").value;
    const code = $("room-code-input").value.trim();
    if (!state.ws || !state.connected) return setStatus("请先点「连接服务器」。", true);
    if (!state.name || !code) return setStatus("请填名字和房号。", true);
    state.code = code;
    send({ type: "join", code, name: state.name, teamId: state.teamId });
  });
  $("btn-reconnect").addEventListener("click", () => {
    if (!state.code || !state.name) return;
    $("btn-reconnect").hidden = true;
    connect(() => {
      send({ type: "join", code: state.code, name: state.name, teamId: state.teamId });
    });
  });
  $("btn-sub").addEventListener("click", () => {
    sendDecision({ kind: "sub", outId: $("sub-out").value, inId: $("sub-in").value });
  });
  $("tactic-select").addEventListener("change", (ev) => {
    sendDecision({ kind: "tactic", tacticId: ev.target.value });
  });
  $("focus-select").addEventListener("change", (ev) => {
    sendDecision({ kind: "focus", playerId: ev.target.value || null });
  });
  $("btn-pos").addEventListener("click", () => {
    sendDecision({ kind: "playpos", playerId: $("pos-player").value, pos: $("pos-select").value });
  });
  $("btn-timeout").addEventListener("click", () => sendDecision({ kind: "timeout" }));
  $("btn-resume").addEventListener("click", () => sendDecision({ kind: "resume" }));
}

bind();
