/**
 * data-loader.js
 * --------------
 * Owns all I/O against the static data folder.
 *
 * Responsibilities
 *   1. Load `manifest.json` once at startup and expose its metadata.
 *   2. Load `overview.json` (sampled points) for the low-zoom view.
 *   3. Lazy-load full-resolution tiles intersecting the current viewport,
 *      with an LRU-style cache to bound memory.
 *   4. Notify listeners whenever the in-memory point set changes so the
 *      renderer can refresh.
 *
 * The module deliberately treats every point as a flat 3-tuple
 *   [lon, lat, score]
 * to minimise per-point overhead — at 400k points an object-per-point
 * representation costs hundreds of MB of heap.
 */

window.DataLoader = (function () {
  'use strict';

  const CFG = window.URBANPULSE_CONFIG;

  /** @type {Object|null} Loaded manifest */
  let manifest = null;
  /** @type {Array|null} Sampled overview points */
  let overview = null;
  /** @type {Map<string, Array>} key "col_row" → points */
  const tileCache = new Map();
  /** @type {Set<string>} keys currently being fetched (de-dupes parallel requests) */
  const inflight = new Set();
  /** @type {Array<Function>} callbacks invoked on dataset change */
  const changeListeners = [];

  function emit() {
    for (const fn of changeListeners) {
      try { fn(); } catch (e) { console.error('listener error:', e); }
    }
  }

  function onChange(fn) {
    changeListeners.push(fn);
  }

  // -------------------------------------------------------------------------
  // Manifest & overview
  // -------------------------------------------------------------------------
  /**
   * Try to load an optional research-dataset manifest. Returns the manifest
   * on success, or `null` if it is absent / unreachable — the platform now
   * boots without any pre-baked dataset, so 404s are NOT a fatal error.
   */
  async function loadManifest() {
    try {
      const res = await fetch(CFG.MANIFEST_PATH, { cache: 'force-cache' });
      if (!res.ok) return null;
      manifest = await res.json();
      return manifest;
    } catch (_err) {
      return null;
    }
  }

  function hasManifest() { return manifest !== null; }

  async function loadOverview() {
    if (!manifest) return null;
    const res = await fetch(CFG.OVERVIEW_PATH, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`Failed to load overview (HTTP ${res.status})`);
    overview = await res.json();
    emit();
    return overview;
  }

  // -------------------------------------------------------------------------
  // Tile fetching
  // -------------------------------------------------------------------------
  function tileKey(col, row) { return `${col}_${row}`; }

  /**
   * Determine which manifest tiles intersect the given Leaflet bounds.
   * @returns {Array<Object>} subset of manifest.tiles
   */
  function tilesIntersecting(latLngBounds) {
    if (!manifest) return [];
    const south = latLngBounds.getSouth();
    const north = latLngBounds.getNorth();
    const west  = latLngBounds.getWest();
    const east  = latLngBounds.getEast();

    return manifest.tiles.filter((t) => {
      const b = t.bounds;
      return !(b.max_lat < south || b.min_lat > north
            || b.max_lon < west  || b.min_lon > east);
    });
  }

  /**
   * Fetch a single tile JSON, caching the result. Returns null on failure.
   */
  async function fetchTile(tile) {
    const key = tileKey(tile.col, tile.row);
    if (tileCache.has(key)) {
      // Refresh LRU position
      const v = tileCache.get(key);
      tileCache.delete(key);
      tileCache.set(key, v);
      return v;
    }
    if (inflight.has(key)) return null;
    inflight.add(key);

    try {
      const res = await fetch(CFG.DATA_BASE + tile.file, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const points = await res.json();

      // Bounded LRU eviction
      if (tileCache.size >= CFG.TILE_CACHE_LIMIT) {
        const oldestKey = tileCache.keys().next().value;
        tileCache.delete(oldestKey);
      }
      tileCache.set(key, points);
      return points;
    } catch (err) {
      console.warn(`Tile ${key} failed:`, err);
      return null;
    } finally {
      inflight.delete(key);
    }
  }

  /**
   * Ensure all tiles intersecting the bounds are loaded. Triggers `onChange`
   * whenever a new tile arrives so the renderer can incrementally redraw.
   */
  async function ensureTilesForBounds(bounds) {
    const needed = tilesIntersecting(bounds);
    let newlyLoaded = 0;
    await Promise.all(needed.map(async (t) => {
      const key = tileKey(t.col, t.row);
      if (tileCache.has(key)) return;
      const points = await fetchTile(t);
      if (points) newlyLoaded++;
    }));
    if (newlyLoaded > 0) emit();
    return newlyLoaded;
  }

  // -------------------------------------------------------------------------
  // Aggregated point access for the renderer
  // -------------------------------------------------------------------------
  /**
   * Collect every cached point in the union of the visible tiles.
   * Used at high zoom levels for full-resolution rendering.
   */
  function collectVisiblePoints(bounds) {
    if (!manifest) return overview || [];
    const tiles = tilesIntersecting(bounds);
    const out = [];
    for (const t of tiles) {
      const cached = tileCache.get(tileKey(t.col, t.row));
      if (cached) {
        for (let i = 0; i < cached.length; i++) out.push(cached[i]);
      }
    }
    return out;
  }

  function getOverview() { return overview || []; }
  function getManifest() { return manifest; }

  return {
    loadManifest,
    hasManifest,
    loadOverview,
    ensureTilesForBounds,
    collectVisiblePoints,
    getOverview,
    getManifest,
    onChange,
  };
})();
