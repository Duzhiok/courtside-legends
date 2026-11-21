/**
 * Switches the web-font stylesheet on. index.html loads it as media="print", which the browser fetches without blocking first paint
 * (a render-blocking font CSS held FCP back, and on a network that cannot reach Google it held it back until the request timed out).
 * Text paints in the fallback stack at once and swaps when the fonts arrive (display=swap). A classic external script, not inline:
 * the entry pages stay CSP-ready (tests/cspReadiness.test.js). Pinned by tests/fontLoading.test.js. No imports, no exports.
 */
(function () {
  var link = document.getElementById("font-css");
  if (link) link.media = "all";
})();
