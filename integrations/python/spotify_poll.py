"""
Spotify Recently Played → Supabase spotify_history (live polling)
-----------------------------------------------------------------
Runs every 30 min via GitHub Actions. Uses OAuth refresh token to get
recently played tracks (max 50) and upserts new ones.

Setup:
1. Create a Spotify app at developer.spotify.com (free)
2. Add redirect URI: http://localhost:8888/callback
3. Run `python spotify_poll.py --auth` once locally to get your refresh token
4. Add to GitHub repo secrets:
     SUPABASE_URL, SUPABASE_SERVICE_KEY, RICK_USER_ID
     SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN

pip install supabase python-dotenv requests
"""

import argparse
import json
import os
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
USER_ID = os.environ["RICK_USER_ID"]
CLIENT_ID = os.environ["SPOTIFY_CLIENT_ID"]
CLIENT_SECRET = os.environ["SPOTIFY_CLIENT_SECRET"]
REFRESH_TOKEN = os.environ.get("SPOTIFY_REFRESH_TOKEN", "")
REDIRECT_URI = "http://localhost:8888/callback"

_artist_genre_cache: dict[str, list[str]] = {}


def get_access_token() -> str:
    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": REFRESH_TOKEN,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_artist_genres(token: str, artist_id: str) -> list[str]:
    if artist_id in _artist_genre_cache:
        return _artist_genre_cache[artist_id]
    try:
        resp = requests.get(
            f"https://api.spotify.com/v1/artists/{artist_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        genres = resp.json().get("genres", [])
    except Exception:
        genres = []
    _artist_genre_cache[artist_id] = genres
    return genres


def fetch_recently_played(token: str) -> list[dict]:
    resp = requests.get(
        "https://api.spotify.com/v1/me/player/recently-played",
        headers={"Authorization": f"Bearer {token}"},
        params={"limit": 50},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("items", [])


def sync(token: str) -> int:
    items = fetch_recently_played(token)
    if not items:
        return 0

    rows = []
    for item in items:
        track = item.get("track", {})
        if not track:
            continue

        track_name = track.get("name", "")
        artists = track.get("artists", [])
        artist_name = artists[0].get("name", "") if artists else ""
        artist_id = artists[0].get("id", "") if artists else ""
        album = track.get("album", {}).get("name", "")
        duration_ms = track.get("duration_ms", 0)
        popularity = track.get("popularity", 50)
        explicit = track.get("explicit", False)
        played_at = item.get("played_at", "")

        genres = get_artist_genres(token, artist_id) if artist_id else []
        # dedup_key must match the unique constraint: unique(user_id, dedup_key)
        dedup_key = f"{played_at}|{track_name[:200]}"

        rows.append({
            "user_id": USER_ID,
            "played_at": played_at,
            "track_name": track_name[:300],
            "artist": artist_name[:200],
            "album": album[:200],
            "duration_ms": duration_ms,
            "ms_played": duration_ms,  # recently-played doesn't expose ms_played
            "genres": genres,
            "popularity": popularity,
            "explicit": explicit,
            "source": "spotify_api",
            "dedup_key": dedup_key,
        })

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    client.table("spotify_history").upsert(
        rows, on_conflict="user_id,dedup_key"
    ).execute()
    return len(rows)


def auth_flow():
    """One-time OAuth flow to get a refresh token. Run locally once."""
    scope = "user-read-recently-played"
    auth_url = "https://accounts.spotify.com/authorize?" + urlencode({
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": scope,
    })

    code_holder: list[str] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            qs = parse_qs(urlparse(self.path).query)
            if "code" in qs:
                code_holder.append(qs["code"][0])
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Auth complete. You can close this tab.")

        def log_message(self, *args):
            pass

    print(f"Opening browser for Spotify auth...\n{auth_url}")
    webbrowser.open(auth_url)

    server = HTTPServer(("localhost", 8888), Handler)
    server.handle_request()

    if not code_holder:
        raise SystemExit("No code received")

    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": code_holder[0],
            "redirect_uri": REDIRECT_URI,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        },
        timeout=10,
    )
    data = resp.json()
    print(f"\nSPOTIFY_REFRESH_TOKEN={data.get('refresh_token', '')}")
    print("Add this to your GitHub repo secrets as SPOTIFY_REFRESH_TOKEN")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--auth", action="store_true", help="Run one-time OAuth flow to get refresh token")
    args = parser.parse_args()

    if args.auth:
        auth_flow()
        return

    if not REFRESH_TOKEN:
        raise SystemExit("SPOTIFY_REFRESH_TOKEN not set. Run with --auth first.")

    token = get_access_token()
    count = sync(token)
    print(f"Synced {count} tracks")


if __name__ == "__main__":
    main()
