# Courtside Legends — Avatar 2D First / 3D Ready Roadmap

**Document type:** Product decision & engineering handoff
**Date:** 2026-11-15
**Status:** APPROVED DIRECTION / IMPLEMENTATION PENDING
**Priority:** P1 — 2D Avatar; P3 — external 3D GLB experiment
**Scope:** My World, avatar customization, player profile, avatar portraits
**Platform:** Web first

> Sections 1–10 are the product owner's decision record, saved as received.
> Code Puppy's repository verification is in **Appendix A** (facts only; it does not change any decision).

---

## 1. Executive decision

Courtside Legends adopts a **2D First, 3D Ready** strategy.

The immediate priority is a visually attractive, customizable 2D Avatar experience for the initial release. Existing 3D functionality stays available as an optional preview. Further 3D asset investment and integration are deferred until the 2D Avatar MVP is visually approved and there is evidence of player interest.

### Approved decisions

1. Prioritize a high-quality original 2D character system.
2. Preserve the existing Stylized and Bobblehead 3D assets, scripts, animations and saved appearances.
3. Do not purchase Tripo, Meshy or other third-party 3D services at this stage.
4. Do not delete or overwrite production GLB files.
5. Defer external GLB experimentation to a separate future workstream.
6. Keep GameSim and gameplay balance unchanged.
7. Avoid introducing a second Avatar persistence system.
8. Require real desktop and mobile screenshots for visual acceptance.

**Core principle:** avatar visual quality and customization are product differentiators. Rendering technology is an implementation detail, not the product goal.

---

## 2. Current architecture and known state

Based on earlier repository audits (to be verified against the latest repository before implementation; see Appendix A):

| Component | Known state |
|---|---|
| Avatar appearance configuration | `js/data/avatarLook.js` |
| 3D rendering | `js/ui/avatar3d.js` |
| Stylized assets | `stylized_jersey.glb`, `stylized_street.glb` |
| Bobblehead asset | `bobblehead.glb` |
| Bobblehead generator | `scripts/avatar/build_bobble2.py` |
| Avatar animations | existing shared seven-animation pipeline |
| Avatar portrait | existing 256px capture support |
| My World | existing 3D stage and appearance editor |
| Persistence | existing account-specific appearance data |
| 2D layered renderer | not yet confirmed |
| External GLB integration | not implemented |

### Existing 3D limitations

The production characters are procedural Blender models. Known visual limitations: simplified facial geometry; artificial hair shapes; disconnected-looking limbs; limited material and texture detail; inadequate Bobblehead facial sculpting; a bald hairstyle implemented by material recoloring rather than independent scalp geometry. These are not part of the immediate 2D scope.

---

## 3. Workstream A — 2D Avatar MVP

**Priority P1.** Approved for planning; implementation requires repository audit and file-ownership coordination.

### 3.1 Visual direction

A premium, stylized basketball character for: the My World showcase, avatar customization, personal profile portraits, player identity cards, future cosmetic collections. It should resemble an appealing illustrated collectible, not a flat icon or a screenshot of the procedural 3D model.

### 3.2 Initial asset scope

| Category | MVP scope |
|---|---|
| Base character | 1 original template |
| Skin tones | 5 |
| Hairstyles | 3 |
| Hair colors | 4 |
| Clothing styles | 2 |
| Outfit colorways | 4 |
| Expressions | 3 |
| Poses | 2 |

These are production targets, not existing assets. The first vertical slice validates **one complete character and two appearance combinations** before producing the whole catalog.

### 3.3 Layered rendering architecture

```
Existing Avatar Look
        |
Appearance Normalization
        |
2D Layer Resolver
        |
Canvas 2D / Layered WebP Renderer
        |
        +--> My World
        +--> Avatar Editor
        +--> Personal Portrait
        +--> Player Identity Card
```

Suggested layout (proposals, not verified modules):

```
js/ui/avatar2d/    avatar2dRenderer.js  avatar2dLayers.js  avatar2dPortrait.js  avatar2dView.js
assets/avatar2d/   base/  hair/  outfits/  accessories/  expressions/
```

### 3.4 Asset requirements

Original design; transparent backgrounds on compositing layers; consistent canvas size and alignment anchors; consistent lighting direction and style; no unauthorized team logos or third-party character IP; no baked-in background on customizable layers; stable layer order; cosmetic assets kept separate from gameplay attributes; optimized WebP or PNG; source artwork preserved for revisions. Exact canvas size, export resolution and anchors are finalized after the first visual prototype.

### 3.5 Appearance compatibility

Reuse the existing appearance configuration where practical. Before implementing: inspect the schema; identify existing style / color / hairstyle / clothing / body fields; map values to 2D assets; define safe fallbacks for unsupported combinations; preserve saved appearances; never silently overwrite 3D customization data. Rendering mode is conceptually separate from character identity.

### 3.6 My World integration

After visual approval, 2D is the default presentation and 3D stays reachable through an optional mode selector. Switching modes must not reset the appearance; editing must update the visible preview immediately; My World identity and progression stay intact. No My Home redesign; no change to progression, rewards or gameplay statistics.

### 3.7 First vertical slice acceptance

Required evidence: desktop My World screenshot; mobile (390px) My World screenshot; avatar editor screenshot; two different appearance combinations; personal portrait preview; player identity card preview; reload and account-isolation verification; no unexpected change to existing 3D rendering.

**Stop after the first visual vertical slice for user approval.** Do not mass-produce cosmetic assets before the visual standard is accepted.

---

## 4. Workstream B — External GLB avatar experiment

**Priority P3 — deferred. Status: documented / not started.**

Objective: evaluate whether freely licensed third-party 3D characters can improve visual quality without paid AI 3D generation. An experiment, not a production replacement; the character need not be basketball-related.

| Source | Preferred use | License requirement |
|---|---|---|
| Quaternius | low-poly characters, animated packs | verify the selected asset's CC0 terms |
| Kenney | lightweight stylized characters | verify the selected pack's CC0 terms |
| Poly Pizza | individual GLB models | verify each model's license |
| Sketchfab | wider variety of stylized, rigged characters | verify download rights, attribution, commercial terms |

Selection criteria: clear commercial licensing; original design; GLB/glTF; embedded or bundled textures; reasonable polygon count; separate body and clothing materials; human-like skeleton if animation is wanted; no recognizable protected characters or real-person likenesses. First experiment: visual quality and reliable static rendering over animation compatibility.

Experimental location (never overwrite production GLBs): `assets/avatar3d/experimental/test-character.glb`.

Technical evaluation: triangle count, topology, bounds; material count and texture references; texture resolution and memory; skeleton joints, naming, hierarchy; available clips and compatibility (do **not** assume compatibility with the seven-animation pipeline); draw calls, load success, camera framing; mobile correctness and performance; source, author, license, attribution.

Isolated preview: existing Three.js viewer where practical; load the GLB, auto-fit camera, rotate, show materials and textures, desktop and mobile WebGL, report load failures without touching the saved Avatar. No rigging, retargeting, clothing or skin customization, persistence changes or production deployment.

Stop condition: after real screenshots and metrics, stop for user review; no production replacement or merge into main without approval.

---

## 5. Workstream C — Bobblehead v3

**Priority: deferred. Status (as reported by the product owner): candidate generated, GLB export blocked.**

- Reference images: approved.
- Tripo 3D candidate: generated and visually reviewed (by the product owner).
- Candidate GLB export: requires paid access in the observed Tripo workflow.
- Technical inspection: not performed.
- Production integration: not approved.

The candidate showed substantially improved face, hair, clothing, hands and shoes compared with the procedural Bobblehead, but its reported geometry is about 1.95 million faces and needs optimization before Web deployment.

Decision: preserve the Tripo project and reference images; no subscription now; no further procedural Bobblehead revisions; keep the existing Bobblehead option; revisit after the 2D MVP and initial product validation.

---

## 6. Agent responsibilities

| Agent | Responsibility |
|---|---|
| Code Puppy | 2D architecture, My World integration, shared appearance compatibility |
| Lychee | small, isolated UI components and simple implementation tasks |
| Muse | regression tests, browser QA, bug investigation, visual verification |
| User | final character visual approval and product decisions |

File ownership is confirmed on the coordination board before development. Do not start five parallel workstreams. Code Puppy: implementation and relevant unit tests. Muse: extensive browser QA, regression, desktop/mobile screenshots, defect follow-up. Lychee: no edits to shared engine or persistence modules without explicit ownership.

---

## 7. Product validation

| Metric | Purpose |
|---|---|
| Avatar editor entry rate | interest in personalization |
| Customization completion rate | usability and appeal |
| Average appearance changes | customization depth |
| Return-to-editor rate | continued engagement |
| Cosmetic preview engagement | interest in additional appearances |
| 3D preview usage | interest in future 3D features |

Proposed measurements; no baseline or success thresholds exist. 2D customization engagement is not proof of willingness to pay for 3D cosmetics.

---

## 8. Engineering constraints

1. Web first. 2. GameSim unchanged. 3. Saved appearances stay compatible. 4. No new Avatar persistence system without demonstrated necessity. 5. No destructive asset replacement. 6. No broad design-system rewrite. 7. No new paid 3D dependency. 8. No speculative engine features. 9. Reuse existing components. 10. Visual acceptance requires rendered screenshots. 11. Passing unit tests is not acceptable character art. 12. Preserve 3D as a future rendering option.

---

## 9. Implementation order

**Immediate**
- Audit current Avatar schema and 2D portrait implementation — @CodePuppy (**done, Appendix A**)
- Confirm file ownership and overlapping work — @CodePuppy
- Prepare one original 2D character art prototype — @TBD (**blocking, Appendix A.5**)
- Implement a minimal 2D layered renderer — @CodePuppy
- Integrate the prototype into My World without deleting 3D — @CodePuppy
- Desktop/mobile visual QA — @Muse
- User visual approval — @User

**After visual approval**
- Expand hairstyles, skin tones, clothing, expressions, poses — @TBD
- Integrate the 2D portrait into personal player cards — @CodePuppy
- Validate persistence and account isolation — @Muse
- Evaluate avatar engagement metrics after release/testing — @TBD

**Deferred**
- Download one freely licensed external GLB character; verify license and inspect structure; isolated 3D preview; desktop/mobile WebGL QA; user review; reassess Bobblehead v3 export and production investment.

---

## 10. Final product principle

The first milestone is not a complete 3D character engine. It is a visually compelling Avatar that players enjoy creating, customizing, collecting and showing off. 2D is the immediate delivery path; 3D remains a supported long-term direction; the external GLB experiment is explicitly deferred until the 2D MVP reaches its visual acceptance gate.

---

# Appendix A — Repository verification (Code Puppy, base `origin/main` `fd51b82`)

Facts only. Read-only audit; no production file was changed.

## A.1 Appearance schema (verified)
`js/data/avatarLook.js`: `sanitizeLook` whitelists seven fields. Real names differ from the illustrative names used in discussion:

| Concept | Real field | Values today |
|---|---|---|
| skin tone | `skin` | `light warm tan brown deep` (5) |
| hair colour | `hair` | `black brown blond red gray` (5) |
| hairstyle | `style` | `short`, `shaved` (2) |
| outfit colourway | `outfit` | 9 ids; **5 are shop-gated** (`shop` field: champion, midnight, crimson, street, vintage) |
| garment type | `cut` | `jersey`, `street` |
| build | `body` | `standard broad slim` |
| 3D figure | `figure` | `stylized`, `bobblehead` (meaningful for 3D only) |

Persistence: `account.avatar` (accounts), `cls_guest_avatar_v1` (guests), via `readLook`/`saveLook`. `saveLook` rewrites `account.avatar` wholesale, so **a 2D/3D mode switch must not be stored there**.

## A.2 What already exists
- **No 2D layered renderer** on main (no `avatar2d` path, no layered code).
- 2D pieces that do exist: preset SVG busts (`js/ui/avatarPortraitArt.js`), the Legend Duel procedural SVG sprite (`js/ui/duelSprites.js`, 30–40px, leave untouched).
- Portrait: `account.avatarPortrait` with `source: preset | 3d | photo`; accepts only small **raster** data URLs (≤ 40,000 chars), never SVG. A 2D source needs an explicit new value and a sanitizer change. `js/ui/portraitFor.js` is the single exit for every surface (account chip, My World identity card, My Home, Duel challenger).

## A.3 Integration seam (verified)
`js/ui/myWorldScreen.js:54` takes an injectable `mountAvatar` (default `mountAvatar3d`) returning a handle with `capturePortrait()` and `dispose()` (and setLook for edits). A 2D renderer that returns the same handle can be mounted without restructuring My World. Today's 3D failure path already falls back to a static portrait.

## A.4 Risks to design for
1. **Shop-gated outfits**: 5 of 9 colourways are sold; removing any would make a purchase disappear. Clothing layers must be **tintable** (greyscale layer + canvas colour), not one PNG per colour.
2. New hairstyle ids (e.g. a curly style) need adding to `HAIR_STYLES`; 3D has no such mesh and must map to `short`.
3. Expressions / poses: keep as view state, not persisted (YAGNI) in the first slice.
4. Existing browser QA scripts assume a 3D stage in My World; they need updating when 2D becomes default.
5. 2D default removes the WebGL dependency on mobile (a benefit).

## A.5 Blocker and open decisions
- **Art source.** This environment cannot generate images. The layered art must come from the product owner's image tool (anchored on `avatar-p3-kit/reference-v2/front.jpg`), cleaned in Krita/GIMP. Code Puppy provides a layer spec (canvas, anchors, order, which layers are greyscale-tinted, how "shaved" is handled). Hand-written SVG would be platform-validation only, not visual acceptance.
- **"Player identity card".** No player-owned card exists (`playerCard.js` is NBA-player cards only). Surfaces showing the player's portrait today are the My World identity card, account chip, My Home and Duel challenger card, all via `portraitFor`. Whether a *new* "my card" is wanted is undecided and is out of the first slice unless the owner says otherwise.
- **Bobblehead v3 status (section 5).** Reported by the product owner. Code Puppy has not seen the Tripo candidate: `avatar-p3-kit/candidate/` is empty and no candidate GLB exists on this machine.

## A.6 Proposed ownership (not yet claimed on the board)
New: `js/ui/avatar2d/*`, `assets/avatar2d/*`. Small edits: `js/ui/myWorldScreen.js` (renderer selection), `js/data/avatarLook.js` (new hairstyle ids), `js/data/avatarPortrait.js` (`2d` source). Not touched: GLBs, `avatar3d.js` behaviour, GameSim, `account.avatar` shape beyond whitelisted ids, My Home.
