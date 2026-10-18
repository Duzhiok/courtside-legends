#!/usr/bin/env python3
"""
Fetch NBA 2K edition ratings from 2karchive.com (public board dump).

There is no redistributable official 2K Sports API. 2K Archive aggregates
launch / update rosters (sourced from 2kAuction MyNBA, CBS, etc.) into a
`const YEARS = {...}` blob on the homepage. We persist that blob for offline
anchor builds.

Usage:
  python3 scripts/fetch_2k_archive.py
"""
from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "2karchive_years.json"
URL = "https://2karchive.com/"
UA = "CourtsideLegends2KImport/1.0 (educational; local roster calibration)"


def fetch_years() -> tuple[dict, dict]:
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        html = resp.read().decode("utf-8", "ignore")
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
    if not scripts:
        raise RuntimeError("No <script> blocks on 2karchive homepage")
    big = max(scripts, key=len)
    marker = "const YEARS = "
    i = big.find(marker)
    if i < 0:
        raise RuntimeError("YEARS blob not found on 2karchive homepage")
    years, end = json.JSONDecoder().raw_decode(big, i + len(marker))
    meta = {}
    mi = big.find("const META = ", end)
    if mi >= 0:
        # META uses unquoted keys sometimes — extract note strings per year
        chunk = big[mi : mi + 8000]
        for y, note in re.findall(r'"(\d{4})"\s*:\s*\{\s*note\s*:\s*"([^"]*)"', chunk):
            meta[y] = {"note": note}
    return years, meta


def main() -> None:
    years, meta = fetch_years()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": URL,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "note": (
            "Not affiliated with 2K Sports. Edition key ≈ NBA 2K{YY}. "
            "Attrs (3/m/l/d/s/bh/pd/id) present from ~2016 onward."
        ),
        "meta": meta,
        "years": years,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    counts = {y: len(years[y]) for y in sorted(years, key=int)}
    print(f"Wrote {OUT} editions={len(counts)} players={sum(counts.values())}")
    print("counts", counts)


if __name__ == "__main__":
    main()
