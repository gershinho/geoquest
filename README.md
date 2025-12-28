# GeoQuest (Flask)

A geography learning web app that mimics the Base44 demo UI you recorded:
- **Flag Challenge** (multiple choice + learn-more panel)
- **Map Challenge** (interactive world map + hot/cold feedback)
- **Language Explorer** (country cards + quiz mode)

## Quickstart

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open: http://127.0.0.1:5000

## Notes

- Country data is pulled from **Rest Countries** and cached to `static/data/countries_cache.json`.
- The map uses a simplified Natural Earth dataset stored at `static/data/countries_geojson.json`.
- Progress (best score, streak, accuracy) is saved locally in your browser (localStorage).

## GitHub

Commit this folder as-is.

```
geoquest/
  app.py
  requirements.txt
  templates/
  static/
```
