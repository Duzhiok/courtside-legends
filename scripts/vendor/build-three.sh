#!/bin/sh
# Rebuilds js/vendor/three-avatar.min.js: a tree-shaken, minified subset of Three.js (MIT).
# Needs network once (npm). Run from the repo root. Bump V on purpose, never silently.
set -e
V=0.187.0
T=$(mktemp -d)
cp scripts/vendor/three-entry.mjs "$T/"
(cd "$T" && npm i "three@$V" esbuild --no-audit --no-fund --silent \
  && npx esbuild three-entry.mjs --bundle --minify --format=esm --legal-comments=none --outfile=out.js)
cp "$T/out.js" js/vendor/three-avatar.min.js
cp "$T/node_modules/three/LICENSE" js/vendor/THREE_LICENSE.txt
echo "built three@$V -> js/vendor/three-avatar.min.js ($(wc -c < js/vendor/three-avatar.min.js) bytes)"
