#!/usr/bin/env python3
"""Build full NBA historical roster JSON (1950+) from TallData + Basketball-Reference."""
from __future__ import annotations

import csv
import json
import math
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "js" / "data" / "roster.json"
LEGACY_HINTS = ROOT / "js" / "data" / "name_zh.json"

UA = "CourtsideLegendsRosterBot/1.0 (educational; local game data build)"


def fnum(x, default=0.0):
    try:
        if x is None or x == "":
            return default
        return float(x)
    except Exception:
        return default


def clamp(n, a, b):
    return max(a, min(b, n))


def load_master():
    path = RAW / "basketball_master.csv"
    names = {}
    pos = {}
    with path.open(newline="", encoding="utf-8", errors="ignore") as f:
        r = csv.DictReader(f)
        for row in r:
            pid = row.get("bioID") or row.get("playerID")
            if not pid or pid == "bioID":
                continue
            first = (row.get("useFirst") or row.get("firstName") or "").strip()
            last = (row.get("lastName") or "").strip()
            name = f"{first} {last}".strip() or pid
            names[pid] = name
            if row.get("pos"):
                pos[pid] = row["pos"].split("-")[0].strip().upper()
    return names, pos


def normalize_pos(p):
    p = (p or "G").upper().strip()
    mapping = {
        "G": "SG",
        "GUARD": "SG",
        "F": "SF",
        "FORWARD": "SF",
        "C": "C",
        "CENTER": "C",
        "F-C": "PF",
        "C-F": "C",
        "G-F": "SG",
        "F-G": "SF",
        "PG": "PG",
        "SG": "SG",
        "SF": "SF",
        "PF": "PF",
    }
    if p in mapping:
        return mapping[p]
    if p.startswith("P"):
        return "PG"
    if "G" in p and "F" not in p:
        return "SG"
    if "C" in p:
        return "C"
    return "SF"


def talldata_rows():
    names, positions = load_master()
    path = RAW / "basketball_players.csv"
    # player-season -> best row (prefer multi-team aggregate feels missing; keep max minutes)
    best = {}
    with path.open(newline="", encoding="utf-8", errors="ignore") as f:
        r = csv.DictReader(f)
        for row in r:
            if row.get("lgID") != "NBA":
                continue
            year_start = int(fnum(row.get("year"), 0))
            if year_start < 1950 or year_start > 2011:
                continue
            pid = row["playerID"]
            gp = fnum(row.get("GP"))
            if gp < 5:
                continue
            minutes = fnum(row.get("minutes"))
            # some early seasons lack minutes — estimate
            if minutes <= 0:
                minutes = gp * 20
            pts = fnum(row.get("points"))
            reb = fnum(row.get("rebounds"))
            ast = fnum(row.get("assists"))
            stl = fnum(row.get("steals"))
            blk = fnum(row.get("blocks"))
            tov = fnum(row.get("turnovers"))
            fga = fnum(row.get("fgAttempted"))
            fgm = fnum(row.get("fgMade"))
            fta = fnum(row.get("ftAttempted"))
            ftm = fnum(row.get("ftMade"))
            tpa = fnum(row.get("threeAttempted"))
            tpm = fnum(row.get("threeMade"))
            team = row.get("tmID") or "NBA"
            season_end = year_start + 1
            key = (pid, season_end)
            mpg = minutes / gp
            rec = {
                "bref": pid,
                "name": names.get(pid, pid),
                "season": season_end,
                "team": team,
                "pos": normalize_pos(positions.get(pid) or "F"),
                "gp": int(gp),
                "mpg": round(mpg, 1),
                "ppg": round(pts / gp, 1),
                "rpg": round(reb / gp, 1),
                "apg": round(ast / gp, 1),
                "spg": round(stl / gp, 1) if stl else 0.0,
                "bpg": round(blk / gp, 1) if blk else 0.0,
                "tpg": round(tov / gp, 1) if tov else 0.0,
                "fg": round(fgm / fga, 3) if fga else 0.42,
                "tp": round(tpm / tpa, 3) if tpa else 0.0,
                "ft": round(ftm / fta, 3) if fta else 0.75,
                "fga": round(fga / gp, 1),
                "tpa": round(tpa / gp, 1) if tpa else 0.0,
                "src": "talldata",
            }
            prev = best.get(key)
            if not prev or minutes > prev.get("_min", 0):
                rec["_min"] = minutes
                best[key] = rec
    for rec in best.values():
        rec.pop("_min", None)
        yield rec


def parse_br_html(html: str, season_end: int):
    m = re.search(r'<table[^>]*id="per_game_stats"[\s\S]*?<tbody>([\s\S]*?)</tbody>', html)
    if not m:
        return []
    rows = re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", m.group(1))
    out = []
    seen = set()
    for row in rows:
        if 'data-stat="ranker"' not in row:
            continue
        # skip header repeats
        bref_m = re.search(r"/players/[a-z]/([a-z0-9]+)\.html", row)
        name_m = re.search(r"/players/[a-z]/[a-z0-9]+\.html\">([^<]+)</a>", row)
        if not bref_m or not name_m:
            continue
        bref = bref_m.group(1)
        name = name_m.group(1).strip()
        team_m = re.search(r'data-stat="team_name_abbr"[^>]*>\s*(?:<a[^>]*>)?([A-Z]{2,3})', row)
        team = team_m.group(1) if team_m else "NBA"
        if team == "TOT":
            # keep TOT as combined season; drop other team splits later via seen
            pass

        def stat(key, default=0.0):
            mm = re.search(rf'data-stat="{key}"[^>]*>([^<]*)', row)
            if not mm:
                return default
            return fnum(mm.group(1).strip().replace(",", ""), default)

        gp = stat("games")
        if gp < 5:
            continue
        key = (bref, season_end)
        # Prefer TOT over single-team if both appear
        if key in seen and team != "TOT":
            continue
        seen.add(key)
        pos_m = re.search(r'data-stat="pos"[^>]*>([^<]*)', row)
        pos = normalize_pos(pos_m.group(1) if pos_m else "F")
        out.append(
            {
                "bref": bref,
                "name": name,
                "season": season_end,
                "team": team,
                "pos": pos,
                "gp": int(gp),
                "mpg": round(stat("mp_per_g"), 1),
                "ppg": round(stat("pts_per_g"), 1),
                "rpg": round(stat("trb_per_g"), 1),
                "apg": round(stat("ast_per_g"), 1),
                "spg": round(stat("stl_per_g"), 1),
                "bpg": round(stat("blk_per_g"), 1),
                "tpg": round(stat("tov_per_g"), 1),
                "fg": round(stat("fg_pct"), 3),
                "tp": round(stat("fg3_pct"), 3),
                "ft": round(stat("ft_pct"), 3),
                "fga": round(stat("fga_per_g"), 1),
                "tpa": round(stat("fg3a_per_g"), 1),
                "src": "bref",
            }
        )
    # If both TOT and team rows, keep TOT only
    by_key = {}
    for rec in out:
        k = (rec["bref"], rec["season"])
        prev = by_key.get(k)
        if not prev:
            by_key[k] = rec
        elif rec["team"] == "TOT":
            by_key[k] = rec
        elif prev["team"] != "TOT" and rec["gp"] > prev["gp"]:
            by_key[k] = rec
    return list(by_key.values())


def fetch_br_season(season_end: int) -> list:
    cache = RAW / f"br_per_game_{season_end}.html"
    if cache.exists() and cache.stat().st_size > 50000:
        html = cache.read_text(encoding="utf-8", errors="ignore")
    else:
        url = f"https://www.basketball-reference.com/leagues/NBA_{season_end}_per_game.html"
        print(f"fetch {url}")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        cache.write_text(html, encoding="utf-8")
        time.sleep(2.5)
    return parse_br_html(html, season_end)


def load_zh_names():
    # optional map english->zh from existing handcrafted set if present
    path = LEGACY_HINTS
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    rows = []
    print("Loading TallData 1950-2011…")
    rows.extend(list(talldata_rows()))
    print(f"  talldata rows: {len(rows)}")

    print("Loading Basketball-Reference 2012-2025…")
    for season_end in range(2012, 2026):
        try:
            part = fetch_br_season(season_end)
            print(f"  {season_end}: {len(part)}")
            rows.extend(part)
        except Exception as e:
            print(f"  {season_end} FAILED: {e}")

    # Deduplicate by bref+season
    uniq = {}
    for r in rows:
        k = f"{r['bref']}-{r['season']}"
        uniq[k] = r
    rows = list(uniq.values())
    rows.sort(key=lambda x: (x["season"], -x["ppg"], x["name"]))

    # Attach stable id
    for r in rows:
        slug = re.sub(r"[^a-z0-9]+", "", r["name"].lower())[:16] or r["bref"]
        r["id"] = f"{r['bref']}-{r['season']}-{r['team']}".lower()
        r["slug"] = slug

    zh = load_zh_names()
    for r in rows:
        key = r["name"].lower()
        if key in zh:
            r["nameZh"] = zh[key]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "generated": time.strftime("%Y-%m-%d"),
        "count": len(rows),
        "note": "Full NBA player-seasons since 1950 (GP>=5). Attributes derived at runtime.",
        "players": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(rows)} seasons -> {OUT} ({OUT.stat().st_size/1e6:.2f} MB)")

    # uniqueness
    people = {r["bref"] for r in rows}
    print(f"Unique players: {len(people)}")


if __name__ == "__main__":
    main()
