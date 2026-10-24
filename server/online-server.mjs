/**
 * T6 P0 online server: room-code 1v1, server-authoritative.
 *
 * Run:  node server/online-server.mjs [--port 3001]
 * The static site (python3 scripts/serve_nocache.py, :5173) serves
 * online.html; this process only speaks WebSocket.
 *
 * Protocol (see docs/ONLINE_DESIGN.md, P0):
 *   server -> client: welcome, room, joined, frame, event,
 *                     decision_applied, decision_rejected, game_over
 *   client -> server: create, join, decision
 *
 * Design notes from the P0 measurements (2026-10-24):
 * - Frames are the slim online frame (~5KB), NOT sim.snapshot() (~70KB).
 * - Sim events carry a full snapshot in their payload; the server strips
 *   it and forwards only {kind, text}.
 * - Decisions apply immediately (sub takes effect on the next possession;
 *   timeout / quarter / half breaks pause and open an adjustment window
 *   for BOTH sides). Either side may resume; a 20s auto-resume fires only
 *   while both seats are connected, so a stalled opponent can't freeze
 *   the game — and a disconnected seat blocks auto-resume.
 * - Injuries are OFF in P0 duels (avoids the known short-handed soft-lock).
 * - Defensive schemes and autopilot are NOT in the P0 decision set: the
 *   engine's defensePlan / managed breaks are you-side-only (see
 *   server/online-decisions.mjs).
 */
import { readFileSync } from "node:fs";
import WebSocket, { WebSocketServer } from "ws";
import { GameSim } from "../js/engine/sim.js";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { TACTICS } from "../js/data/coaches.js";
import { buildOnlineFrame } from "./online-frame.mjs";
import { validateDecision, describeDecision } from "./online-decisions.mjs";

export const ONLINE_SPEED = 2; // 300ms per possession, ~60s per game
export const AUTO_RESUME_MS = 20000;

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
    });
  }
  return presets;
}

function roomCode(rng = Math.random) {
  return String(Math.floor(100000 + rng() * 900000));
}

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

export function createOnlineServer({ port = 3001 } = {}) {
  const presets = loadPresets();
  const presetById = new Map(presets.map((p) => [p.id, p]));
  const tactics = Object.values(TACTICS).map((t) => ({ id: t.id, name: t.name }));
  const rooms = new Map();

  const wss = new WebSocketServer({ port });
  wss.on("connection", (ws) => {
    send(ws, {
      type: "welcome",
      presets: presets.map((p) => ({ id: p.id, name: p.name })),
      tactics,
    });
    let room = null;
    let side = null;

    const broadcast = (obj) => {
      for (const s of [room?.seats.home, room?.seats.away]) {
        if (s?.ws) send(s.ws, obj);
      }
    };

    const manageAutoResume = () => {
      if (room?.resumeTimer) {
        clearTimeout(room.resumeTimer);
        room.resumeTimer = null;
      }
      if (!room?.sim || room.over) return;
      if (!room.sim.paused) return;
      if (!room.seats.home?.ws || !room.seats.away?.ws) return;
      room.resumeTimer = setTimeout(() => {
        room.resumeTimer = null;
        if (!room.sim || room.over || !room.sim.paused) return;
        room.sim.setPaused(false);
        broadcast({ type: "event", kind: "coach", text: "暂停时间到，比赛继续" });
        broadcastFrame();
      }, AUTO_RESUME_MS);
    };

    const broadcastFrame = () => {
      if (!room?.sim) return;
      room.tick += 1;
      room.lastFrame = buildOnlineFrame(room.sim, room.tick);
      broadcast(room.lastFrame);
      manageAutoResume();
    };

    const startGame = () => {
      const home = presetById.get(room.seats.home.teamId);
      const away = presetById.get(room.seats.away.teamId);
      room.tick = 0;
      room.sim = new GameSim({
        home: { name: home.name, players: home.players, starterIds: home.starterIds },
        away: { name: away.name, players: away.players, starterIds: away.starterIds },
        youSide: "home",
        injuries: false,
        speed: ONLINE_SPEED,
        lang: "zh",
        onEvent: (payload) => {
          // Strip the snapshot the sim attaches to every event payload.
          broadcast({ type: "event", kind: payload.type, text: payload.text });
        },
        onTick: () => broadcastFrame(),
        onEnd: () => {
          room.over = true;
          if (room.resumeTimer) clearTimeout(room.resumeTimer);
          room.sim.stop();
          const snap = room.sim.snapshot();
          broadcast({
            type: "game_over",
            frame: room.lastFrame,
            score: { ...snap.score },
            winner:
              snap.score.home > snap.score.away
                ? "home"
                : snap.score.away > snap.score.home
                  ? "away"
                  : null,
          });
        },
      });
      room.started = true;
      const snap = room.sim.snapshot();
      for (const s of ["home", "away"]) {
        const seat = room.seats[s];
        send(seat.ws, {
          type: "joined",
          code: room.code,
          side: s,
          home: snap.home,
          away: snap.away,
          tactics,
        });
      }
      room.sim.start();
    };

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return send(ws, { type: "decision_rejected", reason: "消息不是 JSON" });
      }

      if (msg.type === "create") {
        const name = String(msg.name || "").trim();
        if (!name) return send(ws, { type: "decision_rejected", reason: "请填写名字" });
        if (!presetById.has(msg.teamId)) {
          return send(ws, { type: "decision_rejected", reason: "球队不存在" });
        }
        let code = roomCode();
        while (rooms.has(code)) code = roomCode();
        room = { code, seats: { home: null, away: null }, started: false, over: false, sim: null, tick: 0, lastFrame: null, resumeTimer: null };
        rooms.set(code, room);
        room.seats.home = { name, teamId: msg.teamId, ws };
        side = "home";
        return send(ws, { type: "room", code, side: "home" });
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
            room = target;
            side = s;
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
              broadcast({ type: "event", kind: "coach", text: `${name}重新连接` });
            }
            return;
          }
        }
        if (target.started) {
          return send(ws, { type: "decision_rejected", reason: "对局已开始" });
        }
        if (!presetById.has(msg.teamId)) {
          return send(ws, { type: "decision_rejected", reason: "球队不存在" });
        }
        if (target.seats.away) {
          return send(ws, { type: "decision_rejected", reason: "房间已满" });
        }
        if (target.seats.home?.teamId === msg.teamId) {
          return send(ws, { type: "decision_rejected", reason: "对方已选这支球队，换一支" });
        }
        target.seats.away = { name, teamId: msg.teamId, ws };
        room = target;
        side = "away";
        send(ws, { type: "room", code: target.code, side: "away" });
        startGame();
        return;
      }

      if (msg.type === "decision") {
        if (!room?.started || room.over) {
          return send(ws, { type: "decision_rejected", reason: "比赛还没开始" });
        }
        const seat = room.seats[side];
        if (!seat || seat.ws !== ws) {
          return send(ws, { type: "decision_rejected", reason: "你不在这个对局里" });
        }
        const d = msg.decision || {};
        const v = validateDecision(room.sim, side, d);
        if (!v.ok) return send(ws, { type: "decision_rejected", reason: v.reason });
        const text = describeDecision(room.sim, side, d);
        const applied = v.apply();
        if (applied === false) {
          return send(ws, { type: "decision_rejected", reason: "指令执行失败" });
        }
        broadcast({ type: "decision_applied", side, kind: d.kind, text });
        broadcastFrame();
        return;
      }
    });

    ws.on("close", () => {
      if (!room) return;
      const seat = room.seats[side];
      if (seat && seat.ws === ws) seat.ws = null;
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
      if (!room.over && room.sim && !room.sim.paused) {
        room.sim.setPaused(true, "timeout");
        broadcast({ type: "event", kind: "coach", text: `${seat?.name || "对方"}断线了，比赛暂停` });
        broadcastFrame();
      }
    });
  });

  return {
    wss,
    presets,
    port: () => wss.address()?.port,
    close: () =>
      new Promise((resolve) => {
        for (const r of rooms.values()) {
          if (r.resumeTimer) clearTimeout(r.resumeTimer);
          r.sim?.stop();
        }
        wss.close(resolve);
      }),
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const portArg = process.argv.find((a) => a.startsWith("--port="));
  const port = portArg ? Number(portArg.slice("--port=".length)) : Number(process.env.ONLINE_PORT || 3001);
  const server = createOnlineServer({ port });
  server.wss.on("listening", () => {
    console.log(`[online] listening on ws://localhost:${server.port()} (${server.presets.length} preset teams)`);
  });
}
