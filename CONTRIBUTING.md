# Contributing to UrbanPulse

Thanks for your interest in contributing. UrbanPulse is open-source under
the MIT license and welcomes patches, bug reports, and feature ideas.

## Getting set up

```bash
git clone https://github.com/anshulsinghrs/kolkata-walkability.git
cd kolkata-walkability

# Frontend (no build step — pure static site)
cd frontend
python -m http.server 8000
# open http://localhost:8000

# Backend (only needed if you want to regenerate the legacy PWS tiles)
cd ../backend
pip install -r requirements.txt
python process_data.py --input /path/to/data.csv
```

## Linting & formatting

The repository ships with `eslint` and `prettier` configs. Install the dev
tooling once and run the checks before opening a PR:

```bash
npm install
npm run lint       # eslint over frontend/js
npm run format     # prettier write
npm run check      # lint + prettier --check (CI runs this)
```

The lint workflow also runs on every push and PR — see
`.github/workflows/lint.yml`.

## Branching & commits

- Open a topic branch from `main` (e.g. `feat/multi-csv-upload`).
- Keep commits focused — one concern per commit, present-tense subject.
- Reference issues in the body where relevant.

## Code style

- ES2019+ vanilla JavaScript, IIFE modules attached to `window.<Module>`.
- 2-space indent, single quotes, semicolons.
- Don't introduce new global state without a clear reason.
- For UI text, prefer `textContent` over `innerHTML`. Only use `innerHTML`
  with values you control and have escaped (see `frontend/js/city-search.js`
  for the escape pattern).
- New files go through prettier; we keep them ASCII unless the project
  already uses Unicode glyphs in the area you're touching.

## Reporting bugs

Please include:

- What you did (URL, click sequence, dataset shape if relevant)
- What you expected
- What happened (screenshot if visual, console error if functional)
- Browser + OS

## Security

If you find a security issue (XSS, prototype-pollution via uploads, etc.)
please open a private security advisory on GitHub rather than a public
issue.

## License

By contributing you agree your contribution is licensed under the project's
MIT license.
