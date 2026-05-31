/**
 * config.js
 * ----------
 * Configuration constants for the UrbanPulse global walkability platform.
 *
 * Exposes a single global `URBANPULSE_CONFIG` object. All modules read from
 * this object — change values here without touching application logic.
 */

window.URBANPULSE_CONFIG = {
  /* ---- Brand ---- */
  BRAND: {
    NAME: 'UrbanPulse',
    TAGLINE: 'Global urban walkability & mobility intelligence',
    REPO: 'https://github.com/anshulsinghrs/kolkata-walkability',
  },

  /* ---- Optional research-dataset (PWS) static assets.
         The platform now boots without these — they only render if present. */
  DATA_BASE: 'data/',
  MANIFEST_PATH: 'data/manifest.json',
  OVERVIEW_PATH: 'data/overview.json',

  /* ---- Geocoder ---- */
  GEOCODER: {
    NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search',
    LANGUAGE: 'en',
    LIMIT: 8,
    DEBOUNCE_MS: 280,
  },

  /* ---- Map ----
         DEFAULT_CENTER frames Kolkata on first load so users land on a
         familiar, data-rich view instead of an empty world map. */
  MAP: {
    DEFAULT_CENTER: [22.5726, 88.3639],
    DEFAULT_ZOOM: 11,
    MIN_ZOOM: 2,
    MAX_ZOOM: 19,
    OVERVIEW_MAX_ZOOM: 13,
    DEFAULT_BASEMAP: 'light',
  },

  /* ---- Default landing city ---- */
  DEFAULT_CITY: {
    name: 'Kolkata, West Bengal, India',
    center: [22.5726, 88.3639],
    bbox: [[22.4500, 88.2400], [22.7000, 88.5000]],
    population: '14.9 M',
    area: '206.1 km²',
    density: '24,000 / km²',
  },

  /* ---- Curated quick-jump cities ---- */
  RECENT_CITIES: [
    { name: 'Kolkata',   center: [22.5726, 88.3639], zoom: 11 },
    { name: 'Delhi',     center: [28.6139, 77.2090], zoom: 10 },
    { name: 'Bengaluru', center: [12.9716, 77.5946], zoom: 11 },
    { name: 'Mumbai',    center: [19.0760, 72.8777], zoom: 11 },
  ],

  /* ---- Point rendering (research PWS layer) ---- */
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

  /* ---- Gradient presets for the uploaded layer ---- */
  GRADIENT_PRESETS: {
    walkability: [
      { t: 0,   color: [185, 28, 28] },
      { t: 25,  color: [217, 119, 6] },
      { t: 50,  color: [202, 138, 4] },
      { t: 75,  color: [101, 163, 13] },
      { t: 100, color: [4, 120, 87]  },
    ],
    viridis: [
      { t: 0,   color: [68, 1, 84]    },
      { t: 25,  color: [59, 82, 139]  },
      { t: 50,  color: [33, 145, 140] },
      { t: 75,  color: [94, 201, 98]  },
      { t: 100, color: [253, 231, 37] },
    ],
    magma: [
      { t: 0,   color: [0, 0, 4]      },
      { t: 25,  color: [80, 18, 123]  },
      { t: 50,  color: [182, 54, 121] },
      { t: 75,  color: [251, 136, 97] },
      { t: 100, color: [252, 253, 191]},
    ],
    plasma: [
      { t: 0,   color: [13, 8, 135]   },
      { t: 25,  color: [126, 3, 168]  },
      { t: 50,  color: [204, 71, 120] },
      { t: 75,  color: [248, 149, 64] },
      { t: 100, color: [240, 249, 33] },
    ],
    ice: [
      { t: 0,   color: [12, 24, 64]   },
      { t: 25,  color: [33, 76, 138]  },
      { t: 50,  color: [78, 137, 196] },
      { t: 75,  color: [165, 209, 240]},
      { t: 100, color: [240, 249, 255]},
    ],
  },

  /* ---- Tile cache ---- */
  TILE_CACHE_LIMIT: 64,

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
      attribution: '© OpenStreetMap · © CARTO (Positron)',
      subdomains: 'abcd',
    },
    osm: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      subdomains: 'abc',
    },
    sat: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri · Maxar · Earthstar Geographics',
    },
    topo: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap · © OpenTopoMap (CC-BY-SA)',
      subdomains: 'abc',
      maxZoom: 17,
    },
  },

  /* ---- Defaults for uploaded layer rendering ---- */
  UPLOAD: {
    DEFAULT_RADIUS: 5,
    DEFAULT_OPACITY: 0.85,
    HEATMAP_RADIUS: 22,
    HEATMAP_BLUR: 18,
    CLUSTER_RADIUS: 60,
    MAX_RENDER_HINT: 200000,
  },

  /* ---- Default indicator weights (sum normalised to 1 at apply-time) ---- */
  DEFAULT_WEIGHTS: {
    sidewalk: 35,
    greenery: 20,
    lighting: 15,
    crowdedness: 10,
    crossing_safety: 20,
  },

  /* ---- Column-detection synonyms ----
   * Lowercase substrings that map to a canonical column role.
   */
  COLUMN_SYNONYMS: {
    latitude:  ['latitude', 'lat', 'y'],
    longitude: ['longitude', 'lng', 'lon', 'long', 'x'],
    weightage: ['weightage', 'weight', 'score', 'pws', 'walkability', 'value'],
    category:  ['category', 'class', 'type', 'tag'],
    timestamp: ['timestamp', 'time', 'date', 'datetime'],
    notes:     ['notes', 'note', 'comment', 'remark', 'description'],
    image_url: ['image_url', 'image', 'photo', 'img', 'picture'],
    hazard_type: ['hazard_type', 'hazard', 'incident'],
    sidewalk: ['sidewalk'],
    greenery: ['greenery', 'green', 'vegetation'],
    lighting: ['lighting', 'streetlight', 'light'],
    crowdedness: ['crowdedness', 'crowd', 'density'],
    crossing_safety: ['crossing_safety', 'crossing', 'safety'],
  },
};
