#!/usr/bin/env python3
"""Download and process Mars rover traverse data from NASA MMGIS.

Sources:
  Perseverance: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json
  Curiosity:    https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json

Outputs:
  data/processed/rovers/traverse.geojson
    FeatureCollection<LineString> — one feature per rover, full path
  data/processed/rovers/images.geojson
    FeatureCollection<Point> — one feature per drive sol (for clickable pins)
    Properties: rover, id, sol, color

Usage:
  source .venv/bin/activate
  python scripts/rovers/fetch_rovers.py
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

ROVERS = [
    {
        "id": "perseverance",
        "name": "Perseverance",
        "url": "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json",
        "color": "#FF6B35",
    },
    {
        "id": "curiosity",
        "name": "Curiosity",
        "url": "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json",
        "color": "#4CAF50",
    },
]

OUT_DIR = Path("data/processed/rovers")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def fetch_json(url: str) -> dict:
    print(f"  Fetching {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "google-mars/1.0 (research)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def flatten_coords(features: list[dict]) -> list[list[float]]:
    """Flatten all segment coordinates into one 2D list, preserving order."""
    all_coords: list[list[float]] = []
    for seg in features:
        geom = seg.get("geometry", {})
        geom_type = geom.get("type", "")
        if geom_type == "LineString":
            coord_lists = [geom["coordinates"]]
        elif geom_type == "MultiLineString":
            coord_lists = geom["coordinates"]
        else:
            continue
        for coords in coord_lists:
            for c in coords:
                all_coords.append([c[0], c[1]])  # drop elevation (Z)
    return all_coords


def waypoints_by_sol(features: list[dict], rover: dict) -> list[dict]:
    """One pin per unique sol (for MMGIS data that has a sol property)."""
    seen: set[int] = set()
    result: list[dict] = []
    for seg in features:
        sol = seg["properties"].get("sol")
        if sol is None or sol in seen:
            continue
        seen.add(sol)
        geom = seg.get("geometry", {})
        geom_type = geom.get("type", "")
        if geom_type == "LineString":
            coords = geom["coordinates"]
        elif geom_type == "MultiLineString":
            coords = geom["coordinates"][0]
        else:
            continue
        mid = coords[len(coords) // 2]
        result.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [mid[0], mid[1]]},
            "properties": {
                "rover": rover["name"],
                "id": rover["id"],
                "sol": sol,
                "color": rover["color"],
            },
        })
    return result


def waypoints_by_sampling(all_coords: list[list[float]], rover: dict, n: int = 100) -> list[dict]:
    """Sample every Nth coordinate as a waypoint (for data without sol info)."""
    result: list[dict] = []
    for i in range(0, len(all_coords), max(1, len(all_coords) // n)):
        c = all_coords[i]
        result.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [c[0], c[1]]},
            "properties": {
                "rover": rover["name"],
                "id": rover["id"],
                "sol": None,
                "color": rover["color"],
            },
        })
    return result


def process_rover(rover: dict) -> tuple[dict, list[dict]]:
    """
    Returns (traverse_feature, image_features) for this rover.

    traverse_feature: GeoJSON Feature<LineString> — full traverse, 2D coords
    image_features:   list of GeoJSON Feature<Point> — one per drive sol (or sampled)
    """
    data = fetch_json(rover["url"])
    features = data.get("features", [])

    # Detect whether this dataset has sol-level segment info
    has_sol = any(f["properties"].get("sol") is not None for f in features)

    if has_sol:
        # Sort chronologically, then extract waypoints by sol
        features.sort(key=lambda f: f["properties"].get("sol", 0))
        all_coords = flatten_coords(features)
        image_features = waypoints_by_sol(features, rover)
    else:
        # No sol info — flatten all coords and sample evenly
        all_coords = flatten_coords(features)
        image_features = waypoints_by_sampling(all_coords, rover, n=100)

    print(f"    → {len(all_coords)} coords, {len(image_features)} waypoints (has_sol={has_sol})")
    traverse_feature = {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": all_coords},
        "properties": {
            "rover": rover["name"],
            "id": rover["id"],
            "color": rover["color"],
        },
    }
    return traverse_feature, image_features


def main() -> None:
    traverse_features = []
    all_image_features = []

    for rover in ROVERS:
        print(f"\nProcessing {rover['name']}...")
        try:
            trav, imgs = process_rover(rover)
            traverse_features.append(trav)
            all_image_features.extend(imgs)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            print(f"  Skipping {rover['name']}")

    traverse_path = OUT_DIR / "traverse.geojson"
    traverse_fc = {"type": "FeatureCollection", "features": traverse_features}
    traverse_path.write_text(json.dumps(traverse_fc, separators=(",", ":")))
    print(f"\nWrote {traverse_path}  ({traverse_path.stat().st_size // 1024} KB)")

    images_path = OUT_DIR / "images.geojson"
    images_fc = {"type": "FeatureCollection", "features": all_image_features}
    images_path.write_text(json.dumps(images_fc, separators=(",", ":")))
    print(f"Wrote {images_path}  ({images_path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
