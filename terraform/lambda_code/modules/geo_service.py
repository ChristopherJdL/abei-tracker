"""Geocoding, coordinate lookup from dataset, and fallback location heuristics."""

import os
import csv
import random
import unicodedata

_CACHED_CITIES: list[dict] | None = None

def get_cities_dataset() -> list[dict]:
    """Load and cache the global cities dataset from local CSV."""
    global _CACHED_CITIES
    if _CACHED_CITIES is not None:
        return _CACHED_CITIES

    csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'cities.csv')
    cities = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                cities.append(row)
        _CACHED_CITIES = cities
        print(f"[GeoService] ℹ️ Loaded {len(_CACHED_CITIES)} cities into memory cache.")
    except Exception as ex:
        print(f"[GeoService] ❌ Failed to read cities.csv: {ex}")
        _CACHED_CITIES = []

    return _CACHED_CITIES

def normalize_geo_string(s: str | None) -> str:
    """Strip accents and lowercase a geographic string for resilient matching."""
    if not s:
        return ''
    norm = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    return norm.lower().strip()

def extract_fallback_title(prompt: str) -> str:
    """Scan the prompt for any known city in cities.csv, otherwise use the first two words."""
    prompt_norm = normalize_geo_string(prompt)
    cities = get_cities_dataset()
    longest_match = ""

    for row in cities:
        city = row.get('city', '')
        if len(city) > 3 and city in prompt_norm:
            if len(city) > len(longest_match):
                longest_match = city

    if longest_match:
        return longest_match.title()

    words = prompt.strip().split()
    return " ".join(words[:2]).title() if words else "Unknown Location"

def lookup_coordinates(city_name: str, country_or_state: str | None = None) -> tuple[float | None, float | None]:
    """
    Lookup latitude and longitude for a city in the local CSV dataset.
    The dataset is pre-sorted by population in descending order.
    1. If country_or_state is provided, matches city AND (country / country_code / state).
    2. Fallback matches city alone (highest population worldwide wins).
    """
    cq = normalize_geo_string(city_name)
    cos = normalize_geo_string(country_or_state) if country_or_state else None
    cities = get_cities_dataset()

    # 1. Match both city AND country/state
    if cos:
        for row in cities:
            if row.get('city') == cq:
                r_country = row.get('country', '')
                r_cc = row.get('country_code', '').lower()
                r_state = row.get('state', '')
                if (cos in r_country or cos == r_cc or cos in r_state or r_country in cos):
                    print(f"[GeoService] ✅ Geocode match: '{city_name}' in '{country_or_state}' -> ({row['lat']}, {row['lng']})")
                    return round(float(row['lat']), 4), round(float(row['lng']), 4)

    # 2. Fallback: match city only (highest population match wins)
    for row in cities:
        if row.get('city') == cq:
            print(f"[GeoService] ℹ️ Geocode fallback (highest pop): '{city_name}' -> ({row['lat']}, {row['lng']})")
            return round(float(row['lat']), 4), round(float(row['lng']), 4)

    return None, None

def generate_fallback_coordinates(prompt: str) -> tuple[float, float]:
    """Generate deterministic pseudo-random coordinates based on prompt hash."""
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(prompt))
    rng = random.Random(seed)
    lat = round(rng.uniform(-40.0, 68.0), 4)
    lng = round(rng.uniform(-130.0, 140.0), 4)
    print(f"[GeoService] ℹ️ Generated fallback coordinates: lat={lat}, lng={lng}")
    return lat, lng
