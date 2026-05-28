/**
 * points-layer.js
 * ---------------
 * A custom Leaflet layer that renders a flat array of [lon, lat, score]
 * tuples to a canvas overlay. Designed to handle hundreds of thousands of
 * points with smooth panning by viewport-clipping inside the draw loop.
 *
 * The layer is data-source-agnostic — call `setData(points)` whenever your
 * dataset changes (e.g., when new tiles arrive or the user changes the
 * filter range). The layer itself does no I/O.
 *
 * Filtering is supported via `setFilter({min, max})` so the renderer can
 * skip points whose score is outside the active range without needing to
 * re-allocate the underlying array.
 */

window.PWSPointsLayer = L.Layer.extend({

  initialize: function (options) {
    L.setOptions(this, options || {});
    this._data = [];
    this._filterMin = 0;
    this._filterMax = 100;
    /** Optional callback: function(visibleCount: number) */
    this._onRender = options && options.onRender;
  },

  // -------------------------------------------------------------------------
  // Leaflet lifecycle
  // -------------------------------------------------------------------------
  onAdd: function (map) {
    this._map = map;

    // Create our own pane to control z-order. Leaflet's overlayPane is
    // shared with path renderers and can fight with our positioning logic.
    if (!map.getPane('urbanpulsePane')) {
      map.createPane('urbanpulsePane');
      const pane = map.getPane('urbanpulsePane');
      pane.style.zIndex = 450;
      pane.style.pointerEvents = 'none';
    }

    this._canvas = L.DomUtil.create('canvas', 'urbanpulse-canvas leaflet-zoom-hide');
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
    this._canvas.style.pointerEvents = 'none';
    map.getPane('urbanpulsePane').appendChild(this._canvas);

    // Bind events. `move` (during drag) keeps the canvas synchronised with
    // the basemap; `moveend`/`zoomend` redraw at full quality afterwards.
    map.on('move',     this._render, this);
    map.on('moveend',  this._render, this);
    map.on('zoomend',  this._render, this);
    map.on('resize',   this._render, this);
    map.on('viewreset', this._render, this);

    this._render();
  },

  onRemove: function (map) {
    if (this._canvas) L.DomUtil.remove(this._canvas);
    map.off('move',      this._render, this);
    map.off('moveend',   this._render, this);
    map.off('zoomend',   this._render, this);
    map.off('resize',    this._render, this);
    map.off('viewreset', this._render, this);
  },

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  setData: function (points) {
    this._data = points || [];
    this._render();
  },

  setFilter: function ({ min, max }) {
    this._filterMin = (typeof min === 'number') ? min : 0;
    this._filterMax = (typeof max === 'number') ? max : 100;
    this._render();
  },

  getData: function () { return this._data; },

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  _radius: function (zoom) {
    const table = window.URBANPULSE_CONFIG.POINT_RADIUS_BY_ZOOM;
    return table[zoom] != null ? table[zoom]
         : zoom < 10 ? 1.0
         : zoom > 19 ? 7.0
         : 3.0;
  },

  _alpha: function (zoom) {
    const table = window.URBANPULSE_CONFIG.POINT_ALPHA_BY_ZOOM;
    return table[zoom] != null ? table[zoom] : 0.85;
  },

  _render: function () {
    if (!this._map || !this._canvas) return;
    const map = this._map;
    const size = map.getSize();
    if (size.x === 0 || size.y === 0) return;

    const dpr = window.devicePixelRatio || 1;

    // Resize canvas to match viewport (HiDPI-aware)
    if (this._canvas.width !== size.x * dpr || this._canvas.height !== size.y * dpr) {
      this._canvas.width  = size.x * dpr;
      this._canvas.height = size.y * dpr;
      this._canvas.style.width  = size.x + 'px';
      this._canvas.style.height = size.y + 'px';
    }

    // Position the canvas at the viewport's top-left in layer coords
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const ctx = this._canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    const data = this._data;
    if (!data || data.length === 0) {
      if (this._onRender) this._onRender(0);
      return;
    }

    const zoom = map.getZoom();
    const radius = this._radius(zoom);
    const alpha  = this._alpha(zoom);

    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west  = bounds.getWest();
    const east  = bounds.getEast();

    const fMin = this._filterMin;
    const fMax = this._filterMax;
    const scoreFor = window.ColorScale.colorFor;

    let drawn = 0;
    // Hot loop — keep it tight, no closures, no allocation.
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const lat = d[1], lon = d[0], score = d[2];
      if (lat < south || lat > north || lon < west || lon > east) continue;
      if (score < fMin || score > fMax) continue;

      const pt = map.latLngToContainerPoint([lat, lon]);
      const c = scoreFor(score);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, 6.2832);
      ctx.fill();
      drawn++;
    }

    if (this._onRender) this._onRender(drawn);
  },
});

window.createPWSPointsLayer = function (options) {
  return new window.PWSPointsLayer(options);
};
