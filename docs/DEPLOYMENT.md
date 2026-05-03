# Deployment Guide

End-to-end walkthrough from a fresh laptop to a live URL.

## Prerequisites

- A GitHub account
- Git installed locally (`git --version` should print a version)
- Python 3.9+ (`python --version`)

## 1. Generate the data tiles

If `frontend/data/manifest.json` does not exist (or is out of date), run the
processor first:

```bash
cd backend
pip install -r requirements.txt
python process_data.py --input "C:\Users\Techno\Desktop\aggregated_pixel_ratios - Copy.csv"
cd ..
```

Verify it worked:

```bash
ls frontend/data/             # should show manifest.json, overview.json, tiles/
```

## 2. Test locally

The site uses `fetch()` to load tile JSON, which fails over `file://` in most
browsers. You need a local server. The simplest option is Python's:

```bash
cd frontend
python -m http.server 8000
```

Open <http://localhost:8000> and verify:

- Status pill goes through "Initialising → Loading manifest → Loading overview → ✓ N PWS points indexed"
- Coloured points appear over the basemap
- Slider, basemap toggles, and click-to-inspect (at zoom ≥ 14) all work

If anything is broken, open DevTools (F12) → Console for errors.

Stop the server with `Ctrl-C` once you're satisfied.

## 3. Push to GitHub

If the project is not already a git repo:

```bash
cd ..    # back to repo root
git init
git add .
git commit -m "Initial commit: Kolkata Walkability Atlas"
```

Create a new repository on GitHub (let's call it `kolkata-walkability`) and
push:

```bash
git remote add origin https://github.com/<your-username>/kolkata-walkability.git
git branch -M main
git push -u origin main
```

## 4. Enable GitHub Pages

1. On GitHub, navigate to your repo.
2. **Settings** → **Pages** (left sidebar).
3. Under **Build and deployment → Source**, select **GitHub Actions**.

That's it — no further configuration is needed. The workflow file
(`.github/workflows/deploy.yml`) does the rest.

## 5. Watch the deploy

1. Go to the **Actions** tab of your repo.
2. You should see a run named "Deploy frontend to GitHub Pages" already
   in progress (or queued).
3. Click into it to watch the steps. The "Deploy to GitHub Pages" step
   prints the live URL when it finishes — usually 1–2 minutes total.

Your site will be live at:

```
https://<your-username>.github.io/<repo-name>/
```

## 6. Updating the live site

Any push to `main` triggers a new deploy automatically. To update the data:

```bash
# 1. Regenerate tiles with new CSV
cd backend
python process_data.py --input /path/to/new_data.csv
cd ..

# 2. Commit and push
git add frontend/data/
git commit -m "Update PWS dataset (N points)"
git push
```

Within a couple of minutes the live site reflects the new data.

## Troubleshooting

### The site loads but shows no points

- Open DevTools (F12) → **Network** tab. Reload. Look for
  `manifest.json` and `overview.json`.
  - **404** on either → the data was not committed. Run the Python
    processor and verify `frontend/data/` is not in `.gitignore`.
  - **200 but no points render** → check the **Console** tab for JS errors.

### "Failed to load resource" for tile files

If individual tiles 404 but the manifest loads, the `tiles/` directory
wasn't pushed. Check:

```bash
git ls-files frontend/data/tiles/ | wc -l
```

If this is 0, your `.gitignore` is blocking the JSON files. Make sure your
`.gitignore` doesn't include `*.json` globally.

### The deploy workflow fails

- "Permission denied" → confirm **Settings → Pages → Source** is set to
  **GitHub Actions** (not "Deploy from a branch").
- Workflow doesn't run at all → check `.github/workflows/deploy.yml` is in
  the repo and properly indented (YAML is whitespace-sensitive).

### The map shows but the basemap tiles are blank

This usually means the browser is blocking the CARTO/Esri tile servers due
to corporate firewall, content blocker, or offline state. Test with the
"Light" basemap toggle — if that works, the dark basemap CDN is the
culprit. The site needs internet access to fetch basemap tiles even though
it's GitHub-Pages-hosted; the basemaps are not bundled.

## Custom domain (optional)

If you have a domain (e.g., `walkability.iitkgp.ac.in`):

1. Add a `CNAME` file at `frontend/CNAME` containing the bare domain
   (one line, no `https://`).
2. Configure your domain's DNS to CNAME-point to
   `<your-username>.github.io`.
3. In **Settings → Pages**, enter the domain in the "Custom domain" field
   and tick "Enforce HTTPS" once provisioned.

GitHub takes care of issuing the TLS certificate.
