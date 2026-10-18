#!/usr/bin/env python3
"""
Lightweight scrape of 2kratings.com Top-100 OVR tables (no Playwright).

Primary URL (current game):
  https://www.2kratings.com/lists/top-100-highest-nba-2k-ratings

Often blocked by corporate proxies / bot challenges. Prefer nba2kapi when possible.
On success writes: data/raw/2kratings/top100_{game}.json

Usage:
  python3 scripts/fetch_2kratings_top.py
  python3 scripts/fetch_2kratings_top.py --game 2k27
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "raw" / "2kratings"
URL = "https://www.2kratings.com/lists/top-100-highest-nba-2k-ratings"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def parse_top100(html: str) -> tuple[str, list[dict]]:
    """Return (gameLabel, rows)."""
    game = "unknown"
    m = re.search(r"NBA\s+(2K\d{2})", html, re.I)
    if m:
        game = m.group(1).upper()

    rows = []
    # Table rows: player link + OVR cell. Structure drifts; be permissive.
    # Example cells often: name in <a>, then rating number nearby.
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        if "entry-font" not in tr and "href=" not in tr:
            continue
        name_m = re.search(
            r'href="https?://www\.2kratings\.com/([^"]+)"[^>]*>\s*([^<]+)',
            tr,
            re.I,
        )
        if not name_m:
            name_m = re.search(r'class="[^"]*entry-font[^"]*"[^>]*>\s*([^<]+)', tr, re.I)
            slug, name = "", (name_m.group(1).strip() if name_m else "")
        else:
            slug, name = name_m.group(1).strip("/"), name_m.group(2).strip()
        name = re.sub(r"\s+", " ", name).strip()
        if not name or name.lower() in ("player", "name"):
            continue
        # ratings: look for standalone 2-digit overall-ish numbers in rating spans
        nums = [int(x) for x in re.findall(r'class="[^"]*rating[^"]*"[^>]*>\s*(\d{2,3})', tr, re.I)]
        if not nums:
            nums = [int(x) for x in re.findall(r">\s*(\d{2})\s*<", tr) if 40 <= int(x) <= 99]
        if not nums:
            continue
        ovr = nums[0]
        three = nums[1] if len(nums) > 1 else None
        dunk = nums[2] if len(nums) > 2 else None
        pos_m = re.search(r"\b(PG|SG|SF|PF|C)(?:\s*/\s*(PG|SG|SF|PF|C))?\b", tr)
        pos = pos_m.group(0).replace(" ", "") if pos_m else ""
        team_m = re.search(r"\b([A-Z]{2,3})\b", tr)
        # avoid matching PG/SG as team — take last short code in row often team abbr in logo alt
        teams = re.findall(r'alt="([A-Z]{2,3})"|/teams/([a-z0-9\-]+)', tr)
        team = ""
        if teams:
            a, b = teams[-1]
            team = a or b
        rows.append(
            {
                "n": name,
                "slug": slug,
                "o": ovr,
                "3": three,
                "d": dunk,
                "p": pos,
                "t": team.upper() if team and len(team) <= 3 else team,
            }
        )

    # de-dupe by name keeping first (table order = rank)
    seen = set()
    uniq = []
    for r in rows:
        k = r["n"].lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    return game, uniq[:120]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--game", default="", help="Label override e.g. 2k27")
    ap.add_argument("--url", default=URL)
    args = ap.parse_args()

    req = urllib.request.Request(args.url, headers={"User-Agent": UA, "Accept": "text/html"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            html = resp.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} fetching {args.url} (proxy/bot block?)") from e
    except urllib.error.URLError as e:
        raise SystemExit(f"Cannot reach 2kratings.com: {e.reason}") from e

    if "McAfee" in html or "Blocked by URL Filter" in html or len(html) < 2000:
        raise SystemExit("2kratings.com blocked or challenge page returned — use nba2kapi instead.")

    game, rows = parse_top100(html)
    if args.game:
        game = args.game.upper().replace("NBA", "").strip()
        if not game.startswith("2K"):
            game = "2K" + re.sub(r"\D", "", game)
    if len(rows) < 20:
        print(f"Parsed only {len(rows)} rows — HTML structure may have changed.", file=sys.stderr)
        # still write for debugging
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "source": args.url,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "gameVersion": game,
        "count": len(rows),
        "players": rows,
    }
    path = OUT_DIR / f"top100_{game.lower()}.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {path} players={len(rows)} game={game}")
    if rows:
        top = ", ".join(f"{r['n']} {r['o']}" for r in rows[:5])
        print("top:", top)


if __name__ == "__main__":
    main()
