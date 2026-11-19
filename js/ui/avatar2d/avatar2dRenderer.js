/**
 * Layered Canvas 2D avatar (Avatar 2D First). Same mount contract as js/ui/avatar3d.js, so My World can mount either one:
 *
 *   mountAvatar2d(container, { look }) -> Promise<{ setLook, capturePortrait, dispose, ... }>
 *
 * Reads the existing look only (see avatar2dLayers.js); stores nothing. A look it cannot draw (no art loaded) rejects the mount,
 * which My World already treats as "keep the static portrait". Art files live in assets/avatar2d/ (see the art spec).
 * `placeholders: true` fills missing files with engineering placeholders; that mode is for QA of the renderer, not for players.
 */
import { CANVAS, resolveLayers } from "./avatar2dLayers.js";
import { paintJerseyNumber } from "./avatar2dJersey.js";
import { placeholderImage } from "./avatar2dPlaceholder.js";
import { applyBodyShape, figureScale, portraitCropFor, shapeFromLook } from "./avatar2dShape.js";
import { MAX_PORTRAIT_CHARS } from "../../data/avatarPortrait.js";

export const PORTRAIT_PX = 256;
const PORTRAIT_QUALITIES = Object.freeze([0.82, 0.7, 0.6, 0.5]);   // first one that fits the stored-portrait limit wins
export const LOAD_TIMEOUT_MS = 6000;
const DEV_FLAG = "2d-proto";
const ART_BASE = new URL("../../../assets/avatar2d/", import.meta.url);

const defaultCreateCanvas = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/** Load one art file. Rejects on error or timeout (a hung request must not hang the editor). */
function loadArtImage(file, timeoutMs = LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error(`avatar2d: ${file} timed out`)), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error(`avatar2d: ${file} failed to load`)); };
    img.src = new URL(file, ART_BASE).href;
  });
}

/**
 * Draw `layers` bottom to top onto `ctx` (CANVAS-sized). A tinted layer is greyscale art multiplied by its colour and clipped
 * back to its own alpha, so shading survives and nothing bleeds outside the shape. A layer with no image is skipped and reported.
 * @returns {{ drawn: string[], missing: string[] }}
 */
export function paintLayers(ctx, layers, imageFor, createCanvas) {
  const { width, height } = CANVAS;
  ctx.clearRect(0, 0, width, height);
  const drawn = [];
  const missing = [];
  let scratch = null;
  for (const layer of layers) {
    const img = imageFor(layer);
    if (!img) { missing.push(layer.role); continue; }
    if (layer.tint) {
      scratch ||= createCanvas(width, height);
      const s = scratch.getContext("2d");
      s.globalCompositeOperation = "source-over";
      s.clearRect(0, 0, width, height);
      s.drawImage(img, 0, 0, width, height);
      s.globalCompositeOperation = "multiply";
      s.fillStyle = layer.tint;
      s.fillRect(0, 0, width, height);
      s.globalCompositeOperation = "destination-in";
      s.drawImage(img, 0, 0, width, height);
      ctx.drawImage(scratch, 0, 0);
    } else {
      ctx.drawImage(img, 0, 0, width, height);
    }
    drawn.push(layer.role);
  }
  return { drawn, missing };
}

export async function mountAvatar2d(container, {
  look,
  jersey = null,   // a worn jersey (avatar2dJersey.jerseyKit): colours + number on the same cut, never part of the look
  placeholders = false,
  createCanvas = defaultCreateCanvas,
  loadImage = loadArtImage,
} = {}) {
  const art = createCanvas(CANVAS.width, CANVAS.height);        // full-resolution composition; the portrait is cut from it
  const canvas = createCanvas(CANVAS.width / 2, CANVAS.height / 2);
  canvas.className = "avatar2d-canvas";
  canvas.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
  canvas.dataset.renderer = "2d";
  const shaped = createCanvas(CANVAS.width, CANVAS.height);     // `art` re-drawn with the build (every figure goes through it: the stage fit and the height scale all of them)
  const state = { disposed: false, token: 0, look: null, jersey: null, source: art, shape: null, report: { drawn: [], missing: [] }, cut: null, fellBack: false, painted: false };
  const want = { look, jersey };                                  // the latest requested look + jersey; a render always reads these, so a quick look-then-jersey change cannot paint a stale mix
  const cache = new Map();                                       // file -> Promise<image|null>

  const imageFor = (layer) => {
    if (!cache.has(layer.file)) {
      cache.set(layer.file, loadImage(layer.file).catch(() => (placeholders ? placeholderImage(layer, createCanvas) : null)));
    }
    return cache.get(layer.file);
  };

  /** Resolves true when the look is on screen, false when it was superseded or nothing could be drawn (previous paint stays). */
  async function render() {
    const resolved = resolveLayers(want.look, want.jersey);
    const token = ++state.token;
    const images = new Map(await Promise.all(resolved.layers.map(async (layer) => [layer.file, await imageFor(layer)])));
    if (state.disposed || token !== state.token) return false;   // a newer look won the race
    const report = paintLayers(art.getContext("2d"), resolved.layers, (layer) => images.get(layer.file), createCanvas);
    if (!report.drawn.length) return false;                      // no art at all: keep whatever was there
    if (resolved.jersey) paintJerseyNumber(art.getContext("2d"), resolved.jersey);   // after every layer: the chest is clear of hair and arms
    const inUse = new Set(resolved.layers.map((layer) => layer.file));
    for (const file of [...cache.keys()]) if (!inUse.has(file)) cache.delete(file);   // release decoded layers the look no longer needs
    const shape = shapeFromLook(resolved.look);
    applyBodyShape(art, shaped, shape);                          // after the jersey number: it belongs to the chest and scales with it
    const source = shaped;                                       // what is on screen and what the portrait is cut from
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(source, 0, 0, canvas.width, canvas.height);
    Object.assign(state, { source, shape, look: resolved.look, jersey: resolved.jersey, report, cut: resolved.cut, fellBack: resolved.fellBack, styleFellBack: resolved.styleFellBack, painted: true });
    canvas.dataset.look = JSON.stringify(resolved.look);
    canvas.dataset.layers = report.drawn.join(",");
    canvas.dataset.shape = JSON.stringify({ ...shape, scale: figureScale(shape) });   // `scale` = the figure's drawing scale about its feet (QA reads it)
    if (resolved.jersey) canvas.dataset.jersey = JSON.stringify({ number: resolved.jersey.number, simplified: resolved.jersey.simplified }); else delete canvas.dataset.jersey;
    return true;
  }

  if (!(await render())) throw new Error("avatar2d: no art could be drawn");
  container.appendChild(canvas);

  return {
    canvas,
    renderer: "2d",
    rotationY: () => 0,
    setLook: (next) => { want.look = next; return render(); },
    /** Wear (a jerseyKit) or take off (null) a jersey without touching the look. */
    setJersey: (kit) => { want.jersey = kit || null; return render(); },
    /**
     * @returns {string|null} a 256px JPEG data URL of the head and shoulders that fits the stored-portrait limit (quality steps
     * down until it does), or null if it could not be drawn
     */
    capturePortrait: (bg = "#14281d") => {
      if (state.disposed || !state.painted) return null;
      try {
        const out = createCanvas(PORTRAIT_PX, PORTRAIT_PX);
        const g = out.getContext("2d");
        g.fillStyle = bg;
        g.fillRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
        const { x, y, size } = portraitCropFor(state.shape);   // follows the height, so a tall or short figure gets the same head-and-shoulders framing
        g.drawImage(state.source, x, y, size, size, 0, 0, PORTRAIT_PX, PORTRAIT_PX);
        for (const quality of PORTRAIT_QUALITIES) {
          const url = out.toDataURL("image/jpeg", quality);
          if (url.length <= MAX_PORTRAIT_CHARS) return url;
        }
        return null;
      } catch {
        return null;
      }
    },
    look: () => ({ ...state.look }),
    /** 2D has no animation clips: previews report "not played" so My World leaves the action buttons inert. */
    playAction: () => false,
    playIdle: () => false,
    action: () => "idle",
    setYaw: () => {},
    inspect: () => ({ renderer: "2d", shape: state.shape ? { ...state.shape } : null, jersey: state.jersey ? { number: state.jersey.number, simplified: state.jersey.simplified } : null, cut: state.cut, fellBack: state.fellBack, styleFellBack: state.styleFellBack, layers: [...state.report.drawn], missing: [...state.report.missing], placeholders, cached: cache.size }),
    dispose: () => {
      if (state.disposed) return;
      state.disposed = true;
      canvas.remove?.();
      cache.clear();
    },
  };
}

/**
 * Which renderer a screen mounts. 2D is the default (user-approved); 3D stays available as an optional preview, via
 * `?avatar=3d` or the My World toggle (which saves `pref`, see js/ui/avatarMount.js). `?avatar=2d-proto` is QA of the renderer
 * on placeholder art and never a player option. The URL wins over `pref`, `pref` wins over the default; junk in either is ignored.
 * @param {string} search location.search
 * @param {"2d"|"3d"|null} [pref] the device's saved choice
 * @returns {"3d"|"2d"|"2d-proto"}
 */
const DEFAULT_RENDERER = "2d";
export function avatarRenderer(search, pref = null) {
  const choice = /[?&]avatar=([a-z0-9-]+)/.exec(String(search || ""))?.[1];
  if (choice === "3d" || choice === "2d") return choice;
  if (choice === DEV_FLAG) return "2d-proto";
  return pref === "3d" || pref === "2d" ? pref : DEFAULT_RENDERER;
}
export const mountAvatar2dProto = (container, opts) => mountAvatar2d(container, { ...opts, placeholders: true });
