// Real-WebGL check of the Stylized figure and its shared animation library (not the My World panel flow).
// Mounts the viewer straight into a box, drives it through the public handle and reads `inspect()`.
// Usage: node scripts/qa/avatar-actions.mjs /tmp/cls-qa/actions [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/actions";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function session(tag, viewport, box, cut, body = "standard") {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}online.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ w, h }) => {
    document.body.innerHTML = "";
    const el = document.createElement("div");
    el.id = "box";
    el.style.cssText = `width:${w}px;height:${h}px;background:#244a3a;margin:0 auto`;
    document.body.style.margin = "0";
    document.body.append(el);
  }, box);
  await page.evaluate(async ({ cut, body }) => {
    const { mountAvatar3d } = await import("/js/ui/avatar3d.js");
    window.__v = await mountAvatar3d(document.getElementById("box"), { timeoutMs: 20000, look: { skin: "warm", hair: "black", outfit: "forest", style: "short", body, figure: "stylized", cut } });
  }, { cut, body });
  await page.waitForTimeout(800);
  const info = () => page.evaluate(() => window.__v.inspect());
  const act = async (id, ms) => { const ok = await page.evaluate((i) => window.__v.playAction(i), id); await page.waitForTimeout(ms); return ok; };
  const shot = (name) => page.locator("#box").screenshot({ path: `${OUT}/${tag}-${name}.png` });
  return { page, errors, info, act, shot, tag };
}

const ACTIONS = [["celebrate", false, 1.3], ["clap", false, 1], ["jump", true, 1.45], ["run", true, 1], ["sit", true, 1]];

for (const cut of ["jersey", "street"]) {
  const s = await session(`desktop-${cut}`, { width: 1440, height: 900 }, { w: 420, h: 640 }, cut, "broad");
  const idle = await s.info();
  const t = `[desktop ${cut}]`;
  check(`${t} loads the ${cut} GLB, three-quarter, fast`, idle.model === `stylized_${cut}.glb` && idle.loadMs < 6000, `${idle.model} ${idle.loadMs}ms`);
  check(`${t} all seven clips present, none carries a scale track`, idle.clips.length === 7 && idle.scaleTracks === 0, `${idle.clips.length} clips, ${idle.scaleTracks} scale tracks`);
  check(`${t} cheap to draw`, idle.drawCalls <= 30 && idle.triangles < 60000, `${idle.triangles} tris, ${idle.drawCalls} draw calls, ${idle.meshes} meshes, ${idle.materials} materials`);
  check(`${t} ball in hand, stool hidden at rest`, idle.ballVisible && idle.hasSeat && !idle.seatVisible);
  check(`${t} broad build applied (shoulders widened)`, idle.scales.ShoulderL?.[0] > 1.1, JSON.stringify(idle.scales.ShoulderL));
  await s.shot("idle");

  for (const [id, ball, frame] of ACTIONS) {
    const ok = await s.act(id, id === "jump" ? 750 : 900);
    const i = await s.info();
    check(`${t} ${id}: starts and reports itself`, ok && i.action === id);
    check(`${t} ${id}: ball ${ball ? "kept" : "put away"}, stool ${id === "sit" ? "shown" : "hidden"}`, i.ballVisible === ball && i.seatVisible === (id === "sit"));
    check(`${t} ${id}: the broad build survives the animation (no scale track overrides it)`, i.scales.ShoulderL?.[0] > 1.1, JSON.stringify(i.scales.ShoulderL));
    if (frame > 1) check(`${t} ${id}: camera eases out for the wider pose`, i.camDistRatio > 1 + (frame - 1) * 0.5, `ratio ${i.camDistRatio} -> ${frame}`);
    await s.shot(`action-${id}`);
    if (id === "sit") {
      await s.page.waitForTimeout(1800);
      const held = await s.info();
      check(`${t} sit: still seated 2.7 s later (holds until released)`, held.action === "sit" && held.holding && held.seatVisible);
      check(`${t} sit: hips dropped ~0.4 and feet stay on the floor`, near(held.hips[1], idle.hips[1] - 0.42, 0.08) && held.feet.every((f, k) => near(f[1], idle.feet[k][1], 0.03)),
        `hips y ${idle.hips[1]} -> ${held.hips[1]}, feet y ${idle.feet.map((f) => f[1])} -> ${held.feet.map((f) => f[1])}`);
      check(`${t} sit: the ball scale stays 1 (never squashed by the build)`, held.propScale.every((v) => near(v, 1, 0.05)), JSON.stringify(held.propScale));
      await s.page.evaluate(() => window.__v.playIdle());
      await s.page.waitForTimeout(1600);
      const up = await s.info();
      check(`${t} idle after sit: stands up, stool gone, ball back, framing back`, up.action === "idle" && !up.holding && !up.seatVisible && up.ballVisible && near(up.camDistRatio, 1, 0.05) && near(up.hips[1], idle.hips[1], 0.03),
        `hips ${up.hips} vs ${idle.hips}, ratio ${up.camDistRatio}`);
    }
  }

  // one-shots return to idle on their own
  await s.act("celebrate", 2900);
  const back = await s.info();
  check(`${t} celebrate ends on its own: idle, ball back, stool hidden`, back.action === "idle" && back.ballVisible && !back.seatVisible, `action ${back.action}`);
  // switching straight from a held pose to another action stands up first, then runs
  await s.act("sit", 1500);
  await s.act("run", 1800);
  const swapped = await s.info();
  check(`${t} sit -> run directly: not stuck seated, stool gone`, swapped.action === "run" && !swapped.holding && !swapped.seatVisible && near(swapped.hips[1], idle.hips[1], 0.12), `hips ${swapped.hips}`);
  check(`${t} no page errors`, s.errors.length === 0, s.errors.slice(0, 2).join(" | "));
  await s.page.close();
}

for (const [cut, body] of [["jersey", "slim"], ["street", "standard"]]) {
  const s = await session(`mobile-${cut}`, { width: 390, height: 844 }, { w: 360, h: 520 }, cut, body);
  const i = await s.info();
  check(`[mobile ${cut}] loads and draws`, i.model === `stylized_${cut}.glb` && i.drawCalls > 0, `${i.loadMs}ms`);
  await s.shot("idle");
  await s.act("jump", 700);
  await s.shot("jump");
  await s.act("sit", 1900);
  await s.shot("sit");
  check(`[mobile ${cut}] no page errors`, s.errors.length === 0, s.errors.slice(0, 2).join(" | "));
  await s.page.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
