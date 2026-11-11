"""Procedural Stylized basketball athlete (Blender `bpy`) -> rigged GLB + preview renders.

Workstream B. Independent of build_bobblehead.py: different proportions, different mesh, different skeleton.
Everything is generated here (no external assets), so the licence is "ours".

  /tmp/bpyenv/.venv/bin/python scripts/avatar/build_stylized.py --out /tmp/stylized \
      [--skin '#d9a477'] [--hair-color '#1b1b1b'] [--shirt '#1f6b45'] [--pants '#14281d'] \
      [--views front,three_quarter,side,back] [--no-glb] [--glb assets/avatar3d/stylized.glb]

Appearance contract (js/data/avatarLook.js): materials Skin / Hair / Shirt / Pants / Trim are recoloured at
runtime; bones follow BODY_BONE_GROUPS (Shoulder.L/R, Abdomen, Torso, UpperArm/LowerArm/UpperLeg/LowerLeg .L/.R, Head).
Front of the character is -Y (Blender), +Z in glTF. Units: metres, ~1.95 tall.
"""
import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--out", default="/tmp/stylized")
ap.add_argument("--skin", default="#d9a477")
ap.add_argument("--hair-color", default="#1b1b1b")
ap.add_argument("--shirt", default="#1f6b45")
ap.add_argument("--pants", default="#14281d")
ap.add_argument("--trim", default="#f4f4f0")
ap.add_argument("--outfit", default="jersey", choices=["jersey", "street"])
ap.add_argument("--views", default="three_quarter")
ap.add_argument("--samples", type=int, default=40)
ap.add_argument("--res", default="720x960")
ap.add_argument("--no-glb", action="store_true")
ap.add_argument("--glb", default="")
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def rgb(hex_):
    h = hex_.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), 1.0)


_mats = {}


def mat(name, hex_, rough=0.5, sheen=0.0, sss=0.0, metal=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgb(hex_)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
        b.inputs["Subsurface Scale"].default_value = 0.02
    _mats[name] = m
    return m


M = dict(
    skin=mat("Skin", args.skin, 0.52, sss=0.12), hair=mat("Hair", args.hair_color, 0.42),
    shirt=mat("Shirt", args.shirt, 0.62), pants=mat("Pants", args.pants, 0.66),
    trim=mat("Trim", args.trim, 0.55), eye=mat("Eye", "#f7f7f2", 0.15), pupil=mat("Pupil", "#1d1410", 0.1),
    brow=mat("Brow", "#2a1b12", 0.6), mouth=mat("Mouth", "#8f3b3b", 0.4), sock=mat("Sock", "#f4f4f0", 0.8),
    shoe=mat("Shoe", "#f2f2ee" if args.outfit == "jersey" else "#23262c", 0.45), sole=mat("Sole", "#e9e9e4" if args.outfit == "street" else "#26282c", 0.7),
    accent=mat("ShoeAccent", "#2d3138" if args.outfit == "jersey" else "#e85d04", 0.5),
    ball=mat("Ball", "#d9611a", 0.55), seam=mat("Seam", "#15110e", 0.7),
)

parts = []  # (object, bone name)


def finish(obj, material, bone, smooth=True, sub=0):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    if sub:
        mod = obj.modifiers.new("Sub", "SUBSURF")
        mod.levels = mod.render_levels = sub
    parts.append((obj, bone))
    return obj


def bake(obj):
    """Apply all modifiers into the mesh (so the glTF exporter only sees the armature)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear()
    old = obj.data
    obj.data = me
    bpy.data.meshes.remove(old)
    return obj


def ell(name, loc, scale, material, bone, rot=(0, 0, 0), seg=28, rings=16, sub=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1.0, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = Euler(rot)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, material, bone, sub=sub)


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    return o


def tube(name, pts, radii, material, bone, seg=24, caps=(True, True), smooth=True):
    """Elliptical tube along a polyline. radii[i] = (a, b): a along the horizontal axis, b across it."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        p = Vector(p)
        d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        a = Vector((1, 0, 0)) - d * d.x
        if a.length < 1e-4:
            a = Vector((0, 1, 0)) - d * d.y
        a.normalize()
        b = d.cross(a)
        ra, rb = radii[i] if isinstance(radii[i], (tuple, list)) else (radii[i], radii[i])
        ring = [bm.verts.new(p + a * (ra * math.cos(2 * math.pi * k / seg)) + b * (rb * math.sin(2 * math.pi * k / seg)))
                for k in range(seg)]
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    if caps[0]:
        bm.faces.new(rings[0][::-1])
    if caps[1]:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm)
    return finish(o, material, bone, smooth=smooth)


def lathe_z(name, rings, material, bone, seg=28):
    """Z-aligned elliptical loft. rings = [(z, rx, ry, cy)]."""
    return tube(name, [(0, cy, z) for z, rx, ry, cy in rings], [(rx, ry) for z, rx, ry, cy in rings], material, bone,
                seg=seg, caps=(True, True))


def solidify(o, t, offset=-1.0):
    mod = o.modifiers.new("Solid", "SOLIDIFY")
    mod.thickness, mod.offset, mod.use_even_offset = t, offset, True
    return o


def cut(o, cutter_specs):
    """Boolean-subtract spheres/boxes given as (kind, loc, scale)."""
    for kind, loc, sc in cutter_specs:
        if kind == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=loc, segments=24, ring_count=12)
        else:
            bpy.ops.mesh.primitive_cube_add(size=2.0, location=loc)
        c = bpy.context.active_object
        c.scale = sc
        mod = o.modifiers.new("Cut", "BOOLEAN")
        mod.operation, mod.object, mod.solver = "DIFFERENCE", c, "EXACT"
        bake(o)
        bpy.data.objects.remove(c, do_unlink=True)


# ---- skeleton ---------------------------------------------------------------------------------------------
# (name, parent, head, tail). Shoulder bones point UP so local X is world X: Shoulder scale then widens the arms.
SK = {
    "Hips": (None, (0, 0, 0.98), (0, 0, 1.06)),
    "Abdomen": ("Hips", (0, 0, 1.06), (0, 0, 1.24)),
    "Torso": ("Abdomen", (0, 0, 1.24), (0, 0, 1.52)),
    "Neck": ("Torso", (0, 0, 1.58), (0, 0, 1.70)),
    "Head": ("Neck", (0, 0, 1.70), (0, 0, 1.97)),
}
# (hip, knee, ankle): a relaxed asymmetric stance, the right foot a touch forward and turned out
LEG = {"L": ((0.100, 0, 0.96), (0.098, -0.006, 0.52), (0.090, 0.012, 0.115)),
       "R": ((-0.100, 0, 0.96), (-0.104, -0.040, 0.52), (-0.096, -0.024, 0.115))}
for s_, (hp, kn, an) in LEG.items():
    SK[f"UpperLeg.{s_}"] = ("Hips", hp, kn)
    SK[f"LowerLeg.{s_}"] = (f"UpperLeg.{s_}", kn, an)
    SK[f"Foot.{s_}"] = (f"LowerLeg.{s_}", an, (an[0], an[1] - 0.10, 0.04))
SHOULDER_Z = 1.53
ELBOW_L, WRIST_L = Vector((0.305, 0.02, 1.26)), Vector((0.31, -0.20, 1.07))     # holding-the-ball arm
ELBOW_R, WRIST_R = Vector((-0.318, 0.01, 1.245)), Vector((-0.345, -0.07, 0.975))    # relaxed arm
for s, (el, wr) in (("L", (ELBOW_L, WRIST_L)), ("R", (ELBOW_R, WRIST_R))):
    sx = 0.06 if s == "L" else -0.06
    ax = 0.235 if s == "L" else -0.235
    SK[f"Shoulder.{s}"] = ("Torso", (sx, 0, 1.50), (sx, 0, 1.60))
    SK[f"UpperArm.{s}"] = (f"Shoulder.{s}", (ax, 0, SHOULDER_Z), tuple(el))
    SK[f"LowerArm.{s}"] = (f"UpperArm.{s}", tuple(el), tuple(wr))
    SK[f"Hand.{s}"] = (f"LowerArm.{s}", tuple(wr), tuple(wr + (wr - el).normalized() * 0.09))
# The ball rides on its own Prop bone under Hand.L: build presets scale the arm chain (non-uniformly), and a ball skinned to
# the hand would be squashed with it. The viewer keeps Prop at unit scale (see keepPropUnscaled in avatar3d.js).
BALL_C = WRIST_L + (WRIST_L - ELBOW_L).normalized() * 0.05 + Vector((0, 0.0, 0.135))
SK["Prop"] = ("Hand.L", tuple(BALL_C), tuple(BALL_C + Vector((0, 0, 0.05))))

bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "Rig"
arm.data.name = "RigData"
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
for b in list(eb):
    eb.remove(b)
for name, (parent, head, tail) in SK.items():
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    if name.startswith("Shoulder"):
        b.roll = 0.0
for name, (parent, head, tail) in SK.items():
    if parent:
        eb[name].parent = eb[parent]
bpy.ops.object.mode_set(mode="OBJECT")

# ---- head -------------------------------------------------------------------------------------------------
HC, HRX, HRY, HRZ = Vector((0, 0.004, 1.818)), 0.112, 0.124, 0.138
bpy.ops.mesh.primitive_uv_sphere_add(segments=56, ring_count=32, radius=1.0, location=HC)
head = bpy.context.active_object
head.name = "Head"
bm = bmesh.new()
bm.from_mesh(head.data)
for v in bm.verts:
    nx, ny, nz = v.co
    x, y, z = nx * HRX, ny * HRY, nz * HRZ
    t = max(0.0, -nz)                                   # 0 at the equator, 1 at the chin
    x *= 1 - 0.24 * t ** 1.3                            # jaw tapers toward the chin
    y = y * (1 - 0.08 * t) - 0.016 * t ** 2 * (ny < 0)  # chin forward
    cheek = max(0.0, 1 - abs(nz + 0.12) * 3.0) * max(0.0, -ny)
    x *= 1 + 0.06 * cheek                               # cheekbones
    brow = max(0.0, 1 - abs(nz - 0.18) * 6.0) * max(0.0, -ny) ** 2
    y -= 0.006 * brow                                   # brow ridge
    socket = max(0.0, 1 - (abs(abs(nx) - 0.36) * 5 + abs(nz - 0.05) * 7)) * max(0.0, -ny)
    y += 0.007 * socket                                 # eye sockets
    v.co = Vector((x, y, z))
bm.to_mesh(head.data)
bm.free()
finish(head, M["skin"], "Head")


def surface(x, z, axis="y", side=-1):
    """Ray-cast onto the head. axis y: from the front (-Y) -> hit point; axis x: from the side."""
    o, d = ((Vector((x, -1.0, z)), Vector((0, 1, 0))) if axis == "y"
            else (Vector((side * 1.0, 0.004, z)), Vector((-side, 0, 0))))
    ok, loc, *_ = head.ray_cast(o - head.location, d)   # the head object's origin sits at its centre
    return loc + head.location if ok else None


for sx in (-1, 1):
    ex, ez = sx * 0.042, 1.810
    ey = surface(ex, ez).y
    ell(f"EyeW{sx}", (ex, ey + 0.006, ez), (0.0235, 0.012, 0.0165), M["eye"], "Head", seg=24, rings=14)
    ell(f"Iris{sx}", (ex - sx * 0.001, ey - 0.0035, ez - 0.001), (0.0128, 0.006, 0.0128), mat("Iris", "#4a3220", 0.2),
        "Head", seg=20, rings=12)
    ell(f"Pupil{sx}", (ex - sx * 0.001, ey - 0.0075, ez - 0.001), (0.0062, 0.0035, 0.0062), M["pupil"], "Head", seg=16, rings=10)
    ell(f"Shine{sx}", (ex - sx * 0.004 + 0.003, ey - 0.0095, ez + 0.004), (0.0026, 0.0015, 0.0026), M["eye"], "Head", seg=10, rings=6)
    ell(f"Lid{sx}", (ex, ey + 0.0035, ez + 0.0150), (0.0255, 0.0115, 0.0045), M["skin"], "Head", seg=20, rings=10)
    pb = surface(ex + sx * 0.003, 1.842)
    ell(f"Brow{sx}", (ex + sx * 0.003, pb.y + 0.0005, 1.842), (0.029, 0.0065, 0.0068), M["brow"], "Head",
        rot=(0, sx * math.radians(-8), 0), seg=16, rings=10)
    pe = surface(0, 1.795, "x", sx)
    ell(f"Ear{sx}", (pe.x - sx * 0.005, 0.014, 1.796), (0.009, 0.019, 0.031), M["skin"], "Head", rot=(0, 0, sx * 0.15),
        seg=16, rings=10)
pn = surface(0, 1.776)
ell("NoseBridge", (0, surface(0, 1.795).y + 0.002, 1.796), (0.0095, 0.012, 0.024), M["skin"], "Head")
ell("Nose", (0, pn.y - 0.006, 1.771), (0.0145, 0.018, 0.017), M["skin"], "Head", rot=(math.radians(-8), 0, 0))
ell("Nostrils", (0, pn.y - 0.0080, 1.760), (0.0165, 0.0075, 0.0070), M["skin"], "Head")
# smile: one smooth parabola, depth taken from the centre column only (per-point raycasts made it kink)
my = surface(0, 1.737).y
arc = [(-0.030 + 0.060 * i / 16, 1.739 - 0.0068 * (1 - ((i - 8) / 8) ** 2)) for i in range(17)]
tube("Mouth", [(x, my + 0.002 + 0.20 * x * x * 40, z) for x, z in arc], [0.0024] * 17, M["mouth"], "Head", seg=8)
ell("Lip", (0, surface(0, 1.722).y + 0.0035, 1.723), (0.016, 0.0048, 0.0048), M["skin"], "Head", seg=12, rings=8)

# hair: cap with a natural hairline; sides fade down to the ears, back to the nape
SM = lambda e0, e1, x: 0.0 if x <= e0 else (1.0 if x >= e1 else (lambda t: t * t * (3 - 2 * t))((x - e0) / (e1 - e0)))
bpy.ops.mesh.primitive_uv_sphere_add(segments=72, ring_count=48, radius=1.0, location=HC + Vector((0, 0.006, 0.008)))
hair = bpy.context.active_object
hair.name = "Hair"
bm = bmesh.new()
bm.from_mesh(hair.data)
# No deleted vertices (that leaves a stair-stepped edge): below the hairline the shell dives smoothly under the
# scalp, so the hairline is a soft, clean curve from every angle.
for v in bm.verts:
    nx, ny, nz = v.co
    front = SM(0.05, 0.62, -ny)
    temple = SM(0.28, 0.62, abs(nx)) * front            # M-shaped hairline: recedes at the temples
    back = SM(0.0, 0.5, ny)
    thr = -0.10 - 0.75 * back + 0.50 * front + 0.12 * temple   # sides: ear top; back: nape; front: high forehead
    above = SM(-0.16, 0.08, nz - thr)                   # 0 below the hairline -> 1 above it (wide = soft edge)
    side = SM(0.55, 0.95, abs(nx))                      # crop hugs the head at the sides (no mushroom bowl)
    shell = 0.88 + (0.175 - 0.035 * side) * above       # 0.88 sits inside the skin, ~1.055 is the hair surface
    lift = 1.0 + 0.06 * SM(0.3, 1.0, nz)                # a touch of volume on top
    v.co = Vector((nx * HRX * shell, ny * HRY * shell * (1 + 0.02 * above), nz * HRZ * shell * lift))
bm.to_mesh(hair.data)
bm.free()
finish(hair, M["hair"], "Head")

# neck + torso skin (sloped trapezius) -- the body every outfit is dressed onto
tube("Neck", [(0, 0.004, 1.60), (0, 0.010, 1.72)], [(0.064, 0.058), (0.058, 0.056)], M["skin"], "Neck", seg=24)
lathe_z("TorsoSkin", [(0.98, .168, .105, 0), (1.08, .166, .106, 0), (1.22, .186, .114, 0), (1.38, .218, .124, 0),
                      (1.48, .228, .118, 0), (1.565, .150, .088, 0), (1.635, .060, .058, 0.004)], M["skin"], "Torso", seg=32)


# ---- outfits: every garment is its own named object (Outfit_*), so a GLB can swap a whole outfit set --------
def shirt_body(name, rings, sleeves):
    o = lathe_z(name, rings, M["shirt"], "Torso", seg=40)
    solidify(o, 0.010)
    bake(o)
    cuts = [("sphere", (0.0, -0.10, 1.645), (0.074, 0.074, 0.090))]
    if not sleeves:
        cuts += [("sphere", (sx * 0.268, 0.0, 1.47), (0.086, 0.096, 0.104)) for sx in (1, -1)]
    cut(o, cuts)
    return o


def jersey():
    shirt_body("Outfit_Jersey", [(0.945, .224, .146, 0), (1.06, .220, .142, 0), (1.22, .222, .136, 0),
                                 (1.38, .245, .142, 0), (1.48, .250, .136, 0), (1.565, .160, .104, 0),
                                 (1.625, .094, .078, 0.004)], sleeves=False)
    tube("Outfit_JerseyHem", [(0, 0, 0.940), (0, 0, 0.968)], [(.230, .151)] * 2, M["trim"], "Torso", seg=40, caps=(False, False))
    bpy.ops.object.text_add(location=(0, -0.146, 1.25), rotation=(math.radians(90), 0, 0))
    txt = bpy.context.active_object
    txt.data.body, txt.data.size, txt.data.extrude = "23", 0.17, 0.006
    txt.data.align_x, txt.data.align_y = "CENTER", "CENTER"
    bpy.ops.object.convert(target="MESH")
    txt = bpy.context.active_object
    txt.name = "Outfit_Number"
    finish(txt, M["trim"], "Torso")
    shorts(long=False)
    socks()


def street():
    shirt_body("Outfit_Tee", [(0.93, .236, .152, 0), (1.06, .236, .150, 0), (1.22, .238, .146, 0),
                              (1.38, .255, .150, 0), (1.50, .262, .146, 0), (1.535, .238, .134, 0), (1.57, .170, .110, 0),
                              (1.62, .086, .074, 0.004)], sleeves=True)
    tube("Outfit_TeeStripe", [(0, 0, 1.335), (0, 0, 1.37)], [(.259, .153)] * 2, M["trim"], "Torso", seg=40, caps=(False, False))
    tube("Outfit_Collar", [(0, 0.004, 1.592), (0, 0.006, 1.612)], [(.066, .062)] * 2, M["trim"], "Torso", seg=28,
         caps=(False, False))
    for s, sx, el in (("L", 1, ELBOW_L), ("R", -1, ELBOW_R)):
        sh = Vector((sx * 0.228, 0, 1.51))
        o = tube(f"Outfit_Sleeve{s}", [sh + Vector((-sx * 0.030, 0, 0.0)), sh.lerp(el, 0.3), sh.lerp(el, 0.55)],
                 [.070, .069, .064], M["shirt"], f"UpperArm.{s}", seg=24, caps=(False, False))
        solidify(o, 0.008)
    # headband over the hair line
    tube("Outfit_Headband", [(0, 0.004, 1.868), (0, 0.006, 1.894)], [(.116, .128), (.112, .124)], M["trim"], "Head",
         seg=40, caps=(False, False))
    shorts(long=True)


def shorts(long):
    hip = lathe_z("Outfit_ShortsHip", [(1.085, .198, .130, 0), (1.00, .208, .136, 0), (0.92, .210, .136, 0)],
                  M["pants"], "Hips", seg=36)
    solidify(hip, 0.010)
    for s, (hp, kn, an) in LEG.items():
        top = Vector((hp[0] * 1.0, hp[1], 0.95))   # starts under the jersey hem, never wider than it
        kn, an = Vector(kn), Vector(an)
        if not long:   # long basketball cut, slight A-line, ends just above the knee
            o = tube(f"Outfit_ShortsLeg{s}", [top, top.lerp(kn, 0.5), kn + Vector((0, 0, 0.075))],
                     [(.100, .102), (.122, .124), (.136, .136)], M["pants"], f"UpperLeg.{s}", seg=30, caps=(False, False))
            solidify(o, 0.010)
            tube(f"Outfit_ShortsTrim{s}", [kn + Vector((0, 0, 0.077)), kn + Vector((0, 0, 0.098))], [.1405, .1395],
                 M["trim"], f"UpperLeg.{s}", seg=30, caps=(False, False))
        else:          # tapered joggers to the ankle, cuffed
            # one seamless tube: legs presets scale UpperLeg and LowerLeg identically and the idle clip never moves legs
            o = tube(f"Outfit_Pants{s}", [top, top.lerp(kn, 0.5), kn, kn.lerp(an, 0.5), an + Vector((0, 0, 0.04))],
                     [.102, .100, .090, .080, .066], M["pants"], f"UpperLeg.{s}", seg=28, caps=(False, False))
            solidify(o, 0.008)
            tube(f"Outfit_Cuff{s}", [an + Vector((0, 0, 0.02)), an + Vector((0, 0, 0.05))], [.062, .064], M["trim"],
                 f"LowerLeg.{s}", seg=24, caps=(False, False))


def socks():
    for s, (hp, kn, an) in LEG.items():
        an = Vector(an)
        tube(f"Outfit_Sock{s}", [an + Vector((0, 0, 0.19)), an + Vector((0, 0.002, 0.04)), an - Vector((0, 0, 0.03))],
             [.062, .051, .050], M["sock"], f"LowerLeg.{s}", seg=24, caps=(False, False))
        tube(f"Outfit_SockBand{s}", [an + Vector((0, 0, 0.16)), an + Vector((0, 0, 0.18))], [.0615, .0635], M["trim"],
             f"LowerLeg.{s}", seg=24, caps=(False, False))


(jersey if args.outfit == "jersey" else street)()

# ---- arms -------------------------------------------------------------------------------------------------
for s, sx, el, wr in (("L", 1, ELBOW_L, WRIST_L), ("R", -1, ELBOW_R, WRIST_R)):
    sh = Vector((sx * 0.228, 0, 1.51))
    if args.outfit == "jersey":   # a sleeve covers the shoulder cap; a bare one needs the deltoid
        ell(f"Delt{s}", sh + Vector((0, 0, -0.004)), (0.052, 0.056, 0.056), M["skin"], f"UpperArm.{s}")
    arm_top = sh if args.outfit == "jersey" else sh.lerp(el, 0.2)   # under a sleeve the top is hidden anyway
    tube(f"UpperArm{s}", [arm_top, sh.lerp(el, 0.45) + Vector((sx * 0.004, 0.006, 0)), el], [.054, .050, .040], M["skin"],
         f"UpperArm.{s}", seg=22)
    ell(f"Elbow{s}", el, (0.040, 0.040, 0.040), M["skin"], f"LowerArm.{s}")
    tube(f"LowerArm{s}", [el, el.lerp(wr, 0.35), wr], [.040, .043, .029], M["skin"], f"LowerArm.{s}", seg=22)
    d = (wr - el).normalized()
    rot = tuple(Vector((0, 0, 1)).rotation_difference(d).to_euler())
    ell(f"Palm{s}", wr + d * 0.050, (0.036, 0.019, 0.055), M["skin"], f"Hand.{s}", rot=rot)
    ell(f"Fingers{s}", wr + d * 0.098, (0.033, 0.016, 0.030), M["skin"], f"Hand.{s}", rot=rot)
    ell(f"Thumb{s}", wr + d * 0.035 + Vector((-sx * 0.020, -0.020, 0.0)), (0.012, 0.012, 0.032), M["skin"], f"Hand.{s}", rot=rot)
    if args.outfit == "jersey":
        tube(f"Outfit_Wrist{s}", [wr - d * 0.035, wr + d * 0.012], [.0335, .0335], M["trim"], f"LowerArm.{s}", seg=20,
             caps=(False, False))

# ---- legs and shoes ---------------------------------------------------------------------------------------
for s, (hp, kn, an) in LEG.items():
    sx = 1 if s == "L" else -1
    top, knee, ankle = Vector((hp[0] * 0.95, hp[1], 0.96)), Vector(kn), Vector(an)
    tube(f"Thigh{s}", [top, top.lerp(knee, 0.45) + Vector((0, -0.006, 0)), knee], [.090, .078, .058], M["skin"],
         f"UpperLeg.{s}", seg=24)
    ell(f"Knee{s}", knee + Vector((0, -0.006, 0)), (0.053, 0.054, 0.056), M["skin"], f"LowerLeg.{s}")
    tube(f"Calf{s}", [knee, knee.lerp(ankle, 0.30) + Vector((0, 0.014, 0)), knee.lerp(ankle, 0.75), ankle],
         [.057, .064, .046, .040], M["skin"], f"LowerLeg.{s}", seg=24)
    # sneaker (Outfit_Shoe*): midsole, upper, toe box, high collar, laces, heel counter, side stripe
    fx, fy = ankle.x, ankle.y - 0.045
    turn = (0, 0, math.radians(sx * 6))
    ell(f"Outfit_Sole{s}", (fx, fy, 0.020), (0.060, 0.148, 0.022), M["sole"], f"Foot.{s}", rot=turn)
    ell(f"Outfit_Upper{s}", (fx, fy - 0.010, 0.068), (0.058, 0.134, 0.058), M["shoe"], f"Foot.{s}", rot=turn)
    ell(f"Outfit_Toe{s}", (fx - sx * 0.008, fy - 0.092, 0.050), (0.052, 0.058, 0.040), M["shoe"], f"Foot.{s}", rot=turn)
    ell(f"Outfit_Heel{s}", (fx, fy + 0.098, 0.068), (0.050, 0.030, 0.046), M["accent"], f"Foot.{s}", rot=turn)
    tube(f"Outfit_Collar{s}", [(fx, ankle.y, 0.090), (fx, ankle.y + 0.004, 0.145)], [(.055, .055), (.052, .053)],
         M["shoe"], f"Foot.{s}", seg=24, caps=(False, False))
    tube(f"Outfit_CollarRim{s}", [(fx, ankle.y + 0.004, 0.140), (fx, ankle.y + 0.004, 0.152)], [.0535, .0535],
         M["accent"], f"Foot.{s}", seg=24, caps=(False, False))
    for i in range(3):
        ell(f"Outfit_Lace{s}{i}", (fx, fy - 0.035 + i * 0.026, 0.118 - i * 0.004), (0.026, 0.006, 0.004), M["trim"],
            f"Foot.{s}", rot=(math.radians(-22), 0, turn[2]), seg=10, rings=6)
    ell(f"Outfit_Stripe{s}", (fx + sx * 0.055, fy - 0.010, 0.066), (0.005, 0.070, 0.016), M["accent"], f"Foot.{s}",
        rot=(math.radians(14), 0, turn[2]))
# ---- basketball resting on the left palm ------------------------------------------------------------------
ball_c = BALL_C
ell("Ball", ball_c, (0.121, 0.121, 0.121), M["ball"], "Prop", seg=40, rings=24, sub=0)
for i, rot in enumerate(((math.radians(90), 0, 0), (0, math.radians(90), 0), (0, 0, 0))):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.1215, minor_radius=0.0028, major_segments=64, minor_segments=8,
                                     location=ball_c, rotation=rot)
    t = bpy.context.active_object
    t.name = f"Seam{i}"
    finish(t, M["seam"], "Prop")
bpy.ops.mesh.primitive_torus_add(major_radius=0.0865, minor_radius=0.0028, major_segments=48, minor_segments=8,
                                 location=ball_c + Vector((0, 0, 0.086)), rotation=(0, 0, 0))
finish(bpy.context.active_object, M["seam"], "Prop")

# ---- bind: one vertex group per part (rigid skinning, so Shoulder/Torso/Head scale presets just work) -------
three_name = lambda n: "".join(c for c in n.replace(" ", "_") if c not in "[].:/")  # THREE.PropertyBinding.sanitizeNodeName
bone_names = {three_name(n) for n in SK}
for o, bone in parts:
    if o.modifiers:
        bake(o)
    if three_name(o.name) in bone_names:   # GLTFLoader de-duplicates names: a "Head" mesh would rename the Head bone to Head_1
        o.name = f"Body_{o.name}"
    vg = o.vertex_groups.new(name=bone)
    vg.add([v.index for v in o.data.vertices], 1.0, "REPLACE")
    mod = o.modifiers.new("Rig", "ARMATURE")
    mod.object = arm
    o.parent = arm

# ---- idle clip (rotation only: presets scale bones, so the clip must never carry scale) -------------------
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
act = bpy.data.actions.new("Idle")
arm.animation_data_create().action = act
FR = 48


def key(bone, frame, rot):
    pb = arm.pose.bones[bone]
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = Euler([math.radians(r) for r in rot])
    pb.keyframe_insert("rotation_euler", frame=frame)


for bone, amp in (("Torso", (1.4, 0, 0)), ("Head", (-0.8, 0.0, 0)), ("UpperArm.R", (0, 0, 1.0)), ("Abdomen", (0.6, 0, 0))):
    key(bone, 1, (0, 0, 0))
    key(bone, FR // 2, amp)
    key(bone, FR + 1, (0, 0, 0))
key("Head", 12, (0, 4.0, 0))
key("Head", 36, (0, -4.0, 0))
for bone in ("Head",):
    for fc in act.fcurves if hasattr(act, "fcurves") else []:
        pass
scene.frame_start, scene.frame_end = 1, FR + 1
bpy.ops.object.mode_set(mode="OBJECT")
for pb in arm.pose.bones:
    pb.rotation_euler = (0, 0, 0)

# ---- report: bone axes sanity (Shoulder local X should be world X) ----------------------------------------
for n in ("Shoulder.L", "Torso", "UpperArm.L"):
    mx = arm.data.bones[n].matrix_local.to_3x3()
    print("axes", n, [tuple(round(c, 2) for c in mx.col[i]) for i in range(3)])

# ---- stage ------------------------------------------------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, -0.001))
fl = bpy.context.active_object
fl.data.materials.append(mat("Floor", "#c7cdd1", 0.9))
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = rgb("#d5dadd")
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
look_at = bpy.data.objects.new("LookAt", None)
look_at.location = (0, 0, 1.0)
scene.collection.objects.link(look_at)


def area(name, loc, energy, size, color="#ffffff"):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.size = energy, size
    d.color = rgb(color)[:3]
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    c = o.constraints.new("TRACK_TO")
    c.target = look_at
    c.track_axis, c.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"


area("Key", (-2.2, -3.0, 3.0), 520, 2.2, "#fff4e6")
area("Fill", (3.0, -2.4, 1.4), 170, 3.0, "#e6f0ff")
area("Rim", (1.6, 3.2, 2.6), 520, 1.6)
area("Top", (0, 0, 4.0), 120, 2.5)
cam_d = bpy.data.cameras.new("Cam")
cam_d.lens = 85
cam = bpy.data.objects.new("Cam", cam_d)
scene.collection.objects.link(cam)
scene.camera = cam
tr = cam.constraints.new("TRACK_TO")
tr.target = look_at
tr.track_axis, tr.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = (int(v) for v in args.res.split("x"))
for vt in ("Khronos PBR Neutral", "AgX", "Standard"):
    try:
        scene.view_settings.view_transform = vt
        break
    except TypeError:
        continue

VIEWS = {"front": 0, "three_quarter": 32, "side": 90, "back": 180, "face": 0}
for name in [v for v in args.views.split(",") if v]:
    a = math.radians(VIEWS[name])
    if name == "face":
        cam.location, look_at.location = (0.0, -1.35, 1.80), (0, 0, 1.79)
        cam_d.lens = 110
    else:
        d = 5.3
        cam.location = (math.sin(a) * d, -math.cos(a) * d, 1.15)
        look_at.location = (0, 0, 0.99)
        cam_d.lens = 85
    scene.render.filepath = os.path.join(args.out, f"stylized_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)

if not args.no_glb:
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception as e:  # noqa: BLE001
        print("gltf addon enable:", e)
    for o in list(bpy.data.objects):
        if o.name in ("Cam", "LookAt") or o.type in ("LIGHT", "CAMERA") or o.name.startswith("Plane"):
            bpy.data.objects.remove(o, do_unlink=True)
    glb = args.glb or os.path.join(args.out, "stylized.glb")
    os.makedirs(os.path.dirname(os.path.abspath(glb)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_yup=True, export_animations=True,
                              export_apply=False, export_skins=True)
    print("exported", glb, os.path.getsize(glb))
