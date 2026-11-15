/**
 * Home screen showcase: Legends Gallery marquee (My World only) + photo accents on mode cards.
 *
 * The old static photo wall used to sit in the shared home layout, under every tab.
 * It now lives only in the My World panel (#mw-legends-gallery) as a slow, seamless,
 * interactive marquee. Pictures come from photo.js, which is the one place that decides
 * what a player gets. A card is drawn only when there is real art (a local illustration
 * or a credited photo): a generated silhouette is fine in a list but would be a poor
 * stand-in for a "legend".
 *
 * Clicking a card opens that legend's profile (real roster data, pinned in GALLERY_LEGENDS).
 * The "Challenge" button calls window.CourtsideDuel?.challenge("bref:season") when the
 * Duel is loaded; until then it falls back to opening the profile. Personalization
 * (hometown / owned cards / era) is deliberately not done here — this module has no
 * account access — so the pool is a fixed, era-balanced 40.
 */
import { TL, getLang, teamNameL } from "../i18n.js";
import { TEAM_NAMES_ZH } from "../data/legends.js";
import { resolveCardPhoto } from "../data/photo.js";
import { GALLERY_LEGENDS } from "../data/galleryLegends.js";

/** Marquee speed: 24px/s, inside the approved 20–30px/s band. */
export const GALLERY_PX_PER_SECOND = 24;


/** Era bucket for a season: "pre1980" | 1980 | 1990 | 2000 | 2010 | 2020. */
export function eraBucket(season) {
  const s = Number(season);
  if (!Number.isFinite(s)) return "pre1980";
  if (s < 1980) return "pre1980";
  return Math.min(Math.floor(s / 10) * 10, 2020);
}

/** "1960 年代" / "1960s" — the decade the season belongs to. */
export function eraLabel(season, lang = getLang()) {
  const decade = Math.floor(Number(season) / 10) * 10;
  return lang === "en" ? `${decade}s` : `${decade} 年代`;
}

/** Era-bucket counts for a pool: { pre1980, 1980, 1990, 2000, 2010, 2020 }. */
export function galleryPoolStats(pool = GALLERY_LEGENDS) {
  const stats = { pre1980: 0, 1980: 0, 1990: 0, 2000: 0, 2010: 0, 2020: 0 };
  for (const legend of pool || []) {
    const bucket = eraBucket(legend?.season);
    stats[bucket] = (stats[bucket] || 0) + 1;
  }
  return stats;
}

/** "bref:season" — the app's legend identifier, same as mode-card data-legend. */
export function legendToken(legend) {
  return `${legend?.bref || ""}:${legend?.season ?? ""}`;
}

export function legendName(legend, lang = getLang()) {
  return lang === "en" ? legend?.nameEn || legend?.name || "" : legend?.name || legend?.nameEn || "";
}

/** Team name in the current language ("凯尔特人" / "Celtics"). */
export function legendTeamName(legend, lang = getLang()) {
  const zh = TEAM_NAMES_ZH[legend?.team] || legend?.team || "";
  return teamNameL(zh, lang);
}

/** Parse "bref:season" from a data attribute into an era photo URL. */
export function legendPhotoFromToken(token) {
  const [bref, season] = String(token || "").split(":");
  if (!bref) return null;
  return legendPhoto({ bref, season: Number(season) });
}

/** Real art for this legend, or null when the only option would be a generated avatar. */
export function legendPhoto(legend) {
  const { photo, photoSource } = resolveCardPhoto(legend);
  return photoSource === "generated" ? null : photo;
}

function photoImg(doc, src, alt) {
  const img = doc.createElement("img");
  img.src = src;
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  // A broken hotlink should vanish quietly, not leave a broken-image icon.
  img.addEventListener("error", () => img.closest("[data-photo-slot]")?.remove(), { once: true });
  return img;
}

/**
 * Challenge a legend. Returns "challenged" when the Duel is loaded and took the
 * challenge, "profile" when it is not loaded yet (the caller opens the profile instead).
 * A Duel that returns false — its screen isn't ready yet, or the legend is unknown —
 * also falls back to "profile".
 * `duel` is injectable for tests; it defaults to window.CourtsideDuel.
 */
export function challengeLegend(legend, duel) {
  const target = duel !== undefined ? duel : typeof window !== "undefined" ? window.CourtsideDuel : undefined;
  if (target && typeof target.challenge === "function") {
    if (target.challenge(legendToken(legend)) === false) return "profile";
    return "challenged";
  }
  return "profile";
}

/** Advance the marquee offset by dt, wrapping seamlessly at one set width. Pure. */
export function advanceOffset(offset, dtMs, pxPerSecond, setWidth) {
  if (!setWidth || setWidth <= 0 || !pxPerSecond || pxPerSecond <= 0 || !dtMs || dtMs <= 0) return offset;
  return (offset + (pxPerSecond * dtMs) / 1000) % setWidth;
}


function makeEl(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function buildLegendCard(doc, legend, lang, interactive, onOpen, onChallenge) {
  const card = makeEl(doc, "article", "lg-card");
  card.dataset.legend = legendToken(legend);
  const open = makeEl(doc, "button", "lg-card-open");
  open.type = "button";
  open.setAttribute("aria-label", `${TL(lang, "查看", "View")} ${legendName(legend, lang)}`);
  const photo = makeEl(doc, "span", "lg-photo");
  photo.dataset.photoSlot = "";
  const src = legendPhoto(legend);
  if (src) photo.append(photoImg(doc, src, ""));
  const caption = makeEl(doc, "span", "lg-caption");
  caption.append(makeEl(doc, "span", "lg-name", legendName(legend, lang)), makeEl(doc, "span", "lg-era", eraLabel(legend.season, lang)));
  open.append(photo, caption);
  card.append(open);
  const challenge = makeEl(doc, "button", "lg-challenge", TL(lang, "挑战传奇", "Challenge"));
  challenge.type = "button";
  challenge.setAttribute("aria-label", `${TL(lang, "挑战", "Challenge")} ${legendName(legend, lang)}`);
  card.append(challenge);
  if (!interactive) {
    // The second (loop) copy is visually identical but must stay out of the tab order
    // and out of screen readers; clicks on it still work through track delegation.
    card.setAttribute("aria-hidden", "true");
    open.tabIndex = -1;
    challenge.tabIndex = -1;
  } else {
    open.addEventListener("click", () => onOpen(legend));
    challenge.addEventListener("click", () => onChallenge(legend));
  }
  return card;
}

function buildLegendProfile(doc, legend, lang, onChallenge, onClose) {
  const panel = makeEl(doc, "div", "lg-profile");
  const close = makeEl(doc, "button", "lg-profile-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", TL(lang, "关闭", "Close"));
  close.addEventListener("click", onClose);
  panel.append(close);
  const photo = makeEl(doc, "span", "lg-profile-photo");
  photo.dataset.photoSlot = "";
  const src = legendPhoto(legend);
  if (src) photo.append(photoImg(doc, src, ""));
  panel.append(photo);
  const body = makeEl(doc, "div", "lg-profile-body");
  body.append(makeEl(doc, "h3", "lg-profile-name", legendName(legend, lang)));
  body.append(makeEl(doc, "p", "lg-profile-meta", `${legend.season} · ${legendTeamName(legend, lang)} · ${legend.pos}`));
  body.append(
    makeEl(
      doc,
      "p",
      "lg-profile-stats",
      TL(lang, `${legend.ppg} 分 · ${legend.rpg} 篮板 · ${legend.apg} 助攻`, `${legend.ppg} PTS · ${legend.rpg} REB · ${legend.apg} AST`),
    ),
  );
  const challenge = makeEl(doc, "button", "btn primary lg-profile-challenge", TL(lang, "挑战传奇", "Challenge this legend"));
  challenge.type = "button";
  challenge.addEventListener("click", () => onChallenge(legend));
  body.append(challenge);
  panel.append(body);
  return panel;
}

/**
 * Render the Legends Gallery marquee into `container` (the #mw-legends-gallery mount
 * inside the My World panel). Returns a handle { el, destroy, refresh, step, offset }
 * or null when there is no container / no document. `opts.env` injects the browser
 * globals for tests; `opts.measureSetWidth` / `opts.measureCardStep` inject layout
 * measurements for tests (the browser measures the real track).
 */
export function renderLegendsGallery(container, legends = GALLERY_LEGENDS, opts = {}) {
  if (!container) return null;
  const doc = opts.doc || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const win = typeof window !== "undefined" ? window : undefined;
  const env = {
    matchMedia: win?.matchMedia?.bind(win) || null,
    requestAnimationFrame: win?.requestAnimationFrame?.bind(win) || null,
    cancelAnimationFrame: win?.cancelAnimationFrame?.bind(win) || null,
    IntersectionObserver: win?.IntersectionObserver || null,
    ...(opts.env || {}),
  };
  const lang = opts.lang || getLang();
  const pxPerSecond = opts.pxPerSecond ?? GALLERY_PX_PER_SECOND;
  const reduced = (() => {
    try {
      return env.matchMedia ? env.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    } catch {
      return false;
    }
  })();
  // Legends without real art never get a card (same rule as the old wall).
  const shown = (legends || []).filter((legend) => legendPhoto(legend));
  const byToken = new Map(shown.map((legend) => [legendToken(legend), legend]));

  container.replaceChildren();
  const head = makeEl(doc, "div", "lg-head");
  head.append(makeEl(doc, "h2", "", TL(lang, "传奇长廊", "Legends Gallery")));
  head.append(makeEl(doc, "p", "lg-head-sub", TL(lang, "跨越时代，遇见篮球传奇", "Across the eras, meet the legends")));
  container.append(head);

  const viewport = makeEl(doc, "div", `lg-viewport${reduced ? " lg-static" : ""}`);
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", TL(lang, "篮球传奇长廊", "Legends gallery"));
  const track = makeEl(doc, "div", "lg-track");
  const profileSlot = makeEl(doc, "div", "lg-profile-slot");
  profileSlot.hidden = true;

  let offset = 0;
  let setWidth = 0;
  let destroyed = false;
  let rafId = 0;
  let lastT = 0;
  let hovering = false;
  let focused = false;
  let dragging = false;
  let intersecting = true;
  let dragStartX = 0;
  let dragStartOffset = 0;
  let dragMoved = 0;
  let suppressClickUntil = 0;
  const removers = [];
  const on = (target, type, fn, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, fn, options);
    removers.push(() => target.removeEventListener?.(type, fn, options));
  };

  const measure = () => {
    if (opts.measureSetWidth) {
      setWidth = opts.measureSetWidth();
      return;
    }
    // Two identical copies side by side: one set is half the track.
    const w = track.scrollWidth || 0;
    setWidth = reduced ? 0 : w / 2;
  };

  const paint = () => {
    track.style.transform = reduced ? "" : `translateX(${-offset}px)`;
  };

  // doc.hidden is read live every frame, so no visibilitychange listener is needed.
  const paused = () => reduced || hovering || focused || dragging || !intersecting || (doc.hidden ?? false);

  const openProfile = (legend) => {
    profileSlot.replaceChildren(
      buildLegendProfile(
        doc,
        legend,
        lang,
        (picked) => {
          if (challengeLegend(picked) === "profile") openProfile(picked);
        },
        () => {
          profileSlot.hidden = true;
          profileSlot.replaceChildren();
        },
      ),
    );
    profileSlot.hidden = false;
  };

  const tryChallenge = (legend) => {
    if (challengeLegend(legend) === "profile") openProfile(legend);
  };

  for (const legend of shown) track.append(buildLegendCard(doc, legend, lang, true, openProfile, tryChallenge));
  if (!reduced) {
    for (const legend of shown) track.append(buildLegendCard(doc, legend, lang, false, openProfile, tryChallenge));
  }
  viewport.append(track);
  const prev = makeEl(doc, "button", "lg-nav lg-prev", "‹");
  prev.type = "button";
  prev.setAttribute("aria-label", TL(lang, "上一个", "Previous"));
  const next = makeEl(doc, "button", "lg-nav lg-next", "›");
  next.type = "button";
  next.setAttribute("aria-label", TL(lang, "下一个", "Next"));
  viewport.append(prev, next);
  container.append(viewport, profileSlot);

  const cardStep = () => {
    if (opts.measureCardStep) return opts.measureCardStep();
    const first = track.querySelector(".lg-card");
    const w = first?.getBoundingClientRect?.()?.width || 0;
    if (w > 0) return w + 12; // 12px track gap
    return setWidth > 0 && shown.length ? setWidth / shown.length : 160;
  };
  const nudge = (dir) => {
    if (reduced) {
      viewport.scrollBy?.({ left: dir * viewport.clientWidth * 0.8, behavior: "smooth" });
      return;
    }
    measure();
    if (setWidth > 0) {
      offset = (((offset + dir * cardStep()) % setWidth) + setWidth) % setWidth;
      paint();
    }
  };
  prev.addEventListener("click", () => nudge(-1));
  next.addEventListener("click", () => nudge(1));

  // One delegated click handler for both track copies; a drag must not open a profile on release.
  const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  on(track, "click", (event) => {
    if (nowMs() < suppressClickUntil) return;
    const card = event.target?.closest?.(".lg-card");
    if (!card) return;
    const legend = byToken.get(card.dataset.legend);
    if (!legend) return;
    if (event.target?.closest?.(".lg-challenge")) tryChallenge(legend);
    else if (event.target?.closest?.(".lg-card-open")) openProfile(legend);
  });

  if (!reduced) {
    on(viewport, "mouseenter", () => {
      hovering = true;
    });
    on(viewport, "mouseleave", () => {
      hovering = false;
    });
    on(viewport, "focusin", () => {
      focused = true;
    });
    on(viewport, "focusout", () => {
      focused = false;
    });
    on(viewport, "pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      dragging = true;
      dragStartX = event.clientX ?? 0;
      dragStartOffset = offset;
      dragMoved = 0;
      viewport.setPointerCapture?.(event.pointerId);
    });
    on(viewport, "pointermove", (event) => {
      if (!dragging) return;
      const dx = (event.clientX ?? 0) - dragStartX;
      dragMoved = Math.max(dragMoved, Math.abs(dx));
      measure();
      if (setWidth > 0) {
        offset = (((dragStartOffset - dx) % setWidth) + setWidth) % setWidth;
        paint();
      }
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (dragMoved > 6) suppressClickUntil = nowMs() + 150;
    };
    on(viewport, "pointerup", endDrag);
    on(viewport, "pointercancel", endDrag);
    if (env.IntersectionObserver) {
      try {
        const io = new env.IntersectionObserver((entries) => {
          intersecting = entries[0]?.isIntersecting ?? true;
        });
        io.observe(viewport);
        removers.push(() => io.disconnect());
      } catch {
        /* observer unavailable: keep scrolling */
      }
    }
    if (win?.addEventListener) on(win, "resize", measure);
  }

  const step = (t) => {
    if (destroyed || reduced) return;
    if (lastT) {
      // Cap dt: a background tab's first frame back must not jump the marquee.
      const dt = Math.min(t - lastT, 100);
      if (!paused()) offset = advanceOffset(offset, dt, pxPerSecond, setWidth);
      paint();
    }
    lastT = t;
  };
  const loop = (t) => {
    if (destroyed) return;
    step(t);
    if (env.requestAnimationFrame) rafId = env.requestAnimationFrame(loop);
  };

  measure();
  paint();
  if (!reduced && env.requestAnimationFrame) rafId = env.requestAnimationFrame(loop);

  let lastLang = lang;
  const handle = {
    el: container,
    get offset() {
      return offset;
    },
    get setWidth() {
      return setWidth;
    },
    step,
    refresh() {
      // Re-render only when the language changed (a flip re-renders My World but not
      // this module); otherwise just re-measure — the panel may have been hidden.
      if (getLang() !== lastLang) {
        handle.destroy();
        return renderLegendsGallery(container, legends, opts) || handle;
      }
      measure();
      paint();
      return handle;
    },
    destroy() {
      destroyed = true;
      if (rafId && env.cancelAnimationFrame) env.cancelAnimationFrame(rafId);
      for (const remove of removers) remove();
      container.replaceChildren();
    },
  };
  return handle;
}

let galleryHandle = null;

function wireInfoDialogs(doc) {
  const bindDialog = (openBtnId, dialogId) => {
    const btn = doc.querySelector(`#${openBtnId}`);
    const dialog = doc.querySelector(`#${dialogId}`);
    if (!btn || !dialog) return;
    btn.addEventListener("click", () => {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
    dialog.querySelectorAll("[data-close-dialog]").forEach((b) => b.addEventListener("click", () => dialog.close?.()));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close?.();
    });
  };
  bindDialog("btn-how-to-play", "howto-dialog");
  bindDialog("btn-about", "about-dialog");
  // Credits live inside the About dialog: leaving for the credits screen
  // must close the dialog first, or it would float above the new screen.
  const about = doc.querySelector("#about-dialog");
  about?.querySelector("#btn-open-credits")?.addEventListener("click", () => about.close?.());
}

export function decorateModeCards(root) {
  if (!root) return 0;
  let count = 0;
  for (const card of root.querySelectorAll(".mode-card[data-legend]")) {
    if (card.querySelector(".mode-card-photo")) continue;
    const src = legendPhotoFromToken(card.dataset.legend);
    if (!src) continue;
    const slot = document.createElement("span");
    slot.className = "mode-card-photo";
    slot.dataset.photoSlot = "";
    slot.setAttribute("aria-hidden", "true");
    slot.append(photoImg(document, src, ""));
    card.classList.add("has-photo");
    card.prepend(slot);
    count += 1;
  }
  return count;
}

export function decorateHome(doc = document) {
  decorateModeCards(doc.querySelector("#screen-home"));
  const mount = doc.querySelector("#mw-legends-gallery");
  if (mount) galleryHandle = renderLegendsGallery(mount);
  wireInfoDialogs(doc);
  // A language flip re-renders My World but not this module: refresh the gallery
  // (language + measurements) when the player comes back to the world tab.
  doc.querySelector('.home-tab[data-category="world"]')?.addEventListener("click", () => {
    galleryHandle = galleryHandle?.refresh() ?? galleryHandle;
  });
}
