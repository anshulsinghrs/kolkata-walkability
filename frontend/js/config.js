/**
 * config.js
 * ----------
 * Configuration constants for the IAMSM frontend.
 *
 * Exposes a single global `IAMSM_CONFIG` object. All modules read from this
 * object — change values here without touching application logic.
 */

window.IAMSM_CONFIG = {
  /* ---- Data paths (relative to index.html) ---- */
  DATA_BASE: 'data/',
  MANIFEST_PATH: 'data/manifest.json',
  OVERVIEW_PATH: 'data/overview.json',

  /* ---- Map ---- */
  MAP: {
    DEFAULT_CENTER: [22.5675, 88.3700],   // Kolkata
    DEFAULT_ZOOM: 12,
    MIN_ZOOM: 10,
    MAX_ZOOM: 19,
    /**
     * Below this zoom level, only the sampled overview file is rendered.
     * At/above this zoom, full-resolution tiles intersecting the viewport
     * are fetched on demand.
     */
    OVERVIEW_MAX_ZOOM: 13,
  },

  /* ---- Point rendering ---- */
  POINT_RADIUS_BY_ZOOM: {
    10: 1.4, 11: 1.6, 12: 2.0, 13: 2.4, 14: 3.0,
    15: 3.4, 16: 4.0, 17: 4.6, 18: 5.4, 19: 6.4,
  },
  POINT_ALPHA_BY_ZOOM: {
    10: 0.55, 11: 0.6, 12: 0.7, 13: 0.78,
    14: 0.85, 15: 0.9, 16: 0.92, 17: 0.94, 18: 0.96, 19: 0.98,
  },

  /* ---- Click interaction ---- */
  CLICK_TOLERANCE_PX: 14,
  CLICK_MIN_ZOOM: 14,

  /* ---- Color scale (PWS 0–100 → 7-stop gradient) ---- */
  SCORE_STOPS: [
    { t: 0,   color: [185, 28, 28],  label: 'Very Poor'  },
    { t: 5,   color: [234, 88, 12],  label: 'Poor'       },
    { t: 15,  color: [217, 119, 6],  label: 'Fair'       },
    { t: 30,  color: [202, 138, 4],  label: 'Moderate'   },
    { t: 50,  color: [101, 163, 13], label: 'Good'       },
    { t: 75,  color: [22, 163, 74],  label: 'Very Good'  },
    { t: 100, color: [4, 120, 87],   label: 'Excellent'  },
  ],

  /* ---- Tile cache ---- */
  TILE_CACHE_LIMIT: 64,   // max number of tile JSONs held in memory

  /* ---- Basemap providers (no API key required) ---- */
  BASEMAPS: {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      attribution: '© OpenStreetMap · © CARTO',
      subdomains: 'abcd',
    },
    light: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: '© OpenStreetMap · © CARTO',
      subdomains: 'abcd',
    },
    sat: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri · Maxar · Earthstar Geographics',
    },
  },
};
