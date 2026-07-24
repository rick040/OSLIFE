# Google Data Portability API — Onderzoeksrapport voor OS LIFE

*Datum: 23 juni 2026 | Onderzoek: deep-research met adversariële verificatie*

---

## Executive Summary

De Google Data Portability API is een **gratis** (geen kosten per API-call), programmatische manier om Google-gebruikersdata te exporteren — als alternatief voor handmatige Google Takeout. De API biedt **65 OAuth scopes** verspreid over 15+ diensten. Voor OS LIFE zijn er echter twee kritieke bevindingen:

**Wat WEL werkt:** Maps (saved places, reviews, commuteroutes), YouTube (abonnementen, playlists), Search-activiteit, Chrome-geschiedenis, Google Play (app-installs), Discover-feed.

**Wat NIET beschikbaar is:** Gmail, Google Calendar, Google Photos, Google Drive, Google Fit (echte health data). Dit zijn precies de meest waardevolle bronnen voor life-management — ze zijn bewust uitgelaten en moeten via andere API's worden benaderd.

---

## 1. Wat is de Google Data Portability API?

De API is gebaseerd op het recht op dataportabiliteit (GDPR Art. 20, EU Digital Markets Act). Het stelt gebruikers in staat hun Google-data over te dragen aan derde-partij apps, **namens de gebruiker zelf** — niet als developer die bulkdata ophaalt.

Het flow-model werkt als volgt:

1. Gebruiker geeft OAuth-toestemming voor specifieke scopes
2. App roept `InitiatePortabilityArchive` aan
3. Google bereidt een ZIP-archief voor (duurt minuten tot uren)
4. App pollt `CheckPortabilityJobState` totdat de job klaar is
5. App downloadt het archief (JSON + HTML bestanden)

De data wordt geëxporteerd als een ZIP-bestand met een structuur vergelijkbaar met een handmatige Google Takeout.

---

## 2. Beschikbare Data Types & OAuth Scopes

### Google Maps (10 scopes)

| Data | OAuth Scope | Bruikbaarheid OS LIFE |
|------|-------------|----------------------|
| Opgeslagen/favoriete plaatsen | `dataportability.maps.starred_places` | ⭐⭐⭐ Hoog — toont interesses, frequente locaties |
| Alias-plaatsen | `dataportability.maps.aliased_places` | ⭐⭐ Middel — bijnamen voor locaties |
| Reviews | `dataportability.maps.reviews` | ⭐⭐⭐ Hoog — lifestyle signalen (restaurants, hotels, winkels) |
| Fotos & video's | `dataportability.maps.photos_videos` | ⭐ Laag — metadata interessant |
| Woon-werkroutes | `dataportability.maps.commute_routes` | ⭐⭐⭐ Hoog — dagelijkse routines |
| Woon-werkinstellingen | `dataportability.maps.commute_settings` | ⭐⭐⭐ Hoog — werk-/woonlocatie |
| EV-profiel | `dataportability.maps.ev_profile` | ⭐ Laag — niche |

> ⚠️ **Belangrijk:** Maps Location History (GPS-tijdlijn) zit NIET als aparte scope. Activiteitsgeschiedenis is bereikbaar via `myactivity.maps`.

### My Activity (6 scopes) — Meest waardevol voor OS LIFE

| Data | OAuth Scope | Bruikbaarheid OS LIFE |
|------|-------------|----------------------|
| Zoekgeschiedenis | `dataportability.myactivity.search` | ⭐⭐⭐ Zeer hoog — interesses, intenties, vragen |
| Maps-activiteit | `dataportability.myactivity.maps` | ⭐⭐⭐ Hoog — bezochte locaties, routes |
| YouTube-activiteit (incl. bekeken video's) | `dataportability.myactivity.youtube` | ⭐⭐⭐ Hoog — consumptiepatronen |
| Shopping-activiteit | `dataportability.myactivity.shopping` | ⭐⭐ Middel — aankoopintentie |
| Play-activiteit | `dataportability.myactivity.play` | ⭐⭐ Middel — app-gebruik |
| Advertentie-activiteit | `dataportability.myactivity.myadcenter` | ⭐ Laag — minder relevant |

Het My Activity JSON-formaat bevat per item: `header`, `title`, `titleUrl`, `subtitles`, `description`, `time`, `products`, `details`, `activityControls`, `locationInfos`.

### YouTube (15 scopes)

| Data | OAuth Scope | Bruikbaarheid OS LIFE |
|------|-------------|----------------------|
| Abonnementen | `dataportability.youtube.subscriptions` | ⭐⭐⭐ Hoog — categoriseerbare interesses |
| Privé-playlists | `dataportability.youtube.private_playlists` | ⭐⭐⭐ Hoog — leerdoelen, entertainment |
| YouTube Music | `dataportability.youtube.music` | ⭐⭐ Middel — mood/sfeer signalen |
| Kanaaldata | `dataportability.youtube.channel` | ⭐ Laag — voor content creators |

### Google Chrome (7 scopes)

| Data | OAuth Scope | Bruikbaarheid OS LIFE |
|------|-------------|----------------------|
| Browsergeschiedenis | `dataportability.chrome.history` | ⭐⭐⭐ Zeer hoog — websitepatronen, tijdsbesteding |
| Bladwijzers | `dataportability.chrome.bookmarks` | ⭐⭐⭐ Hoog — opgeslagen interesses |
| Leeslijst | `dataportability.chrome.reading_list` | ⭐⭐ Middel — content-intentie |
| Autofill | `dataportability.chrome.autofill` | ⭐ Laag — privacy-gevoelig, minder waardevol |

### Google Play (10 scopes)

| Data | OAuth Scope | Bruikbaarheid OS LIFE |
|------|-------------|----------------------|
| App-installs | `dataportability.play.installs` | ⭐⭐⭐ Hoog — welke tools/apps gebruik je |
| Aankopen | `dataportability.play.purchases` | ⭐⭐ Middel — bestedingspatronen |
| Abonnementen | `dataportability.play.subscriptions` | ⭐⭐⭐ Hoog — terugkerende diensten |
| Apparaten | `dataportability.play.devices` | ⭐ Laag — device profiling |

### Overige beschikbare diensten

| Dienst | Beschikbare data | Bruikbaarheid |
|--------|-----------------|---------------|
| Google Discover | Gevolgde topics, likes, niet-geïnteresseerd | ⭐⭐⭐ Hoog — expliciete interesse-signalen |
| Google Shopping | Opgeslagen adressen, reviews | ⭐⭐ Middel |
| Saved Collections | Opgeslagen collecties | ⭐⭐ Middel |
| Fitbit | Hardware device events (batterij, laad-events) | ⭐ Laag — géén health data |
| Street View | Geüploade afbeeldingen | ⭐ Laag |

---

## 3. Wat is NIET beschikbaar — Kritieke Bevindingen

Dit zijn de meest waardevolle bronnen voor life-management die **bewust zijn uitgelaten**:

| Dienst | Status | Alternatief |
|--------|--------|-------------|
| **Gmail** | ❌ Niet beschikbaar | Gmail API (aparte OAuth) |
| **Google Calendar** | ❌ Niet beschikbaar | Google Calendar API |
| **Google Photos** | ❌ Niet beschikbaar | Google Photos API |
| **Google Drive** | ❌ Niet beschikbaar | Google Drive API |
| **Google Fit / health data** | ❌ Niet beschikbaar | Google Fit REST API |
| **Maps GPS-tijdlijn (raw)** | ⚠️ Beperkt | Alleen via `myactivity.maps` (geen raw GPS) |
| **Fitbit stappen/hartslag/slaap** | ❌ Niet beschikbaar | Fitbit API (Fitbit developer account) |

> **Conclusie:** Voor Calendar, Gmail en health data moet je de specifieke Google APIs direct aanspreken met aparte OAuth flows. De Data Portability API is dus aanvullend, niet vervangend.

---

## 4. Kosten, Quota & Rate Limits

### Is het gratis?

**Ja** — er zijn geen kosten per API-call of per data-export. Echter:
- Een **Google Cloud project met billing ingeschakeld** is vereist (standaard GCP-vereiste, geen kosten als je niets betaald verbruikt)
- **App-verificatie** is vereist voor productiegebruik (gratis proces bij Google)
- Voor **restricted scopes** (Search, Maps, Chrome-history, etc.) is een **CASA security assessment** vereist door een door Google aangewezen derde partij — dit heeft mogelijk kosten

### Twee export-modi

| Modus | Frequentie | Hoe werkt het |
|-------|-----------|---------------|
| **One-time access** | 1x per scope per consent-grant | Gebruiker geeft toestemming, je exporteert 1x. Daarna moet `ResetAuthorization()` worden aangeroepen voor een nieuwe export |
| **Time-based access** | Max 1x per scope per 24 uur | Gebruiker kiest 30 of 180 dagen. Na 24 uur kan een nieuwe export worden gestart met een refreshed access token |

### Rate limits

| Limiet | Waarde |
|--------|--------|
| Minimale tijd tussen exports (time-based) | 24 uur per scope |
| Maximum job-duur | 7 dagen |
| OAuth token geldigheid | 1 uur (standard Google OAuth) |
| Refresh token geldigheid (time-based) | 30 dagen (2.592.000 sec) of 180 dagen (15.552.000 sec) |
| Testing/sandbox token | 7 dagen |

Als je binnen 24 uur een tweede export probeert, krijg je HTTP 429 met `RESOURCE_EXHAUSTED_TIME_BASED` en een timestamp wanneer de volgende export mogelijk is.

### Scope-beperkingen

- Data Portability scopes **mogen niet worden gemengd** met andere Google API scopes in één OAuth-request
- Te veel scopes tegelijk = HTTP 400 (URL te lang) → opsplitsen in kleinere batches
- Incremental authorization is **niet toegestaan** voor Data Portability scopes

---

## 5. Praktische Implementatie

### OAuth 2.0 Flow

De API gebruikt standaard Google OAuth 2.0 met een specifieke eigenschap: je vraagt expliciet `dataportability`-scopes aan, apart van andere Google scopes.

```python
# Python — afhankelijkheden: google-auth, google-auth-oauthlib, requests
from google_auth_oauthlib.flow import Flow
import requests

# Stap 1: OAuth flow configureren
SCOPES = [
    "https://www.googleapis.com/auth/dataportability.myactivity.search",
    "https://www.googleapis.com/auth/dataportability.myactivity.maps",
    "https://www.googleapis.com/auth/dataportability.myactivity.youtube",
    "https://www.googleapis.com/auth/dataportability.maps.starred_places",
    "https://www.googleapis.com/auth/dataportability.chrome.history",
    "https://www.googleapis.com/auth/dataportability.youtube.subscriptions",
    "https://www.googleapis.com/auth/dataportability.discover.follows",
]

flow = Flow.from_client_secrets_file(
    "client_secrets.json",
    scopes=SCOPES,
    redirect_uri="http://localhost:8080/callback"
)

auth_url, state = flow.authorization_url(
    access_type="offline",          # Nodig voor refresh token
    include_granted_scopes="false", # VERPLICHT false voor Data Portability
    prompt="consent"
)
print(f"Open deze URL in je browser: {auth_url}")
```

### Export starten

```python
# Stap 2: Archief initiëren
BASE_URL = "https://dataportability.googleapis.com/v1"

def initiate_export(credentials, scopes):
    headers = {"Authorization": f"Bearer {credentials.token}"}
    
    payload = {
        "resources": [
            # Scope-naam zonder googleapis.com/auth/dataportability prefix
            {"scope": scope.split("dataportability.")[-1]}
            for scope in scopes
        ]
    }
    
    response = requests.post(
        f"{BASE_URL}/portabilityArchive:initiate",
        headers=headers,
        json=payload
    )
    return response.json()  # Geeft {"archiveJobId": "job_abc123"} terug

job = initiate_export(credentials, SCOPES)
job_id = job["archiveJobId"]
```

### Status pollen

```python
import time

def wait_for_export(credentials, job_id, poll_interval=60):
    """Pollt elke minuut totdat het archief klaar is."""
    headers = {"Authorization": f"Bearer {credentials.token}"}
    
    while True:
        response = requests.get(
            f"{BASE_URL}/portabilityArchive/{job_id}:checkJobState",
            headers=headers
        )
        data = response.json()
        
        state = data.get("state")
        print(f"Status: {state}")
        
        if state == "COMPLETE":
            return data["urls"]       # Lijst van download-URLs
        elif state == "FAILED":
            raise Exception(f"Export mislukt: {data}")
        
        time.sleep(poll_interval)     # Wacht voor next poll

download_urls = wait_for_export(credentials, job_id)
```

### Archief downloaden en verwerken

```python
import zipfile
import io
import json
from pathlib import Path

def download_and_extract(credentials, download_urls, output_dir="./google_data"):
    headers = {"Authorization": f"Bearer {credentials.token}"}
    Path(output_dir).mkdir(exist_ok=True)
    
    for url in download_urls:
        response = requests.get(url, headers=headers)
        
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            z.extractall(output_dir)
    
    print(f"Data opgeslagen in {output_dir}/")
    return output_dir

# Verwerken van Search activiteit
def parse_search_activity(data_dir):
    search_file = Path(data_dir) / "MyActivity" / "Search" / "MyActivity.json"
    
    if not search_file.exists():
        return []
    
    with open(search_file, encoding="utf-8") as f:
        activities = json.load(f)
    
    return [
        {
            "query": item.get("title", "").replace("Gezocht naar ", ""),
            "time": item.get("time"),
            "url": item.get("titleUrl", "")
        }
        for item in activities
        if "title" in item
    ]
```

### Time-based access (voor herhaaldelijke syncs)

```python
# Voor time-based access: gebruiker kiest 30 of 180 dagen
# De refresh token blijft geldig zolang de authorisatie loopt
# Je kunt max 1x per 24 uur een nieuwe export per scope starten

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

def refresh_and_export(token_file, scopes):
    """Laad opgeslagen credentials en start nieuwe export (max 1x/24u)."""
    with open(token_file) as f:
        token_data = json.load(f)
    
    creds = Credentials(
        token=token_data["token"],
        refresh_token=token_data["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=token_data["client_id"],
        client_secret=token_data["client_secret"]
    )
    
    if creds.expired:
        creds.refresh(Request())
    
    return initiate_export(creds, scopes)
```

---

## 6. Bruikbare Signalen voor OS LIFE

### Prioriteit 1 — Direct bruikbaar

**Zoekgeschiedenis (`myactivity.search`)**
- Detecteer terugkerende zoekthema's → actieve interesses en zorgen
- Tijdspatronen: wanneer zoekt iemand naar wat? (ochtend = news, avond = entertainment)
- Intentie-signalen: zoeken naar "symptomen", "hoe te" vs. "kopen", "vergelijken"
- Trendanalyse: welke onderwerpen zijn nieuw vs. terugkerend

**Maps activiteit & opgeslagen plaatsen (`myactivity.maps`, `maps.starred_places`)**
- Detecteer thuisbasis, werklocatie, sportlocatie via frequentie
- Lifestyle categorieën: restaurants (cuisine-type), winkels, sportfaciliteiten
- Woon-werkpatroon via `maps.commute_routes` en `maps.commute_settings`
- Reisgedrag: nieuwe steden, vakanties, dagtrips

**YouTube abonnementen & activiteit (`youtube.subscriptions`, `myactivity.youtube`)**
- Categoriseer kanalen: educatie, entertainment, sport, nieuws, finance
- Detecteer leerdoelen via educatieve kanalen
- Consumptietijden: wanneer kijkt iemand YouTube?

**Chrome-geschiedenis (`chrome.history`)**
- Meest bezochte websites → dagelijkse tools en interesses
- Tijdsbesteding per categorie (nieuws, social media, productiviteit)
- Nieuwe vs. terugkerende sites

**Google Discover follows (`discover.follows`)**
- Expliciet gevolgde topics → directe interesses zonder analyse
- Vergelijk met zoekgedrag voor consistentie

### Prioriteit 2 — Aanvullend

**Play app-installs & abonnementen (`play.installs`, `play.subscriptions`)**
- Welke categorie apps gebruikt iemand? (fitness, finance, productiviteit, entertainment)
- Betaalde abonnementen → commitments en interesses

**YouTube Music (`youtube.music`)**
- Genre-voorkeuren → mood-mapping
- Luistertijden → energy/focus signalen

**Maps reviews (`maps.reviews`)**
- Typen beoordeelde plekken → lifestyle insights
- Sentimentanalyse van review-teksten

### Voorbeeldsignalen voor een OS LIFE profiel

```python
def build_os_life_signals(data_dir):
    """Bouw een basis OS LIFE profiel uit Google data."""
    signals = {}
    
    # 1. Interesses uit zoekgeschiedenis
    search_data = parse_search_activity(data_dir)
    from collections import Counter
    
    # Top zoekthema's (simpele keyword extractie)
    all_queries = " ".join([s["query"] for s in search_data])
    # → Gebruik NLP of keyword categorisatie voor clustering
    
    # 2. Woon-/werklocatie uit Maps commute settings
    commute_file = Path(data_dir) / "Maps" / "CommuteSettings.json"
    if commute_file.exists():
        with open(commute_file) as f:
            commute = json.load(f)
        signals["work_location"] = commute.get("workAddress")
        signals["home_location"] = commute.get("homeAddress")
    
    # 3. Lifestyle categorieën uit opgeslagen plaatsen
    starred_file = Path(data_dir) / "Maps" / "StarredPlaces.json"
    if starred_file.exists():
        with open(starred_file) as f:
            places = json.load(f)
        # Categoriseer op type: restaurant, fitness, culture, etc.
        signals["saved_places_count"] = len(places)
    
    # 4. Interesses uit YouTube subscriptions
    subs_file = Path(data_dir) / "YouTube" / "subscriptions" / "subscriptions.json"
    if subs_file.exists():
        with open(subs_file) as f:
            subs = json.load(f)
        signals["youtube_subscriptions"] = [s.get("snippet", {}).get("title") for s in subs]
    
    return signals
```

### Signalen die je NIET kunt halen (en alternatieven)

| Gewenst signaal | Waarom niet via Data Portability API | Alternatief |
|----------------|--------------------------------------|-------------|
| Agenda-patronen (druk/vrij) | Calendar niet beschikbaar | Google Calendar API |
| Email-onderwerpen en afzenders | Gmail niet beschikbaar | Gmail API |
| Slaap/stap/hartslag data | Google Fit/Fitbit health niet beschikbaar | Google Fit REST API, Fitbit API |
| GPS-tijdlijn (ruwe locatiedata) | Geen raw GPS scope | Google Maps Timeline API (beperkt) |
| Foto-metadata (wanneer/waar) | Photos niet beschikbaar | Google Photos API |

---

## 7. Setup Stappenplan (Gratis)

### Stap 1: Google Cloud Project aanmaken
1. Ga naar [console.cloud.google.com](https://console.cloud.google.com)
2. Maak een nieuw project aan (bijv. "OS LIFE Data")
3. Schakel billing in (vereist, maar er zijn geen API-kosten)
4. Zoek naar "Data Portability API" en schakel die in

### Stap 2: OAuth Credentials aanmaken
1. Ga naar APIs & Services → Credentials
2. Maak een OAuth 2.0 Client ID aan
3. Voeg je redirect URI toe (bijv. `http://localhost:8080/callback`)
4. Download `client_secrets.json`

### Stap 3: App configureren voor testing
- Zet je app op "Testing" status
- Voeg jezelf toe als test-gebruiker
- In testing mode: tokens geldig voor 7 dagen, geen verificatieproces nodig

### Stap 4: Voor productie (eigen gebruik als single user)
- Voor intern/persoonlijk gebruik: het volledige verificatieproces is mogelijk niet vereist
- Check de [Google OAuth verification guide](https://developers.google.com/identity/protocols/oauth2/policies) voor de exacte regels

### Stap 5: Installeer afhankelijkheden

```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2 requests
```

---

## 8. Aanbevelingen voor OS LIFE

### Hoogste prioriteit — Start hiermee

1. **`myactivity.search`** — Zoekgeschiedenis is de rijkste bron van intentie-signalen. Analyse hiervan geeft directe inzichten in vragen, zorgen en interesses.

2. **`maps.starred_places` + `maps.commute_routes`** — Geeft direct woon-werklocatie en lifestyle-categorieën zonder GPS-tracking.

3. **`youtube.subscriptions`** — 15-50 kanalen geven een categoriseerbaar interesseprofiel zonder complexe analyse.

4. **`discover.follows`** — Expliciet door de gebruiker gekozen topics, hoogste signaalwaarde.

### Aanvullen met directe Google APIs (buiten Data Portability API)

| API | Data | Implementatie-moeilijkheid |
|-----|------|---------------------------|
| Google Calendar API | Agenda-patronen, drukke periodes | Laag — goed gedocumenteerd |
| Google Fit REST API | Stappen, slaap, hartslag | Middel |
| Gmail API | Email-patronen (geen content, alleen metadata) | Middel |

### Architectuuraanbeveling

```
OS LIFE Data Pipeline
├── Google Data Portability API (wekelijkse batch, max 1x/24u per scope)
│   ├── Search activiteit → interesse-clustering
│   ├── Maps saved places → locatie-categorisatie  
│   ├── YouTube subscriptions → hobby/interesse profiel
│   └── Chrome history → tool/website patronen
│
├── Google Calendar API (real-time, per agenda-update)
│   └── Busy/free patronen, meeting categorisatie
│
└── Google Fit API (dagelijkse sync)
    └── Beweging, slaap, energie-niveau
```

---

## 9. Bronnen

- [Google Data Portability API — Overzicht](https://developers.google.com/data-portability/user-guide/overview)
- [API Reference — InitiatePortabilityArchive](https://developers.google.com/data-portability/reference/rest/v1/portabilityArchive/initiate)
- [Beschikbare scopes](https://developers.google.com/data-portability/user-guide/scopes)
- [Schema reference — My Activity](https://developers.google.com/data-portability/schema-reference/my_activity)
- [Schema reference — Play](https://developers.google.com/data-portability/schema-reference/play)
- [Schema reference — Fitbit](https://developers.google.com/data-portability/schema-reference/fitbit)
- [Time-based access guide](https://developers.google.com/data-portability/user-guide/time-based)
- [Troubleshooting & error codes](https://developers.google.com/data-portability/user-guide/troubleshooting)
- [OAuth verification policy](https://developers.google.com/identity/protocols/oauth2/policies)

---

*Rapport gegenereerd door OS LIFE deep-research workflow. Geverifieerd tegen officiële Google API documentatie (maart 2025). Controleer altijd de meest recente documentatie voor scope-wijzigingen.*
