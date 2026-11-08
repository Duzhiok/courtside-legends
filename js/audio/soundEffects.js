/**
 * Short synthesised sound effects. Every call is a safe no-op until the player has interacted with the page
 * (no audio context yet), so callers never need to check. SFX and commentary outrank the music: cues duck it.
 */
import { bus, duck } from "./audioManager.js";
import { noiseHit, tone } from "./synthTracks.js";

const run = (fn) => { const b = bus(); if (b) { try { fn(b.ctx, b.out, b.ctx.currentTime + 0.01); } catch { /* audio must never break the game */ } } };

function blip(ctx, out, t, freq, dur, v, type = "sine", slideTo = null) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const roar = (ctx, out, t, level = 1, dur = 1.8) => {
  for (let i = 0; i < 3; i++) noiseHit(ctx, out, t + i * dur * 0.12, { v: 0.12 * level, decay: dur, type: "bandpass", freq: 700 + i * 450 });
};
const notes = (ctx, out, t, midis, gap, opts) => midis.forEach((m, i) => tone(ctx, out, t + i * gap, m, gap * 2.2, opts));

export const sfx = {
  click: () => run((c, o, t) => blip(c, o, t, 1500, 0.035, 0.06, "square")),
  swish: () => run((c, o, t) => noiseHit(c, o, t, { v: 0.22, decay: 0.28, type: "highpass", freq: 4200 })),
  whistle: () => run((c, o, t) => { blip(c, o, t, 2900, 0.32, 0.1, "sine", 3100); blip(c, o, t + 0.36, 2900, 0.4, 0.1, "sine", 3000); }),
  buzzer: () => run((c, o, t) => blip(c, o, t, 220, 0.75, 0.22, "square")),
  roar: (level = 1) => run((c, o, t) => roar(c, o, t, level)),
  victory: () => { duck(0.25, 1.4); run((c, o, t) => { notes(c, o, t, [60, 64, 67, 72], 0.12, { type: "triangle", v: 0.22, cut: 3000 }); roar(c, o, t + 0.4, 0.8, 1.6); }); },
  champion: () => { duck(0.2, 3); run((c, o, t) => { notes(c, o, t, [60, 64, 67, 72, 67, 72, 76, 79], 0.13, { type: "sawtooth", v: 0.16, cut: 2800 }); roar(c, o, t + 0.6, 1.4, 2.6); }); },
  defeat: () => { duck(0.3, 1.2); run((c, o, t) => notes(c, o, t, [67, 63, 58], 0.28, { type: "sine", v: 0.22, cut: 1200 })); },
  /** A buzzer-beater: the arena holds its breath (music dips to nothing), then erupts. */
  clutchMade: () => { duck(0.02, 0.7, 1.2); run((c, o, t) => { roar(c, o, t + 0.65, 1.6, 2.4); notes(c, o, t + 0.65, [64, 67, 72], 0.1, { type: "triangle", v: 0.2, cut: 3000 }); }); },
  clutchMiss: () => { duck(0.15, 1.2); run((c, o, t) => { blip(c, o, t, 330, 0.9, 0.16, "sine", 110); }); },
  /** Pull reveal: bigger rarity, bigger sting. `band` is a gacha band id. */
  reveal: (band) => {
    const lvl = { rotation: 1, starter: 1, allstar: 2, superstar: 3, legend: 4, myth: 5 }[band] || 0;
    if (!lvl) return;
    duck(0.45, 0.4 + lvl * 0.25);
    run((c, o, t) => {
      const seq = [72, 76, 79, 84, 88].slice(0, Math.min(5, lvl + 1));
      notes(c, o, t, seq, 0.09, { type: "triangle", v: 0.14 + lvl * 0.02, cut: 3500 });
      if (lvl >= 3) noiseHit(c, o, t, { v: 0.08 * lvl, decay: 0.9, type: "highpass", freq: 6000 });
      if (lvl >= 4) roar(c, o, t + 0.3, 0.2 * lvl, 1.4);
    });
  },
};
