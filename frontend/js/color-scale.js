/**
 * color-scale.js
 * --------------
 * Maps a PWS score (0–100) to an RGB triple by interpolating between the
 * configured color stops. Also exposes helpers for CSS strings and rating
 * labels.
 */

window.ColorScale = (function () {
  'use strict';

  const STOPS = window.URBANPULSE_CONFIG.SCORE_STOPS;

  function lerp(a, b, t) { return a + (b - a) * t; }

  /**
   * @param {number} score - PWS in [0, 100]
   * @returns {[number, number, number]} RGB triple, components in [0, 255]
   */
  function colorFor(score) {
    if (score <= STOPS[0].t)              return STOPS[0].color;
    if (score >= STOPS[STOPS.length - 1].t) return STOPS[STOPS.length - 1].color;

    for (let i = 0; i < STOPS.length - 1; i++) {
      const a = STOPS[i], b = STOPS[i + 1];
      if (score >= a.t && score <= b.t) {
        const t = (score - a.t) / (b.t - a.t);
        return [
          Math.round(lerp(a.color[0], b.color[0], t)),
          Math.round(lerp(a.color[1], b.color[1], t)),
          Math.round(lerp(a.color[2], b.color[2], t)),
        ];
      }
    }
    return [128, 128, 128];
  }

  function rgbCss(rgb) { return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; }
  function rgbaCss(rgb, alpha) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  function ratingFor(score) {
    let last = STOPS[0];
    for (const s of STOPS) { if (score >= s.t) last = s; }
    return last.label;
  }

  return { colorFor, rgbCss, rgbaCss, ratingFor };
})();
