# Experimental 3D court players (not wired into the game)

One rigged humanoid per file, behind a future feature flag. Nothing here is loaded by any screen yet.

## `quaternius-clothed-man.glb` (712,980 bytes, sha256 `65212e91…1d5c8`)

- **Source:** "ClothedMan" from Quaternius, Animated Man Pack — https://quaternius.com/packs/animatedman.html
- **License:** CC0 1.0 (public domain; no attribution required, credited anyway). The page links the CC0 deed.
- **File provenance:** this copy is the FBX→GLB conversion catalogued at `codepawl/quaternius-glb`
  (`engine/animatedman__ClothedMan/…glb`, glTF-Transform v4.5.1). Geometry/rig verified identical to the
  catalogue entry (same byte size, same 9 clips). For a production asset, prefer a fresh export from
  Quaternius's original FBX over this third-party conversion.
- **Verified 2026-11-24 (Lychee, Node + the repo's own `js/vendor/three-avatar.min.js`, r187):**
  loads via `GLTFLoader.parseAsync`; 1 skinned mesh, 41 bones, 4,261 verts / 1,544 tris; 9 clips —
  `Idle` (10.00s), `Walk`, `Run`, `Jump`, `Punch`, `Death`, `Working`, `ArmatureAction.001` (0.00s, static),
  `ArmatureAction.002`. Run drives bones (123 tracks; bone quaternion changes over 0.3s).
- **Known limits:**
  - Single mesh, single material (`Texture`, white). There is NO separate jersey/uniform mesh, so the
    `/jersey|uniform/i` material-recolor trick does not work on this file — tinting it tints the skin too.
  - Bind pose is a T-pose with arms along Z (bbox Z ±2.95 looks alarming; normal once an animation plays).
    Armature root scale is 0.69; court code must tune scale/orientation per model.
  - `SkeletonUtils.clone` is NOT in the vendored three bundle — cloning for 10 players needs the addon
    added to `scripts/vendor/build-three.sh`, or the file loaded 10× (browser cache covers it).
  - Low-poly cartoon style (1,544 tris); may clash with the realistic headshot direction — visual call by the user.

## Better candidate already in the repo: `assets/avatar3d/man.glb`

Same author (Quaternius "Man", CC0, already credited in `docs/ASSET_CREDITS.md`), and better for the court
prototype: **6 separate meshes/materials — Shirt, Skin, Pants, Eyes, Socks, Hair** — so jersey recolor by
material name works directly; 11 clips incl. `Man_Idle` / `Man_Walk` / `Man_Run` / `Man_Jump` /
`Man_RunningJump`; 3,967 verts / 1,852 tris; 31 bones. Prefer `man.glb` for the first playable 3D match
unless a second distinct character is needed — then this file is the second body.

## Status (2026-11-24): first playable prototype — `man.glb` on the 3D court, behind a flag

- Enable with `?players3d=1` (or `localStorage["cls.players3d"]="1"`); OFF by default. The capsule figures stay the fallback
  (flag off, WebGL/load failure, 8 s timeout, bad clone). `data-players="glb|capsule"` on `#court-3d-root` shows which is live.
- `js/engine/court3dPlayers.js`: loads `assets/avatar3d/man.glb` once, `SkeletonUtils.clone` ×10, shirt = team colour, shorts =
  darker team colour, skin/hair by player-id hash. Clips: Man_Idle / Man_Run (timeScale by ground speed) / Man_Jump (shooter at
  release, dunk lift-off) / Man_Clapping (scorer; whole scoring side on a three or dunk). CourtView3D keeps authority over
  positions, facing and timing; GameSim is untouched.
- `js/vendor/three-gltf.min.js` (GLTFLoader + SkeletonUtils, 48 KB, built by `scripts/vendor/build-three-gltf.sh` against the
  vendored full `three.module.js` so classes are shared with the court scene; the avatar bundle's private three copy cannot be mixed in).
- QA: `node scripts/qa/players3d.mjs [outDir] [baseUrl]` (desktop 1440 + mobile 390, capsule vs glb).
- Measured under SOFTWARE GL (headless, SwiftShader) — fps is not meaningful there; relative cost is: draw calls 88→106 and
  tris 125k→135k (desktop), 79→101 and 48k→58k (mobile). Real-GPU fps on a Mac is still to be measured by hand.
- Not done: celebrate/jump poses only exercised, not eyeballed; the ball is not attached to a hand; no shadows; the
  second body (`quaternius-clothed-man.glb`) is unused; Mixamo not used (needs an Adobe login + licence check).
