#!/usr/bin/env node
// Renders the app icon + launch splash as flat PNGs from hand-built SVG, using the game's
// own brand palette (css/style.css :root vars). Deliberately NOT a photo of a real player/
// moment: docs/MOBILE_APPS.md already flags real NBA player photos/likeness as a right-of-
// publicity risk for a PUBLIC store listing.
//
// Usage: node scripts/mobile/render-icon.mjs
// Requires playwright-core + a local Chromium (already a devDependency).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT_DIR = join(ROOT, "resources");
mkdirSync(OUT_DIR, { recursive: true });

// Brand palette, lifted straight from css/style.css :root so the icon doesn't invent its own
// off-brand colors.
const COURT = "#1a3a2a";
const COURT_DEEP = "#0f1c14"; // == --ink
const WOOD = "#c9a66b";
const ACCENT = "#e85d04";
const PAPER = "#f3efe4";

/**
 * Design note (v3): the first two attempts tried a human dunking silhouette -- attempt #1
 * (one freehand bezier blob) rendered as an unrecognizable cloud, attempt #2 (capsule-limb
 * stick figure) was geometrically sound but still didn't read as a person once rendered.
 * Rather than keep guessing coordinates blind, dropped the figure entirely and leaned into
 * "ball bursting through the net" -- the single most recognizable basketball highlight image
 * there is. It's achievable with shapes that are easy to get right, it scales down to a
 * 40x40 home-screen icon without turning to noise (a thin human figure would not survive
 * that shrink), and it sidesteps a subtler legal wrinkle on top of the real-player-photo risk
 * already documented in docs/MOBILE_APPS.md: a dunking human silhouette on a basketball app
 * icon risks echoing the NBA's own trademarked "Logo Man" dribbling silhouette. A ball-and-
 * net mark has none of that baggage.
 */
function netGroup() {
  const rim = { cx: 512, cy: 470, rx: 190, ry: 36 };
  const netBottom = rim.cy + 230;
  const strands = [-150, -100, -50, 0, 50, 100, 150];
  const netLines = strands
    .map((dx) => {
      const x1 = rim.cx + dx * 0.95;
      const x2 = rim.cx + dx * 0.4;
      return (
        '<path d="M ' + x1 + " " + (rim.cy + 6) +
        " C " + (x1 - dx * 0.1) + " " + (rim.cy + 110) +
        " " + (x2 + dx * 0.1) + " " + (rim.cy + 170) +
        " " + x2 + " " + netBottom +
        '" fill="none" stroke="' + PAPER + '" stroke-width="7" opacity="0.75"/>'
      );
    })
    .join("\n    ");
  const netRungs = [0.4, 0.72]
    .map((t) => {
      const y = rim.cy + 6 + (netBottom - rim.cy - 6) * t;
      const w = rim.rx * 2 * (1 - 0.45 * t);
      return (
        '<ellipse cx="' + rim.cx + '" cy="' + y + '" rx="' + (w / 2) + '" ry="' + (w / 10) +
        '" fill="none" stroke="' + PAPER + '" stroke-width="5" opacity="0.55"/>'
      );
    })
    .join("\n    ");
  return (
    '<rect x="' + (rim.cx - 130) + '" y="' + (rim.cy - 320) + '" width="260" height="230" rx="10" ' +
    'fill="none" stroke="' + PAPER + '" stroke-width="14" opacity="0.92"/>\n    ' +
    netLines + "\n    " + netRungs + "\n    " +
    '<ellipse cx="' + rim.cx + '" cy="' + rim.cy + '" rx="' + rim.rx + '" ry="' + rim.ry +
    '" fill="none" stroke="' + ACCENT + '" stroke-width="26"/>'
  );
}

function ballGroup() {
  const cx = 512, cy = 300, r = 150;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r + 36}" fill="${PAPER}" opacity="0.1"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}"/>
    <g stroke="${COURT_DEEP}" stroke-width="12" fill="none" opacity="0.85">
      <path d="M ${cx} ${cy - r + 14} L ${cx} ${cy + r - 14}"/>
      <path d="M ${cx - r + 14} ${cy} L ${cx + r - 14} ${cy}"/>
      <path d="M ${cx - r + 36} ${cy - 92} C ${cx - 60} ${cy - 34} ${cx + 60} ${cy - 34} ${cx + r - 36} ${cy - 92}"/>
      <path d="M ${cx - r + 36} ${cy + 92} C ${cx - 60} ${cy + 34} ${cx + 60} ${cy + 34} ${cx + r - 36} ${cy + 92}"/>
    </g>
  `;
}

function impactBurst() {
  // Short radiating lines around the ball to read as "just slammed through," plus two long
  // diagonal speed trails suggesting the drive that got it there.
  const cx = 512, cy = 300;
  const spokes = [200, 235, 270, 305, 340, 15, 50, 85, 120, 155]
    .map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const r1 = 196, r2 = 236;
      const x1 = (cx + Math.cos(rad) * r1).toFixed(1);
      const y1 = (cy + Math.sin(rad) * r1).toFixed(1);
      const x2 = (cx + Math.cos(rad) * r2).toFixed(1);
      const y2 = (cy + Math.sin(rad) * r2).toFixed(1);
      return (
        '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
        '" stroke="' + PAPER + '" stroke-width="10" stroke-linecap="round" opacity="0.6"/>'
      );
    })
    .join("\n    ");
  return `
    ${spokes}
    <g stroke="${PAPER}" stroke-width="16" stroke-linecap="round" opacity="0.32" fill="none">
      <path d="M 90 620 C 190 600 260 560 320 480"/>
      <path d="M 70 730 C 180 712 250 670 310 600"/>
    </g>
  `;
}

function iconSvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="glow" cx="50%" cy="36%" r="65%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.5"/>
      <stop offset="55%" stop-color="${COURT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COURT}"/>
      <stop offset="100%" stop-color="${COURT_DEEP}"/>
    </linearGradient>
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>

  <!-- parquet floor band -->
  <rect x="0" y="930" width="1024" height="94" fill="${WOOD}"/>
  <g stroke="${COURT_DEEP}" stroke-width="4" opacity="0.35">
    <line x1="0" y1="962" x2="1024" y2="962"/>
    <line x1="0" y1="994" x2="1024" y2="994"/>
    <line x1="128" y1="930" x2="128" y2="1024"/>
    <line x1="384" y1="930" x2="384" y2="1024"/>
    <line x1="640" y1="930" x2="640" y2="1024"/>
    <line x1="896" y1="930" x2="896" y2="1024"/>
  </g>

  ${impactBurst()}
  ${netGroup()}
  ${ballGroup()}
</svg>`.trim();
}

function splashSvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 2732 2732">
  <defs>
    <radialGradient id="glow" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="${COURT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COURT}"/>
      <stop offset="100%" stop-color="${COURT_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="2732" height="2732" fill="url(#bg)"/>
  <rect width="2732" height="2732" fill="url(#glow)"/>

  <!-- simple centered mark: ball through a rim, kept inside the safe-area every OS crops to -->
  <g transform="translate(1366 1180)">
    <ellipse cx="0" cy="170" rx="210" ry="46" fill="none" stroke="${ACCENT}" stroke-width="30"/>
    <circle cx="0" cy="0" r="140" fill="${ACCENT}"/>
    <g stroke="${COURT_DEEP}" stroke-width="12" fill="none" opacity="0.85">
      <path d="M 0 -140 L 0 140"/>
      <path d="M -140 0 L 140 0"/>
      <path d="M -100 -98 C -45 -50 45 -50 100 -98"/>
      <path d="M -100 98 C -45 50 45 50 100 98"/>
    </g>
  </g>

  <text x="1366" y="1620" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800"
        font-size="140" letter-spacing="4" fill="${PAPER}">COURTSIDE LEGENDS</text>
  <text x="1366" y="1710" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600"
        font-size="76" fill="${PAPER}" opacity="0.85">场边传奇</text>
</svg>`.trim();
}

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

async function renderPng(svg, size, outPath) {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;}</style></head>` +
      `<body>${svg}</body></html>`,
    { waitUntil: "load" }
  );
  const buf = await page.screenshot({ type: "png" });
  writeFileSync(outPath, buf);
  await browser.close();
  console.log(`wrote ${outPath} (${size}x${size})`);
}

await renderPng(iconSvg(1024), 1024, join(OUT_DIR, "icon.png"));
await renderPng(splashSvg(2732), 2732, join(OUT_DIR, "splash.png"));
