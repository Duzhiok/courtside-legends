# Avatar 2D — Female Style A and facial parts: the art request (companion to `AVATAR-2D-FEMALE-FACE-ART-SPEC.md`)

**Status:** REQUEST. Nothing here has been generated; this environment cannot generate images. Code Puppy turns delivered images into layers, wires them up and runs the QA. The female option and every face control stay **off** in the game until real art for them renders correctly.

**Why this exists:** the only Style A source is `scripts/avatar/art2d/src/style-a-master-sheet.jpg`: one male athlete (dressed, bald base, hair piece, jersey, shorts, socks and shoes, a grey silhouette mask, black clothing masks). A female set cannot be made from it (a narrowed or recoloured male is not accepted), and nose, mouth and jaw are painted into the male body, so face variants need new art too.

## 1. Female set: one sheet, the same layout as the male sheet

One image, same camera and light as `style-a-master-sheet.jpg`: front view, eye level, no perspective, soft light from the upper left, flat white background, **same height on the sheet as the male figure** (the sliders and the shoes baseline are measured on that proportion), semi-realistic, original, adult, athletic. No logos, no team names, no real-person likeness, no text except the chest numeral.

Left to right, exactly as the male sheet:

| # | Panel | Becomes |
|---|---|---|
| 1 | Dressed full body: forest-green sleeveless V-neck jersey with white trim, matching shorts, white crew socks, green and white high tops | the visual master |
| 2 | The same body with no clothes (a neutral athletic two-piece base), **bald**, full neck, ears, hands, the whole body shown | `female/base/body.png` |
| 3 | The short hairstyle alone (same style family as the male's: short, rounded, readable) | `female/hair/short/front.png` and `back.png` |
| 4 | Jersey cut for this body (fit, straps, hem) and shorts, each alone | `female/outfits/jersey/*` |
| 5 | Socks and sneakers alone | `female/base/shoes.png` |
| 6 | Neutral grey silhouette of the body | tint reference |
| 7 | Black jersey, black shorts, black hair piece | masks |

Prompt skeleton (put the male sheet as the style reference and say it in words too, because tools drift):
> A premium semi-realistic basketball athlete character sheet, the same art style, camera, lighting and layout as the attached reference sheet, but an **adult woman**: athletic build, realistic proportions, calm confident expression. Panels left to right: (1) dressed in a forest-green sleeveless V-neck basketball jersey with white trim and matching shorts, white socks, green and white high tops; (2) the same body bald and unclothed except a neutral athletic base garment; (3) a short rounded hairstyle alone; (4) the jersey and shorts alone on an invisible mannequin, cut for a woman's body; (5) socks and sneakers alone; (6) a flat grey silhouette of the body; (7) black silhouettes of the jersey, shorts and hair piece. Flat white background, front view, no text, no logos.

## 2. Facial parts: new layers, per presentation (male set at the root, female set under `female/`)

All 1024 x 1536 RGBA, drawn on the **same head** as that presentation's `body.png`, so they register. Three finished variants each, the first being the **current look**, so the default never changes.

| Part | Files | Notes for the artist |
|---|---|---|
| Blank skin base | `base/body_blank_face.png` | `body.png` with the **nose and mouth shading removed** and the skin reconstructed (no hole, no ghost of the old shapes). Ears and jaw stay. Greyscale, same range as `body.png`. |
| Eyes | `face/eyes/default.png` (the current `face.png`), `face/eyes/b.png`, `face/eyes/c.png` | different shape and set, **not** a stretched copy. Colour art, no tint. |
| Eyebrows | `face/brows/default.png`, `b.png`, `c.png` | split off the goatee. Greyscale (they take the hair colour and grey with age). |
| Nose | `face/nose/default.png`, `b.png`, `c.png` | drawn on the blank base. Skin shading in neutral grey. |
| Mouth | `face/mouth/default.png`, `b.png`, `c.png` | the same. Closed, neutral to slight smile; no teeth variants in this batch. |
| Facial hair (male set) | `face/facial_hair/goatee.png`, `stubble.png` (and "none" = no file) | the goatee split off `brows.png`. Greyscale. |
| Face shape | **needs a decision** | a different jaw and head outline cannot sit on top of the baked head. It needs a head-less skin base plus three finished heads. Not in the engineering plan until the artist says it is feasible. |

Per-part prompt skeleton (generate on the blank-base head, three variants in one row for consistency, flat background, same scale):
> The same character's face in the same style and light, **only the [eyes | eyebrows | nose | mouth]** as separate layers on a flat background, three different distinct designs in a row ([describe them: e.g. wide and calm / narrow and sharp / round and soft]), aligned to the attached head, no skin around them.

## 3. What Code Puppy does with delivered art

1. Slice, tint-normalise and align with `scripts/avatar/art2d/segment.py` and `build.py` (written for the male sheet's coordinates; the female sheet needs its own coordinates, a small change).
2. `node scripts/avatar/validate-avatar2d.mjs assets/avatar2d` until zero FAIL.
3. Spec section 2a-2d: body regions, portrait crop, number anchor, the switch (one commit with the art).
4. Browser QA on both presentations: all sliders, age 20 and 60, a worn jersey, save and reload, an old save, the 256 px portrait, desktop and 390 px, 3D fallback. Screenshots handed over for visual approval. Tests passing is not approval.

## 4. Dependencies at a glance

| Needed | From | Blocks |
|---|---|---|
| Female master sheet (section 1) | the product owner's image tool + cleanup | the female option |
| Blank skin base, male and female | repainting | every nose / mouth control |
| Eyes x3, brows x3, nose x3, mouth x3 per presentation | image tool + cleanup | the face controls |
| Goatee split off `brows.png` | repainting | facial hair on / off |
| A decision on face shape | the product owner | face shape |
