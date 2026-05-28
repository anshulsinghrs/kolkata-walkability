# Roadmap

UrbanPulse is being delivered in eight phases. Phase 1 (this branch)
ships the rebrand + dynamic city search. Phases 2–8 are scoped here so
contributors can pick up coherent chunks of work.

| Phase | Theme | Status |
|------:|-------|--------|
| 1 | Rebrand + Nominatim global city search + remove Kolkata hardcoding | **Done — this branch** |
| 2 | FastAPI backend skeleton + OSMnx city pipelines | Designed |
| 3 | Walkability score engine (5 dimensions, 3 spatial scales) | Designed |
| 4 | React + Vite + TS rewrite (MapLibre + deck.gl) | Designed |
| 5 | AI insights (Ollama) + isochrone / 15-minute-city analysis | Designed |
| 6 | Street-view + computer vision (Mapillary + YOLO + SAM) | Designed |
| 7 | Digital twin simulator + 3D city + sunlight analysis | Designed |
| 8 | PWA + crowdsourced audits + government dashboard | Designed |

---

## Phase 1 — Foundation (this branch)

**Deliverables**

- [x] Rebrand internal globals (`URBANPULSE_CONFIG`, CSS classes, panes).
- [x] Rebrand user-facing copy (title, meta, header, eyebrow, footer, methodology).
- [x] Add Nominatim search bar — debounced, abortable, keyboard-accessible.
- [x] Make the pre-baked manifest **optional** so the app boots without
      any Kolkata-specific data.
- [x] Default map view → world view (`[20, 10]`, zoom 3).
- [x] Update `backend/process_data.py` banner + argparse description.
- [x] Architecture, folder-structure, backend plan, GIS pipeline, DB
      schema, UI redesign, dependencies, migration docs.

**Exit criteria**

- Open the live site → search "Tokyo" → map flies to Tokyo's OSM bbox.
- No JS errors in the console when `frontend/data/` is empty.
- All existing features (upload, weights, export, 3D / VR) work unchanged.

---

## Phase 2 — FastAPI + OSMnx pipelines

**Deliverables**

- `backend/api/` FastAPI project with Pydantic models + OpenAPI docs.
- Endpoints (full schema in [`BACKEND_PLAN.md`](BACKEND_PLAN.md)):
  - `GET /api/v1/cities/search?q=` (proxies Nominatim + caches in Redis)
  - `GET /api/v1/cities/{osm_id}/boundary` (OSMnx `geocode_to_gdf`)
  - `GET /api/v1/cities/{osm_id}/network?modes=walk` (OSMnx `graph_from_place`)
  - `GET /api/v1/cities/{osm_id}/amenities?tags=...`
  - `GET /api/v1/cities/{osm_id}/score` (city-level summary)
- Celery worker for the long jobs, Redis broker.
- Docker Compose: `api`, `worker`, `postgres`, `redis`.
- Caching: graph extracts pickled per OSM relation id; TTL 30 days.

**Exit criteria**

- `curl /api/v1/cities/search?q=Delhi` returns ≤ 200ms (warm cache).
- `curl /api/v1/cities/<id>/network` returns a GeoJSON FeatureCollection
  for the road network within 60s for a metropolitan area.

---

## Phase 3 — Walkability score engine

**Five dimensions** (see [`GIS_PIPELINE.md`](GIS_PIPELINE.md)):

| Dimension | Inputs |
|-----------|--------|
| Connectivity | intersection density, average block size, network density (km/km²) |
| Pedestrian infrastructure | sidewalk coverage, crossing density, traffic-calming features |
| Accessibility | walk-time to schools, healthcare, transit, shops, parks |
| Safety | streetlight density, road-class mix, OSM accident proxies |
| Environment | tree cover (OSM `natural=tree`, `landuse=forest`), shade proxy, AQI (overlay) |

Each dimension produces a 0–100 score per spatial unit. Final score is
the L1-normalised weighted sum — weights editable per session and
persistable per user.

**Spatial scales** computed: H3 hex (resolution 9), administrative ward
(when OSM has `admin_level=10`), city aggregate.

**Output**: `scores` table (see [`DB_SCHEMA.md`](DB_SCHEMA.md)) + vector
tiles via `tippecanoe` / PMTiles.

---

## Phase 4 — React + Vite + TS rewrite

Replace the vanilla JS site with a typed SPA, **without** breaking the
research overlay. See [`UI_REDESIGN.md`](UI_REDESIGN.md) for screens and
component breakdown, and [`MIGRATION.md`](MIGRATION.md) for the step-by-
step path.

**Highlights**

- MapLibre GL JS replaces Leaflet.
- deck.gl `H3HexagonLayer` for the walkability heatmap, `LineLayer` for
  the road network, `GeoJsonLayer` for amenities.
- Zustand store mirrors the current globals 1-to-1.
- Tailwind for styling, plus a tiny design-system file for tokens.

---

## Phase 5 — AI insights + 15-minute-city analysis

- Ollama runs locally inside the Docker stack hosting a quantised Llama
  3.1 8B (or Mistral 7B).
- The `/api/v1/ai/insights` endpoint composes a prompt from the current
  city's score breakdown + amenities + connectivity metrics and asks
  the LLM for: (a) plain-English problems, (b) ranked recommendations,
  (c) similar cities.
- Isochrone endpoint: `GET /api/v1/isochrones?lat=&lon=&minutes=5,10,15`
  using NetworkX `ego_graph` over the OSMnx walk network.

---

## Phase 6 — Computer vision

- Mapillary (free, OSM-aligned) for street-level imagery; fall back to
  KartaView where Mapillary coverage is sparse.
- YOLOv8 fine-tuned on the **Cityscapes-Pedestrian** + **Mapillary
  Vistas** subsets to detect: sidewalk, pedestrian crossing, traffic
  light, street light, tree, pole, parked vehicle (encroachment).
- Segment Anything for fine sidewalk extents.
- Detections are written to PostGIS as point features with class +
  confidence; the frontend exposes a "CV layer" toggle.

---

## Phase 7 — Digital twin + 3D

- "Simulate" mode in the React UI: draw a new sidewalk / cycle lane /
  pedestrian street → POST GeoJSON → backend re-runs the affected H3
  cells through the score engine → returns a delta.
- deck.gl `Tile3DLayer` for 3D buildings (OSM `building:height` /
  `building:levels` × 3 m fallback).
- Optional Cesium integration for terrain + sunlight analysis.

---

## Phase 8 — PWA, crowdsourcing, government dashboard

- Service Worker + Web App Manifest for installable / offline use.
- GPS audit mode: tap a point, rate sidewalk / safety / accessibility,
  optionally attach a photo; POSTed to `/api/v1/audits`.
- Government dashboard: a separate `/admin` SPA route with ward
  rankings, district comparison, SDG metrics, accessibility reports.
- Supabase as a drop-in auth + storage layer for the photo uploads,
  if self-hosting Postgres + S3 is too heavy.

---

## Cross-cutting concerns

- **Modularity**: every module has a single responsibility and a typed
  contract.
- **Performance**: vector tiles + H3 indexing + Redis cache make the
  city-search-to-render path < 1.5s on a warm cache.
- **Open source**: every dependency above has a permissive (MIT / BSD /
  Apache) or compatible (ODbL for OSM) license.
- **Self-hostable**: the entire stack runs in `docker compose up`. No
  cloud services are mandatory.
