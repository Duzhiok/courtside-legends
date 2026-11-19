"""Avatar 2D art pipeline for the FEMALE Style A set (companion to build.py, which builds the male set).

    python scripts/avatar/art2d/build_female.py <out_dir>      # needs: pillow numpy scipy opencv-python-headless
    node scripts/avatar/validate-avatar2d.mjs <out_dir>        # must report 0 failures (the layout is the root layout)

Same method as the male build: the approved master (src/female/master.jpg, dressed) supplies every VISIBLE pixel, so hair, jersey, shorts,
socks, shoes, eyes and brows register to it by construction; what the clothes hide is inpainted; the bald reference (src/female/bald.jpg, same
pose, same face) supplies only the scalp, registered onto the master's head. The separately generated uniform and hair candidates in src/ are NOT
used: their scale (clothes 1.38x, hair 2.7-4.6x), cut and hairstyle do not match the master (measured, see docs/AGENT_CHAT.md).
The jersey number in the master is erased here: the game draws the number itself (js/ui/avatar2d/avatar2dJersey.js), a baked one would show twice.
Deterministic: rerunning reproduces the files byte for byte.
"""
import os
import sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi
import build as mb

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src", "female")

# Source px of the 683 x 1024 master (measured on it; debug images: --debug)
AXIS_SRC_X = 338.0                            # body axis (hands 147..527, shoes 187..486 -> 337); the head sits ~3px right of it
EYE_LINE_Y = 80.0
HEAD_MAX_Y = 140
FACE_ELLIPSE = (340.0, 101.0, 35.0, 41.0)     # cx, cy, a, b: the face down to the chin; dark pixels in it are eyes, brows, nostrils, lips: never hair
FORE_TOP = 66                                 # above this the fringe may lie over the forehead (its tip reaches ~69; the brows start at ~67)
FACE_HALF_W = 34.0                            # half width of the face between the brows and the cheeks (brow ends reach x = 306 / 374)
NECK_SHADOW = (28.0, 124)                     # |x - axis| below this, from this row down: the jaw / neck shadow, never hair
EAR_BOXES = [(293, 78, 309, 110), (371, 78, 388, 110)]
BROW_BOXES = [(309, 64, 337, 76), (344, 64, 373, 76)]
EYE_BOXES = [(311, 75, 335, 90), (347, 75, 371, 90)]
HEM_ROWS = (425, 466)                         # where the jersey hem curve lives (rows ~438 at the sides, ~452 in the middle)
SOCKS_MIN_Y = 818
FOOT_MIN_Y = 822                              # rows from here down: row-convex fill of each foot (the sock tops start ~825)
NUMBER_BOX = (304, 228, 381, 308)             # the baked "11"
NUMBER_SHIFT = 76                             # plain fabric of the same columns this many rows lower fills the hole
MIN_SKIN_ISLAND = 150


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGB")).astype(np.float32)


def lum(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


def smooth_mask(m, sigma):
    """A binary mask without the +-1 px jitter that JPEG ringing puts on a colour-threshold edge (it would become a visible serration once upscaled)."""
    return ndi.gaussian_filter(m.astype(np.float32), sigma) > 0.5


def figure(img):
    """Hard mask of the figure on the flat grey background (+ the background colour). The soft contact shadow stays out (it is lighter than the threshold)."""
    border = np.concatenate([img[:6].reshape(-1, 3), img[-6:].reshape(-1, 3), img[:, :6].reshape(-1, 3), img[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.abs(img - bg).max(axis=2)
    hard = ndi.binary_opening(d > 14, iterations=1)       # the background is flat (max deviation 4 over the whole sheet); shaded sock whites sit only ~18 above it
    # the soft contact shadow under the shoes is neutral mid-grey and not next to any real shoe colour: it is not part of the figure
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    L = lum(img)
    chroma = img.max(axis=2) - img.min(axis=2)
    yy = np.arange(img.shape[0])[:, None]
    shadow = (yy >= 955) & (chroma < 10) & (L > 110) & (L < 194)    # neutral mid-grey below the soles: the shadow (soles are brighter, greener or darker)
    hard = ndi.binary_opening(hard & ~shadow, iterations=1)
    hard = mb.keep_large(hard, 0.02)
    hard = ndi.binary_fill_holes(hard)
    # sock whites in shade are as grey as the background (no colour difference to find): from the front each foot is convex row by row,
    # so below the ankle the figure is everything between its leftmost and rightmost real pixel in the row
    mid = img.shape[1] // 2
    for y in range(FOOT_MIN_Y, img.shape[0]):
        for lo, hi in ((0, mid), (mid, img.shape[1])):
            cols = np.where(hard[y, lo:hi])[0]
            if len(cols) > 3:
                hard[y, lo + cols.min():lo + cols.max() + 1] = True
    return smooth_mask(hard, 1.0), bg


def soft_alpha(img, hard, bg):
    """Alpha across the edge from the colour's position on the line background -> nearest interior colour; the edge colour is the interior one."""
    interior = ndi.binary_erosion(hard, iterations=2)
    _, idx = ndi.distance_transform_edt(~interior, return_indices=True)
    ci = img[idx[0], idx[1]]
    v = ci - bg
    t = ((img - bg) * v).sum(-1) / np.maximum((v * v).sum(-1), 1.0)
    t = np.where((v * v).sum(-1) < 25.0 ** 2, 1.0, t)       # interior colour ~ the background (shaded white): nothing to measure against, opaque
    alpha = np.where(interior, 1.0, np.clip(t, 0, 1)) * ndi.binary_dilation(hard, iterations=1)
    return alpha.astype(np.float32), np.where(interior[..., None], img, ci)


def classes(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    L = lum(rgb)
    white = (rgb.min(axis=2) > 205) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 28)
    green = (g > r + 14) & (g > b + 4) & ~white
    skin = (r > g + 14) & (g > b + 4) & (L >= 150)
    brown = (r > g + 6) & (g >= b - 2) & (L < 150) & ~green
    dark = (L < 62) & ~green
    return white, green, skin, brown, dark, L


def hem_curve(L, green_or_white, x0=200, x1=480):
    """Per column, the row where the jersey hem ends and the darker fold under it begins (strongest brightening-to-darkening step), smoothed."""
    y0, y1 = HEM_ROWS
    sm = ndi.gaussian_filter(L, (1.2, 0.8))
    grad = sm[y0 + 1:y1] - sm[y0:y1 - 1]
    cols = np.arange(L.shape[1])
    prof = np.full(L.shape[1], np.nan)
    for x in range(x0, x1):
        if green_or_white[y0:y1, x].sum() > 20:
            prof[x] = y0 + 1 + int(np.argmin(grad[:, x]))
    good = ~np.isnan(prof)
    prof = np.interp(cols, cols[good], prof[good])
    return ndi.median_filter(prof, size=15)


def regions(img):
    hard, bg = figure(img)
    alpha, rgb = soft_alpha(img, hard, bg)
    white, green, skin_c, brown, dark, L = classes(rgb)
    H, W = L.shape
    yy, xx = np.mgrid[0:H, 0:W]
    master = hard
    cx, cy, ea, eb = FACE_ELLIPSE
    ellipse = ((xx - cx) / ea) ** 2 + ((yy - cy) / eb) ** 2 <= 1.0
    # the face is as wide at the brows as at the cheeks: a straight-sided top, the ellipse below it
    inner = ((np.abs(xx - cx) <= FACE_HALF_W) & (yy >= FORE_TOP) & (yy <= cy + 4)) | (ellipse & (yy > cy + 4))
    ears = np.zeros_like(master)
    for x0, y0, x1, y1 in EAR_BOXES:
        ears |= (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
    head = master & (yy < HEAD_MAX_Y)
    # behind the ears: only the DARK hair (ear shading is lighter) so the locks stay connected to the hair mass
    neck = (np.abs(xx - cx) < NECK_SHADOW[0]) & (yy >= NECK_SHADOW[1])
    hair = head & (brown | dark) & ~inner & ~neck & (~ears | (L < 95))
    hair = ndi.binary_closing(hair, iterations=2)
    hair = ndi.binary_fill_holes(hair) & head & ~inner & ~neck & (~ears | (L < 95))
    hair = mb.keep_large(hair, 0.01)
    hair |= head & ndi.binary_dilation(hair, iterations=1) & (yy < 60) & ~skin_c
    # clothes
    below = master & ~hair & (yy >= HEAD_MAX_Y - 6)
    # clothes = everything below the head that is not skin-coloured (any lightness: shadowed skin is still orange-ish); thin ink outlines drop out in the opening
    skin_like = (rgb[..., 0] > rgb[..., 1] + 18) & (rgb[..., 1] > rgb[..., 2] + 6)     # real skin is red-green 40-60 apart, warm-shaded white only ~8
    fabric = below & ~skin_like
    fabric = ndi.binary_opening(fabric, iterations=1) | (fabric & green)
    filled = ndi.binary_fill_holes(fabric) & below
    clothing = filled & ~(skin_like & ~ndi.binary_erosion(filled, iterations=2))
    hem = hem_curve(L, (white | green) & master)[None, :]
    shoes = mb.keep_large(clothing & (yy >= SOCKS_MIN_Y), 0.05)
    top = mb.keep_large(clothing & (yy < hem) & (yy < SOCKS_MIN_Y), 0.05)
    bottom = mb.keep_large(clothing & (yy >= hem) & (yy < SOCKS_MIN_Y), 0.05)
    # smooth garment edges; the white hem band is the lowest thing the shorts have, so whatever lies under it (the shadow of the thigh) is not shorts
    top, bottom, shoes = smooth_mask(top, 1.2) & master, smooth_mask(bottom, 1.2) & master, smooth_mask(shoes, 1.2) & master
    band = bottom & (yy >= 520) & white
    cols = np.arange(W)
    has = band.sum(axis=0) >= 3
    low = np.interp(cols, cols[has], (band * yy).max(axis=0)[has])      # columns where the band is shaded grey take their neighbours' line
    low = ndi.median_filter(low, size=9)[None, :]                          # one steady line: a per-column value would cut notches into the hem
    bottom &= yy <= low + 1
    skin = master & ~hair & ~top & ~bottom & ~shoes
    lab, n = ndi.label(skin)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    skin = (sizes >= MIN_SKIN_ISLAND)[lab]
    return dict(img=img, hard=master, alpha=alpha, rgb=rgb, L=L, hem=hem, hair=hair, top=top, bottom=bottom, shoes=shoes, skin=skin,
                white=white, green=green, brown=brown, dark=dark, xx=xx, yy=yy)


def debug_image(R, path):
    o = (R["img"]).copy().astype(np.uint8)
    tint = {"hair": (255, 0, 255), "top": (0, 255, 255), "bottom": (255, 255, 0), "shoes": (255, 128, 0), "skin": (0, 255, 0)}
    for k, c in tint.items():
        m = R[k]
        o[m] = (0.45 * o[m] + 0.55 * np.array(c)).astype(np.uint8)
    Image.fromarray(o).save(path)


def register_bald_head(L_master, L_bald, ref):
    """Grid-search the scale / shift that maps the bald figure's head onto the master's (NCC over the forehead and upper cheeks)."""
    ys, xs = np.where(ref)
    r = L_master[ys, xs]
    r = (r - r.mean()) / (r.std() + 1e-6)
    best = None
    for sc in np.arange(0.95, 1.071, 0.01):
        for dy in np.arange(-8, 8.1, 1.0):
            for dx in np.arange(-8, 8.1, 1.0):
                bx = (xs - AXIS_SRC_X) / sc + AXIS_SRC_X - dx
                by = (ys - EYE_LINE_Y) / sc + EYE_LINE_Y - dy
                v = ndi.map_coordinates(L_bald, [by, bx], order=1)
                v = (v - v.mean()) / (v.std() + 1e-6)
                score = float((r * v).mean())
                if best is None or score > best[0]:
                    best = (score, float(sc), float(dx), float(dy))
    return best


def warp_from_bald(arr, sc, dx, dy, shape):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    bx = (xx - AXIS_SRC_X) / sc + AXIS_SRC_X - dx
    by = (yy - EYE_LINE_Y) / sc + EYE_LINE_Y - dy
    return ndi.map_coordinates(arr.astype(np.float32), [by, bx], order=1, mode="constant")


def erase_number(rgb):
    """The master wears a baked number; the game draws its own. Plain fabric of the same columns further down is cloned over it with Poisson blending
    (cv2.seamlessClone): the borrowed folds take the colour of their new surroundings, so there is no visible patch edge."""
    x0, y0, x1, y1 = NUMBER_BOX
    dst = np.clip(rgb, 0, 255).astype(np.uint8)
    src = np.roll(dst, -NUMBER_SHIFT, axis=0)              # row y of src is row y + NUMBER_SHIFT of the master
    mask = np.zeros(dst.shape[:2], np.uint8)
    mask[y0:y1, x0:x1] = 255
    out = cv2.seamlessClone(src, dst, mask, ((x0 + x1) // 2, (y0 + y1) // 2), cv2.NORMAL_CLONE)
    return out.astype(np.float32)


def main(out_dir):
    img = load("master.jpg")
    R = regions(img)
    alpha, rgb, master = R["alpha"], R["rgb"], R["hard"]
    hair, top, bottom, shoes, skin, hem, xx, yy = R["hair"], R["top"], R["bottom"], R["shoes"], R["skin"], R["hem"], R["xx"], R["yy"]
    H, W = master.shape
    rgb = erase_number(rgb)
    L = lum(rgb)
    cx = FACE_ELLIPSE[0]

    # brows and eyes: only inside their boxes, from the master's own pixels
    dk = (R["brown"] | R["dark"])
    brows = np.zeros_like(master)
    for x0, y0, x1, y1 in BROW_BOXES:
        brows |= (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1) & dk & skin
    brows = mb.keep_large(brows, 0.15)
    sat = (rgb[..., 0] - rgb[..., 2]) / np.maximum(rgb[..., 0], 1)
    eyes = np.zeros_like(master)
    for x0, y0, x1, y1 in EYE_BOXES:
        box = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1) & skin & ~brows
        eyes |= box & (((sat < 0.22) & (L > 115)) | (L < 70))      # sclera + iris + lashes; the lids stay in the tinted skin

    # the bald reference: registered onto the master's head; it supplies the scalp only
    bimg = load("bald.jpg")
    bhard, bbg = figure(bimg)
    balpha, brgb = soft_alpha(bimg, bhard, bbg)
    Lb = lum(brgb) * (balpha > 0.5)
    face_ref = skin & (yy >= 48) & (yy <= 80) & (np.abs(xx - cx) < 24) & ~brows & ~eyes
    score, sc, dx, dy = register_bald_head(L, Lb, face_ref)
    print(f"bald head registration: NCC {score:.3f} scale {sc:.2f} shift ({dx:.1f}, {dy:.1f})")
    Lb_m = warp_from_bald(Lb, sc, dx, dy, (H, W))
    ab_m = warp_from_bald(balpha, sc, dx, dy, (H, W))
    sel = face_ref & (ab_m > 0.9)
    Lb_m = (Lb_m - Lb_m[sel].mean()) * (L[sel].std() / max(Lb_m[sel].std(), 1e-6)) + L[sel].mean()
    skull = (ab_m > 0.5) & (yy < 125) & (np.abs(xx - cx) < 60)
    scalp = skull & ndi.binary_dilation(hair, iterations=2) & ~skin

    # body greyscale: visible skin, the bald scalp under the hair, everything the clothes hide inpainted
    hidden = top | bottom | shoes
    inside = ~ndi.binary_dilation(~master, iterations=2)
    gL = np.where(skin, L, 0.0)
    w_bald = np.clip(1.0 - ndi.distance_transform_edt(~hair) / 3.0, 0, 1) * (ab_m > 0.5)
    gL = np.where(scalp, Lb_m, gL)
    gL = np.where(skin & (w_bald > 0), w_bald * Lb_m + (1 - w_bald) * L, gL)
    known = skin | scalp
    body_region = known | (hidden & inside)
    g8 = cv2.inpaint(np.clip(gL, 0, 255).astype(np.uint8), (body_region & ~known).astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)
    gL = np.where(known, gL, g8.astype(np.float32))
    gL = mb.fill_from_core(gL, ndi.binary_erosion(skin, iterations=2) | scalp, skin)
    near_edge = skin & (ndi.distance_transform_edt(master) <= 6)
    med = ndi.median_filter(gL, size=5)
    gL = np.where(near_edge & (gL < med - 22), med, gL)

    # trims: continuous whiteness over the fabric
    whiteness = np.clip((rgb.min(axis=2) - 75.0) / (175.0 - 75.0), 0, 1)

    def fabric_grey(region, trim_w):
        g8 = cv2.inpaint(np.clip(L, 0, 255).astype(np.uint8), ((trim_w > 0.25) & region).astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA)
        core = ndi.binary_erosion(region, iterations=1) & (trim_w < 0.25)
        return mb.fill_from_core(g8.astype(np.float32), core, region)

    ys, _ = np.where(master)
    P = mb.Placer(ys.min() - 1, ys.max(), AXIS_SRC_X)       # one source px of headroom: the soft edge of the topmost curl must stay inside the 72 px safe margin
    print(f"placement: scale {P.scale:.3f}, source rows {ys.min()}-{ys.max()} -> canvas {mb.TOP_Y}-{mb.BOTTOM_Y}")
    out = {}

    def extend(values, region):
        core = ndi.binary_erosion(region, iterations=1)
        return mb.fill_from_core(values, core if core.any() else region, ndi.binary_dilation(region, iterations=4) & ~core)

    def grey_layer(name, region, grey_src, alpha_hi, trim=False):
        g_hi = P.warp(extend(grey_src, region))
        mapped = mb.trim_grey(g_hi, alpha_hi) if trim else mb.grey_map(g_hi, alpha_hi)
        out[name] = mb.save_layer(os.path.join(out_dir, name), "grey", mapped, alpha_hi)

    body_hi = np.maximum(P.region(skin), P.region(scalp | (hidden & inside)))
    grey_layer("base/body.png", body_region | skin, gL, body_hi)
    top_w, bot_w = whiteness * top, whiteness * bottom
    grey_layer("outfits/jersey/top.png", top, fabric_grey(top, top_w), P.region(top))
    grey_layer("outfits/jersey/top_trim.png", top, mb.fill_from_core(L.copy(), top_w > 0.6, top), P.soft(top_w) * P.region(top), trim=True)
    bottom_ext = bottom | (ndi.binary_dilation(bottom, iterations=4) & top & (yy >= hem - 5))     # the shorts tuck under the jersey hem
    grey_layer("outfits/jersey/bottom.png", bottom_ext, fabric_grey(bottom_ext, bot_w), np.maximum(P.region(bottom), P.region(bottom_ext & ~bottom)))
    grey_layer("outfits/jersey/bottom_trim.png", bottom, mb.fill_from_core(L.copy(), bot_w > 0.6, bottom), P.soft(bot_w) * P.region(bottom), trim=True)
    shoes_rgb = np.stack([extend(rgb[..., c].copy(), shoes) for c in range(3)], -1)
    out["base/shoes.png"] = mb.save_layer(os.path.join(out_dir, "base/shoes.png"), "rgb", np.stack([P.warp(shoes_rgb[..., c]) for c in range(3)], -1), P.region(shoes))
    hair_grey = mb.fill_from_core(L.copy(), ndi.binary_erosion(hair, iterations=1), ndi.binary_dilation(hair, iterations=2))
    hair_hi = np.minimum(P.soft(alpha * ndi.binary_dilation(hair, iterations=2)), P.region(ndi.binary_dilation(hair, iterations=1)))
    grey_layer("hair/short/front.png", hair, hair_grey, hair_hi)
    grey_layer("hair/short/back.png", hair, hair_grey, np.minimum(hair_hi, P.region(hair & ~ndi.binary_dilation(skull, iterations=1))))
    skin_nb = skin & ~brows
    local = ndi.uniform_filter(np.where(skin_nb, L, 0), 9) / np.maximum(ndi.uniform_filter(skin_nb.astype(np.float32), 9), 1e-3)
    darkness = np.clip((local - L) / np.maximum(local - np.percentile(L[brows], 5), 1), 0, 1)
    brows_a = np.clip(ndi.gaussian_filter(brows.astype(np.float32), 0.6) * 1.4, 0, 1) * darkness
    grey_layer("base/brows.png", brows, mb.fill_from_core(L.copy(), brows, ndi.binary_dilation(brows, iterations=2)), P.soft(brows_a))
    eye_rgb = np.stack([P.warp(extend(rgb[..., c].copy(), eyes)) for c in range(3)], -1)
    out["base/face.png"] = mb.save_layer(os.path.join(out_dir, "base/face.png"), "rgb", eye_rgb, P.soft(np.clip(ndi.gaussian_filter(eyes.astype(np.float32), 0.45) * 1.5, 0, 1)))
    for name, arr in out.items():
        path = os.path.join(out_dir, name)
        print(f"  {name:32s} opaque px {int((arr[..., 3] > 250).sum()):7d}  bytes {os.path.getsize(path):7d}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_dir = args[0] if args else "/tmp/fem/out"
    if "--debug" in sys.argv:
        R = regions(load("master.jpg"))
        for k in ("hair", "top", "bottom", "shoes", "skin"):
            ys, xs = np.where(R[k])
            print(f"{k:7s} px {R[k].sum():6d}  x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}")
        debug_image(R, "/tmp/fem/dbg_regions.png")
    else:
        main(out_dir)
