/**
 * Canvas art for the venue's screens: the hung scoreboard (live from the match snapshot) and the courtside LED ad strip
 * (original, fictional sponsors only). Pure drawing onto a 2D-context-like object, so tests can record the calls.
 */

export const LED_SPONSORS = Object.freeze(["NORTHWIND", "HOOPLY", "SKYLINE AIR", "COURTSIDE LEGENDS", "BRIGHTBOLT", "METRO FUEL"]);

/** 754 -> "12:34"-style game clock; under a minute shows tenths like a real board. */
export function clockText(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return s.toFixed(1);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export const periodText = (quarter) => (quarter > 4 ? (quarter > 5 ? `${quarter - 4}OT` : "OT") : `Q${quarter || 1}`);

const short = (team, fallback) => String(team?.abbr || team?.code || team?.name || fallback).slice(0, 4).toUpperCase();

/** What the board shows, read only from a GameSim snapshot (never computed: no snapshot, no numbers). */
export function scoreboardState(snap) {
  if (!snap) return null;
  return {
    home: short(snap.home, "HOME"),
    away: short(snap.away, "AWAY"),
    hs: snap.score?.home ?? 0,
    as: snap.score?.away ?? 0,
    period: periodText(snap.quarter),
    clock: clockText(snap.clock),
  };
}

export const stateKey = (s) => (s ? `${s.home}|${s.away}|${s.hs}|${s.as}|${s.period}|${s.clock}` : "");

export function drawScoreboard(ctx, preset, state, w, h) {
  const accent = preset.shell.ledText;
  ctx.fillStyle = "#06080a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = preset.shell.led;
  ctx.fillRect(0, 0, w, h * 0.16);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  ctx.font = `bold ${Math.round(h * 0.11)}px sans-serif`;
  ctx.fillText("COURTSIDE LEGENDS", w / 2, h * 0.08);
  if (!state) return;
  ctx.font = `bold ${Math.round(h * 0.13)}px sans-serif`;
  ctx.fillText(state.home, w * 0.22, h * 0.3);
  ctx.fillText(state.away, w * 0.78, h * 0.3);
  ctx.font = `bold ${Math.round(h * 0.42)}px monospace`;
  ctx.fillText(String(state.hs), w * 0.22, h * 0.62);
  ctx.fillText(String(state.as), w * 0.78, h * 0.62);
  ctx.font = `bold ${Math.round(h * 0.2)}px monospace`;
  ctx.fillText(state.clock, w / 2, h * 0.5);
  ctx.font = `bold ${Math.round(h * 0.15)}px sans-serif`;
  ctx.fillText(state.period, w / 2, h * 0.76);
}

export function drawLedStrip(ctx, preset, w, h) {
  ctx.fillStyle = preset.shell.led;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = preset.shell.ledText;
  ctx.font = `bold ${Math.round(h * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const slot = w / LED_SPONSORS.length;
  LED_SPONSORS.forEach((name, i) => ctx.fillText(name, slot * (i + 0.5), h / 2));
}

/** A CanvasTexture drawn by `paint(ctx, w, h)`, or null without a DOM / 2D context / working paint (decoration only). */
export function canvasTexture(T, doc, w, h, paint) {
  if (!doc?.createElement || !T?.CanvasTexture) return null;
  const canvas = doc.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  try {
    paint(ctx, w, h);
  } catch {
    return null;
  }
  const tex = new T.CanvasTexture(canvas);
  if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  tex.needsUpdate = true;
  return { tex, ctx, canvas };
}
