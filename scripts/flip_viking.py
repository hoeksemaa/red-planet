"""Flip all Viking tile PNGs vertically (in-place).

The tiles were downloaded with pixel rows stored south-up; Cesium expects
north-up. Run once after fetch_viking.py.

Usage:
  python flip_viking.py
"""
from pathlib import Path
from PIL import Image
from tqdm import tqdm

ROOT = Path("data/raw/viking")

tiles = list(ROOT.glob("**/*.png"))

for path in tqdm(tiles, unit="tile"):
    img = Image.open(path)
    img.transpose(Image.FLIP_TOP_BOTTOM).save(path)
