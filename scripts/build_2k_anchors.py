#!/usr/bin/env python3
"""
Build season-card 2K anchors from local raw dumps.

Sources (applied in order; later overwrites same bref:season — 最新为准):
  1. data/raw/2karchive_years.json          (historical board, attrs from ~2016)
  2. data/raw/2kratings/top100_*.json       (live top-100 OVR scrape)
  3. data/raw/nba2kapi/*_curr.json          (full attrs via nba2kapi / 2kratings)

Mapping: NBA 2K edition E → season-end years {E-1, E}

Writes: js/data/ratings2k.scraped.js
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_ARCHIVE = ROOT / "data" / "raw" / "2karchive_years.json"
RAW_2KRATINGS = ROOT / "data" / "raw" / "2kratings"
RAW_NBA2KAPI = ROOT / "data" / "raw" / "nba2kapi"
ROSTER = ROOT / "js" / "data" / "roster.json"
OUT = ROOT / "js" / "data" / "ratings2k.scraped.js"

MIN_EDITION = 2014
MAX_EDITION = 2030

ATTR_ORDER = (
    "scoring",
    "three",
    "mid",
    "paint",
    "defense",
    "rebound",
    "pass",
    "speed",
    "strength",
    "stamina",
    "iq",
    "clutch",
    "steal",
    "block",
)

TEAM_NAME_TO_ABBR = {
    "atlanta hawks": "ATL",
    "boston celtics": "BOS",
    "brooklyn nets": "BRK",
    "charlotte hornets": "CHO",
    "chicago bulls": "CHI",
    "cleveland cavaliers": "CLE",
    "dallas mavericks": "DAL",
    "denver nuggets": "DEN",
    "detroit pistons": "DET",
    "golden state warriors": "GSW",
    "houston rockets": "HOU",
    "indiana pacers": "IND",
    "la clippers": "LAC",
    "los angeles clippers": "LAC",
    "los angeles lakers": "LAL",
    "memphis grizzlies": "MEM",
    "miami heat": "MIA",
    "milwaukee bucks": "MIL",
    "minnesota timberwolves": "MIN",
    "new orleans pelicans": "NOP",
    "new york knicks": "NYK",
    "oklahoma city thunder": "OKC",
    "orlando magic": "ORL",
    "philadelphia 76ers": "PHI",
    "phoenix suns": "PHO",
    "portland trail blazers": "POR",
    "sacramento kings": "SAC",
    "san antonio spurs": "SAS",
    "toronto raptors": "TOR",
    "utah jazz": "UTA",
    "washington wizards": "WAS",
    "free agency": "FA",
}


def clamp(n, a, b):
    return max(a, min(b, int(round(n))))


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"\b([a-z])\.(?=[a-z]\b)", r"\1", s)
    s = s.replace(".", "")
    s = s.replace("'", "").replace("'", "").replace("'", "")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\b(jr|sr|iii|ii|iv)\b", "", s).strip()
    s = re.sub(r"\s+", " ", s).strip()
    aliases = {
        "enes kanter": "enes freedom",
        "enes kanter freedom": "enes freedom",
        "mohamed bamba": "mo bamba",
        "nahshon hyland": "bones hyland",
        "juan hernangomez": "juancho hernangomez",
        "juan toscano": "juan toscano anderson",
        "cameron thomas": "cam thomas",
        "cameron reddish": "cam reddish",
        "nicolas claxton": "nic claxton",
        "sviatoslav mykhailiuk": "svi mykhailiuk",
        "svyatoslav mykhailiuk": "svi mykhailiuk",
        "alexandre sarr": "alex sarr",
        "carlton carrington": "bub carrington",
        "robert dillingham": "rob dillingham",
        "wesley iwundu": "wes iwundu",
        "joseph young": "joe young",
    }
    return aliases.get(s, s)


def team_abbr(team: str | None) -> str:
    if not team:
        return ""
    t = str(team).strip()
    if len(t) <= 3 and t.isalpha():
        return t.upper()
    return TEAM_NAME_TO_ABBR.get(t.lower(), "")


def edition_from_label(label: str) -> int | None:
    """2K25 / 2025 / LIVE → int year."""
    if not label:
        return None
    s = str(label).upper().replace("NBA", "").strip()
    if s in ("LIVE", "CURRENT", "CURR"):
        return None
    m = re.search(r"2K\s*(\d{2})", s)
    if m:
        yy = int(m.group(1))
        return 2000 + yy if yy < 80 else 1900 + yy
    m = re.search(r"(20\d{2})", s)
    if m:
        return int(m.group(1))
    return None


def map_archive_attrs(row: dict) -> dict:
    out = {}
    o = row.get("o")
    if o is not None:
        out["ovr"] = clamp(o, 40, 99)
    three = row.get("3")
    mid = row.get("m")
    lay = row.get("l")
    dunk = row.get("d")
    spd = row.get("s")
    bh = row.get("bh")
    pd = row.get("pd")
    idi = row.get("id")

    if three is not None:
        out["three"] = clamp(three, 18, 99)
    if mid is not None:
        out["mid"] = clamp(mid, 28, 99)
    if lay is not None:
        paint = lay if dunk is None else round(lay * 0.75 + dunk * 0.25)
        out["paint"] = clamp(paint, 28, 99)
    elif dunk is not None:
        out["paint"] = clamp(dunk, 28, 99)

    defs = [x for x in (pd, idi) if x is not None]
    if defs:
        out["defense"] = clamp(sum(defs) / len(defs), 25, 99)
    if spd is not None:
        out["speed"] = clamp(spd, 30, 99)
    if mid is not None or three is not None or lay is not None:
        m = mid if mid is not None else 70
        t = three if three is not None else 60
        l = lay if lay is not None else 70
        out["scoring"] = clamp(0.42 * m + 0.28 * t + 0.30 * l, 25, 99)
    if bh is not None and bh >= 85:
        out["pass"] = clamp(40 + bh * 0.45, 40, 96)
    if idi is not None and idi >= 70:
        out["block"] = clamp(idi * 0.85, 20, 96)
    if pd is not None and pd >= 75:
        out["steal"] = clamp(pd * 0.78, 20, 96)
    return out


def _num(attrs: dict, *keys):
    for k in keys:
        if k in attrs and attrs[k] is not None:
            try:
                return float(attrs[k])
            except (TypeError, ValueError):
                pass
    return None


def map_nba2kapi_player(p: dict) -> dict:
    """Map nba2kapi / 2kratings full attribute blob → our ATTR_KEYS."""
    a = p.get("attributes") or {}
    out = {}
    ovr = p.get("overall")
    if ovr is not None:
        out["ovr"] = clamp(ovr, 40, 99)

    three = _num(a, "threePointShot", "three_point_shot", "threeBall")
    mid = _num(a, "midRangeShot", "mid_range_shot", "midRange")
    close = _num(a, "closeShot", "close_shot")
    lay = _num(a, "drivingLayup", "driving_layup")
    dunk = _num(a, "drivingDunk", "driving_dunk", "standingDunk")
    pd = _num(a, "perimeterDefense", "perimeter_defense")
    idi = _num(a, "interiorDefense", "interior_defense")
    pas = _num(a, "passAccuracy", "pass_accuracy")
    bh = _num(a, "ballHandle", "ball_handle")
    spd = _num(a, "speed")
    st = _num(a, "strength")
    sta = _num(a, "stamina")
    iq = _num(a, "shotIQ", "shot_iq", "passIQ", "basketballIQ")
    steal = _num(a, "steal")
    block = _num(a, "block")
    reb = _num(a, "offensiveRebound", "defensiveRebound", "offensive_rebound", "defensive_rebound")
    # average oreb+dreb if both
    oreb = _num(a, "offensiveRebound", "offensive_rebound")
    dreb = _num(a, "defensiveRebound", "defensive_rebound")
    if oreb is not None and dreb is not None:
        reb = (oreb + dreb) / 2

    if three is not None:
        out["three"] = clamp(three, 18, 99)
    if mid is not None:
        out["mid"] = clamp(mid, 28, 99)
    paint_parts = [x for x in (close, lay) if x is not None]
    if paint_parts:
        paint = sum(paint_parts) / len(paint_parts)
        if dunk is not None:
            paint = paint * 0.85 + dunk * 0.15
        out["paint"] = clamp(paint, 28, 99)
    defs = [x for x in (pd, idi) if x is not None]
    if defs:
        out["defense"] = clamp(sum(defs) / len(defs), 25, 99)
    if pas is not None:
        out["pass"] = clamp(pas, 20, 98)
    elif bh is not None and bh >= 85:
        out["pass"] = clamp(40 + bh * 0.45, 40, 96)
    if spd is not None:
        out["speed"] = clamp(spd, 30, 99)
    if st is not None:
        out["strength"] = clamp(st, 30, 100)
    if sta is not None:
        out["stamina"] = clamp(sta, 35, 98)
    if iq is not None:
        out["iq"] = clamp(iq, 35, 98)
    if steal is not None:
        out["steal"] = clamp(steal, 15, 97)
    if block is not None:
        out["block"] = clamp(block, 10, 98)
    if reb is not None:
        out["rebound"] = clamp(reb, 12, 100)

    if mid is not None or three is not None or close is not None:
        m = mid if mid is not None else 70
        t = three if three is not None else 60
        l = close if close is not None else (lay if lay is not None else 70)
        out["scoring"] = clamp(0.42 * m + 0.28 * t + 0.30 * l, 25, 99)
    return out


def build_name_index(roster: dict):
    by = defaultdict(list)
    entry_map = {}
    for row in roster.get("players", []):
        bref = row.get("bref")
        name = row.get("name") or ""
        if not bref or not name:
            continue
        nn = norm_name(name)
        key = (bref, nn)
        if key not in entry_map:
            entry = {"bref": bref, "name": name, "seasons": set(), "teams": set()}
            entry_map[key] = entry
            by[nn].append(entry)
        entry = entry_map[key]
        if row.get("season") is not None:
            entry["seasons"].add(int(row["season"]))
        if row.get("team"):
            entry["teams"].add(str(row["team"]).upper())
    return by


def pick_bref(candidates, season: int, team: str | None):
    if not candidates:
        return None
    team = (team or "").upper()
    scored = []
    for c in candidates:
        score = 0
        if season in c["seasons"]:
            score += 10
        if team and team in c["teams"]:
            score += 5
        if any(s >= season - 2 for s in c["seasons"]):
            score += 1
        scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    best = scored[0]
    if best[0] <= 0 and len(candidates) > 1:
        return None
    return best[1]["bref"]


def apply_rows(
    anchors: dict,
    unmatched: dict,
    index: dict,
    rows: list,
    edition: int,
    source: str,
    map_fn,
    name_key: str,
    team_key: str,
):
    matched = 0
    for row in rows:
        name = row.get(name_key) or row.get("n") or row.get("name") or ""
        if not name:
            continue
        nn = norm_name(name)
        cands = index.get(nn) or []
        team_raw = row.get(team_key) or row.get("t") or row.get("team") or ""
        team = team_abbr(team_raw) or (team_raw.upper() if isinstance(team_raw, str) and len(team_raw) <= 3 else "")
        attrs = map_fn(row)
        if "ovr" not in attrs:
            continue
        for season in (edition - 1, edition):
            if season < 1950:
                continue
            bref = pick_bref(cands, season, team)
            if not bref:
                unmatched[name] += 1
                continue
            key = f"{bref}:{season}"
            # merge attrs: newer source overwrites keys; keep prior keys not in new
            prev = anchors.get(key) or {}
            merged = {k: v for k, v in prev.items() if not k.startswith("_")}
            merged.update(attrs)
            merged["_edition"] = edition
            merged["_source"] = source
            merged["_name"] = name
            anchors[key] = merged
            matched += 1
    return matched


def load_archive_layers(index, anchors, unmatched, sources_note: list):
    if not RAW_ARCHIVE.exists():
        print(f"skip archive (missing {RAW_ARCHIVE})")
        return 0
    payload = json.loads(RAW_ARCHIVE.read_text(encoding="utf-8"))
    years = payload.get("years") or {}
    sources_note.append(f"2karchive@{payload.get('fetchedAt', '?')}")
    total = 0
    editions = sorted(
        int(y) for y in years if str(y).isdigit() and MIN_EDITION <= int(y) <= MAX_EDITION
    )
    for edition in editions:
        total += apply_rows(
            anchors,
            unmatched,
            index,
            years[str(edition)],
            edition,
            "2karchive",
            map_archive_attrs,
            "n",
            "t",
        )
    print(f"archive editions={editions[0]}..{editions[-1]} write_ops={total}")
    return total


def load_2kratings_top(index, anchors, unmatched, sources_note: list):
    if not RAW_2KRATINGS.exists():
        return 0
    total = 0
    for path in sorted(RAW_2KRATINGS.glob("top100_*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        edition = edition_from_label(payload.get("gameVersion") or path.stem)
        if edition is None:
            print(f"skip {path.name}: cannot parse edition")
            continue
        sources_note.append(f"2kratings_top@{edition}")
        n = apply_rows(
            anchors,
            unmatched,
            index,
            payload.get("players") or [],
            edition,
            "2kratings_top",
            map_archive_attrs,  # same short keys n/o/3/d
            "n",
            "t",
        )
        print(f"2kratings {path.name} edition={edition} write_ops={n}")
        total += n
    return total


def load_nba2kapi(index, anchors, unmatched, sources_note: list):
    if not RAW_NBA2KAPI.exists():
        return 0
    total = 0
    files = sorted(RAW_NBA2KAPI.glob("*_curr.json"))
    # sort by edition number so later overwrites
    def ed_key(p: Path):
        e = edition_from_label(p.name.split("_")[0])
        return e or 0

    for path in sorted(files, key=ed_key):
        payload = json.loads(path.read_text(encoding="utf-8"))
        edition = edition_from_label(payload.get("gameVersion") or path.name)
        if edition is None:
            # LIVE → treat as max known + tip from players
            edition = MAX_EDITION
        sources_note.append(f"nba2kapi@{payload.get('gameVersion')}")
        players = payload.get("players") or []
        # normalize name/team onto each row for apply_rows
        rows = []
        for p in players:
            if (p.get("teamType") or "curr") not in ("curr", None, ""):
                continue
            rows.append(p)
        n = apply_rows(
            anchors,
            unmatched,
            index,
            rows,
            edition,
            "nba2kapi",
            map_nba2kapi_player,
            "name",
            "team",
        )
        print(f"nba2kapi {path.name} edition={edition} players={len(rows)} write_ops={n}")
        total += n
    return total


def emit_js(anchors: dict, sources_note: list) -> None:
    lines = [
        "/**",
        " * AUTO-GENERATED by scripts/build_2k_anchors.py — do not edit by hand.",
        f" * Sources: {', '.join(sources_note) or 'none'}",
        " * Conflict policy: later source/edition overwrites earlier for same bref:season.",
        " */",
        "",
        "export const SCRAPED_ANCHORS_2K = {",
    ]
    for key in sorted(anchors.keys(), key=lambda k: (k.split(":")[0], int(k.split(":")[1]))):
        a = anchors[key]
        body = {k: v for k, v in a.items() if not k.startswith("_")}
        ordered = {}
        if "ovr" in body:
            ordered["ovr"] = body.pop("ovr")
        for k in ATTR_ORDER:
            if k in body:
                ordered[k] = body.pop(k)
        ordered.update(body)
        lines.append(f"  {json.dumps(key)}: {json.dumps(ordered, separators=(',', ':'))},")
    lines.append("};")
    lines.append("")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    index = build_name_index(roster)
    anchors: dict[str, dict] = {}
    unmatched: dict[str, int] = defaultdict(int)
    sources_note: list[str] = []

    load_archive_layers(index, anchors, unmatched, sources_note)
    load_2kratings_top(index, anchors, unmatched, sources_note)
    load_nba2kapi(index, anchors, unmatched, sources_note)

    if not anchors:
        raise SystemExit("No anchors built — run fetch_2k_archive.py and/or fetch_nba2kapi.py first")

    emit_js(anchors, sources_note)
    print(f"Wrote {OUT} anchors={len(anchors)}")
    top_unmatched = sorted(unmatched.items(), key=lambda x: -x[1])[:12]
    print(f"unmatched_hits={sum(unmatched.values())} unique={len(unmatched)}")
    print("top unmatched:", top_unmatched)
    for probe in ("curryst01:2025", "bookede01:2025", "jokicni01:2025", "doncilu01:2025"):
        a = anchors.get(probe)
        if a:
            print(probe, {k: a[k] for k in ("ovr", "three", "mid", "pass", "defense", "_source", "_edition") if k in a})


if __name__ == "__main__":
    main()
