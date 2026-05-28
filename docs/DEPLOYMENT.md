# Deployment

End-to-end deployment walkthrough. Phase 1 (this branch) only needs
GitHub Pages. Later phases also deploy a backend on Railway / Render /
or a VPS.

## Phase 1 — static frontend on GitHub Pages

### Prerequisites

- A GitHub account
- Git installed locally (`git --version` should print a version)

### 1. (Optional) generate the legacy research-dataset tiles

The platform now boots **without** any pre-baked dataset, so you can
skip this. If you have a Perceived Walkability Score CSV and want it
rendered automatically, run:

```bash
cd backend
pip install -r requirements.txt
python process_data.py --input /path/to/your_walkability.csv
cd ..
```

Verify it wrote files into `frontend/data/`:

```bash
ls frontend/data/             # manifest.json, overview.json, tiles/
```

### 2. Test locally

The site uses `fetch()` to load JSON, which fails over `file://` in
most browsers. Use any static server:

```bash
cd frontend
python -m http.server 8000
```

Open <http://localhost:8000>. Verify:

- The status pill goes through "Initialising → Ready — search a city".
- Type a city ("Delhi", "Tokyo", "Lisbon", "Kharagpur"…) → dropdown
  appears → pick a result → map flies to it.
- The basemap toggle, weights sliders, upload dropzone, and exports
  all still work.

If anything is broken, open DevTools (F12) → Console.

### 3. Push to GitHub

If the repo isn't already initialised:

```bash
git init
git add .
git commit -m "Initial commit: UrbanPulse"
git remote add origin https://github.com/<you>/urbanpulse.git
git branch -M main
git push -u origin main
```

### 4. Enable GitHub Pages

1. On GitHub, open the repo.
2. **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.

The workflow file (`.github/workflows/deploy.yml`) deploys
`frontend/` to Pages on every push to `main`.

### 5. Watch the deploy

The **Actions** tab shows a run called *Deploy frontend to GitHub
Pages*. The deploy step prints the live URL. The site lives at:

```
https://<your-username>.github.io/<repo-name>/
```

### 6. Updating the live site

Every push to `main` redeploys. To update the (optional) overlay
dataset:

```bash
cd backend
python process_data.py --input /path/to/new_data.csv
cd ..
git add frontend/data/
git commit -m "Update PWS dataset (N points)"
git push
```

## Phase 2+ — backend deployment

The FastAPI service can run anywhere that supports Docker. Three
recommended targets:

### Railway

```bash
railway up --service api --dockerfile api/Dockerfile
railway run alembic upgrade head
```

Add the public URL of the API to the frontend `BACKEND_URL` env var
(see `web/.env.example`).

### Render

```yaml
# render.yaml
services:
  - type: web
    name: urbanpulse-api
    runtime: docker
    dockerfilePath: api/Dockerfile
    envVars:
      - key: DATABASE_URL
        fromDatabase: { name: urbanpulse-db, property: connectionString }
      - key: REDIS_URL
        fromService: { type: redis, name: urbanpulse-redis }
databases:
  - name: urbanpulse-db
    postgresPostgisVersion: "16"
```

### VPS (Docker Compose)

```bash
ssh your-vps "git clone https://github.com/<you>/urbanpulse.git \
  && cd urbanpulse && docker compose -f infra/docker-compose.yml up -d"
```

NGINX terminates TLS via Let's Encrypt; Cloudflare Pages can front the
SPA bundle.

## Troubleshooting

### Site loads but no points appear

Open DevTools (F12) → **Network** tab → reload. Look for
`manifest.json`:

- **404** → no overlay dataset is published. This is expected for a
  fresh Phase-1 deploy. Use the city search instead.
- **200, no points render** → check **Console** for JS errors.

### Basemap tiles are blank

Usually a corporate firewall or content blocker. The basemaps come
from CARTO / Esri / OSM CDNs and require internet access. Switch to
the OSM Standard basemap to check.

### City search returns "No matches"

- Check Network tab for the Nominatim request. A 429 means rate
  limiting — Nominatim asks for 1 req/s per user.
- If you're behind a corporate proxy that blocks `nominatim.org`,
  configure `BACKEND_URL` and use the FastAPI proxy (Phase 2).

### Deploy workflow fails

- "Permission denied" → confirm **Settings → Pages → Source** is set
  to **GitHub Actions** (not "Deploy from a branch").
- Workflow doesn't run → check `.github/workflows/deploy.yml` is
  present and indented correctly (YAML is whitespace-sensitive).

## Custom domain

1. Add `frontend/CNAME` with your bare domain (e.g. `urbanpulse.app`).
2. Point your domain's DNS to `<your-username>.github.io` (CNAME or
   ALIAS).
3. In **Settings → Pages**, enter the domain and tick "Enforce HTTPS".

GitHub provisions the TLS cert via Let's Encrypt automatically.
