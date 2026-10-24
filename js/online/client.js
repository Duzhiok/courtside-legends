/**
 * T6 P0 online client (browser, no sim — the server runs the only sim).
 * Renders slim frames from the server and sends coaching decisions.
 * Static player data (names, positions, ratings) comes from the `joined`
 * message; per-tick frames only carry ids + mutable fields.
 */

import { applyFrameDelta } from "./delta.js";
import { loadRecord, saveRecord, recordGame, formatRecord } from "./record.js";

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
  token: null,
  account: null,
  market: null,
};

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderMarket() {
  const m = state.market;
  if (!m) return;
  $("market-gold").textContent = `联机金币：${m.gold}`;
  $("market-roster").innerHTML = m.roster
    .map((c, i) => {
      const starter = i < 5 ? "（首发）" : "";
      return `<li>${esc(c.name)} ${c.pos} OVR ${c.ovr}${starter} <input data-list-price="${c.id}" placeholder="挂牌价" size="6" /> <button data-list="${c.id}" type="button">挂牌</button> <button data-up="${c.id}" type="button" class="ghost">↑</button> <button data-down="${c.id}" type="button" class="ghost">↓</button></li>`;
    })
    .join("");
  $("market-board").innerHTML = m.listings
    .map((l) => {
      const mine = state.account && l.seller === state.account.name;
      const action = mine
        ? `<button data-cancel="${l.id}" type="button">撤牌</button>`
        : `<button data-buy="${l.id}" type="button">购买</button>`;
      return `<li>${esc(l.card.name)} ${l.card.pos} OVR ${l.card.ovr} · ${l.price} 金 · ${l.seller ? esc(l.seller) : "系统"} ${action}</li>`;
    })
    .join("");
}

function marketAction() {
  const rosterEl = $("market-roster");
  rosterEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    if (btn.dataset.list) {
      const input = rosterEl.querySelector(`[data-list-price="${btn.dataset.list}"]`);
      const price = Number(input?.value);
      if (!Number.isInteger(price)) return setStatus("挂牌价需为整数。", true);
      send({ type: "market_list", cardId: btn.dataset.list, price, token: state.token });
    } else if (btn.dataset.up || btn.dataset.down) {
      const ids = state.market.roster.map((c) => c.id);
      const id = btn.dataset.up || btn.dataset.down;
      const i = ids.indexOf(id);
      const j = btn.dataset.up ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      send({ type: "market_roster_order", cardIds: ids, token: state.token });
    }
  });
  $("market-board").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    if (btn.dataset.buy) send({ type: "market_buy", listingId: Number(btn.dataset.buy), token: state.token });
    else if (btn.dataset.cancel) send({ type: "market_cancel", listingId: Number(btn.dataset.cancel), token: state.token });
  });
}

function renderAccount() {
  const el = $("account-info");
  if (!el) return;
  el.textContent = state.account
    ? `账号 ${state.account.name} · 排位分 ${state.account.rating} · ${state.account.wins} 胜 ${state.account.losses} 负`
    : "";
}

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

  const breakText = { timeout: "暂停", quarter: "节间休息", half: "中场休息", manual: "暂停" }[frame.breakReason] || "";
  $("pause-banner").hidden = !frame.paused;
  $("pause-banner").textContent = frame.paused ? `比赛暂停${breakText ? `（${breakText}）` : ""}——可以调整战术、换人、站位，点「继续比赛」恢复` : "";
  $("btn-resume").hidden = !frame.paused;

  // Own-side controls follow the live frame (spectators have no side).
  const mine = state.side === "home" ? home : state.side === "away" ? away : null;
  if (!mine) return;
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
      setStatus(
        msg.reclaimed
          ? "已认领原座位，正在同步对局…"
          : msg.matched
            ? "已匹配到对手，对局开始！"
            : msg.side === "home"
              ? "房间已建，等对手加入…"
              : "已加入房间，等对局开始…"
      );
      break;
    case "registered":
      setStatus(`账号 ${msg.name} 注册成功，请登录。`);
      break;
    case "logged_in":
      state.token = msg.token;
      state.account = { name: msg.name, rating: msg.rating, wins: msg.wins, losses: msg.losses };
      state.name = msg.name;
      $("player-name").value = msg.name;
      renderAccount();
      $("market-card").hidden = false;
      send({ type: "market_board", token: state.token });
      setStatus(`已登录：${msg.name}（排位分 ${msg.rating}）。联机生涯已开通，去市场补人吧。`);
      break;
    case "market":
      state.market = msg;
      renderMarket();
      break;
    case "economy":
      if (state.market) {
        state.market.gold = msg.gold;
        renderMarket();
      }
      feedLine(`联机生涯奖金到账，现有金币 ${msg.gold}`);
      break;
    case "account":
      if (state.account && state.account.name === msg.name) {
        state.account = { name: msg.name, rating: msg.rating, wins: msg.wins, losses: msg.losses };
        renderAccount();
      }
      break;
    case "queue_status":
      $("lobby").hidden = true;
      $("waiting").hidden = false;
      $("waiting").textContent = `匹配中…当前第 ${msg.position} 位`;
      setStatus("正在匹配对手（按球队 OVR 配对）…");
      break;
    case "joined": {
      state.side = msg.side;
      state.rosterById = new Map();
      for (const team of [msg.home, msg.away]) {
        for (const p of team.roster || []) state.rosterById.set(p.id, p);
      }
      $("waiting").hidden = true;
      $("game").hidden = false;
      if (msg.side === "spectator") {
        $("you-side").textContent = "你是观战者（只能看，不能下指令）";
        $("coach-card").hidden = true;
      } else {
        $("coach-card").hidden = false;
        $("you-side").textContent = `你是${msg.side === "home" ? msg.home.name : msg.away.name}（${msg.side === "home" ? "主队" : "客队"}）`;
      }
      setStatus("对局开始！");
      feedLine("对局开始！");
      break;
    }
    case "frame":
      renderFrame(msg);
      break;
    case "frame_delta": {
      if (!state.lastFrame) break; // full frame first, always
      const next = applyFrameDelta(state.lastFrame, msg);
      if (next) renderFrame(next);
      break;
    }
    case "opponent_disconnected": {
      const sec = Math.round((msg.graceMs || 30000) / 1000);
      feedLine(`对方断线，${sec} 秒内未重新连接将判负`);
      setStatus(`对方断线，${sec} 秒内未重新连接将判负`);
      break;
    }
    case "opponent_back":
      feedLine("对方已重新连接");
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
      $("pause-banner").textContent = `全场比赛结束：${msg.score.home} - ${msg.score.away}，${msg.winner ? `${winner} 获胜` : "平局"}${msg.forfeit ? "（对方断线未回，判负）" : ""}`;
      $("btn-resume").hidden = true;
      feedLine(`全场结束 ${msg.score.home} - ${msg.score.away}`);
      if (state.side === "home" || state.side === "away") {
        const next = recordGame(loadRecord(localStorage), { side: state.side, winner: msg.winner });
        saveRecord(localStorage, next);
        feedLine(`你的联机战绩：${formatRecord(next)}`);
      }
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
    send({ type: "create", name: state.name, teamId: state.teamId, token: state.token });
  });
  $("btn-join").addEventListener("click", () => {
    state.name = $("player-name").value.trim();
    state.teamId = $("team-join").value;
    const code = $("room-code-input").value.trim();
    if (!state.ws || !state.connected) return setStatus("请先点「连接服务器」。", true);
    if (!state.name || !code) return setStatus("请填名字和房号。", true);
    state.code = code;
    send({ type: "join", code, name: state.name, teamId: state.teamId, token: state.token });
  });
  $("btn-register").addEventListener("click", () => {
    const name = $("account-name").value.trim();
    const password = $("account-password").value;
    if (!state.ws || !state.connected) return setStatus("请先点「连接服务器」。", true);
    if (!name || !password) return setStatus("请填账号名和密码。", true);
    send({ type: "register", name, password });
  });
  $("btn-login").addEventListener("click", () => {
    const name = $("account-name").value.trim();
    const password = $("account-password").value;
    if (!state.ws || !state.connected) return setStatus("请先点「连接服务器」。", true);
    if (!name || !password) return setStatus("请填账号名和密码。", true);
    send({ type: "login", name, password });
  });
  $("btn-queue-ranked").addEventListener("click", () => {
    state.name = $("player-name").value.trim();
    state.teamId = $("team-create").value;
    if (!state.ws || !state.connected) return setStatus("请先点「连接服务器」。", true);
    if (!state.name) return setStatus("请先填名字。", true);
    if (!state.token) return setStatus("排位匹配需要先登录账号。", true);
    send({ type: "queue", name: state.name, teamId: state.teamId, mode: "ranked", token: state.token });
  });
  $("btn-market-refresh").addEventListener("click", () => {
    if (!state.token) return setStatus("请先登录账号。", true);
    send({ type: "market_board", token: state.token });
  });
  $("btn-online-queue").addEventListener("click", () => {
    if (!state.token) return setStatus("联机阵容需要先登录账号。", true);
    state.name = state.account ? state.account.name : state.name;
    send({ type: "queue", name: state.name, roster: "online", token: state.token });
  });
  $("btn-online-queue-ranked").addEventListener("click", () => {
    if (!state.token) return setStatus("联机阵容需要先登录账号。", true);
    state.name = state.account ? state.account.name : state.name;
    send({ type: "queue", name: state.name, roster: "online", mode: "ranked", token: state.token });
  });
  $("btn-queue").addEventListener("click", () => {
    state.name = $("player-name").value.trim();
    state.teamId = $("team-create").value;
    if (!state.ws || !state.connected) return setStatus("请先点「连接服务器」。", true);
    if (!state.name) return setStatus("请先填名字。", true);
    send({ type: "queue", name: state.name, teamId: state.teamId, token: state.token });
  });
  $("btn-spectate").addEventListener("click", () => {
    state.name = $("player-name").value.trim();
    const code = $("room-code-input").value.trim();
    if (!state.ws || !state.connected) return setStatus("请先点「连接服务器」。", true);
    if (!state.name || !code) return setStatus("请填名字和房号。", true);
    state.code = code;
    send({ type: "spectate", code, name: state.name, token: state.token });
  });
  $("btn-reconnect").addEventListener("click", () => {
    if (!state.code || !state.name) return;
    $("btn-reconnect").hidden = true;
    connect(() => {
      send({ type: "join", code: state.code, name: state.name, teamId: state.teamId, token: state.token });
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

$("record-line").textContent = `联机战绩：${formatRecord(loadRecord(localStorage))}`;

marketAction();
bind();
