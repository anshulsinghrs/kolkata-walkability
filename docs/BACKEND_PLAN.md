# Backend plan — FastAPI service

A complete specification of the HTTP surface, internal services,
background jobs, and caching strategy for the Phase 2+ backend.

## Goals

1. Turn an OSM city name into a ready-to-render walkability layer in
   ≤ 60 s cold, ≤ 1.5 s warm.
2. Keep every third-party call (Nominatim, Overpass, Mapillary, Ollama)
   inside the backend; the browser only ever talks to FastAPI.
3. Make every long-running operation a Celery job with a polling
   endpoint, so the frontend never blocks on a request > 30 s.
4. Free + self-hostable: no managed cloud APIs are mandatory.

## Stack

| Concern        | Library / service |
|----------------|-------------------|
| HTTP           | FastAPI 0.115+, Uvicorn |
| Validation     | Pydantic v2 |
| ORM            | SQLAlchemy 2 (async) + GeoAlchemy2 |
| Migrations     | Alembic |
| Queue          | Celery + Redis |
| Cache          | Redis (string + hash + JSON) |
| DB             | PostgreSQL 16 + PostGIS 3 |
| GIS            | OSMnx, GeoPandas, Shapely, NetworkX, Rasterio |
| LLM            | Ollama (Llama 3.1 8B Q4 default) |
| CV             | Ultralytics YOLOv8, Segment Anything (HQ) |
| Tile build     | tippecanoe → PMTiles |

## HTTP surface (v1)

All paths are prefixed `/api/v1`. Responses are JSON unless noted.

### Cities

| Method | Path | Purpose |
|-------:|------|---------|
| GET | `/cities/search?q=<query>&limit=8` | Proxy + cache Nominatim search |
| GET | `/cities/{osm_id}` | Full city record (boundary, area, pop. estimate) |
| GET | `/cities/{osm_id}/boundary` | GeoJSON polygon (multi) |
| GET | `/cities/{osm_id}/network?mode=walk` | GeoJSON FeatureCollection of edges |
| GET | `/cities/{osm_id}/amenities?tags=school,clinic,bus_stop` | Filtered POIs |
| POST | `/cities/{osm_id}/ingest` | Kick off the ingest pipeline (returns `task_id`) |
| GET | `/tasks/{task_id}` | Status polling |

### Scores

| Method | Path | Purpose |
|-------:|------|---------|
| GET | `/cities/{osm_id}/score` | City aggregate + dimension breakdown |
| GET | `/cities/{osm_id}/score/wards` | Per-ward GeoJSON with score |
| GET | `/cities/{osm_id}/score/hex?res=9` | H3 hex GeoJSON |
| POST | `/score/recompute` | Body: `{osm_id, weights}` → recompute with custom weights |

### Time-based accessibility

| Method | Path | Purpose |
|-------:|------|---------|
| GET | `/isochrones?lat=&lon=&minutes=5,10,15&mode=walk` | Multi-ring polygons |
| GET | `/cities/{osm_id}/access-15min` | Per-cell 15-minute-city score |

### Simulation (digital twin)

| Method | Path | Purpose |
|-------:|------|---------|
| POST | `/simulate` | Body: `{osm_id, edits: [{type, geometry}]}` → `{delta_score, affected_cells}` |
| GET | `/simulate/scenarios` | List saved scenarios for current user |
| POST | `/simulate/scenarios` | Persist a scenario |

### AI insights

| Method | Path | Purpose |
|-------:|------|---------|
| POST | `/ai/insights` | Body: `{osm_id, focus?, language?}` → narrative + recommendations |
| POST | `/ai/report` | Generate a PDF planning report (queued Celery task) |

### Audits (crowdsourced)

| Method | Path | Purpose |
|-------:|------|---------|
| POST | `/audits` | Submit a street audit (auth required) |
| GET | `/audits?bbox=` | Visible audits |
| POST | `/audits/{id}/photo` | Multipart upload, virus-scanned, EXIF-stripped |

### Exports

| Method | Path | Purpose |
|-------:|------|---------|
| GET | `/exports/{osm_id}.geojson` | Whole-city GeoJSON |
| GET | `/exports/{osm_id}.shp.zip` | Shapefile bundle |
| GET | `/exports/{osm_id}.csv` | Score table |
| GET | `/exports/{osm_id}/report.pdf` | Pre-rendered PDF report |

## Internal services

```
routers/  →  services/  →  db/, redis, celery
```

- `services/nominatim.py`: thin wrapper, rate-limited to 1 req/s per the
  Nominatim policy, results cached 30 days in Redis.
- `services/osmnx_pipeline.py`: `graph_from_place`, `geocode_to_gdf`,
  `features_from_place` — projected to local UTM, pickled to disk + Redis.
- `services/score_engine.py`: pure-function scoring. See
  [`GIS_PIPELINE.md`](GIS_PIPELINE.md).
- `services/isochrones.py`: NetworkX `ego_graph` with edge weight =
  length / walk speed (1.34 m/s), polygonised with `alpha_shape`.
- `services/ollama_client.py`: `httpx` async client to the Ollama
  sidecar; prompts are templated in `app/prompts/`.
- `services/cv_inference.py`: YOLOv8 + SAM model registry, GPU-aware.

## Background jobs (Celery)

| Task | Trigger | Idempotency key |
|------|---------|-----------------|
| `ingest_city(osm_id)` | `POST /cities/{id}/ingest` | `osm_id` |
| `compute_scores(osm_id, weights_hash)` | After ingest, or on `/score/recompute` | `(osm_id, weights_hash)` |
| `run_cv(city_id, bbox)` | Manual / cron | `(city_id, h3)` |
| `generate_tiles(osm_id)` | After scoring | `osm_id` |
| `build_report(osm_id, user_id)` | `POST /ai/report` | `task_id` |

Result backend: PostgreSQL (so results survive Redis restarts).

## Caching strategy

| Layer | Key shape | TTL |
|-------|-----------|-----|
| Nominatim | `nominatim:{sha1(q)}` | 30 d |
| OSMnx graph | `osmnx:graph:{osm_id}:{mode}` (pickle blob on disk) | until invalidated |
| Score | `score:{osm_id}:{weights_hash}` | 7 d, busted on edit |
| Isochrone | `iso:{lat:.4f},{lon:.4f}:{mins}:{mode}` | 1 d |
| LLM response | `ai:{osm_id}:{prompt_hash}` | 30 d |

All cache writes go through `app/utils/cache.py` so we can swap Redis
for Valkey or a Cloudflare KV later without touching call sites.

## Rate limits + abuse

- Anonymous: 60 req/min/IP (sliding window via Redis).
- Authenticated: 600 req/min.
- Heavy endpoints (`/cities/{id}/ingest`, `/ai/insights`,
  `/ai/report`): 5 req/min/user.

## Auth (Phase 8)

- Email-magic-link sign-in via Supabase or self-hosted PostgREST+JWT.
- Roles: `anon`, `user`, `auditor`, `planner`, `admin`. Permission
  matrix in `app/auth/policies.py`.

## Observability

- `/health`, `/ready`, `/metrics` (Prometheus exposition).
- Structured JSON logs (orjson, request-id middleware).
- Optional OpenTelemetry → Tempo / Jaeger.

## Local dev

```bash
docker compose -f infra/docker-compose.yml up
# api → http://localhost:8000/docs
# ollama → http://localhost:11434
# postgres → localhost:5432
# redis → localhost:6379
```

`make seed-city CITY=Delhi` runs the bootstrap script + the ingest job
end-to-end for a chosen city, useful for first-time setup.
