# Asset & library credits

Everything under a license that asks for a notice is listed here. The repo is public, so anything committed is
redistributed: only CC0 / permissively licensed material goes in.

## 3D avatar (My World)

| Item | Source | License | Notes |
|---|---|---|---|
| `assets/avatar3d/man.glb` | "Man" by Quaternius, https://poly.pizza/m/HMnuH5geEG (page lists the license as CC0 1.0) | CC0 1.0 (public domain dedication) | Unmodified download. One skinned mesh, 6 materials (Shirt, Skin, Pants, Eyes, Socks, Hair), animations incl. Man_Idle / Man_Clapping. No attribution required; credited anyway. |
| `js/vendor/three-avatar.min.js` | three.js r187 (npm `three@0.187.0`), https://threejs.org | MIT, notice in `js/vendor/THREE_LICENSE.txt` | Tree-shaken subset (renderer, scene, camera, lights, animation mixer, GLTFLoader). Rebuild with `scripts/vendor/build-three.sh`. |

Rules for adding assets: record source URL, license text as shown on the source page, and whether the file was modified.
