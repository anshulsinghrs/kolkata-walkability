/**
 * export.js
 * ---------
 * Export the active layer (research PWS or uploaded dataset) to GeoJSON,
 * CSV, or a PNG snapshot.
 *
 * Exports respect the active filter and (for "visible" variants) the
 * current map viewport.
 */

window.Exporter = (function () {
  'use strict';

  function download(filename, data, mime) {
    const blob = (data instanceof Blob) ? data : new Blob([data], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function timestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  // ---- Source selection -----------------------------------------------
  /**
   * Returns the dataset to export and its kind.
   * Preference: uploaded data when present, else research PWS visible points.
   */
  function getSource(scope, mapState) {
    const uploaded = window.UploadLayer.getRows();
    if (uploaded.length > 0) {
      let rows = window.UploadLayer.getFilteredRows();
      if (scope === 'visible') {
        const b = mapState.map.getBounds();
        rows = rows.filter(r =>
          r.latitude >= b.getSouth() && r.latitude <= b.getNorth() &&
          r.longitude >= b.getWest() && r.longitude <= b.getEast());
      }
      return { kind: 'upload', rows };
    }

    // Research PWS — flat tuples [lon, lat, score]
    const visible = mapState.collectVisible();
    const out = scope === 'visible'
      ? visible
      : visible; // research data is already cropped to visible tiles
    return { kind: 'pws', rows: out };
  }

  // ---- GeoJSON --------------------------------------------------------
  function toGeoJSON(src) {
    if (src.kind === 'upload') {
      return {
        type: 'FeatureCollection',
        features: src.rows.map(r => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
          properties: {
            id: r.id, weightage: r.weightage,
            category: r.category, timestamp: r.timestamp,
            notes: r.notes, image_url: r.image_url,
            hazard_type: r.hazard_type,
            sidewalk: r.sidewalk, greenery: r.greenery, lighting: r.lighting,
            crowdedness: r.crowdedness, crossing_safety: r.crossing_safety,
          },
        })),
      };
    }
    return {
      type: 'FeatureCollection',
      features: src.rows.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p[0], p[1]] },
        properties: { pws: p[2] },
      })),
    };
  }

  // ---- CSV ------------------------------------------------------------
  function toCSV(src) {
    if (src.kind === 'upload') {
      const fields = ['id', 'latitude', 'longitude', 'weightage', 'category',
        'timestamp', 'notes', 'image_url', 'hazard_type',
        'sidewalk', 'greenery', 'lighting', 'crowdedness', 'crossing_safety'];
      const esc = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [fields.join(',')];
      for (const r of src.rows) lines.push(fields.map(f => esc(r[f])).join(','));
      return lines.join('\n');
    }
    const lines = ['longitude,latitude,pws'];
    for (const p of src.rows) lines.push(`${p[0]},${p[1]},${p[2]}`);
    return lines.join('\n');
  }

  // ---- PNG snapshot ---------------------------------------------------
  /**
   * Compose visible map tiles + overlay canvases into a PNG. Cross-origin
   * raster tiles taint the canvas; this best-effort approach succeeds for
   * the CARTO basemaps (which serve CORS headers) and gracefully degrades
   * otherwise.
   */
  async function exportPNG(mapState) {
    const map = mapState.map;
    const size = map.getSize();
    const out = document.createElement('canvas');
    out.width = size.x;
    out.height = size.y;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, size.x, size.y);

    // 1) Tile layers (best-effort, may fail on tainted CORS)
    const mapEl = map.getContainer();
    const tileImgs = mapEl.querySelectorAll('.leaflet-tile-loaded');
    for (const img of tileImgs) {
      try {
        const rect = img.getBoundingClientRect();
        const mapRect = mapEl.getBoundingClientRect();
        const x = rect.left - mapRect.left;
        const y = rect.top - mapRect.top;
        ctx.globalAlpha = parseFloat(img.style.opacity || '1');
        ctx.drawImage(img, x, y, rect.width, rect.height);
      } catch (e) { /* CORS taint — skip */ }
    }
    ctx.globalAlpha = 1;

    // 2) Overlay canvases (our points / upload canvases)
    const overlayCanvases = mapEl.querySelectorAll('canvas');
    for (const c of overlayCanvases) {
      try {
        const rect = c.getBoundingClientRect();
        const mapRect = mapEl.getBoundingClientRect();
        ctx.drawImage(c, rect.left - mapRect.left, rect.top - mapRect.top, rect.width, rect.height);
      } catch (e) { /* ignore */ }
    }

    return new Promise((resolve) => {
      out.toBlob((blob) => {
        if (blob) download(`walkability-${timestamp()}.png`, blob, 'image/png');
        resolve(!!blob);
      }, 'image/png');
    });
  }

  // ---- Dispatch -------------------------------------------------------
  async function run(kind, mapState) {
    const ts = timestamp();
    if (kind === 'png') {
      await exportPNG(mapState);
      return;
    }
    const scope = kind.endsWith('-visible') ? 'visible' : 'all';
    const src = getSource(scope, mapState);
    if (!src.rows || src.rows.length === 0) {
      throw new Error('No data to export — upload a CSV or zoom in.');
    }
    if (kind.startsWith('geojson')) {
      const gj = toGeoJSON(src);
      download(`walkability-${ts}.geojson`, JSON.stringify(gj, null, 2), 'application/geo+json');
    } else if (kind.startsWith('csv')) {
      const csv = toCSV(src);
      download(`walkability-${ts}.csv`, csv, 'text/csv');
    }
  }

  return { run };
})();
