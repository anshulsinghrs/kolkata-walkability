# Architecture

UrbanPulse is being delivered in phases. This document describes both the
**current** architecture (post-Phase-1 rebrand) and the **target**
architecture once the FastAPI + PostGIS + AI stack lands.

---

## 1. Current architecture (Phase 1)

```
                ┌──────────────────────────────────────────────┐
                │              Browser                         │
                │                                              │
                │   index.html   ── loads ──►   js/app.js      │
                │       │                          │           │
                │       │                          │ uses      │
                │       │                          ▼           │
                │       │   ┌──── CitySearch ────────────┐     │
                │       │   │ Nominatim (OSM) live HTTP  │     │
                │       │   └────────────────────────────┘     │
                │       │                                      │
                │       │   ┌──── MapView (Leaflet) ─────┐     │
                │       │   │ 5 basemaps (CARTO, OSM,    │     │
                │       │   │ Esri, OpenTopo)            │     │
                │       │   └────────────────────────────┘     │
                │       │                                      │
                │       │   ┌──── DataLoader ────────────┐     │
                │       │   │ Optional manifest + tiles  │     │
                │       │   │ (fallback OK if missing)   │     │
                │       │   └────────────────────────────┘     │
                │       │                                      │
                │       │   ┌──── UploadLayer ───────────┐     │
                │       │   │ PapaParse CSV / GeoJSON    │     │
                │       │   │ Points / Heatmap / Cluster │     │
                │       │   └────────────────────────────┘     │
                └──────────────────────────────────────────────┘
                                  ▲
                                  │ static files only
                                  │
                ┌──────────────────────────────────────────────┐
                │              GitHub Pages (CDN)              │
                │  frontend/index.html, js/, css/, data/?      │
                └──────────────────────────────────────────────┘
```

### Why static-only (still)?

GitHub Pages serves files. It does not run code. That constraint shaped
Phase 1: the platform must boot, search any city, and accept user data
**without any backend at all**. We do that by using Nominatim for the
geocoder (free, no key, browser-side) and by treating the legacy
research-dataset (`frontend/data/manifest.json`) as **optional**.

### The flow today

1. User opens the site → `app.js` builds the Leaflet map, wires the
   sidebar, and binds the Nominatim search box.
2. User types a city → `CitySearch` calls Nominatim, renders a dropdown,
   and on selection fires a `place` event with `{center, bbox, name}`.
3. `app.js` listens, fits the map to `place.bbox`.
4. (Optional) `DataLoader.loadManifest()` tries to fetch
   `data/manifest.json`. If absent (HTTP 404 or fetch error), the app
   stays in "ready" state with no research overlay. If present, the
   existing tile-based renderer kicks in unchanged.
5. The user can upload a CSV / GeoJSON / KML at any time, recompute
   walkability with the indicator-weight sliders, export the result, and
   optionally explore points in 3D / VR.

### Frontend module map

| Module           | Responsibility |
|------------------|----------------|
| `config.js`      | Brand strings, geocoder config, paths, map defaults |
| `city-search.js` | Nominatim integration + dropdown UI binding |
| `color-scale.js` | Score → RGB via 7 gradient stops |
| `data-loader.js` | Optional manifest + viewport-based tile fetcher |
| `points-layer.js`| Custom Leaflet canvas overlay (scales to 400k pts) |
| `map-view.js`    | Leaflet instance + basemap switching |
| `csv-loader.js`  | PapaParse streaming + column detection + GeoJSON / KML |
| `upload-layer.js`| Renders uploaded data as Points / Heatmap / Cluster |
| `weights.js`     | L1-normalised indicator-weight recomputation |
| `detail-drawer.js`| Side-panel point inspector |
| `export.js`      | GeoJSON / CSV / PNG export |
| `three-scene.js` | Three.js 3D landscape + WebXR |
| `ui-controls.js` | Sidebar DOM wiring (tabs, sliders, status pill) |
| `app.js`         | Bootstrap + orchestration |

Modules expose globals (`window.URBANPULSE_CONFIG`, `window.DataLoader`, …)
rather than using ES modules so the page works without a build step.

---

## 2. Target architecture (Phase 2+)

```
                ┌─────────────────────────────────────────────────┐
                │                     Browser                     │
                │                                                 │
                │  React + Vite + TS                              │
                │   ├─ Tailwind UI                                │
                │   ├─ MapLibre GL JS  (vector tiles, PMTiles)    │
                │   ├─ deck.gl         (3D, layered analytics)    │
                │   ├─ Zustand         (state)                    │
                │   └─ Service Worker  (PWA, offline cache)       │
                └──────────────┬──────────────────────┬───────────┘
                               │                      │
                               │  HTTPS (REST + WS)   │  static assets
                               ▼                      ▼
            ┌──────────────────────────────┐ ┌────────────────────┐
            │     FastAPI backend          │ │   CDN (Pages /     │
            │  /api/v1                     │ │   Cloudflare)      │
            │   ├─ /cities/search          │ │  • SPA bundle      │
            │   ├─ /cities/{id}/boundary   │ │  • PMTiles         │
            │   ├─ /cities/{id}/network    │ │  • Icons / fonts   │
            │   ├─ /cities/{id}/score      │ └────────────────────┘
            │   ├─ /isochrones             │
            │   ├─ /simulate (digital twin)│
            │   ├─ /ai/insights            │
            │   └─ /audits  (POST)         │
            └────────────┬──────┬──────────┘
                         │      │
       ┌─────────────────┘      └───────────────────────────┐
       ▼                                                    ▼
┌──────────────────┐  Celery + Redis  ┌──────────────────────────────┐
│ PostgreSQL +     │ ◄──────────────► │ Worker pool                  │
│   PostGIS        │                  │  • OSMnx pipelines           │
│   ├─ cities      │                  │  • NetworkX scoring          │
│   ├─ networks    │                  │  • Isochrones (NetworkX)     │
│   ├─ amenities   │                  │  • Ollama LLM insights       │
│   ├─ scores      │                  │  • YOLO / SAM on Mapillary   │
│   ├─ audits      │                  │  • Tile pre-generation       │
│   └─ users       │                  └──────────────────────────────┘
└──────────────────┘
```

### Key services

- **FastAPI** for the HTTP API — async, typed via Pydantic, OpenAPI for free.
- **Celery + Redis** for long jobs (OSMnx downloads, scoring, CV).
- **PostgreSQL + PostGIS** for canonical storage of cities, road networks,
  amenities, computed scores, crowdsourced audits.
- **Ollama** hosts an open-weights LLM (e.g. Llama 3 / Mistral) for
  natural-language city insights and report generation.
- **MapLibre + PMTiles** replace the per-tile JSON files; vector tiles
  scale to nation-level datasets without a tile server.

### Boundaries between services

- The frontend never talks to OSMnx, Mapillary, or Ollama directly.
  All third-party + heavy GIS calls are mediated by FastAPI.
- The browser ↔ backend contract is OpenAPI-described; the React app
  generates a typed client.
- The PostgreSQL writes are gated by FastAPI; no client-side writes.

A detailed data flow is in [`GIS_PIPELINE.md`](GIS_PIPELINE.md), and the
exact endpoints are in [`BACKEND_PLAN.md`](BACKEND_PLAN.md).

---

## 3. Migration boundary

Phase 1 ships in vanilla JS to **avoid coupling** the rebrand and the
React rewrite. The state shape on the page (current city, current layer
toggles, weights) maps 1-to-1 onto a Zustand store, so the rewrite can
proceed module-by-module without breaking the live site. See
[`MIGRATION.md`](MIGRATION.md).
