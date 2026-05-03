# Backend — Data Processing Pipeline

This folder contains the offline data-processing scripts that convert raw PWS
CSV exports into the spatially-chunked JSON tiles consumed by the static
frontend. **There is no live server** — GitHub Pages only hosts static files,
so all heavy lifting happens here, once, before deployment.

## What this does

`process_data.py` takes a CSV with point-level Perceived Walkability Scores
and produces:

```
frontend/data/
├── manifest.json     # index of tiles + metadata (bounds, statistics)
├── overview.json     # ~10% sample of all points (shown when zoomed out)
└── tiles/
    ├── 0_0.json
    ├── 0_1.json
    ├── ...
    └── 15_15.json    # full-resolution chunks (one per grid cell)
```

The frontend loads `manifest.json` first, then `overview.json` for the
city-wide view. As the user zooms in, only the tiles intersecting the
current viewport are fetched on demand. This means even a 400,000-point
dataset stays responsive on a static host.

## Setup

Requires Python 3.9+.

```bash
cd backend
pip install -r requirements.txt
```

## Usage

From the `backend/` directory:

```bash
# Default — 16x16 grid, overview keeps 1 in 10 points
python process_data.py --input /path/to/aggregated_pixel_ratios.csv

# Larger grid for finer chunks (use for 400k+ datasets)
python process_data.py --input data.csv --grid 24

# Denser overview (loads more points immediately)
python process_data.py --input data.csv --overview-step 5
```

Required CSV columns: `lon`, `lat`, `Psw_score`. Other columns
(`base_filename_key`, `PWS`) are ignored.

## Re-running

Every time you regenerate PWS scores (e.g., after extending coverage from
73k to 400k points), re-run this script. It will overwrite the contents of
`frontend/data/`. Then commit and push — GitHub Actions redeploys
automatically.

## Tile size guidance

| Dataset size | Recommended `--grid` |
|--------------|----------------------|
| < 50k points | 8                    |
| 50k–200k     | 16  *(default)*      |
| 200k–500k    | 24                   |
| > 500k       | 32                   |

The goal is for each tile to hold roughly 500–3000 points so individual
file sizes stay small and parallel HTTP/2 requests stay efficient.

## Future extensions

When the additional indicator layers (sidewalk, greenery, streetlight,
crowdedness) are exposed per-point, extend the `["lon", "lat", "Psw_score"]`
column list in `write_overview` / `write_tiles` to include them. The
frontend will need a corresponding update to read the extra columns and
display them in the click popup as a small radar chart.
