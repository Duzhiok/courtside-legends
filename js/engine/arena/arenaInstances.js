/**
 * InstancedMesh helpers: many boxes / many figures in ONE draw call (the mobile budget is ~120 calls for the whole scene).
 * Everything here needs T.InstancedMesh and T.Object3D; `canInstance` lets callers fall back (the test fake has neither).
 */

export const canInstance = (T) => !!(T?.InstancedMesh && T?.Object3D);

/**
 * One draw call for a list of axis-aligned (optionally y-rotated) boxes.
 * @param items [{ x, y, z, sx, sy, sz, ry?, color? }] sizes are full extents (the unit cube is scaled)
 */
export function instancedBoxes(T, items, material) {
  const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), material, items.length);
  const dummy = new T.Object3D();
  const tint = new T.Color();
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.ry || 0, 0);
    dummy.scale.set(it.sx, it.sy, it.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color !== undefined && mesh.setColorAt) mesh.setColorAt(i, tint.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; // instances span the whole arena; one big cull test buys nothing
  return mesh;
}

/** Free everything a built arena group owns (geometry, materials, textures), then detach it. */
export function disposeTree(root) {
  const seen = new Set();
  const kill = (o) => {
    if (!o || seen.has(o)) return;
    seen.add(o);
    o.dispose?.();
  };
  root.traverse?.((obj) => {
    kill(obj.geometry);
    for (const m of [].concat(obj.material || [])) {
      kill(m.map);
      kill(m);
    }
    obj.dispose?.(); // InstancedMesh
  });
  root.parent?.remove?.(root);
}
