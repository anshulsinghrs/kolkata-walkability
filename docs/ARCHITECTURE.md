# Architecture

A more detailed walkthrough of how the pieces fit together.

## Why "static-only"?

GitHub Pages serves files. It does not run code. That constraint shapes
everything in this repo: there is no Express server, no database, no
runtime. All the heavy lifting happens **once, ahead of time**, in the
Python data-processing step. The frontend is a pure consumer of files
written into `frontend/data/`.

This is a feature, not a limitation: it means the site costs nothing to
host, has no maintenance window, and scales for free.

## The flow

```
raw CSV  ─►  process_data.py  ─►  frontend/data/  ─►  GitHub Pages  ─►  Browser
   │             (Python)            (manifest +          (static            │
   │                                   tiles)              host)             │
   │                                                                          │
   └─────────── you (locally) ──────────────► git push ──────────────────────►
```

## The data layer (offline)

`backend/process_data.py` reads the CSV (`lon`, `lat`, `Psw_score`) and
writes three things:

1. **`manifest.json`** — small (~30 KB) JSON listing every tile, its bounds,
   and its point count, plus global statistics. The frontend loads this
   first.
2. **`overview.json`** — a uniformly sampled subset of all points (1 in
   `--overview-step`, default 10). Used for the city-wide low-zoom view so
   the map is populated immediately without fetching dozens of tiles.
3. **`tiles/<col>_<row>.json`** — full-resolution chunks. The bounding box
   of the dataset is divided into a `--grid` × `--grid` grid (default
   16 × 16); each non-empty cell becomes one tile file. For the 73k-point
   demo dataset this produces 122 tiles totalling ~1.7 MB.

Tile files are flat arrays of `[lon, lat, score]` triples — no field names,
no nesting, no per-point overhead. JSON parses faster than expected because
each row is just three numbers.

## The frontend

A vanilla-JS, multi-module static site. Module responsibilities:

| Module | Responsibility |
|--------|----------------|
| `config.js` | Constants only — paths, zoom thresholds, colors |
| `color-scale.js` | PWS score → RGB via interpolation between 7 stops |
| `data-loader.js` | Fetch manifest, overview, and viewport tiles. LRU tile cache |
| `points-layer.js` | Custom Leaflet canvas layer that draws an array of points |
| `map-view.js` | Leaflet instance + basemap switching |
| `ui-controls.js` | DOM wiring: slider, toggles, status pill, stats |
| `app.js` | Orchestration: bootstrap, mode switching, click handler |

Modules expose globals (`window.IAMSM_CONFIG`, `window.DataLoader`, etc.)
rather than using ES modules so that the page works when opened over `file://`
without a build step. If you later want to migrate to React or to ES
modules with a bundler, the same module boundaries map 1-to-1.

### Two rendering modes

The frontend switches between two strategies based on zoom:

- **Overview mode** (zoom ≤ `OVERVIEW_MAX_ZOOM`, default 13). Renders the
  pre-computed sampled file. Loaded once, kept in memory, no fetching as
  you pan.
- **Tile mode** (zoom > 13). On every `moveend`, the data loader computes
  which tiles intersect the current viewport, fetches missing ones in
  parallel, and the renderer redraws using the union of cached tile points.
  An LRU cache (`TILE_CACHE_LIMIT`) bounds memory.

The mode boundary is a configuration choice in `config.js`, not a hard
architectural assumption — you can tune it for different dataset sizes.

### Why a custom canvas layer?

73,000 — let alone 400,000 — DOM elements would freeze the browser. Plotting
the points to a single `<canvas>` element scales linearly with visible
point count, not total point count, because the rendering loop clips against
the viewport. The layer code lives in `points-layer.js` and is ~120 lines.

Alternatives considered:

- `L.circleMarker` with `L.canvas()` renderer — works for ~50k points but
  adds Leaflet overhead per marker
- `Leaflet.heat` — used for the heatmap mode in earlier iterations; great
  for density but loses individual-point inspection
- WebGL via `Leaflet.glify` or MapLibre vector tiles — would scale to
  millions of points but adds dependencies and a build step

The custom canvas layer is the simplest thing that comfortably handles the
target dataset size with no build tooling.

## Extending the system

### Adding more indicators per point

Right now each point is `[lon, lat, score]`. To expose the four sub-indicators
(sidewalk, greenery, streetlight, crowdedness) in the click popup:

1. Update `process_data.py` to include the extra columns in the tile rows.
2. Update the popup HTML in `app.js` (`attachClickHandler`) to read indices
   3, 4, 5, 6 and render a small radar chart (e.g., inline SVG).
3. Optionally update `manifest.json` to declare the indicator schema so the
   frontend can be data-driven.

No core architectural changes required.

### Adding a real backend (e.g., for crowdsourced hazard reports)

When O4 of the research arrives, you'll need a writeable API. GitHub Pages
cannot host that. Options:

- **Vercel / Netlify functions** for lightweight POST endpoints
- **AWS Lambda + API Gateway** if you want to stay close to the planned
  Anthropic stack
- **Supabase / Firebase** for "drop-in" auth + database

In all cases the static frontend in this repo can talk to that API by
fetching from a configured base URL. Add a `BACKEND_URL` to `config.js`,
and add a new module (e.g., `js/hazard-reports.js`) that calls it.

### Migrating to vector tiles (PMTiles)

When the dataset grows past a few million points, the JSON-tile approach
will start to feel slow. The natural upgrade is **PMTiles**: a single-file
vector tile archive served via HTTP range requests, also static-host
friendly. The frontend would switch from Leaflet to MapLibre GL JS. This
is a larger change but the data pipeline stays similar — `tippecanoe`
replaces `process_data.py`'s tile-writing step.
