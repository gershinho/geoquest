import json
import os
import random
import datetime
from pathlib import Path
from flask import Flask, render_template, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "static" / "data"
CACHE_PATH = DATA_DIR / "countries_cache.json"

app = Flask(__name__, template_folder=str(BASE_DIR / "templates"), static_folder=str(BASE_DIR / "static"))
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")


def _load_country_cache():
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None


def _save_country_cache(data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _fetch_restcountries():
    """
    Fetch country data from Rest Countries.
    We keep this in a separate function so the app still works offline using a tiny fallback list.
    """
    import urllib.request

    url = "https://restcountries.com/v3.1/all?fields=name,flags,capital,region,languages,cca2,cca3"
    with urllib.request.urlopen(url, timeout=20) as resp:
        raw = json.loads(resp.read().decode("utf-8"))

    countries = []
    for c in raw:
        name = (c.get("name") or {}).get("common")
        if not name:
            continue
        flags = c.get("flags") or {}
        flag = flags.get("png") or flags.get("svg") or ""
        capital = ""
        cap = c.get("capital")
        if isinstance(cap, list) and cap:
            capital = cap[0]
        elif isinstance(cap, str):
            capital = cap
        region = c.get("region") or ""
        langs_obj = c.get("languages") or {}
        languages = list(langs_obj.values()) if isinstance(langs_obj, dict) else []
        cca3 = c.get("cca3") or ""
        cca2 = c.get("cca2") or ""
        countries.append(
            {
                "name": name,
                "cca3": cca3,
                "cca2": cca2,
                "flag": flag,
                "capital": capital,
                "region": region,
                "languages": languages,
            }
        )

    # Sort for stable UI
    countries.sort(key=lambda x: x["name"])
    return {
        "fetched_at_utc": datetime.datetime.utcnow().isoformat() + "Z",
        "countries": countries,
    }


def _fetch_rapidapi_countries():
    """
    Fetch country/language data from a RapidAPI-backed service.
    The exact RapidAPI URL and credentials are read from environment variables:
      RAPIDAPI_URL (full URL to call)
      RAPIDAPI_KEY (x-rapidapi-key)
      RAPIDAPI_HOST (x-rapidapi-host) - optional

    This function attempts to be permissive about the remote JSON shape and
    maps fields to the internal country object shape expected by the frontend.
    """
    import urllib.request

    url = os.environ.get('RAPIDAPI_URL')
    if not url:
        raise RuntimeError('RAPIDAPI_URL not configured')

    headers = {}
    key = os.environ.get('RAPIDAPI_KEY')
    host = os.environ.get('RAPIDAPI_HOST')
    if key:
        headers['x-rapidapi-key'] = key
    if host:
        headers['x-rapidapi-host'] = host

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = json.loads(resp.read().decode('utf-8'))

    items = []
    if isinstance(raw, dict):
        # common shapes: {"countries": [...] } or top-level list
        if 'countries' in raw and isinstance(raw['countries'], list):
            items = raw['countries']
        else:
            # try to find a list value in the dict
            for v in raw.values():
                if isinstance(v, list):
                    items = v
                    break
    elif isinstance(raw, list):
        items = raw

    countries = []
    for c in items:
        try:
            # attempt common field names
            name = c.get('name') or c.get('country') or c.get('country_name') or None
            if isinstance(name, dict):
                # some APIs nest name.common
                name = name.get('common') or name.get('official')
            if not name:
                continue
            cca3 = c.get('cca3') or c.get('alpha3') or c.get('iso3') or ''
            cca2 = c.get('cca2') or c.get('alpha2') or c.get('iso2') or ''

            # languages may be an object, a list or a comma-separated string
            langs = []
            L = c.get('languages') or c.get('language') or c.get('langs') or None
            if isinstance(L, dict):
                langs = list(L.values())
            elif isinstance(L, list):
                langs = L
            elif isinstance(L, str):
                langs = [x.strip() for x in L.split(',') if x.strip()]

            flag = c.get('flag') or c.get('flag_url') or c.get('flag_png') or c.get('flagImage') or ''
            region = c.get('region') or c.get('continent') or ''
            capital = c.get('capital') or ''

            countries.append({
                'name': name,
                'cca3': cca3,
                'cca2': cca2,
                'flag': flag,
                'capital': capital,
                'region': region,
                'languages': langs,
            })
        except Exception:
            continue

    countries.sort(key=lambda x: x.get('name') or '')
    return {"fetched_at_utc": datetime.datetime.utcnow().isoformat() + "Z", "countries": countries}


def get_countries():
    cached = _load_country_cache()
    if cached and isinstance(cached, dict) and "countries" in cached:
        return cached["countries"], True

    # Attempt to fetch; if it fails, fall back to a small built-in list
    try:
        fresh = _fetch_restcountries()
        _save_country_cache(fresh)
        return fresh["countries"], False
    except Exception:
        fallback = [
            {
                "name": "United States",
                "cca3": "USA",
                "cca2": "US",
                "flag": "https://flagcdn.com/w320/us.png",
                "capital": "Washington, D.C.",
                "region": "Americas",
                "languages": ["English"],
            },
            {
                "name": "India",
                "cca3": "IND",
                "cca2": "IN",
                "flag": "https://flagcdn.com/w320/in.png",
                "capital": "New Delhi",
                "region": "Asia",
                "languages": ["Hindi", "English"],
            },
            {
                "name": "Brazil",
                "cca3": "BRA",
                "cca2": "BR",
                "flag": "https://flagcdn.com/w320/br.png",
                "capital": "Brasília",
                "region": "Americas",
                "languages": ["Portuguese"],
            },
            {
                "name": "France",
                "cca3": "FRA",
                "cca2": "FR",
                "flag": "https://flagcdn.com/w320/fr.png",
                "capital": "Paris",
                "region": "Europe",
                "languages": ["French"],
            },
        ]
        return fallback, False


@app.get("/api/languages_remote")
def api_languages_remote():
    """Proxy endpoint that returns country + language data fetched from the configured RapidAPI URL.

    Set RAPIDAPI_URL and RAPIDAPI_KEY in the environment to enable. If not configured
    this endpoint will return a 500 with an explanatory message.
    """
    # If RAPIDAPI_URL is not configured, fall back to any existing cache so we
    # don't attempt to call an external service from the client (keeps keys
    # hidden and avoids revealing configuration).
    if not os.environ.get('RAPIDAPI_URL'):
        cached = _load_country_cache()
        if cached and isinstance(cached, dict) and 'countries' in cached:
            return jsonify({"countries": cached['countries'], "from_cache": True})
        return jsonify({"error": "RAPIDAPI_URL not configured and no cache available"}), 500

    try:
        data = _fetch_rapidapi_countries()
        # persist a local cache of the RapidAPI result so subsequent requests
        # (or clients) don't trigger extra RapidAPI calls or leak keys.
        try:
            _save_country_cache(data)
        except Exception:
            pass
        return jsonify({"countries": data["countries"], "from_cache": False})
    except Exception as e:
        # If the remote call fails, gracefully fall back to any cached data
        cached = _load_country_cache()
        if cached and isinstance(cached, dict) and 'countries' in cached:
            return jsonify({"countries": cached['countries'], "from_cache": True})
        return jsonify({"error": str(e)}), 500


# ----------------- Pages -----------------
@app.get("/")
def home():
    return render_template("home.html")


@app.get("/flags")
def flags_setup():
    return render_template("flag_setup.html")


@app.get("/flags/play")
def flags_play():
    return render_template("flag_game.html")


@app.get("/map")
def map_setup():
    return render_template("map_setup.html")


@app.get("/map/play")
def map_play():
    return render_template("map_game.html")


@app.get("/languages")
def languages():
    return render_template("languages.html")


# ----------------- API -----------------
@app.get("/api/countries")
def api_countries():
    countries, from_cache = get_countries()
    return jsonify({"countries": countries, "from_cache": from_cache})


@app.get("/api/ping")
def api_ping():
    return jsonify({"ok": True})


@app.get("/static/data/<path:filename>")
def static_data(filename):
    return send_from_directory(DATA_DIR, filename)


if __name__ == "__main__":
    # Use: python app.py
    app.run(debug=True, port=int(os.environ.get("PORT", "5000")))