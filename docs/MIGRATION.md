# Migration plan

Step-by-step migration from the current vanilla-JS site (Phase 1) to
the target React + FastAPI + PostGIS stack (Phase 2+). Each step is
shippable on its own — at no point does the live site break.

## Principles

1. **Never break the live site.** Every step ends with a working
   deploy.
2. **Coarse rewrite paths are blocked. Always migrate one module at a
   time.** When something would need to change in lockstep, use a
   compatibility shim instead.
3. **Optional everything.** If a backend isn't deployed yet, the
   frontend gracefully falls back to client-only behaviour (Nominatim
   directly, no OSMnx layer).
4. **Same UX, then better UX.** Don't redesign and re-implement at the
   same time.

## Step 0 — Phase 1 (DONE on this branch)

- Rebrand internal config + user-facing copy.
- Add `js/city-search.js` (Nominatim).
- Make the manifest optional.
- Add all planning docs in `docs/`.
- Deploy to GitHub Pages (no infrastructure change).

## Step 1 — FastAPI skeleton (1 sprint)

1. Create `api/` directory next to `frontend/`.
2. Scaffold a minimal FastAPI service:
   - `GET /health` → `{"status": "ok"}`
   - `GET /api/v1/cities/search?q=` → proxies + caches Nominatim.
3. Add `infra/docker-compose.yml` with `api`, `postgres`, `redis`.
4. Deploy to Railway / Render with a public URL.
5. **Frontend change**: in `frontend/js/city-search.js`, switch from
   calling Nominatim directly to calling the new backend
   `/api/v1/cities/search` **when** a `BACKEND_URL` is configured in
   `config.js`. Default: keep calling Nominatim. **No breaking change.**

Exit: same UX as Phase 1, but the search now has server-side caching
when configured.

## Step 2 — OSMnx boundary + network endpoints (1 sprint)

1. Implement `GET /api/v1/cities/{osm_id}/boundary` and
   `/network`. Both kick off Celery tasks on cold miss.
2. Add a `Network` toggle in the Layers tab of the existing UI.
3. When a city is selected, the frontend (still vanilla JS) calls the
   network endpoint, receives a GeoJSON FeatureCollection, and draws it
   on Leaflet with `L.geoJSON`.

Exit: user searches "Lisbon" → sees walkable road network rendered.

## Step 3 — H3 + walkability score engine (2 sprints)

1. Implement steps 5–7 of [`GIS_PIPELINE.md`](GIS_PIPELINE.md):
   tessellate, score, aggregate.
2. Implement `GET /cities/{osm_id}/score/hex?res=9`.
3. Add a `Walkability` toggle in the Layers tab.
4. Frontend draws the H3 polygons coloured by score using
   `L.geoJSON` + the existing color scale.

Exit: user sees a walkability heatmap for any city they search.

## Step 4 — Tile pipeline (1 sprint)

1. Add `gis/scripts/generate_pmtiles.py` and a Celery task that calls
   tippecanoe.
2. Publish PMTiles to the CDN (under `/tiles/{osm_id}.pmtiles`).
3. **Frontend swap**: start a new `web/` workspace with Vite + React,
   embed MapLibre, render the PMTiles archive. The existing
   `frontend/` keeps working for everything else.

This is the **first React commit** — but it doesn't replace the live
site yet; we deploy it under `/v2` initially.

## Step 5 — React rewrite, panel by panel (3–4 sprints)

For each panel in the current sidebar, port to React in this order:

1. **Layers tab** — toggle the PMTiles + Leaflet basemaps in MapLibre.
2. **Weights tab** — Zustand store + sliders; calls
   `POST /score/recompute` for the H3 PMTiles to be regenerated.
3. **Data tab** — Dropzone, PapaParse, render uploaded points via a
   deck.gl `ScatterplotLayer`.
4. **Export tab** — Browser-side GeoJSON / CSV + a server-side PDF.
5. **3D tab** — replace Three.js with deck.gl `Tile3DLayer` for the
   buildings, keep the Three.js scene as an "avatar mode" if desired.

When all panels are ported, flip `/v2` to the root and redirect the
old site to it.

## Step 6 — AI insights (1 sprint)

1. Add Ollama as a sidecar in `docker-compose.yml`.
2. Implement `POST /api/v1/ai/insights`.
3. Add the AI tab in the right inspector of the React UI.

## Step 7 — Computer vision (2–3 sprints, optional)

1. Implement `services/mapillary.py` + `services/cv_inference.py`.
2. Celery task `run_cv` populates `cv_detections`.
3. Add a "CV layer" toggle.

## Step 8 — PWA + audits + government dashboard (2 sprints)

1. Add `vite-plugin-pwa`, write the service worker, ship a Web App
   Manifest.
2. Implement `POST /api/v1/audits` + the React audit form.
3. Implement the `/admin` dashboard route with ward rankings.

## Compatibility shims used along the way

- **`BACKEND_URL`** in `config.js` — the vanilla JS site uses it when
  set, falls back to Nominatim otherwise. Allows steps 1–3 to ship
  without forcing every visitor onto the backend.
- **PMTiles served from the static CDN** — even before the FastAPI
  service is reachable for every user, the React app can render the
  walkability layer from `/tiles/<osm_id>.pmtiles` if the file exists.
- **A legacy Leaflet island** inside the React app (Step 5) lets us
  ship the React shell before every panel is migrated.

## Risk register

| Risk | Mitigation |
|------|------------|
| Nominatim rate limits hit during testing | Server-side cache; fall back to Photon |
| OSMnx graph too large for memory on small server | Switch to `walk_basic`, paginate by bbox |
| PostGIS migrations break on small DBs | Add a "lite" deploy without H3 extension; pre-compute hex IDs in app code |
| Ollama model size on free-tier hosts | Default to `phi-3-mini` (3.8B); upgrade later |
| GitHub Pages doesn't support backend | Backend lives elsewhere (Railway / Render / VPS); frontend points to it via env-substituted `BACKEND_URL` |
