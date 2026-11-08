// Browser QA: dynamic music, Courtside Radio, volume/mute persistence, local import, account isolation.
// Real Chromium, real clicks (autoplay policy is real), real IndexedDB. A generated WAV stands in for "my music".
// Usage: node scripts/qa/audio-music.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/audio";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** 1.2s mono 16-bit sine WAV: a real audio file the browser can decode. */
function wav(freq = 440, secs = 1.2, rate = 22050) {
  const n = Math.floor(secs * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 9000), 44 + i * 2);
  return buf;
}

const A = (page, fn, arg) => page.evaluate(async ([src, a]) => {
  const { audio } = await import("/js/audio/index.js");
  const lib = await import("/js/audio/playlistStore.js");
  const player = await import("/js/audio/playlistPlayer.js");
  return new Function("audio", "lib", "player", "arg", `return (${src})(audio, lib, player, arg)`)(audio, lib, player, a);
}, [fn.toString(), arg]);
/** Poll until `fn(audio, lib, player)` is truthy. (page.waitForFunction + async predicate is vacuous: a Promise is truthy.) */
const until = async (page, fn, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await A(page, fn)) return true; await page.waitForTimeout(100); }
  return false;
};
const now = (page) => A(page, (audio) => ({ ...audio.manager.debug(), settings: audio.manager.getSettings() }));

async function run(tag, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 30000 });
  const tap = (sel) => (mobile ? page.tap(sel) : page.click(sel));

  // -- autoplay policy: nothing before a gesture, music after the first tap
  let s = await now(page);
  check(`[${tag}] no audio context before any gesture`, s.ctxState === "none");
  await tap('.home-tab[data-category="world"]');
  await until(page, (audio) => audio.manager.debug().current === "world_chill", 8000);
  s = await now(page);
  check(`[${tag}] first tap unlocks audio and plays the My World track`, s.ctxState === "running" && s.current === "world_chill", JSON.stringify(s));

  // -- scene switching
  for (const [cat, track] of [["players", "team_hype"], ["custom", "play_upbeat"], ["career", "career_modern"], ["world", "world_chill"]]) {
    await tap(`.home-tab[data-category="${cat}"]`);
    await page.waitForTimeout(250);
    s = await now(page);
    check(`[${tag}] ${cat} tab -> ${track}`, s.current === track, `got ${s.current}`);
  }

  // -- hammering the tabs must not stack tracks
  for (let i = 0; i < 6; i++) { await tap(`.home-tab[data-category="${["players", "custom", "career", "world"][i % 4]}"]`); await page.waitForTimeout(60); }
  await page.waitForTimeout(2600);
  s = await now(page);
  check(`[${tag}] after rapid switching exactly one deck remains`, s.decks === 1, `decks=${s.decks} current=${s.current}`);
  await tap('.home-tab[data-category="world"]');
  await tap('.home-tab[data-category="world"]');
  await page.waitForTimeout(300);
  check(`[${tag}] re-showing the same tab does not restart or stack`, (await now(page)).decks <= 2);

  // -- era + clutch rules through the real facade
  const eras = await A(page, (audio) => {
    const out = {};
    for (const y of [1975, 1985, 1996, 2003, 2024]) { audio.screen("season", { year: y }); out[y] = audio.manager.debug().current; }
    return out;
  });
  check(`[${tag}] era soundtrack follows the season year`, eras[1975] === "career_70s" && eras[1985] === "career_80s" && eras[1996] === "career_90s" && eras[2003] === "career_00s" && eras[2024] === "career_modern", JSON.stringify(eras));
  const game = await A(page, (audio) => {
    audio.screen("game");
    const got = [audio.manager.debug().current];
    audio.game({ quarter: 4, clock: 200, score: { home: 80, away: 76 } }); got.push(audio.manager.debug().current);
    audio.game({ quarter: 4, clock: 12, score: { home: 80, away: 79 } }); got.push(audio.manager.debug().current);
    audio.screen("home");
    return got;
  });
  check(`[${tag}] game: arena -> tension -> clutch (real GameSim snapshot shape)`, game.join() === "game_arena,game_tension,game_clutch", game.join());

  // -- every built-in track really produces sound (offline render), without clipping or NaN
  const loud = await page.evaluate(async () => {
    const { TRACKS, scheduleStep } = await import("/js/audio/synthTracks.js");
    const out = [];
    for (const def of TRACKS) {
      const rate = 22050;
      const off = new OfflineAudioContext(1, rate * 4, rate);
      const stepDur = 60 / def.bpm / 4;
      for (let i = 0; i * stepDur < 3.6; i++) scheduleStep(off, off.destination, def, i, i * stepDur);
      const data = (await off.startRendering()).getChannelData(0);
      let peak = 0, sum = 0;
      for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      out.push({ id: def.id, peak: +peak.toFixed(2), rms: +Math.sqrt(sum / data.length).toFixed(3), nan: data.some(Number.isNaN) });
    }
    return out;
  });
  check(`[${tag}] all ${loud.length} built-in tracks audible (rms > 0.005) and finite`, loud.every((t) => t.rms > 0.005 && !t.nan), loud.filter((t) => !(t.rms > 0.005) || t.nan).map((t) => t.id).join());
  check(`[${tag}] no built-in track clips hard before the master compressor (peak <= 2.2)`, loud.every((t) => t.peak <= 2.2), loud.map((t) => `${t.id}:${t.peak}`).join(" "));

  // -- top-bar toggle + persistence
  await tap("#btn-bgm");
  await page.waitForTimeout(300);
  s = await now(page);
  check(`[${tag}] music button turns music off`, s.settings.mode === "off" && (await page.textContent("#btn-bgm")).trim() === "♪ 音乐" && (await page.getAttribute("#btn-bgm", "aria-pressed")) === "false");
  // earlier rapid scene hops left crossfades still fading out; "off" must drain everything within a few seconds
  const drained = await until(page, (audio) => audio.manager.debug().decks === 0, 4000);
  check(`[${tag}] off really stops every deck`, drained, JSON.stringify(await now(page)));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 30000 });
  check(`[${tag}] mute survives a reload`, (await now(page)).settings.mode === "off");
  await tap("#btn-bgm");
  await page.waitForTimeout(500);
  s = await now(page);
  check(`[${tag}] turning it back on resumes music after the reload`, s.settings.mode !== "off" && s.ctxState === "running" && !!s.current, JSON.stringify(s));

  // -- Courtside Radio: open, volume persistence, layout
  await tap("#btn-bgm-pick");
  await page.waitForSelector("#radio-dialog[open]");
  const box = await page.$eval("#radio-dialog", (d) => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight }; });
  check(`[${tag}] radio dialog fits the viewport`, box.l >= 0 && box.r <= box.w && box.t >= 0 && box.b <= box.h, JSON.stringify(box));
  await page.$eval('#radio-dialog input[data-vol="music"]', (el) => { el.value = "20"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.$eval('#radio-dialog input[data-vol="sfx"]', (el) => { el.value = "35"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  s = await now(page);
  check(`[${tag}] volume sliders update settings`, s.settings.music === 0.2 && s.settings.sfx === 0.35);
  check(`[${tag}] prev/next are disabled outside playlist mode`, await page.$eval('#radio-dialog [data-radio="next"]', (b) => b.disabled));

  // -- import local music: rejects non-audio, switches to My playlist, plays the file
  await page.setInputFiles("#radio-dialog [data-radio-file]", [
    { name: "my <b>jam</b>.wav", mimeType: "audio/wav", buffer: wav(440) },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") },
  ]);
  const waited = (await until(page, (audio) => audio.manager.getSettings().mode === "playlist" && /^u/.test(audio.manager.debug().current || ""), 10000)) ? "ok" : "timeout";
  // from the moment the imported song plays, sample for a second: nothing else may flicker in
  const timeline = [];
  for (let i = 0; i < 6; i++) { const t = await now(page); timeline.push(`${t.settings.mode}:${t.current}:${t.decks}`); await page.waitForTimeout(150); }
  const firstU = 0;
  check(`[${tag}] once the imported song plays, no other track flickers in (timeline: ${timeline.join(" | ")})`, firstU === 0 && timeline.every((t) => /^playlist:u/.test(t)), timeline.join(" | "));
  s = await now(page);
  if (waited !== "ok" || !/^u/.test(s.current || "")) console.log(`[${tag}] import wait=${waited} timeline=${timeline.join(" | ")}`);
  const status = await page.textContent("#radio-dialog .radio-status");
  const listHtml = await page.innerHTML("#radio-dialog .radio-list");
  check(`[${tag}] import switches to My playlist and plays the imported file`, s.settings.mode === "playlist" && /^u/.test(s.current || ""), JSON.stringify(s));
  check(`[${tag}] non-audio file is refused with a reason`, /notes\.txt/.test(status), status);
  check(`[${tag}] imported file name is escaped (no markup injection)`, !/<b>/.test(listHtml) && /&lt;b&gt;/.test(listHtml));
  check(`[${tag}] radio shows the playing track`, /my/.test(await page.textContent("#radio-dialog .radio-now")));
  await shoot(page, `${OUT}/${tag}-radio.png`);
  check(`[${tag}] prev/next enabled in playlist mode`, !(await page.$eval('#radio-dialog [data-radio="next"]', (b) => b.disabled)));
  await page.click('#radio-dialog [data-radio="close"]');

  // -- persistence across reload: playlist + volumes + local file (IndexedDB)
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 30000 });
  s = await now(page);
  const stored = await A(page, async (audio, lib) => (await lib.listTracks(audio.manager.getProfile())).map((t) => t.name));
  check(`[${tag}] volumes and mode persist after reload`, s.settings.music === 0.2 && s.settings.sfx === 0.35 && s.settings.mode === "playlist", JSON.stringify(s.settings));
  check(`[${tag}] imported song persists locally after reload`, stored.length === 1, JSON.stringify(stored));
  await tap('.home-tab[data-category="custom"]');
  await page.waitForTimeout(1200);
  s = await now(page);
  check(`[${tag}] playlist mode ignores scene changes (keeps the player's song)`, /^u/.test(s.current || ""), s.current);

  // -- account isolation: another account does not inherit the guest's volume or songs
  const iso = await A(page, async (audio, lib) => {
    const acc = await import("/js/data/account.js");
    const guestProfile = audio.manager.getProfile();
    const a = acc.createAccount("音频测试");
    audio.screen("home");
    const mine = { profile: audio.manager.getProfile(), music: audio.manager.getSettings().music, mode: audio.manager.getSettings().mode, songs: (await lib.listTracks(audio.manager.getProfile())).length, accountId: a.id };
    acc.setActiveAccountId?.(null);
    audio.screen("home");
    const back = { profile: audio.manager.getProfile(), music: audio.manager.getSettings().music };
    return { guestProfile, mine, back };
  });
  check(`[${tag}] a new account starts with its own defaults and no songs`, iso.mine.profile === iso.mine.accountId && iso.mine.music === 0.45 && iso.mine.mode === "dynamic" && iso.mine.songs === 0, JSON.stringify(iso));
  check(`[${tag}] switching back to the guest restores the guest's volume`, iso.back.profile === "guest" && iso.back.music === 0.2, JSON.stringify(iso.back));

  // -- failure recovery: a dead track must not crash anything; the next scene replaces it
  const rec = await A(page, async (audio) => {
    let failed = false;
    await audio.setMode("dynamic");
    audio.manager.playTrack({ id: "bad", name: "bad", kind: "file", url: "/does-not-exist.mp3" }, { restart: true, fade: 0.2, onError: () => (failed = true) });
    await new Promise((r) => setTimeout(r, 800));
    audio.screen("home");
    audio.director().reset();
    await new Promise((r) => setTimeout(r, 600));
    return { failed, current: audio.manager.debug().current };
  });
  check(`[${tag}] a dead audio file reports an error and dynamic music takes over again`, rec.failed && rec.current && rec.current !== "bad", JSON.stringify(rec));

  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

await run("desktop", { width: 1280, height: 800 }, false);
await run("mobile", { width: 390, height: 844 }, true);
await browser.close();
console.log(report.join("\n"));
const failed = report.filter((l) => l.startsWith("FAIL"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
