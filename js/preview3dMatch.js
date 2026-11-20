// 3D Match Viewer — S1A preview page logic (moved verbatim out of
// preview-3d-match.html as S-P2-5 step 2, so the page carries no inline
// <script> and a CSP without 'unsafe-inline' can switch on later).
// Imports are relative to js/ here, not to the page at the repo root.
import { CourtView3D } from "./engine/court3d.js";
import { mergePresentationEvents } from "./match/presentation/normalizer.js";
import { choreograph } from "./match/presentation/choreographer.js";
import { buildCannedFeed } from "./match/presentation/cannedFeed.js";
import { createMatchPresentationView } from "./match/presentation/matchView.js";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

const feed = buildCannedFeed();
const events = mergePresentationEvents(feed.rawEvents, feed.domainEvents);
const { plays, totalDurationMs } = choreograph(events, { seed: feed.seed });
$("seed").textContent = String(feed.seed);

// Beat inspector: every choreographed beat, grouped by play.
const listEl = $("beat-list");
for (const play of plays) {
  for (const beat of play.beats) {
    const li = document.createElement("li");
    li.dataset.seq = String(beat.seq);
    li.innerHTML = "";
    li.textContent = `P${play.possessionIndex + 1} · ${beat.kind} · ${beat.durationMs}ms · ${beat.score.home}–${beat.score.away} · Q${beat.quarter} ${beat.clock}s `;
    const cam = document.createElement("span");
    cam.className = "cam";
    cam.textContent = `(camera: ${beat.camera.mode}, players: ${beat.players.length}, ball keys: ${beat.ball ? beat.ball.keyframes.length : 0})`;
    li.appendChild(cam);
    listEl.appendChild(li);
  }
}

let view = null;
let rafId = 0;

function setSpeed(n) {
  if (!view) return;
  view.setTimeScale(n);
  for (const m of [1, 2, 3]) $("btn-" + m + "x").setAttribute("aria-pressed", String(m === n));
}

function highlightCurrentBeat() {
  const cur = view?.currentBeat();
  for (const li of listEl.children) {
    li.classList.toggle("current", !!cur && Number(li.dataset.seq) === cur.seq);
  }
}

function loop() {
  if (!view) return;
  view.tick();
  highlightCurrentBeat();
  if (!view.scheduler.isIdle() || view.scheduler.pendingCount() > 0) {
    rafId = requestAnimationFrame(loop);
  } else {
    statusEl.textContent = `Finished — final score ${$("score-home").textContent}–${$("score-away").textContent}. Total choreographed time ${totalDurationMs}ms at 1×. Press “Play from start” to replay.`;
    $("btn-pause").disabled = true;
  }
}

function playFromStart() {
  if (!view) return;
  view.interrupt();
  view.loadPlays(plays);
  $("btn-pause").disabled = false;
  $("btn-pause").textContent = "⏸ Pause";
  statusEl.textContent = "Playing canned exhibition feed…";
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

$("btn-play").addEventListener("click", playFromStart);
$("btn-pause").addEventListener("click", () => {
  if (!view) return;
  if (view.scheduler.isPaused()) {
    view.resume();
    $("btn-pause").textContent = "⏸ Pause";
    statusEl.textContent = "Resumed.";
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  } else if (view.pause()) {
    $("btn-pause").textContent = "▶ Resume";
    statusEl.textContent = "Paused — frozen frame (score/clock unchanged).";
  }
});
$("btn-interrupt").addEventListener("click", () => {
  if (!view) return;
  view.interrupt();
  cancelAnimationFrame(rafId);
  $("btn-pause").disabled = true;
  statusEl.textContent = "Interrupted.";
});
for (const m of [1, 2, 3]) {
  $("btn-" + m + "x").addEventListener("click", () => setSpeed(m));
}

let view3d;
try {
  view3d = await CourtView3D.create($("court-root"));
} catch (err) {
  console.warn("[3d-preview] WebGL unavailable:", err);
  statusEl.textContent = "3D is not available on this device/browser (WebGL required). The beat list below still shows the deterministic choreography.";
  $("btn-play").disabled = true;
  $("btn-pause").disabled = true;
  $("btn-interrupt").disabled = true;
  throw err;
}
view = createMatchPresentationView({
  view3d,
  hud: {
    scoreHome: $("score-home"),
    scoreAway: $("score-away"),
    clock: $("clock"),
    quarter: $("quarter"),
    beatLabel: $("beat-label"),
  },
});
view3d.resize?.();
statusEl.textContent = "Ready — press “Play from start”.";
playFromStart();
