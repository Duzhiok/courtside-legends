/**
 * Built-in soundtrack: original music synthesised with WebAudio, so there is nothing to license, download or
 * host. One tiny step sequencer plays any track definition; tracks are plain data (see TRACKS below).
 *
 * Pattern strings are 16 sixteenth-notes per bar: 'x' hit, 'X' accent, 'o' (bass only) fifth, '.' rest.
 * Lead patterns use chord-tone indexes ('0'..'9', wrapped), '.' rest. Chords are [rootOffset, ...intervals].
 */

const noiseCache = new WeakMap();
function noiseBuf(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function envelope(g, t, attack, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export function kick(ctx, out, t, v = 1) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  envelope(g, t, 0.003, v, 0.28);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.35);
}

export function noiseHit(ctx, out, t, { v = 0.3, decay = 0.1, type = "highpass", freq = 7000 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  envelope(g, t, 0.002, v, decay);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + decay + 0.05);
}

export function snare(ctx, out, t, v = 0.6) {
  noiseHit(ctx, out, t, { v, decay: 0.16, type: "bandpass", freq: 1800 });
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = 190;
  envelope(g, t, 0.002, v * 0.5, 0.1);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.15);
}

/** A pitched note: oscillator -> lowpass -> gain, with an attack and a release that ends exactly at `dur`. */
export function tone(ctx, out, t, midi, dur, { type = "sawtooth", cut = 1200, v = 0.3, attack = 0.01 } = {}) {
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = mtof(midi);
  f.type = "lowpass";
  f.frequency.value = cut;
  const a = Math.min(attack, dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.setValueAtTime(v, Math.max(t + a, t + dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const on = (pat, s) => pat?.[s] === "x" || pat?.[s] === "X";

/** Schedule everything that happens on sixteenth `step`, at audio time `t`. Pure of timers: also used offline. */
export function scheduleStep(ctx, out, def, step, t) {
  const stepDur = 60 / def.bpm / 4;
  const s = step % 16;
  const bar = Math.floor(step / 16);
  const [rootOff, ...tones] = def.chords[bar % def.chords.length];
  const root = def.root + rootOff;
  const mix = { kick: 0.9, snare: 0.5, hat: 0.18, bass: 0.35, pad: 0.1, lead: 0.12, ...def.mix };
  const at = t + (s % 2 ? (def.swing || 0) * stepDur : 0);

  if (on(def.kick, s)) kick(ctx, out, at, mix.kick * (def.kick[s] === "X" ? 1 : 0.8));
  if (on(def.snare, s)) snare(ctx, out, at, mix.snare);
  if (on(def.hat, s)) noiseHit(ctx, out, at, { v: mix.hat * (def.hat[s] === "X" ? 1.4 : 1), decay: 0.04 });
  const b = def.bass?.[s];
  if (b === "x" || b === "o") {
    const m = root - 12 + (b === "o" ? 7 : 0);
    tone(ctx, out, at, m, stepDur * (def.bassLen || 1.8), { type: def.bassType || "sawtooth", cut: def.bassCut || 500, v: mix.bass, attack: 0.008 });
  }
  if (s === 0 && mix.pad > 0) {
    for (const iv of tones) tone(ctx, out, t, root + iv, stepDur * 16 * 0.98, { type: def.padType || "triangle", cut: def.padCut || 900, v: mix.pad / tones.length * 2, attack: 0.35 });
  }
  const l = def.lead?.[s];
  if (l && l !== ".") tone(ctx, out, at, root + 12 + tones[Number(l) % tones.length], stepDur * 1.6, { type: def.leadType || "triangle", cut: def.leadCut || 2400, v: mix.lead, attack: 0.005 });
}

/** Real-time playback: a small lookahead scheduler. Returns { stop() }. */
export function startSynth(def, ctx, out) {
  const stepDur = 60 / def.bpm / 4;
  let step = 0;
  let next = ctx.currentTime + 0.08;
  const tick = () => {
    while (next < ctx.currentTime + 0.18) {
      scheduleStep(ctx, out, def, step, next);
      next += stepDur;
      step++;
    }
  };
  tick();
  const timer = setInterval(tick, 25);
  return { stop: () => clearInterval(timer) };
}

const D = (r, ...t) => [r, ...t];
const MIN7 = [0, 3, 7, 10];
const MAJ7 = [0, 4, 7, 11];
const DOM7 = [0, 4, 7, 10];

/** id -> definition. `scene`/`era` say where the music director may use it. */
export const TRACKS = [
  { id: "world_chill", name: "Late Night Hoops", scene: "world", bpm: 76, root: 57, swing: 0.2, kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", bass: "x.....o.x.....x.", chords: [D(0, ...MIN7), D(-4, ...MAJ7), D(3, ...MAJ7), D(-2, 0, 5, 7, 10)], lead: ".......2.......0", padType: "sine", padCut: 700, mix: { kick: 0.7, snare: 0.35, hat: 0.1, bass: 0.3, pad: 0.16, lead: 0.1 }, bassType: "sine" },
  { id: "world_night", name: "Penthouse Glow", scene: "world", bpm: 68, root: 52, swing: 0.15, kick: "x.......x.......", snare: "........x.......", hat: "..x...x...x...x.", bass: "x.......x.....o.", chords: [D(0, 0, 3, 7, 10, 14), D(-5, ...MAJ7), D(-3, ...MAJ7), D(-7, ...MIN7)], padType: "sine", padCut: 600, mix: { kick: 0.6, snare: 0.3, hat: 0.08, bass: 0.28, pad: 0.2 }, bassType: "sine" },
  { id: "team_hype", name: "Draft Night 808", scene: "team", bpm: 142, root: 45, kick: "x..x....x.x.....", snare: "........x.......", hat: "x.xxx.xxx.xxx.xx", bass: "x..x....x.x.....", bassType: "sine", bassCut: 300, bassLen: 3, chords: [D(0, 0, 3, 7), D(-4, 0, 4, 7), D(-5, 0, 4, 7), D(-2, 0, 4, 7)], lead: "0.1.2.1.0.1.2.3.", leadType: "sawtooth", leadCut: 1800, mix: { kick: 1, bass: 0.5, hat: 0.2, pad: 0.07, lead: 0.1 } },
  { id: "team_funk", name: "Roster Funk", scene: "team", bpm: 98, root: 52, swing: 0.12, kick: "x.....x...x..x..", snare: "....x..x....x...", hat: "x.xxx.xxx.xxx.xx", bass: "x.xx..o.x.x.o...", chords: [D(0, ...DOM7), D(5, ...DOM7), D(0, ...DOM7), D(7, ...DOM7)], lead: "..1...2...1...3.", leadType: "square", leadCut: 1500, mix: { bass: 0.4, lead: 0.07, pad: 0.08 } },
  { id: "play_upbeat", name: "Playground Run", scene: "play", bpm: 118, root: 55, kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x.", bass: "x.o.x.o.x.o.x.o.", chords: [D(0, 0, 4, 7), D(7, 0, 4, 7), D(9, 0, 3, 7), D(5, 0, 4, 7)], lead: "0.1.2.1.0.1.2.1.", mix: { lead: 0.14, hat: 0.2 } },
  { id: "career_70s", name: "Soul Train Shuffle", scene: "career", era: "70s", bpm: 104, root: 50, swing: 0.1, kick: "x..x..x...x.x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", bass: "x..x..o.x..x..o.", chords: [D(0, 0, 4, 7, 10), D(5, 0, 4, 7, 10), D(0, 0, 4, 7, 10), D(7, 0, 4, 7, 10)], padType: "sawtooth", padCut: 700, lead: "......2.....3...", leadType: "square", leadCut: 1400, mix: { pad: 0.12, lead: 0.07, hat: 0.14 } },
  { id: "career_80s", name: "Neon Fast Break", scene: "career", era: "80s", bpm: 112, root: 48, kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", bass: "x.x.x.x.x.x.x.x.", bassCut: 700, chords: [D(0, ...MIN7), D(-4, ...MAJ7), D(-9, 0, 4, 7), D(-5, ...DOM7)], lead: "0.1.2.3.2.1.0.1.", leadType: "sawtooth", leadCut: 3000, padType: "sawtooth", padCut: 1200, mix: { lead: 0.1, pad: 0.1 } },
  { id: "career_90s", name: "Boom Bap Baseline", scene: "career", era: "90s", bpm: 90, root: 53, swing: 0.22, kick: "x..x..x.....x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", bass: "x..x..o.....x...", bassType: "sine", chords: [D(0, ...MIN7), D(5, ...MIN7), D(0, ...MIN7), D(-2, ...DOM7)], lead: ".......2.....1..", mix: { hat: 0.12, pad: 0.12, lead: 0.12 }, padType: "sine" },
  { id: "career_00s", name: "Club Lights R&B", scene: "career", era: "00s", bpm: 96, root: 51, swing: 0.08, kick: "x......x..x.....", snare: "....x.......x...", hat: "x.xxx.x.x.xxx.x.", bass: "x..x..x.x.....o.", bassType: "sine", chords: [D(0, 0, 3, 7, 10, 14), D(-4, ...MAJ7), D(-2, 0, 4, 7, 11), D(3, ...MAJ7)], padType: "sine", mix: { pad: 0.16, hat: 0.14 }, lead: ".......3......1." },
  { id: "career_modern", name: "Next Era", scene: "career", era: "modern", bpm: 128, root: 46, kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.xxx.xxx.xxx.xx", bass: "x..x..x...x.x...", bassCut: 600, chords: [D(0, 0, 3, 7, 10), D(-4, 0, 4, 7, 11), D(-2, 0, 4, 7), D(-7, 0, 3, 7)], lead: "0.1.2.3.4.3.2.1.", leadType: "sawtooth", leadCut: 2600, padType: "sawtooth", padCut: 1000, mix: { pad: 0.1, lead: 0.1 } },
  { id: "game_arena", name: "Arena Floor", scene: "game", intensity: "arena", bpm: 100, root: 45, kick: "x...x...x...x...", hat: "..x...x...x...x.", bass: "x.......x.......", chords: [D(0, 0, 7, 12), D(-2, 0, 7, 12)], padType: "sawtooth", padCut: 500, mix: { kick: 0.35, hat: 0.07, bass: 0.18, pad: 0.12 } },
  { id: "game_tension", name: "Fourth Quarter", scene: "game", intensity: "tension", bpm: 112, root: 43, kick: "x.x.x.x.x.x.x.x.", hat: "x.x.x.x.x.x.x.x.", bass: "x.x.x.x.x.x.x.x.", bassCut: 450, chords: [D(0, 0, 3, 6, 9), D(1, 0, 3, 6, 9)], lead: "0...1...2...3...", leadType: "sawtooth", leadCut: 1600, padType: "sawtooth", padCut: 700, mix: { kick: 0.45, hat: 0.1, bass: 0.26, pad: 0.12, lead: 0.07 } },
  { id: "game_clutch", name: "Last Possession", scene: "game", intensity: "clutch", bpm: 128, root: 41, kick: "X.x.....X.x.....", snare: "....x...x...x.xx", hat: "xxxxxxxxxxxxxxxx", bass: "xxxxxxxxxxxxxxxx", bassCut: 800, chords: [D(0, ...MIN7), D(1, ...MIN7)], lead: "0123012301230123", leadType: "sawtooth", leadCut: 3200, padType: "sawtooth", padCut: 900, mix: { kick: 1, snare: 0.5, hat: 0.1, bass: 0.3, pad: 0.12, lead: 0.07 } },
];

const BY_ID = new Map(TRACKS.map((t) => [t.id, t]));
export const synthTrackById = (id) => BY_ID.get(id) || null;
/** The shape the audio manager plays. */
export const asTrack = (def) => ({ id: def.id, name: def.name, kind: "synth", def });
