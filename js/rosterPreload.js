/**
 * Cold-start roster preload. A classic script (not inline: the entry pages must stay CSP-ready, tests/cspReadiness.test.js), loaded after the
 * stylesheets and before the app.js module graph.
 *
 * A first-time visitor must download roster.json (1.2 MB gzipped), and the app used to ask for it only AFTER every module had loaded
 * (~10 s on a slow phone, measured by scripts/measure/mobile-first-load.mjs, BACKLOG B77). Start it now, in parallel with the modules.
 * Placed after the render-blocking CSS on purpose: ahead of it, the preload took bandwidth from the stylesheets and delayed first paint
 * by 0.2-0.5 s.
 *
 * Returning visitors have the processed cards in IndexedDB (js/data/rosterCache.js sets the localStorage marker below) and never request
 * roster.json, so they must not pay for a preload. The URL and the marker are pinned to the code that uses them by
 * tests/rosterPreload.test.js. No imports, no exports.
 */
(function () {
  try {
    if (localStorage.getItem("courtside-roster-cache-key")) return;
    var l = document.createElement("link");
    l.rel = "preload";
    l.as = "fetch";
    l.crossOrigin = "anonymous";
    l.href = "js/data/roster.json";
    document.head.appendChild(l);
  } catch {
    // storage blocked: no preload, the app still loads the roster itself
  }
})();
