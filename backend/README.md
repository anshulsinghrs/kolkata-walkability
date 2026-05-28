# Backend — offline data-processing pipeline

This folder contains the Phase-1 offline data-processing scripts used by
**UrbanPulse**. They convert a walkability-score CSV (originally the
Kolkata PWS export) into spatially-chunked JSON tiles consumed by the
static frontend. These tiles are **optional** — UrbanPulse now boots
without any pre-baked dataset and can drive its visualisations from
Nominatim + user uploads alone.

The Phase 2+ live API (FastAPI + OSMnx + PostGIS) is scoped in
[`../docs/BACKEND_PLAN.md`](../docs/BACKEND_PLAN.md).

## What `process_data.py` does

Given a CSV with point-level walkability scores it produces:

```
frontend/data/
├── manifest.json     # index of tiles + metadata (bounds, statistics)
├── overview.json     # sampled subset of all points (shown when zoomed out)
└── tiles/
    ├── 0_0.json
    ├── 0_1.json
    ├── ...
    └── 15_15.json    # full-resolution chunks (one per grid cell)
```

The frontend loads `manifest.json` first, then `overview.json` for the
city-wide view. As the user zooms in, only the tiles intersecting the
viewport are fetched — keeping even a 400k-point dataset responsive on
a purely static host.

## Setup

Requires Python 3.9+.

```bash
cd backend
pip install -r requirements.txt
```

## Usage

```bash
# Default — 16x16 grid, overview keeps 1 in 10 points
python process_data.py --input /path/to/walkability.csv

# Larger grid for finer chunks (use for 400k+ datasets)
python process_data.py --input data.csv --grid 24

# Denser overview (loads more points immediately)
python process_data.py --input data.csv --overview-step 5
```

Required CSV columns: `lon`, `lat`, `Psw_score`. Other columns are
ignored.

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
crowdedness, crossing safety) are exposed per-point, extend the
`["lon", "lat", "Psw_score"]` column list in `write_overview` /
`write_tiles` to include them. The frontend will read the extra
columns and surface them in the click popup as a small radar chart.

For the live (per-city, on-demand) pipeline, see the FastAPI service
under `api/` once Phase 2 lands.
