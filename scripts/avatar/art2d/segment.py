"""Avatar 2D art pipeline, step 1: isolate the Style A master figure (left of src/style-a-master-sheet.jpg) and the bald reference
(second figure, same generation), soft-matte them off the white background and classify the master's pixels. Imported by build.py;
run directly to write debug images (dbg_classes.png, dbg_split.png) into the current directory."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "style-a-master-sheet.jpg")
SPLIT_ROWS = (222, 392)          # rows where the master's left forearm/hand touches the bald figure's right forearm/hand
SPLIT_COLS = (212, 246)          # the seam is searched only inside this band


def load():
    return np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)


def lum(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def seam_split(img):
    """Min-cost vertical seam (dark shadow line between the touching forearms) inside the band; columns left of it = master."""
    y0, y1 = SPLIT_ROWS
    x0, x1 = SPLIT_COLS
    cost = lum(img[y0:y1, x0:x1])
    # background-white is a free path; prefer dark shadow
    acc = cost.copy()
    back = np.zeros(acc.shape, dtype=np.int64)
    w = acc.shape[1]
    for y in range(1, acc.shape[0]):
        prev = acc[y - 1]
        left = np.r_[np.inf, prev[:-1]]
        right = np.r_[prev[1:], np.inf]
        stack = np.vstack([left, prev, right])
        k = np.argmin(stack, axis=0)
        acc[y] += stack[k, np.arange(w)]
        back[y] = np.arange(w) + (k - 1)
    seam = np.zeros(acc.shape[0], dtype=np.int64)
    seam[-1] = int(np.argmin(acc[-1]))
    for y in range(acc.shape[0] - 1, 0, -1):
        seam[y - 1] = back[y, seam[y]]
    out = np.full(img.shape[0], (x0 + x1) // 2, dtype=np.int64)
    out[y0:y1] = seam + x0
    return out


def figure_masks(img):
    """Hard foreground masks of the master and the bald figure (no background, no loose hair-cap object)."""
    fg = img.min(axis=2) < 244
    fg = ndi.binary_opening(fg, iterations=1)
    lab, n = ndi.label(fg)
    seam = seam_split(img)
    cols = np.arange(img.shape[1])[None, :]
    left = cols < seam[:, None]
    master_lab = np.bincount(lab[left & fg], minlength=n + 1)
    master_lab[0] = 0
    big = master_lab.argmax()
    master = (lab == big) & left
    bald = (lab == big) & ~left
    # keep only the largest component of each (drops specks)
    def largest(m):
        l, k = ndi.label(m)
        if k == 0:
            return m
        s = np.bincount(l.ravel())
        s[0] = 0
        return l == s.argmax()
    master = ndi.binary_fill_holes(largest(master)) & fg | largest(master)
    bald = largest(bald)
    return master, bald, seam


def soft_alpha(img, hard):
    """Alpha against the white background: interior = 1; across the edge, estimate from the colour's distance to white
    relative to the nearest interior colour. Returns (alpha, unpremultiplied rgb)."""
    interior = ndi.binary_erosion(hard, iterations=2)
    _, idx = ndi.distance_transform_edt(~interior, return_indices=True)
    near = img[idx[0], idx[1]]
    band = ndi.binary_dilation(hard, iterations=2) & ~interior
    dist_px = 255.0 - img.min(axis=2)
    dist_fg = np.maximum(255.0 - near.min(axis=2), 30.0)
    a = np.where(interior, 1.0, 0.0)
    a = np.where(band, np.clip(dist_px / dist_fg, 0, 1), a)
    a = np.where(hard & ~band, 1.0, a)
    a3 = a[..., None]
    rgb = np.where(a3 > 0.02, np.clip((img - (1 - a3) * 255.0) / np.maximum(a3, 1e-3), 0, 255), near)
    # edge colour: trust the nearest interior colour where alpha is small (avoids white fringes after recolouring)
    rgb = np.where(a3 < 0.6, near, rgb)
    return a, rgb


def classify(img, mask):
    """Per-pixel class of the master: 0 bg, 1 skin, 2 green fabric, 3 white/cream, 4 dark (hair, shoe dark, deep shadow), 5 other."""
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    mx, mn = img.max(axis=2), img.min(axis=2)
    L = lum(img)
    c = np.full(mask.shape, 5, np.uint8)
    skin = (r > g) & (g > b - 4) & (r - b > 28)
    green = (g - r > 10) & (g >= b - 6)
    white = (mn > 140) & (mx - mn < 48)
    dark = (L < 62) & ~green
    c[skin] = 1
    c[white] = 3
    c[green] = 2
    c[dark] = 4
    c[~mask] = 0
    return c


PALETTE = np.array([[255, 255, 255], [230, 160, 110], [20, 140, 60], [250, 250, 160], [20, 20, 20], [255, 0, 255]], np.uint8)

if __name__ == "__main__":
    img = load()
    master, bald, seam = figure_masks(img)
    ys, xs = np.where(master)
    print("master bbox x", xs.min(), xs.max(), "y", ys.min(), ys.max(), "px", master.sum())
    ys2, xs2 = np.where(bald)
    print("bald   bbox x", xs2.min(), xs2.max(), "y", ys2.min(), ys2.max(), "px", bald.sum())
    c = classify(img, master)
    for k, name in enumerate(["bg", "skin", "green", "white", "dark", "other"]):
        print(f"  {name:6s} {int((c == k).sum())}")
    vis = PALETTE[c][:, :250]
    Image.fromarray(vis).resize((750, 2049), Image.NEAREST).save("dbg_classes.png")
    both = np.zeros(img.shape, np.uint8) + 255
    both[master] = [60, 120, 255]
    both[bald] = [255, 120, 60]
    Image.fromarray(both[:, :460]).save("dbg_split.png")
