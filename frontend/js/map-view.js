/**
 * map-view.js
 * -----------
 * Owns the Leaflet map instance and basemap layers.
 */

window.MapView = (function () {
  'use strict';

  const CFG = window.URBANPULSE_CONFIG;

  let map = null;
  let currentBase = null;
  let darkLabelsLayer = null;
  const basemapInstances = {};

  function getBasemap(key) {
    if (basemapInstances[key]) return basemapInstances[key];
    const defs = CFG.BASEMAPS;
    const max = CFG.MAP.MAX_ZOOM;
    const def = defs[key];
    if (!def) return null;
    const opts = {
      attribution: def.attribution,
      maxZoom: def.maxZoom || max,
    };
    if (def.subdomains) opts.subdomains = def.subdomains;
    basemapInstances[key] = L.tileLayer(def.url, opts);
    return basemapInstances[key];
  }

  function getDarkLabels() {
    if (darkLabelsLayer) return darkLabelsLayer;
    const def = CFG.BASEMAPS.dark;
    if (!def || !def.labels) return null;
    darkLabelsLayer = L.tileLayer(def.labels, {
      subdomains: def.subdomains,
      maxZoom: CFG.MAP.MAX_ZOOM,
    });
    return darkLabelsLayer;
  }

  function init(elementId) {
    map = L.map(elementId, {
      center: CFG.MAP.DEFAULT_CENTER,
      zoom: CFG.MAP.DEFAULT_ZOOM,
      minZoom: CFG.MAP.MIN_ZOOM,
      maxZoom: CFG.MAP.MAX_ZOOM,
      zoomControl: true,
      preferCanvas: true,
    });

    const defaultKey = CFG.MAP.DEFAULT_BASEMAP || 'light';
    currentBase = getBasemap(defaultKey) || getBasemap('light');
    currentBase.addTo(map);
    if (defaultKey === 'dark') {
      const labels = getDarkLabels();
      if (labels) labels.addTo(map);
    }
    document.body.dataset.basemap = defaultKey;

    return map;
  }

  function setBasemap(key) {
    const next = getBasemap(key);
    if (!next) return;
    if (currentBase) map.removeLayer(currentBase);
    if (darkLabelsLayer && map.hasLayer(darkLabelsLayer)) map.removeLayer(darkLabelsLayer);

    currentBase = next;
    currentBase.addTo(map);
    currentBase.bringToBack();

    if (key === 'dark') {
      const labels = getDarkLabels();
      if (labels) labels.addTo(map);
    }
    document.body.dataset.basemap = key;
  }

  function fitToBounds(bounds, padding = [40, 40]) {
    if (!map) return;
    map.fitBounds(bounds, { padding });
  }

  function onClick(handler) { if (map) map.on('click', handler); }
  function onMoveEnd(handler) { if (map) map.on('moveend', handler); }
  function getMap() { return map; }

  return { init, setBasemap, fitToBounds, onClick, onMoveEnd, getMap };
})();
