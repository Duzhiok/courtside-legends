#!/bin/sh
# Rebuilds js/vendor/three-gltf.min.js: GLTFLoader + SkeletonUtils.clone (MIT) importing the vendored ./three.module.js.
# Needs network once (npm). Run from the repo root. Keep V equal to the vendored three.module.js revision.
set -e
V=0.187.0
ROOT=$(pwd)
T=$(mktemp -d)
cp scripts/vendor/three-gltf-entry.mjs "$T/"
cat > "$T/build.mjs" <<'JS'
import { build } from "esbuild";
await build({
  entryPoints: ["three-gltf-entry.mjs"], bundle: true, minify: true, format: "esm", legalComments: "none", outfile: "out.js",
  // Only the bare "three" specifier stays external (-> the vendored full build); addons are bundled.
  plugins: [{ name: "three-ext", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: "./three.module.js", external: true })); } }],
});
JS
(cd "$T" && npm i "three@$V" esbuild --no-audit --no-fund --silent && node build.mjs)
cp "$T/out.js" "$ROOT/js/vendor/three-gltf.min.js"
echo "built three-gltf@$V -> js/vendor/three-gltf.min.js ($(wc -c < js/vendor/three-gltf.min.js) bytes)"
