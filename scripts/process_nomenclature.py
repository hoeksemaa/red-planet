import zipfile, json
from pathlib import Path
from xml.etree import ElementTree as ET
from collections import Counter

KMZ = Path("data/raw/nomenclature/MARS_nomenclature_center_pts.kmz")
OUT = Path("data/processed/nomenclature/features.geojson")

# --- 1. Unzip KMZ in-memory, read the .kml inside ---
with zipfile.ZipFile(KMZ) as z:
    kml_name = next(n for n in z.namelist() if n.endswith('.kml'))
    kml_bytes = z.read(kml_name)

root = ET.fromstring(kml_bytes)

# KML wraps every tag in a namespace like {http://www.opengis.net/kml/2.2}
# Extract it so we can build tag strings like {ns}Placemark
ns = root.tag.split('}')[0].lstrip('{')

# --- 2. Find all Placemarks ---
placemarks = list(root.iter(f'{{{ns}}}Placemark'))
print(f"Total placemarks: {len(placemarks)}\n")

# Fields we want from SimpleData (actual KML field names confirmed from raw XML)
KEEP = {'type', 'diameter', 'origin', 'code', 'quad_name', 'link'}

# --- 3. Convert all placemarks to GeoJSON features ---
features = []
for pm in placemarks:
    name_el = pm.find(f'{{{ns}}}name')
    coords_el = pm.find(f'.//{{{ns}}}coordinates')
    if name_el is None or coords_el is None:
        continue

    # coordinates are "lon,lat,alt" — we only need lon/lat
    lon, lat, *_ = [float(v) for v in coords_el.text.strip().split(',')]

    props = {'name': name_el.text.strip() if name_el.text else ''}

    # Pull only the fields we want from SimpleData
    for sd in pm.iter(f'{{{ns}}}SimpleData'):
        key = sd.get('name', '')
        if key in KEEP:
            val = sd.text.strip() if sd.text else None
            props[key] = val

    # Rename 'type' → 'feature_type' to avoid collision with GeoJSON's 'type' key
    props['feature_type'] = props.pop('type', None)

    # Cast diameter to float for zoom-bucket comparisons later
    try:
        props['diameter_km'] = float(props.pop('diameter', None) or 0)
    except (ValueError, TypeError):
        props['diameter_km'] = 0.0

    features.append({
        'type': 'Feature',
        'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
        'properties': props,
    })

# --- 5. Write GeoJSON ---
OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'type': 'FeatureCollection', 'features': features}, f, separators=(',', ':'))

print(f"Wrote {len(features)} features → {OUT}")
print(f"File size: {OUT.stat().st_size / 1024:.0f} KB\n")

# --- 6. Exploration report ---
types = Counter(f['properties'].get('feature_type') for f in features)
print("Feature types:")
for t, count in types.most_common():
    print(f"  {count:4d}  {t}")

diameters = [f['properties']['diameter_km'] for f in features]
nonzero = [d for d in diameters if d > 0]
print(f"\nDiameter range: {min(nonzero):.1f} – {max(nonzero):.1f} km  ({len(nonzero)} features have diameter)")

buckets = [('>1000 km', 1000), ('100–1000 km', 100), ('10–100 km', 10), ('<10 km', 0)]
prev = float('inf')
for label, threshold in buckets:
    count = sum(1 for d in diameters if d <= prev and d > threshold)
    print(f"  {count:4d}  {label}")
    prev = threshold
print(f"  {sum(1 for d in diameters if d == 0):4d}  no diameter (landing sites, etc.)")
