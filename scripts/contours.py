import numpy as np
import json
from pathlib import Path
from skimage.measure import find_contours

HM_W, HM_H = 1440, 720
N_LEVELS = 30
DOWNSAMPLE = 1
PAD_COLS = 20     # cols to copy from each edge for prime-meridian wrapping
MIN_PTS = 10      # drop contour stubs shorter than this


def split_at_col(seg, split_col):
    """Split a pixel-space segment wherever it crosses `split_col`.

    Interpolates the exact crossing row so both pieces share a clean
    endpoint right on the split column.  Returns a list of sub-arrays.
    """
    pieces = []
    current = [seg[0]]
    for i in range(1, len(seg)):
        c0, c1 = seg[i - 1, 1], seg[i, 1]
        crosses = (c0 < split_col) != (c1 < split_col)
        if crosses:
            t = (split_col - c0) / (c1 - c0)
            r_cross = seg[i - 1, 0] + t * (seg[i, 0] - seg[i - 1, 0])
            cross = np.array([r_cross, float(split_col)])
            current.append(cross)
            pieces.append(np.array(current))
            current = [cross.copy()]
        current.append(seg[i])
    if len(current) >= 2:
        pieces.append(np.array(current))
    return pieces if pieces else [seg]


# --- load & pad ----------------------------------------------------------
heights = np.fromfile("data/processed/MOLA/mola_16ppd.f32", dtype=np.float32).reshape(HM_H, HM_W)
print(f"Elevation: {heights.min():.0f}m to {heights.max():.0f}m")
heights = heights[::DOWNSAMPLE, ::DOWNSAMPLE]
h, w = heights.shape

# Pad horizontally so find_contours traces across the prime meridian (lon 0°)
padded = np.hstack([heights[:, -PAD_COLS:], heights, heights[:, :PAD_COLS]])
print(f"Grid: {w}x{h} → padded {padded.shape[1]}x{padded.shape[0]}")

# The antimeridian (lon ±180°) lives at the midpoint of the original grid
antimeridian_col = PAD_COLS + w // 2   # col 740 in padded space

lo, hi = float(heights.min()), float(heights.max())
levels = np.linspace(lo + 100, hi - 100, N_LEVELS)

features = []

for level in levels:
    segments = find_contours(padded, level)

    all_coords = []
    for seg in segments:
        # Drop segments whose centroid falls in the padding zone (duplicates)
        mean_col = seg[:, 1].mean()
        if mean_col < PAD_COLS or mean_col >= PAD_COLS + w:
            continue

        # Split in pixel space at the antimeridian column.
        # This catches smooth crossings that geographic-coordinate splitting misses.
        pieces = split_at_col(seg, antimeridian_col)

        for piece in pieces:
            rows, cols = piece[:, 0], piece[:, 1]
            cols_orig = cols - PAD_COLS
            lon_360 = (cols_orig / w * 360) % 360
            lons = np.where(lon_360 < 180, lon_360, lon_360 - 360)
            lats = 90 - rows / h * 180

            coords = [[round(float(lon), 4), round(float(lat), 4)]
                      for lon, lat in zip(lons, lats)]

            # The interpolated split point lands at exactly lon ±180.
            # Fix sign so it matches its neighbors (180 and -180 are the
            # same place; wrong sign creates a ~360° jump → globe artifact).
            if len(coords) >= 2:
                if coords[0][0] == 180.0 and coords[1][0] < 0:
                    coords[0][0] = -180.0
                if coords[-1][0] == 180.0 and coords[-2][0] < 0:
                    coords[-1][0] = -180.0
                if coords[0][0] == -180.0 and coords[1][0] > 0:
                    coords[0][0] = 180.0
                if coords[-1][0] == -180.0 and coords[-2][0] > 0:
                    coords[-1][0] = 180.0

            if len(coords) >= MIN_PTS:
                all_coords.append(coords)

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
