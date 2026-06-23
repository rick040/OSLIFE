"""
YouTube Watch History (Google Takeout) → Supabase youtube_history
------------------------------------------------------------------
1. Go to takeout.google.com
2. Select "YouTube and YouTube Music" → History → export
3. Find: Takeout/YouTube and YouTube Music/history/watch-history.json
4. Run: python ingest_youtube.py --file /path/to/watch-history.json

pip install supabase python-dotenv
"""

import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
USER_ID = os.environ["RICK_USER_ID"]


def parse_history(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        items = json.load(f)

    rows = []
    for item in items:
        title = item.get("title", "")
        if title.startswith("Watched "):
            title = title[len("Watched "):]

        url = item.get("titleUrl", "")
        channel = ""
        subtitles = item.get("subtitles", [])
        if subtitles:
            channel = subtitles[0].get("name", "")

        time_str = item.get("time", "")
        if not time_str or not url:
            continue

        rows.append({
            "user_id": USER_ID,
            "watched_at": time_str,  # already ISO 8601
            "video_title": title[:500],
            "channel": channel[:200],
            "video_url": url[:500],
            "source": "takeout",
        })

    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Path to watch-history.json")
    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"File not found: {path}")

    print(f"Parsing {path} ...")
    rows = parse_history(path)
    print(f"Found {len(rows)} watch events")

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    batch_size = 200
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        client.table("youtube_history").upsert(
            batch, on_conflict="user_id,watched_at,video_url"
        ).execute()
        print(f"  Upserted {i + len(batch)}/{len(rows)}")

    print("Done.")


if __name__ == "__main__":
    main()
