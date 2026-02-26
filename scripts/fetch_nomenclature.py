import urllib.request
from pathlib import Path

URL = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz"
OUT = Path("data/raw/nomenclature/MARS_nomenclature_center_pts.kmz")

OUT.parent.mkdir(parents=True, exist_ok=True)
print(f"Downloading {URL} ...")
urllib.request.urlretrieve(URL, OUT)
print(f"Saved {OUT.stat().st_size / 1024:.0f} KB → {OUT}")
