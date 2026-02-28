# Deployment Plan: Google Mars → S3 + CloudFront + Vercel

## Context

The app is a pure static SPA (Vite + CesiumJS, no backend). All data currently lives on local disk, served by Vite's dev server. To deploy publicly, we split assets into two destinations based on size:

- **~20GB imagery tiles** → S3 bucket behind CloudFront CDN
- **Everything else** (app bundle, ~15MB processed data, ~2.4MB local images) → Vercel (free tier)

The goal is minimal code changes — one env var controls whether tiles load locally or from CDN.

## Current Data Layout

All data URLs are centralized in `src/constants.ts`. No env vars exist yet.

| Constant | Path | Size | Type |
|---|---|---|---|
| `TERRAIN_DATA_URL` | `/data/processed/MOLA/mola_16ppd.f32` | 4MB | Binary heightmap |
| `CONTOURS_DATA_URL` | `/data/processed/MOLA/contours.geojson` | 3MB | GeoJSON |
| `NOMENCLATURE_DATA_URL` | `/data/processed/nomenclature/features.geojson` | 5MB | GeoJSON |
| `ROVER_TRAVERSE_URL` | `/data/processed/rovers/traverse.geojson` | <1MB | GeoJSON |
| `ROVER_IMAGES_URL` | `/data/processed/rovers/images.geojson` | <1MB | GeoJSON |
| `IMAGERY_BASE_URL` | `/data/raw/terraformed/` | ~20GB | TMS tile pyramid |
| `VIKING_IMAGERY_URL` | `/data/raw/viking/{z}/{x}/{reverseY}.png` | ~1GB | XYZ tiles |

Rover images (`ROVER_META[*].imageUrl`) and satellite images (`SATELLITES[*].imageUrl`) all point to `/images/*` — served from `public/images/` (~2.4MB, 15 files).

## What Goes Where

| Asset | Destination | Reason |
|---|---|---|
| App bundle (`dist/`) | Vercel | Free, zero-config Vite deploys |
| `public/images/*` | Vercel | Ships with app (~2.4MB) |
| `data/processed/**` | Vercel | Small enough (~15MB), move into `public/data/processed/` |
| `data/raw/terraformed/**` | S3 → CloudFront | ~20GB, too large for app bundle |
| `data/raw/viking/**` | S3 → CloudFront | ~1GB, same reason |

## Implementation Steps

### Step 1: Move processed data into `public/`

Copy processed data files into `public/data/processed/` so Vite serves them in both dev and production:

```
public/
├── images/              ← already exists (rover + satellite photos)
└── data/
    └── processed/
        ├── MOLA/
        │   ├── mola_16ppd.f32
        │   └── contours.geojson
        ├── nomenclature/
        │   └── features.geojson
        └── rovers/
            ├── traverse.geojson
            └── images.geojson
```

Update `.gitignore` to track `public/data/processed/` (these files are small enough to commit).

The processed data URL constants (`TERRAIN_DATA_URL`, etc.) stay as-is — they already use root-relative paths like `/data/processed/...`, which resolve correctly from `public/` in both dev and prod.

### Step 2: Add env var for tile CDN in `constants.ts`

Introduce one env var: `VITE_TILE_CDN_URL`.

```ts
// src/constants.ts — only change needed

const TILE_CDN = import.meta.env.VITE_TILE_CDN_URL ?? '';

// before: '/data/raw/terraformed/'
export const IMAGERY_BASE_URL = `${TILE_CDN}/data/raw/terraformed/`;

// before: '/data/raw/viking/{z}/{x}/{reverseY}.png'
export const VIKING_IMAGERY_URL = `${TILE_CDN}/data/raw/viking/{z}/{x}/{reverseY}.png`;
```

**Dev** (no env var): `TILE_CDN = ''` → paths stay `/data/raw/...` (local, as before).
**Prod** (env var set): `TILE_CDN = 'https://d1xxxxx.cloudfront.net'` → full CDN URL.

No other source files change. `imagery.ts` already reads these constants.

### Step 3: Create env files

```bash
# .env.production (new file, committed)
VITE_TILE_CDN_URL=https://d1xxxxx.cloudfront.net
```

The CloudFront domain gets filled in after Step 5. Optionally create `.env.development` as documentation (VITE_TILE_CDN_URL unset = local).

### Step 4: Create S3 bucket + upload tiles

```bash
# Create bucket (us-east-1 for cheapest CloudFront pairing)
aws s3 mb s3://red-planet-tiles --region us-east-1

# Upload terraformed tiles (~20GB — will take a while on residential upload)
aws s3 sync data/raw/terraformed/ s3://red-planet-tiles/data/raw/terraformed/ \
  --content-type image/png \
  --cache-control "public, max-age=31536000, immutable"

# Upload viking tiles (~1GB)
aws s3 sync data/raw/viking/ s3://red-planet-tiles/data/raw/viking/ \
  --content-type image/png \
  --cache-control "public, max-age=31536000, immutable"
```

**Note on upload time:** 20GB at 10 Mbps upload = ~4.5 hours. Consider running overnight or from a cloud shell with faster egress.

Bucket should NOT be publicly accessible — access via CloudFront OAC only.

### Step 5: Create CloudFront distribution

Key configuration:
- **Origin:** `red-planet-tiles.s3.us-east-1.amazonaws.com`
- **Origin Access Control (OAC):** Create one, attach to origin (sigv4, always sign)
- **Cache behavior:** GET/HEAD only, `CachingOptimized` managed policy
- **CORS:** Attach a response headers policy that adds `Access-Control-Allow-Origin: *` (required — Cesium's UrlTemplateImageryProvider fetches tiles via XHR)
- **Price class:** `PriceClass_100` (US/Canada/Europe only — cheapest, fine for personal project)

After creating the distribution, update the S3 bucket policy to allow the CloudFront OAC:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::red-planet-tiles/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
      }
    }
  }]
}
```

Then update `.env.production` with the actual CloudFront domain.

### Step 6: Deploy app to Vercel

```bash
npm i -g vercel
vercel                            # first deploy (auto-detects Vite)
vercel env add VITE_TILE_CDN_URL production   # paste CloudFront URL
vercel --prod                     # production deploy with env var
```

No `vercel.json` needed — Vercel auto-detects Vite, runs `npm run build`, serves `dist/`.

### Step 7: Verify

1. Open Vercel URL in browser
2. Globe loads with terrain mesh (mola_16ppd.f32 served by Vercel from `public/data/processed/`)
3. Imagery tiles load from CloudFront (check Network tab — requests to `d1xxxxx.cloudfront.net`)
4. Toggle Viking imagery — also loads from CloudFront
5. No CORS errors in console
6. Contours, labels, rovers, satellites all render (data from Vercel)
7. Rover/satellite info panels show photos (from Vercel `/images/`)
8. Search works, layer toggles work, exaggeration toggle works

## Files Modified (summary)

| File | Change |
|---|---|
| `src/constants.ts` | Add `TILE_CDN` env var prefix to `IMAGERY_BASE_URL` and `VIKING_IMAGERY_URL` |
| `.env.production` | New — sets `VITE_TILE_CDN_URL` to CloudFront domain |
| `.gitignore` | Allow `public/data/` to be tracked |
| `public/data/processed/` | New directory — copy of all processed data files |

## Risks / Gotchas

- **CORS on CloudFront:** If you forget the response headers policy, Cesium will silently fail to load tiles. The globe will render as solid brown (base color). Check console for CORS errors.
- **S3 path structure:** The S3 keys must mirror the URL path (`/data/raw/terraformed/...`). The `aws s3 sync` commands above preserve this.
- **`{reverseY}` and `{z1}` template tags:** These are Cesium template variables, NOT our code. They're interpolated by `UrlTemplateImageryProvider` at request time. The CDN prefix doesn't interfere with them.
- **Vite `public/` handling:** Files in `public/` are served at root `/` — so `public/data/processed/MOLA/mola_16ppd.f32` becomes `/data/processed/MOLA/mola_16ppd.f32`. This matches the existing URL constants exactly.
- **Upload bandwidth:** 20GB upload is the longest step. Budget accordingly.
