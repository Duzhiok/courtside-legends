#!/usr/bin/env python3
"""
Fetch NBA 2K rosters from nba2kapi.com (unofficial REST over 2kratings.com scrapes).

Auth: set NBA2K_API_KEY (free key from https://nba2kapi.com/dashboard).
Corporate proxies often block this host — run on a network that can reach it.

Usage:
  export NBA2K_API_KEY=...
  python3 scripts/fetch_nba2kapi.py              # all archived + current
  python3 scripts/fetch_nba2kapi.py --editions 2K24,2K25,2K26
  python3 scripts/fetch_nba2kapi.py --curr-only  # live /api/players/bulk only

Writes:
  data/raw/nba2kapi/versions.json
  data/raw/nba2kapi/{2K25}_curr.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "raw" / "nba2kapi"
BASE = "https://api.nba2kapi.com"
UA = "CourtsideLegends2KImport/1.0 (educational; local roster calibration)"


def api_get(path: str, key: str | None, params: dict | None = None) -> dict:
    q = urllib.parse.urlencode(params or {})
    url = f"{BASE}{path}" + (f"?{q}" if q else "")
    headers = {"User-Agent": UA, "Accept": "application/json"}
    if key:
        headers["X-API-Key"] = key
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:500]
        raise RuntimeError(f"HTTP {e.code} {url}\n{body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Cannot reach {BASE} ({e.reason}). "
            "If behind a corporate proxy, run this script off-network or allowlist api.nba2kapi.com."
        ) from e


def list_versions(key: str | None) -> list[dict]:
    # /api/versions is documented as no-key
    payload = api_get("/api/versions", key=None)
    data = payload.get("data") or payload
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected versions payload: {payload!r}"[:300])
    return data


def fetch_bulk(version: str | None, key: str, team_type: str = "curr") -> list[dict]:
    if version:
        path = f"/api/versions/{version}/players/bulk"
    else:
        path = "/api/players/bulk"
    payload = api_get(path, key, {"teamType": team_type})
    data = payload.get("data") or []
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected bulk payload for {version or 'live'}")
    return data


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--editions", default="", help="Comma list e.g. 2K24,2K25 (default: all)")
    ap.add_argument("--curr-only", action="store_true", help="Only live current roster bulk")
    ap.add_argument("--team-type", default="curr", choices=("curr", "class", "allt"))
    ap.add_argument("--sleep", type=float, default=0.4, help="Delay between edition calls")
    args = ap.parse_args()

    key = (os.environ.get("NBA2K_API_KEY") or os.environ.get("NBA2KAPI_KEY") or "").strip()
    if not key and not args.curr_only:
        # versions listing works without key; bulk needs key
        print(
            "WARNING: NBA2K_API_KEY not set. Will try /api/versions (public) then fail on bulk.\n"
            "Get a free key: https://nba2kapi.com/dashboard",
            file=sys.stderr,
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fetched_at = datetime.now(timezone.utc).isoformat()

    versions = []
    try:
        versions = list_versions(key)
        (OUT_DIR / "versions.json").write_text(
            json.dumps({"fetchedAt": fetched_at, "data": versions}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"versions={len(versions)} → {OUT_DIR / 'versions.json'}")
        for v in versions[:8]:
            print(" ", v.get("gameVersion"), v.get("status"), v.get("playerCount"))
    except Exception as e:
        print(f"versions list failed: {e}", file=sys.stderr)

    targets: list[str | None] = []
    if args.curr_only:
        targets = [None]
    elif args.editions.strip():
        targets = [x.strip().upper() for x in args.editions.split(",") if x.strip()]
    else:
        # Prefer archived + current from versions list
        if versions:
            for v in versions:
                gv = (v.get("gameVersion") or "").upper()
                if gv.startswith("2K"):
                    targets.append(gv)
        else:
            # sensible decade default if versions blocked
            targets = [f"2K{y}" for y in range(16, 28)]

    if not key:
        raise SystemExit(
            "NBA2K_API_KEY required for player bulk downloads.\n"
            "export NBA2K_API_KEY=your_key && python3 scripts/fetch_nba2kapi.py"
        )

    for ver in targets:
        label = ver or "LIVE"
        try:
            rows = fetch_bulk(ver, key, team_type=args.team_type)
        except Exception as e:
            print(f"SKIP {label}: {e}", file=sys.stderr)
            continue
        fname = f"{label}_{args.team_type}.json"
        out = {
            "source": "nba2kapi",
            "fetchedAt": fetched_at,
            "gameVersion": label,
            "teamType": args.team_type,
            "count": len(rows),
            "players": rows,
        }
        path = OUT_DIR / fname
        path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {path} players={len(rows)}")
        time.sleep(max(0.0, args.sleep))


if __name__ == "__main__":
    main()
