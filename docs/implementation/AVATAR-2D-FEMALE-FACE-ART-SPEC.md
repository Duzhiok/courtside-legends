# Avatar 2D — Female Style A and face customization: the art that is required (v1)

Status: **engineering is ready, the art does not exist.** Nothing here is selectable in the game today. A saved `presentation: "female"` draws the male art (reported as `presentationFellBack`, never rewritten on save). A recoloured, narrowed or rescaled male figure is **not** an acceptable female character, and a face control that does nothing is not acceptable either. Everything in sections 1 and 3 is a request to the art workstream; section 2 is the engineering that has to follow the art and cannot be done (or measured) before it.

General art rules are not repeated: canvas, coordinates, layer order, greyscale tint masks, seams, export and the validator are in `AVATAR-2D-ART-SPEC.md` (sections 2, 3, 6, 8, 9, 11). This file only adds what is new.

## 0. What the code already does

| Piece | Where |
|---|---|
| Presentation list; `female` declared with `art: false` (shown disabled in the Identity page) | `js/data/avatarLook.js` `PRESENTATIONS` |
| Which presentations have art | `js/ui/avatar2d/avatar2dLayers.js` `ART.presentations` (today `["male"]`) |
| Path of a layer: male = root of `assets/avatar2d/`, any other presentation = its own complete set in a folder of that name | `layerFile`, `presentationRoot` |
| The exact list of files a presentation must ship | `requiredFilesFor(presentation)` |
| Fallback when a presentation has no art | `resolveLayers` -> male art + `presentationFellBack: true` |
| Validator: demands every file of every presentation in `ART.presentations` | `node scripts/avatar/validate-avatar2d.mjs assets/avatar2d` (`scripts/avatar/validate-avatar2d.mjs`) |

## 1. Female Style A — exact files

Folder `assets/avatar2d/female/`. Ten files, one per layer of the male set, same names, same 1024 x 1536 RGBA canvas, same compositing order. `tests/avatarArtContract.test.js` fails if this table and `requiredFilesFor("female")` ever differ.

| File | Role | Tint |
|---|---|---|
| `female/hair/short/back.png` | hair behind the head | hair colour |
| `female/base/body.png` | the whole body with a finished bald head, ears, neck, nose and mouth shading (Shaved draws no hair) | skin colour |
| `female/base/shoes.png` | shoes and socks | none (final colours) |
| `female/outfits/jersey/bottom.png` | shorts | pants colour |
| `female/outfits/jersey/bottom_trim.png` | shorts trim | trim colour |
| `female/outfits/jersey/top.png` | jersey | shirt colour |
| `female/outfits/jersey/top_trim.png` | jersey trim | trim colour |
| `female/base/face.png` | eyes | none |
| `female/base/brows.png` | eyebrows (and see section 3 about the male set's goatee) | hair colour, greys with age |
| `female/hair/short/front.png` | hair in front of the head | hair colour |

Constraints that make the existing controls keep working (measured on the male set; the female set must satisfy the same ones):

- **Feet** stand on art row **1463** and the figure is centred on column **510**. The height slider scales the figure about the feet, the shadow and the shoes line up on that row.
- **Head** fits inside the portrait square `PORTRAIT_CROP = { x: 340, y: 46, size: 340 }`, or section 2b applies. Male head measures x 437..583 with hair, y 73..263 with chin.
- Silhouette rows for the body sliders (shoulders ~row 440, arms ~780, waist ~900, legs ~1200) must show separate arm / torso / leg runs at those rows, like the male figure, or the sliders cannot move one part independently (section 2a).
- The jersey is **cut for the female body** (fit, straps, hem), not the male jersey tinted or scaled.
- Tint layers: neutral grey only, luminance 80–255, as in the base spec. All nine outfit colourways and the eight shop jerseys must work with the same greyscale files.
- Skin: the two shipped skin colours plus every other `SKIN_TONES` entry must look right on the one greyscale body.

Not requested yet (do not draw them for this slice): other cuts (street), other hairstyles, a second pose. Adding them is a separate request.

## 2. Engineering that must follow the art (known, not done: nothing to measure yet)

a. **Body regions per presentation.** `avatar2dShape.js` cuts the figure into shoulders / waist / arm / leg regions measured on the male art. Run `node scripts/measure/avatar-body-anchors.mjs` against `female/` and key the region table by presentation. Until then the sliders must not be enabled for female (they are not: female is not selectable).
b. **Portrait crop per presentation** (`PORTRAIT_CROP`) if the female head does not fit the male square.
c. **Jersey number anchor per presentation** (`NUMBER_ANCHOR` in `avatar2dJersey.js`, measured on the male chest).
d. **The switch**, in one commit with the art: add `"female"` to `ART.presentations`, set `PRESENTATIONS.female.art` to `true`, run the validator (it now demands the ten files), `scripts/qa/avatar-creator-2d.mjs` (extend its slider measurements to the female figure), `scripts/qa/avatar-body-2d.mjs`, `scripts/qa/jersey-equip-2d.mjs`, desktop and 390px screenshots.
e. 3D: the optional 3D figure has no female model; it keeps drawing its own figure and ignores `presentation`. Do not claim female support in 3D.

## 3. Face customization — what exists and what is required

Measured on the shipped male art (alpha bounding boxes, art pixels):

| Layer | Box | What it actually contains |
|---|---|---|
| `base/body.png` | x 259..755, y 95..1459 | the whole body and head, **with nose, mouth, ears and jaw painted in** |
| `base/face.png` | x 474..544, y 158..165 | the eyes only |
| `base/brows.png` | x 469..550, y 145..263 | the eyebrows **and the goatee** (it reaches the chin) |

Consequences, so nobody builds a decorative control:

- Only the **eyes** are a separate layer today; there is one variant of them. Brows and goatee are one layer, so "facial hair on/off" is impossible without a split. Nose, mouth, ears and jaw are inside the skin layer and cannot be swapped.
- Therefore **no face control is shown today.** The Face page says so (checked by `scripts/qa/avatar-creator-2d.mjs`).
- Warping flat art to fake a morph (wider nose, bigger eyes) is **not** an accepted way to create a control. A control is a choice between separately drawn layers.

Rule for showing a face control: a part gets a control only when **two or more finished variants of that part ship as their own layer** and the skin layer underneath has the part removed. The control lists exactly the variants that exist.

Files requested, per presentation (male set at the root, female set under `female/`), each 1024 x 1536 RGBA, aligned to the head of that presentation:

| Part | Folder | Variants | Tint | Needs |
|---|---|---|---|---|
| Eyes | `face/eyes/<id>.png` | at least 3 | none (or iris colour later) | the current `base/face.png` becomes variant `default` |
| Eyebrows | `face/brows/<id>.png` | at least 3 | hair colour, greys with age | brows split off the goatee |
| Nose | `face/nose/<id>.png` | at least 3 | skin colour (neutral grey shading) | **a blank skin base**: `base/body.png` re-exported without nose (see below) |
| Mouth | `face/mouth/<id>.png` | at least 3 | none or skin shading | the same blank base, without mouth |
| Facial hair | `face/facial_hair/<id>.png` | at least 2 plus "none" (no file) | hair colour, greys with age | the goatee split off `brows.png` |

The blank skin base is a separate export, `base/body_blank_face.png` (and `female/base/body_blank_face.png`): same pixels as `body.png` with the nose and mouth shading removed and the skin reconstructed, per the hidden-region rule in the base spec (section 8). The renderer would draw it instead of `body.png` once any nose or mouth control exists.

Engineering once that art exists: a `FACE_PARTS` table (part, folder, variant ids) next to `LAYER_SPEC`, resolver support for `look.face = { eyes, brows, nose, mouth, facialHair }` (sparse, default omitted, sanitized to the shipped ids, portrait signature includes it), one control per part that has two or more variants, validator rules for the new folders, and the QA script measuring that each control changes only its own region.

## 4. Appearance age — what exists

`appearanceAge` (18–65, separate from a career's real age) greys the **hair and the brows layer** from about age 35. At age 60 the eyebrows and the goatee turn light grey, which is correct for facial hair but is a stronger, whiter grey than the hair (visual review item, not changed). No wrinkles, no skin change, no hairline change: there is no art for them and the editor says so. If art is wanted later: `age/<band>.png` overlays (for example `age/40s.png`, `age/50s.png`, `age/60s.png`), skin-neutral, drawn above the skin and below the hair, per presentation. Not requested for this slice.

## 5. Acceptance when the art arrives

1. `node scripts/avatar/validate-avatar2d.mjs assets/avatar2d` — zero FAIL, WARNs reviewed.
2. Female and male side by side, same look, same jersey: composite preview plus 256 px portrait of each.
3. Sections 2a–2d done and their tests added.
4. Desktop and 390px screenshots of every slider extreme, age 20 vs 60, and a worn jersey, on the female figure.
5. Visual approval by the product owner. Tests passing is not visual approval.
