/**
 * map-view.js
 * -----------
 * Owns the Leaflet map instance and basemap layers. Exposes a small API for
 * the rest of the app to interact with the map (fit bounds, switch base,
 * register click handlers).
 */

window.MapView = (function () {
  'use strict';

  const CFG = window.IAMSM_CONFIG;

  let map = null;
  /** @type {L.TileLayer | null} */
  let currentBase = null;
  /** @type {L.TileLayer | null} */
  let darkLabelsLayer = null;
  /** @type {Object<string, L.TileLayer>} */
  const basemapInstances = {};

  function buildBasemaps() {
    const defs = CFG.BASEMAPS;

    basemapInstances.dark = L.tileLayer(defs.dark.url, {
      attribution: defs.dark.attribution,
      subdomains: defs.dark.subdomains,
      maxZoom: CFG.MAP.MAX_ZOOM,
    });
    darkLabelsLayer = L.tileLayer(defs.dark.labels, {
      subdomains: defs.dark.subdomains,
      maxZoom: CFG.MAP.MAX_ZOOM,
    });
    basemapInstances.light = L.tileLayer(defs.light.url, {
      attribution: defs.light.attribution,
      subdomains: defs.light.subdomains,
      maxZoom: CFG.MAP.MAX_ZOOM,
    });
    basemapInstances.sat = L.tileLayer(defs.sat.url, {
      attribution: defs.sat.attribution,
      maxZoom: CFG.MAP.MAX_ZOOM,
    });
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

    buildBasemaps();
    currentBase = basemapInstances.dark;
    currentBase.addTo(map);
    darkLabelsLayer.addTo(map);

    return map;
  }

  function setBasemap(key) {
    if (!basemapInstances[key]) return;
    if (currentBase) map.removeLayer(currentBase);
    if (map.hasLayer(darkLabelsLayer)) map.removeLayer(darkLabelsLayer);

    currentBase = basemapInstances[key];
    currentBase.addTo(map);
    currentBase.bringToBack();

    if (key === 'dark') {
      darkLabelsLayer.addTo(map);
    }
  }

  function fitToBounds(bounds, padding = [40, 40]) {
    if (!map) return;
    map.fitBounds(bounds, { padding });
  }

  function onClick(handler) {
    if (!map) return;
    map.on('click', handler);
  }

  function onMoveEnd(handler) {
    if (!map) return;
    map.on('moveend', handler);
  }

  function getMap() { return map; }

  return { init, setBasemap, fitToBounds, onClick, onMoveEnd, getMap };
})();
