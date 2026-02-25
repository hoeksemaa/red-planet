import numpy as np
from pathlib import Path

IN  = "data/raw/MOLA/megt90n000eb.img"
OUT = "data/processed/MOLA/mola_16ppd.f32"

raw = np.fromfile(IN, dtype=">i2").reshape(2880, 5760)
print(f"Elevation range: {raw.min()}m to {raw.max()}m")
factor = 4
h, w = raw.shape
downsampled = raw.reshape(h // factor, factor, w // factor, factor).mean(axis=(1, 3))
downsampled.astype(np.float32).tofile(OUT)
