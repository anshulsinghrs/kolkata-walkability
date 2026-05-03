/**
 * app.js
 * ------
 * Entry point. Orchestrates the other modules:
 *
 *   1. Show "Initialising"
 *   2. Initialise the map
 *   3. Load manifest + overview from the static data folder
 *   4. Render the overview at low zoom; switch to viewport-tile loading at
 *      high zoom
 *   5. Wire up filter slider, basemap toggles, click-to-inspect
 *
 * Each module is intentionally small. If you want to swap Leaflet for
 * MapLibre, only `map-view.js` and the rendering primitives in
 * `points-layer.js` need to change.
 */

(function () {
  'use strict';

  const CFG = window.IAMSM_CONFIG;

  // ---- State ---------------------------------------------------------------
  let pointsLayer = null;
  let currentMode = 'overview';   // 'overview' | 'tiles'
  let activeFilter = { min: 0, max: 100 };

  // ---- Click-to-inspect ----------------------------------------------------
  function attachClickHandler(map) {
    map.on('click', (e) => {
      const zoom = map.getZoom();
      if (zoom < CFG.CLICK_MIN_ZOOM) {
        L.popup({ closeButton: true })
          .setLatLng(e.latlng)
          .setContent(
            '<div style="font-family:var(--mono);font-size:11px;' +
            'color:var(--text-dim)">Zoom in to inspect individual points</div>'
          )
          .openOn(map);
        return;
      }

      const data = pointsLayer.getData();
      if (!data || data.length === 0) return;

      const clickPt = map.latLngToContainerPoint(e.latlng);
      const tol = CFG.CLICK_TOLERANCE_PX;
      const bounds = map.getBounds();

      let nearest = null;
      let nearestDist = Infinity;
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const lat = d[1], lon = d[0];
        if (lat < bounds.getSouth() || lat > bounds.getNorth()) continue;
        if (lon < bounds.getWest()  || lon > bounds.getEast())  continue;
        if (d[2] < activeFilter.min || d[2] > activeFilter.max) continue;
        const pt = map.latLngToContainerPoint([lat, lon]);
        const dx = pt.x - clickPt.x, dy = pt.y - clickPt.y;
        const dist = dx * dx + dy * dy;
        if (dist < nearestDist) { nearestDist = dist; nearest = d; }
      }

      if (nearest && Math.sqrt(nearestDist) <= tol) {
        const c = window.ColorScale.colorFor(nearest[2]);
        const rating = window.ColorScale.ratingFor(nearest[2]);
        const cssColor = window.ColorScale.rgbCss(c);
        L.popup({ closeButton: true })
          .setLatLng([nearest[1], nearest[0]])
          .setContent(`
            <div class="popup-score" style="color:${cssColor}">
              ${nearest[2].toFixed(1)}<span class="denom"> / 100</span>
            </div>
            <div class="popup-rating" style="color:${cssColor}">${rating}</div>
            <div class="popup-row">
              <span class="k">Latitude</span>
              <span class="v">${nearest[1].toFixed(5)}°</span>
            </div>
            <div class="popup-row">
              <span class="k">Longitude</span>
              <span class="v">${nearest[0].toFixed(5)}°</span>
            </div>
            <div class="popup-row">
              <span class="k">PWS Index</span>
              <span class="v">${(nearest[2] / 100).toFixed(4)}</span>
            </div>
          `)
          .openOn(map);
      }
    });
  }

  // ---- Main ----------------------------------------------------------------
  async function bootstrap() {
    window.UIControls.setStatus('Initialising map…');

    const map = window.MapView.init('map');

    // Build the points layer and add it (will render empty until we have data)
    pointsLayer = window.createPWSPointsLayer({
      onRender: (count) => window.UIControls.setVisibleCount(count),
    });
    pointsLayer.addTo(map);

    attachClickHandler(map);

    // Load manifest first
    let manifest;
    try {
      window.UIControls.setStatus('Loading manifest…');
      manifest = await window.DataLoader.loadManifest();
    } catch (err) {
      console.error(err);
      window.UIControls.setStatus('ERROR: manifest missing — run process_data.py', 'err');
      return;
    }

    window.UIControls.setStatsFromManifest(manifest);
    window.MapView.fitToBounds([
      [manifest.bounds.min_lat, manifest.bounds.min_lon],
      [manifest.bounds.max_lat, manifest.bounds.max_lon],
    ]);

    // Load overview for low-zoom view
    try {
      window.UIControls.setStatus(
        `Loading overview (${manifest.overview.count.toLocaleString()} pts)…`
      );
      await window.DataLoader.loadOverview();
    } catch (err) {
      console.error(err);
      window.UIControls.setStatus('ERROR: overview load failed', 'err');
      return;
    }

    // First render of the overview
    pointsLayer.setData(window.DataLoader.getOverview());
    window.UIControls.setStatus(
      `✓ ${manifest.score_stats.count.toLocaleString()} PWS points indexed`,
      'ok'
    );

    // ---- Mode-switching on map move/zoom -----------------------------------
    let pendingTileLoad = null;
    async function refreshFromViewport() {
      const m = window.MapView.getMap();
      const zoom = m.getZoom();

      if (zoom <= CFG.MAP.OVERVIEW_MAX_ZOOM) {
        // Low zoom — show overview only
        if (currentMode !== 'overview') {
          currentMode = 'overview';
          pointsLayer.setData(window.DataLoader.getOverview());
        }
        return;
      }

      // High zoom — load tiles intersecting the viewport
      currentMode = 'tiles';
      const bounds = m.getBounds();

      // Debounce concurrent loads
      const reqId = Symbol();
      pendingTileLoad = reqId;

      await window.DataLoader.ensureTilesForBounds(bounds);
      if (pendingTileLoad !== reqId) return;  // superseded

      const visible = window.DataLoader.collectVisiblePoints(bounds);
      pointsLayer.setData(visible);
    }

    // Re-render on every move (DataLoader change events keep it incremental)
    window.MapView.onMoveEnd(refreshFromViewport);

    window.DataLoader.onChange(() => {
      // New tile arrived — refresh visible points
      const m = window.MapView.getMap();
      const zoom = m.getZoom();
      if (zoom > CFG.MAP.OVERVIEW_MAX_ZOOM) {
        const visible = window.DataLoader.collectVisiblePoints(m.getBounds());
        pointsLayer.setData(visible);
      }
    });

    // ---- UI wiring ---------------------------------------------------------
    window.UIControls.onFilterChange(({ min, max }) => {
      activeFilter = { min, max };
      pointsLayer.setFilter({ min, max });
    });

    window.UIControls.onBasemapChange((key) => {
      window.MapView.setBasemap(key);
    });

    // Trigger an initial viewport check after `fitToBounds` settles
    setTimeout(refreshFromViewport, 200);

    // Expose for debugging in DevTools
    window.__iamsm = {
      map,
      pointsLayer,
      dataLoader: window.DataLoader,
      manifest,
    };
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
