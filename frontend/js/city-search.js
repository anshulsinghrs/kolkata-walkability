/**
 * city-search.js
 * --------------
 * Global city / district / area search powered by the OpenStreetMap
 * Nominatim geocoder. No API key required.
 *
 * On selection, fires an event with:
 *   {
 *     name:        "Tokyo",
 *     display:     "Tokyo, Japan",
 *     center:      [lat, lon],
 *     bbox:        [[south, west], [north, east]],  // Leaflet LatLngBounds tuple
 *     osm_type:    "relation" | "way" | "node",
 *     osm_id:      number,
 *     raw:         <full Nominatim record>,
 *   }
 *
 * Downstream modules (map-view, future OSMnx-backed data loader) listen via
 * `CitySearch.onSelect(callback)` to react: re-fit the map, fetch OSM road
 * network, recompute walkability, etc.
 */

window.CitySearch = (function () {
  'use strict';

  const CFG = window.URBANPULSE_CONFIG.GEOCODER;

  const listeners = [];
  let currentPlace = null;

  /**
   * Issue a Nominatim search. Returns the array of records, normalised.
   * The caller is responsible for aborting via AbortController if needed.
   */
  async function search(query, { signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: String(CFG.LIMIT),
      addressdetails: '1',
      'accept-language': CFG.LANGUAGE,
    });
    const url = `${CFG.NOMINATIM_URL}?${params.toString()}`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    return res.json();
  }

  function recordToPlace(rec) {
    // Nominatim "boundingbox" is [south, north, west, east] as strings.
    const bb = (rec.boundingbox || []).map(parseFloat);
    const bbox = bb.length === 4
      ? [[bb[0], bb[2]], [bb[1], bb[3]]]
      : null;
    const lat = parseFloat(rec.lat);
    const lon = parseFloat(rec.lon);
    const primary = (rec.display_name || '').split(',')[0].trim();
    return {
      name: primary,
      display: rec.display_name,
      center: [lat, lon],
      bbox,
      osm_type: rec.osm_type,
      osm_id: rec.osm_id,
      raw: rec,
    };
  }

  function onSelect(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function getCurrent() { return currentPlace; }

  function emit(place) {
    currentPlace = place;
    for (const fn of listeners) {
      try { fn(place); } catch (e) { console.error('CitySearch listener failed', e); }
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /**
   * Wire up a search input + a results-list container in the DOM.
   *
   * @param {object} opts
   * @param {string} opts.inputId     id of the <input> element
   * @param {string} opts.resultsId   id of the <ul> dropdown
   * @param {function} [opts.onStatus] optional (msg, kind) status callback
   */
  function bindUI({ inputId, resultsId, onStatus }) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    if (!input || !results) return;

    let debounceTimer = null;
    let activeAbort = null;

    function closeResults() { results.hidden = true; }
    function openResults() { results.hidden = false; }

    function renderEmpty(msg) {
      results.innerHTML = `<li class="cs-empty">${escapeHtml(msg)}</li>`;
      openResults();
    }

    function renderList(records) {
      if (!records || records.length === 0) {
        renderEmpty('No matching place');
        return;
      }
      results.innerHTML = '';
      records.forEach((rec) => {
        const place = recordToPlace(rec);
        const li = document.createElement('li');
        li.className = 'cs-row';
        li.setAttribute('role', 'option');
        const parts = (place.display || '').split(',');
        const primary = parts.slice(0, 1).join(',').trim() || place.name;
        const secondary = parts.slice(1).join(',').trim();
        const typeBadge = rec.type ? `<span class="cs-badge">${escapeHtml(rec.type)}</span>` : '';
        li.innerHTML = `
          <div class="cs-row-main">
            <span class="cs-primary">${escapeHtml(primary)}</span>
            ${typeBadge}
          </div>
          <div class="cs-secondary">${escapeHtml(secondary)}</div>
        `;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = primary + (secondary ? `, ${secondary.split(',')[secondary.split(',').length - 1].trim()}` : '');
          closeResults();
          emit(place);
        });
        results.appendChild(li);
      });
      openResults();
    }

    async function runSearch(q) {
      if (activeAbort) activeAbort.abort();
      activeAbort = new AbortController();
      try {
        if (onStatus) onStatus(`Searching “${q}”…`);
        const recs = await search(q, { signal: activeAbort.signal });
        renderList(recs);
        if (onStatus) onStatus(recs.length ? `${recs.length} matches` : 'No matches', recs.length ? 'ok' : 'err');
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('CitySearch error', err);
        if (onStatus) onStatus(`Search failed: ${err.message || err}`, 'err');
        renderEmpty('Search failed — check your connection');
      }
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < 2) { closeResults(); return; }
      debounceTimer = setTimeout(() => runSearch(q), CFG.DEBOUNCE_MS);
    });

    input.addEventListener('focus', () => {
      if (results.children.length > 0 && input.value.trim().length >= 2) openResults();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeResults(); input.blur(); }
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q.length >= 2) {
          clearTimeout(debounceTimer);
          runSearch(q);
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#city-search')) closeResults();
    });
  }

  return { search, bindUI, onSelect, getCurrent };
})();
