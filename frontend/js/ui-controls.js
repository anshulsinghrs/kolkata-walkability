/**
 * ui-controls.js
 * --------------
 * Wires up the side-panel UI: dual-handle slider, basemap toggles, the
 * status pill, and the live stats. All DOM access is contained here so the
 * rest of the app can stay headless.
 */

window.UIControls = (function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Status pill
  // -------------------------------------------------------------------------
  const diagEl = document.getElementById('diag');
  const diagText = document.getElementById('diag-text');

  function setStatus(text, kind) {
    diagText.textContent = text;
    diagEl.classList.remove('ok', 'err', 'fade');
    if (kind === 'ok') {
      diagEl.classList.add('ok');
      setTimeout(() => diagEl.classList.add('fade'), 2500);
    } else if (kind === 'err') {
      diagEl.classList.add('err');
    }
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------
  const statCount = document.getElementById('stat-count');
  const statMean = document.getElementById('stat-mean');
  const statMedian = document.getElementById('stat-median');
  const statVisible = document.getElementById('stat-visible');

  function fmtCount(n) {
    if (n >= 1000) {
      return (n / 1000).toFixed(n >= 10000 ? 0 : 1) +
             '<span class="unit">k</span>';
    }
    return n.toString();
  }

  function fmtScore(n) {
    return `${n.toFixed(1)}<span class="unit">/100</span>`;
  }

  function setStatsFromManifest(manifest) {
    const s = manifest.score_stats;
    statCount.innerHTML  = fmtCount(s.count);
    statMean.innerHTML   = fmtScore(s.mean);
    statMedian.innerHTML = fmtScore(s.median);
  }

  function setVisibleCount(n) {
    statVisible.innerHTML = fmtCount(n);
  }

  // -------------------------------------------------------------------------
  // Dual-handle range slider
  // -------------------------------------------------------------------------
  const rMin = document.getElementById('range-min');
  const rMax = document.getElementById('range-max');
  const rDisp = document.getElementById('range-display');
  const maskLo = document.getElementById('mask-lo');
  const maskHi = document.getElementById('mask-hi');

  /**
   * Register a callback fired (debounced) whenever the user drags either
   * handle. Receives `{min, max}` as arguments.
   */
  function onFilterChange(handler) {
    let timer = null;
    function fire() {
      let lo = parseInt(rMin.value, 10);
      let hi = parseInt(rMax.value, 10);
      if (lo > hi - 1) {
        if (document.activeElement === rMin) lo = hi - 1;
        else hi = lo + 1;
        rMin.value = lo; rMax.value = hi;
      }
      rDisp.textContent = `${lo} — ${hi}`;
      maskLo.style.width = `${lo}%`;
      maskHi.style.width = `${100 - hi}%`;

      clearTimeout(timer);
      timer = setTimeout(() => handler({ min: lo, max: hi }), 80);
    }
    rMin.addEventListener('input', fire);
    rMax.addEventListener('input', fire);
  }

  // -------------------------------------------------------------------------
  // Basemap toggles
  // -------------------------------------------------------------------------
  function onBasemapChange(handler) {
    document.querySelectorAll('.toggle-btn[data-base]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn[data-base]')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        handler(btn.dataset.base);
      });
    });
  }

  return {
    setStatus,
    setStatsFromManifest,
    setVisibleCount,
    onFilterChange,
    onBasemapChange,
  };
})();
