"""Download OPM viking_mdim21_global XYZ tiles (zoom 0–7).

Directory structure: data/raw/viking/{z}/{x}/{y}.png
Max zoom: 7 (403 at z=8+). ~21,845 tiles total, ~3–4 min at 50 workers.
Resume-safe: skips already-downloaded tiles.

Usage:
  python fetch_viking.py          # all levels 0–7
  python fetch_viking.py 4        # only level 4
  python fetch_viking.py 3 4 5    # levels 3, 4, 5
"""
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from tqdm import tqdm

BASE    = "http://s3-eu-west-1.amazonaws.com/whereonmars.cartodb.net/viking_mdim21_global"
OUT     = Path("data/raw/viking")
WORKERS = 50
DELAY   = 0.0
RETRIES = 4


def fetch(z, x, y):
    dest = OUT / str(z) / str(x) / f"{y}.png"
    if dest.exists():
        return "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(RETRIES):
        try:
            urllib.request.urlretrieve(f"{BASE}/{z}/{x}/{y}.png", dest)
            return "ok"
        except Exception as e:
            if attempt == RETRIES - 1:
                return f"fail:{e}"
            time.sleep(2 ** attempt)


levels = [int(a) for a in sys.argv[1:]] if sys.argv[1:] else list(range(8))
all_tiles = [(z, x, y) for z in levels for x in range(2**z) for y in range(2**z)]
total = len(all_tiles)
done = skipped = failed = 0

print(f"Fetching {total} tiles (levels {levels}) → {OUT}  ({WORKERS} workers)")
start = time.time()
with tqdm(total=total, unit="tile") as bar:
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(fetch, z, x, y): (z, x, y) for z, x, y in all_tiles}
        for fut in as_completed(futures):
            result = fut.result()
            if result == "ok":
                done += 1
            elif result == "skip":
                skipped += 1
            else:
                failed += 1
                z, x, y = futures[fut]
                tqdm.write(f"  FAIL {z}/{x}/{y}: {result}")
            bar.update(1)
            bar.set_postfix(ok=done, skip=skipped, fail=failed)

elapsed = time.time() - start
print(f"Done in {elapsed:.1f}s.  ok={done}  skipped={skipped}  failed={failed}")
