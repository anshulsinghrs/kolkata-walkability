/**
 * upload-layer.js
 * ---------------
 * Renders user-uploaded data on top of the basemap. Switches between three
 * visualisation modes without re-parsing data:
 *
 *   - 'points'   : a canvas overlay (same primitive as the research layer)
 *   - 'heatmap'  : Leaflet.heat density surface
 *   - 'clusters' : Leaflet.markercluster with weighted icons
 *
 * Public API:
 *   UploadLayer.init(map)
 *   UploadLayer.setData(rows)          // canonical CSVLoader rows
 *   UploadLayer.setMode(mode)          // 'points' | 'heatmap' | 'clusters'
 *   UploadLayer.setGradient(name)      // key into GRADIENT_PRESETS
 *   UploadLayer.setStyle({radius, opacity})
 *   UploadLayer.setFilter({min, max})  // weightage range
 *   UploadLayer.onPick(handler)        // row click -> handler(row)
 *   UploadLayer.clear()
 *   UploadLayer.getRows()
 *   UploadLayer.getFilteredRows()
 *   UploadLayer.fitToData()
 */

window.UploadLayer = (function () {
  'use strict';

  const CFG = window.URBANPULSE_CONFIG;

  let map = null;
  let rows = [];
  let mode = 'points';
  let gradientName = 'walkability';
  let gradient = CFG.GRADIENT_PRESETS.walkability;
  let style = {
    radius: CFG.UPLOAD.DEFAULT_RADIUS,
    opacity: CFG.UPLOAD.DEFAULT_OPACITY,
  };
  let filter = { min: 0, max: 100 };

  let pointsCanvas = null;    // custom canvas overlay
  let heatLayer = null;       // custom score-averaging canvas overlay
  let clusterGroup = null;    // L.markerClusterGroup
  let pickHandlers = [];

  // --------------------------------------------------------------
  // Gradient interpolation
  // --------------------------------------------------------------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function gradientColor(score) {
    const stops = gradient;
    if (score <= stops[0].t) return stops[0].color;
    if (score >= stops[stops.length - 1].t) return stops[stops.length - 1].color;
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (score >= a.t && score <= b.t) {
        const t = (score - a.t) / (b.t - a.t);
        return [
          Math.round(lerp(a.color[0], b.color[0], t)),
          Math.round(lerp(a.color[1], b.color[1], t)),
          Math.round(lerp(a.color[2], b.color[2], t)),
        ];
      }
    }
    return [128, 128, 128];
  }

  function rgbaCss(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }

  function filteredRows() {
    if (!rows.length) return rows;
    const { min, max } = filter;
    if (min <= 0 && max >= 100) return rows;
    return rows.filter(r => r.weightage >= min && r.weightage <= max);
  }

  function weightRange() {
    let lo = Infinity, hi = -Infinity;
    for (const r of rows) {
      if (r.weightage < lo) lo = r.weightage;
      if (r.weightage > hi) hi = r.weightage;
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 100; }
    if (lo === hi) hi = lo + 1;
    return [lo, hi];
  }

  // --------------------------------------------------------------
  // Custom canvas points layer (reuses Leaflet pane)
  // --------------------------------------------------------------
  const UploadPointsLayer = L.Layer.extend({
    onAdd: function (m) {
      this._map = m;
      if (!m.getPane('uploadPane')) {
        m.createPane('uploadPane');
        m.getPane('uploadPane').style.zIndex = 460;
        m.getPane('uploadPane').style.pointerEvents = 'none';
      }
      this._canvas = L.DomUtil.create('canvas', 'upload-canvas leaflet-zoom-hide');
      this._canvas.style.position = 'absolute';
      this._canvas.style.top = '0';
      this._canvas.style.left = '0';
      this._canvas.style.pointerEvents = 'none';
      m.getPane('uploadPane').appendChild(this._canvas);

      this._boundClick = (e) => this._onMapClick(e);
      m.on('click', this._boundClick);

      m.on('move', this._render, this);
      m.on('moveend', this._render, this);
      m.on('zoomend', this._render, this);
      m.on('resize', this._render, this);
      this._render();
    },
    onRemove: function (m) {
      if (this._canvas) L.DomUtil.remove(this._canvas);
      if (this._boundClick) m.off('click', this._boundClick);
      m.off('move', this._render, this);
      m.off('moveend', this._render, this);
      m.off('zoomend', this._render, this);
      m.off('resize', this._render, this);
    },
    _onMapClick: function (e) {
      const data = filteredRows();
      if (!data.length) return;
      const clickPt = this._map.latLngToContainerPoint(e.latlng);
      const tol = Math.max(style.radius * 2.4, 12);
      let best = null, bestDist = Infinity;
      for (const r of data) {
        const pt = this._map.latLngToContainerPoint([r.latitude, r.longitude]);
        const dx = pt.x - clickPt.x, dy = pt.y - clickPt.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; best = r; }
      }
      if (best && Math.sqrt(bestDist) <= tol) {
        for (const fn of pickHandlers) fn(best);
      }
    },
    _render: function () {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      if (size.x === 0 || size.y === 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (this._canvas.width !== size.x * dpr || this._canvas.height !== size.y * dpr) {
        this._canvas.width = size.x * dpr;
        this._canvas.height = size.y * dpr;
        this._canvas.style.width = size.x + 'px';
        this._canvas.style.height = size.y + 'px';
      }
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);

      const ctx = this._canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      const data = filteredRows();
      if (!data.length) return;

      const b = this._map.getBounds();
      const south = b.getSouth(), north = b.getNorth(), west = b.getWest(), east = b.getEast();
      const [wLo, wHi] = weightRange();
      const span = wHi - wLo;
      const r = style.radius;
      const a = style.opacity;

      // White outline for legibility on satellite/light basemaps
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(0.5, r * 0.25);

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row.latitude < south || row.latitude > north) continue;
        if (row.longitude < west || row.longitude > east) continue;
        const normScore = ((row.weightage - wLo) / span) * 100;
        const c = gradientColor(normScore);
        const pt = this._map.latLngToContainerPoint([row.latitude, row.longitude]);
        ctx.fillStyle = rgbaCss(c, a);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, 6.2832);
        ctx.fill();
        if (r >= 4) ctx.stroke();
      }
    },
  });

  // --------------------------------------------------------------
  // Mode switching
  // --------------------------------------------------------------
  function detach() {
    if (pointsCanvas && map.hasLayer(pointsCanvas)) map.removeLayer(pointsCanvas);
    if (heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
    if (clusterGroup && map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
  }

  // Score-averaging heatmap. Unlike Leaflet.heat (which colors by density and
  // therefore paints any dense cluster with the top of the gradient), this
  // layer splats a Gaussian kernel for every point into two buffers and colors
  // each pixel by the *weighted average* of the underlying weightage values,
  // so red points produce red heat and green points produce green heat.
  const UploadHeatmapLayer = L.Layer.extend({
    onAdd: function (m) {
      this._map = m;
      if (!m.getPane('uploadHeatPane')) {
        m.createPane('uploadHeatPane');
        m.getPane('uploadHeatPane').style.zIndex = 459;
        m.getPane('uploadHeatPane').style.pointerEvents = 'none';
      }
      this._canvas = L.DomUtil.create('canvas', 'upload-heat-canvas leaflet-zoom-hide');
      this._canvas.style.position = 'absolute';
      this._canvas.style.top = '0';
      this._canvas.style.left = '0';
      this._canvas.style.pointerEvents = 'none';
      m.getPane('uploadHeatPane').appendChild(this._canvas);

      m.on('move', this._render, this);
      m.on('moveend', this._render, this);
      m.on('zoomend', this._render, this);
      m.on('resize', this._render, this);
      this._render();
    },
    onRemove: function (m) {
      if (this._canvas) L.DomUtil.remove(this._canvas);
      m.off('move', this._render, this);
      m.off('moveend', this._render, this);
      m.off('zoomend', this._render, this);
      m.off('resize', this._render, this);
    },
    _render: function () {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      if (size.x === 0 || size.y === 0) return;

      if (this._canvas.width !== size.x || this._canvas.height !== size.y) {
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._canvas.style.width = size.x + 'px';
        this._canvas.style.height = size.y + 'px';
      }
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);

      const ctx = this._canvas.getContext('2d');
      ctx.clearRect(0, 0, size.x, size.y);

      const data = filteredRows();
      if (!data.length) return;

      const b = this._map.getBounds();
      const south = b.getSouth(), north = b.getNorth(), west = b.getWest(), east = b.getEast();
      const [wLo, wHi] = weightRange();
      const span = (wHi - wLo) || 1;

      // Render into a downsampled buffer for performance, then scale up with
      // bilinear smoothing — gives us the blur of Leaflet.heat for free.
      const SCALE = 3;
      const W = Math.max(1, Math.ceil(size.x / SCALE));
      const H = Math.max(1, Math.ceil(size.y / SCALE));

      const heatR = CFG.UPLOAD.HEATMAP_RADIUS;       // screen px
      const r = Math.max(2, heatR / SCALE);          // buffer px
      const rSq = r * r;
      const twoSigmaSq = 2 * (r * 0.5) * (r * 0.5);
      const kernelR = Math.ceil(r);

      const N = W * H;
      const scoreSum = new Float32Array(N);
      const weightSum = new Float32Array(N);

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row.latitude < south || row.latitude > north) continue;
        if (row.longitude < west || row.longitude > east) continue;
        const pt = this._map.latLngToContainerPoint([row.latitude, row.longitude]);
        const cx = pt.x / SCALE;
        const cy = pt.y / SCALE;
        const norm = (row.weightage - wLo) / span;

        const x0 = Math.max(0, Math.floor(cx - kernelR));
        const x1 = Math.min(W - 1, Math.ceil(cx + kernelR));
        const y0 = Math.max(0, Math.floor(cy - kernelR));
        const y1 = Math.min(H - 1, Math.ceil(cy + kernelR));

        for (let y = y0; y <= y1; y++) {
          const dy = y - cy;
          const dySq = dy * dy;
          const rowBase = y * W;
          for (let x = x0; x <= x1; x++) {
            const dx = x - cx;
            const dSq = dx * dx + dySq;
            if (dSq > rSq) continue;
            const w = Math.exp(-dSq / twoSigmaSq);
            const idx = rowBase + x;
            weightSum[idx] += w;
            scoreSum[idx] += w * norm;
          }
        }
      }

      const img = ctx.createImageData(W, H);
      const out = img.data;
      // Alpha: invisible below epsilon, ramps to full by ~1.5 accumulated weight
      // (i.e. roughly 2 overlapping points). Respects user opacity slider.
      const minOpacity = 0.35;
      const alphaDenom = 1.5;
      const userA = style.opacity;
      for (let i = 0; i < N; i++) {
        const w = weightSum[i];
        if (w < 0.05) continue;
        const avg = scoreSum[i] / w;
        const c = gradientColor(avg * 100);
        const o = i * 4;
        out[o]     = c[0];
        out[o + 1] = c[1];
        out[o + 2] = c[2];
        const a = Math.max(minOpacity, Math.min(1, w / alphaDenom));
        out[o + 3] = Math.round(a * userA * 255);
      }

      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      off.getContext('2d').putImageData(img, 0, 0);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, 0, 0, size.x, size.y);
    },
  });

  function buildHeatmap() {
    return new UploadHeatmapLayer();
  }

  function buildClusters() {
    const group = L.markerClusterGroup({
      maxClusterRadius: CFG.UPLOAD.CLUSTER_RADIUS,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const childs = cluster.getAllChildMarkers();
        let sum = 0;
        for (const c of childs) sum += c.options._weight || 0;
        const mean = sum / childs.length;
        const c = gradientColor(mean);
        const css = `rgb(${c[0]},${c[1]},${c[2]})`;
        const n = childs.length;
        const size = n > 100 ? 56 : n > 25 ? 46 : n > 8 ? 38 : 32;
        return L.divIcon({
          html: `<div class="cluster-bubble" style="background:${css};width:${size}px;height:${size}px;line-height:${size}px">${n}</div>`,
          className: 'urbanpulse-cluster',
          iconSize: L.point(size, size),
        });
      },
    });

    const [wLo, wHi] = weightRange();
    const span = (wHi - wLo) || 1;
    for (const r of filteredRows()) {
      const norm = ((r.weightage - wLo) / span) * 100;
      const c = gradientColor(norm);
      const css = `rgb(${c[0]},${c[1]},${c[2]})`;
      const m = L.circleMarker([r.latitude, r.longitude], {
        radius: Math.max(4, style.radius),
        color: '#ffffff',
        weight: 1,
        fillColor: css,
        fillOpacity: style.opacity,
        _weight: r.weightage,
      });
      m._row = r;
      m.on('click', () => { for (const fn of pickHandlers) fn(r); });
      group.addLayer(m);
    }
    return group;
  }

  function refresh() {
    if (!map) return;
    detach();
    if (!rows.length) return;

    if (mode === 'points') {
      if (!pointsCanvas) pointsCanvas = new UploadPointsLayer();
      pointsCanvas.addTo(map);
      pointsCanvas._render && pointsCanvas._render();
    } else if (mode === 'heatmap') {
      heatLayer = buildHeatmap();
      if (heatLayer) heatLayer.addTo(map);
    } else if (mode === 'clusters') {
      clusterGroup = buildClusters();
      clusterGroup.addTo(map);
    }
  }

  // --------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------
  function init(leafletMap) {
    map = leafletMap;
  }
  function setData(newRows) {
    rows = newRows || [];
    refresh();
  }
  function setMode(newMode) {
    if (newMode === mode) return;
    mode = newMode;
    refresh();
  }
  function setGradient(name) {
    if (!CFG.GRADIENT_PRESETS[name]) return;
    gradientName = name;
    gradient = CFG.GRADIENT_PRESETS[name];
    refresh();
  }
  function setStyle(s) {
    Object.assign(style, s || {});
    if (pointsCanvas && pointsCanvas._render) pointsCanvas._render();
    if (mode === 'clusters') refresh();
  }
  function setFilter(f) {
    filter = { min: f.min, max: f.max };
    refresh();
  }
  function onPick(fn) { pickHandlers.push(fn); }
  function clear() { rows = []; refresh(); }
  function getRows() { return rows; }
  function getFilteredRows() { return filteredRows(); }
  function getGradient() { return { name: gradientName, stops: gradient }; }
  function fitToData() {
    if (!rows.length || !map) return;
    let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
    for (let i = 0; i < rows.length; i++) {
      const lat = rows[i].latitude, lon = rows[i].longitude;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lon < west) west = lon;
      if (lon > east) east = lon;
    }
    if (!Number.isFinite(south)) return;
    map.fitBounds([[south, west], [north, east]], { padding: [40, 40] });
  }

  return {
    init, setData, setMode, setGradient, setStyle, setFilter,
    onPick, clear, getRows, getFilteredRows, getGradient, fitToData,
  };
})();
