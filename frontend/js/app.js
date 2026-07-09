/**
 * app.js
 * ------
 * Bootstraps UrbanPulse — connects MapView, CitySearch, DataLoader/PWS layer,
 * UploadLayer, Weights, DetailDrawer, Exporter, and UIControls.
 */

(function () {
  'use strict';

  const CFG = window.URBANPULSE_CONFIG;
  const U = window.UIControls;

  let pwsLayer = null;
  let pwsVisible = true;
  let currentMode = 'overview';
  let activeFilter = { min: 0, max: 100 };
  let parsedRows = null;
  let parsedMeta = null;
  let sampleActive = false;

  // Derive KPI stats from a set of canonical rows (post-recompute), so the
  // dashboard always matches what is actually rendered on the map.
  function statsFromRows(rows, total) {
    let sum = 0, min = Infinity, max = -Infinity;
    for (const r of rows) {
      const w = r.weightage;
      sum += w;
      if (w < min) min = w;
      if (w > max) max = w;
    }
    const n = rows.length;
    const t = total != null ? total : n;
    return {
      total: t,
      kept: n,
      skipped: Math.max(0, t - n),
      weightMean: n ? sum / n : 0,
      weightMin: n ? min : 0,
      weightMax: n ? max : 0,
    };
  }

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
    const parseTotal = parsedMeta && parsedMeta.stats ? parsedMeta.stats.total : recomputed.length;
    U.setStatsFromUpload(statsFromRows(recomputed, parseTotal), parsedMeta && parsedMeta.tag);
    U.setLegendTitle(
      parsedMeta && parsedMeta.displayName
        ? parsedMeta.displayName
        : `Uploaded · ${parsedMeta.filename}`
    );
    if (window.Analytics) window.Analytics.update(recomputed);
    const noun = parsedMeta && parsedMeta.isSample ? 'sample points' : 'points';
    U.setStatus(
      hasIndicators
        ? `✓ Mapped ${recomputed.length.toLocaleString()} ${noun} · weights applied`
        : `✓ Mapped ${recomputed.length.toLocaleString()} ${noun}`,
      'ok'
    );
  }

  // Load the bundled synthetic sample so the flagship "Explore Kolkata"
  // demo actually populates the KPIs, analytics, filter and 3D view.
  function loadSampleKolkata() {
    if (!window.SampleData) return false;
    const { rows } = window.SampleData.kolkata();
    parsedRows = rows;
    parsedMeta = {
      filename: 'kolkata-sample.synthetic',
      displayName: 'Kolkata · Sample (synthetic)',
      tag: 'Sample',
      isSample: true,
      stats: statsFromRows(rows, rows.length),
    };
    sampleActive = true;
    mapParsedData();
    return true;
  }

  function clearUpload() {
    parsedRows = null;
    parsedMeta = null;
    sampleActive = false;
    window.UploadLayer.clear();
    U.hideDetectedColumns();
    U.hideUploadProgress();
    U.setLegendTitle('Perceived Walkability Score');
    U.clearKPI();
  }

  function flyToCity(city) {
    // The synthetic sample is pinned to Kolkata — drop it when the user
    // navigates to a different city so it never floats over the wrong place.
    if (sampleActive && !/kolkata/i.test(city.name || '')) {
      clearUpload();
    }
    if (city.bbox) {
      window.MapView.fitToBounds(city.bbox, [60, 60]);
    } else if (city.center) {
      window.MapView.getMap().setView(city.center, city.zoom || 11);
    }
    U.setCityProfile({
      name: city.name,
      population: city.population,
      area: city.area,
      density: city.density,
      tag: 'Active',
    });
    U.setLegendTitle(`Walkability — ${city.name}`);
    U.setStatus(`✓ Viewing ${city.name}`, 'ok');
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

    // ---- City search (Nominatim) ---------------------------------------
    window.CitySearch.bindUI({
      inputId: 'city-search-input',
      resultsId: 'city-search-results',
      onStatus: (msg, kind) => U.setStatus(msg, kind),
    });
    window.CitySearch.onSelect((place) => {
      flyToCity({
        name: place.name,
        bbox: place.bbox,
        center: place.center,
        zoom: 13,
        population: '—',
        area: '—',
        density: '—',
      });
    });

    // ---- Hero / quick-actions / recent cities --------------------------
    function exploreDefaultCity() {
      const c = CFG.DEFAULT_CITY;
      flyToCity({ ...c, tag: 'Default' });
      // Only fall back to the synthetic sample when no real research dataset
      // is bundled — otherwise the research PWS layer is the demo.
      if (!window.DataLoader.hasManifest()) {
        if (loadSampleKolkata()) {
          U.setStatus('✓ Showing a synthetic sample for Kolkata — upload your own data or search any city', 'ok');
        }
      }
    }
    U.bindHero({ onExplore: exploreDefaultCity });
    U.bindQuickActions({ onExplore: exploreDefaultCity });
    U.renderRecentCities(CFG.RECENT_CITIES, (city) => {
      // The Kolkata chip mirrors "Explore Kolkata" so it also loads the sample.
      if (/^kolkata$/i.test(city.name)) { exploreDefaultCity(); return; }
      flyToCity({
        name: city.name + ', India',
        center: city.center,
        zoom: city.zoom,
        population: '—',
        area: '—',
        density: '—',
      });
    }, 'Kolkata');

    // Auto-load the default city profile on first paint.
    U.setCityProfile({
      name: CFG.DEFAULT_CITY.name,
      population: CFG.DEFAULT_CITY.population,
      area: CFG.DEFAULT_CITY.area,
      density: CFG.DEFAULT_CITY.density,
      tag: 'Default',
    });

    // ---- Optional research-dataset overlay -----------------------------
    U.setStatus('Searching for an optional research dataset…');
    const manifest = await window.DataLoader.loadManifest();

    let pendingTileLoad = null;
    async function refreshFromViewport() {
      if (!window.DataLoader.hasManifest()) return;
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

    if (!manifest) {
      // No research dataset bundled — fly to default city and prompt.
      window.MapView.fitToBounds(CFG.DEFAULT_CITY.bbox, [60, 60]);
      U.setStatus('Ready — explore Kolkata, search any city, or upload a dataset', 'ok');
    } else {
      U.setStatsFromManifest(manifest);
      window.MapView.fitToBounds([
        [manifest.bounds.min_lat, manifest.bounds.min_lon],
        [manifest.bounds.max_lat, manifest.bounds.max_lon],
      ]);

      try {
        U.setStatus(`Loading overview (${manifest.overview.count.toLocaleString()} pts)…`);
        await window.DataLoader.loadOverview();
        const overview = window.DataLoader.getOverview();
        pwsLayer.setData(overview);
        // Feed the analytics dashboard from the PWS overview (array of [lon, lat, score])
        if (window.Analytics && overview && overview.length) {
          window.Analytics.update(overview.map((d) => ({ weightage: d[2] })));
          U.revealKPI('Research baseline');
        }
        U.setStatus(`✓ ${manifest.score_stats.count.toLocaleString()} research points indexed`, 'ok');
      } catch (err) {
        console.error(err);
        U.setStatus('⚠ Overview load failed — search a city or upload data', 'err');
      }
      setTimeout(refreshFromViewport, 200);
    }

    window.__urbanpulse = {
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
