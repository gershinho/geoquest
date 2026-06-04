"""
Smoke and data-accuracy tests against a deployed GeoQuest instance.
Run: python -m unittest tests.test_deployed -v
Override base URL: GEOQUEST_BASE_URL=https://example.com python -m unittest tests.test_deployed -v
"""

import json
import os
import ssl
import unittest
import urllib.error
import urllib.request

BASE = os.environ.get("GEOQUEST_BASE_URL", "https://geoquest-kohl.vercel.app").rstrip("/")
CTX = ssl.create_default_context()
TIMEOUT = 30

REQUIRED_COUNTRY_KEYS = {"name", "cca3", "cca2", "flag", "capital", "region", "languages"}

# Known-good reference rows from Rest Countries cache
REFERENCE = {
    "USA": {"name": "United States", "region": "Americas", "cca2": "US"},
    "FRA": {"name": "France", "region": "Europe", "cca2": "FR"},
    "JPN": {"name": "Japan", "region": "Asia", "cca2": "JP"},
    "BRA": {"name": "Brazil", "region": "Americas", "cca2": "BR"},
    "DEU": {"name": "Germany", "region": "Europe", "cca2": "DE"},
}


def _get(path: str) -> tuple[int, bytes]:
    req = urllib.request.Request(f"{BASE}{path}", method="GET")
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=CTX) as resp:
        return resp.status, resp.read()


def _head(url: str) -> int:
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=CTX) as resp:
        return resp.status


class TestDeployedGeoQuest(unittest.TestCase):
    countries_payload = None

    def _load_countries(self):
        if TestDeployedGeoQuest.countries_payload is not None:
            return TestDeployedGeoQuest.countries_payload
        status, body = _get("/api/countries")
        self.assertEqual(status, 200)
        data = json.loads(body.decode())
        TestDeployedGeoQuest.countries_payload = data
        return data

    def test_ping(self):
        status, body = _get("/api/ping")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode()), {"ok": True})

    def test_pages_return_200(self):
        for path in ("/", "/flags", "/flags/play", "/map", "/map/play", "/languages"):
            with self.subTest(path=path):
                status, _ = _get(path)
                self.assertEqual(status, 200, path)

    def test_home_contains_modes(self):
        _, body = _get("/")
        html = body.decode("utf-8", errors="replace")
        for needle in ("GeoQuest", "Flag Challenge", "Map Challenge", "Language Explorer"):
            with self.subTest(needle=needle):
                self.assertIn(needle, html)

    def test_vercel_analytics_snippet(self):
        _, body = _get("/")
        html = body.decode("utf-8", errors="replace")
        self.assertIn("window.va", html)
        self.assertIn("/_vercel/insights/script.js", html)

    def test_static_assets(self):
        assets = (
            "/static/css/styles.css",
            "/static/js/common.js",
            "/static/js/flags.js",
            "/static/js/map.js",
            "/static/js/languages.js",
            "/static/data/countries_geojson.json",
        )
        for path in assets:
            with self.subTest(path=path):
                status, body = _get(path)
                self.assertEqual(status, 200, path)
                self.assertGreater(len(body), 100, path)

    def test_countries_api_schema(self):
        data = self._load_countries()
        countries = data.get("countries")
        self.assertIsInstance(countries, list)
        self.assertGreaterEqual(len(countries), 200, "expected full country list from cache/API")

        for c in countries:
            missing = REQUIRED_COUNTRY_KEYS - set(c.keys())
            self.assertFalse(missing, f"{c.get('name')}: missing {missing}")
            self.assertTrue(c.get("name"))
            self.assertTrue(c.get("cca3"))
            self.assertTrue(c.get("flag"))

    def test_countries_reference_accuracy(self):
        data = self._load_countries()
        by_cca3 = {c["cca3"]: c for c in data["countries"]}

        for code, ref in REFERENCE.items():
            with self.subTest(code=code):
                c = by_cca3.get(code)
                self.assertIsNotNone(c, f"missing {code}")
                self.assertEqual(c["name"], ref["name"])
                self.assertEqual(c["region"], ref["region"])
                self.assertEqual(c["cca2"], ref["cca2"])
                self.assertTrue(c["flag"].startswith("http"))

    def test_languages_remote(self):
        status, body = _get("/api/languages_remote")
        self.assertEqual(status, 200)
        data = json.loads(body.decode())
        self.assertNotIn("error", data)
        self.assertGreaterEqual(len(data.get("countries", [])), 200)

    def test_geojson_valid_and_map_overlap(self):
        status, body = _get("/static/data/countries_geojson.json")
        self.assertEqual(status, 200)
        geo = json.loads(body.decode())
        features = geo.get("features") or []
        self.assertGreaterEqual(len(features), 150)

        iso_in_geo = {
            (f.get("properties") or {}).get("iso_a3", "").upper()
            for f in features
            if (f.get("properties") or {}).get("iso_a3")
        }

        data = self._load_countries()
        api_iso = {c["cca3"] for c in data["countries"]}
        overlap = api_iso & iso_in_geo
        # Map game only targets countries present on the simplified map layer set
        self.assertGreaterEqual(
            len(overlap),
            150,
            f"map/API ISO overlap too low ({len(overlap)}); map challenge may lack targets",
        )

    def test_sample_flag_images_reachable(self):
        data = self._load_countries()
        sample = [
            c for c in data["countries"]
            if c.get("flag", "").startswith("http")
        ][:12]
        ok = 0
        for c in sample:
            try:
                status = _head(c["flag"])
                if 200 <= status < 400:
                    ok += 1
            except urllib.error.HTTPError as e:
                if 200 <= e.code < 400:
                    ok += 1
        self.assertGreaterEqual(ok, len(sample) - 1, "too many flag image URLs failed HEAD")


if __name__ == "__main__":
    unittest.main()
