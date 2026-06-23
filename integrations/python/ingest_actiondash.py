"""
ActionDash CSV → Supabase screen_days
--------------------------------------
Export from ActionDash: Menu → Export → CSV
Then run: python ingest_actiondash.py path/to/actiondash_export.csv

ActionDash exports one row per app per day:
  Date,App Name,Category,Duration (ms)
  2026-06-01,Instagram,Social,3240000
  2026-06-01,YouTube,Entertainment,5400000
  ...

This script rolls up per day, maps categories, and upserts to screen_days.
"""

import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, date

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
USER_ID = os.environ["RICK_USER_ID"]

# Map ActionDash category names → our categories
CATEGORY_MAP = {
    # Social
    "social": "social",
    "communication": "comms",
    "messaging": "comms",
    # Work / productivity
    "productivity": "work",
    "business": "work",
    "tools": "work",
    "utilities": "work",
    # Media / entertainment
    "entertainment": "media",
    "video": "media",
    "music": "media",
    "news": "media",
    "books": "media",
    # Health
    "health": "health",
    "fitness": "health",
    "sport": "health",
    # Games
    "game": "media",
    "games": "media",
}

# Known apps → override category
APP_OVERRIDES = {
    "gmail": "work", "google mail": "work",
    "notion": "work", "slack": "work", "teams": "work",
    "chrome": "work", "firefox": "work", "safari": "work",
    "instagram": "social", "whatsapp": "comms",
    "tiktok": "social", "twitter": "social", "x": "social",
    "youtube": "media", "netflix": "media", "spotify": "media",
    "samsung health": "health", "google fit": "health",
}


def map_category(app_name: str, raw_category: str) -> str:
    app_lower = app_name.lower()
    for key, cat in APP_OVERRIDES.items():
        if key in app_lower:
            return cat
    return CATEGORY_MAP.get(raw_category.lower().strip(), "work")


def parse_duration(value: str) -> int:
    """
    Handles multiple ActionDash formats:
      - milliseconds: "3240000"
      - "1h 30m", "45m", "2h"
      - "01:30:00"
    Returns minutes.
    """
    value = value.strip()
    if not value:
        return 0
    # HH:MM:SS
    if value.count(":") == 2:
        h, m, s = value.split(":")
        return int(h) * 60 + int(m) + round(int(s) / 60)
    # "1h 30m" / "45m" / "2h"
    if "h" in value or "m" in value:
        minutes = 0
        h_match = __import__("re").search(r"(\d+)\s*h", value)
        m_match = __import__("re").search(r"(\d+)\s*m", value)
        if h_match:
            minutes += int(h_match.group(1)) * 60
        if m_match:
            minutes += int(m_match.group(1))
        return minutes
    # Raw milliseconds
    try:
        ms = int(float(value))
        return round(ms / 60000)
    except ValueError:
        return 0


def ingest(csv_path: str):
    # day → {total_min, pickups, apps: {app: {minutes, category}}}
    days: dict[str, dict] = defaultdict(lambda: {
        "total_min": 0,
        "pickups": 0,
        "apps": defaultdict(lambda: {"minutes": 0, "category": "work"}),
    })

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = [h.lower().strip() for h in (reader.fieldnames or [])]
        print(f"Detected columns: {headers}")

        # Flexible column name mapping
        def col(row, *candidates):
            for c in candidates:
                for k in row:
                    if k.lower().strip() == c:
                        return row[k]
            return ""

        for row in reader:
            date_str = col(row, "date", "day")
            app_name = col(row, "app name", "app", "application")
            raw_category = col(row, "category", "type", "")
            duration_raw = col(row, "duration (ms)", "duration", "time", "total time (ms)", "total time")
            pickups_raw = col(row, "pickups", "launches", "opens")

            if not date_str or not app_name:
                continue

            # Normalize date to YYYY-MM-DD
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
                try:
                    date_str = datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
                    break
                except ValueError:
                    pass

            minutes = parse_duration(duration_raw)
            if minutes == 0:
                continue

            category = map_category(app_name, raw_category)
            day = days[date_str]
            day["total_min"] += minutes
            day["apps"][app_name]["minutes"] += minutes
            day["apps"][app_name]["category"] = category

            if pickups_raw:
                try:
                    day["pickups"] += int(pickups_raw)
                except ValueError:
                    pass

    rows = []
    for date_str, d in days.items():
        app_breakdown = [
            {"app": name, "minutes": info["minutes"], "category": info["category"]}
            for name, info in sorted(d["apps"].items(), key=lambda x: -x[1]["minutes"])
        ]
        rows.append({
            "user_id": USER_ID,
            "date": date_str,
            "total_min": d["total_min"],
            "app_breakdown": app_breakdown,
            "pickups": d["pickups"],
            "notifications_received": 0,
            "source": "actiondash",
        })

    print(f"Parsed {len(rows)} days from {csv_path}")
    if not rows:
        print("No rows found — check that the CSV has Date, App Name, Duration columns")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    BATCH = 50
    inserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        res = supabase.table("screen_days").upsert(batch, on_conflict="user_id,date").execute()
        inserted += len(batch)
        print(f"  Upserted {inserted}/{len(rows)}")

    print(f"Done — {len(rows)} days in screen_days")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ingest_actiondash.py path/to/actiondash_export.csv")
        sys.exit(1)
    ingest(sys.argv[1])
