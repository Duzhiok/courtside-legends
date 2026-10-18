#!/usr/bin/env python3
"""Build js/data/historicalSeasons.js from roster.json — past ~50 seasons."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROSTER = ROOT / "js" / "data" / "roster.json"
OUT = ROOT / "js" / "data" / "historicalSeasons.js"

# Display name + conference for BRef team codes (historical + modern)
TEAM_META = {
    "ATL": ("老鹰", "East"),
    "BOS": ("凯尔特人", "East"),
    "BKN": ("篮网", "East"),
    "BRK": ("篮网", "East"),
    "NJN": ("篮网", "East"),
    "NYA": ("篮网", "East"),
    "NYN": ("篮网", "East"),
    "BUF": ("勇士/水牛城", "East"),  # Braves → later Clippers; treat East era
    "CHA": ("黄蜂", "East"),
    "CHH": ("黄蜂", "East"),
    "CHO": ("黄蜂", "East"),
    "CHR": ("山猫", "East"),
    "CHI": ("公牛", "East"),
    "CLE": ("骑士", "East"),
    "DAL": ("独行侠", "West"),
    "DEN": ("掘金", "West"),
    "DET": ("活塞", "East"),
    "GSW": ("勇士", "West"),
    "HOU": ("火箭", "West"),
    "IND": ("步行者", "East"),
    "KCK": ("国王", "West"),
    "LAC": ("快船", "West"),
    "SDC": ("快船", "West"),
    "LAL": ("湖人", "West"),
    "MEM": ("灰熊", "West"),
    "VAN": ("灰熊", "West"),
    "MIA": ("热火", "East"),
    "MIL": ("雄鹿", "East"),
    "MIN": ("森林狼", "West"),
    "NOH": ("黄蜂/鹈鹕", "West"),
    "NOK": ("黄蜂", "West"),
    "NOP": ("鹈鹕", "West"),
    "NOJ": ("爵士", "West"),
    "NYK": ("尼克斯", "East"),
    "OKC": ("雷霆", "West"),
    "ORL": ("魔术", "East"),
    "PHI": ("76人", "East"),
    "PHO": ("太阳", "West"),
    "PHX": ("太阳", "West"),
    "POR": ("开拓者", "West"),
    "SAC": ("国王", "West"),
    "SAS": ("马刺", "West"),
    "SEA": ("超音速", "West"),
    "TOR": ("猛龙", "East"),
    "UTA": ("爵士", "West"),
    "WAS": ("奇才", "East"),
    "WSB": ("子弹士", "East"),
}

# NBA Finals champions by season ending year (1976–2025)
CHAMPIONS = {
    1976: ("BOS", "凯尔特人", "波士顿三巨头尾声"),
    1977: ("POR", "开拓者", "沃顿领军夺冠"),
    1978: ("WSB", "子弹士", "华盛顿唯一冠军"),
    1979: ("SEA", "超音速", "西雅图夺冠"),
    1980: ("LAL", "湖人", "魔术师新秀冠军"),
    1981: ("BOS", "凯尔特人", "伯德首冠"),
    1982: ("LAL", "湖人", "Showtime"),
    1983: ("PHI", "76人", "摩西+博士"),
    1984: ("BOS", "凯尔特人", "伯德 vs 魔术师"),
    1985: ("LAL", "湖人", "湖人复仇"),
    1986: ("BOS", "凯尔特人", "伯德巅峰"),
    1987: ("LAL", "湖人", "魔术师巅峰"),
    1988: ("LAL", "湖人", "湖人卫冕"),
    1989: ("DET", "活塞", "坏孩子王朝开启"),
    1990: ("DET", "活塞", "坏孩子卫冕"),
    1991: ("CHI", "公牛", "乔丹首冠"),
    1992: ("CHI", "公牛", "乔丹卫冕"),
    1993: ("CHI", "公牛", "三连冠"),
    1994: ("HOU", "火箭", "奥拉朱旺冠军"),
    1995: ("HOU", "火箭", "火箭卫冕"),
    1996: ("CHI", "公牛", "72胜王朝回归"),
    1997: ("CHI", "公牛", "乔丹五冠"),
    1998: ("CHI", "公牛", "最后一舞"),
    1999: ("SAS", "马刺", "邓肯新秀冠军"),
    2000: ("LAL", "湖人", "OK 组合首冠"),
    2001: ("LAL", "湖人", "湖人卫冕"),
    2002: ("LAL", "湖人", "三连冠"),
    2003: ("SAS", "马刺", "邓肯 FMVP"),
    2004: ("DET", "活塞", "五虎防守冠军"),
    2005: ("SAS", "马刺", "马刺再冠"),
    2006: ("MIA", "热火", "韦德 FMVP"),
    2007: ("SAS", "马刺", "马刺横扫"),
    2008: ("BOS", "凯尔特人", "绿军三巨头"),
    2009: ("LAL", "湖人", "科比首冠"),
    2010: ("LAL", "湖人", "科比七局大战"),
    2011: ("DAL", "独行侠", "德克冠军"),
    2012: ("MIA", "热火", "热火三巨头"),
    2013: ("MIA", "热火", "热火卫冕"),
    2014: ("SAS", "马刺", "五星级传控"),
    2015: ("GSW", "勇士", "库里崛起"),
    2016: ("CLE", "骑士", "詹姆斯 3-1 逆转"),
    2017: ("GSW", "勇士", "KD 加盟夺冠"),
    2018: ("GSW", "勇士", "勇士卫冕"),
    2019: ("TOR", "猛龙", "猛龙首冠"),
    2020: ("LAL", "湖人", "詹眉泡泡园"),
    2021: ("MIL", "雄鹿", "字母哥冠军"),
    2022: ("GSW", "勇士", "勇士再起"),
    2023: ("DEN", "掘金", "约基奇冠军"),
    2024: ("BOS", "凯尔特人", "绿军再冠"),
    2025: ("OKC", "雷霆", "雷霆新王朝"),
}

SKIP_TEAMS = {"NBA", "TOT", "3TM", "2TM", "1TM"}


def main():
    raw = json.loads(ROSTER.read_text())
    players = raw["players"]
    by_year_team: dict[int, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for p in players:
        y = int(p["season"])
        t = p.get("team") or ""
        if t in SKIP_TEAMS:
            continue
        by_year_team[y][t].append(p)

    years = [y for y in range(1976, 2026) if y in by_year_team]
    seasons = {}
    for y in years:
        teams = []
        for code, plist in sorted(by_year_team[y].items()):
            if code in SKIP_TEAMS:
                continue
            if len(plist) < 5:
                continue
            name, conf = TEAM_META.get(code, (code, "West"))
            # top names for UI preview
            top = sorted(plist, key=lambda p: (-(p.get("ppg") or 0), -(p.get("mpg") or 0)))[:5]
            stars = [f"{p['name']}({p.get('ppg', 0)})" for p in top[:3]]
            teams.append(
                {
                    "id": code,
                    "bref": code,
                    "name": name,
                    "conf": conf,
                    "n": len(plist),
                    "stars": stars,
                }
            )
        champ = CHAMPIONS.get(y)
        seasons[str(y)] = {
            "year": y,
            "label": f"{y - 1}-{str(y)[2:]}",
            "teamCount": len(teams),
            "teams": teams,
            "championId": champ[0] if champ else None,
            "championName": champ[1] if champ else None,
            "blurb": champ[2] if champ else "",
        }

    seasons_json = json.dumps(seasons, ensure_ascii=False, indent=2)
    years_json = json.dumps(years)
    js = "\n".join(
        [
            "/**",
            " * Auto-generated by scripts/build_historical_seasons.py — do not edit by hand.",
            " * Past ~50 NBA seasons: active teams + Finals champion notes.",
            " * Rosters at runtime come from PLAYERS filtered by season+team.",
            " */",
            f"export const HISTORICAL_YEAR_START = {years[0]};",
            f"export const HISTORICAL_YEAR_END = {years[-1]};",
            f"export const HISTORICAL_YEARS = {years_json};",
            "",
            "/** @type {Record<string, object>} */",
            f"export const HISTORICAL_SEASONS = {seasons_json};",
            "",
            "export function historicalSeason(year) {",
            "  return HISTORICAL_SEASONS[String(year)] || null;",
            "}",
            "",
            "export function listHistoricalYears() {",
            "  return HISTORICAL_YEARS.slice();",
            "}",
            "",
        ]
    )
    OUT.write_text(js, encoding="utf-8")
    print(f"wrote {OUT} years={len(years)} ({years[0]}-{years[-1]})")


if __name__ == "__main__":
    main()
