// app.js — bootstraps the Walkability Atlas

(function () {
  'use strict';

  const CFG = window.IAMSM_CONFIG;
  const U = window.UIControls;

  let pwsLayer = null;
  let pwsVisible = true;
  let currentMode = 'overview';
  let activeFilter = { min: 0, max: 100 };
  let parsedRows = null;
  let parsedMeta = null;

  // ---- Click on research PWS layer ------------------------------------
  function attachResearchClick(map) {
    map.on('click', (e) => {
      const zoom = map.getZoom();
      if (zoom < CFG.CLICK_MIN_ZOOM) return;
      if (!pwsLayer || !pwsVisible) return;
      // If an uploaded dataset is active, let UploadLayer own clicks
      if (window.UploadLayer.getRows().length > 0) return;

      const data = pwsLayer.getData();
      if (!data || data.length === 0) return;

      const clickPt = map.latLngToContainerPoint(e.latlng);
      const tol = CFG.CLICK_TOLERANCE_PX;
      const bounds = map.getBounds();
      let nearest = null, nearestDist = Infinity;
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
        window.DetailDrawer.open({
          id: '—',
          latitude: nearest[1],
          longitude: nearest[0],
          weightage: nearest[2],
        });
      }
    });
  }

  // ---- Upload pipeline ------------------------------------------------
  async function handleFile(file) {
    if (!file) return;
    U.hideDetectedColumns();
    U.showUploadProgress(0.02, `Reading ${file.name}…`);
    try {
      const result = await window.CSVLoader.parseFile(file, {
        onProgress: (p) => U.showUploadProgress(p, `Parsing… ${Math.round(p * 100)}%`),
      });
      const { rows, headers, mapping, kind } = result;
      U.showUploadProgress(1, `Validating ${rows.length.toLocaleString()} rows…`);

      const missing = ['latitude', 'longitude'].filter((r) => !mapping[r]);
      if (missing.length) {
        U.setStatus(`✗ Missing required column(s): ${missing.join(', ')}`, 'err');
        U.hideUploadProgress();
        return;
      }
      if (!mapping.weightage) {
        U.setStatus('⚠ No weightage column found — using 50 for all rows', 'ok');
      }

      const { rows: canonical, stats } = window.CSVLoader.normalize(rows, headers, mapping);
      if (canonical.length === 0) {
        U.setStatus('✗ No valid rows after validation', 'err');
        U.hideUploadProgress();
        return;
      }

      parsedRows = canonical;
      parsedMeta = { headers, mapping, kind, stats, filename: file.name };

      U.showDetectedColumns(headers, mapping, stats);
      setTimeout(U.hideUploadProgress, 800);
      U.setStatus(`✓ Parsed ${stats.kept.toLocaleString()} points — press "Map Data"`, 'ok');
    } catch (err) {
      console.error(err);
      U.setStatus(`✗ Parse failed: ${err.message || err}`, 'err');
      U.hideUploadProgress();
    }
  }

  function mapParsedData() {
    if (!parsedRows || !parsedRows.length) {
      U.setStatus('Upload a CSV first', 'err');
      return;
    }
    const recomputed = window.Weights.recompute(parsedRows);
    const hasIndicators = recomputed.some((r) => r._recomputed);
    window.UploadLayer.setData(recomputed);
    window.UploadLayer.fitToData();
    U.setStatsFromUpload(parsedMeta.stats);
    U.setLegendTitle(`Uploaded · ${parsedMeta.filename}`);
    U.setStatus(
      hasIndicators
        ? `✓ Mapped ${recomputed.length.toLocaleString()} points · weights applied`
        : `✓ Mapped ${recomputed.length.toLocaleString()} points`,
      'ok'
    );
    hideWelcome();
  }

  function clearUpload() {
    parsedRows = null;
    parsedMeta = null;
    window.UploadLayer.clear();
    U.hideDetectedColumns();
    U.hideUploadProgress();
    U.setLegendTitle('Perceived Walkability Score');
    showWelcome();
  }

  function hideWelcome() {
    var el = document.getElementById('welcome-overlay');
    if (el) el.classList.add('hidden');
  }

  function showWelcome() {
    var el = document.getElementById('welcome-overlay');
    if (el && !window.DataLoader.getManifest() && (!parsedRows || !parsedRows.length)) {
      el.classList.remove('hidden');
    }
  }

  // ---- Bootstrap ------------------------------------------------------
  async function bootstrap() {
    U.initTabs();
    U.setStatus('Initialising map…');

    const map = window.MapView.init('map');
    window.UploadLayer.init(map);

    pwsLayer = window.createPWSPointsLayer({
      onRender: (count) => U.setVisibleCount(count),
    });
    pwsLayer.addTo(map);

    attachResearchClick(map);
    window.UploadLayer.onPick((row) => window.DetailDrawer.open(row));

    U.onFilterChange(({ min, max }) => {
      activeFilter = { min, max };
      pwsLayer.setFilter({ min, max });
      window.UploadLayer.setFilter({ min, max });
    });
    U.onBasemapChange((key) => window.MapView.setBasemap(key));
    U.onPWSToggle((on) => {
      pwsVisible = on;
      if (on) pwsLayer.addTo(map);
      else if (map.hasLayer(pwsLayer)) map.removeLayer(pwsLayer);
    });
    U.onVizModeChange((mode) => window.UploadLayer.setMode(mode));
    U.onGradientChange((name) => window.UploadLayer.setGradient(name));
    U.onStyleChange((s) => window.UploadLayer.setStyle(s));
    U.onWeightsChange(
      null,
      () => {
        if (!parsedRows) { U.setStatus('Upload a CSV first to apply weights', 'err'); return; }
        mapParsedData();
      },
      () => { if (parsedRows) mapParsedData(); }
    );
    U.onUpload(handleFile);
    U.onMapData(mapParsedData);
    U.onClearUpload(clearUpload);

    var dismissBtn = document.getElementById('welcome-dismiss');
    if (dismissBtn) dismissBtn.addEventListener('click', hideWelcome);

    // ---- 3D / VR ----------------------------------------------------------
    function get3DData() {
      const uploadRows = window.UploadLayer.getRows();
      if (uploadRows && uploadRows.length > 0) {
        return uploadRows.map((r) => [r.longitude, r.latitude, r.weightage || 50]);
      }
      return window.DataLoader.getOverview() || [];
    }

    U.on3DEnter(() => {
      const data = get3DData();
      if (!data || data.length === 0) {
        U.setStatus('No data to visualize in 3D', 'err');
        return;
      }
      window.ThreeScene.enter(data);
      U.show3DExitButton();
      U.setStatus(`3D mode — ${data.length.toLocaleString()} points`, 'ok');
    });
    U.on3DExit(() => {
      window.ThreeScene.exit();
      U.hide3DExitButton();
      U.setStatus('Returned to 2D map', 'ok');
    });
    U.on3DSettings((s) => {
      window.ThreeScene.setHeightScale(s.height);
      window.ThreeScene.setFOV(s.fov);
      window.ThreeScene.setFogDensity(s.fog);
    });

    window.ThreeScene.checkVRSupport().then((supported) => {
      U.setVRStatus(supported);
    });
    U.onVREnter(() => {
      if (!window.ThreeScene.isRunning()) {
        const data = get3DData();
        if (!data || data.length === 0) {
          U.setStatus('Launch 3D view first', 'err');
          return;
        }
        window.ThreeScene.enter(data);
        U.show3DExitButton();
      }
      window.ThreeScene.enterVR();
      U.setStatus('Entering VR…', 'ok');
    });

    U.onExport(async (kind) => {
      try {
        await window.Exporter.run(kind, {
          map,
          collectVisible: () => window.DataLoader.collectVisiblePoints(map.getBounds()),
        });
        U.setStatus('✓ Export ready', 'ok');
      } catch (e) {
        U.setStatus(`✗ ${e.message}`, 'err');
      }
    });

    // ---- Research data load --------------------------------------------
    let manifest;
    try {
      U.setStatus('Loading manifest…');
      manifest = await window.DataLoader.loadManifest();
    } catch (err) {
      console.log('No pre-built data found — ready for CSV upload');
      U.setStatus('Ready — upload a CSV to get started', 'ok');
      showWelcome();

      window.__iamsm = {
        map, pwsLayer, dataLoader: window.DataLoader,
        uploadLayer: window.UploadLayer, manifest: null,
      };
      return;
    }

    hideWelcome();
    U.setStatsFromManifest(manifest);
    window.MapView.fitToBounds([
      [manifest.bounds.min_lat, manifest.bounds.min_lon],
      [manifest.bounds.max_lat, manifest.bounds.max_lon],
    ]);

    try {
      U.setStatus(`Loading overview (${manifest.overview.count.toLocaleString()} pts)…`);
      await window.DataLoader.loadOverview();
    } catch (err) {
      console.error(err);
      U.setStatus('ERROR: overview load failed', 'err');
      return;
    }
    pwsLayer.setData(window.DataLoader.getOverview());
    U.setStatus(`✓ ${manifest.score_stats.count.toLocaleString()} PWS points indexed`, 'ok');

    let pendingTileLoad = null;
    async function refreshFromViewport() {
      const m = window.MapView.getMap();
      const zoom = m.getZoom();
      if (zoom <= CFG.MAP.OVERVIEW_MAX_ZOOM) {
        if (currentMode !== 'overview') {
          currentMode = 'overview';
          pwsLayer.setData(window.DataLoader.getOverview());
        }
        return;
      }
      currentMode = 'tiles';
      const reqId = Symbol();
      pendingTileLoad = reqId;
      await window.DataLoader.ensureTilesForBounds(m.getBounds());
      if (pendingTileLoad !== reqId) return;
      pwsLayer.setData(window.DataLoader.collectVisiblePoints(m.getBounds()));
    }
    window.MapView.onMoveEnd(refreshFromViewport);
    window.DataLoader.onChange(() => {
      const m = window.MapView.getMap();
      if (m.getZoom() > CFG.MAP.OVERVIEW_MAX_ZOOM) {
        pwsLayer.setData(window.DataLoader.collectVisiblePoints(m.getBounds()));
      }
    });
    setTimeout(refreshFromViewport, 200);

    window.__iamsm = {
      map, pwsLayer, dataLoader: window.DataLoader,
      uploadLayer: window.UploadLayer, manifest,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
