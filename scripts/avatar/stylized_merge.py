"""Export-time steps: merge the many tiny rigid-skinned parts into one mesh per material, so a figure is ~20 draw calls instead of ~80.

Safe because every part is already weighted 100% to one bone through a vertex group: joining keeps each vertex's group,
so the skinning is unchanged. Names the tests and the viewer rely on survive (see MERGED_NAMES):
  Outfit_* keeps an Outfit_ name (the largest piece's name for the shirt, so Outfit_Jersey / Outfit_Tee still tell the
  two cuts apart), Prop_* stays Prop_* (the viewer hides those), everything else becomes Body_<Material>.
"""

MERGED_NAMES = {"Trim": "Outfit_Trim", "Shoe": "Outfit_Shoe", "ShoeAccent": "Outfit_ShoeAccent",
                "Sole": "Outfit_Sole"}


def _category(name):
    return "Prop" if name.startswith("Prop_") else "Outfit" if name.startswith("Outfit_") else "Body"


def merge_by_material(bpy):
    groups = {}
    for o in bpy.data.objects:
        if o.type == "MESH" and o.data.materials:
            groups.setdefault((_category(o.name), o.data.materials[0].name), []).append(o)
    merged = 0
    for (cat, material), objs in groups.items():
        if len(objs) < 2:
            continue
        biggest = max(objs, key=lambda o: len(o.data.vertices)).name
        names = [o.name for o in objs]
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        out = bpy.context.active_object
        if cat == "Outfit" and material == "Pants":   # long trousers (street) vs shorts (jersey) must stay tellable apart
            out.name = "Outfit_Pants" if any(n.startswith("Outfit_Pants") for n in names) else "Outfit_Shorts"
        else:
            out.name = (f"Prop_{material}" if cat == "Prop" else MERGED_NAMES.get(material, biggest) if cat == "Outfit" else f"Body_{material}")
        merged += len(objs) - 1
    return merged


def export_glb(bpy, glb):
    """Drop the stage (camera, lights, floor), merge parts by material, and write the GLB with its clips."""
    import os
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception as e:  # noqa: BLE001
        print("gltf addon enable:", e)
    for o in list(bpy.data.objects):
        if o.name in ("Cam", "LookAt") or o.type in ("LIGHT", "CAMERA") or o.name.startswith("Plane"):
            bpy.data.objects.remove(o, do_unlink=True)
    print("merged", merge_by_material(bpy), "parts into per-material meshes")
    os.makedirs(os.path.dirname(os.path.abspath(glb)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_yup=True, export_animations=True,
                              export_apply=False, export_skins=True)
    print("exported", glb, os.path.getsize(glb))


def assert_sane_bounds(bpy, lo=(-0.8, -0.8, -0.05), hi=(0.8, 0.8, 2.15), skip=("Plane",)):
    """Fail the build if any skinned mesh has a vertex outside the figure's box in the current pose.

    A single runaway vertex (e.g. an even-offset Solidify across a kink) renders as a metres-long spike in the GLB.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    bad = []
    for o in bpy.data.objects:
        if o.type != "MESH" or o.name.startswith(skip):
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            p = ev.matrix_world @ v.co
            if any(c < a or c > b for c, a, b in zip(p, lo, hi)):
                bad.append(f"{o.name}#{v.index} {tuple(round(c, 3) for c in p)}")
                break
        ev.to_mesh_clear()
    if bad:
        raise RuntimeError("vertices outside the figure box: " + "; ".join(bad))
