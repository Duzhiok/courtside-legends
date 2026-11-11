"""Shared Stylized animation library (Blender `bpy`). One definition, every outfit.

build_stylized.py calls `build_all(arm, SK, scene)` after the rig exists, so each exported GLB carries the SAME
clips on the SAME skeleton. Outfits are only meshes bound to bones; they never carry animation of their own.

Authoring model (why poses are written as world directions, not bone euler angles):
  * `aim`  -> a limb bone points along a world direction (front = -Y, character's left = +X, up = +Z). Exact FK.
  * `rot`  -> euler degrees about world axes, applied in the parent's posed frame (+X pitches an UPWARD bone forward and a
             DOWNWARD bone backward: torso/head lean with +X, legs swing forward with -X).
  * Legs   -> `leg(alpha, beta)`: thigh swings forward by alpha, knee flexes by beta, the foot stays flat. The matching
             hip drop / hip shift is solved analytically, so the planted foot stays on the floor (no floating, no sinking).
Clips never carry scale (build presets scale bones) and hip translation is the only translation channel.
Frame rate: 24 fps. One-shot clips end close to the rest pose, except Sit which holds its pose until Stand is requested.
"""
import math

from mathutils import Euler, Matrix, Vector

FPS = 24


class Rig:
    def __init__(self, bpy, arm, SK):
        self.bpy, self.arm, self.SK = bpy, arm, SK
        self.order = list(SK)                                   # parents are always defined before children
        self.Rb = {n: arm.data.bones[n].matrix_local.to_3x3() for n in SK}
        self.rest_dir = {n: (Vector(SK[n][2]) - Vector(SK[n][1])).normalized() for n in SK}
        L1 = (Vector(SK["UpperLeg.L"][2]) - Vector(SK["UpperLeg.L"][1])).length
        L2 = (Vector(SK["LowerLeg.L"][2]) - Vector(SK["LowerLeg.L"][1])).length
        self.L1, self.L2 = L1, L2

    # ---- one pose: spec {bone: ("aim", dir) | ("rot", (x, y, z) deg)}, hips = world offset (x, y, z) -------------
    def solve(self, spec, hips=(0, 0, 0)):
        """-> {bone: (quaternion basis, location basis or None)} for every bone in the hierarchy."""
        P = {}                                                   # world-space delta rotation of each bone's frame
        out = {}
        for n in self.order:
            parent = self.SK[n][0]
            Pp = P.get(parent, Matrix.Identity(3)) if parent else Matrix.Identity(3)
            Rb = self.Rb[n]
            kind = spec.get(n)
            if kind is None:
                basis = Matrix.Identity(3)
            elif kind[0] == "rot":
                Q = Euler([math.radians(a) for a in kind[1]], "XYZ").to_matrix()
                basis = Rb.inverted() @ Q @ Rb                   # world pose = Pp @ Q @ Rb
            else:                                                # aim: want world axis (+Y of the bone) along dir
                D = self.rest_dir[n].rotation_difference(Vector(kind[1]).normalized()).to_matrix()
                basis = Rb.inverted() @ Pp.inverted() @ D @ Rb
            P[n] = Pp @ (Rb @ basis @ Rb.inverted())             # this bone's world delta (rotation about its head)
            loc = Rb.inverted() @ Vector(hips) if n == "Hips" and any(hips) else None
            out[n] = (basis.to_quaternion(), loc)
        return out

    # ---- legs ----------------------------------------------------------------------------------------------------
    def leg_height(self, alpha, beta):
        """Vertical hip-above-ankle for a flat-footed leg with thigh pitch alpha and knee flexion beta (degrees)."""
        a, b = math.radians(alpha), math.radians(beta)
        return self.L1 * math.cos(a) + self.L2 * math.cos(a - b)

    def leg_reach(self, alpha, beta):
        a, b = math.radians(alpha), math.radians(beta)
        return self.L1 * math.sin(a) + self.L2 * math.sin(a - b)

    def legs(self, left, right, lift=0.0, shift=True):
        """Spec for both legs + the hip offset that plants the lower foot. left/right = (alpha, beta).
        lift adds extra hip height for flight frames. shift=False keeps the hips over the feet (running in place)."""
        spec, heights = {}, []
        for s, (alpha, beta) in (("L", left), ("R", right)):
            # Leg bones point DOWN, so +X swings them BACKWARD (spine bones point up and tilt forward with +X).
            # Thigh forward = -alpha, knee flexion folds the shin back = +beta, the foot cancels the sum: sole flat.
            spec[f"UpperLeg.{s}"] = ("rot", (-alpha, 0, 0))
            spec[f"LowerLeg.{s}"] = ("rot", (beta, 0, 0))
            spec[f"Foot.{s}"] = ("rot", (alpha - beta, 0, 0))
            heights.append((self.leg_height(alpha, beta), self.leg_reach(alpha, beta)))
        top = max(h for h, _ in heights)                          # the more extended leg is the planted one
        drop = (self.L1 + self.L2) - top
        planted_reach = max(heights)[1]
        hy = planted_reach if shift else 0.0                     # forward is -Y: hips move back (+Y) as the knees come forward
        return spec, (0.0, hy, -drop + lift)

    # ---- keyframing ----------------------------------------------------------------------------------------------
    def action(self, name):
        bpy = self.bpy
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        self.arm.animation_data_create().action = act
        for pb in self.arm.pose.bones:
            pb.rotation_mode = "QUATERNION"
        return act

    def key(self, frame, spec, hips=(0, 0, 0)):
        for n, (q, loc) in self.solve(spec, hips).items():
            pb = self.arm.pose.bones[n]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame)
            if n == "Hips":
                pb.location = loc if loc is not None else Vector((0, 0, 0))
                pb.keyframe_insert("location", frame=frame)

    def finish(self, act, last):
        self.bpy.context.scene.frame_start, self.bpy.context.scene.frame_end = 1, last
        # the exporter only writes actions that are on an NLA track
        track = self.arm.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, 1, act)
        self.arm.animation_data.action = None
        for pb in self.arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)


# ---- poses (world directions; s = +1 for the left arm, -1 for the right) -----------------------------------------
def n3(x, y, z):
    return Vector((x, y, z)).normalized()


def arm_pair(up_l, lo_l, up_r, lo_r):
    return {"UpperArm.L": ("aim", up_l), "LowerArm.L": ("aim", lo_l), "UpperArm.R": ("aim", up_r), "LowerArm.R": ("aim", lo_r)}


# The left arm cradles the ball in the rest pose (see build_stylized.py); the right arm hangs relaxed.
REST_UP_L, REST_LO_L = n3(0.07, 0.02, -0.27), n3(0.005, -0.22, -0.19)
REST_UP_R, REST_LO_R = n3(-0.083, 0.01, -0.285), n3(-0.027, -0.08, -0.27)


def rest_arms():
    return arm_pair(REST_UP_L, REST_LO_L, REST_UP_R, REST_LO_R)


def clap(rig, spec_extra=None):
    """Hands meet in front of the chest five times, with a small bounce on each clap, then lower."""
    act = rig.action("Stylized_Clap")
    closed = arm_pair(n3(-0.10, -0.45, -0.89), n3(-0.72, -0.62, 0.32), n3(0.10, -0.45, -0.89), n3(0.72, -0.62, 0.32))
    open_ = arm_pair(n3(0.12, -0.40, -0.90), n3(-0.28, -0.80, 0.42), n3(-0.12, -0.40, -0.90), n3(0.28, -0.80, 0.42))
    base = {"Head": ("rot", (-4, 0, 0)), "Torso": ("rot", (-2, 0, 0))}
    legs0, hip0 = rig.legs((0, 0), (0, 0))
    legs1, hip1 = rig.legs((9, 18), (9, 18))                     # a soft knee dip on each clap
    rig.key(1, {**rest_arms(), **legs0}, hip0)
    rig.key(8, {**open_, **base, **legs0}, hip0)
    for i in range(5):
        t = 12 + i * 8
        rig.key(t, {**closed, **base, "Head": ("rot", (2, 0, 0)), **legs1}, hip1)
        rig.key(t + 4, {**open_, **base, **legs0}, hip0)
    rig.key(56, {**arm_pair(n3(0.09, -0.15, -0.95), n3(0.0, -0.45, -0.45), n3(-0.09, -0.15, -0.95), n3(0.0, -0.3, -0.7)), **legs0}, hip0)
    rig.key(66, {**rest_arms(), **legs0}, hip0)
    rig.finish(act, 66)


def celebrate(rig):
    """Two fist pumps overhead with a little hop, then settle."""
    act = rig.action("Stylized_Celebrate")
    legs0, hip0 = rig.legs((0, 0), (0, 0))
    crouch, hipc = rig.legs((14, 28), (14, 28))
    air, hipa = rig.legs((8, 22), (4, 14), lift=0.12)
    up = arm_pair(n3(0.55, -0.12, 0.83), n3(0.30, -0.10, 0.95), n3(-0.55, -0.12, 0.83), n3(-0.30, -0.10, 0.95))
    cheer = {"Head": ("rot", (-10, 0, 0)), "Torso": ("rot", (-8, 0, 0))}
    rig.key(1, {**rest_arms(), **legs0}, hip0)
    rig.key(6, {**arm_pair(n3(0.2, -0.3, -0.9), n3(0.1, -0.7, -0.4), n3(-0.2, -0.3, -0.9), n3(-0.1, -0.7, -0.4)), **crouch,
                "Torso": ("rot", (8, 0, 0))}, hipc)
    rig.key(11, {**up, **cheer, **air}, hipa)
    rig.key(16, {**up, **cheer, **legs0}, hip0)
    rig.key(22, {**arm_pair(n3(0.42, -0.2, 0.88), n3(0.22, -0.3, 0.9), n3(-0.42, -0.2, 0.88), n3(-0.22, -0.3, 0.9)), **cheer,
                 **crouch}, hipc)
    rig.key(27, {**up, **cheer, **air}, hipa)
    rig.key(33, {**up, **cheer, **legs0}, hip0)
    rig.key(46, {**rest_arms(), **legs0}, hip0)
    rig.finish(act, 46)


def jump(rig):
    """Crouch, take off with an arm swing, tuck at the apex, land softly."""
    act = rig.action("Stylized_Jump")
    legs0, hip0 = rig.legs((0, 0), (0, 0))
    crouch, hipc = rig.legs((42, 84), (42, 84))
    push, hipp = rig.legs((8, 6), (8, 6), lift=0.02)
    tuck, hipt = rig.legs((38, 78), (30, 60), lift=0.36)
    fall, hipf = rig.legs((12, 22), (12, 22), lift=0.20)
    land, hipl = rig.legs((46, 90), (46, 90))
    swing_back = arm_pair(n3(0.10, 0.60, -0.80), n3(0.10, 0.20, -0.95), n3(-0.12, 0.65, -0.75), n3(-0.12, 0.25, -0.95))
    swing_up = arm_pair(n3(0.30, -0.35, 0.89), n3(0.05, -0.55, 0.83), n3(-0.40, -0.45, 0.80), n3(-0.30, -0.55, 0.75))
    lean = {"Torso": ("rot", (14, 0, 0)), "Head": ("rot", (-6, 0, 0))}
    rig.key(1, {**rest_arms(), **legs0}, hip0)
    rig.key(7, {**swing_back, **crouch, **lean, "Abdomen": ("rot", (10, 0, 0))}, hipc)
    rig.key(12, {**swing_up, **push, "Torso": ("rot", (-6, 0, 0)), "Head": ("rot", (-8, 0, 0))}, hipp)
    rig.key(17, {**swing_up, **tuck, "Torso": ("rot", (-3, 0, 0)), "Head": ("rot", (-8, 0, 0))}, hipt)
    rig.key(23, {**arm_pair(n3(0.35, -0.20, 0.30), n3(0.05, -0.50, 0.10), n3(-0.40, -0.25, 0.20), n3(-0.2, -0.5, 0.2)), **fall}, hipf)
    rig.key(28, {**swing_back, **land, **lean, "Abdomen": ("rot", (12, 0, 0))}, hipl)
    rig.key(36, {**rest_arms(), **legs0}, hip0)
    rig.finish(act, 36)


def run(rig):
    """20-frame loop (two strides). The left arm keeps cradling the ball; the right arm pumps."""
    act = rig.action("Stylized_Run")
    T = 20
    for f in range(0, T + 1, 2):
        ph = 2 * math.pi * f / T
        spec = {}
        legs = {}
        for s, p in (("L", ph), ("R", ph + math.pi)):
            alpha = 28 * math.sin(p) + 8                            # a jog, not a lunge: moderate stride
            beta = 26 + 62 * max(0.0, math.cos(p)) ** 1.3         # the knee folds while the thigh swings forward
            legs[s] = (alpha, beta)
        lspec, hip = rig.legs(legs["L"], legs["R"], shift=False)
        spec.update(lspec)
        th = 38 * math.sin(ph)                                      # right arm swings with the LEFT leg
        thf = th + 88
        spec["UpperArm.R"] = ("aim", n3(-0.18, -math.sin(math.radians(th)), -math.cos(math.radians(th))))
        spec["LowerArm.R"] = ("aim", n3(-0.10, -math.sin(math.radians(thf)), -math.cos(math.radians(thf))))
        spec["UpperArm.L"] = ("rot", (-7 * math.sin(ph + math.pi), 0, 0))   # small bob, ball stays cradled
        spec["Abdomen"] = ("rot", (7, 0, 5 * math.sin(ph)))
        spec["Torso"] = ("rot", (9, 0, 7 * math.sin(ph)))
        spec["Head"] = ("rot", (-12, 0, -5 * math.sin(ph)))
        spec["Hips"] = ("rot", (0, 0, -5 * math.sin(ph)))
        bob = 0.025 * math.cos(2 * ph)                              # two bounces per cycle
        rig.key(f + 1, spec, (hip[0], hip[1], hip[2] + bob))
    rig.finish(act, T + 1)


def sit_pose(rig):
    legs, hip = rig.legs((88, 90), (88, 90))
    spec = {**legs,
            **arm_pair(REST_UP_L, REST_LO_L, n3(-0.10, -0.55, -0.82), n3(-0.04, -0.80, -0.60)),   # right hand rests on the knee
            "Head": ("rot", (-3, 0, 0))}
    return spec, hip


def sit(rig):
    """Lower onto a seat and HOLD (the viewer adds a stool prop). Thighs level, shins vertical, feet flat."""
    act = rig.action("Stylized_Sit")
    legs0, hip0 = rig.legs((0, 0), (0, 0))
    spec, hip = sit_pose(rig)
    mid, hipm = rig.legs((50, 62), (50, 62))
    rig.key(1, {**rest_arms(), **legs0}, hip0)
    rig.key(12, {**rest_arms(), **mid, "Torso": ("rot", (10, 0, 0)), "Abdomen": ("rot", (6, 0, 0))}, hipm)
    rig.key(28, {**spec, "Torso": ("rot", (4, 0, 0))}, hip)
    rig.key(34, {**spec, "Torso": ("rot", (0, 0, 0))}, hip)
    rig.finish(act, 34)


def stand(rig):
    """Sit -> standing, played when the sit pose is released."""
    act = rig.action("Stylized_Stand")
    legs0, hip0 = rig.legs((0, 0), (0, 0))
    spec, hip = sit_pose(rig)
    mid, hipm = rig.legs((52, 66), (52, 66))
    rig.key(1, {**spec}, hip)
    rig.key(8, {**rest_arms(), **mid, "Torso": ("rot", (14, 0, 0)), "Abdomen": ("rot", (8, 0, 0))}, hipm)
    rig.key(16, {**rest_arms(), **legs0}, hip0)
    rig.finish(act, 16)


CLIPS = (clap, celebrate, jump, run, sit, stand)


def build_all(bpy, arm, SK, idle=None):
    """Add every clip to `arm`; `idle` (the action build_stylized keyed itself) joins the NLA so it exports too."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    rig = Rig(bpy, arm, SK)
    if idle is not None:
        idle.use_fake_user = True
        track = arm.animation_data.nla_tracks.new()
        track.name = idle.name
        track.strips.new(idle.name, 1, idle)
        arm.animation_data.action = None
    for make in CLIPS:
        make(rig)
    bpy.ops.object.mode_set(mode="OBJECT")
    return [c.__name__ for c in CLIPS]
