"""Procedural Bobblehead character (Blender `bpy`) -> GLB + preview renders.

Reproducible: no external assets, every shape is generated here, so the licence is "ours".
Run (bpy lives in a venv because the Blender installer is blocked on the corporate network):
  /tmp/bpyenv/.venv/bin/python scripts/avatar/build_bobblehead.py --out /tmp/bobble [--hair curly|short|bald]
       [--skin '#c68642'] [--shirt '#5b2a86'] [--shorts '#f0b429'] [--views front,three_quarter,side,back] [--no-glb]

Front of the character is -Y (Blender's default front view). Units: metres, character ~1.0 tall, head radius 0.30.
"""
import argparse
import math
import os
import random
import sys

import bpy
from mathutils import Euler, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--out", default="/tmp/bobble")
ap.add_argument("--hair", default="curly", choices=["curly", "short", "bald"])
ap.add_argument("--skin", default="#b57849")
ap.add_argument("--hair-color", default="#5a3418")
ap.add_argument("--shirt", default="#5b2a86")
ap.add_argument("--shorts", default="#f0b429")
ap.add_argument("--trim", default="#f0b429")
ap.add_argument("--shoes", default="#f6f6f4")
ap.add_argument("--views", default="three_quarter")
ap.add_argument("--samples", type=int, default=48)
ap.add_argument("--res", default="720x900")
ap.add_argument("--no-glb", action="store_true")
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
HEAD_R, HEAD_Z = 0.30, 0.74


def rgb(hex_):
    h = hex_.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), 1.0)


_mats = {}


def mat(name, hex_, rough=0.38, spec=0.5, sheen=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgb(hex_)
    bsdf.inputs["Roughness"].default_value = rough
    for key in ("Specular IOR Level", "Specular"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = spec
            break
    m.diffuse_color = rgb(hex_)
    _mats[name] = m
    return m


def finish(obj, material, smooth=True, subsurf=1):
    obj.data.materials.append(material)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    if subsurf:
        mod = obj.modifiers.new("sub", "SUBSURF")
        mod.levels = subsurf
        mod.render_levels = subsurf
    return obj


def sphere(name, loc, r=1.0, scale=(1, 1, 1), material=None, rot=(0, 0, 0), seg=32, rings=18):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=rings)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = Euler(rot)
    return finish(o, material, subsurf=0)


def surf(x, z, extra=0.0):
    """-Y coordinate of the head surface at (x, z) (a point just in front of the face)."""
    dx, dz = x, z - HEAD_Z
    inside = max(HEAD_R ** 2 - dx * dx - dz * dz, 1e-6)
    return -(math.sqrt(inside) + extra)


skin = mat("Skin", args.skin, rough=0.42, spec=0.45)
skin_dark = mat("SkinShade", "#9a6238", rough=0.5)
shirt = mat("Jersey", args.shirt, rough=0.55, spec=0.3)
trim = mat("Trim", args.trim, rough=0.45)
shorts = mat("Shorts", args.shorts, rough=0.55, spec=0.3)
shoe = mat("Shoe", args.shoes, rough=0.28, spec=0.7)
sole = mat("Sole", "#c9ced3", rough=0.45)
lace = mat("Lace", "#ff6a1a", rough=0.35)
white = mat("EyeWhite", "#ffffff", rough=0.15, spec=0.8)
iris = mat("Iris", "#3a1d0e", rough=0.12, spec=0.9)
dark = mat("Dark", "#140a05", rough=0.3)
mouth = mat("Mouth", "#7a1f1f", rough=0.35)
hair_m = mat("Hair", args.hair_color, rough=0.5, spec=0.35)
band = mat("Headband", "#12b5a4", rough=0.5)
ball_m = mat("Ball", "#e8650c", rough=0.6, spec=0.2)
sock = mat("Sock", "#ffffff", rough=0.6)

# ---- head ------------------------------------------------------------------------------------------------
sphere("Head", (0, 0, HEAD_Z), HEAD_R, (1.0, 0.96, 0.97), skin, seg=48, rings=28)
sphere("Neck", (0, 0, 0.47), 0.07, (1, 1, 1.15), skin)
for sx in (-1, 1):
    sphere(f"Ear{sx}", (sx * 0.295, 0.0, HEAD_Z - 0.01), 0.055, (0.55, 0.8, 1.0), skin)
    sphere(f"EarIn{sx}", (sx * 0.30, -0.012, HEAD_Z - 0.01), 0.03, (0.35, 0.6, 0.8), skin_dark)
    ex, ez = sx * 0.112, HEAD_Z + 0.025
    y = surf(ex, ez) + 0.026
    sphere(f"Eye{sx}", (ex, y, ez), 0.064, (1.0, 0.55, 1.15), white)
    sphere(f"Iris{sx}", (ex + sx * 0.003, y - 0.026, ez - 0.004), 0.043, (1.0, 0.5, 1.05), iris)
    sphere(f"Pupil{sx}", (ex + sx * 0.003, y - 0.042, ez - 0.004), 0.025, (1, 0.5, 1), dark)
    sphere(f"Glint{sx}", (ex + sx * 0.018, y - 0.050, ez + 0.018), 0.012, (1, 0.5, 1), white)
    bz = ez + 0.098
    sphere(f"Brow{sx}", (ex, surf(ex, bz) - 0.004, bz), 0.052, (1.0, 0.34, 0.26), dark, rot=(0, math.radians(sx * -12), 0))
    cx, cz = sx * 0.19, HEAD_Z - 0.075
    sphere(f"Cheek{sx}", (cx, surf(cx, cz) - 0.002, cz), 0.04, (1.1, 0.25, 0.8), mat("Blush", "#d9825a", rough=0.6))
sphere("Nose", (0, surf(0, HEAD_Z - 0.035) - 0.016, HEAD_Z - 0.035), 0.036, (1.0, 0.85, 0.85), skin_dark)

# smile: a bevelled curve laid on the face
curve = bpy.data.curves.new("Smile", "CURVE")
curve.dimensions = "3D"
curve.bevel_depth = 0.0075
curve.bevel_resolution = 4
spline = curve.splines.new("BEZIER")
pts = [(-0.085, HEAD_Z - 0.115), (-0.045, HEAD_Z - 0.152), (0.0, HEAD_Z - 0.162), (0.045, HEAD_Z - 0.152), (0.085, HEAD_Z - 0.115)]
spline.bezier_points.add(len(pts) - 1)
for bp, (x, z) in zip(spline.bezier_points, pts):
    bp.co = Vector((x, surf(x, z) - 0.006, z))
    bp.handle_left_type = bp.handle_right_type = "AUTO"
smile = bpy.data.objects.new("Smile", curve)
scene.collection.objects.link(smile)
smile.data.materials.append(mouth)
sphere("Tongue", (0, surf(0, HEAD_Z - 0.152) - 0.004, HEAD_Z - 0.146), 0.03, (1.5, 0.3, 0.5), mat("Tongue", "#d35a5a", rough=0.4))

# ---- hair + headband -------------------------------------------------------------------------------------
bpy.ops.mesh.primitive_torus_add(location=(0, 0, HEAD_Z + 0.11), major_radius=0.298, minor_radius=0.034, major_segments=64, minor_segments=16)
tb = bpy.context.active_object
tb.name = "Headband"
tb.scale = (1.0, 0.96, 0.9)
tb.rotation_euler = Euler((math.radians(-7), 0, 0))
finish(tb, band, subsurf=0)

rng = random.Random(7)
if args.hair == "curly":
    spots = []
    for _ in range(400):
        theta = rng.uniform(0, 2 * math.pi)
        phi = rng.uniform(0.0, math.radians(86))        # 0 = crown, 86 = down to the headband
        n = Vector((math.sin(phi) * math.cos(theta), math.sin(phi) * math.sin(theta), math.cos(phi)))
        if n.y < -0.35 and n.z < 0.8:                    # keep the face and forehead open
            continue
        if any((n - m).length < 0.34 for m in spots):
            continue
        spots.append(n)
    for i, n in enumerate(spots):
        r = rng.uniform(0.062, 0.088)
        p = Vector((0, 0, HEAD_Z)) + n * (HEAD_R * 1.0 + r * 0.55)
        sphere(f"Curl{i}", tuple(p), r, (1, 1, rng.uniform(0.9, 1.25)), hair_m, seg=16, rings=10)
    for i in range(7):                                   # big irregular curls along the hairline, not a corrugated strip
        x = -0.21 + 0.42 * i / 6 + rng.uniform(-0.018, 0.018)
        z = HEAD_Z + 0.215 + 0.045 * math.cos(x * 5) + rng.uniform(-0.01, 0.015)
        sphere(f"Fringe{i}", (x, surf(x, z) + rng.uniform(0.0, 0.02) - 0.02, z + 0.025), rng.uniform(0.062, 0.088), (1, 1, rng.uniform(0.95, 1.3)), hair_m, seg=16, rings=10)
elif args.hair == "short":
    sphere("HairCap", (0, 0.015, HEAD_Z + 0.035), HEAD_R * 1.04, (1.02, 1.0, 0.97), hair_m, seg=48, rings=28)
    # cut the cap off at the forehead by a skin-coloured face disc in front of it
    sphere("Forehead", (0, -0.075, HEAD_Z - 0.03), 0.285, (0.9, 0.78, 0.9), skin, seg=40, rings=22)

# ---- body ------------------------------------------------------------------------------------------------
sphere("Torso", (0, 0.0, 0.335), 0.5, (0.205 / 0.5 * 1.0, 0.145 / 0.5, 0.195 / 0.5), shirt, seg=40, rings=24)
sphere("Collar", (0, -0.02, 0.50), 0.5, (0.10 / 0.5, 0.075 / 0.5, 0.040 / 0.5), trim)
sphere("HemStripe", (0, 0.0, 0.245), 0.5, (0.215 / 0.5, 0.152 / 0.5, 0.030 / 0.5), trim)
sphere("Shorts", (0, 0.0, 0.205), 0.5, (0.215 / 0.5, 0.155 / 0.5, 0.080 / 0.5), shorts, seg=40, rings=22)
# jersey number: a real text object (Blender's bundled font), extruded a hair, converted to a mesh
txt = bpy.data.curves.new("Num", "FONT")
txt.body, txt.align_x, txt.align_y, txt.size, txt.extrude, txt.bevel_depth = "7", "CENTER", "CENTER", 0.17, 0.006, 0.002
num = bpy.data.objects.new("Num", txt)
scene.collection.objects.link(num)
num.location = (0, -0.139, 0.345)
num.rotation_euler = Euler((math.radians(90), 0, 0))
num.data.materials.append(trim)
bpy.context.view_layer.objects.active = num
num.select_set(True)
bpy.ops.object.convert(target="MESH")

for sx in (-1, 1):
    # legs: short and chunky, sock band, giant shoes
    sphere(f"Leg{sx}", (sx * 0.085, 0.0, 0.095), 0.5, (0.058 / 0.5, 0.058 / 0.5, 0.100 / 0.5), skin)
    sphere(f"Sock{sx}", (sx * 0.085, 0.0, 0.070), 0.5, (0.066 / 0.5, 0.066 / 0.5, 0.038 / 0.5), sock)
    sphere(f"Shoe{sx}", (sx * 0.092, -0.050, 0.030), 0.5, (0.105 / 0.5, 0.185 / 0.5, 0.075 / 0.5), shoe, rot=(0, 0, math.radians(sx * 8)), seg=36, rings=20)
    sphere(f"Sole{sx}", (sx * 0.092, -0.050, 0.006), 0.5, (0.112 / 0.5, 0.192 / 0.5, 0.024 / 0.5), sole, rot=(0, 0, math.radians(sx * 8)), seg=36, rings=14)
    sphere(f"ShoeTop{sx}", (sx * 0.090, -0.020, 0.072), 0.5, (0.060 / 0.5, 0.075 / 0.5, 0.030 / 0.5), lace)
    # shoulders / arms / hands
    sphere(f"Shoulder{sx}", (sx * 0.205, 0.0, 0.43), 0.062, (1, 1, 1), shirt)

def limb(name, p0, p1, r, material, band_mat=None, hand_r=0.064):
    """Arm = ellipsoid from shoulder p0 to hand p1 (so it always connects), wristband on it, ball-shaped hand at the end."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    rot = tuple(d.to_track_quat("Z", "Y").to_euler())
    sphere(name, tuple((p0 + p1) / 2), 1.0, (r, r, d.length / 2 * 1.08), material, rot=rot)
    if band_mat:
        sphere(name + "Band", tuple(p1 - d.normalized() * 0.045), 1.0, (r * 1.12, r * 1.12, 0.02), band_mat, rot=rot)
    sphere(name + "Hand", tuple(p1 + d.normalized() * 0.012), hand_r, (1, 1, 0.95), material)


bx, by, bz_ = 0.345, -0.175, 0.215                       # the ball; the right hand rests on top of it
limb("ArmL", (-0.205, 0.0, 0.43), (-0.29, -0.015, 0.235), 0.05, skin, band)
limb("ArmR", (0.205, 0.0, 0.43), (bx - 0.015, by + 0.005, bz_ + 0.100), 0.05, skin, band)
sphere("Ball", (bx, by, bz_), 0.105, (1, 1, 1), ball_m, seg=40, rings=24)
for i, rot in enumerate(((0, 0, 0), (math.radians(90), 0, 0), (0, math.radians(90), 0))):
    bpy.ops.mesh.primitive_torus_add(location=(bx, by, bz_), major_radius=0.1042, minor_radius=0.0042, major_segments=48, minor_segments=8)
    t = bpy.context.active_object
    t.name = f"Seam{i}"
    t.rotation_euler = Euler(rot)
    finish(t, dark, subsurf=0)

# ---- stage: ground, lights, camera -----------------------------------------------------------------------
bpy.ops.mesh.primitive_circle_add(radius=0.62, fill_type="NGON", location=(0, -0.02, 0.0))
base = bpy.context.active_object
base.name = "Base"
finish(base, mat("BaseGlass", "#dfe9ee", rough=0.15, spec=0.9), smooth=False, subsurf=0)
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.001))
floor = bpy.context.active_object
floor.name = "Floor"
finish(floor, mat("Floor", "#c9ccce", rough=0.9, spec=0.1), smooth=False, subsurf=0)

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = rgb("#d5dadd")
bg.inputs["Strength"].default_value = 0.55


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


look_at = bpy.data.objects.new("LookAt", None)
look_at.location = (0, 0, 0.58)
scene.collection.objects.link(look_at)
area("Key", (-1.6, -2.0, 2.0), 120, 1.6, "#fff4e6")
area("Fill", (2.0, -1.5, 0.9), 40, 2.5, "#e6f0ff")
area("Rim", (1.2, 2.2, 1.7), 150, 1.2, "#ffffff")
area("Top", (0, 0, 3.0), 35, 2.0)

cam_d = bpy.data.cameras.new("Cam")
cam_d.lens = 70
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
w, h = (int(v) for v in args.res.split("x"))
scene.render.resolution_x, scene.render.resolution_y = w, h
scene.render.film_transparent = False
for vt in ("Khronos PBR Neutral", "AgX", "Standard"):
    try:
        scene.view_settings.view_transform = vt
        break
    except TypeError:
        continue

VIEWS = {"front": 0, "three_quarter": 32, "side": 90, "back": 180}
for name in [v for v in args.views.split(",") if v]:
    a = math.radians(VIEWS[name])
    d = 3.3
    cam.location = (math.sin(a) * d, -math.cos(a) * d, 0.70)
    scene.render.filepath = os.path.join(args.out, f"bobble_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)

if not args.no_glb:
    for o in list(bpy.data.objects):
        if o.type in ("LIGHT", "CAMERA", "EMPTY") or o.name in ("Floor", "Base"):
            bpy.data.objects.remove(o, do_unlink=True)
    # Smile is a curve: make it a mesh, then merge everything per (group, material) so the game draws ~15 meshes, not 150.
    bpy.ops.object.select_all(action="DESELECT")
    smile_obj = bpy.data.objects["Smile"]
    bpy.context.view_layer.objects.active = smile_obj
    smile_obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    HEAD_PARTS = ("Head", "Ear", "Eye", "Iris", "Pupil", "Glint", "Brow", "Cheek", "Nose", "Smile", "Tongue", "Curl", "Fringe", "HairCap", "Forehead")
    root = bpy.data.objects.new("Bobblehead", None)
    pivot = bpy.data.objects.new("HeadPivot", None)
    pivot.location = (0, 0, 0.50)                       # the neck: the game wobbles this node
    for e in (root, pivot):
        scene.collection.objects.link(e)
    buckets = {}
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            buckets.setdefault(("Head" if o.name.startswith(HEAD_PARTS) else "Body", o.data.materials[0].name), []).append(o)
    for (grp, mname), objs in buckets.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        merged = bpy.context.active_object
        merged.name = f"{grp}_{mname}"
        parent = pivot if grp == "Head" else root
        merged.parent = parent
        merged.matrix_parent_inverse = parent.matrix_world.inverted()
    pivot.parent = root
    print("meshes after merge:", sum(1 for o in bpy.data.objects if o.type == "MESH"))
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception as e:  # noqa: BLE001
        print("gltf addon enable:", e)
    glb = os.path.join(args.out, "bobblehead.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True, export_yup=True)
    print("exported", glb, os.path.getsize(glb))
