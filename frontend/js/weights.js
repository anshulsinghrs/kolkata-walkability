/**
 * weights.js
 * ----------
 * Owns the user-tunable indicator weights. When uploaded rows carry
 * per-indicator columns (sidewalk, greenery, lighting, crowdedness,
 * crossing_safety), the live `recompute(rows)` returns new rows with the
 * `weightage` column replaced by the weighted sum (each indicator
 * normalised to 0-100, weights normalised to sum to 1).
 *
 * Rows lacking the indicator columns are returned unchanged so the base
 * PWS dataset is never silently corrupted.
 */

window.Weights = (function () {
  'use strict';

  const DEFAULTS = window.URBANPULSE_CONFIG.DEFAULT_WEIGHTS;
  const KEYS = Object.keys(DEFAULTS);

  let raw = Object.assign({}, DEFAULTS);

  function normalize() {
    const sum = KEYS.reduce((a, k) => a + (raw[k] || 0), 0);
    if (sum === 0) return KEYS.reduce((o, k) => (o[k] = 1 / KEYS.length, o), {});
    return KEYS.reduce((o, k) => (o[k] = (raw[k] || 0) / sum, o), {});
  }

  function set(key, value) {
    if (!(key in raw)) return;
    raw[key] = Math.max(0, Math.min(100, Number(value) || 0));
  }

  function reset() {
    raw = Object.assign({}, DEFAULTS);
  }

  function getRaw() { return Object.assign({}, raw); }
  function getNormalized() { return normalize(); }

  /**
   * Clamp 0-100. If the source column looks 0..1, scale it.
   */
  function clamp100(v) {
    if (v == null) return null;
    if (v >= 0 && v <= 1.01) return v * 100;
    return Math.max(0, Math.min(100, v));
  }

  function rowHasIndicators(r) {
    let count = 0;
    for (const k of KEYS) if (r[k] != null) count++;
    return count >= 2; // need at least two to be meaningful
  }

  /**
   * Apply weights to compute a fresh `weightage` for each row that has the
   * required indicator columns. Returns a new array (rows referenced
   * shallow-copied where modified).
   */
  function recompute(rows) {
    const w = normalize();
    const out = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!rowHasIndicators(r)) { out[i] = r; continue; }
      let total = 0, weightSum = 0;
      for (const k of KEYS) {
        const v = clamp100(r[k]);
        if (v == null) continue;
        total += v * w[k];
        weightSum += w[k];
      }
      const newWeight = weightSum > 0 ? total / weightSum : r.weightage;
      out[i] = Object.assign({}, r, { weightage: newWeight, _recomputed: true });
    }
    return out;
  }

  return { set, reset, getRaw, getNormalized, recompute, KEYS };
})();
