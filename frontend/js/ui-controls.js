/**
 * ui-controls.js
 * --------------
 * Wires up the multi-tab sidebar.
 */

window.UIControls = (function () {
  'use strict';

  const CFG = window.IAMSM_CONFIG;

  // -------------------------------------------------------------------
  // Status pill
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // Tabs + collapse
  // -------------------------------------------------------------------
  function initTabs() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tab;
        document.querySelectorAll('.tab').forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        document.querySelectorAll('.tab-pane').forEach((p) => {
          p.classList.toggle('active', p.dataset.pane === id);
        });
      });
    });

    const collapseBtn = document.getElementById('panel-collapse');
    const panel = document.getElementById('side-panel');
    collapseBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      collapseBtn.textContent = panel.classList.contains('collapsed') ? '›' : '‹';
    });

    const mobileToggle = document.getElementById('mobile-panel-toggle');
    if (mobileToggle) {
      mobileToggle.addEventListener('click', () => {
        const isOpen = panel.classList.toggle('mobile-open');
        panel.classList.remove('collapsed');
        mobileToggle.classList.toggle('active', isOpen);
      });
    }
  }

  // -------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------
  const statCount = document.getElementById('stat-count');
  const statMean = document.getElementById('stat-mean');
  const statMedian = document.getElementById('stat-median');
  const statVisible = document.getElementById('stat-visible');

  function fmtCount(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + '<span class="unit">k</span>';
    return n.toString();
  }
  function fmtScore(n) { return `${n.toFixed(1)}<span class="unit">/100</span>`; }

  function setStatsFromManifest(manifest) {
    const s = manifest.score_stats;
    statCount.innerHTML  = fmtCount(s.count);
    statMean.innerHTML   = fmtScore(s.mean);
    statMedian.innerHTML = fmtScore(s.median);
  }
  function setStatsFromUpload(stats) {
    statCount.innerHTML  = fmtCount(stats.kept);
    statMean.innerHTML   = fmtScore(stats.weightMean);
    statMedian.innerHTML = `${stats.weightMin.toFixed(0)}–${stats.weightMax.toFixed(0)}<span class="unit">range</span>`;
  }
  function setVisibleCount(n) { statVisible.innerHTML = fmtCount(n); }

  // -------------------------------------------------------------------
  // Dual-handle range slider
  // -------------------------------------------------------------------
  const rMin = document.getElementById('range-min');
  const rMax = document.getElementById('range-max');
  const rDisp = document.getElementById('range-display');
  const maskLo = document.getElementById('mask-lo');
  const maskHi = document.getElementById('mask-hi');

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

  // -------------------------------------------------------------------
  // Basemap cards
  // -------------------------------------------------------------------
  function onBasemapChange(handler) {
    document.querySelectorAll('.basemap-card').forEach((card) => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.basemap-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        handler(card.dataset.base);
      });
    });
  }

  function onPWSToggle(handler) {
    const chk = document.getElementById('chk-pws');
    chk.addEventListener('change', () => handler(chk.checked));
  }

  function onVizModeChange(handler) {
    document.querySelectorAll('input[name="viz"]').forEach((r) => {
      r.addEventListener('change', () => { if (r.checked) handler(r.value); });
    });
  }

  // -------------------------------------------------------------------
  // Gradient picker + preview
  // -------------------------------------------------------------------
  function paintGradientPreview(name) {
    const stops = CFG.GRADIENT_PRESETS[name] || CFG.GRADIENT_PRESETS.walkability;
    const css = `linear-gradient(to right, ${stops.map((s) => `rgb(${s.color[0]},${s.color[1]},${s.color[2]}) ${s.t}%`).join(', ')})`;
    document.getElementById('gradient-preview').style.background = css;
    const legend = document.getElementById('legend-bar');
    if (legend) legend.style.background = css;
  }
  function onGradientChange(handler) {
    const sel = document.getElementById('gradient-select');
    paintGradientPreview(sel.value);
    sel.addEventListener('change', () => {
      paintGradientPreview(sel.value);
      handler(sel.value);
    });
  }

  // -------------------------------------------------------------------
  // Style sliders
  // -------------------------------------------------------------------
  function onStyleChange(handler) {
    const radius = document.getElementById('size-slider');
    const opacity = document.getElementById('opacity-slider');
    const rD = document.getElementById('radius-display');
    const oD = document.getElementById('opacity-display');
    function fire() {
      const r = parseInt(radius.value, 10);
      const o = parseInt(opacity.value, 10);
      rD.textContent = `${r} px`;
      oD.textContent = `${o}%`;
      handler({ radius: r, opacity: o / 100 });
    }
    radius.addEventListener('input', fire);
    opacity.addEventListener('input', fire);
  }

  // -------------------------------------------------------------------
  // Weights
  // -------------------------------------------------------------------
  function onWeightsChange(onLive, onApply, onReset) {
    document.querySelectorAll('.w-slider').forEach((s) => {
      s.addEventListener('input', () => {
        const key = s.dataset.w;
        const v = parseInt(s.value, 10);
        const lbl = document.querySelector(`[data-wv="${key}"]`);
        if (lbl) lbl.textContent = v;
        window.Weights.set(key, v);
        if (onLive) onLive(window.Weights.getRaw());
      });
    });
    document.getElementById('btn-apply-weights').addEventListener('click', () => onApply && onApply());
    document.getElementById('btn-reset-weights').addEventListener('click', () => {
      window.Weights.reset();
      const raw = window.Weights.getRaw();
      for (const k of Object.keys(raw)) {
        const s = document.querySelector(`.w-slider[data-w="${k}"]`);
        const lbl = document.querySelector(`[data-wv="${k}"]`);
        if (s) s.value = raw[k];
        if (lbl) lbl.textContent = raw[k];
      }
      if (onReset) onReset();
    });
  }

  // -------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------
  function onUpload(handler) {
    const dz = document.getElementById('dropzone');
    const input = document.getElementById('file-input');

    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) handler(input.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((ev) => {
      dz.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        dz.classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      dz.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        dz.classList.remove('drag');
      });
    });
    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handler(f);
    });
  }

  function showUploadProgress(pct, msg) {
    const wrap = document.getElementById('upload-status');
    wrap.hidden = false;
    document.getElementById('us-bar-fill').style.width = `${Math.round(pct * 100)}%`;
    document.getElementById('us-msg').textContent = msg || `${Math.round(pct * 100)}%`;
  }
  function hideUploadProgress() {
    document.getElementById('upload-status').hidden = true;
  }

  function showDetectedColumns(headers, mapping, stats) {
    const wrap = document.getElementById('detected');
    const list = document.getElementById('detected-list');
    wrap.hidden = false;
    list.innerHTML = '';
    const roles = ['latitude', 'longitude', 'weightage', 'category',
                   'timestamp', 'notes', 'image_url', 'hazard_type',
                   'sidewalk', 'greenery', 'lighting', 'crowdedness', 'crossing_safety'];
    for (const role of roles) {
      const col = mapping[role];
      if (!col && !['latitude', 'longitude', 'weightage'].includes(role)) continue;
      const li = document.createElement('li');
      li.className = col ? 'col-ok' : 'col-missing';
      li.innerHTML = `<span class="role">${role}</span><span class="col">${col || 'not found'}</span>`;
      list.appendChild(li);
    }
    if (stats) {
      const li = document.createElement('li');
      li.className = 'col-stats';
      li.innerHTML = `<span class="role">rows</span><span class="col">${stats.kept.toLocaleString()} / ${stats.total.toLocaleString()} valid</span>`;
      list.appendChild(li);
    }
  }
  function hideDetectedColumns() {
    document.getElementById('detected').hidden = true;
    document.getElementById('detected-list').innerHTML = '';
  }

  function onMapData(handler) {
    document.getElementById('btn-map-data').addEventListener('click', handler);
  }
  function onClearUpload(handler) {
    document.getElementById('btn-clear-upload').addEventListener('click', handler);
  }

  function onExport(handler) {
    document.querySelectorAll('[data-export]').forEach((btn) => {
      btn.addEventListener('click', () => handler(btn.dataset.export));
    });
  }

  function setLegendTitle(text) {
    const el = document.getElementById('legend-title');
    if (el) el.textContent = text;
  }

  // -------------------------------------------------------------------
  // 3D / VR controls
  // -------------------------------------------------------------------
  function on3DEnter(handler) {
    document.getElementById('btn-enter-3d').addEventListener('click', handler);
  }
  function on3DExit(handler) {
    const btnSidebar = document.getElementById('btn-exit-3d');
    const btnOverlay = document.getElementById('btn-exit-3d-overlay');
    btnSidebar.addEventListener('click', handler);
    btnOverlay.addEventListener('click', handler);
  }
  function show3DExitButton() {
    document.getElementById('btn-exit-3d').hidden = false;
    document.getElementById('btn-enter-3d').hidden = true;
  }
  function hide3DExitButton() {
    document.getElementById('btn-exit-3d').hidden = true;
    document.getElementById('btn-enter-3d').hidden = false;
  }
  function onVREnter(handler) {
    document.getElementById('btn-enter-vr').addEventListener('click', handler);
  }
  function setVRStatus(supported) {
    const btn = document.getElementById('btn-enter-vr');
    const text = document.getElementById('vr-status-text');
    if (supported) {
      btn.disabled = false;
      text.textContent = 'Enter Virtual Reality';
    } else {
      btn.disabled = true;
      text.textContent = 'VR Not Available';
    }
  }
  function on3DSettings(handler) {
    const heightSlider = document.getElementById('height-slider');
    const fovSlider = document.getElementById('fov-slider');
    const fogSlider = document.getElementById('fog-slider');
    const heightDisp = document.getElementById('height-display');
    const fovDisp = document.getElementById('fov-display');
    const fogDisp = document.getElementById('fog-display');
    heightSlider.addEventListener('input', () => {
      const v = parseInt(heightSlider.value, 10);
      heightDisp.textContent = (v / 10).toFixed(1) + 'x';
      handler({ height: v, fov: parseInt(fovSlider.value, 10), fog: parseInt(fogSlider.value, 10) });
    });
    fovSlider.addEventListener('input', () => {
      const v = parseInt(fovSlider.value, 10);
      fovDisp.textContent = v + '°';
      handler({ height: parseInt(heightSlider.value, 10), fov: v, fog: parseInt(fogSlider.value, 10) });
    });
    fogSlider.addEventListener('input', () => {
      const v = parseInt(fogSlider.value, 10);
      fogDisp.textContent = v + '%';
      handler({ height: parseInt(heightSlider.value, 10), fov: parseInt(fovSlider.value, 10), fog: v });
    });
  }

  return {
    setStatus,
    initTabs,
    setStatsFromManifest,
    setStatsFromUpload,
    setVisibleCount,
    onFilterChange,
    onBasemapChange,
    onPWSToggle,
    onVizModeChange,
    onGradientChange,
    onStyleChange,
    onWeightsChange,
    onUpload,
    showUploadProgress,
    hideUploadProgress,
    showDetectedColumns,
    hideDetectedColumns,
    onMapData,
    onClearUpload,
    onExport,
    setLegendTitle,
    on3DEnter,
    on3DExit,
    show3DExitButton,
    hide3DExitButton,
    onVREnter,
    setVRStatus,
    on3DSettings,
  };
})();
