#!/usr/bin/env python3
"""
One-shot sync: pull unofficial 2K dumps → rebuild ratings2k.scraped.js.

Order:
  1) 2karchive.com (always tried — works on most networks)
  2) 2kratings.com top-100 (often proxy-blocked)
  3) nba2kapi.com bulk (needs NBA2K_API_KEY; often proxy-blocked)
  4) build_2k_anchors.py (merge, latest wins)

Usage:
  python3 scripts/sync_2k_ratings.py
  NBA2K_API_KEY=xxx python3 scripts/sync_2k_ratings.py --with-api
  python3 scripts/sync_2k_ratings.py --build-only
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable


def run(script: str, args: list[str] | None = None, check: bool = False) -> int:
    cmd = [PY, str(ROOT / "scripts" / script), *(args or [])]
    print(f"\n>>> {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=str(ROOT))
    if check and proc.returncode != 0:
        raise SystemExit(proc.returncode)
    return proc.returncode


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--build-only", action="store_true", help="Skip fetches; only rebuild anchors")
    ap.add_argument("--with-api", action="store_true", help="Also pull nba2kapi (requires NBA2K_API_KEY)")
    ap.add_argument("--with-2kratings", action="store_true", help="Also scrape 2kratings top-100")
    ap.add_argument("--skip-archive", action="store_true")
    ap.add_argument("--with-photos", action="store_true", help="Also scrape era photos (slow)")
    ap.add_argument("--photo-limit", type=int, default=200, help="Max new photo decades per sync")
    args = ap.parse_args()

    if not args.build_only:
        if not args.skip_archive:
            rc = run("fetch_2k_archive.py")
            if rc != 0:
                print("WARN: 2karchive fetch failed", file=sys.stderr)
        if args.with_2kratings:
            rc = run("fetch_2kratings_top.py")
            if rc != 0:
                print("WARN: 2kratings top-100 fetch failed (proxy/bot?)", file=sys.stderr)
        if args.with_api:
            rc = run("fetch_nba2kapi.py")
            if rc != 0:
                print(
                    "WARN: nba2kapi fetch failed — set NBA2K_API_KEY and/or leave corporate proxy",
                    file=sys.stderr,
                )
        if args.with_photos:
            rc = run(
                "build_photo_map.py",
                ["--priority", "--limit", str(args.photo_limit), "--sleep", "0.5"],
            )
            if rc != 0:
                print("WARN: photo scrape failed", file=sys.stderr)

    run("build_2k_anchors.py", check=True)
    print("\nDone. Hard-refresh the app (roster schema bump if you changed cards).")


if __name__ == "__main__":
    main()
