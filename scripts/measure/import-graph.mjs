/**
 * Static import-graph audit for lazy loading (BACKLOG B77 / B61). Measurement only.
 *
 * Starting from js/app.js it follows static `import`/`export ... from` edges (dynamic import() is a lazy edge and is not followed), then asks:
 * if the modules in <boundary> were loaded on demand, which modules would leave the startup graph (exclusive to them), and which would stay
 * because something else still imports them (the blockers)?
 *
 * Usage: node scripts/measure/import-graph.mjs [boundary,...]   (default: js/ui/reborn/rebornView.js)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import zlib from "node:zlib";

const ROOT = resolve(new URL("../../", import.meta.url).pathname);
const ENTRY = "js/app.js";
const boundary = (process.argv[2] || "js/ui/reborn/rebornView.js").split(",");

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\'"`])\/\/.*$/gm, "$1");
const STATIC = /(?:^|[\n;])\s*(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

const cache = new Map();
function edges(file) {
  if (cache.has(file)) return cache.get(file);
  const src = strip(readFileSync(join(ROOT, file), "utf8"));
  const pick = (re) => [...src.matchAll(re)].map((m) => m[1]).filter((p) => p.startsWith(".")).map((p) => relative(ROOT, resolve(ROOT, dirname(file), p.split("?")[0]))).filter((p) => existsSync(join(ROOT, p)));
  const out = { stat: [...new Set(pick(STATIC))], dyn: [...new Set(pick(DYNAMIC))] };
  cache.set(file, out);
  return out;
}

function reach(start, blocked = new Set()) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || blocked.has(f)) continue;
    seen.add(f);
    for (const d of edges(f).stat) stack.push(d);
  }
  return seen;
}

const sizeOf = (files) => {
  let raw = 0, gz = 0;
  for (const f of files) { const b = readFileSync(join(ROOT, f)); raw += b.length; gz += zlib.gzipSync(b, { level: 6 }).length; }
  return { n: files.length, rawKB: Math.round(raw / 1024), gzKB: Math.round(gz / 1024) };
};

const all = reach(ENTRY);
const rest = reach(ENTRY, new Set(boundary));
const closure = new Set();
for (const b of boundary) for (const f of reach(b)) closure.add(f);
const exclusive = [...all].filter((f) => !rest.has(f));
const shared = [...closure].filter((f) => rest.has(f));

console.log(`startup graph from ${ENTRY}: ${JSON.stringify(sizeOf(all))}`);
console.log(`boundary ${boundary.join(", ")}`);
console.log(`  closure of the boundary:        ${JSON.stringify(sizeOf(closure))}`);
console.log(`  EXCLUSIVE (would leave startup): ${JSON.stringify(sizeOf(exclusive))}`);
console.log(`  shared (stay, still imported elsewhere): ${JSON.stringify(sizeOf(shared))}`);
const byDir = {};
for (const f of exclusive) { const d = dirname(f); byDir[d] = (byDir[d] || 0) + 1; }
console.log("  exclusive by directory:", JSON.stringify(byDir));

// For every shared module: which module OUTSIDE the boundary closure keeps it in the startup graph?
const blockers = new Map();
for (const f of shared) {
  const importers = [...rest].filter((g) => !closure.has(g) && edges(g).stat.includes(f));
  blockers.set(f, importers);
}
const bigShared = [...blockers].map(([f, imps]) => [f, imps, readFileSync(join(ROOT, f)).length]).sort((a, b) => b[2] - a[2]).slice(0, 12);
console.log("  biggest shared modules and who outside Reborn still imports them:");
for (const [f, imps, sz] of bigShared) console.log(`    ${String(Math.round(sz / 1024)).padStart(4)}KB ${f}  <- ${imps.slice(0, 3).join(", ")}${imps.length > 3 ? ` (+${imps.length - 3})` : ""}`);
if (process.env.LIST) { console.log("  exclusive modules:"); for (const f of exclusive.sort()) console.log("    " + f); }
