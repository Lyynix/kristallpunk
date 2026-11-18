/**
 * Helper functions that are used internally.
 * Not publicly available.
 */

/**
 * Clamp a value to a range.
 * @param {number} value
 * @param {{min: number, max: number}} limits
 * @returns {number}
 */
export function clamp(value, { min, max }) {
  return Math.min(max, Math.max(min, value));
}
