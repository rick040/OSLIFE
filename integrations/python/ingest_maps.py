"""
Google Maps Timeline → Supabase location_days
----------------------------------------------
1. Go to takeout.google.com
2. Select "Location History (Timeline)" → export as JSON
3. Find files at: Takeout/Location History (Timeline)/Semantic Location History/YYYY/YYYY_MONTH.json
4. Run: python ingest_maps.py --dir /path/to/Takeout/Location\ History\ \(Timeline\)/Semantic\ Location\ History

pip install supabase python-dotenv
"""

import argparse
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
USER_ID = os.environ["RICK_USER_ID"]

HOME_KEYWORDS = ["home", "thuis", "huis", "woning"]


def parse_ms(ms_str: str) -> float:
    return int(ms_str.rstrip("ms")) / 1000


def extract_date(duration: dict) -> str:
    start_ms = parse_ms(duration.get("startTimestampMs", "0ms"))
    return datetime.fromtimestamp(start_ms, tz=timezone.utc).strftime("%Y-%m-%d")


def load_semantic_file(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("timelineObjects", [])


def process_files(directory: Path) -> dict[str, dict]:
    by_date: dict[str, dict] = defaultdict(lambda: {
        "places_visited": [],
        "distance_km": 0.0,
        "time_home_min": 0,
        "time_out_min": 0,
    })

    for filepath in sorted(directory.rglob("*.json")):
        for obj in load_semantic_file(filepath):
            # Place visits
            if "placeVisit" in obj:
                pv = obj["placeVisit"]
                loc = pv.get("location", {})
                name = loc.get("name", "Unknown")
                lat = loc.get("latitudeE7", 0) / 1e7
                lng = loc.get("longitudeE7", 0) / 1e7
                duration = pv.get("duration", {})
                date = extract_date(duration)
                start_ms = parse_ms(duration.get("startTimestampMs", "0ms"))
                end_ms = parse_ms(duration.get("endTimestampMs", "0ms"))
                duration_min = max(0, int((end_ms - start_ms) / 60))

                is_home = any(kw in name.lower() for kw in HOME_KEYWORDS)
                if is_home:
                    by_date[date]["time_home_min"] += duration_min
                else:
                    by_date[date]["time_out_min"] += duration_min
                    by_date[date]["places_visited"].append({
                        "name": name,
                        "lat": round(lat, 5),
                        "lng": round(lng, 5),
                        "duration_min": duration_min,
                        "address": loc.get("address", ""),
                    })

            # Activity segments (for distance)
            elif "activitySegment" in obj:
                seg = obj["activitySegment"]
                dist = seg.get("distance", 0)
                duration = seg.get("duration", {})
                date = extract_date(duration)
                by_date[date]["distance_km"] += round(dist / 1000, 2)

    return by_date


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True, help="Path to Semantic Location History directory")
    args = parser.parse_args()

    directory = Path(args.dir)
    if not directory.exists():
        raise SystemExit(f"Directory not found: {directory}")

    print(f"Scanning {directory} ...")
    by_date = process_files(directory)
    print(f"Found data for {len(by_date)} days")

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    rows = [
        {
            "user_id": USER_ID,
            "date": date,
            "places_visited": data["places_visited"],
            "distance_km": round(data["distance_km"], 2),
            "time_home_min": data["time_home_min"],
            "time_out_min": data["time_out_min"],
            "source": "google_maps",
        }
        for date, data in sorted(by_date.items())
    ]

    batch_size = 100
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        client.table("location_days").upsert(batch, on_conflict="user_id,date").execute()
        print(f"  Upserted {i + len(batch)}/{len(rows)} days")

    print("Done.")


if __name__ == "__main__":
    main()
