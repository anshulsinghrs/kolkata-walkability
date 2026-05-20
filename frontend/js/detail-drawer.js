/**
 * detail-drawer.js
 * ----------------
 * Slide-in panel that shows full analytics for a single point.
 * Decoupled from both the research PWS layer and the upload layer.
 */

window.DetailDrawer = (function () {
  'use strict';

  const drawer = document.getElementById('detail-drawer');
  const titleEl = document.getElementById('dd-title');
  const scoreEl = document.getElementById('dd-score');
  const ratingEl = document.getElementById('dd-rating');
  const bodyEl = document.getElementById('dd-body');
  const imgEl = document.getElementById('dd-image');
  const closeBtn = document.getElementById('dd-close');

  closeBtn.addEventListener('click', close);

  function escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function row(k, v) {
    if (v == null || v === '') return '';
    return `<div class="dd-row"><span class="k">${escape(k)}</span><span class="v">${escape(v)}</span></div>`;
  }

  function close() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function open(point) {
    const lat = point.latitude;
    const lon = point.longitude;
    const score = point.weightage;
    const c = window.ColorScale.colorFor(score);
    const css = `rgb(${c[0]},${c[1]},${c[2]})`;
    const rating = window.ColorScale.ratingFor(score);

    titleEl.textContent = point.category ? point.category
                       : point.hazard_type ? point.hazard_type
                       : `#${point.id != null ? point.id : '—'}`;

    scoreEl.style.color = css;
    scoreEl.innerHTML = `${score.toFixed(1)}<span class="denom"> / 100</span>`;
    ratingEl.style.color = css;
    ratingEl.textContent = rating;

    let html = '';
    html += row('Latitude', lat.toFixed(5) + '°');
    html += row('Longitude', lon.toFixed(5) + '°');
    if (point.hazard_type) html += row('Hazard', point.hazard_type);
    if (point.category)    html += row('Category', point.category);
    if (point.timestamp)   html += row('Timestamp', point.timestamp);

    // Indicator breakdown (if present)
    const indicators = ['sidewalk', 'greenery', 'lighting', 'crowdedness', 'crossing_safety'];
    const present = indicators.filter(k => point[k] != null);
    if (present.length) {
      html += '<div class="dd-indicators">';
      for (const k of present) {
        const v = point[k];
        const norm = v <= 1.01 ? v * 100 : v;
        html += `
          <div class="ind-row">
            <span class="ind-name">${k.replace('_', ' ')}</span>
            <div class="ind-bar"><div class="ind-fill" style="width:${Math.max(0, Math.min(100, norm))}%"></div></div>
            <span class="ind-val">${norm.toFixed(0)}</span>
          </div>`;
      }
      html += '</div>';
    }

    if (point.notes) html += `<div class="dd-notes">${escape(point.notes)}</div>`;

    bodyEl.innerHTML = html;

    if (point.image_url && /^https?:\/\//i.test(point.image_url)) {
      imgEl.src = point.image_url;
      imgEl.hidden = false;
      imgEl.onerror = () => { imgEl.hidden = true; };
    } else {
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
    }

    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  return { open, close };
})();
