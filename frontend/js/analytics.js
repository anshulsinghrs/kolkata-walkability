/**
 * analytics.js
 * ------------
 * Chart.js powered analytics dashboard. Renders four canvases:
 *   chart-dist        — score distribution histogram (10 bins)
 *   chart-bands       — qualitative bands doughnut
 *   chart-extremes    — mean of top-decile vs bottom-decile (bar)
 *   chart-indicators  — mean of each indicator column (radar)
 *
 * Public API:
 *   Analytics.update(rows)   // rows: array of {weightage, sidewalk?, greenery?, ...}
 *   Analytics.clear()
 */
window.Analytics = (function () {
  'use strict';

  const charts = {};
  const FONT = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

  const tokens = () => {
    const s = getComputedStyle(document.documentElement);
    return {
      text:     s.getPropertyValue('--text').trim()       || '#F8FAFC',
      dim:      s.getPropertyValue('--text-dim').trim()   || '#94A3B8',
      muted:    s.getPropertyValue('--text-muted').trim() || '#64748B',
      border:   s.getPropertyValue('--border').trim()     || 'rgba(148,163,184,0.14)',
      accent:   s.getPropertyValue('--accent').trim()     || '#38BDF8',
      primary:  s.getPropertyValue('--primary').trim()    || '#2563EB',
      secondary: s.getPropertyValue('--secondary').trim() || '#10B981',
      c1: s.getPropertyValue('--c1').trim() || '#DC2626',
      c3: s.getPropertyValue('--c3').trim() || '#F97316',
      c5: s.getPropertyValue('--c5').trim() || '#84CC16',
      c7: s.getPropertyValue('--c7').trim() || '#059669',
    };
  };

  function commonOpts(t, opts = {}) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: t.dim, font: { family: FONT, size: 11 } } },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          borderColor: t.border,
          borderWidth: 1,
          titleFont: { family: FONT, size: 12, weight: 600 },
          bodyFont:  { family: FONT, size: 11 },
          padding: 10,
          cornerRadius: 6,
          titleColor: t.text,
          bodyColor: t.dim,
        },
      },
    }, opts);
  }

  function axisOpts(t) {
    return {
      grid:  { color: t.border, drawBorder: false },
      ticks: { color: t.muted, font: { family: FONT, size: 10 } },
    };
  }

  function ensureChart(id, cfg) {
    if (charts[id]) {
      charts[id].data = cfg.data;
      charts[id].options = cfg.options;
      charts[id].update('none');
      return charts[id];
    }
    const el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return null;
    charts[id] = new Chart(el.getContext('2d'), cfg);
    return charts[id];
  }

  function buildHistogram(scores) {
    const bins = 10;
    const counts = new Array(bins).fill(0);
    for (let i = 0; i < scores.length; i++) {
      let b = Math.floor(scores[i] / 10);
      if (b < 0) b = 0;
      if (b > bins - 1) b = bins - 1;
      counts[b] += 1;
    }
    const labels = [];
    for (let b = 0; b < bins; b++) labels.push(`${b * 10}–${b * 10 + 10}`);
    return { labels, counts };
  }

  function buildBands(scores) {
    const buckets = { poor: 0, fair: 0, good: 0, excellent: 0 };
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      if      (s < 25) buckets.poor++;
      else if (s < 50) buckets.fair++;
      else if (s < 75) buckets.good++;
      else             buckets.excellent++;
    }
    return buckets;
  }

  function decile(scores, frac) {
    if (!scores.length) return 0;
    const sorted = scores.slice().sort((a, b) => a - b);
    const n = Math.max(1, Math.floor(sorted.length * frac));
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sorted[i];
    return sum / n;
  }

  function topDecile(scores) {
    if (!scores.length) return 0;
    const sorted = scores.slice().sort((a, b) => b - a);
    const n = Math.max(1, Math.floor(sorted.length * 0.1));
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sorted[i];
    return sum / n;
  }

  function indicatorAverages(rows) {
    const keys = ['sidewalk', 'greenery', 'lighting', 'crowdedness', 'crossing_safety'];
    const sums = {}; const counts = {};
    keys.forEach((k) => { sums[k] = 0; counts[k] = 0; });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      for (const k of keys) {
        if (typeof r[k] === 'number' && Number.isFinite(r[k])) {
          let v = r[k];
          if (v <= 1.01) v *= 100;
          sums[k] += v; counts[k] += 1;
        }
      }
    }
    const out = {};
    let any = false;
    keys.forEach((k) => {
      if (counts[k] > 0) { out[k] = sums[k] / counts[k]; any = true; }
    });
    return any ? out : null;
  }

  function update(rows) {
    if (!rows || rows.length === 0) {
      clear();
      return;
    }
    const t = tokens();
    const scores = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const s = (typeof r === 'object' && r !== null)
        ? (r.weightage != null ? r.weightage : r[2])
        : 0;
      if (Number.isFinite(s)) scores.push(s);
    }
    if (!scores.length) { clear(); return; }

    // ---- Histogram --------------------------------------------------
    const hist = buildHistogram(scores);
    ensureChart('chart-dist', {
      type: 'bar',
      data: {
        labels: hist.labels,
        datasets: [{
          label: 'Points',
          data: hist.counts,
          backgroundColor: hist.counts.map((_, i) => {
            const c = i < 2 ? t.c1 : i < 4 ? t.c3 : i < 7 ? t.c5 : t.c7;
            return c + 'cc';
          }),
          borderColor: t.border,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: commonOpts(t, {
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          titleColor: t.text, bodyColor: t.dim,
          borderColor: t.border, borderWidth: 1,
          padding: 10, cornerRadius: 6,
          callbacks: { title: (items) => `Score ${items[0].label}` },
        }},
        scales: { x: axisOpts(t), y: axisOpts(t) },
      }),
    });

    // ---- Bands doughnut --------------------------------------------
    const bands = buildBands(scores);
    ensureChart('chart-bands', {
      type: 'doughnut',
      data: {
        labels: ['Poor (0–25)', 'Fair (25–50)', 'Good (50–75)', 'Excellent (75–100)'],
        datasets: [{
          data: [bands.poor, bands.fair, bands.good, bands.excellent],
          backgroundColor: [t.c1, t.c3, t.c5, t.c7],
          borderColor: 'rgba(15,23,42,0.95)',
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: commonOpts(t, {
        cutout: '60%',
        plugins: {
          legend: { position: 'right', labels: { color: t.dim, font: { family: FONT, size: 10.5 }, boxWidth: 10, padding: 6 } },
        },
      }),
    });

    // ---- Extremes bar ----------------------------------------------
    const bot = decile(scores, 0.1);
    const top = topDecile(scores);
    ensureChart('chart-extremes', {
      type: 'bar',
      data: {
        labels: ['Bottom Decile', 'Mean', 'Top Decile'],
        datasets: [{
          label: 'PWS',
          data: [bot, scores.reduce((a, b) => a + b, 0) / scores.length, top],
          backgroundColor: [t.c1 + 'cc', t.accent + 'cc', t.c7 + 'cc'],
          borderRadius: 6,
          borderWidth: 0,
        }],
      },
      options: commonOpts(t, {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: Object.assign({}, axisOpts(t), { min: 0, max: 100 }), y: axisOpts(t) },
      }),
    });

    // ---- Indicators radar ------------------------------------------
    const inds = indicatorAverages(rows);
    const indWrap = document.getElementById('chart-indicators');
    if (indWrap) indWrap.parentElement.style.opacity = inds ? '1' : '0.5';
    if (inds) {
      ensureChart('chart-indicators', {
        type: 'radar',
        data: {
          labels: Object.keys(inds).map((k) => k.replace('_', ' ')),
          datasets: [{
            label: 'Mean (0–100)',
            data: Object.values(inds),
            backgroundColor: t.accent + '33',
            borderColor: t.accent,
            borderWidth: 2,
            pointBackgroundColor: t.accent,
            pointBorderColor: '#fff',
            pointRadius: 3.5,
          }],
        },
        options: commonOpts(t, {
          scales: {
            r: {
              suggestedMin: 0, suggestedMax: 100,
              angleLines: { color: t.border },
              grid: { color: t.border },
              pointLabels: { color: t.dim, font: { family: FONT, size: 10.5 } },
              ticks: { color: t.muted, backdropColor: 'transparent', font: { size: 9 } },
            },
          },
        }),
      });
    } else if (charts['chart-indicators']) {
      charts['chart-indicators'].destroy();
      delete charts['chart-indicators'];
    }
  }

  function clear() {
    for (const k of Object.keys(charts)) {
      charts[k].destroy();
      delete charts[k];
    }
  }

  return { update, clear };
})();
