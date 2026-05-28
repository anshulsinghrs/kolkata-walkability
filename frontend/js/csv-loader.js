/**
 * csv-loader.js
 * -------------
 * Parses uploaded files into a canonical row format and detects column roles.
 *
 * Supported inputs:
 *   - CSV  (any delimiter Papa can sniff)
 *   - GeoJSON FeatureCollection of Points
 *   - KML (minimal — coordinates extraction only)
 *
 * Public API:
 *   CSVLoader.parseFile(file, { onProgress }) -> Promise<{rows, headers, mapping, kind}>
 *   CSVLoader.detectMapping(headers) -> { latitude, longitude, weightage, ...optional }
 *   CSVLoader.normalize(rows, headers, mapping) -> { rows: canonical[], stats }
 */

window.CSVLoader = (function () {
  'use strict';

  const SYN = window.URBANPULSE_CONFIG.COLUMN_SYNONYMS;

  function detectMapping(headers) {
    const lowered = headers.map(h => String(h || '').toLowerCase().trim());
    const out = {};
    for (const role of Object.keys(SYN)) {
      const syns = SYN[role];
      let idx = lowered.findIndex(h => syns.includes(h));
      if (idx === -1) idx = lowered.findIndex(h => syns.some(s => h.includes(s)));
      if (idx !== -1) out[role] = headers[idx];
    }
    return out;
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function normalize(rows, headers, mapping) {
    const out = [];
    let skipped = 0;
    let weightSum = 0, weightMin = Infinity, weightMax = -Infinity;

    const f = (row, role) => {
      const col = mapping[role];
      return col != null ? row[col] : null;
    };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const lat = toNumber(f(r, 'latitude'));
      const lon = toNumber(f(r, 'longitude'));
      if (lat == null || lon == null) { skipped++; continue; }
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) { skipped++; continue; }

      let w = toNumber(f(r, 'weightage'));
      if (w == null) w = 50;
      if (w < weightMin) weightMin = w;
      if (w > weightMax) weightMax = w;
      weightSum += w;

      out.push({
        id: r.id != null ? r.id : (i + 1),
        latitude: lat,
        longitude: lon,
        weightage: w,
        category:        f(r, 'category')        || null,
        timestamp:       f(r, 'timestamp')       || null,
        notes:           f(r, 'notes')           || null,
        image_url:       f(r, 'image_url')       || null,
        hazard_type:     f(r, 'hazard_type')     || null,
        sidewalk:        toNumber(f(r, 'sidewalk')),
        greenery:        toNumber(f(r, 'greenery')),
        lighting:        toNumber(f(r, 'lighting')),
        crowdedness:     toNumber(f(r, 'crowdedness')),
        crossing_safety: toNumber(f(r, 'crossing_safety')),
        _raw: r,
      });
    }

    // Rescale to 0-100 if data looks 0..1
    if (out.length && weightMax <= 1.01 && weightMin >= -0.01) {
      for (const o of out) o.weightage *= 100;
      weightMin *= 100; weightMax *= 100; weightSum *= 100;
    }

    return {
      rows: out,
      stats: {
        total: rows.length,
        kept: out.length,
        skipped,
        weightMean: out.length ? weightSum / out.length : 0,
        weightMin: out.length ? weightMin : 0,
        weightMax: out.length ? weightMax : 0,
      },
    };
  }

  function parseCSV(file, onProgress) {
    return new Promise((resolve, reject) => {
      if (!window.Papa) { reject(new Error('PapaParse not loaded')); return; }
      const rows = [];
      let headers = null;
      const fileSize = file.size || 0;

      window.Papa.parse(file, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
        worker: false,
        chunk: (results) => {
          if (!headers && results.meta && results.meta.fields) {
            headers = results.meta.fields.slice();
          }
          for (const r of results.data) rows.push(r);
          if (onProgress && fileSize && results.meta && results.meta.cursor) {
            onProgress(Math.min(0.95, results.meta.cursor / fileSize));
          }
        },
        complete: () => {
          if (!headers && rows.length) headers = Object.keys(rows[0]);
          resolve({ rows, headers: headers || [] });
        },
        error: (err) => reject(err),
      });
    });
  }

  function parseGeoJSON(text) {
    const gj = JSON.parse(text);
    if (!gj || !gj.features) throw new Error('Not a valid GeoJSON FeatureCollection');
    const rows = [];
    const headerSet = new Set(['latitude', 'longitude']);
    for (const f of gj.features) {
      const g = f.geometry;
      if (!g || g.type !== 'Point') continue;
      const [lon, lat] = g.coordinates;
      const r = { latitude: lat, longitude: lon };
      const props = f.properties || {};
      for (const k of Object.keys(props)) {
        r[k] = props[k];
        headerSet.add(k);
      }
      rows.push(r);
    }
    return { rows, headers: Array.from(headerSet) };
  }

  async function parseFile(file, { onProgress } = {}) {
    const name = (file.name || '').toLowerCase();
    const kind = name.endsWith('.geojson') || name.endsWith('.json') ? 'geojson'
              :  name.endsWith('.kml') ? 'kml'
              :  'csv';

    if (kind === 'geojson') {
      const text = await file.text();
      const { rows, headers } = parseGeoJSON(text);
      if (onProgress) onProgress(1);
      return { rows, headers, mapping: detectMapping(headers), kind };
    }

    if (kind === 'kml') {
      const text = await file.text();
      const rows = [];
      const re = /<coordinates>([^<]+)<\/coordinates>/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const [lon, lat] = m[1].trim().split(',').map(parseFloat);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          rows.push({ latitude: lat, longitude: lon, weightage: 50 });
        }
      }
      const headers = ['latitude', 'longitude', 'weightage'];
      if (onProgress) onProgress(1);
      return { rows, headers, mapping: detectMapping(headers), kind };
    }

    const { rows, headers } = await parseCSV(file, onProgress);
    if (onProgress) onProgress(1);
    return { rows, headers, mapping: detectMapping(headers), kind };
  }

  return { parseFile, detectMapping, normalize };
})();
