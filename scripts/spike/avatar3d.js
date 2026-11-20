/* global document, location, window -- this file runs in the browser page (external module for avatar3d.html), not Node */
// Avatar 3D spike page logic (moved verbatim out of scripts/spike/avatar3d.html
// as S-P2-5 step 2, so the page carries no inline <script>). The import path
// is unchanged: this file lives in the same directory as the page.
import { mountAvatar3d } from "../../js/ui/avatar3d.js";

const status = document.getElementById("status");
const t0 = performance.now();
const params = new URLSearchParams(location.search);
try {
  const handle = await mountAvatar3d(document.getElementById("stage"), params.get("src") ? { src: params.get("src") } : {});
  window.__avatar = handle;
  window.__firstFrameMs = Math.round(performance.now() - t0);
  status.textContent = `ready in ${window.__firstFrameMs} ms`;
} catch (err) {
  window.__avatarError = err.message;
  status.textContent = `fallback: ${err.message}`;
}
