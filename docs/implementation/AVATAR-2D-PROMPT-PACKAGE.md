# Avatar 2D — Prompt Package and Manual Cleanup (companion to `AVATAR-2D-ART-SPEC.md`)

**Status:** DRAFT FOR USER REVIEW. Documentation only; nothing here has been generated.
**Who runs it:** the product owner with an image tool (this environment cannot generate images). Code Puppy reviews alignment, occlusion and validation results.

## 0. Ground rules
1. **Attach `front.jpg` to every prompt** (plus `side.jpg` / `back.jpg` when the tool accepts several) as the character and style reference. Describe it in words too: the words keep the style when the tool drifts.
2. Ask for a **plain flat `#d5d5d5` background** and a fixed camera (front, eye-level, no perspective, full body, centred). The background is removed later in a controlled way (§3), never by an auto-cutout alone.
3. **Same camera, scale and light** (soft light from upper left, vinyl-toy finish) in every part, so parts register on one canvas.
4. Generate in this order and **stop for review after step A2**. Do not generate clothing or hair until the bald master body is accepted.
5. Original design only: **no logos, no team names, no real player likeness, no text** except a plain chest numeral where stated.
6. Archive for every accepted image: the prompt, the tool and its version/date, the tool's terms for commercial use of outputs (check before shipping), and the untouched original file.
7. Expect several attempts and **manual repainting**: AI parts will not register pixel-exactly. That is normal; §3 explains how to fix it.

## 1. Style lock (use as the opening sentence of every prompt)
> A premium stylised basketball character, collectible vinyl-toy look, the same character as the attached reference: oversized rounded head (about 41 % of total height), big glossy brown eyes with white highlights, thick brows, small closed-mouth smile with soft blush, warm smooth skin with gentle shading, short slim limbs, clean soft studio lighting from the upper left, subtle rim light, polished matte-plastic finish, no outline, no text, no logo.

## 2. Prompts

**A1 — Bald master body (becomes `base/body.png`)**
> [Style lock] Full body, front view, centred, neutral standing pose with arms relaxed slightly away from the body, feet flat, flat plain light-grey background. The figure is a **smooth, neutral toy mannequin body with no clothing, no underwear shapes and no anatomical detail**, one continuous painted skin surface. **Completely bald**: finished smooth skull, crown, temples and both ears visible, **no hairline and no seam anywhere on the head**. Neutral face as in the reference (closed smile). Same proportions and head size as the reference.

**A2 — Same body, three more skin tones** (to verify tint-ability, not shipped)
> Same image as A1 with skin much lighter / mid-brown / deep brown. Check only that shading stays readable; the shipped art is **one** greyscale body (§3).

**B1 — Short hair, alone (`hair/short/front.png` and `back.png`)**
> [Style lock] The same character as A1, now with a **short neat haircut**, rounded readable silhouette, clean edges, shown on the bald master pose. Generate a second version showing **only the hair** as a separate object on the flat background, same position and scale as the head in A1. (The back-of-head/behind-neck part is drawn by hand in §3.)

**C1 — Jersey top, alone (`outfits/jersey/top.png`, `top_trim.png`)**
> [Style lock] A sleeveless V-neck basketball jersey with plain contrast piping at neck, armholes and hem, a chest numeral "7", worn by the same body as A1 in the same pose; second version showing **only the jersey** as if on an invisible mannequin, flat plain background. Neutral grey fabric (it will be recoloured).

**C2 — Jersey shorts, alone (`bottom.png`, `bottom_trim.png`)**
> The matching knee-length basketball shorts with side stripes and hem band, **only the shorts** on an invisible mannequin, same pose and scale, neutral grey.

**D1 — Socks and sneakers, alone (`base/shoes.png`)**
> Two white high-top basketball sneakers with laces and one dark accent colour, white crew socks, the same character's feet, same pose and scale, **only socks and shoes**.

**E1 — Face features (`base/face.png`, `base/brows.png`)**
Cut from A1's face in §3. If a redraw is needed: *"Only the eyes with highlights, nose, closed smile and soft blush of the same character, on a flat background, same position and scale."*

**F1 — Street cut, later batch (`outfits/street/*`)**
> A short-sleeve crew-neck tee with a small collar rib, and loose jogger pants with cuffs, only the garments on an invisible mannequin, same pose and scale, neutral grey.

## 3. Manual cleanup (Krita or GIMP) — mandatory
Work in **one document of 1024 × 1536 px**, layers named exactly as the spec's file names.

1. **Canvas.** Place A1 so the foot baseline is at y = 1464, the centre axis at x = 512 and the figure box fits y 72–1464. Do not scale parts individually afterwards; if a part is off, redraw or transform it to match A1.
2. **Background removal.** Remove the grey with a mask you refine by hand (edge feather ≤ 1 px, no halo); do not rely on one automatic cutout.
3. **Body, hidden regions (cannot be extracted: repaint).** Make `body.png` complete under every cover: full torso, shoulders, upper arms and legs to the ankles (street joggers and tee), neck behind the collar, whole skull and ears under hair, hands with fingers. Smooth, shaded, no clothing marks.
4. **Hair.** Hair alone goes to `front.png` (fringe, sideburns, over ears). Paint `back.png` (behind neck and ears) yourself. Hair must overlap the forehead and ears by ≥ 4 px; no hair pixels may remain on `body.png`. No shadow plate baked on the neck or forehead.
5. **Clothing.** Each garment overlaps skin by ≥ 4 px at every edge. Separate **trim** (piping, hem bands, stripes, numeral) from the **base** garment so they can use different colours.
6. **Greyscale tint layers** (`body`, hair, tops, bottoms, trims, brows): convert to neutral grey (R = G = B ±2). Set lightest values **≥ 235** and darkest **≥ 80**; keep all form and highlight detail in the grey values. `shoes` and `face` stay in colour.
7. **Edges.** Straight RGB with clean alpha, no white/black fringe, no baked shadow or background.
8. **Registration check.** Stack all layers: no transparent hole inside the silhouette; toggle each layer off and on: nothing may shift or leave a gap.
9. **Export** every layer from the same document as 1024 × 1536 PNG RGBA (spec §9); keep the layered source (KRA/PSD) and the original generated images.
10. **Validate before handing back:** run `node scripts/avatar/validate-avatar2d.mjs <your folder>`; fix every FAIL (it reports file, rule and measured value).

## 4. Review package to hand back (for user approval before any code)
- The accepted master (A1) and the stacked composite for two looks: *warm skin + black short hair + forest jersey* and *deep skin + shaved + royal jersey*, plus the five skin tones with Shaved, zoomed on the forehead and temples (spec V7).
- Black short hair and the black street tee at 100 % and at 256 px (spec V8).
- The archive of prompts, tools and terms (spec V11).

Only after the user approves this art does Code Puppy build the renderer against the real files (the earlier placeholder prototype is frozen and not part of this package).
