"""Head features for the stylized figure: the hair cap and the upper lash lines.

Detail lives in GEOMETRY, not shaders: the game loads the GLB in Three.js, and no Blender procedural node survives
the glTF export. h is the builder's helper namespace (tube, ell, finish, M).
"""

import math

import bmesh
import bpy
from mathutils import Vector

from stylized_limbs import smooth


def build_hair(h, center, radii):
    """Hair as a displaced sphere: an M hairline that dives softly under the scalp, sideburns, strand grooves on top."""
    rx, ry, rz = radii
    bpy.ops.mesh.primitive_uv_sphere_add(segments=112, ring_count=56, radius=1.0, location=center + Vector((0, 0.006, 0.008)))
    hair = bpy.context.active_object
    hair.name = "Hair"
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    # No deleted vertices (that leaves a stair-stepped edge): below the hairline the shell dives smoothly under the
    # scalp, so the hairline is a soft, clean curve from every angle.
    for v in bm.verts:
        nx, ny, nz = v.co
        front = smooth(0.05, 0.62, -ny)
        temple = smooth(0.28, 0.62, abs(nx)) * front            # M-shaped hairline: recedes at the temples
        back = smooth(0.0, 0.5, ny)
        burn = smooth(0.72, 0.93, abs(nx)) * smooth(-0.05, 0.25, -ny) * (1 - back)   # sideburn: hair reaches down in front of the ear
        thr = -0.10 - 0.75 * back + 0.36 * front + 0.17 * temple - 0.30 * burn  # sides: ear top; back: nape; front: forehead
        above = smooth(-0.16, 0.08, nz - thr)                   # 0 below the hairline -> 1 above it (wide = soft edge)
        side = smooth(0.55, 0.95, abs(nx))                      # crop hugs the head at the sides (no mushroom bowl)
        shell = 0.88 + (0.175 - 0.035 * side) * above       # 0.88 sits inside the skin, ~1.055 is the hair surface
        lift = 1.0 + 0.06 * smooth(0.3, 1.0, nz)                # a touch of volume on top
        # combed-back strands: shallow grooves across the top that read in any renderer (no shader detail survives glTF)
        comb = (0.5 + 0.5 * math.cos(nx * math.pi * 9.0 + 0.6 * ny)) * smooth(-0.15, 0.45, nz) * smooth(0.6, 1.0, above)
        shell += 0.018 * comb * (1 - 0.6 * side)
        v.co = Vector((nx * rx * shell, ny * ry * shell * (1 + 0.02 * above), nz * rz * shell * lift))
    bm.to_mesh(hair.data)
    bm.free()
    return h.finish(hair, h.M["hair"], "Head")


def build_lash(h, sx, ex, ey, ez, surface):
    """A thin dark line along the visible top of one eye. The eye-white ellipsoid bulges ~6 mm out of the skin, so the
    line rides whichever surface is in front (on the skin alone, the white hides its middle)."""
    erx, ery, erz, ecy = 0.0235, 0.012, 0.0165, ey + 0.006
    pts = []
    for i in range(15):
        t = math.pi * (0.04 + 0.92 * i / 14)
        u, w = 0.90 * math.cos(t), 0.90 * math.sin(t)                # just inside the white's rim, along its upper edge
        lx, lz = ex + erx * u, ez + erz * w
        lz += 0.0006 * max(0.0, sx * u) ** 2                         # barely any flick: a line, not eyeliner
        eye_y = ecy - ery * math.sqrt(max(0.0, 1 - u * u - w * w))
        hit = surface(lx, lz)
        pts.append((lx, min(eye_y, hit.y if hit else eye_y) - 0.0009, lz + 0.0008))
    return h.tube(f"Lash{sx}", pts, [0.0006 + 0.0010 * math.sin(math.pi * i / 14) for i in range(15)], h.M["lash"], "Head", seg=8)
