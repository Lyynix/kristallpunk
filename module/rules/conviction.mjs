/**
 * Conviction stages (Innenleben, Kurzregeln 1.0, p. 10). Pure functions without Foundry dependencies.
 * Available as game.kristallpunk.rules.conviction.
 */

/** Official stages and their value ranges. */
export const CONVICTION_STAGES = {
  steadfast: { min: 3, max: 3 },
  confident: { min: 1, max: 2 },
  neutral: { min: 0, max: 0 },
  doubtful: { min: -2, max: -1 },
  desperate: { min: -3, max: -3 }
};

/**
 * Determine the conviction stage for a value.
 * @param {number} value                Conviction from -3 to +3.
 * @param {object} [options]
 * @param {object} [options.stages]     Value ranges, keyed by stage.
 * @returns {string|null}  The key of the stage, or null if the value lies outside all ranges.
 */
export function convictionStage(value, { stages = CONVICTION_STAGES } = {}) {
  const match = Object.entries(stages).find(([, { min, max }]) => (value >= min) && (value <= max));
  return match?.[0] ?? null;
}
