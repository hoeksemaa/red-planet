import numpy as np
import json
from pathlib import Path
from skimage.measure import find_contours

HM_W, HM_H = 1440, 720
N_LEVELS = 30
DOWNSAMPLE = 4  # divide grid by this: 1=1440×720, 2=720×360, 4=360×180

def split_antimeridian(coords):
    """Split a coord list wherever longitude jumps > 180° (antimeridian crossing)."""
    result, current = [], [coords[0]]
    for i in range(1, len(coords)):
        if abs(coords[i][0] - coords[i-1][0]) > 180:
            if len(current) >= 2:
                result.append(current)
            current = [coords[i]]
        else:
            current.append(coords[i])
    if len(current) >= 2:
        result.append(current)
    return result

heights = np.fromfile("data/processed/MOLA/mola_16ppd.f32", dtype=np.float32).reshape(HM_H, HM_W)
print(f"Elevation: {heights.min():.0f}m to {heights.max():.0f}m")
heights = heights[::DOWNSAMPLE, ::DOWNSAMPLE]
w, h = HM_W // DOWNSAMPLE, HM_H // DOWNSAMPLE

lo, hi = float(heights.min()), float(heights.max())
levels = np.linspace(lo + 100, hi - 100, N_LEVELS)

features = []

for level in levels:
    segments = find_contours(heights, level)  # heights is already downsampled

    all_coords = []
    for seg in segments:
        rows, cols = seg[:, 0], seg[:, 1]
        lon_360 = cols / w * 360
        lons = np.where(lon_360 <= 180, lon_360, lon_360 - 360)
        lats = 90 - rows / h * 180

        coords = [[round(float(lon), 4), round(float(lat), 4)]
                  for lon, lat in zip(lons, lats)]
        
        if len(coords) < 3:
            continue
    
        for sub in split_antimeridian(coords):
            all_coords.append(sub)

    if all_coords:
        features.append({
            "type": "Feature",
            "properties": {"elevation": round(float(level))},
            "geometry": {"type": "MultiLineString", "coordinates": all_coords},
        })

out = Path("data/processed/MOLA/contours.geojson")
out.parent.mkdir(parents=True, exist_ok=True)
with open(out, "w") as f:
    json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

n_segs = sum(len(f["geometry"]["coordinates"]) for f in features)
print(f"Wrote {len(features)} levels, {n_segs} segments → {out}")
print(f"File size: {out.stat().st_size / 1024:.0f} KB")
