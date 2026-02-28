"""Precompute MOLA-sampled heights for graticule lines.

Outputs src/features/graticule-heights.ts — import instead of calling
sampleMOLA at runtime. Run from repo root:

    python scripts/precompute_graticule.py
"""
import struct
from pathlib import Path

HM_W, HM_H = 1440, 720
STEP = 30
SAMPLE_DEG = 1

mola_path = Path(__file__).parent.parent / 'public/data/processed/MOLA/mola_16ppd.f32'
raw = mola_path.read_bytes()
heights = struct.unpack(f'{HM_W * HM_H}f', raw)

def sample(lon, lat):
    u = ((lon + 360) % 360) / 360
    v = (90 - lat) / 180
    col = min(int(u * HM_W), HM_W - 1)
    row = min(int(v * HM_H), HM_H - 1)
    return heights[row * HM_W + col]

# Parallels: lat = -60, -30, 0, +30, +60; lon = -180..180 step 1°
parallel_heights = []
for lat in range(-90 + STEP, 90, STEP):
    for lon in range(-180, 181, SAMPLE_DEG):
        parallel_heights.append(sample(lon, lat))

# Meridians: lon = 0, 30, ..., 330; lat = -90..90 step 1°
meridian_heights = []
for lon in range(0, 360, STEP):
    actual_lon = lon - 360 if lon >= 180 else lon
    for lat in range(-90, 91, SAMPLE_DEG):
        meridian_heights.append(sample(actual_lon, lat))

def fmt(vals):
    return ', '.join(f'{v:.1f}' for v in vals)

n_par = len(range(-90 + STEP, 90, STEP))
n_lon = len(range(-180, 181, SAMPLE_DEG))
n_mer = len(range(0, 360, STEP))
n_lat = len(range(-90, 91, SAMPLE_DEG))

out = Path(__file__).parent.parent / 'src/features/graticule-heights.ts'
out.write_text(
    f'// GENERATED — do not edit. Run: python scripts/precompute_graticule.py\n'
    f'// {n_par} parallels × {n_lon} lon samples, {n_mer} meridians × {n_lat} lat samples\n'
    f'\n'
    f'export const parallelHeights = new Float32Array([{fmt(parallel_heights)}]);\n'
    f'\n'
    f'export const meridianHeights = new Float32Array([{fmt(meridian_heights)}]);\n'
)

total = len(parallel_heights) + len(meridian_heights)
print(f'Wrote {total} samples to {out}')
