"""
Simplify rover traverse paths using Ramer-Douglas-Peucker algorithm.

Reduces point count by ~100x with no perceptible visual difference at globe scale.
Overwrites public/data/processed/rovers/traverse.geojson in place.

Usage:
    python scripts/simplify_traverse.py
"""

import json
import numpy as np
from pathlib import Path

INPUT = Path("public/data/processed/rovers/traverse.geojson")
TARGET_RATIO = 100       # aim for 100x point reduction
COORD_DECIMALS = 5       # ~1m precision on Mars; original has 8 (overkill)


def rdp(coords: list[list[float]], epsilon: float) -> list[list[float]]:
    """Iterative Ramer-Douglas-Peucker simplification."""
    points = np.array(coords)
    n = len(points)
    if n <= 2:
        return coords

    keep = np.zeros(n, dtype=bool)
    keep[0] = True
    keep[-1] = True

    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        if end - start <= 1:
            continue

        p1, p2 = points[start], points[end]
        seg = p2 - p1
        seg_len = np.linalg.norm(seg)

        mid = points[start + 1 : end]
        if seg_len == 0:
            dists = np.linalg.norm(mid - p1, axis=1)
        else:
            # perpendicular distance via 2D cross product
            t = mid - p1
            dists = np.abs(t[:, 0] * seg[1] - t[:, 1] * seg[0]) / seg_len

        max_local = int(np.argmax(dists))
        if dists[max_local] > epsilon:
            max_idx = start + 1 + max_local
            keep[max_idx] = True
            stack.append((start, max_idx))
            stack.append((max_idx, end))

    return [coords[i] for i in range(n) if keep[i]]


def find_epsilon(coords: list, target_count: int) -> tuple[float, list]:
    """Binary search for epsilon that hits target_count."""
    lo, hi = 1e-7, 1.0
    best_coords = coords
    for _ in range(40):  # 40 iterations is plenty for convergence
        mid = (lo + hi) / 2
        simplified = rdp(coords, mid)
        if len(simplified) > target_count:
            lo = mid
        else:
            hi = mid
            best_coords = simplified
    return hi, best_coords


def round_coords(coords: list[list[float]], decimals: int) -> list[list[float]]:
    return [[round(c, decimals) for c in pt] for pt in coords]


def main():
    with open(INPUT) as f:
        data = json.load(f)

    for feature in data["features"]:
        rover = feature["properties"]["rover"]
        coords = feature["geometry"]["coordinates"]
        original_count = len(coords)
        target_count = max(2, original_count // TARGET_RATIO)

        epsilon, simplified = find_epsilon(coords, target_count)
        simplified = round_coords(simplified, COORD_DECIMALS)

        actual_ratio = original_count / len(simplified)
        print(
            f"{rover}: {original_count:,} → {len(simplified):,} points "
            f"({actual_ratio:.1f}x reduction, epsilon={epsilon:.6f})"
        )

        feature["geometry"]["coordinates"] = simplified

    with open(INPUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))  # compact, no whitespace

    size_kb = INPUT.stat().st_size / 1024
    print(f"\nWrote {INPUT} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
