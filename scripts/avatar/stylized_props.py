"""Props that ride in every Stylized GLB but are not part of the body or an outfit."""


def make_seat(bpy, material):
    """The stool the Sit clip lands on: one unskinned mesh named Prop_Stool (the viewer shows it only while sitting).

    Sitting puts the hips at y +0.426 (stylized_clips.sit_pose); the seat top sits just under the thighs.
    Hidden in renders; the clip-render mode of build_stylized.py reveals it for the Sit clip.
    """
    seat_top, seat_y = 0.395, 0.36
    parts = []
    for loc, r, depth in (((0, seat_y, seat_top - 0.025), 0.215, 0.05), ((0, seat_y, 0.20), 0.045, 0.34),
                          ((0, seat_y, 0.015), 0.17, 0.03)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=depth, location=loc)
        parts.append(bpy.context.active_object)
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    seat = bpy.context.active_object
    seat.name = "Prop_Stool"
    seat.data.materials.append(material)
    for p in seat.data.polygons:
        p.use_smooth = True
    seat.hide_render = True
    return seat
