// S-P2-5 (CSP, 2026-11-13 global review): the app must have no inline
// <script> and no inline event-handler attributes left, so a
// Content-Security-Policy without 'unsafe-inline' can switch on later. Source
// assertions: without a browser on this VM the markup is the contract.
// Step 1 (handlers + watchdog externalised) landed 2026-11-19 (df18515);
// steps 2+3 (remaining inline modules externalised, Report-Only meta on the
// three entry pages) land here. The ENFORCING CSP meta is still NOT added --
// it needs Mac browser QA of the Report-Only trial first, because a wrong
// policy would blank the whole game on Pages.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

// The Report-Only policy, exactly as drafted in csp-prep-2026-11-19.md §D.
// Single source of truth for the meta tags: the tests below parse each page's
// meta and compare directive by directive, so a hand-edit that drops a host
// (e.g. a photo CDN) turns red here instead of breaking photos on Pages.
const CSP_POLICY = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "https://fonts.gstatic.com"],
  "img-src": [
    "'self'", "data:", "blob:",
    "https://thumb.wikimedia.org", "https://upload.wikimedia.org",
    "https://cdn.nba.com", "https://www.basketball-reference.com",
  ],
  "media-src": ["'self'", "blob:"],
  "connect-src": ["'self'", "ws:", "wss:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

function parsePolicy(content) {
  const out = {};
  for (const part of content.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length) out[tokens[0]] = tokens.slice(1);
  }
  return out;
}

function reportOnlyMeta(html, page) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy-Report-Only" content="([^"]+)" \/>/);
  assert.ok(m, `${page} is missing the Report-Only CSP meta`);
  return m[1];
}

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "vendor") continue;
      walkJs(p, out);
    } else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

// Real HTML event-handler attribute names. Two guards keep property assignments
// and other attributes out: the char before "on" must not be a letter or a dot
// (so tone="...", confirm="1", controls="..." and btn.onclick = ... never match),
// and the value must be quoted (inline attributes always are; a property
// assignment like el.onclick = () => ... never is).
const HANDLER_ATTRS =
  "click|dblclick|auxclick|mousedown|mouseup|mouseover|mousemove|mouseout|mouseenter|mouseleave|contextmenu|change|input|submit|keydown|keyup|keypress|focus|blur|focusin|focusout|error|load|unload|beforeunload|resize|scroll|drag|dragstart|dragend|dragover|dragenter|dragleave|drop|paste|copy|cut|wheel|touchstart|touchend|touchmove|touchcancel|pointerdown|pointerup|pointermove|pointercancel|pointerenter|pointerleave|animationstart|animationend|animationiteration|transitionend|play|pause|ended|abort|canplay|canplaythrough|durationchange|emptied|loadeddata|loadedmetadata|loadstart|progress|ratechange|seeked|seeking|stalled|suspend|timeupdate|volumechange|waiting|toggle|select|search|invalid|reset|formdata|slotchange|cuechange|close|cancel|show|message|popstate|hashchange|securitypolicyviolation";
const INLINE_HANDLER = new RegExp(`(?<![A-Za-z.])on(?:${HANDLER_ATTRS})\\s*=\\s*["']`, "g");

test("S-P2-5: no inline <script> in the entry pages", () => {
  for (const page of ["index.html", "online.html", "preview-3d-match.html", "scripts/spike/avatar3d.html"]) {
    const html = read(page);
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    assert.deepEqual(inline, [], `${page} still has an inline <script> (CSP would block it)`);
  }
});

test("S-P2-5: preview page and spike page load their logic from external modules", () => {
  const preview = read("preview-3d-match.html");
  assert.match(preview, /<script type="module" src="js\/preview3dMatch\.js"><\/script>/);
  assert.ok(existsSync(join(root, "js/preview3dMatch.js")), "js/preview3dMatch.js missing");
  const previewJs = read("js/preview3dMatch.js");
  assert.match(previewJs, /from "\.\/engine\/court3d\.js"/);
  assert.match(previewJs, /from "\.\/match\/presentation\/matchView\.js"/);
  assert.match(previewJs, /playFromStart\(\);/);
  const spike = read("scripts/spike/avatar3d.html");
  assert.match(spike, /<script type="module" src="avatar3d\.js"><\/script>/);
  assert.ok(existsSync(join(root, "scripts/spike/avatar3d.js")), "scripts/spike/avatar3d.js missing");
  assert.match(read("scripts/spike/avatar3d.js"), /mountAvatar3d/);
});

test("S-P2-5: Report-Only CSP meta on the three entry pages, matching the §D draft", () => {
  for (const page of ["index.html", "online.html", "preview-3d-match.html"]) {
    const html = read(page);
    // No enforcing meta yet: Report-Only only. Enforce waits for Mac QA.
    assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"(?!-Report-Only)/,
      `${page} already has an enforcing CSP meta (must wait for Mac QA)`);
    const parsed = parsePolicy(reportOnlyMeta(html, page));
    assert.deepEqual(Object.keys(parsed).sort(), Object.keys(CSP_POLICY).sort(),
      `${page} policy directives differ from the §D draft`);
    for (const [directive, sources] of Object.entries(CSP_POLICY)) {
      assert.deepEqual(parsed[directive], sources, `${page} ${directive} differs from the §D draft`);
    }
  }
});

test("S-P2-5: no inline event-handler attributes in production js or html", () => {
  const files = [...walkJs(join(root, "js")), join(root, "index.html"), join(root, "online.html"),
    join(root, "preview-3d-match.html"), join(root, "scripts/spike/avatar3d.html")];
  const hits = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(INLINE_HANDLER)) {
      const at = src.lastIndexOf("\n", m.index) + 1;
      const line = src.slice(at, src.indexOf("\n", m.index)).trim().slice(0, 120);
      hits.push(`${file.replace(root + "/", "")}: ${line}`);
    }
  }
  assert.deepEqual(hits, [], "inline on*= attributes are blocked by a CSP without 'unsafe-inline'");
});

test("S-P2-5: no javascript: hrefs are ever rendered", () => {
  const files = [...walkJs(join(root, "js")), join(root, "index.html"), join(root, "online.html"),
    join(root, "preview-3d-match.html"), join(root, "scripts/spike/avatar3d.html")];
  const hits = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (/href\s*=\s*["']javascript:/i.test(src)) hits.push(file.replace(root + "/", ""));
  }
  assert.deepEqual(hits, [], "javascript: URLs are blocked by a CSP without 'unsafe-inline'");
});

test("S-P2-5: the boot watchdog is an external file, not an inline script", () => {
  const html = read("index.html");
  assert.match(html, /<script src="js\/bootWatchdog\.js[^"]*"><\/script>/);
  assert.ok(existsSync(join(root, "js/bootWatchdog.js")), "js/bootWatchdog.js missing");
  const watchdog = read("js/bootWatchdog.js");
  assert.match(watchdog, /__rosterBootOk/);
  assert.match(watchdog, /15000/);
  assert.match(watchdog, /load-watchdog/);
});

test("S-P2-5: photoImg marks the fallback with data-fb and no inline handler", async () => {
  const { photoImg } = await import("../js/data/photo.js");
  const html = photoImg({ bref: "doncilu01", name: "Luka", season: 2025, team: "LAL", id: "x" });
  assert.match(html, /data-fb="data:image\/svg\+xml/);
  assert.doesNotMatch(html, /onerror=/);
  // A player with no bref has no remote photo at all: the src IS the generated
  // avatar, so no fallback marker is needed.
  const generated = photoImg({ name: "No One", team: "LAL", id: "y" });
  assert.doesNotMatch(generated, /data-fb=/);
});

test("S-P2-5: court token dims and duel photo removes itself via data-* markers", async () => {
  const { handleImgError } = await import("../js/core/imgErrorFallback.js");
  const token = { src: "https://example.com/a.jpg", dataset: { dimOnError: "" }, style: {} };
  assert.equal(handleImgError(token), true);
  assert.equal(token.style.opacity, "0.2");
  let removed = false;
  const duel = { src: "https://example.com/b.jpg", dataset: { removeOnError: "" }, remove: () => { removed = true; } };
  assert.equal(handleImgError(duel), true);
  assert.equal(removed, true);
  // An unmarked img is left alone.
  assert.equal(handleImgError({ src: "https://example.com/c.jpg", dataset: {} }), false);
  assert.equal(handleImgError(null), false);
  assert.equal(handleImgError({}), false);
});

test("S-P2-5: court and duel templates use data-* markers, not onerror=", () => {
  const court = read("js/engine/court.js");
  assert.match(court, /data-dim-on-error/);
  assert.doesNotMatch(court, /onerror=/);
  const duel = read("js/ui/duelView.js");
  assert.match(duel, /data-remove-on-error/);
  assert.doesNotMatch(duel, /onerror=/);
});

test("S-P2-5: the position select keeps its stopPropagation via property assignment", () => {
  // The inline onclick="event.stopPropagation()" was redundant: the bind site
  // already assigns the same behaviour as a property (CSP-safe), and the row
  // toggle handler already ignores clicks from the select. Both must stay.
  const app = read("js/app.js");
  assert.doesNotMatch(app, /onclick="event\.stopPropagation\(\)"/);
  assert.match(app, /sel\.onclick = \(e\) => e\.stopPropagation\(\);/);
  assert.match(app, /if \(e\.target\.closest\("\.setup-pos-select"\)\) return;/);
});

test("S-P2-5: app boot installs the single img-error listener", () => {
  const app = read("js/app.js");
  assert.match(app, /import \{ installImgErrorFallback \} from "\.\/core\/imgErrorFallback\.js";/);
  assert.match(app, /installImgErrorFallback\(\);/);
});

test("S-P2-5: install is idempotent and dispatches through the capture listener", async () => {
  const { installImgErrorFallback } = await import("../js/core/imgErrorFallback.js");
  const listeners = [];
  const fakeDocument = { addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }) };
  const prev = globalThis.document;
  globalThis.document = fakeDocument;
  try {
    assert.equal(installImgErrorFallback(), true);
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0].type, "error");
    assert.equal(listeners[0].capture, true);
    assert.equal(installImgErrorFallback(), false);
    const img = { tagName: "IMG", src: "https://example.com/d.jpg", dataset: { dimOnError: "" }, style: {} };
    listeners[0].fn({ target: img });
    assert.equal(img.style.opacity, "0.2");
    // Non-imgs never reach the handler.
    listeners[0].fn({ target: { tagName: "DIV" } });
  } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
});
