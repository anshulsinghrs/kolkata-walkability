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
  const MAX_FILE_BYTES = 50 * 1024 * 1024;

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  async function handleFiles(files) {
    if (!files || !files.length) return;
    const list = Array.from(files);

    const tooBig = list.find(f => (f.size || 0) > MAX_FILE_BYTES);
    if (tooBig) {
      U.setStatus(`✗ "${tooBig.name}" is ${fmtBytes(tooBig.size)} — max ${fmtBytes(MAX_FILE_BYTES)} per file`, 'err');
      return;
    }

    U.hideDetectedColumns();
    U.showUploadProgress(0.02, list.length === 1
      ? `Reading ${list[0].name}…`
      : `Reading ${list.length} files…`);

    const combinedRows = [];
    const filenames = [];
    let combinedHeaders = [];
    let firstMapping = null;
    let totalRowsIn = 0;
    let totalSkipped = 0;
    let weightSum = 0, weightMin = Infinity, weightMax = -Infinity, weightedCount = 0;

    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const fileBase = i / list.length;
        U.showUploadProgress(
          fileBase + 0.02 / list.length,
          `Parsing ${file.name} (${i + 1}/${list.length})…`,
        );

        const result = await window.CSVLoader.parseFile(file, {
          onProgress: (p) => U.showUploadProgress(
            fileBase + (p / list.length),
            `Parsing ${file.name}… ${Math.round(p * 100)}%`,
          ),
        });
        const { rows, headers, mapping } = result;

        const missing = ['latitude', 'longitude'].filter((r) => !mapping[r]);
        if (missing.length) {
          U.setStatus(`✗ "${file.name}": missing column(s) ${missing.join(', ')}`, 'err');
          U.hideUploadProgress();
          return;
        }
        if (!mapping.weightage && i === 0) {
          U.setStatus('⚠ No weightage column found — using 50 for missing rows', 'ok');
        }

        const { rows: canonical, stats } = window.CSVLoader.normalize(rows, headers, mapping);
        for (const r of canonical) {
          r._source = file.name;
          combinedRows.push(r);
        }
        totalRowsIn += stats.total;
        totalSkipped += stats.skipped;
        if (canonical.length) {
          weightSum += stats.weightMean * canonical.length;
          weightedCount += canonical.length;
          if (stats.weightMin < weightMin) weightMin = stats.weightMin;
          if (stats.weightMax > weightMax) weightMax = stats.weightMax;
        }
        filenames.push(file.name);
        if (!firstMapping) firstMapping = mapping;
        for (const h of headers) {
          if (!combinedHeaders.includes(h)) combinedHeaders.push(h);
        }
      }

      if (combinedRows.length === 0) {
        U.setStatus('✗ No valid rows after validation', 'err');
        U.hideUploadProgress();
        return;
      }

      const aggregateStats = {
        total: totalRowsIn,
        kept: combinedRows.length,
        skipped: totalSkipped,
        weightMean: weightedCount ? weightSum / weightedCount : 0,
        weightMin: Number.isFinite(weightMin) ? weightMin : 0,
        weightMax: Number.isFinite(weightMax) ? weightMax : 0,
      };

      parsedRows = combinedRows;
      parsedMeta = {
        headers: combinedHeaders,
        mapping: firstMapping,
        stats: aggregateStats,
        filename: list.length === 1 ? list[0].name : `${list.length} files`,
        filenames,
      };

      const fileSummary = list.length === 1
        ? null
        : `${list.length} merged (${filenames.slice(0, 3).join(', ')}${filenames.length > 3 ? ', …' : ''})`;
      U.showDetectedColumns(combinedHeaders, firstMapping, aggregateStats, fileSummary);
      U.showUploadProgress(1, 'Done');
      setTimeout(U.hideUploadProgress, 800);
      U.setStatus(
        list.length === 1
          ? `✓ Parsed ${aggregateStats.kept.toLocaleString()} points — press "Map Data"`
          : `✓ Parsed ${aggregateStats.kept.toLocaleString()} points from ${list.length} files — press "Map Data"`,
        'ok',
      );
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
    if (window.Analytics) window.Analytics.update(recomputed);
    U.setStatus(
      hasIndicators
        ? `✓ Mapped ${recomputed.length.toLocaleString()} points · weights applied`
        : `✓ Mapped ${recomputed.length.toLocaleString()} points`,
      'ok'
    );
  }

  function clearUpload() {
    parsedRows = null;
    parsedMeta = null;
    window.UploadLayer.clear();
    U.hideDetectedColumns();
    U.hideUploadProgress();
    U.setLegendTitle('Perceived Walkability Score');
    U.clearKPI();
  }

  function flyToCity(city) {
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
    U.onUpload(handleFiles);
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
    }
    U.bindHero({ onExplore: exploreDefaultCity });
    U.bindQuickActions({ onExplore: exploreDefaultCity });
    U.renderRecentCities(CFG.RECENT_CITIES, (city) => {
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
