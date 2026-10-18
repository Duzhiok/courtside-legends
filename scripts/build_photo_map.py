#!/usr/bin/env python3
"""
Build era-aware player photo map.

Resolution order per bref + decade bucket:
  1) Wikimedia Commons search ("{name} basketball {decade}")
  2) Google Custom Search images (GOOGLE_API_KEY + GOOGLE_CSE_ID)
  3) DuckDuckGo image search (no key; best-effort)
  4) Leave unset → runtime falls back to BRef / NBA CDN / avatar

Same player across decades gets different URLs when search finds year-tagged shots.
Ephemeral Google/DDG URLs are downloaded into assets/photos/.

Usage:
  python3 scripts/build_photo_map.py --priority
  python3 scripts/build_photo_map.py --limit 200
  python3 scripts/build_photo_map.py              # resume full pass
  python3 scripts/build_photo_map.py --check-bref # only probe missing BRef heads
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROSTER = ROOT / "js" / "data" / "roster.json"
CACHE = ROOT / "data" / "raw" / "photos_cache.json"
OUT_JS = ROOT / "js" / "data" / "photos.scraped.js"
ASSET_DIR = ROOT / "assets" / "photos"
UA = "CourtsideLegendsPhotoBot/1.0 (educational; nba-coach-sim; contact: local)"


def clamp_decade(season: int) -> int:
    return (int(season) // 10) * 10


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


_WIKI_COOLDOWN_UNTIL = 0.0


def http_json(url: str, timeout: int = 30, retries: int = 3) -> dict:
    global _WIKI_COOLDOWN_UNTIL
    last_err: Exception | None = None
    for attempt in range(retries):
        if "wikimedia.org" in url or "wikipedia.org" in url:
            wait = _WIKI_COOLDOWN_UNTIL - time.time()
            if wait > 0:
                time.sleep(min(wait, 30))
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8", "ignore"))
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                _WIKI_COOLDOWN_UNTIL = time.time() + 20 * (attempt + 1)
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except Exception as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(str(last_err))


def http_bytes(url: str, timeout: int = 45) -> tuple[bytes, str]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "image/*,*/*"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
        return resp.read(), ctype


def bref_photo_ok(bref: str) -> bool:
    url = f"https://www.basketball-reference.com/req/202106291/images/headshots/{bref}.jpg"
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


_BAD_FILE_TOKENS = (
    ".svg",
    ".pdf",
    ".djvu",
    "logo",
    "icon",
    "wordmark",
    "signature",
    "handbook",
    "arbutus",
    "yearbook",
    "scorer",
    "box score",
    "boxscore",
    "schedule",
    "roster poster",
    "word cloud",
    "map of",
    "diagram",
)


def _last_name(name: str) -> str:
    parts = [p for p in re.split(r"\s+", name.strip()) if p]
    return parts[-1].lower() if parts else ""


def wiki_search_file(query: str, player_name: str = "") -> str | None:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srnamespace": 6,  # File
            "srlimit": 12,
            "format": "json",
        }
    )
    url = f"https://commons.wikimedia.org/w/api.php?{q}"
    try:
        data = http_json(url)
    except Exception:
        return None
    hits = data.get("query", {}).get("search") or []
    last = _last_name(player_name)
    ranked: list[tuple[int, str]] = []
    for h in hits:
        title = h.get("title") or ""
        low = title.lower()
        if not title.startswith("File:"):
            continue
        if any(tok in low for tok in _BAD_FILE_TOKENS):
            continue
        if not any(ext in low for ext in (".jpg", ".jpeg", ".png", ".webp")):
            continue
        score = 0
        if last and last in low:
            score += 5
        if "basketball" in low or "nba" in low:
            score += 2
        if re.search(r"19\d{2}|20\d{2}", low):
            score += 1
        ranked.append((score, title))
    if not ranked:
        return None
    ranked.sort(key=lambda x: -x[0])
    # Require last-name match when possible to avoid random PDFs/yearbooks
    if last:
        named = [t for s, t in ranked if last in t.lower()]
        if named:
            return named[0]
        # no name match — refuse rather than pick garbage
        return None
    return ranked[0][1]


def wiki_thumb(title: str, width: int = 300) -> str | None:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": width,
            "format": "json",
        }
    )
    url = f"https://commons.wikimedia.org/w/api.php?{q}"
    try:
        data = http_json(url)
    except Exception:
        return None
    for page in (data.get("query", {}).get("pages") or {}).values():
        info = page.get("imageinfo") or []
        if not info:
            continue
        return info[0].get("thumburl") or info[0].get("url")
    return None


def google_image(query: str) -> str | None:
    key = (os.environ.get("GOOGLE_API_KEY") or "").strip()
    cx = (os.environ.get("GOOGLE_CSE_ID") or os.environ.get("GOOGLE_CSE_CX") or "").strip()
    if not key or not cx:
        return None
    q = urllib.parse.urlencode(
        {
            "key": key,
            "cx": cx,
            "q": query,
            "searchType": "image",
            "num": 3,
            "safe": "active",
            "imgType": "face",
        }
    )
    url = f"https://www.googleapis.com/customsearch/v1?{q}"
    try:
        data = http_json(url)
    except Exception:
        return None
    for item in data.get("items") or []:
        link = item.get("link")
        if link:
            return link
    return None


def ddg_images(query: str) -> str | None:
    """Best-effort DuckDuckGo image search (Google-like, no API key)."""
    try:
        seed = urllib.parse.urlencode({"q": query, "iax": "images", "ia": "images"})
        seed_url = f"https://duckduckgo.com/?{seed}"
        req = urllib.request.Request(
            seed_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "text/html",
            },
        )
        html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")
        m = re.search(r"vqd=([^&'\"]+)", html)
        if not m:
            m = re.search(r'vqd":\s*"([^"]+)"', html)
        if not m:
            return None
        vqd = urllib.parse.unquote(m.group(1))
        params = urllib.parse.urlencode(
            {
                "l": "us-en",
                "o": "json",
                "q": query,
                "vqd": vqd,
                "f": ",,,,,,",
                "p": "1",
            }
        )
        api = f"https://duckduckgo.com/i.js?{params}"
        req2 = urllib.request.Request(
            api,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Referer": "https://duckduckgo.com/",
                "Accept": "application/json",
            },
        )
        raw = urllib.request.urlopen(req2, timeout=25).read().decode("utf-8", "ignore")
        data = json.loads(raw)
        for row in data.get("results") or []:
            u = row.get("image") or row.get("thumbnail")
            if u and u.startswith("http"):
                return u
    except Exception:
        return None
    return None


def enwiki_pageimage(name: str) -> str | None:
    """English Wikipedia lead image — stable career fallback (not era-specific)."""
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": f"{name} basketball",
            "gsrlimit": 1,
            "prop": "pageimages",
            "piprop": "thumbnail",
            "pithumbsize": 320,
            "format": "json",
        }
    )
    url = f"https://en.wikipedia.org/w/api.php?{q}"
    try:
        data = http_json(url)
    except Exception:
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        thumb = (page.get("thumbnail") or {}).get("source")
        if thumb:
            return thumb
    return None


def auction_games_for_decade(decade: int) -> list[str]:
    """Map NBA decade → likely 2K auction game tags (era look)."""
    if decade >= 2020:
        return ["2k25", "2k24", "2k23", "2k27"]
    if decade >= 2010:
        return ["2k16", "2k18", "2k20", "2k21"]
    if decade >= 2000:
        return ["2k16", "2k14"]  # classic rosters often live under later games
    return ["2k16", "2k25"]


def auction_portrait(name: str, decade: int) -> str | None:
    """2kauction MyNBA portrait — changes by game= (era look)."""
    slug = slugify(name)
    if not slug:
        return None
    for game in auction_games_for_decade(decade):
        page = f"https://2kauction.com/mynba/{game}/players/{slug}"
        try:
            req = urllib.request.Request(page, headers={"User-Agent": "Mozilla/5.0"})
            html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")
        except Exception:
            continue
        m = re.search(
            r'og:image"\s+content="(https://(?:api|img)\.2kauction\.com/api/mynba/portraits/(?:photo|render)/\d+\.png\?game=[^"]+)"',
            html,
        )
        if not m:
            m = re.search(
                r"(https://(?:api|img)\.2kauction\.com/api/mynba/portraits/(?:photo|render)/\d+\.png\?game="
                + re.escape(game)
                + r"[^\"\s]*)",
                html,
            )
        if m:
            url = m.group(1).replace("&amp;", "&")
            # prefer compact webp
            if "fmt=" not in url:
                url = url + ("&" if "?" in url else "?") + "fmt=webp&w=256"
            return url
    return None


def should_localize(url: str) -> bool:
    host = urllib.parse.urlparse(url).netloc.lower()
    if "wikimedia.org" in host or "wikipedia.org" in host:
        return False
    if "basketball-reference.com" in host:
        return False
    if "cdn.nba.com" in host:
        return False
    if "2kauction.com" in host:
        return False
    return True


def localize(url: str, bref: str, decade: int) -> str:
    """Download ephemeral image to assets/photos and return relative URL."""
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    ext = ".jpg"
    path_part = urllib.parse.urlparse(url).path.lower()
    for e in (".png", ".webp", ".jpeg", ".jpg", ".gif"):
        if path_part.endswith(e):
            ext = ".jpg" if e == ".jpeg" else e
            break
    fname = f"{bref}_{decade}{ext}"
    dest = ASSET_DIR / fname
    try:
        blob, ctype = http_bytes(url)
        if "html" in (ctype or "") or len(blob) < 800:
            raise RuntimeError("not an image")
        if ctype == "image/png":
            dest = ASSET_DIR / f"{bref}_{decade}.png"
        elif ctype == "image/webp":
            dest = ASSET_DIR / f"{bref}_{decade}.webp"
        dest.write_bytes(blob)
        rel = f"assets/photos/{dest.name}"
        return rel
    except Exception:
        # keep remote URL as last resort
        return url


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {"brefOk": {}, "decade": {}, "failed": {}, "updatedAt": None}


def save_cache(cache: dict) -> None:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    cache["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def emit_js(cache: dict) -> None:
    decade = cache.get("decade") or {}
    # also build bref default = latest decade with a hit
    by_bref: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for key, meta in decade.items():
        if not meta or not meta.get("url"):
            continue
        bref, dec = key.split(":")
        by_bref[bref].append((int(dec), meta["url"]))
    defaults = {}
    for bref, pairs in by_bref.items():
        pairs.sort()
        defaults[bref] = pairs[-1][1]

    lines = [
        "/**",
        " * AUTO-GENERATED by scripts/build_photo_map.py — do not edit by hand.",
        f" * decade keys={len(decade)} brefDefaults={len(defaults)}",
        " * Era photos: Wikimedia / Google CSE / DuckDuckGo → assets/photos when needed.",
        " */",
        "",
        "/** `@bref:@decade` → image URL (https or assets/photos/...) */",
        "export const PHOTO_BY_BREF_DECADE = {",
    ]
    for key in sorted(decade.keys(), key=lambda k: (k.split(":")[0], int(k.split(":")[1]))):
        meta = decade[key]
        url = meta.get("url")
        if not url:
            continue
        lines.append(f"  {json.dumps(key)}: {json.dumps(url)},")
    lines.append("};")
    lines.append("")
    lines.append("/** Fallback when no decade hit — usually latest found era shot. */")
    lines.append("export const PHOTO_BY_BREF = {")
    for bref in sorted(defaults.keys()):
        lines.append(f"  {json.dumps(bref)}: {json.dumps(defaults[bref])},")
    lines.append("};")
    lines.append("")
    OUT_JS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_JS}")


def collect_jobs(roster: dict, priority: bool) -> list[tuple[str, str, int]]:
    """Return list of (bref, name, decade)."""
    seasons_by: dict[str, set[int]] = defaultdict(set)
    names: dict[str, str] = {}
    max_ppg: dict[str, float] = defaultdict(float)
    for p in roster.get("players") or []:
        bref = p.get("bref")
        if not bref:
            continue
        names[bref] = p.get("name") or names.get(bref) or bref
        if p.get("season") is not None:
            seasons_by[bref].add(int(p["season"]))
        max_ppg[bref] = max(max_ppg[bref], float(p.get("ppg") or 0))

    jobs = []
    for bref, seasons in seasons_by.items():
        decades = sorted({clamp_decade(s) for s in seasons})
        for dec in decades:
            jobs.append((bref, names[bref], dec))

    if priority:
        # stars / long careers first, then everyone
        def score(job):
            bref, name, dec = job
            return (
                0 if max_ppg[bref] >= 18 else 1,
                0 if max_ppg[bref] >= 12 else 1,
                -max_ppg[bref],
                -len(seasons_by[bref]),
                bref,
                dec,
            )

        jobs.sort(key=score)
    else:
        jobs.sort(key=lambda j: (j[0], j[2]))
    return jobs


def resolve_one(
    name: str,
    decade: int,
    sleep: float,
    used_urls: set[str] | None = None,
) -> tuple[str | None, str]:
    """Fewer Wiki hits (avoid 429); Google/DDG/2kauction fill gaps.
    `used_urls` = other decade photos for same player — prefer a different shot.
    """
    used_urls = used_urls or set()

    def accept(url: str | None) -> str | None:
        if not url:
            return None
        url = url.split("?")[0] if "utm_" in url else url
        low = url.lower()
        if any(tok in low for tok in (".pdf", "/page1-", "djvu")):
            return None
        if url in used_urls:
            return None
        return url

    wiki_queries = [
        f"{name} basketball {decade}",
        f'{name} "{decade}" NBA',
        f"{name} basketball",
    ]
    # 1) Wikimedia Commons (rate-limited)
    for q in wiki_queries:
        if time.time() < _WIKI_COOLDOWN_UNTIL:
            break
        time.sleep(max(sleep, 0.35))
        try:
            title = wiki_search_file(q, player_name=name)
        except Exception:
            break
        if not title:
            continue
        time.sleep(max(sleep, 0.35))
        try:
            url = accept(wiki_thumb(title))
        except Exception:
            break
        if url:
            return url, f"wiki:{q}"

    # 2) Google CSE (real Google Images when keys set)
    for q in (f"{name} {decade} NBA headshot", f"{name} {decade} basketball"):
        time.sleep(sleep)
        url = accept(google_image(q))
        if url:
            return url, f"google:{q}"

    # 3) DuckDuckGo images (Google-like, no key) — good for year-specific
    for q in (f"{name} {decade} NBA", f"{name} {decade} basketball player"):
        time.sleep(sleep)
        url = accept(ddg_images(q))
        if url:
            return url, f"ddg:{q}"

    # 4) 2kauction era portrait (game model face by decade)
    time.sleep(sleep)
    url = accept(auction_portrait(name, decade))
    if url:
        return url, f"2kauction:{decade}"

    # 5) enwiki lead image (career — only if nothing else)
    if time.time() >= _WIKI_COOLDOWN_UNTIL:
        time.sleep(max(sleep, 0.35))
        try:
            url = accept(enwiki_pageimage(name))
        except Exception:
            url = None
        if url:
            return url, "enwiki"

    return None, "none"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0, help="Max new decade keys to resolve this run")
    ap.add_argument("--priority", action="store_true", help="Stars / scorers first")
    ap.add_argument("--sleep", type=float, default=0.4, help="Delay between API calls")
    ap.add_argument("--check-bref", action="store_true", help="Only refresh brefOk probe cache")
    ap.add_argument("--emit-only", action="store_true", help="Rewrite JS from cache only")
    args = ap.parse_args()

    cache = load_cache()
    if args.emit_only:
        emit_js(cache)
        return

    roster = json.loads(ROSTER.read_text(encoding="utf-8"))

    # Full BRef probe only on --check-bref (slow). Normal runs skip / resume cache.
    if args.check_bref:
        brefs = sorted({p["bref"] for p in roster["players"] if p.get("bref")})
        print(f"Probing BRef headshots for {len(brefs)} players...", flush=True)
        ok_map = cache.get("brefOk") or {}
        done = 0
        for bref in brefs:
            ok_map[bref] = bref_photo_ok(bref)
            done += 1
            if done % 100 == 0:
                print(f"  probed {done}/{len(brefs)}", flush=True)
                cache["brefOk"] = ok_map
                save_cache(cache)
            time.sleep(0.02)
        cache["brefOk"] = ok_map
        save_cache(cache)
        miss = sum(1 for v in ok_map.values() if not v)
        print(f"BRef ok={len(ok_map)-miss} miss={miss}", flush=True)
        return

    jobs = collect_jobs(roster, priority=args.priority)
    decade_map = cache.setdefault("decade", {})
    failed = cache.setdefault("failed", {})

    # Keep collect_jobs order (priority stars first when --priority).
    pending = []
    for j in jobs:
        key = f"{j[0]}:{j[2]}"
        if key in decade_map:
            continue
        # retry soft-failures a few times (Google key may appear later)
        if failed.get(key, {}).get("tries", 0) >= 3:
            continue
        pending.append(j)

    if args.limit and args.limit > 0:
        pending = pending[: args.limit]

    print(
        f"jobs total={len(jobs)} pending_this_run={len(pending)} cached={len(decade_map)}",
        flush=True,
    )
    resolved = 0
    for i, (bref, name, decade) in enumerate(pending, 1):
        key = f"{bref}:{decade}"
        used = {
            meta["url"]
            for k, meta in decade_map.items()
            if k.startswith(f"{bref}:") and meta.get("url")
        }
        url, src = resolve_one(name, decade, args.sleep, used_urls=used)
        if url:
            if should_localize(url):
                url = localize(url, bref, decade)
            decade_map[key] = {"url": url, "source": src, "name": name}
            resolved += 1
            print(f"[{i}/{len(pending)}] OK {key} ← {src}", flush=True)
        else:
            failed[key] = {"name": name, "tries": failed.get(key, {}).get("tries", 0) + 1}
            print(f"[{i}/{len(pending)}] MISS {key} ({name})", flush=True)
        if i % 25 == 0:
            save_cache(cache)
            emit_js(cache)

    save_cache(cache)
    emit_js(cache)
    print(
        f"Done. newly_resolved={resolved} decade_cached={len(decade_map)} failed={len(failed)}",
        flush=True,
    )
    has_google = bool(
        os.environ.get("GOOGLE_API_KEY")
        and (os.environ.get("GOOGLE_CSE_ID") or os.environ.get("GOOGLE_CSE_CX"))
    )
    if not has_google:
        print(
            "Tip: export GOOGLE_API_KEY + GOOGLE_CSE_ID for Google image fallback on misses.",
            flush=True,
        )


if __name__ == "__main__":
    main()
