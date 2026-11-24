# Asset & library credits

Everything under a license that asks for a notice is listed here. The repo is public, so anything committed is
redistributed: only CC0 / permissively licensed material goes in.

## 3D avatar (My World)

| Item | Source | License | Notes |
|---|---|---|---|
| `assets/avatar3d/man.glb` | "Man" by Quaternius, https://poly.pizza/m/HMnuH5geEG (page lists the license as CC0 1.0) | CC0 1.0 (public domain dedication) | Unmodified download. One skinned mesh, 6 materials (Shirt, Skin, Pants, Eyes, Socks, Hair), animations incl. Man_Idle / Man_Clapping. No attribution required; credited anyway. Also used (still unmodified; recoloured at runtime in memory only) by the experimental 3D court players, `js/engine/court3dPlayers.js`, behind `?players3d=1`. |
| `js/vendor/three-avatar.min.js` | three.js r187 (npm `three@0.187.0`), https://threejs.org | MIT, notice in `js/vendor/THREE_LICENSE.txt` | Tree-shaken subset (renderer, scene, camera, lights, animation mixer, GLTFLoader). Rebuild with `scripts/vendor/build-three.sh`. |

## 3D court players (experimental, not wired into the game)

| Item | Source | License | Notes |
|---|---|---|---|
| `assets/experimental/players/quaternius-clothed-man.glb` | "ClothedMan", Quaternius Animated Man Pack, https://quaternius.com/packs/animatedman.html (file is the FBX→GLB conversion catalogued at `codepawl/quaternius-glb`) | CC0 1.0 (public domain dedication) | Verified 2026-11-24: loads with the repo's r187 GLTFLoader; 1 skinned mesh, 41 bones, 1,544 tris; 9 clips incl. Idle/Walk/Run/Jump. Single mesh + single material, so no separate jersey to recolor — see `assets/experimental/players/README.md`. Prefer the existing `assets/avatar3d/man.glb` (separate Shirt material) for the first court prototype. |

Rules for adding assets: record source URL, license text as shown on the source page, and whether the file was modified.
