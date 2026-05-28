# UrbanPulse

> **Global urban walkability & mobility intelligence — open-source, OpenStreetMap-driven, AI-ready.**

UrbanPulse is an open-source platform for analysing the walkability of **any
city in the world**. Search a place, load OpenStreetMap data, recompute
walkability under your own indicator weights, layer your own observations,
and export the results — all without an API key.

The project began life as the *Kolkata Walkability Atlas*, a PhD research
artefact at IIT Kharagpur. It is now being generalised into a city-agnostic
platform with a dynamic geocoder, OSM-backed analytics, and an upgrade path
to a full FastAPI + PostGIS + AI stack.

> **Status — Phase 1 (this branch)**
> Rebrand to a city-agnostic platform · Nominatim global city search ·
> Manifest is now optional · Kolkata-specific hardcoding removed.
> Phase 2 (FastAPI + OSMnx + walkability engine) and beyond are scoped in
> [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## What the live site does today

Open the app, type **any city, district, or area** into the search bar in
the top-left, pick a result, and the map flies to its OSM bounding box.
From there you can:

- Switch between **5 basemaps** (Dark, Positron, OSM, Satellite, Topo).
- **Upload** a CSV, GeoJSON, or KML file — points are streamed in by
  PapaParse and rendered as points, a weighted heatmap, or clusters.
- **Recompute walkability** live with sliders for sidewalk, greenery,
  lighting, crowdedness, and crossing safety (L1-normalised weights).
- **Filter by score**, swap colour gradients (walkability / viridis /
  magma / plasma / ice), and click points to inspect them.
- **Export** to GeoJSON, CSV, or a PNG snapshot of the composite map.
- Optionally view points as a **3D landscape** (Three.js) and, on a
  supported device, enter **WebXR / VR**.

If a pre-baked research dataset (the old IIT Kgp PWS tiles) is present at
`frontend/data/`, it is rendered automatically on top — but the platform
no longer requires it.

---

## What's next (planning deliverables in `docs/`)

Phase 1 ships the rebrand and dynamic-search foundation. The architecture
for the full smart-city stack is documented here, alongside a step-by-step
migration plan:

| Document | What it covers |
|----------|----------------|
| [`docs/ROADMAP.md`](docs/ROADMAP.md)            | Phased delivery plan (Phase 1 → Phase 8) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)  | System architecture — current + target |
| [`docs/FOLDER_STRUCTURE.md`](docs/FOLDER_STRUCTURE.md) | Target monorepo layout |
| [`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md)  | FastAPI service design, endpoints, OSMnx pipeline |
| [`docs/GIS_PIPELINE.md`](docs/GIS_PIPELINE.md)  | Boundary → OSM → network → scoring data flow |
| [`docs/DB_SCHEMA.md`](docs/DB_SCHEMA.md)        | PostgreSQL + PostGIS schema |
| [`docs/UI_REDESIGN.md`](docs/UI_REDESIGN.md)    | Proposed React + MapLibre + deck.gl UI |
| [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md)  | Suggested frontend / backend / GIS / AI dependencies |
| [`docs/MIGRATION.md`](docs/MIGRATION.md)        | Step-by-step migration from the current vanilla-JS app |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)      | Static-frontend + future backend deployment |

---

## Repository structure (current)

```
.
├── frontend/                  # Static site — what gets deployed to GitHub Pages
│   ├── index.html             # Entry HTML
│   ├── css/style.css          # All styling (dark dashboard theme)
│   ├── js/
│   │   ├── config.js          # Brand, paths, defaults, geocoder constants
│   │   ├── city-search.js     # Nominatim global search (Phase-1)
│   │   ├── color-scale.js     # Score → RGB mapping
│   │   ├── data-loader.js     # Optional manifest + viewport-based tiles
│   │   ├── points-layer.js    # Custom Leaflet canvas overlay
│   │   ├── map-view.js        # Leaflet map + basemaps
│   │   ├── csv-loader.js      # PapaParse + GeoJSON / KML normalisation
│   │   ├── upload-layer.js    # User-uploaded data renderer
│   │   ├── weights.js         # Indicator-weight recomputation
│   │   ├── detail-drawer.js   # Point-inspector side panel
│   │   ├── export.js          # GeoJSON / CSV / PNG export
│   │   ├── three-scene.js     # 3D / WebXR mode
│   │   ├── ui-controls.js     # Sidebar wiring
│   │   └── app.js             # Bootstrap / orchestration
│   └── data/                  # (Optional) pre-baked tile dataset
│
├── backend/                   # Offline data-processing scripts (Python)
│   ├── process_data.py        # CSV → tiles + manifest
│   └── requirements.txt
│
├── docs/                      # Planning & operational docs
├── .github/workflows/         # GitHub Actions (Pages deploy)
└── README.md
```

The target structure once Phase 2+ lands is in
[`docs/FOLDER_STRUCTURE.md`](docs/FOLDER_STRUCTURE.md).

---

## Quick start

### 1. Run the frontend locally

The site needs `fetch()` over `http://`, so use any static server:

```bash
cd frontend
python -m http.server 8000
```

Open <http://localhost:8000>, type a city into the search bar in the top
left, and pick a result.

### 2. (Optional) Generate the legacy research-dataset tiles

```bash
cd backend
pip install -r requirements.txt
python process_data.py --input /path/to/aggregated_pixel_ratios.csv
```

This writes `frontend/data/manifest.json` + tiles. The frontend will pick
them up automatically.

### 3. Deploy to GitHub Pages

Push to `main`. The workflow in `.github/workflows/deploy.yml` deploys
`frontend/` to GitHub Pages on every push.

Full deployment walkthrough: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Tech stack

| Layer            | Current (Phase 1)                                | Target (Phase 2+)                                  |
|------------------|--------------------------------------------------|---------------------------------------------------|
| Frontend         | Vanilla JS · Leaflet · PapaParse · Three.js      | React · Vite · TypeScript · Tailwind · MapLibre GL · deck.gl · Zustand |
| Geocoder         | OSM Nominatim                                    | Nominatim (+ optional Photon fallback)            |
| Map              | Leaflet (raster tiles)                           | MapLibre GL JS (vector tiles, PMTiles)            |
| Backend          | One-shot Python script                           | FastAPI · Celery · Redis                          |
| GIS              | pandas                                           | OSMnx · GeoPandas · NetworkX · Rasterio · Shapely |
| Database         | (none — static files)                            | PostgreSQL · PostGIS                              |
| AI               | (none)                                           | Ollama (LLM insights) · YOLOv8 · Segment Anything |
| Computer vision  | (none)                                           | Mapillary / KartaView + segmentation models       |
| Mobile           | Responsive web                                   | Installable PWA · GPS · offline-capable           |
| Hosting          | GitHub Pages (frontend)                          | GitHub Pages frontend · Railway / Render / VPS backend |

---

## Contributing

Open issues and pull requests are welcome. Priority areas:

1. The FastAPI service skeleton (see `docs/BACKEND_PLAN.md`)
2. The React + MapLibre rewrite (see `docs/UI_REDESIGN.md`)
3. OSMnx city pipelines (see `docs/GIS_PIPELINE.md`)

---

## License

- **Code:** MIT
- **OpenStreetMap data:** © OpenStreetMap contributors,
  [Open Database License](https://www.openstreetmap.org/copyright)
- **Original research dataset (Kolkata PWS):** please cite the underlying
  PhD work at IIT Kharagpur if you reuse it.
