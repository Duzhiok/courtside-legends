"""Limbs for the stylized figure: one continuous arm and leg per side, and a five-digit hand.

The rest of the body is rigid parts (one bone each, see build_stylized.py). An arm used to be the same -- upper tube,
elbow ball, forearm tube, a ball on the shoulder -- which read as an artist's wooden mannequin. Here an arm is a single
tube along a smooth muscle profile; the bind step splits its weights softly across the elbow/knee plane (`blend`).
"""

from mathutils import Matrix, Vector

# (position along the arm, (horizontal radius, depth radius)). Positions: 0..1 is shoulder->elbow, 1..2 elbow->wrist.
# The first key sits INSIDE the torso with a small radius, so the shoulder is a rounded cap and the tube's end is hidden.
ARM = [
    (-0.30, (.030, .030)),   # buried in the chest: closes the cap
    (-0.06, (.054, .058)),   # deltoid peak, just under the jersey strap
    (0.28, (.052, .054)),    # deltoid tail
    (0.58, (.049, .050)),    # biceps
    (0.86, (.041, .040)),    # above the elbow
    (1.00, (.039, .038)),    # elbow
    (1.26, (.044, .041)),    # forearm belly
    (1.62, (.036, .032)),
    (2.00, (.029, .025)),    # wrist
]
# Under a sleeve the arm starts INSIDE the sleeve: any shoulder there pokes skin through the tee's shoulder line, or
# shows through the small gap a raised arm opens between sleeve and body (where there used to be only cloth).
ARM_SLEEVED = [(0.10, (.030, .032)), (0.20, (.048, .050))] + ARM[2:]
# Leg, same convention (0..1 hip->knee, 1..2 knee->ankle). The calf belly is deeper than wide and sits behind the shin.
LEG = [
    (0.00, (.090, .094)),    # thigh root (under the shorts)
    (0.35, (.082, .086)),
    (0.70, (.066, .068)),    # vastus, tapering toward the knee
    (0.92, (.055, .056)),    # just above the knee
    (1.00, (.053, .055)),    # knee
    (1.12, (.051, .054)),
    (1.32, (.057, .064)),    # calf belly
    (1.62, (.046, .047)),
    (2.00, (.038, .038)),    # ankle (inside the sock)
]
# Joggers over the leg: one tube hip to ankle across the knee (the old thigh + shin + knee-ball read as knee pads).
PANTS = [(0.00, (.104, .106)), (0.35, (.100, .100)), (0.70, (.094, .094)), (0.92, (.091, .091)), (1.00, (.091, .091)),
         (1.12, (.088, .089)), (1.32, (.086, .088)), (1.62, (.076, .077)), (2.00, (.066, .066))]
SAMPLES = 22                 # rings along a limb; with smooth shading more buys nothing but triangles
JOINT_BLEND = 0.035          # half-width (m) of the upper -> lower bone weight ramp across elbow/knee


def smooth(e0, e1, x):
    """Smoothstep: 0 below e0, 1 above e1."""
    if x <= e0:
        return 0.0
    if x >= e1:
        return 1.0
    t = (x - e0) / (e1 - e0)
    return t * t * (3 - 2 * t)


def bind(o, bone, blend):
    """Vertex groups for one part: rigid on `bone`, or for a continuous limb a soft two-bone split across its joint."""
    if o.name not in blend:
        o.vertex_groups.new(name=bone).add([v.index for v in o.data.vertices], 1.0, "REPLACE")
        return
    ba, bb, pt, nrm, hw = blend[o.name]
    ga, gb = o.vertex_groups.new(name=ba), o.vertex_groups.new(name=bb)
    for v in o.data.vertices:
        w = smooth(-hw, hw, (o.matrix_world @ v.co - pt).dot(nrm))
        ga.add([v.index], 1.0 - w, "REPLACE")
        gb.add([v.index], w, "REPLACE")


def catmull(pts, n):
    """n points along a Catmull-Rom spline through pts (ends clamped)."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for k in range(n):
        f = k / (n - 1) * (len(pts) - 1)
        i = min(int(f), len(pts) - 2)
        t = f - i
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def lerp_radii(profile, k, n):
    """Radius pair at sample k of n, linear between the profile keys (keys are evenly spaced in the spline)."""
    g = k / (n - 1) * (len(profile) - 1)
    i = min(int(g), len(profile) - 2)
    f = g - i
    return tuple(a * (1 - f) + b * f for a, b in zip(profile[i][1], profile[i + 1][1]))


def basis(x, z):
    """Euler for a right-handed basis with local X ~ x and local Z = z (world vectors)."""
    z = z.normalized()
    x = (x - z * x.dot(z)).normalized()
    return tuple(Matrix((x, z.cross(x), z)).transposed().to_euler())


def build_limb(h, name, keys, profile, root, joint, end, bones, blend, material="skin", caps=(True, True)):
    """A continuous tube through `keys` (one per profile entry), weighted bones[0] -> bones[1] across the joint plane."""
    pts = catmull(keys, SAMPLES)
    o = h.tube(name, [tuple(p) for p in pts], [lerp_radii(profile, k, SAMPLES) for k in range(SAMPLES)],
               h.M[material], bones[0], seg=24, caps=caps)
    bisector = ((joint - root).normalized() + (end - joint).normalized()).normalized()
    blend[o.name] = (bones[0], bones[1], joint.copy(), bisector, JOINT_BLEND)
    return o


def arm_points(sh, el, wr, sx, profile):
    """World points of the profile keys: shoulder->elbow then elbow->wrist, with a slight outward muscle bow."""
    up, fore = el - sh, wr - el
    out = []
    for pos, _ in profile:
        if pos <= 1.0:
            bow = Vector((sx * 0.006, 0, 0)) if 0.0 < pos < 0.7 else Vector()
            inward = Vector((-sx * 0.18 * max(0.0, -pos), 0, -0.02 * max(0.0, -pos)))   # into the chest before 0
            out.append(sh + up * max(pos, 0.0) + bow + inward)
        else:
            out.append(el + fore * (pos - 1.0))
    return out


def build_arm(h, side, sx, el, wr, ball_c, blend, sleeved=False):
    """One continuous arm plus a hand. h: the builder's helpers (tube, ell, mat dict M). Fills blend[name]."""
    sh = Vector((sx * 0.228, 0, 1.51))
    profile = ARM_SLEEVED if sleeved else ARM
    build_limb(h, f"Arm{side}", arm_points(sh, el, wr, sx, profile), profile, sh, el, wr,
               (f"UpperArm.{side}", f"LowerArm.{side}"), blend)
    build_hand(h, side, sx, el, wr, ball_c)


def leg_points(top, knee, ankle, anatomy=True):
    """World points of the LEG keys: the knee cap sits a touch forward, the calf belly a touch back.

    anatomy=False is a smooth path for cloth: fabric drapes past the knee cap and calf, and the forward-then-back
    kink there makes an even-offset Solidify blow single inner-wall vertices out by metres.
    """
    up, low = knee - top, ankle - knee
    out = []
    for pos, _ in LEG:
        if not anatomy:
            out.append(top + up * pos if pos <= 1.0 else knee + low * (pos - 1.0))
        elif pos <= 1.0:
            out.append(top + up * pos + Vector((0, -0.006 * max(0.0, 1 - abs(pos - 1.0) / 0.12), 0)))
        else:
            belly = max(0.0, 1 - abs(pos - 1.32) / 0.25)
            out.append(knee + low * (pos - 1.0) + Vector((0, 0.014 * belly, 0)))
    return out


def build_leg(h, side, top, knee, ankle, blend):
    """One continuous leg, hip to ankle (the sock and shoe cover the end)."""
    build_limb(h, f"Leg{side}", leg_points(top, knee, ankle), LEG, top, knee, ankle,
               (f"UpperLeg.{side}", f"LowerLeg.{side}"), blend)


def build_hand(h, side, sx, el, wr, ball_c):
    """Palm, four slightly curled fingers and a thumb, laid out in the hand's own frame."""
    d = (wr - el).normalized()
    pn = (ball_c - wr) if side == "L" else Vector((-sx, 0, 0))   # the ball hand cups up; the relaxed hand faces the leg
    pn = (pn - d * pn.dot(d)).normalized()
    lat = pn.cross(d).normalized()                               # across the knuckles
    curl = 0.024 if side == "L" else 0.014
    skin = h.M["skin"]
    h.ell(f"Palm{side}", wr + d * 0.045 - pn * 0.002, (0.041, 0.018, 0.050), skin, f"Hand.{side}",
          rot=basis(lat, d), seg=24, rings=14)
    for j, (off, length) in enumerate(((-0.75, .058), (-0.25, .072), (0.25, .076), (0.75, .068))):
        base = wr + d * 0.084 + lat * off * 0.025 + pn * 0.002
        fpts = [base, base + d * length * 0.55 + pn * curl * 0.35, base + d * length * 0.92 + pn * curl]
        h.tube(f"Finger{side}{j}", [tuple(q) for q in fpts], [.0088, .0080, .0068], skin, f"Hand.{side}", seg=12)
    ref = Vector((0, -1, 0)) if side == "R" else Vector((sx, 0, 0))   # thumb: front (relaxed) / outward (ball)
    ts = lat if lat.dot(ref) > 0 else -lat
    tb = wr + d * 0.022 + ts * 0.024 + pn * 0.008
    h.tube(f"Thumb{side}", [tuple(tb), tuple(tb + d * 0.030 + ts * 0.012 + pn * 0.012),
                            tuple(tb + d * 0.054 + ts * 0.010 + pn * 0.020)],
           [.0115, .0098, .0080], skin, f"Hand.{side}", seg=12)


def build_pants_leg(h, side, top, knee, ankle, blend):
    """An open jogger tube over the leg (the caller solidifies it and adds the cuff)."""
    return build_limb(h, f"Outfit_Pants{side}", leg_points(top, knee, ankle, anatomy=False), PANTS, top, knee, ankle,
                      (f"UpperLeg.{side}", f"LowerLeg.{side}"), blend, material="pants", caps=(False, False))
