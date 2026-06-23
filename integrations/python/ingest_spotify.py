"""
Spotify Streaming History (data export) → Supabase spotify_history
-------------------------------------------------------------------
1. spotify.com → Account → Privacy → "Request your data"
2. Wait for email (up to 30 days), download zip
3. Find: MyData/StreamingHistory_music_0.json (and _1.json, _2.json if multiple)
4. Run: python ingest_spotify.py --files MyData/StreamingHistory_music_*.json

pip install supabase python-dotenv requests
"""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
USER_ID = os.environ["RICK_USER_ID"]
SPOTIFY_CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.environ.get("SPOTIFY_CLIENT_SECRET", "")

# Cache artist genres to avoid redundant API calls
_artist_genre_cache: dict[str, list[str]] = {}


def get_spotify_token() -> str:
    if not SPOTIFY_CLIENT_ID:
        return ""
    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET),
        timeout=10,
    )
    return resp.json().get("access_token", "")


def search_artist_genres(token: str, artist_name: str) -> list[str]:
    if not token or artist_name in _artist_genre_cache:
        return _artist_genre_cache.get(artist_name, [])
    try:
        resp = requests.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": artist_name, "type": "artist", "limit": 1},
            timeout=10,
        )
        items = resp.json().get("artists", {}).get("items", [])
        genres = items[0].get("genres", []) if items else []
    except Exception:
        genres = []
    _artist_genre_cache[artist_name] = genres
    return genres


def parse_streaming_history(files: list[Path], token: str) -> list[dict]:
    rows = []
    seen: set[tuple] = set()

    for path in files:
        with open(path, encoding="utf-8") as f:
            items = json.load(f)

        for item in items:
            # New format (extended history): ts, master_metadata_track_name, etc.
            # Old format: endTime, trackName, artistName, msPlayed
            track = item.get("master_metadata_track_name") or item.get("trackName", "")
            artist = item.get("master_metadata_album_artist_name") or item.get("artistName", "")
            album = item.get("master_metadata_album_album_name", "")
            ms_played = item.get("ms_played") or item.get("msPlayed", 0)
            ts = item.get("ts") or item.get("endTime", "")

            if not track or not ts or ms_played < 30000:  # skip <30s skips
                continue

            # Normalize timestamp
            if "T" not in ts:
                ts = ts.replace(" ", "T") + ":00"
            if not ts.endswith("Z") and "+" not in ts:
                ts += "Z"

            key = (ts, track)
            if key in seen:
                continue
            seen.add(key)

            genres = search_artist_genres(token, artist) if token else []
            rows.append({
                "user_id": USER_ID,
                "played_at": ts,
                "track_name": track[:300],
                "artist": artist[:200],
                "album": album[:200],
                "ms_played": ms_played,
                "genres": genres,
                "source": "spotify_export",
            })

    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--files", nargs="+", required=True, help="StreamingHistory_music_*.json files")
    parser.add_argument("--enrich", action="store_true", help="Fetch artist genres from Spotify API")
    args = parser.parse_args()

    files = [Path(f) for f in args.files]
    for f in files:
        if not f.exists():
            raise SystemExit(f"File not found: {f}")

    token = get_spotify_token() if args.enrich else ""
    if args.enrich and not token:
        print("Warning: no Spotify credentials — skipping genre enrichment")

    print(f"Parsing {len(files)} file(s) ...")
    rows = parse_streaming_history(files, token)
    print(f"Found {len(rows)} plays (>30s)")

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    batch_size = 200
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        client.table("spotify_history").upsert(
            batch, on_conflict="user_id,played_at,track_name"
        ).execute()
        print(f"  Upserted {i + len(batch)}/{len(rows)}")

    print("Done.")


if __name__ == "__main__":
    main()
