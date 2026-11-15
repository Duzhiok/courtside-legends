/**
 * Browser capability checks — pure functions, no game state, no DOM beyond
 * the injected doc. Lives in core/ so engine/ and ui/ can both import it
 * without either layer depending on the other (A-P2-2: webglAvailable used
 * to live in ui/avatar3d.js while engine/court3d.js imported it).
 */

/** True when the browser can create a WebGL context at all (checked on a throwaway canvas). */
export function webglAvailable(doc = document) {
  try {
    const canvas = doc.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
