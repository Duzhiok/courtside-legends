#!/usr/bin/env node
// Copies ONLY the runtime assets the app actually needs into mobile/www, which is what
// Capacitor packages into the native Android/iOS app. We do NOT point Capacitor at the repo
// root: that would drag node_modules (176 packages), .git, docs/, server/, tests/, and
// scripts/ into the shipped app bundle for no reason (~150MB of dev-only junk vs. the ~11MB
// of actual game assets).
//
// Run this before `npx cap sync`. `npm run mobile:sync` does both in one shot.
import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WWW = join(ROOT, "mobile", "www");

const RUNTIME_ENTRIES = ["index.html", "online.html", "css", "js", "assets"];

rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

for (const entry of RUNTIME_ENTRIES) {
  const src = join(ROOT, entry);
  if (!existsSync(src)) {
    console.warn(`skip (not found): ${entry}`);
    continue;
  }
  cpSync(src, join(WWW, entry), { recursive: true });
  console.log(`copied: ${entry}`);
}

console.log(`\nmobile/www is ready at ${WWW}`);
