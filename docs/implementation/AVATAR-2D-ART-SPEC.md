# Avatar 2D — Art Asset Specification v1.0 (Phase 1A, documentation only)

**Status:** DRAFT FOR USER REVIEW. No renderer, no art, no placeholder art and no save-data change accompanies this document.
**Style anchor:** `avatar-p3-kit/reference-v2/front.jpg` (approved Bobblehead reference; also `side.jpg`, `back.jpg`).
**Look schema (unchanged, no new persistent field):** `skin hair outfit style body figure cut` (`js/data/avatarLook.js`, base `fd51b82`).
**Companion:** `AVATAR-2D-PROMPT-PACKAGE.md` (generation prompts and manual cleanup steps).

> Target: a premium illustrated collectible character. Not a flat icon, not procedural vector art, not a screenshot of the 3D model.
> Automatic background removal is **not** a way to produce these layers: hidden regions have no pixels (§8).

---

## 1. What was measured (inputs to every number below)

| Input | Measurement | Method |
|---|---|---|
| Reference figure box (front) | 1024² image; figure x 260–763, y 23–971 → **504 × 949 px**, centred on x 511.5 | pixel scan of `front.jpg` (background `#d5d5d5`) |
| Reference proportions | head+hair to neck = **41.4 %** of figure height (side 42.6 %, back 43.2 %); figure width/height = 0.53 | same scan |
| Landmarks inside the figure (eyes, brows, mouth, hems) | read by eye from `front.jpg`, **±10 reference px (≈ ±15 canvas px)** | not pixel-exact; the master art overrides them |
| My World stage on screen | desktop **703 × 648** (1.08:1), phone 390-wide **314 × 470** (0.67:1) | measured in the browser at 1440×900 and 390×844 |
| Smallest portrait uses | account chip ~40 px, Duel challenger 120 px, My World identity card, My Home | existing `portraitFor` surfaces |

## 2. Canvas, coordinate system and anchors

**Canvas: 1024 × 1536 px (2:3), RGBA.** Why: the phone stage is 0.67:1, i.e. exactly 2:3; the desktop stage is wider and shows the same art letter-boxed inside the locker-room scene. A 470 px-tall phone stage on a 3× display needs ≈ 1410 px of height, so 1536 avoids upscaling on phones and desktop. (Decision D1 below covers memory.)

Origin top-left, x right, y down. All layers share this canvas; the renderer applies **no per-layer offset**.

Scale from the reference: s = 1392 / 949 = **1.467**. Anchors (indicative = landmark read by eye):

| Anchor | Canvas value |
|---|---|
| Centre axis | **x = 512** (figure is left/right symmetric about it) |
| Figure top (highest hair/head pixel) | **y ≥ 72** (top safe margin) |
| Foot baseline (soles) | **y = 1464** (bottom safe margin 72) |
| Figure box | x ≈ 143–881, y 72–1464 (arms slightly away from the body, as in the reference) |
| Chin / neck narrowest | y ≈ 648 (head+hair occupy y 72–648: 41.4 %) |
| Brows / eyes / mouth *(indicative)* | y ≈ 368 / 458 / 555; eyes at x ≈ 512 ± 105 |
| Shoulder line *(indicative)* | y ≈ 691 |
| Jersey hem / shorts hem / sock top *(indicative)* | y ≈ 936 / 1138 / 1256 |
| Safe margin | ≥ 72 px transparent on every side, including hair tips and shoes |

Head rule: the **bald skull must fit inside the head+hair envelope** y 72–648 with the hair adding at most ~20 % of head height on top. Hair silhouettes must stay inside the safe margin.

Poses/expressions in the first batch: **one** front pose (neutral, arms relaxed) and **one** expression (the reference's closed-mouth smile). More come later as extra files, never as new look fields.

## 3. Layer hierarchy and compositing order (bottom → top)

Folder layout (`assets/avatar2d/`, proposed; keys are the existing look ids):

```
assets/avatar2d/
  base/       body.png  shoes.png  face.png  brows.png
  hair/<style>/  back.png  front.png            # style = short (shaved = no files)
  outfits/<cut>/ bottom.png  bottom_trim.png  top.png  top_trim.png     # cut = jersey | street
```

| # | Layer file | Colour source | Purpose |
|---|---|---|---|
| 1 | `hair/<style>/back.png` | hair colour (tint) | hair behind head/neck. Absent for Shaved |
| 2 | `base/body.png` | skin colour (tint) | complete bald head, ears, neck, torso, arms, hands, legs |
| 3 | `base/shoes.png` | none (final colour) | socks + sneakers |
| 4 | `outfits/<cut>/bottom.png` | `Pants` | shorts (jersey) / joggers (street) |
| 5 | `outfits/<cut>/bottom_trim.png` | `Trim` ink | hems, side stripes, cuffs |
| 6 | `outfits/<cut>/top.png` | `Shirt` | sleeveless jersey / short-sleeve tee |
| 7 | `outfits/<cut>/top_trim.png` | `Trim` ink | neck/armhole piping, hem band, **chest number** (jersey) / collar rib (street) |
| 8 | `base/face.png` | none | eyes, nose, mouth, blush, ears' inner shading |
| 9 | `base/brows.png` | **hair colour, always** | eyebrows (also when Shaved) |
| 10 | `hair/<style>/front.png` | hair colour (tint) | fringe, sideburns, hair over ears/forehead. Absent for Shaved |

**Cut-specific differences.** Jersey: sleeveless, shorts end above the knee, socks visible. Street: tee covers the upper arms (sleeves occlude skin), joggers cover the legs to the ankle and sit over the shoe tops, no socks visible. Therefore `body.png` must be complete under both.
**Dependency note (for the later renderer, not built now):** hair files are keyed by style, not shared, so a new style is only new files.

## 4. Full body and scalp geometry
- `body.png` is a **neutral, smooth vinyl-toy body**: no anatomical detail, no clothing, no underwear shapes; surface painted as one continuous shaded skin.
- The head is a **finished bald skull**: complete crown, temples, back of head, ears. No hairline, no cap edge, no seam, no second surface. This is deliberate: it is the opposite of the 3D model, whose scalp is a separate recoloured mesh (the visible seam).
- Hands have fingers (reference: relaxed, slightly curled). Ears sit at the eye line.
- **Acceptance check:** render Shaved on all five skin tones; the forehead and temples must read as skin with no edge.

## 5. Hair
- `short` = a **short, neat cut with a clear silhouette** (rounded, readable at 40 px). It is *not* the reference's curls. The curls are the next art batch and will arrive as a **new `style` id**; per decision, no `curly` id is added in this slice, so old clients never see an unknown value.
- `shaved` = no hair layers; eyebrows remain (hair colour).
- Hair strands/edges are painted opaque with clean alpha; no baked shadow plate on the neck or forehead (those are in `body.png`'s shading).
- Open decision D2 (below): whether `short` should echo the reference's curls.

## 6. Recolouring (masks)
Method: **neutral-greyscale tint layers**. The renderer multiplies the layer by its colour and clips back to the layer's own alpha. It reads colours from the same `lookColors` table the 3D figure uses (skin 5, hair 5, outfit 9 with `Shirt/Pants/Trim`).

| Rule | Value |
|---|---|
| Tint layers | R = G = B within ±2 (pure grey), no hue, no baked colour |
| Highlight ceiling | lightest areas **≥ 235** (multiply cannot brighten; light skin `#f1c9a5`, blond `#c9a23a`) |
| Shadow floor | darkest areas **≥ 80** (dark skin `#5b3a22`, black hair/shirt `#1b1b1b`) |
| Untinted layers | `shoes`, `face` carry final colours; blush/lip colour must read on **all five** skin tones |
| Eyebrows | tinted with the *chosen hair colour* even when Shaved |
| Trim ink | `Trim` colour from `lookColors` (light or dark chosen by contrast with the shirt) |

**Named risk R1:** multiplying by near-black (black hair, `street` black tee, `midnight` navy) leaves very little visible shading (e.g. grey 235 → ~25, grey 80 → ~8). Acceptance test: view black hair and the black street tee at 100 % and at the 256 px portrait; folds and strands must stay legible. Mitigation if they fail: add untinted highlight overlays (`*_hl.png`, white at low alpha) for hair and tops only. Not built unless the test fails.

## 7. Outfit colours and shop compatibility
- All **nine** colourways (`forest orange royal white champion midnight crimson street vintage`) are served by the **same** greyscale layers; none needs its own file.
- Five are shop-gated (`champion midnight crimson street vintage`). Their purchase/lock state is read from the existing shop data and is independent of art. A colourway whose cut art is missing (e.g. `street` before street art exists) **draws the jersey cut as a clearly reported fallback and stays owned/unlocked**; it is never re-locked and the saved look is never rewritten.
- `body` presets (standard/broad/slim) and `figure` (stylized/bobblehead) are **ignored by 2D in this slice** (stored values untouched). Broad/slim bases would be future body files.

## 8. Occlusion, seams and anti-aliasing (the hidden-region rule)
A single picture has **no pixels** under clothes or hair. Every layer must therefore be **painted complete under whatever covers it**:
- `body.png`: full torso, shoulders, upper arms, legs and ankles under both outfit cuts; full skull and ears under hair; neck behind collars.
- `hair/*/back.png`: the area behind the neck and ears.
- Clothing overlaps skin by **≥ 4 px** at every edge; hair overlaps forehead/ears similarly. No gap may appear when any layer is removed or swapped.
- Edge pixels use the layer's **own colour** (straight RGB + clean alpha): no white or black halo, no matte fringe, no baked background or drop shadow.
- Layers are pixel-aligned by construction: author in one document of 1024 × 1536 and export every layer from it; never nudge a layer when exporting.

## 9. Export conventions
- **PNG, RGBA, 8-bit, sRGB**, exactly 1024 × 1536, fully transparent background (border pixels alpha 0).
- Weight targets: ≤ ~400 KB per layer, whole first set ≤ ~3 MB. WebP (lossless/alpha) may be added later under the same file stems; PNG masters are always kept.
- Source files (KRA/PSD) and the generation prompts are kept with the project (outside the shipped folder).
- Naming: exactly the table in §3; lowercase, underscores, no spaces.

## 10. Portrait at 256 px
Crop a **square 720 × 720 at x = 152, y = 36** (covers the hair top at y 72, the full head and the shoulder line at ~691; ~110 px of side margin around the ~500 px-wide head) and downscale to **256 × 256**, JPEG. Constraints:
- the whole face and hair stay inside the square with margin; eyes in the upper-middle third;
- stored portraits must stay under the existing **40,000-character** data-URL limit: the renderer will step JPEG quality down until it fits (earlier 3D captures were ~8–12 K chars; detailed illustration may be larger, so this is checked, not assumed);
- the portrait must stay recognisable at the account chip (~40 px) and the Duel card (120 px).

## 11. Validation criteria

Run `node scripts/avatar/validate-avatar2d.mjs [assets/avatar2d]` (pure Node): it checks V1, V2, V3, V4, V6 and V10 below, exits 1 on any FAIL. V5, V7, V8, V9 and V11 stay with human review (V9 is a renderer property).
| # | Check | Pass |
|---|---|---|
| V1 | file set equals §3 list for the supported cuts/styles, no extras | exact |
| V2 | dimensions 1024 × 1536, PNG RGBA 8-bit | exact |
| V3 | border 24 px alpha = 0; figure box inside the safe margin | exact |
| V4 | tint layers are neutral grey; luminance within 80–255 (hair/skin/shirt ≥ 235 peak) | ±2 / range |
| V5 | untinted layers contain no pure-grey-only art and no baked background | visual + script |
| V6 | stack all layers: no transparent hole inside the silhouette for any look (5 skin × 2 style × 9 outfit × 2 cut) | 0 holes |
| V7 | Shaved render: no seam on forehead/temples (zoomed review, 5 skin tones) | visual |
| V8 | dark colourways legible (R1 test) at 100 % and 256 px | visual |
| V9 | portrait ≤ 40,000 chars, face fully inside the crop | script |
| V10 | file weights within §9 targets | script |
| V11 | no logos, no third-party IP, no real-person likeness; prompts + tool terms archived | review |

## 12. Scope and open decisions
In scope for the first batch: **one** character, `body.png`, `short` hair, jersey cut (street cut art is specified here but may follow), one pose, one expression, two distinct appearance combinations for review (e.g. warm skin + black short hair + forest jersey; deep skin + shaved + royal).
Out of scope: `curly` and other new styles, body presets, extra poses/expressions, accessories, My Home, a player-owned card, 3D changes.

- **D1 – memory.** Ten 1024×1536 layers decode to ≈ 6.3 MB each (~63 MB). Recommendation: keep 1024×1536 masters; the renderer composes once and releases decoded layers (or serves a 768×1152 phone set later). Needs your view only if you prefer smaller masters now.
- **D2 – `short` look.** Neat short cut now (recommended; curls = next batch as a new style id) or echo the reference's curls inside `short`?
- **D3 – street cut.** Paint in the first batch (more occlusion work) or follow after the jersey set is approved (recommended).
