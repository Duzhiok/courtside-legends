/**
 * T6 online server: room-code 1v1 + matchmaking queue, server-authoritative.
 *
 * Run:  node server/online-server.mjs [--port 3001]
 * The static site (python3 scripts/serve_nocache.py, :5173) serves
 * online.html; this process only speaks WebSocket.
 *
 * Protocol (see docs/ONLINE_DESIGN.md, P0–P2):
 *   server -> client: welcome, room, joined, frame, frame_delta, event,
 *                     decision_applied, decision_rejected, game_over,
 *                     opponent_disconnected, opponent_back, queue_status
 *   client -> server: create, join, spectate, queue, decision
 *
 * History in brief:
 * - P0: slim frames (< 8KB, not 70KB snapshots), decisions apply
 *   immediately, 20s auto-resume only while both seats are connected,
 *   injuries off, defensive schemes/autopilot out of the decision set.
 * - P1: spectators (frames only), 30s disconnect grace ending in a
 *   forfeit win, per-tick frame deltas (js/online/delta.js, shared
 *   with the browser client).
 * - P2: matchmaking queue by team OVR (band ±2; a stale entry past
 *   60s matches anyone) plus server-side room management, so a queue
 *   match can set up both connections at once. Local win/loss records
 *   live in the browser (js/online/record.js).
 * - P3: server accounts (scrypt-hashed, file-persisted outside the
 *   served repo tree) + Elo ratings (K = 32, start 1000) + a ranked
 *   queue matched by rating band (±100). Guests still play casually
 *   without an account; career online economy is still out of scope.
 */

import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { clientIp, createRegistrationGate } from "./online-ratelimit.mjs";
import { createTransport, listeningInfo, loadTlsCredentials, parseServerConfig } from "./online-transport.mjs";
import { GameSim } from "../js/engine/sim.js";
import { seasonToCard, overall } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { TACTICS } from "../js/data/coaches.js";
import { buildOnlineFrame } from "./online-frame.mjs";
import { diffFrame } from "../js/online/delta.js";
import { validateDecision, describeDecision } from "./online-decisions.mjs";
import { createAccountStore } from "./online-accounts.mjs";
import { createEconomyStore, MIN_DUEL_ROSTER } from "./online-economy.mjs";

export const ONLINE_SPEED = 2; // 300ms per possession, ~60s per game
export const AUTO_RESUME_MS = 20000;
export const GRACE_MS = 30000; // disconnect grace before a forfeit win
export const MATCH_BAND = 2; // team-OVR band for instant queue matches
export const QUEUE_STALE_MS = 60000; // past this, a queued player matches anyone
export const QUEUE_SWEEP_MS = 10000; // periodic re-check for stale pairs
export const RATING_BAND = 100; // rating band for instant ranked matches
export const MAX_MESSAGE_BYTES = 64 * 1024; // hard cap per client message (ws default is 100 MiB)

function loadPresets() {
  const rows = JSON.parse(
    readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")
  ).players;
  buildCareerSpanIndex(rows);
  const cards = rows.filter((r) => r.season === 2020).map(seasonToCard);
  const byTeam = new Map();
  for (const card of cards) {
    if (!byTeam.has(card.team)) byTeam.set(card.team, []);
    byTeam.get(card.team).push(card);
  }
  const presets = [];
  for (const [code, teamCards] of byTeam) {
    if (teamCards.length < 12) continue;
    const players = teamCards.slice(0, 12);
    presets.push({
      id: code,
      name: players[0].teamLabel || code,
      players,
      starterIds: players.slice(0, 5).map((p) => p.id),
      ovr: Math.round(players.reduce((a, c) => a + overall(c), 0) / players.length),
    });
  }
  return presets;
}

function loadCardPool() {
  const rows = JSON.parse(
    readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")
  ).players;
  buildCareerSpanIndex(rows);
  const cards = rows.filter((r) => r.season === 2020).map(seasonToCard);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const cardOvr = new Map();
  for (const c of cards) cardOvr.set(c.id, overall(c));
  return { cardById, cardIds: cards.map((c) => c.id), cardOvr };
}

function roomCode(rng = Math.random) {
  return String(Math.floor(100000 + rng() * 900000));
}

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

/** Tell the winner what was paid. `limited` says why a smaller prize (or none) was paid, so a cap is never silent. */
function sendPrize(seat, prizes) {
  if (seat?.ws) {
    send(seat.ws, { type: "economy", gold: prizes.winnerGold, prize: prizes.winnerPrize, limited: prizes.limited });
  }
}

export function createOnlineServer({
  port = 3001,
  autoResumeMs = AUTO_RESUME_MS,
  graceMs = GRACE_MS,
  matchBand = MATCH_BAND,
  queueStaleMs = QUEUE_STALE_MS,
  queueSweepMs = QUEUE_SWEEP_MS,
  ratingBand = RATING_BAND,
  accountsFile,
  economyFile,
  // Registration limits ({ perIp, global, windowMs }; see online-ratelimit.mjs) and whether a reverse proxy
  // you control sets X-Forwarded-For (otherwise that header is ignored: any client can forge it).
  registerLimits = {},
  trustProxy = false,
  // Where to listen, and { certFile, keyFile } to serve wss:// (omit for plain ws://; see online-transport.mjs).
  host,
  tls,
} = {}) {
  // First: a wrong certificate path should fail at once, not after loading the whole card pool.
  const credentials = loadTlsCredentials(tls);
  const presets = loadPresets();
  const registrationGate = createRegistrationGate(registerLimits);
  const accounts = createAccountStore(accountsFile ? { file: accountsFile } : {});
  const { cardById, cardIds, cardOvr } = loadCardPool();
  const economy = createEconomyStore(
    economyFile ? { file: economyFile, cardIds, cardOvr } : { cardIds, cardOvr }
  );

  const rosterCardsFor = (account) => {
    if (!account) return null;
    const ids = economy.getPlayer(account).roster;
    if (ids.length < MIN_DUEL_ROSTER) return null;
    const cards = ids.map((id) => cardById.get(id)).filter(Boolean);
    return cards.length >= MIN_DUEL_ROSTER ? cards : null;
  };

  const slimCard = (card) => ({ id: card.id, name: card.name, pos: card.pos, ovr: overall(card) });
  const marketView = (account) => {
    const player = economy.getPlayer(account);
    return {
      type: "market",
      gold: player.gold,
      roster: player.roster.map((id) => cardById.get(id)).filter(Boolean).map(slimCard),
      listings: economy
        .getBoard()
        .map((l) => ({ id: l.id, seller: l.seller, card: cardById.get(l.cardId), price: l.price }))
        .filter((l) => l.card)
        .map((l) => ({ ...l, card: slimCard(l.card) })),
    };
  };
  const presetById = new Map(presets.map((p) => [p.id, p]));
  const tactics = Object.values(TACTICS).map((t) => ({ id: t.id, name: t.name }));
  const rooms = new Map();
  const queue = [];

  // Record a finished game for authed seats: Elo + win/loss, then tell
  // each connected player their new numbers. Draws and guest seats
  // change nothing.
  const recordGameResult = (room, winnerSide) => {
    if (!winnerSide) return;
    const loserSide = winnerSide === "home" ? "away" : "home";
    const winnerAcct = room.seats[winnerSide]?.account;
    const loserAcct = room.seats[loserSide]?.account;
    if (!winnerAcct || !loserAcct) return;
    const result = accounts.recordMatch(winnerAcct, loserAcct);
    if (!result) return;
    for (const [side, view] of [
      [winnerSide, result.winner],
      [loserSide, result.loser],
    ]) {
      const seat = room.seats[side];
      if (seat?.ws) send(seat.ws, { type: "account", ...view });
    }
  };

  const newRoom = () => {
    let code = roomCode();
    while (rooms.has(code)) code = roomCode();
    const room = {
      code,
      seats: { home: null, away: null },
      spectators: new Set(),
      started: false,
      over: false,
      sim: null,
      tick: 0,
      lastFrame: null,
      resumeTimer: null,
      graceTimer: null,
    };
    rooms.set(code, room);
    return room;
  };

  const broadcast = (room, obj) => {
    for (const s of [room.seats.home, room.seats.away]) {
      if (s?.ws) send(s.ws, obj);
    }
    for (const spec of room.spectators) {
      if (spec.ws) send(spec.ws, obj);
    }
  };

  const manageAutoResume = (room) => {
    if (room.resumeTimer) {
      clearTimeout(room.resumeTimer);
      room.resumeTimer = null;
    }
    if (!room.sim || room.over) return;
    if (!room.sim.paused) return;
    if (!room.seats.home?.ws || !room.seats.away?.ws) return;
    room.resumeTimer = setTimeout(() => {
      room.resumeTimer = null;
      if (!room.sim || room.over || !room.sim.paused) return;
      room.sim.setPaused(false);
      broadcast(room, { type: "event", kind: "coach", text: "暂停时间到，比赛继续" });
      broadcastFrame(room);
    }, autoResumeMs);
  };

  const broadcastFrame = (room) => {
    if (!room.sim) return;
    room.tick += 1;
    const next = buildOnlineFrame(room.sim, room.tick);
    // One delta for everyone: all viewers share the same frame stream,
    // so the diff against the last broadcast frame is valid for all.
    const delta = room.lastFrame ? diffFrame(room.lastFrame, next) : null;
    room.lastFrame = next;
    const deliver = (target, needsFull) => {
      if (!target?.ws) return;
      send(target.ws, needsFull || !delta ? next : delta);
      target.needsFull = false;
    };
    for (const s of [room.seats.home, room.seats.away]) deliver(s, s?.needsFull);
    for (const spec of room.spectators) deliver(spec, spec.needsFull);
    manageAutoResume(room);
  };

  const startGame = (room) => {
    const teamFor = (seat) => {
      if (seat.rosterCards) {
        return { name: seat.name, players: seat.rosterCards, starterIds: seat.rosterCards.slice(0, 5).map((p) => p.id) };
      }
      const preset = presetById.get(seat.teamId);
      return { name: preset.name, players: preset.players, starterIds: preset.starterIds };
    };
    room.online = !!(room.seats.home.rosterCards && room.seats.away.rosterCards);
    room.tick = 0;
    room.sim = new GameSim({
      home: teamFor(room.seats.home),
      away: teamFor(room.seats.away),
      youSide: "home",
      injuries: false,
      speed: ONLINE_SPEED,
      lang: "zh",
      onEvent: (payload) => {
        // Strip the snapshot the sim attaches to every event payload.
        broadcast(room, { type: "event", kind: payload.type, text: payload.text });
      },
      onTick: () => broadcastFrame(room),
      onEnd: () => {
        room.over = true;
        if (room.resumeTimer) clearTimeout(room.resumeTimer);
        if (room.graceTimer) clearTimeout(room.graceTimer);
        room.sim.stop();
        const snap = room.sim.snapshot();
        const winner =
          snap.score.home > snap.score.away
            ? "home"
            : snap.score.away > snap.score.home
              ? "away"
              : null;
        broadcast(room, {
          type: "game_over",
          frame: room.lastFrame,
          score: { ...snap.score },
          winner,
        });
        recordGameResult(room, winner);
        if (room.online && winner) {
          const loserSide = winner === "home" ? "away" : "home";
          const prizes = economy.recordDuel(
            room.seats[winner].account,
            room.seats[loserSide].account
          );
          if (prizes) sendPrize(room.seats[winner], prizes);
        }
      },
    });
    room.started = true;
    const snap = room.sim.snapshot();
    const joined = (side) => ({
      type: "joined",
      code: room.code,
      side,
      home: snap.home,
      away: snap.away,
      tactics,
    });
    for (const s of ["home", "away"]) send(room.seats[s].ws, joined(s));
    for (const spec of room.spectators) send(spec.ws, joined("spectator"));
    room.sim.start();
  };

  const leaveQueue = (ws) => {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].ws === ws) queue.splice(i, 1);
    }
  };

  const broadcastQueuePositions = () => {
    queue.forEach((entry, i) => send(entry.ws, { type: "queue_status", position: i + 1 }));
  };

  const isStale = (entry) => Date.now() - entry.enqueuedAt > queueStaleMs;

  const matchable = (a, b) => {
    if (a.mode !== b.mode) return false; // ranked and casual never mix
    if (a.rosterKind !== b.rosterKind) return false; // preset teams never meet custom rosters
    if (isStale(a) || isStale(b)) return true;
    if (a.mode === "ranked") return Math.abs(a.rating - b.rating) <= ratingBand;
    if (a.rosterKind === "online") return true; // custom rosters: no OVR band yet
    return Math.abs(a.ovr - b.ovr) <= matchBand;
  };

  const startMatchedGame = (a, b) => {
    leaveQueue(a.ws);
    leaveQueue(b.ws);
    const room = newRoom();
    room.seats.home = { name: a.name, teamId: a.teamId, ws: a.ws, needsFull: true, account: a.account || null, rosterCards: a.rosterKind === "online" ? rosterCardsFor(a.account) : null };
    room.seats.away = { name: b.name, teamId: b.teamId, ws: b.ws, needsFull: true, account: b.account || null, rosterCards: b.rosterKind === "online" ? rosterCardsFor(b.account) : null };
    a.ctx.room = room;
    a.ctx.side = "home";
    b.ctx.room = room;
    b.ctx.side = "away";
    send(a.ws, { type: "room", code: room.code, side: "home", matched: true });
    send(b.ws, { type: "room", code: room.code, side: "away", matched: true });
    startGame(room);
    broadcastQueuePositions();
  };

  // Try to match one entry now (called on enqueue and on each sweep).
  const tryMatch = (entry) => {
    if (!queue.includes(entry)) return false;
    const ready = (e) => e.rosterKind !== "online" || rosterCardsFor(e.account);
    if (!ready(entry)) return false;
    let best = null;
    for (const other of queue) {
      if (other === entry || !ready(other) || !matchable(entry, other)) continue;
      if (!best || Math.abs(other.ovr - entry.ovr) < Math.abs(best.ovr - entry.ovr)) best = other;
    }
    if (!best) return false;
    startMatchedGame(best, entry); // earliest in queue hosts
    return true;
  };

  const sweepQueue = () => {
    for (const entry of [...queue]) tryMatch(entry);
  };

  const sweepTimer = setInterval(sweepQueue, queueSweepMs);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();

  const armGraceTimer = (room, side) => {
    if (room.graceTimer) {
      clearTimeout(room.graceTimer);
      room.graceTimer = null;
    }
    const otherSide = side === "home" ? "away" : "home";
    if (!room.seats[otherSide]?.ws) return; // nobody left to win by forfeit
    room.graceTimer = setTimeout(() => {
      room.graceTimer = null;
      const gone = room.seats[side];
      if (room.over || !gone || gone.ws) return;
      room.over = true;
      if (room.resumeTimer) clearTimeout(room.resumeTimer);
      room.sim.stop();
      const snap = room.sim.snapshot();
      broadcast(room, {
        type: "game_over",
        frame: room.lastFrame,
        score: { ...snap.score },
        winner: otherSide,
        forfeit: true,
        forfeitSide: side,
      });
      recordGameResult(room, otherSide);
      if (room.online) {
        const prizes = economy.recordDuel(
          room.seats[otherSide].account,
          room.seats[side].account
        );
        if (prizes) sendPrize(room.seats[otherSide], prizes);
      }
    }, graceMs);
  };

  const handleDisconnect = (room, side, seat) => {
    if (!room.started) {
      // Lobby disconnect frees the seat; an empty home seat closes the room.
      room.seats[side] = null;
      if (!room.seats.home && !room.seats.away) {
        rooms.delete(room.code);
      } else if (!room.seats.home && room.seats.away?.ws) {
        send(room.seats.away.ws, { type: "room_closed", reason: "房主离开，房间已关闭" });
        rooms.delete(room.code);
      }
      return;
    }
    if (room.over || !room.sim) return;
    const otherSide = side === "home" ? "away" : "home";
    if (room.seats[otherSide]?.ws) {
      broadcast(room, { type: "opponent_disconnected", side, graceMs });
    }
    if (!room.sim.paused) {
      room.sim.setPaused(true, "timeout");
      broadcast(room, { type: "event", kind: "coach", text: `${seat?.name || "对方"}断线了，比赛暂停` });
      broadcastFrame(room);
    }
    armGraceTimer(room, side);
  };

  // A valid token names the account; an invalid/missing token just
  // means guest play (the login message itself reports bad passwords).
  const resolveAccount = (msg) => {
    if (!msg || typeof msg.token !== "string") return null;
    const name = accounts.getSession(msg.token);
    return name && accounts.get(name) ? name : null;
  };

  // ws defaults to a 100 MiB cap; every real message here is a few hundred bytes.
  const transport = createTransport({ port, host, credentials, maxPayload: MAX_MESSAGE_BYTES });
  const { wss } = transport;
  wss.on("connection", (ws, req) => {
    const ip = clientIp(req, { trustProxy });
    send(ws, {
      type: "welcome",
      presets: presets.map((p) => ({ id: p.id, name: p.name })),
      tactics,
    });
    // Per-connection context; queue matches and room setup mutate it via
    // the shared reference, so handlers always read the current room.
    const ctx = { room: null, side: null, spectator: null };

    const onMessage = (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return send(ws, { type: "decision_rejected", reason: "消息不是 JSON" });
      }
      if (!msg || typeof msg !== "object") {
        return send(ws, { type: "decision_rejected", reason: "消息格式不对" });
      }

      if (msg.type === "create") {
        const name = String(msg.name || "").trim();
        if (!name) return send(ws, { type: "decision_rejected", reason: "请填写名字" });
        const account = resolveAccount(msg);
        if (msg.roster === "online") {
          if (!account) return send(ws, { type: "decision_rejected", reason: "联机阵容需要先登录账号" });
          const cards = rosterCardsFor(account);
          if (!cards) return send(ws, { type: "decision_rejected", reason: "联机阵容不足 5 人，先去市场补人" });
          leaveQueue(ws);
          const room = newRoom();
          room.seats.home = { name: account, teamId: null, ws, needsFull: true, account, rosterCards: cards };
          ctx.room = room;
          ctx.side = "home";
          return send(ws, { type: "room", code: room.code, side: "home" });
        }
        if (!presetById.has(msg.teamId)) {
          return send(ws, { type: "decision_rejected", reason: "球队不存在" });
        }
        leaveQueue(ws);
        const room = newRoom();
        room.seats.home = { name: account || name, teamId: msg.teamId, ws, needsFull: true, account: account || null };
        ctx.room = room;
        ctx.side = "home";
        return send(ws, { type: "room", code: room.code, side: "home" });
      }

      if (msg.type === "join") {
        const target = rooms.get(String(msg.code || ""));
        if (!target) return send(ws, { type: "decision_rejected", reason: "房号不存在" });
        const name = String(msg.name || "").trim();
        if (!name) return send(ws, { type: "decision_rejected", reason: "请填写名字" });
        // Seat reclaim: same name on a dead socket takes its seat back.
        for (const s of ["home", "away"]) {
          const seat = target.seats[s];
          if (seat && seat.name === name && !seat.ws) {
            seat.ws = ws;
            ctx.room = target;
            ctx.side = s;
            if (target.graceTimer) {
              clearTimeout(target.graceTimer);
              target.graceTimer = null;
            }
            send(ws, { type: "room", code: target.code, side: s, reclaimed: true });
            if (target.started && !target.over) {
              const snap = target.sim.snapshot();
              send(ws, {
                type: "joined",
                code: target.code,
                side: s,
                home: snap.home,
                away: snap.away,
                tactics,
              });
              if (target.lastFrame) send(ws, target.lastFrame);
              seat.needsFull = false;
              broadcast(target, { type: "event", kind: "coach", text: `${name}重新连接` });
              broadcast(target, { type: "opponent_back", side: s });
              manageAutoResume(target);
            }
            return;
          }
        }
        if (target.started) {
          return send(ws, { type: "decision_rejected", reason: "对局已开始" });
        }
        if (target.seats.away) {
          return send(ws, { type: "decision_rejected", reason: "房间已满" });
        }
        if (msg.roster === "online") {
          const account = resolveAccount(msg);
          if (!account) return send(ws, { type: "decision_rejected", reason: "联机阵容需要先登录账号" });
          const cards = rosterCardsFor(account);
          if (!cards) return send(ws, { type: "decision_rejected", reason: "联机阵容不足 5 人，先去市场补人" });
          leaveQueue(ws);
          target.seats.away = { name: account, teamId: null, ws, needsFull: true, account, rosterCards: cards };
          ctx.room = target;
          ctx.side = "away";
          send(ws, { type: "room", code: target.code, side: "away" });
          startGame(target);
          return;
        }
        if (!presetById.has(msg.teamId)) {
          return send(ws, { type: "decision_rejected", reason: "球队不存在" });
        }
        if (target.seats.home?.teamId === msg.teamId) {
          return send(ws, { type: "decision_rejected", reason: "对方已选这支球队，换一支" });
        }
        leaveQueue(ws);
        const account = resolveAccount(msg);
        target.seats.away = { name: account || name, teamId: msg.teamId, ws, needsFull: true, account: account || null };
        ctx.room = target;
        ctx.side = "away";
        send(ws, { type: "room", code: target.code, side: "away" });
        startGame(target);
        return;
      }

      if (msg.type === "spectate") {
        const target = rooms.get(String(msg.code || ""));
        if (!target) return send(ws, { type: "decision_rejected", reason: "房号不存在" });
        if (target.over) return send(ws, { type: "decision_rejected", reason: "对局已结束" });
        leaveQueue(ws);
        const spec = { ws, name: String(msg.name || "").trim(), needsFull: true };
        target.spectators.add(spec);
        ctx.spectator = spec;
        ctx.room = target;
        ctx.side = "spectator";
        send(ws, { type: "room", code: target.code, side: "spectator" });
        if (target.started) {
          const snap = target.sim.snapshot();
          send(ws, {
            type: "joined",
            code: target.code,
            side: "spectator",
            home: snap.home,
            away: snap.away,
            tactics,
          });
          if (target.lastFrame) send(ws, target.lastFrame);
          spec.needsFull = false;
        }
        return;
      }

      if (msg.type === "queue") {
        const name = String(msg.name || "").trim();
        if (!name) return send(ws, { type: "decision_rejected", reason: "请填写名字" });
        const account = resolveAccount(msg);
        if (msg.mode === "ranked" && !account) {
          return send(ws, { type: "decision_rejected", reason: "排位匹配需要先登录账号" });
        }
        const online = msg.roster === "online";
        if (online && !account) {
          return send(ws, { type: "decision_rejected", reason: "联机阵容需要先登录账号" });
        }
        if (online && !rosterCardsFor(account)) {
          return send(ws, { type: "decision_rejected", reason: "联机阵容不足 5 人，先去市场补人" });
        }
        const preset = online ? null : presetById.get(msg.teamId);
        if (!online && !preset) return send(ws, { type: "decision_rejected", reason: "球队不存在" });
        leaveQueue(ws);
        const entry = {
          ws,
          ctx,
          name: account || name,
          teamId: online ? null : msg.teamId,
          ovr: preset ? preset.ovr : null,
          mode: msg.mode === "ranked" ? "ranked" : "casual",
          rosterKind: online ? "online" : "preset",
          rating: account ? accounts.get(account).rating : null,
          account: account || null,
          enqueuedAt: Date.now(),
        };
        queue.push(entry);
        send(ws, { type: "queue_status", position: queue.length });
        tryMatch(entry);
        return;
      }

      // Career-online market (requires login; guests get a rejection).
      if (msg.type === "market_board" || msg.type === "market_list" || msg.type === "market_buy" || msg.type === "market_cancel" || msg.type === "market_roster_order") {
        const account = resolveAccount(msg);
        if (!account) return send(ws, { type: "decision_rejected", reason: "联机市场需要先登录账号" });
        let result = { ok: true };
        if (msg.type === "market_list") result = economy.listCard(account, msg.cardId, msg.price);
        else if (msg.type === "market_buy") result = economy.buyListing(account, msg.listingId);
        else if (msg.type === "market_cancel") result = economy.cancelListing(account, msg.listingId);
        else if (msg.type === "market_roster_order") result = economy.reorderRoster(account, msg.cardIds || []);
        if (!result.ok) return send(ws, { type: "decision_rejected", reason: result.reason });
        return send(ws, marketView(account));
      }

      if (msg.type === "register") {
        // Ask before the (blocking) password hash, charge only once an account really exists.
        const gate = registrationGate.check(ip);
        if (!gate.ok) {
          const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60000));
          const what = gate.scope === "ip" ? "注册太频繁" : "注册暂时太多";
          return send(ws, { type: "decision_rejected", reason: `${what}，请 ${minutes} 分钟后再试` });
        }
        const r = accounts.register(msg.name, msg.password);
        if (!r.ok) return send(ws, { type: "decision_rejected", reason: r.reason });
        registrationGate.record(ip);
        return send(ws, { type: "registered", name: r.name });
      }

      if (msg.type === "login") {
        const name = String(msg.name || "").trim();
        if (accounts.isLocked(name)) {
          return send(ws, { type: "decision_rejected", reason: "尝试过多，请 1 分钟后再试" });
        }
        if (!accounts.verify(name, msg.password)) {
          return send(ws, { type: "decision_rejected", reason: "名字或密码不对" });
        }
        const token = accounts.createSession(name);
        return send(ws, { type: "logged_in", name, token, ...accounts.get(name) });
      }

      if (msg.type === "decision") {
        const room = ctx.room;
        if (!room?.started || room.over) {
          return send(ws, { type: "decision_rejected", reason: "比赛还没开始" });
        }
        if (ctx.side === "spectator") {
          return send(ws, { type: "decision_rejected", reason: "观战不能下指令" });
        }
        const seat = room.seats[ctx.side];
        if (!seat || seat.ws !== ws) {
          return send(ws, { type: "decision_rejected", reason: "你不在这个对局里" });
        }
        const d = msg.decision || {};
        const v = validateDecision(room.sim, ctx.side, d);
        if (!v.ok) return send(ws, { type: "decision_rejected", reason: v.reason });
        const text = describeDecision(room.sim, ctx.side, d);
        const applied = v.apply();
        if (applied === false) {
          return send(ws, { type: "decision_rejected", reason: "指令执行失败" });
        }
        broadcast(room, { type: "decision_applied", side: ctx.side, kind: d.kind, text });
        broadcastFrame(room);
        return;
      }
    };
    // ws emits 'error' on a socket for protocol violations (oversize message, bad opcode, bad
    // UTF-8). With no listener Node rethrows it and the whole process exits -- one malformed
    // frame from any anonymous client used to kill every live match. ws closes the socket itself.
    ws.on("error", (err) => console.warn("[online] socket error:", err.code || err.message));
    // One bad message must never take the whole server (and every live match) down with it.
    ws.on("message", (raw) => {
      try {
        onMessage(raw);
      } catch (err) {
        console.error("[online] message handler error:", err);
        send(ws, { type: "decision_rejected", reason: "服务器处理这条消息时出错" });
      }
    });

    ws.on("close", () => {
      leaveQueue(ws);
      const room = ctx.room;
      if (!room) return;
      if (ctx.side === "spectator" && ctx.spectator) {
        room.spectators.delete(ctx.spectator);
        return;
      }
      const seat = room.seats[ctx.side];
      if (seat && seat.ws === ws) seat.ws = null;
      // A second disconnect while a grace timer runs cancels the forfeit:
      // with nobody left, the game simply waits for a reclaim.
      if (room.started && !room.over && room.sim) {
        const otherSide = ctx.side === "home" ? "away" : "home";
        if (!room.seats[otherSide]?.ws && room.graceTimer) {
          clearTimeout(room.graceTimer);
          room.graceTimer = null;
        }
      }
      handleDisconnect(room, ctx.side, seat);
    });
  });

  return {
    wss,
    presets,
    secure: transport.secure,
    port: () => wss.address()?.port,
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweepTimer);
        for (const r of rooms.values()) {
          if (r.resumeTimer) clearTimeout(r.resumeTimer);
          if (r.graceTimer) clearTimeout(r.graceTimer);
          r.sim?.stop();
        }
        for (const client of wss.clients) client.terminate(); // an open socket would stall close()
        wss.close(() => transport.closeServer(resolve));
      }),
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const config = parseServerConfig(process.argv.slice(2), process.env);
  let server;
  try {
    server = createOnlineServer(config);
  } catch (err) {
    console.error(`[online] 启动失败：${err.message}`);
    process.exit(1);
  }
  server.wss.on("listening", () => {
    const { url, warning } = listeningInfo({ secure: server.secure, host: config.host, port: server.port() });
    console.log(`[online] listening on ${url} (${server.presets.length} preset teams)`);
    if (warning) console.warn(`[online] ${warning}`);
  });
}
