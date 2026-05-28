# Dependencies

Curated dependency list for each phase. **Every dependency is free**
and either MIT / BSD / Apache-2 / similar permissive licensed, or
ODbL-compatible (for the OSM data layer).

## Frontend (Phase 4+)

### Runtime

| Package | License | Purpose |
|---------|---------|---------|
| `react` ^18 | MIT | Component model |
| `react-dom` ^18 | MIT | DOM renderer |
| `react-router-dom` ^6 | MIT | Routes |
| `zustand` ^4 | MIT | Local state |
| `@tanstack/react-query` ^5 | MIT | Server-state cache |
| `maplibre-gl` ^4 | BSD-3 | Vector map |
| `deck.gl` ^9 | MIT | GL overlays (hex, 3D, isochrone) |
| `@deck.gl/geo-layers` ^9 | MIT | H3HexagonLayer, TileLayer |
| `pmtiles` ^3 | BSD-3 | PMTiles archive reader |
| `h3-js` ^4 | Apache-2 | H3 in browser |
| `papaparse` ^5 | MIT | CSV streaming |
| `togeojson` ^0.16 | ISC | KML / GPX → GeoJSON |
| `clsx` ^2 | MIT | className helper |
| `tailwindcss` ^3 | MIT | Styling |
| `lucide-react` ^0.4 | ISC | Icons |
| `idb-keyval` ^6 | Apache-2 | IndexedDB cache for offline tiles |
| `workbox-window` ^7 | MIT | PWA service worker glue |

### Dev / build

| Package | License | Purpose |
|---------|---------|---------|
| `vite` ^5 | MIT | Build tool |
| `typescript` ^5 | Apache-2 | Type checking |
| `@vitejs/plugin-react` ^4 | MIT | Fast Refresh |
| `vite-plugin-pwa` ^0.20 | MIT | PWA tooling |
| `vitest` ^1 | MIT | Unit tests |
| `@testing-library/react` ^15 | MIT | Component tests |
| `playwright` ^1.45 | Apache-2 | E2E + visual regression |
| `eslint` ^9 | MIT | Linting |
| `prettier` ^3 | MIT | Formatting |
| `openapi-typescript` ^7 | MIT | Typed API client from OpenAPI |

## Backend (Phase 2+)

### API + framework

| Package | License | Purpose |
|---------|---------|---------|
| `fastapi` ^0.115 | MIT | HTTP framework |
| `uvicorn[standard]` ^0.30 | BSD-3 | ASGI server |
| `pydantic` ^2 | MIT | Validation |
| `pydantic-settings` ^2 | MIT | Env config |
| `httpx` ^0.27 | BSD-3 | Outbound HTTP (Nominatim, Ollama, Mapillary) |
| `orjson` ^3 | MIT/Apache-2 | Fast JSON |
| `python-multipart` ^0.0.9 | Apache-2 | File uploads |
| `slowapi` ^0.1 | MIT | Rate limiting |
| `prometheus-fastapi-instrumentator` ^7 | ISC | Metrics |

### Persistence

| Package | License | Purpose |
|---------|---------|---------|
| `sqlalchemy` ^2 | MIT | ORM |
| `geoalchemy2` ^0.15 | MIT | PostGIS types |
| `asyncpg` ^0.29 | Apache-2 | Async Postgres driver |
| `alembic` ^1.13 | MIT | Migrations |
| `redis` ^5 | MIT | Cache + queue broker |

### Queue

| Package | License | Purpose |
|---------|---------|---------|
| `celery[redis]` ^5 | BSD-3 | Background jobs |
| `flower` ^2 | BSD-3 | Queue dashboard |

### GIS

| Package | License | Purpose |
|---------|---------|---------|
| `osmnx` ^2 | MIT | OSM → NetworkX graphs |
| `geopandas` ^1 | BSD-3 | DataFrames with geometry |
| `shapely` ^2 | BSD-3 | Geometry ops |
| `networkx` ^3 | BSD-3 | Graph algorithms |
| `pyproj` ^3.6 | MIT | Projections |
| `rasterio` ^1.3 | BSD-3 | Raster I/O (DEM, AQI) |
| `h3` ^4 | Apache-2 | H3 hex tessellation |
| `pyogrio` ^0.9 | MIT | Fast OGR I/O |
| `mapbox-vector-tile` ^2 | BSD-3 | Tile decoding |

### Tile build

| Tool | License | Purpose |
|------|---------|---------|
| `tippecanoe` | BSD-2 | GeoJSON → MBTiles / PMTiles |
| `pmtiles` CLI | BSD-3 | MBTiles → PMTiles conversion |

### AI

| Package | License | Purpose |
|---------|---------|---------|
| `ollama` server | MIT | Local LLM runtime |
| `ultralytics` ^8 | AGPL-3 ¹ | YOLOv8 detection |
| `segment-anything` (Meta) | Apache-2 | SAM segmentation |
| `pillow` ^10 | MIT-CMU | Image I/O |
| `opencv-python-headless` ^4 | Apache-2 | Image preprocessing |
| `torch` ^2.3 + `torchvision` | BSD-3 | CV runtime |

> ¹ **Ultralytics is AGPL-3.** If that's incompatible with downstream
> licensing, swap for `mmdetection` (Apache-2) or train a custom YOLO
> on the Cityscapes dataset and use a permissive fork (e.g. `yolov5`
> mirror under AGPL-3 → consider `damo-yolo` Apache-2).

### Dev / test

| Package | License | Purpose |
|---------|---------|---------|
| `pytest` ^8 | MIT | Tests |
| `pytest-asyncio` ^0.23 | Apache-2 | Async tests |
| `pytest-postgresql` ^6 | LGPL-3 ² | DB fixtures |
| `ruff` ^0.5 | MIT | Lint + format |
| `mypy` ^1.10 | MIT | Type checking |
| `factory-boy` ^3.3 | MIT | Test data |

> ² LGPL-3 used only as a dev fixture, not redistributed.

## Infrastructure

| Service | License | Purpose |
|---------|---------|---------|
| PostgreSQL 16 | PostgreSQL License | DB |
| PostGIS 3 | GPL-2 (server) | Spatial extension |
| Redis 7 | BSD-3 (≤7.2) ³ | Cache + queue |
| Ollama | MIT | LLM runtime |
| NGINX | BSD-2 | Reverse proxy |
| MinIO (optional) | AGPL-3 ⁴ | S3-compatible object store for photos |

> ³ Redis 7.4+ changes its license; pin to 7.2 or migrate to **Valkey**
> (BSD-3 fork) for unambiguous open source.
> ⁴ AGPL applies if MinIO is offered as a service; for internal use it's
> fine. Alternative: SeaweedFS (Apache-2) or self-host S3 on Garage
> (AGPL-3).

## Data sources

| Source | License | Use |
|--------|---------|-----|
| OpenStreetMap (Nominatim, Overpass) | ODbL | Geocoding, roads, amenities |
| GHSL (JRC) | Free, attribution required | Population grid |
| OpenAQ | CC-BY-4.0 | Air-quality overlay |
| Mapillary (Meta) | CC-BY-SA-4.0 | Street-level imagery |
| KartaView | CC-BY-SA-4.0 | Street-level imagery (fallback) |
| Copernicus DEM | Free | Terrain (Phase 7) |

## License compatibility matrix (high level)

- **App code**: MIT. Compatible with every dependency above except AGPL.
- **AGPL caveat**: if the platform is offered as a SaaS, AGPL components
  (Ultralytics, MinIO) force the entire server to be open-sourced too.
  For an open-source project that's fine; for a hosted offering, swap
  these.
- **OSM data** is ODbL — derivative databases must be shared under the
  same terms. We publish PMTiles + score tables with the same ODbL
  notice.
