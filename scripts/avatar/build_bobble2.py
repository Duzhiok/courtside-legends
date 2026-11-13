"""Purpose-built Bobblehead toy (Blender `bpy`) -> assets/avatar3d/bobblehead.glb.

Not the Stylized man with a bigger head: a toy with its own proportions (head ~55% of the figure, stubby limbs, big
sneakers, big round eyes). It keeps the Stylized rig's BONE NAMES, the Prop bone, the material names (Skin / Hair /
Shirt / Pants / Trim ...) and the shared clip library, so the viewer, the outfit colours, the build presets and every
Stylized_* action work on it unchanged. Clips are solved from this skeleton's own limb lengths (stylized_clips.Rig).

  /tmp/bpyenv/.venv/bin/python scripts/avatar/build_bobble2.py --out /tmp/bb2 --views front,three_quarter,face \
      [--glb assets/avatar3d/bobblehead.glb]
"""
import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stylized_clips  # noqa: E402
import stylized_limbs  # noqa: E402
import stylized_merge  # noqa: E402
import stylized_props  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--out", default="/tmp/bobble2")
ap.add_argument("--skin", default="#d9a477")
ap.add_argument("--hair-color", default="#1b1b1b")
ap.add_argument("--shirt", default="#1f6b45")
ap.add_argument("--pants", default="#14281d")
ap.add_argument("--trim", default="#f4f4f0")
ap.add_argument("--views", default="three_quarter")
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--res", default="600x800")
ap.add_argument("--glb", default="")
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def rgb(hex_):
    h = hex_.lstrip("#")
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    r, g, b = (lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
    return (r, g, b, 1.0)


_mats = {}


def mat(name, hex_, rough=0.5, sss=0.0):
    if name not in _mats:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = rgb(hex_)
        b.inputs["Roughness"].default_value = rough
        if sss:
            b.inputs["Subsurface Weight"].default_value = sss
            b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
            b.inputs["Subsurface Scale"].default_value = 0.02
        _mats[name] = m
    return _mats[name]


M = dict(
    skin=mat("Skin", args.skin, 0.5, sss=0.12), hair=mat("Hair", args.hair_color, 0.6), shirt=mat("Shirt", args.shirt, 0.6),
    pants=mat("Pants", args.pants, 0.65), trim=mat("Trim", args.trim, 0.55), eye=mat("Eye", "#fbfbf7", 0.12),
    pupil=mat("Pupil", "#1d1410", 0.1), brow=mat("Brow", "#2a1b12", 0.6), mouth=mat("Mouth", "#8f3b3b", 0.4),
    sock=mat("Sock", "#f4f4f0", 0.8), shoe=mat("Shoe", "#f2f2ee", 0.4), sole=mat("Sole", "#26282c", 0.7),
    accent=mat("ShoeAccent", "#2d3138", 0.5), ball=mat("Ball", "#d9611a", 0.55), seam=mat("Seam", "#15110e", 0.7),
)
parts = []   # (object, bone)


def finish(o, material, bone):
    o.data.materials.clear()
    o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth = True
    parts.append((o, bone))
    return o


def ell(name, loc, scale, material, bone, rot=(0, 0, 0), seg=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1.0, location=loc)
    o = bpy.context.active_object
    o.name, o.scale, o.rotation_euler = name, scale, Euler(rot)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, material, bone)


def tube(name, pts, radii, material, bone, seg=24, caps=(True, True), ref=None):
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        p = Vector(p)
        d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        a = (Vector(ref) - d * Vector(ref).dot(d)) if ref else Vector((1, 0, 0)) - d * d.x   # ref pins the ring orientation (no twist on a horizontal tube)
        if a.length < 1e-4:
            a = Vector((0, 1, 0)) - d * d.y
        a.normalize()
        b = d.cross(a)
        ra, rb = radii[i] if isinstance(radii[i], (tuple, list)) else (radii[i], radii[i])
        rings.append([bm.verts.new(p + a * ra * math.cos(2 * math.pi * k / seg) + b * rb * math.sin(2 * math.pi * k / seg)) for k in range(seg)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    if caps[0]:
        bm.faces.new(rings[0][::-1])
    if caps[1]:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    return finish(o, material, bone)


# ---- skeleton: Stylized bone names, toy proportions (z up, front = -Y, character's left = +X) -----------------------
SK = {
    "Hips": (None, (0, 0, 0.34), (0, 0, 0.40)),
    "Abdomen": ("Hips", (0, 0, 0.40), (0, 0, 0.48)),
    "Torso": ("Abdomen", (0, 0, 0.48), (0, 0, 0.60)),
    "Neck": ("Torso", (0, 0, 0.62), (0, 0, 0.68)),
    "Head": ("Neck", (0, 0, 0.68), (0, 0, 1.06)),
}
LEG_X = 0.068
for s_, sx in (("L", 1), ("R", -1)):
    hp, kn, an = (sx * LEG_X, 0, 0.33), (sx * LEG_X, -0.004, 0.19), (sx * LEG_X, 0.0, 0.075)
    SK[f"UpperLeg.{s_}"] = ("Hips", hp, kn)
    SK[f"LowerLeg.{s_}"] = (f"UpperLeg.{s_}", kn, an)
    SK[f"Foot.{s_}"] = (f"LowerLeg.{s_}", an, (an[0], an[1] - 0.06, 0.035))
ARMS = {"L": (Vector((0.175, 0.02, 0.455)), Vector((0.18, -0.09, 0.405))),    # holds the ball
        "R": (Vector((-0.18, 0.01, 0.45)), Vector((-0.195, -0.03, 0.335)))}   # relaxed
for s_, (el, wr) in ARMS.items():
    sx = 1 if s_ == "L" else -1
    SK[f"Shoulder.{s_}"] = ("Torso", (sx * 0.04, 0, 0.55), (sx * 0.04, 0, 0.62))
    SK[f"UpperArm.{s_}"] = (f"Shoulder.{s_}", (sx * 0.135, 0, 0.58), tuple(el))
    SK[f"LowerArm.{s_}"] = (f"UpperArm.{s_}", tuple(el), tuple(wr))
    SK[f"Hand.{s_}"] = (f"LowerArm.{s_}", tuple(wr), tuple(wr + (wr - el).normalized() * 0.05))
BALL_R = 0.075
BALL_C = ARMS["L"][1] + (ARMS["L"][1] - ARMS["L"][0]).normalized() * 0.02 + Vector((0, 0, BALL_R + 0.012))
SK["Prop"] = ("Hand.L", tuple(BALL_C), tuple(BALL_C + Vector((0, 0, 0.03))))

bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name, arm.data.name = "Rig", "RigData"
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

# ---- head: the toy's whole point -------------------------------------------------------------------------------------
HC, HR = Vector((0, 0.0, 0.875)), (0.292, 0.272, 0.305)
ell("Head", HC, HR, M["skin"], "Head", seg=64, rings=40)
for sx in (1, -1):   # ears
    ell(f"Ear{sx}", (sx * 0.285, 0.01, 0.86), (0.030, 0.026, 0.050), M["skin"], "Head", seg=16, rings=10)
ell("Nose", (0, -0.268, 0.815), (0.030, 0.026, 0.026), M["skin"], "Head", seg=16, rings=10)
for sx in (1, -1):   # big round eyes, set on the face surface
    ex, ez = sx * 0.100, 0.865
    ey = -HR[1] * math.sqrt(max(0.0, 1 - (ex / HR[0]) ** 2 - ((ez - HC.z) / HR[2]) ** 2)) + 0.012
    ell(f"EyeWhite{sx}", (ex, ey, ez), (0.056, 0.030, 0.070), M["eye"], "Head", seg=28, rings=16)
    ell(f"Pupil{sx}", (ex + sx * 0.004, ey - 0.020, ez - 0.004), (0.036, 0.016, 0.046), M["pupil"], "Head", seg=20, rings=12)
    ell(f"Glint{sx}", (ex - 0.012 + sx * 0.004, ey - 0.032, ez + 0.020), (0.011, 0.006, 0.013), M["eye"], "Head", seg=10, rings=6)
    ell(f"Brow{sx}", (ex, ey - 0.004, ez + 0.098), (0.062, 0.014, 0.014), M["brow"], "Head", rot=(0, math.radians(-sx * 9), 0), seg=16, rings=8)
mz = 0.745   # smile: a flattened torus arc is overkill, a curved tube of 7 points reads fine
pts = [(x, -HR[1] * math.sqrt(max(0.0, 1 - (x / HR[0]) ** 2 - ((mz + 0.02 * (x / 0.07) ** 2 - HC.z) / HR[2]) ** 2)) + 0.004, mz + 0.022 * (x / 0.07) ** 2)
       for x in [i * 0.07 / 6 for i in range(-6, 7)]]
for i, (x, y, z) in enumerate(pts):   # a chain of beads reads as a smile and cannot twist like a swept tube
    ell(f"Mouth{i}", (x, y, z), (0.016, 0.009, 0.011), M["mouth"], "Head", seg=12, rings=8)
# hair: a cap over the top/back of the skull, hairline above the brows
bpy.ops.mesh.primitive_uv_sphere_add(segments=56, ring_count=32, radius=1.0, location=HC + Vector((0, 0.012, 0.012)))
hair = bpy.context.active_object
hair.name = "HairCap"
bm = bmesh.new()
bm.from_mesh(hair.data)
cut = [v for v in bm.verts if v.co.z < -0.05 or (v.co.y < -0.30 and v.co.z < 0.55)]
bmesh.ops.delete(bm, geom=cut, context="VERTS")
for v in bm.verts:
    v.co = Vector((v.co.x * (HR[0] + 0.012), v.co.y * (HR[1] + 0.014), v.co.z * (HR[2] + 0.016)))
bm.to_mesh(hair.data)
bm.free()
hair.modifiers.new("Solid", "SOLIDIFY").thickness = 0.01
bpy.context.view_layer.objects.active = hair
bpy.ops.object.modifier_apply(modifier="Solid")
finish(hair, M["hair"], "Head")
tube("Neck", [(0, 0, 0.60), (0, 0, 0.70)], [0.050, 0.046], M["skin"], "Neck")

# ---- body and outfit -------------------------------------------------------------------------------------------------
tube("Outfit_Jersey", [(0, 0, 0.34), (0, 0, 0.40), (0, 0, 0.50), (0, 0, 0.58), (0, 0, 0.625)],
     [(0.118, 0.088), (0.120, 0.090), (0.126, 0.092), (0.118, 0.086), (0.060, 0.056)], M["shirt"], "Torso", caps=(False, False))
tube("Outfit_Collar", [(0, 0, 0.598), (0, 0, 0.628)], [(0.062, 0.058), (0.056, 0.052)], M["trim"], "Torso", caps=(False, False))
tube("Outfit_Hem", [(0, 0, 0.335), (0, 0, 0.352)], [(0.119, 0.089), (0.119, 0.089)], M["trim"], "Torso", caps=(False, False))
tube("Outfit_PantsHip", [(0, 0, 0.395), (0, 0, 0.305)], [(0.124, 0.092), (0.128, 0.094)], M["pants"], "Hips")
for s_, sx in (("L", 1), ("R", -1)):
    x = sx * LEG_X
    tube(f"Outfit_ShortsLeg{s_}", [(x, 0, 0.32), (x, 0, 0.215)], [0.062, 0.066], M["pants"], f"UpperLeg.{s_}")
    tube(f"Leg_Upper{s_}", [(x, 0, 0.215), (x, -0.004, 0.19)], [0.040, 0.038], M["skin"], f"UpperLeg.{s_}")
    tube(f"Leg_Lower{s_}", [(x, -0.004, 0.19), (x, 0, 0.09)], [0.037, 0.034], M["skin"], f"LowerLeg.{s_}")
    tube(f"Outfit_Sock{s_}", [(x, 0, 0.14), (x, 0, 0.082)], [0.040, 0.038], M["sock"], f"LowerLeg.{s_}", caps=(True, False))
    ell(f"Outfit_Sole{s_}", (x, -0.028, 0.017), (0.064, 0.118, 0.018), M["sole"], f"Foot.{s_}")
    ell(f"Outfit_Upper{s_}", (x, -0.030, 0.056), (0.060, 0.108, 0.050), M["shoe"], f"Foot.{s_}")
    ell(f"Outfit_Toe{s_}", (x, -0.100, 0.044), (0.056, 0.052, 0.038), M["shoe"], f"Foot.{s_}")
    ell(f"Outfit_Heel{s_}", (x, 0.050, 0.056), (0.050, 0.030, 0.042), M["accent"], f"Foot.{s_}")
for s_, (el, wr) in ARMS.items():
    sx = 1 if s_ == "L" else -1
    sh = Vector((sx * 0.135, 0, 0.58))
    tube(f"Arm_Upper{s_}", [sh, el], [0.034, 0.030], M["skin"], f"UpperArm.{s_}")
    tube(f"Arm_Lower{s_}", [el, wr], [0.030, 0.027], M["skin"], f"LowerArm.{s_}")
    ell(f"Hand{s_}", wr + (wr - el).normalized() * 0.022, (0.040, 0.044, 0.040), M["skin"], f"Hand.{s_}", seg=20, rings=12)
    ell(f"Shoulder{s_}", sh, (0.044, 0.044, 0.044), M["skin"], f"UpperArm.{s_}", seg=16, rings=10)
# ---- ball on its own Prop bone (the viewer pins Prop to unit scale) ---------------------------------------------------
ell("Prop_Ball", BALL_C, (BALL_R,) * 3, M["ball"], "Prop", seg=40, rings=24)
for i, rot in enumerate(((math.radians(90), 0, 0), (0, math.radians(90), 0), (0, 0, 0))):
    bpy.ops.mesh.primitive_torus_add(major_radius=BALL_R * 1.003, minor_radius=0.0021, major_segments=64, minor_segments=8, location=BALL_C, rotation=rot)
    t = bpy.context.active_object
    t.name = f"Prop_Seam{i}"
    finish(t, M["seam"], "Prop")

# ---- bind (rigid, one vertex group per part) --------------------------------------------------------------------------
three_name = lambda n: "".join(c for c in n.replace(" ", "_") if c not in "[].:/")  # noqa: E731
bone_names = {three_name(n) for n in SK}
for o, bone in parts:
    if three_name(o.name) in bone_names:
        o.name = f"Body_{o.name}"
    stylized_limbs.bind(o, bone, {})
    o.modifiers.new("Rig", "ARMATURE").object = arm
    o.parent = arm

# ---- idle (rotation only) + the shared clip library ------------------------------------------------------------------
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


for bone, amp in (("Torso", (1.4, 0, 0)), ("Head", (-1.5, 0, 0)), ("UpperArm.R", (0, 0, 1.0)), ("Abdomen", (0.6, 0, 0))):
    key(bone, 1, (0, 0, 0))
    key(bone, FR // 2, amp)
    key(bone, FR + 1, (0, 0, 0))
key("Head", 12, (0, 5.0, 0))     # the toy's head nods and rolls: that wobble IS the bobblehead
key("Head", 36, (0, -5.0, 0))
scene.frame_start, scene.frame_end = 1, FR + 1
bpy.ops.object.mode_set(mode="OBJECT")
for pb in arm.pose.bones:
    pb.rotation_euler = (0, 0, 0)
print("clips", stylized_clips.build_all(bpy, arm, SK, idle=act))

seat = stylized_props.make_seat(bpy, mat("Seat", "#7a5230", 0.75))
SEAT_K = 0.32   # the stool was authored for the 0.85 m legs of the Stylized man; these legs are 0.27 m
seat.scale = (SEAT_K,) * 3
bpy.context.view_layer.objects.active = seat
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---- stage ------------------------------------------------------------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, -0.001))
fl = bpy.context.active_object
fl.data.materials.append(mat("Floor", "#c7cdd1", 0.9))
scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = rgb("#d5dadd")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
look_at = bpy.data.objects.new("LookAt", None)
scene.collection.objects.link(look_at)


def area(name, loc, energy, size, color="#ffffff"):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.size = energy, size
    d.color = rgb(color)[:3]
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    c = o.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = look_at, "TRACK_NEGATIVE_Z", "UP_Y"


area("Key", (-1.6, -2.2, 2.2), 260, 1.6, "#fff4e6")
area("Fill", (2.2, -1.8, 1.0), 90, 2.2, "#e6f0ff")
area("Rim", (1.2, 2.4, 1.9), 260, 1.2)
area("Top", (0, 0, 3.0), 60, 1.8)
cam_d = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_d)
scene.collection.objects.link(cam)
scene.camera = cam
tr = cam.constraints.new("TRACK_TO")
tr.target, tr.track_axis, tr.up_axis = look_at, "TRACK_NEGATIVE_Z", "UP_Y"
scene.render.engine = "CYCLES"
scene.cycles.device, scene.cycles.samples, scene.cycles.use_denoising = "CPU", args.samples, True
scene.render.resolution_x, scene.render.resolution_y = (int(v) for v in args.res.split("x"))
for vt in ("Khronos PBR Neutral", "AgX", "Standard"):
    try:
        scene.view_settings.view_transform = vt
        break
    except TypeError:
        continue

VIEWS = {"front": 0, "three_quarter": 32, "side": 90, "back": 180, "face": 0}
for pb in arm.pose.bones:
    pb.location, pb.scale, pb.rotation_quaternion, pb.rotation_euler = (0, 0, 0), (1, 1, 1), (1, 0, 0, 0), (0, 0, 0)
arm.animation_data.use_nla, arm.animation_data.action = False, act
scene.frame_set(1)
stylized_merge.assert_sane_bounds(bpy, lo=(-0.6, -0.6, -0.05), hi=(0.6, 0.6, 1.25))
seat.hide_render = True
for name in [v for v in args.views.split(",") if v]:
    a = math.radians(VIEWS[name])
    if name == "face":
        cam.location, look_at.location, cam_d.lens = (0, -2.0, 0.88), (0, 0, 0.88), 110
    else:
        cam.location, look_at.location, cam_d.lens = (math.sin(a) * 3.3, -math.cos(a) * 3.3, 0.62), (0, 0, 0.52), 85
    scene.render.filepath = os.path.join(args.out, f"bobble_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)

if args.glb:
    stylized_merge.export_glb(bpy, args.glb)
