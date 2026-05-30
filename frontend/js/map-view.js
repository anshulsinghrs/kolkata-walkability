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

  function buildBasemaps() {
    const defs = CFG.BASEMAPS;
    const max = CFG.MAP.MAX_ZOOM;

    basemapInstances.dark = L.tileLayer(defs.dark.url, {
      attribution: defs.dark.attribution,
      subdomains: defs.dark.subdomains,
      maxZoom: max,
    });
    darkLabelsLayer = L.tileLayer(defs.dark.labels, {
      subdomains: defs.dark.subdomains,
      maxZoom: max,
    });
    basemapInstances.light = L.tileLayer(defs.light.url, {
      attribution: defs.light.attribution,
      subdomains: defs.light.subdomains,
      maxZoom: max,
    });
    basemapInstances.osm = L.tileLayer(defs.osm.url, {
      attribution: defs.osm.attribution,
      subdomains: defs.osm.subdomains,
      maxZoom: max,
    });
    basemapInstances.sat = L.tileLayer(defs.sat.url, {
      attribution: defs.sat.attribution,
      maxZoom: max,
    });
    basemapInstances.topo = L.tileLayer(defs.topo.url, {
      attribution: defs.topo.attribution,
      subdomains: defs.topo.subdomains,
      maxZoom: defs.topo.maxZoom || max,
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
    const defaultKey = CFG.MAP.DEFAULT_BASEMAP || 'light';
    currentBase = basemapInstances[defaultKey] || basemapInstances.light;
    currentBase.addTo(map);
    if (defaultKey === 'dark') darkLabelsLayer.addTo(map);
    document.body.dataset.basemap = defaultKey;

    return map;
  }

  function setBasemap(key) {
    if (!basemapInstances[key]) return;
    if (currentBase) map.removeLayer(currentBase);
    if (map.hasLayer(darkLabelsLayer)) map.removeLayer(darkLabelsLayer);

    currentBase = basemapInstances[key];
    currentBase.addTo(map);
    currentBase.bringToBack();

    if (key === 'dark') darkLabelsLayer.addTo(map);
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
