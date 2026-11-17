"""Avatar 2D art pipeline, step 2: build the ten spec layers (docs/implementation/AVATAR-2D-ART-SPEC.md) from the Style A master.

    python scripts/avatar/art2d/build.py assets/avatar2d          # needs: pillow numpy scipy opencv-python-headless
    node scripts/avatar/validate-avatar2d.mjs assets/avatar2d     # must report 0 failures

The master figure supplies every visible pixel; the bald reference from the same sheet supplies only the scalp above the hairline
(Shaved) and is registered onto the master's face by NCC. Hidden body under the clothes is inpainted. Tint layers are written as
neutral grey (spec V4), the rest in colour. Deterministic: rerunning reproduces the shipped files byte for byte."""
import os
import sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi
import segment as seg

CANVAS_W, CANVAS_H = 1024, 1536
TOP_Y, BOTTOM_Y = 72, 1462                   # figure box in the canvas (spec safe margin 72)
AXIS_SRC_X = 121.0                           # master's head/neck axis in the source (ear midpoint)
EYE_LINE_Y = 56.0

# Master zones in source rows/cols (measured on the class map, see segment.py debug output)
HEAD_MAX_Y = 112
HEM_BAND = (258, 290)
SOCKS_MIN_Y = 536
BROW_ZONE = (45, 53)                                     # brows only: the eyelid crease starts at row 54
BEARD_BOX = (109, 88, 134, 102)                          # x0, y0, x1, y1: the goatee on the chin only
EYE_BOXES = [(99, 53, 117, 63), (122, 53, 141, 63)]
SEAM_CLEAN = (200, 222, 250, 395)                        # x0, y0, x1, y1: where the bald figure's fingertips touch the master
MIN_SKIN_ISLAND = 150                                    # source px; the smallest real skin part (a hand) is >1000
FINGERTIP_CUT = (233, 355, 395)                          # x >= 233 in rows 355-395 belongs to the bald figure's fingers

# Grey mapping (spec V4: floor >= 80, peak >= 235); see grey_map.
FLOOR_GREY, PEAK_GREY = 86.0, 246.0


def register_bald_head(L_master, L_bald, master_face):
    """Grid-search scale/shift mapping bald-figure coordinates onto the master head (NCC over the upper face)."""
    ys, xs = np.where(master_face)
    ref = L_master[ys, xs]
    ref = (ref - ref.mean()) / (ref.std() + 1e-6)
    best = None
    for s in np.arange(0.95, 1.071, 0.01):
        for dy in np.arange(-5, 5.01, 0.5):
            for dx in np.arange(-216, -201.9, 0.5):
                bx = (xs - AXIS_SRC_X) / s + AXIS_SRC_X - dx
                by = (ys - EYE_LINE_Y) / s + EYE_LINE_Y - dy
                v = ndi.map_coordinates(L_bald, [by, bx], order=1)
                v = (v - v.mean()) / (v.std() + 1e-6)
                score = float((v * ref).mean())
                if best is None or score > best[0]:
                    best = (score, s, dx, dy)
    return best


def warp_from_bald(arr, s, dx, dy, shape):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    bx = (xx - AXIS_SRC_X) / s + AXIS_SRC_X - dx
    by = (yy - EYE_LINE_Y) / s + EYE_LINE_Y - dy
    return ndi.map_coordinates(arr.astype(np.float32), [by, bx], order=1, mode="constant")


def hem_profile(cls):
    """Per column: first row of the dark waistband shadow in the hem band (jersey above, shorts below)."""
    y0, y1 = HEM_BAND
    prof = np.full(cls.shape[1], np.nan)
    for x in range(cls.shape[1]):
        hits = np.where(cls[y0:y1, x] == 4)[0]
        if len(hits):
            prof[x] = y0 + hits[0]
    good = ~np.isnan(prof)
    xs = np.arange(len(prof))
    prof = np.interp(xs, xs[good], prof[good]) if good.any() else np.full(len(prof), 274.0)
    return ndi.median_filter(prof, size=9)


def keep_large(m, frac=0.02):
    lab, n = ndi.label(m)
    if n <= 1:
        return m
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return (sizes > frac * sizes.max())[lab] & m


def grey_map(g, weight):
    """Linear gain anchored on the 97th percentile (-> 246) so the layer keeps its own contrast (multiply can only darken the
    palette colour, so the palette colour must sit at the lit tone, with room above the median for highlights). The top 3% is
    soft-clipped below 253; shadows are lifted only where they would fall under the spec floor (V4: floor >= 80, peak >= 235)."""
    v = g[weight > 0.95]
    if v.size < 50:
        v = g[weight > 0]
    lo, med, p97 = np.percentile(v, [0.5, 50, 97])
    gain = PEAK_GREY / max(p97, 1.0)
    out = g * gain
    over = out > PEAK_GREY
    out[over] = PEAK_GREY + (253.0 - PEAK_GREY) * (1 - np.exp(-(out[over] - PEAK_GREY) / 12.0))
    lo_n, med_n = lo * gain, med * gain
    if lo_n < FLOOR_GREY and med_n > FLOOR_GREY + 10:
        under = out < med_n
        out[under] = np.interp(out[under], [0.0, lo_n, med_n], [FLOOR_GREY * 0.85, FLOOR_GREY, med_n])
    return np.clip(out, 0, 255)


def trim_grey(g, weight):
    """Light trims: gain to the peak only (a white stripe must stay white, not be stretched into grey shadows)."""
    v = g[weight > 0.5]
    hi = np.percentile(v, 99.5) if v.size else 250.0
    out = g * (250.0 / max(hi, 1.0))
    lo = np.percentile(out[weight > 0.5], 0.5) if v.size else 200.0
    if lo < FLOOR_GREY:
        out = FLOOR_GREY + (out - lo) * (250 - FLOOR_GREY) / max(250 - lo, 1.0)
    return np.clip(out, 0, 255)


def fill_from_core(values, core, region, sigma=1.6):
    """Edge pixels get a smooth, weighted average of the nearby core (normalised Gaussian convolution), never a copied single
    pixel: copying the nearest pixel turns one dark speck of the source's ink outline into a streak. Far from any core: nearest."""
    if not core.any():
        return values
    c = core.astype(np.float32)
    w = ndi.gaussian_filter(c, sigma)
    smooth = ndi.gaussian_filter(values * c, sigma) / np.maximum(w, 1e-6)
    _, idx = ndi.distance_transform_edt(~core, return_indices=True)
    nearest = values[idx[0], idx[1]]
    out = values.copy()
    edge = region & ~core
    out[edge] = np.where(w[edge] > 0.04, smooth[edge], nearest[edge])
    return out


class Placer:
    """Source -> canvas: one similarity transform for every layer, so nothing is ever offset at runtime."""

    def __init__(self, top_src, bot_src):
        self.scale = (BOTTOM_Y - TOP_Y) / (bot_src - top_src)
        self.M = np.float32([[self.scale, 0, 512 - AXIS_SRC_X * self.scale], [0, self.scale, TOP_Y - top_src * self.scale]])

    def warp(self, a):
        return cv2.warpAffine(a.astype(np.float32), self.M, (CANVAS_W, CANVAS_H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

    def region(self, m):
        """Binary source region -> smooth anti-aliased canvas alpha (blur, upscale, re-threshold at 0.5): curves, not stairs."""
        up = self.warp(ndi.gaussian_filter(m.astype(np.float32), 0.85))
        return np.clip((up - 0.5) * 2.6 + 0.5, 0, 1)

    def soft(self, a):
        return np.clip(self.warp(a), 0, 1)


def conform_v4(c, a):
    """Final guarantee of spec V4 on the pixels actually written (upscaling, inpainting and sharpening all move the range):
    gain up if the highlight peak is short, then lift only the values under the median if the shadow floor is short."""
    sel = a > 0.98
    if sel.sum() < 20:
        sel = a > 0.5
    hi = np.percentile(c[sel], 99.5)
    if hi < 240:
        c = np.clip(c * (244.0 / max(hi, 1.0)), 0, 253)
    lo, med = np.percentile(c[sel], [0.5, 50])
    if lo < FLOOR_GREY:
        pivot = max(med, FLOOR_GREY + 24)        # dark layers (hair) have their median near the floor: keep the map monotonic
        under = c < pivot
        c = c.copy()
        c[under] = np.interp(c[under], [0.0, lo, pivot], [FLOOR_GREY, FLOOR_GREY + 2, pivot])
    return c


def save_layer(path, kind, value_hi, alpha_hi):
    a = np.clip(alpha_hi, 0, 1)
    a = np.where(a < 0.025, 0, a)
    if kind == "grey":
        c = np.clip(value_hi, 0, 255)
        inner = cv2.erode((a > 0.999).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        blur = cv2.GaussianBlur(c, (0, 0), 1.4)
        c = np.where(inner, np.clip(c + 0.3 * (c - blur), 0, 255), c)
        c = conform_v4(c, a)
        rgb = np.repeat(c[..., None], 3, -1)
    else:
        rgb = np.clip(value_hi, 0, 255)
    out = np.dstack([rgb, a * 255]).round().astype(np.uint8)
    out[..., :3][out[..., 3] == 0] = 0
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(out, "RGBA").save(path, optimize=True)
    return out


def main(out_dir):
    img = seg.load()
    H, W, _ = img.shape
    master, bald, _ = seg.figure_masks(img)
    x0, y0, x1, y1 = SEAM_CLEAN
    zone = np.zeros_like(master)
    zone[y0:y1, x0:x1] = True
    master = (master & ~zone) | (ndi.binary_opening(master & zone, iterations=2) & zone)   # drop the touching fingertip slivers
    fx, fy0, fy1 = FINGERTIP_CUT
    master[fy0:fy1, fx:] = False
    master = keep_large(master, 0.5)
    alpha, rgb = seg.soft_alpha(img, master)
    balpha, brgb = seg.soft_alpha(img, bald)
    cls = seg.classify(rgb, master)
    L = seg.lum(rgb)
    yy, xx = np.mgrid[0:H, 0:W]

    interior = ndi.binary_erosion(master, iterations=1)
    _, idx = ndi.distance_transform_edt(~(interior & (cls > 0)), return_indices=True)
    cls = np.where(master & ~interior, cls[idx[0], idx[1]], cls)
    hem = hem_profile(cls)[None, :]

    # --- regions ------------------------------------------------------------------------------------------------------
    head = master & (yy < HEAD_MAX_Y)
    lab, n = ndi.label(head & (cls == 4))
    hair = np.isin(lab, [k for k in range(1, n + 1) if yy[lab == k].min() <= 20])
    hair = ndi.binary_closing(hair, iterations=1) & head
    hair |= head & ndi.binary_dilation(hair, iterations=1) & (yy < 50) & (cls != 1)

    below_head = master & ~hair & (yy >= HEAD_MAX_Y - 6)
    fabricish = below_head & np.isin(cls, [2, 3, 4, 5])
    fabricish = ndi.binary_opening(fabricish, iterations=1) | (fabricish & (cls == 2))
    filled = ndi.binary_fill_holes(fabricish) & below_head
    clothing = filled & ~((cls == 1) & ~ndi.binary_erosion(filled, iterations=2))
    shoes = keep_large(clothing & (yy >= SOCKS_MIN_Y))
    top = keep_large(clothing & (yy < hem))
    bottom = keep_large(clothing & (yy >= hem) & (yy < SOCKS_MIN_Y))
    skin = master & ~hair & ~top & ~bottom & ~shoes
    # skin-coloured specks between the curls are hidden under the hair, but float above the head in Shaved: drop small islands
    # (by size, not "largest only": the legs are separate from the torso, the shorts sit between them)
    lab, n = ndi.label(skin)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    skin = (sizes >= MIN_SKIN_ISLAND)[lab]

    face_dark = L < np.percentile(L[skin & (yy < HEAD_MAX_Y)], 12)
    brow = skin & face_dark & (yy >= BROW_ZONE[0]) & (yy <= BROW_ZONE[1])
    bx0, by0, bx1, by1 = BEARD_BOX
    beard = skin & face_dark & (xx >= bx0) & (xx < bx1) & (yy >= by0) & (yy < by1)
    brows = keep_large(brow, 0.15) | keep_large(beard, 0.3)
    eyes = np.zeros_like(master)
    sat = (rgb[..., 0] - rgb[..., 2]) / np.maximum(rgb[..., 0], 1)
    for ex0, ey0, ex1, ey1 in EYE_BOXES:
        box = (xx >= ex0) & (xx < ex1) & (yy >= ey0) & (yy < ey1) & skin
        eyes |= box & (((sat < 0.22) & (L > 115)) | (L < 42))     # sclera + iris only; the eyelids stay in the tinted skin

    # --- bald reference: registration, scalp, hidden body ------------------------------------------------------------------
    Lb = seg.lum(brgb) * (balpha > 0.5)
    face_ref = skin & (yy >= 44) & (yy <= 76) & (np.abs(xx - AXIS_SRC_X) < 22) & ~brows & ~eyes
    score, s, dx, dy = register_bald_head(L, Lb, face_ref)
    print(f"bald head registration: NCC {score:.3f} scale {s:.2f} shift ({dx:.1f}, {dy:.1f})")
    Lb_m = warp_from_bald(Lb, s, dx, dy, (H, W))
    ab_m = warp_from_bald(balpha, s, dx, dy, (H, W))
    sel = face_ref & (ab_m > 0.9)
    Lb_m = (Lb_m - Lb_m[sel].mean()) * (L[sel].std() / max(Lb_m[sel].std(), 1e-6)) + L[sel].mean()
    skull = (ab_m > 0.5) & (yy < 70)
    scalp = skull & ndi.binary_dilation(hair, iterations=2) & ~skin

    # body greyscale: visible skin, feathered bald scalp above the hairline, everything hidden inpainted
    hidden = top | bottom | shoes
    inside = ~ndi.binary_dilation(~master, iterations=2)         # >= 2px inside the silhouette: never peeks at cloth edges
    gL = np.where(skin, L, 0.0)
    w_bald = np.clip(1.0 - ndi.distance_transform_edt(~hair) / 3.0, 0, 1) * (ab_m > 0.5)
    gL = np.where(scalp, Lb_m, gL)
    gL = np.where(skin & (w_bald > 0), w_bald * Lb_m + (1 - w_bald) * L, gL)
    known = skin | scalp
    body_region = known | (hidden & inside)
    g8 = cv2.inpaint(np.clip(gL, 0, 255).astype(np.uint8), (body_region & ~known).astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)
    gL = np.where(known, gL, g8.astype(np.float32))
    # skip the source's 1px ink outline at the silhouette: JPEG noise turns it into a ragged dark rim once tinted and upscaled
    gL = fill_from_core(gL, ndi.binary_erosion(skin, iterations=2) | scalp, skin)
    # despeckle near the silhouette only: outline/JPEG specks much darker than their neighbourhood (real shading is not that local)
    near_edge = skin & (ndi.distance_transform_edt(master) <= 6)
    med = ndi.median_filter(gL, size=5)
    gL = np.where(near_edge & (gL < med - 22), med, gL)

    # trims: continuous whiteness over the fabric (mixed white/green pixels keep their exact blend)
    mn = rgb.min(axis=2)
    whiteness = np.clip((mn - 75.0) / (175.0 - 75.0), 0, 1)

    def fabric_grey(region, trim_w):
        g8 = cv2.inpaint(np.clip(L, 0, 255).astype(np.uint8), ((trim_w > 0.25) & region).astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA)
        core = ndi.binary_erosion(region, iterations=1) & (trim_w < 0.25)
        return fill_from_core(g8.astype(np.float32), core, region)

    # --- place ------------------------------------------------------------------------------------------------------------
    ys, _ = np.where(master)
    P = Placer(ys.min(), ys.max())
    print(f"placement: scale {P.scale:.3f}, source rows {ys.min()}-{ys.max()} -> canvas {TOP_Y}-{BOTTOM_Y}")
    out = {}

    def extend(values, region):
        """Carry the layer's own values 4px past its region, so upscaling never mixes in the background or a neighbour."""
        core = ndi.binary_erosion(region, iterations=1)
        return fill_from_core(values, core if core.any() else region, ndi.binary_dilation(region, iterations=4) & ~core)

    def grey_layer(name, region, grey_src, alpha_hi, trim=False):
        g_hi = P.warp(extend(grey_src, region))
        mapped = trim_grey(g_hi, alpha_hi) if trim else grey_map(g_hi, alpha_hi)
        out[name] = save_layer(os.path.join(out_dir, name), "grey", mapped, alpha_hi)

    body_hi = np.maximum(P.region(skin), P.region(scalp | (hidden & inside)))
    grey_layer("base/body.png", body_region | skin, gL, body_hi)
    top_w = whiteness * top
    bot_w = whiteness * bottom
    grey_layer("outfits/jersey/top.png", top, fabric_grey(top, top_w), P.region(top))
    grey_layer("outfits/jersey/top_trim.png", top, fill_from_core(L.copy(), top_w > 0.6, top), P.soft(top_w) * P.region(top), trim=True)
    bottom_ext = bottom | (ndi.binary_dilation(bottom, iterations=4) & top & (yy >= hem - 5))    # shorts tuck under the jersey hem
    grey_layer("outfits/jersey/bottom.png", bottom_ext, fabric_grey(bottom_ext, bot_w), np.maximum(P.region(bottom), P.region(bottom_ext & ~bottom)))
    grey_layer("outfits/jersey/bottom_trim.png", bottom, fill_from_core(L.copy(), bot_w > 0.6, bottom), P.soft(bot_w) * P.region(bottom), trim=True)
    shoes_rgb = np.stack([extend(rgb[..., c].copy(), shoes) for c in range(3)], -1)
    out["base/shoes.png"] = save_layer(os.path.join(out_dir, "base/shoes.png"), "rgb", np.stack([P.warp(shoes_rgb[..., c]) for c in range(3)], -1), P.region(shoes))
    hair_grey = fill_from_core(L.copy(), ndi.binary_erosion(hair, iterations=1), ndi.binary_dilation(hair, iterations=2))
    # hair keeps the soft matte on its outer edge (fuzzy curls) and a smooth contour along the hairline
    hair_hi = np.minimum(P.soft(alpha * ndi.binary_dilation(hair, iterations=2)), P.region(ndi.binary_dilation(hair, iterations=1)))
    grey_layer("hair/short/front.png", hair, hair_grey, hair_hi)
    grey_layer("hair/short/back.png", hair, hair_grey, np.minimum(hair_hi, P.region(hair & ~ndi.binary_dilation(skull, iterations=1))))
    local = ndi.uniform_filter(np.where(skin & ~brows, L, 0), 9) / np.maximum(ndi.uniform_filter((skin & ~brows).astype(np.float32), 9), 1e-3)
    darkness = np.clip((local - L) / np.maximum(local - np.percentile(L[brows], 5), 1), 0, 1)
    brows_a = np.clip(ndi.gaussian_filter(brows.astype(np.float32), 0.6) * 1.4, 0, 1) * darkness
    grey_layer("base/brows.png", brows, fill_from_core(L.copy(), brows, ndi.binary_dilation(brows, iterations=2)), P.soft(brows_a))
    eye_rgb = np.stack([P.warp(extend(rgb[..., c].copy(), eyes)) for c in range(3)], -1)
    out["base/face.png"] = save_layer(os.path.join(out_dir, "base/face.png"), "rgb", eye_rgb, P.soft(np.clip(ndi.gaussian_filter(eyes.astype(np.float32), 0.45) * 1.5, 0, 1)))
    for name, arr in out.items():
        path = os.path.join(out_dir, name)
        print(f"  {name:32s} opaque px {int((arr[..., 3] > 250).sum()):7d}  bytes {os.path.getsize(path):7d}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "assets/avatar2d")
