/**
 * sample-data.js
 * --------------
 * A small, deterministic, *synthetic* walkability sample for Kolkata.
 *
 * This is NOT real research data. It exists so the app has something
 * meaningful to show out of the box — the KPI panel, analytics charts,
 * score filter, colour legend, and 3D view all light up when the user
 * clicks "Explore Kolkata", instead of landing on an empty basemap.
 *
 * The points are generated procedurally from a fixed seed, so the layer is
 * identical on every load and across every device. A plausible spatial
 * structure is baked in (higher walkability around a handful of central /
 * planned cores, tapering toward the periphery) purely for illustration.
 *
 * Rows are emitted in the same canonical shape that `csv-loader.js`
 * produces, so they flow through the exact same Weights → UploadLayer →
 * Analytics → Export pipeline as a user upload.
 *
 * Public API:
 *   SampleData.kolkata() -> { rows, meta }
 */
window.SampleData = (function () {
  'use strict';

  const CFG = window.URBANPULSE_CONFIG || {};
  // [[minLat, minLon], [maxLat, maxLon]]
  const BBOX = (CFG.DEFAULT_CITY && CFG.DEFAULT_CITY.bbox) ||
    [[22.4500, 88.2400], [22.7000, 88.5000]];
  const [MIN_LAT, MIN_LON] = BBOX[0];
  const [MAX_LAT, MAX_LON] = BBOX[1];

  // Deterministic PRNG (mulberry32) — a fixed seed keeps the layer stable.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // Walkability "cores" — planned / central neighbourhoods score higher.
  // sigma is in degrees (~0.01° ≈ 1.1 km).
  const CORES = [
    { lat: 22.5560, lon: 88.3520, peak: 0.92, sigma: 0.022 }, // Park St / Esplanade
    { lat: 22.5200, lon: 88.3650, peak: 0.84, sigma: 0.020 }, // Ballygunge / Gariahat
    { lat: 22.5850, lon: 88.4170, peak: 0.88, sigma: 0.024 }, // Salt Lake (Bidhannagar)
    { lat: 22.6250, lon: 88.4630, peak: 0.82, sigma: 0.026 }, // New Town
    { lat: 22.6000, lon: 88.3720, peak: 0.70, sigma: 0.020 }, // Shyambazar / North
    { lat: 22.5780, lon: 88.3100, peak: 0.58, sigma: 0.022 }, // Howrah side
  ];

  const CATEGORIES = ['audit', 'survey', 'field-check', 'transit-stop'];
  const HAZARDS = [
    'Broken / missing sidewalk',
    'Waterlogging',
    'Missing pedestrian crossing',
    'Sidewalk encroachment',
    'Poor street lighting',
  ];

  // Gaussian sample via Box–Muller.
  function gauss(rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function baseScoreAt(lat, lon) {
    let best = 0;
    for (const c of CORES) {
      const dLat = lat - c.lat;
      const dLon = lon - c.lon;
      const d2 = dLat * dLat + dLon * dLon;
      const contrib = c.peak * Math.exp(-d2 / (2 * c.sigma * c.sigma));
      if (contrib > best) best = contrib;
    }
    // Baseline periphery floor + core contribution.
    return clamp01(0.22 + best);
  }

  function build(seed, count) {
    const rnd = mulberry32(seed);
    const w = (CFG.DEFAULT_WEIGHTS) || {
      sidewalk: 35, greenery: 20, lighting: 15, crowdedness: 10, crossing_safety: 20,
    };
    const wSum = Object.values(w).reduce((a, b) => a + b, 0) || 1;

    const rows = [];
    let sMinLat = Infinity, sMaxLat = -Infinity, sMinLon = Infinity, sMaxLon = -Infinity;

    for (let i = 0; i < count; i++) {
      let lat, lon;
      // ~62% of points cluster around a core (weighted by peak), the rest
      // are scattered uniformly — mimics a denser central survey effort.
      if (rnd() < 0.62) {
        const c = CORES[Math.floor(rnd() * CORES.length)];
        lat = c.lat + gauss(rnd) * c.sigma * 1.7;
        lon = c.lon + gauss(rnd) * c.sigma * 1.7;
      } else {
        lat = MIN_LAT + rnd() * (MAX_LAT - MIN_LAT);
        lon = MIN_LON + rnd() * (MAX_LON - MIN_LON);
      }
      // Keep everything inside the city bbox.
      if (lat < MIN_LAT) lat = MIN_LAT; else if (lat > MAX_LAT) lat = MAX_LAT;
      if (lon < MIN_LON) lon = MIN_LON; else if (lon > MAX_LON) lon = MAX_LON;

      const base = baseScoreAt(lat, lon);
      const noise = () => (rnd() - 0.5) * 0.16;

      // Per-indicator values in [0,1]; different offsets keep the radar chart
      // interesting (greenery/crowdedness are flatter, crossings track base).
      const ind = {
        sidewalk:        clamp01(base * 0.92 + 0.04 + noise()),
        greenery:        clamp01(base * 0.65 + 0.16 + noise()),
        lighting:        clamp01(base * 0.85 + 0.10 + noise()),
        crowdedness:     clamp01(base * 0.55 + 0.22 + noise()),
        crossing_safety: clamp01(base * 0.95 + 0.02 + noise()),
      };

      // Default-weighted composite (0–100). Weights.recompute() will overwrite
      // this live when the user edits the Weights tab.
      let weightage = 0;
      for (const k of Object.keys(ind)) weightage += ind[k] * 100 * ((w[k] || 0) / wSum);
      weightage = Math.round(weightage * 10) / 10;

      const isHazard = base < 0.34 && rnd() < 0.45;
      const category = isHazard ? 'hazard' : CATEGORIES[Math.floor(rnd() * CATEGORIES.length)];
      const hazard_type = isHazard ? HAZARDS[Math.floor(rnd() * HAZARDS.length)] : null;

      // A light sprinkle of timestamps / notes for the detail drawer.
      let timestamp = null;
      if (rnd() < 0.4) {
        const month = 1 + Math.floor(rnd() * 12);
        const day = 1 + Math.floor(rnd() * 28);
        const yr = rnd() < 0.5 ? 2024 : 2025;
        timestamp = `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }

      rows.push({
        id: i + 1,
        latitude: lat,
        longitude: lon,
        weightage,
        category,
        timestamp,
        notes: hazard_type ? hazard_type + ' reported by field survey.' : null,
        image_url: null,
        hazard_type,
        sidewalk: ind.sidewalk,
        greenery: ind.greenery,
        lighting: ind.lighting,
        crowdedness: ind.crowdedness,
        crossing_safety: ind.crossing_safety,
        _raw: null,
        _sample: true,
      });

      if (lat < sMinLat) sMinLat = lat;
      if (lat > sMaxLat) sMaxLat = lat;
      if (lon < sMinLon) sMinLon = lon;
      if (lon > sMaxLon) sMaxLon = lon;
    }

    return {
      rows,
      meta: {
        synthetic: true,
        city: 'Kolkata',
        count: rows.length,
        bounds: { min_lat: sMinLat, max_lat: sMaxLat, min_lon: sMinLon, max_lon: sMaxLon },
      },
    };
  }

  let cache = null;
  function kolkata() {
    if (!cache) cache = build(0x4B4F4C4B /* "KOLK" */, 1600);
    return cache;
  }

  return { kolkata };
})();
