window.MapView = (function () {
  'use strict';

  const CFG = window.IAMSM_CONFIG;

  let map = null;
  let currentBase = null;
  let currentBaseKey = 'dark';
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

  function addScaleBar() {
    L.control.scale({
      position: 'bottomright',
      metric: true,
      imperial: false,
      maxWidth: 160,
    }).addTo(map);
  }

  function addCoordinateDisplay() {
    const CoordControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        this._el = L.DomUtil.create('div', 'coord-display glass');
        this._el.innerHTML = '—';
        return this._el;
      },
      update: function (lat, lng) {
        this._el.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
      },
      clear: function () {
        this._el.innerHTML = '—';
      },
    });
    const ctrl = new CoordControl();
    ctrl.addTo(map);
    map.on('mousemove', function (e) { ctrl.update(e.latlng.lat, e.latlng.lng); });
    map.on('mouseout', function () { ctrl.clear(); });
  }

  function addGeolocationButton() {
    const LocateControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-locate-btn');
        btn.innerHTML = '<a href="#" title="Find my location" role="button" aria-label="Find my location">'
          + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">'
          + '<circle cx="12" cy="12" r="3"/>'
          + '<path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>'
          + '<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/>'
          + '</svg></a>';
        L.DomEvent.disableClickPropagation(btn);
        btn.querySelector('a').addEventListener('click', function (e) {
          e.preventDefault();
          btn.classList.add('locating');
          map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true });
        });
        this._btn = btn;
        return btn;
      },
    });
    const locCtrl = new LocateControl();
    locCtrl.addTo(map);

    let locMarker = null;
    let locCircle = null;
    map.on('locationfound', function (e) {
      locCtrl._btn.classList.remove('locating');
      if (locMarker) map.removeLayer(locMarker);
      if (locCircle) map.removeLayer(locCircle);
      locCircle = L.circle(e.latlng, {
        radius: e.accuracy / 2,
        color: '#d4a574',
        fillColor: '#d4a574',
        fillOpacity: 0.12,
        weight: 1,
      }).addTo(map);
      locMarker = L.circleMarker(e.latlng, {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#d4a574',
        fillOpacity: 1,
      }).addTo(map);
    });
    map.on('locationerror', function () {
      locCtrl._btn.classList.remove('locating');
    });
  }

  function addFullscreenButton() {
    const FsControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-fs-btn');
        btn.innerHTML = '<a href="#" title="Toggle fullscreen" role="button" aria-label="Toggle fullscreen">'
          + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">'
          + '<path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>'
          + '</svg></a>';
        L.DomEvent.disableClickPropagation(btn);
        btn.querySelector('a').addEventListener('click', function (e) {
          e.preventDefault();
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(function () {});
          } else {
            document.exitFullscreen();
          }
        });
        return btn;
      },
    });
    new FsControl().addTo(map);
  }

  function addSearchControl() {
    const SearchControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const wrap = L.DomUtil.create('div', 'map-search-wrap');
        wrap.innerHTML =
          '<div class="map-search glass">'
          + '<svg class="search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">'
          + '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>'
          + '</svg>'
          + '<input type="text" class="search-input" placeholder="Search location..." autocomplete="off" />'
          + '<ul class="search-results"></ul>'
          + '</div>';
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);

        const input = wrap.querySelector('.search-input');
        const results = wrap.querySelector('.search-results');
        let debounce = null;
        let searchMarker = null;

        input.addEventListener('input', function () {
          clearTimeout(debounce);
          const q = input.value.trim();
          if (q.length < 3) { results.innerHTML = ''; results.style.display = 'none'; return; }
          debounce = setTimeout(function () { doSearch(q); }, 350);
        });

        input.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            input.value = '';
            results.innerHTML = '';
            results.style.display = 'none';
            input.blur();
          }
        });

        function doSearch(q) {
          var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q);
          fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              results.innerHTML = '';
              if (!data.length) {
                results.innerHTML = '<li class="search-empty">No results</li>';
                results.style.display = 'block';
                return;
              }
              for (var i = 0; i < data.length; i++) {
                var item = data[i];
                var li = document.createElement('li');
                li.className = 'search-item';
                li.textContent = item.display_name;
                li.dataset.lat = item.lat;
                li.dataset.lon = item.lon;
                li.addEventListener('click', function () {
                  var lat = parseFloat(this.dataset.lat);
                  var lon = parseFloat(this.dataset.lon);
                  map.setView([lat, lon], 15, { animate: true });
                  if (searchMarker) map.removeLayer(searchMarker);
                  searchMarker = L.circleMarker([lat, lon], {
                    radius: 8, color: '#fff', weight: 2.5,
                    fillColor: '#d4a574', fillOpacity: 1,
                  }).addTo(map);
                  searchMarker.bindPopup('<strong>' + this.textContent.split(',')[0] + '</strong>').openPopup();
                  results.innerHTML = '';
                  results.style.display = 'none';
                  input.value = this.textContent.split(',')[0];
                });
                results.appendChild(li);
              }
              results.style.display = 'block';
            })
            .catch(function () {
              results.innerHTML = '<li class="search-empty">Search failed</li>';
              results.style.display = 'block';
            });
        }

        document.addEventListener('click', function (e) {
          if (!wrap.contains(e.target)) {
            results.innerHTML = '';
            results.style.display = 'none';
          }
        });

        return wrap;
      },
    });
    new SearchControl().addTo(map);
  }

  function addMinimap() {
    var miniTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
    });

    var MiniMapControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var container = L.DomUtil.create('div', 'minimap-wrap glass');
        container.innerHTML = '<div class="minimap-inner" id="minimap-inner"></div>';
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        setTimeout(function () {
          var mini = L.map('minimap-inner', {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            tap: false,
            touchZoom: false,
          });
          miniTile.addTo(mini);

          var rect = null;
          function syncMini() {
            var c = map.getCenter();
            var z = Math.max(map.getZoom() - 4, 1);
            mini.setView(c, z, { animate: false });

            if (rect) mini.removeLayer(rect);
            rect = L.rectangle(map.getBounds(), {
              color: '#d4a574',
              weight: 1.5,
              fillColor: '#d4a574',
              fillOpacity: 0.1,
              dashArray: '4 3',
            }).addTo(mini);
          }
          map.on('moveend zoomend', syncMini);
          syncMini();
        }, 100);

        return container;
      },
    });
    new MiniMapControl().addTo(map);
  }

  function init(elementId) {
    map = L.map(elementId, {
      center: CFG.MAP.DEFAULT_CENTER,
      zoom: CFG.MAP.DEFAULT_ZOOM,
      minZoom: CFG.MAP.MIN_ZOOM,
      maxZoom: CFG.MAP.MAX_ZOOM,
      zoomControl: false,
      preferCanvas: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

    buildBasemaps();
    currentBase = basemapInstances.dark;
    currentBase.addTo(map);
    darkLabelsLayer.addTo(map);
    document.body.dataset.basemap = 'dark';

    addScaleBar();
    addCoordinateDisplay();
    addGeolocationButton();
    addFullscreenButton();
    addSearchControl();
    addMinimap();

    return map;
  }

  function setBasemap(key) {
    if (!basemapInstances[key]) return;
    if (currentBase) map.removeLayer(currentBase);
    if (map.hasLayer(darkLabelsLayer)) map.removeLayer(darkLabelsLayer);

    currentBase = basemapInstances[key];
    currentBaseKey = key;
    currentBase.addTo(map);
    currentBase.bringToBack();

    if (key === 'dark') darkLabelsLayer.addTo(map);
    document.body.dataset.basemap = key;
  }

  function fitToBounds(bounds, padding = [40, 40]) {
    if (!map) return;
    map.fitBounds(bounds, { padding, animate: true, duration: 0.6 });
  }

  function onClick(handler) { if (map) map.on('click', handler); }
  function onMoveEnd(handler) { if (map) map.on('moveend', handler); }
  function getMap() { return map; }

  return { init, setBasemap, fitToBounds, onClick, onMoveEnd, getMap };
})();
