# Target folder structure

Once Phase 2+ lands, the repository becomes a small monorepo with three
top-level workspaces: `web/` (React SPA), `api/` (FastAPI service), and
`gis/` (offline pipelines). The current `frontend/` and `backend/`
folders remain as the working static site until each piece is migrated
over (see [`MIGRATION.md`](MIGRATION.md)).

```
.
├── web/                          # React + Vite + TS SPA
│   ├── public/
│   │   ├── icons/                # PWA icons
│   │   ├── manifest.webmanifest  # Web App Manifest
│   │   └── service-worker.js
│   ├── src/
│   │   ├── main.tsx              # Entry
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── Explore.tsx       # Main map view
│   │   │   ├── City.tsx          # City detail / score card
│   │   │   ├── Simulate.tsx      # Digital-twin sandbox
│   │   │   ├── Audit.tsx         # Crowdsourced audit form (PWA)
│   │   │   ├── Reports.tsx       # AI-generated reports
│   │   │   └── admin/
│   │   │       └── Dashboard.tsx # Government dashboard
│   │   ├── components/
│   │   │   ├── map/
│   │   │   │   ├── MapShell.tsx
│   │   │   │   ├── BasemapPicker.tsx
│   │   │   │   ├── CitySearch.tsx        # ports current city-search.js
│   │   │   │   ├── LayerToggles.tsx
│   │   │   │   ├── deckLayers/
│   │   │   │   │   ├── RoadsLayer.tsx
│   │   │   │   │   ├── WalkScoreHexLayer.tsx
│   │   │   │   │   ├── AmenitiesLayer.tsx
│   │   │   │   │   ├── IsochroneLayer.tsx
│   │   │   │   │   └── BuildingsLayer3D.tsx
│   │   │   │   └── Legend.tsx
│   │   │   ├── panel/
│   │   │   │   ├── DataTab.tsx
│   │   │   │   ├── LayersTab.tsx
│   │   │   │   ├── WeightsTab.tsx
│   │   │   │   ├── ExportTab.tsx
│   │   │   │   ├── AITab.tsx
│   │   │   │   └── SimulateTab.tsx
│   │   │   ├── upload/
│   │   │   │   ├── Dropzone.tsx
│   │   │   │   ├── CsvParser.ts
│   │   │   │   └── ColumnDetector.ts
│   │   │   ├── detail/
│   │   │   │   └── PointDetailDrawer.tsx
│   │   │   └── ui/                 # Tailwind primitives
│   │   ├── store/
│   │   │   ├── useCityStore.ts     # current city, bbox, network
│   │   │   ├── useLayerStore.ts    # toggles, opacity, gradient
│   │   │   ├── useWeightsStore.ts  # indicator weights
│   │   │   └── useUploadStore.ts   # uploaded rows + stats
│   │   ├── api/
│   │   │   ├── client.ts           # typed FastAPI client
│   │   │   └── generated/          # openapi-typescript output
│   │   ├── lib/
│   │   │   ├── colorScale.ts
│   │   │   ├── h3.ts
│   │   │   └── geoUtils.ts
│   │   └── styles/
│   │       ├── globals.css
│   │       └── tokens.css
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── api/                           # FastAPI service
│   ├── app/
│   │   ├── main.py
│   │   ├── settings.py
│   │   ├── deps.py                # DI: db session, redis, celery
│   │   ├── models/                # SQLAlchemy ORM
│   │   │   ├── city.py
│   │   │   ├── network.py
│   │   │   ├── amenity.py
│   │   │   ├── score.py
│   │   │   ├── audit.py
│   │   │   └── user.py
│   │   ├── schemas/               # Pydantic
│   │   ├── routers/
│   │   │   ├── cities.py
│   │   │   ├── networks.py
│   │   │   ├── scores.py
│   │   │   ├── isochrones.py
│   │   │   ├── simulate.py
│   │   │   ├── audits.py
│   │   │   ├── exports.py
│   │   │   └── ai.py
│   │   ├── services/
│   │   │   ├── nominatim.py
│   │   │   ├── osmnx_pipeline.py
│   │   │   ├── score_engine.py
│   │   │   ├── isochrones.py
│   │   │   ├── ollama_client.py
│   │   │   ├── mapillary.py
│   │   │   └── cv_inference.py
│   │   ├── tasks/                 # Celery tasks
│   │   │   ├── ingest_city.py
│   │   │   ├── compute_scores.py
│   │   │   ├── run_cv.py
│   │   │   └── generate_tiles.py
│   │   ├── db/
│   │   │   ├── session.py
│   │   │   └── migrations/        # Alembic
│   │   └── utils/
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
│
├── gis/                           # Offline pipelines / experiments
│   ├── notebooks/
│   ├── scripts/
│   │   ├── bootstrap_city.py      # one-shot ingest for a single city
│   │   ├── batch_score.py
│   │   └── generate_pmtiles.py    # tippecanoe wrapper
│   ├── data/                      # gitignored — local cache
│   └── pyproject.toml
│
├── infra/
│   ├── docker-compose.yml         # api + worker + postgres + redis + ollama
│   ├── nginx/                     # reverse proxy + TLS
│   ├── tippecanoe/                # vector-tile build container
│   └── k8s/                       # optional Helm chart
│
├── docs/                          # planning + ops docs (this folder)
├── .github/
│   └── workflows/
│       ├── deploy-web.yml         # Pages deploy of web/dist
│       ├── deploy-api.yml         # Railway / Render deploy
│       └── ci.yml                 # lint + test (web + api)
│
├── README.md
└── LICENSE
```

## Naming conventions

- **Web**: components `PascalCase.tsx`, hooks `useCamelCase.ts`, stores
  `useXyzStore.ts`, utilities `camelCase.ts`.
- **API**: modules `snake_case.py`. SQLAlchemy models live in
  `app/models/`, Pydantic schemas in `app/schemas/`. Route handlers in
  `app/routers/` are thin and delegate to `app/services/`.
- **GIS scripts**: each script is runnable standalone with `python -m
  gis.scripts.<name>` and accepts a `--city <osm-id>` flag.

## Why a monorepo

- One PR can change a route + the API + the migration in lockstep.
- Shared OpenAPI schema → typed client without a separate publish step.
- Single CI surface; Docker Compose covers local dev for the whole stack.
